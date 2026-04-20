"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { CertificadoConformidadPrint } from "@/components/certificado-conformidad-print";
import { createClient } from "@/lib/supabase/client";
import { nombreArchivoCertificadoConformidadPdf } from "@/lib/nombre-archivo-pdf";
import {
  formatNumeroComercialHumano,
  prefijoPlantillaComercial,
  resolveNumeroComercial,
} from "@/lib/presupuesto-numero-comercial";

const labelCls =
  "mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted";
const inputCls =
  "w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg placeholder:text-ravn-muted focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg";
const sectionCls =
  "rounded-none border border-ravn-line bg-ravn-surface p-6 md:p-8";

const SERVICIO_DEFAULT = "Servicios de Gestión / Obra";
const ESTADO_DEFAULT = "Finalizado / 1";

const TERMS_BLOCK = `La firma del presente documento implica la recepción conforme de los servicios o etapas de obra detalladas. Este certificado habilita el proceso de pago administrativo según las condiciones acordadas previamente. Cualquier observación deberá ser notificada dentro de las 48hs de la firma.`;

type DraftV1 = {
  v: 1;
  numeroBase: string;
  numeroSufijo: string;
  fechaIso: string;
  clienteBarrio: string;
  cuit: string;
  ubicacionLote: string;
  referenciaPresupuesto: string;
  servicioRubro: string;
  detalleTrabajos: string;
  estadoCantidad: string;
};

/** Borradores viejos guardaban `referenciaFactura`; el remito referencia presupuesto. */
function referenciaPresupuestoDesdeBorrador(
  parsed: Record<string, unknown>,
  numeroPresupuestoHumano: string
): string {
  const rp = parsed.referenciaPresupuesto;
  if (typeof rp === "string" && rp.trim()) return rp.trim();
  const legacy = parsed.referenciaFactura;
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  return numeroPresupuestoHumano;
}

/** Texto de «Servicios presupuestados» (`propuesta_texto_servicios`); el borrador puede sobrescribirlo. */
function detalleTrabajosDesdeBorrador(
  parsed: Record<string, unknown>,
  serviciosPresupuestados: string
): string {
  const d = parsed.detalleTrabajos;
  if (typeof d === "string" && d.trim()) return d.trim();
  return serviciosPresupuestados;
}

function storageKey(presupuestoId: string): string {
  return `ravn-remito-certificado-${presupuestoId}`;
}

function validarCampos(d: {
  numeroBase: string;
  fechaIso: string;
  clienteBarrio: string;
  cuit: string;
  ubicacionLote: string;
  referenciaPresupuesto: string;
  servicioRubro: string;
  detalleTrabajos: string;
  estadoCantidad: string;
}): string | null {
  if (!d.numeroBase.trim()) return "El número del certificado es obligatorio.";
  if (!d.fechaIso || d.fechaIso.length < 10) return "Indicá la fecha.";
  if (!d.clienteBarrio.trim()) return "Cliente / barrio es obligatorio.";
  if (!d.cuit.trim()) return "CUIT es obligatorio.";
  if (!d.ubicacionLote.trim()) return "Ubicación / lote es obligatorio.";
  if (!d.referenciaPresupuesto.trim())
    return "Referencia presupuesto es obligatoria.";
  if (!d.servicioRubro.trim())
    return "La línea de servicio / rubro es obligatoria.";
  if (!d.detalleTrabajos.trim())
    return "El detalle de trabajos realizados es obligatorio.";
  if (!d.estadoCantidad.trim()) return "Estado / cantidad es obligatorio.";
  return null;
}

export function RemitoScreen({ presupuestoId }: { presupuestoId: string }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aprobado, setAprobado] = useState(false);
  const [numeroPresupuestoLabel, setNumeroPresupuestoLabel] = useState("—");

  const [numeroBase, setNumeroBase] = useState("0001");
  const [numeroSufijo, setNumeroSufijo] = useState("");
  const [fechaIso, setFechaIso] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [clienteBarrio, setClienteBarrio] = useState("");
  const [cuit, setCuit] = useState("");
  const [ubicacionLote, setUbicacionLote] = useState("");
  const [referenciaPresupuesto, setReferenciaPresupuesto] = useState("");
  const [servicioRubro, setServicioRubro] = useState(SERVICIO_DEFAULT);
  const [detalleTrabajos, setDetalleTrabajos] = useState("");
  const [estadoCantidad, setEstadoCantidad] = useState(ESTADO_DEFAULT);

  const [draftLoaded, setDraftLoaded] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const printPageStyle = useMemo(
    () => `
    @page { size: A4; margin: 0; }
    @media print {
      html, body {
        background: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `,
    []
  );

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: () =>
      nombreArchivoCertificadoConformidadPdf(
        `${numeroBase.trim()}${numeroSufijo.trim() ? `-${numeroSufijo.trim()}` : ""}`,
        clienteBarrio.trim() || "obra"
      ),
    pageStyle: printPageStyle,
    onBeforePrint: async () => {
      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
    },
    onAfterPrint: () => {
      setPrinting(false);
    },
    onPrintError: (_loc, err) => {
      setPrintError(err.message || "Error al generar el PDF.");
      setPrinting(false);
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const [presRes, correlativo] = await Promise.all([
        supabase
          .from("presupuestos")
          .select(
            "nombre_cliente, nombre_obra, domicilio, fecha, presupuesto_aprobado, propuesta_texto_servicios"
          )
          .eq("id", presupuestoId)
          .single(),
        resolveNumeroComercial(supabase, presupuestoId),
      ]);

      const { data: pres, error: errP } = presRes;
      if (errP || !pres) {
        setError(errP?.message ?? "Presupuesto no encontrado.");
        setAprobado(false);
        setLoading(false);
        return;
      }

      const aprob = Boolean(
        (pres as { presupuesto_aprobado?: boolean }).presupuesto_aprobado
      );
      setAprobado(aprob);
      const numeroHumano = formatNumeroComercialHumano(
        prefijoPlantillaComercial("negro"),
        correlativo
      );
      setNumeroPresupuestoLabel(numeroHumano);

      if (!aprob) {
        setDraftLoaded(false);
        return;
      }

      const nombreObra = String(
        (pres as { nombre_obra?: string | null }).nombre_obra ?? ""
      ).trim();
      const nombreCliente = String(
        (pres as { nombre_cliente?: string | null }).nombre_cliente ?? ""
      ).trim();
      const dom = String(
        (pres as { domicilio?: string | null }).domicilio ?? ""
      ).trim();
      const f = pres.fecha;
      const fechaPres =
        typeof f === "string"
          ? f.slice(0, 10)
          : f instanceof Date
            ? f.toISOString().slice(0, 10)
            : String(f ?? "").slice(0, 10);

      const serviciosPresupuestados = String(
        (pres as { propuesta_texto_servicios?: string | null })
          .propuesta_texto_servicios ?? ""
      ).trim();

      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(storageKey(presupuestoId));
          if (raw) {
            const parsed = JSON.parse(raw) as DraftV1 & Record<string, unknown>;
            if (parsed && parsed.v === 1) {
              setNumeroBase(parsed.numeroBase ?? "0001");
              setNumeroSufijo(parsed.numeroSufijo ?? "");
              setFechaIso(
                parsed.fechaIso ??
                  (fechaPres || new Date().toISOString().slice(0, 10))
              );
              setClienteBarrio(parsed.clienteBarrio ?? "");
              setCuit(parsed.cuit ?? "");
              setUbicacionLote(parsed.ubicacionLote ?? "");
              setReferenciaPresupuesto(
                referenciaPresupuestoDesdeBorrador(parsed, numeroHumano)
              );
              setServicioRubro(parsed.servicioRubro ?? SERVICIO_DEFAULT);
              setDetalleTrabajos(
                detalleTrabajosDesdeBorrador(parsed, serviciosPresupuestados)
              );
              setEstadoCantidad(parsed.estadoCantidad ?? ESTADO_DEFAULT);
              setDraftLoaded(true);
              setLoading(false);
              return;
            }
          }
        } catch {
          /* ignore */
        }
      }

      setNumeroBase("0001");
      setNumeroSufijo("");
      setFechaIso(fechaPres || new Date().toISOString().slice(0, 10));
      setClienteBarrio(nombreObra || nombreCliente);
      setCuit("");
      setUbicacionLote(dom);
      setReferenciaPresupuesto(numeroHumano);
      setServicioRubro(SERVICIO_DEFAULT);
      setDetalleTrabajos(serviciosPresupuestados);
      setEstadoCantidad(ESTADO_DEFAULT);
      setDraftLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, [presupuestoId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!draftLoaded || typeof window === "undefined") return;
    const draft: DraftV1 = {
      v: 1,
      numeroBase,
      numeroSufijo,
      fechaIso,
      clienteBarrio,
      cuit,
      ubicacionLote,
      referenciaPresupuesto,
      servicioRubro,
      detalleTrabajos,
      estadoCantidad,
    };
    try {
      window.localStorage.setItem(
        storageKey(presupuestoId),
        JSON.stringify(draft)
      );
    } catch {
      /* ignore */
    }
  }, [
    draftLoaded,
    presupuestoId,
    numeroBase,
    numeroSufijo,
    fechaIso,
    clienteBarrio,
    cuit,
    ubicacionLote,
    referenciaPresupuesto,
    servicioRubro,
    detalleTrabajos,
    estadoCantidad,
  ]);

  function generarPdf() {
    setPrintError(null);
    const err = validarCampos({
      numeroBase,
      fechaIso,
      clienteBarrio,
      cuit,
      ubicacionLote,
      referenciaPresupuesto,
      servicioRubro,
      detalleTrabajos,
      estadoCantidad,
    });
    if (err) {
      setPrintError(err);
      return;
    }
    if (!printRef.current) {
      setPrintError("No se pudo preparar la plantilla.");
      return;
    }
    setPrinting(true);
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(() => void handlePrint());
    } else {
      void handlePrint();
    }
  }

  return (
    <div className="min-h-screen bg-ravn-surface px-8 pb-24 pr-20 pt-16 text-ravn-fg">
      <div className="pointer-events-none absolute -left-[9999px] top-0 z-0 overflow-visible">
        <CertificadoConformidadPrint
          ref={printRef}
          numeroBase={numeroBase}
          numeroSufijo={numeroSufijo}
          fechaIso={fechaIso}
          clienteBarrio={clienteBarrio}
          cuit={cuit}
          ubicacionLote={ubicacionLote}
          referenciaPresupuesto={referenciaPresupuesto}
          servicioRubro={servicioRubro}
          detalleTrabajos={detalleTrabajos}
          estadoCantidad={estadoCantidad}
        />
      </div>

      <Link
        href="/"
        aria-label="Inicio"
        className="fixed bottom-6 right-6 z-50 rounded-full border border-ravn-line/50 bg-ravn-surface/90 p-2.5 text-ravn-muted shadow-sm backdrop-blur-sm transition-colors hover:border-ravn-line hover:text-ravn-fg"
      >
        <Home className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </Link>

      {loading ? (
        <p className="font-light text-ravn-muted">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !aprobado ? (
        <div className="max-w-xl">
          <p className="text-sm text-ravn-fg">
            Este presupuesto aún no está aprobado. El remito (certificado de
            conformidad) solo se genera para trabajos aprobados.
          </p>
          <Link
            href="/historial"
            className="mt-4 inline-block text-sm font-medium uppercase tracking-wider text-ravn-muted underline-offset-4 hover:text-ravn-fg hover:underline"
          >
            Volver al historial
          </Link>
        </div>
      ) : (
        <>
          <h1 className="font-raleway text-2xl font-medium uppercase tracking-tight md:text-3xl">
            Elaborar remito
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ravn-muted">
            Certificado de conformidad. Este documento referencia el{" "}
            <span className="text-ravn-fg">presupuesto</span> de obra; la factura
            referencia al remito. Completá los campos obligatorios; el borrador se
            guarda en este navegador. Luego usá{" "}
            <span className="text-ravn-fg">Generar PDF</span> para imprimir o
            guardar como archivo.
          </p>
          <p className="mt-3 max-w-2xl rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 font-raleway text-sm font-medium uppercase tracking-wider text-ravn-fg">
            Presupuesto asociado:{" "}
            <span className="tabular-nums text-ravn-accent">
              {numeroPresupuestoLabel}
            </span>
          </p>

          <div className="mt-10 flex max-w-3xl flex-col gap-10">
            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Identificación del documento
              </h2>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div>
                  <label htmlFor="remito-numero" className={labelCls}>
                    Número (obligatorio)
                  </label>
                  <input
                    id="remito-numero"
                    value={numeroBase}
                    onChange={(e) => setNumeroBase(e.target.value)}
                    className={inputCls}
                    placeholder="0001"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="remito-numero-suf" className={labelCls}>
                    Sufijo opcional (tras el guion)
                  </label>
                  <input
                    id="remito-numero-suf"
                    value={numeroSufijo}
                    onChange={(e) => setNumeroSufijo(e.target.value)}
                    className={inputCls}
                    placeholder="—"
                    autoComplete="off"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="remito-fecha" className={labelCls}>
                    Fecha (obligatorio)
                  </label>
                  <input
                    id="remito-fecha"
                    type="date"
                    value={fechaIso}
                    onChange={(e) => setFechaIso(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Datos del cliente y obra
              </h2>
              <div className="mt-6 grid gap-6">
                <div>
                  <label htmlFor="remito-cliente" className={labelCls}>
                    Cliente / barrio (obligatorio)
                  </label>
                  <textarea
                    id="remito-cliente"
                    value={clienteBarrio}
                    onChange={(e) => setClienteBarrio(e.target.value)}
                    rows={2}
                    className={inputCls}
                    placeholder="Nombre o barrio según corresponda"
                  />
                </div>
                <div>
                  <label htmlFor="remito-cuit" className={labelCls}>
                    CUIT (obligatorio)
                  </label>
                  <input
                    id="remito-cuit"
                    value={cuit}
                    onChange={(e) => setCuit(e.target.value)}
                    className={inputCls}
                    placeholder="XX-XXXXXXXX-X"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor="remito-ubic" className={labelCls}>
                    Ubicación / lote (obligatorio)
                  </label>
                  <textarea
                    id="remito-ubic"
                    value={ubicacionLote}
                    onChange={(e) => setUbicacionLote(e.target.value)}
                    rows={2}
                    className={inputCls}
                    placeholder="Dirección, lote, etc."
                  />
                </div>
                <div>
                  <label htmlFor="remito-ref-presupuesto" className={labelCls}>
                    Referencia presupuesto (obligatorio)
                  </label>
                  <input
                    id="remito-ref-presupuesto"
                    value={referenciaPresupuesto}
                    onChange={(e) => setReferenciaPresupuesto(e.target.value)}
                    className={inputCls}
                    placeholder="Ej. P1-00104 — se precarga con este presupuesto"
                    autoComplete="off"
                  />
                  <p className="mt-2 text-xs text-ravn-muted">
                    El remito amarra la obra al presupuesto. La factura, cuando
                    la emitas, debe referenciar el remito (no al revés).
                  </p>
                </div>
              </div>
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Trabajos realizados
              </h2>
              <div className="mt-6 grid gap-6">
                <div>
                  <label htmlFor="remito-serv" className={labelCls}>
                    Rubro / servicio (obligatorio)
                  </label>
                  <input
                    id="remito-serv"
                    value={servicioRubro}
                    onChange={(e) => setServicioRubro(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="remito-detalle" className={labelCls}>
                    Detalle de trabajos (obligatorio)
                  </label>
                  <textarea
                    id="remito-detalle"
                    value={detalleTrabajos}
                    onChange={(e) => setDetalleTrabajos(e.target.value)}
                    rows={8}
                    className={inputCls}
                    placeholder="Se precarga con el texto de «Servicios presupuestados» de la propuesta"
                  />
                  <p className="mt-2 text-xs text-ravn-muted">
                    Es el mismo bloque que cargás en el constructor de propuesta
                    como servicios presupuestados; podés ajustarlo para el
                    certificado.
                  </p>
                </div>
                <div>
                  <label htmlFor="remito-estado" className={labelCls}>
                    Estado / cantidad (obligatorio)
                  </label>
                  <input
                    id="remito-estado"
                    value={estadoCantidad}
                    onChange={(e) => setEstadoCantidad(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Términos (texto fijo en el PDF)
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ravn-muted">
                {TERMS_BLOCK}
              </p>
            </section>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Link
                href="/historial"
                className="text-xs font-medium uppercase tracking-wider text-ravn-muted underline-offset-4 hover:text-ravn-fg hover:underline"
              >
                ← Historial de presupuestos
              </Link>
              <button
                type="button"
                disabled={printing}
                onClick={() => generarPdf()}
                className="inline-flex items-center justify-center rounded-none border-2 border-ravn-accent bg-ravn-accent px-8 py-4 font-raleway text-sm font-semibold uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {printing ? "Abriendo impresión…" : "Generar PDF"}
              </button>
            </div>
            {printError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {printError}
              </p>
            ) : null}
            <p className="text-xs text-ravn-muted">
              En el diálogo del navegador elegí &quot;Guardar como PDF&quot; o
              la impresora que uses habitualmente.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
