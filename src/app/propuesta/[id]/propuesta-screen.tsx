"use client";

import dynamic from "next/dynamic";
import { Home, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { createClient } from "@/lib/supabase/client";
import { formatTotalDisplay } from "@/lib/format-total-display";
import { generarTextoComercial } from "@/lib/generar-texto-comercial";
import {
  formatNumeroComercialHumano,
  prefijoPlantillaComercial,
  resolveNumeroComercial,
} from "@/lib/presupuesto-numero-comercial";
import {
  colorFondoPlantillaPdf,
  nombreArchivoPresupuestoPdf,
} from "@/lib/nombre-archivo-pdf";
import { numeroALetrasImporte } from "@/lib/numero-a-letras";
import { roundArs2 } from "@/lib/format-currency";
import {
  clearPropuestaPrefInDb,
  importeArsParaPropuesta,
  parsePropuestaPrefJsonDesdeMismaFila,
  type PropuestaPrefV1,
} from "@/lib/ravn-propuesta-pref";
import type { PresupuestoItemRow, RecetaNombreUnidad } from "@/types/ravn";

const PlantillaA4Virtual = dynamic(
  () =>
    import("@/components/plantilla-a4-virtual").then(
      (m) => m.PlantillaA4Virtual
    ),
  { ssr: false, loading: () => null }
);

const IVA_NOTA_AUTO =
  "Dicho presupuesto NO contempla el impuesto al valor agregado (IVA)";
const USD_DISCLAIMER_DEFAULT =
  "En caso de realizar la conversión en ARS se tomará el valor del dólar blue punta venta al momento de gestionar el pago.";
const NOTAS_DEFAULT =
  "El presupuesto podrá modificarse en base a los cambios que reconvengan.";
/** Párrafo opcional en PDF si se marcan mano de obra y materiales. */
const NOTA_MO_MATERIALES_PDF =
  "El presupuesto incluye la totalidad de Mano de Obra, con sus correspondientes equipos y materiales de alta calidad para la correcta ejecución de las tareas enumeradas.";
const VALIDEZ_DEFAULT = "10 DÍAS HÁBILES";
const FORMA_PAGO_DEFAULT = "50% Adelanto, Resto por avance de obra";

/** Carta de presentación del estudio (estática en /public). */
const CARTA_PRESENTACION_ESTUDIO_PATH = "/carta-presentacion-ravn.pdf";
const CARTA_PRESENTACION_DESCARGA_NOMBRE =
  "RAVN_Carta_Presentacion_Estudio.pdf";

type PdfPlantilla = "negro" | "beige" | "verde";

type RecetaJoin = RecetaNombreUnidad & {
  rubro_id?: string;
  rubros?: { nombre: string } | { nombre: string }[] | null;
};

function normalizeRecetaJoin(
  raw: RecetaJoin | RecetaJoin[] | null | undefined
): RecetaJoin | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function rubroNombreFromJoin(rec: RecetaJoin | null): string | null {
  if (!rec) return null;
  const rub = rec.rubros;
  if (rub == null) return null;
  if (Array.isArray(rub)) {
    const n = rub[0]?.nombre;
    return n != null ? String(n) : null;
  }
  return rub.nombre != null ? String(rub.nombre) : null;
}

function mapItemRow(raw: Record<string, unknown>): PresupuestoItemRow & {
  rubroNombre: string | null;
} {
  const rec = normalizeRecetaJoin(raw.recetas as RecetaJoin | null);
  return {
    id: String(raw.id),
    presupuesto_id: String(raw.presupuesto_id),
    receta_id: String(raw.receta_id),
    cantidad: Number(raw.cantidad),
    precio_material_congelado: Number(raw.precio_material_congelado),
    precio_mo_congelada: Number(raw.precio_mo_congelada),
    recetas: rec
      ? { nombre_item: String(rec.nombre_item), unidad: String(rec.unidad) }
      : null,
    rubroNombre: rubroNombreFromJoin(rec),
  };
}

const labelCls =
  "mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted";
const inputCls =
  "w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg placeholder:text-ravn-muted focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg";
const sectionCls =
  "rounded-none border border-ravn-line bg-ravn-surface p-6 md:p-8";

export function PropuestaScreen({ presupuestoId }: { presupuestoId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [plantillaVisual, setPlantillaVisual] =
    useState<PdfPlantilla>("negro");
  const [fecha, setFecha] = useState("");
  const [cliente, setCliente] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [serviciosRealizar, setServiciosRealizar] = useState("");
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");
  const [conversionDisclaimer, setConversionDisclaimer] = useState("");
  const [financiacion, setFinanciacion] = useState("");
  const [plazos, setPlazos] = useState("");
  const [formaPago, setFormaPago] = useState(FORMA_PAGO_DEFAULT);
  const [notasCondiciones, setNotasCondiciones] = useState(NOTAS_DEFAULT);
  const [incluyeIva, setIncluyeIva] = useState(true);
  const [validezOferta, setValidezOferta] = useState(VALIDEZ_DEFAULT);
  const [incluirCartaPresentacionEstudio, setIncluirCartaPresentacionEstudio] =
    useState(false);
  const [notaPdfManoObra, setNotaPdfManoObra] = useState(false);
  const [notaPdfMateriales, setNotaPdfMateriales] = useState(false);
  const [numeroCorrelativo, setNumeroCorrelativo] = useState<number>(40);
  const pdfCaptureRef = useRef<HTMLDivElement>(null);
  const descargarCartaTrasImprimirRef = useRef(false);
  const [pdfGenerando, setPdfGenerando] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [prefComercialDbError, setPrefComercialDbError] = useState<string | null>(
    null
  );
  /** Importe/moneda definidos en Rentabilidad (`presupuestos.propuesta_comercial_pref`). */
  const [rentabilidadPref, setRentabilidadPref] =
    useState<PropuestaPrefV1 | null>(null);
  const [presupuestoAprobado, setPresupuestoAprobado] = useState(false);
  /** Borrador del total editable (moneda de la propuesta); se persiste en blur. */
  const [serviciosDbError, setServiciosDbError] = useState<string | null>(null);
  const [refrescandoPrefNube, setRefrescandoPrefNube] = useState(false);

  const printPageStyle = useMemo(() => {
    const bg = colorFondoPlantillaPdf(plantillaVisual);
    return `
      @page { size: A4; margin: 0; }
      @media print {
        html, body {
          background: ${bg} !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `;
  }, [plantillaVisual]);

  function descargarCartaPresentacionEstudio() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    try {
      const url = new URL(
        CARTA_PRESENTACION_ESTUDIO_PATH,
        window.location.origin
      ).href;
      const a = document.createElement("a");
      a.href = url;
      a.download = CARTA_PRESENTACION_DESCARGA_NOMBRE;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      setPdfError(
        "No se pudo descargar la carta de presentación. Revisá que exista el archivo en el servidor."
      );
    }
  }

  const handlePrint = useReactToPrint({
    contentRef: pdfCaptureRef,
    documentTitle: () =>
      nombreArchivoPresupuestoPdf(numeroComercialHumano, cliente),
    pageStyle: printPageStyle,
    onBeforePrint: async () => {
      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
    },
    onAfterPrint: () => {
      setPdfGenerando(false);
      if (descargarCartaTrasImprimirRef.current) {
        descargarCartaTrasImprimirRef.current = false;
        window.setTimeout(() => descargarCartaPresentacionEstudio(), 450);
      }
    },
    onPrintError: (_loc, err) => {
      setPdfError(err.message || "Error al imprimir.");
      setPdfGenerando(false);
      descargarCartaTrasImprimirRef.current = false;
    },
  });

  const [items, setItems] = useState<
    (PresupuestoItemRow & { rubroNombre: string | null })[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const [presRes, correlativo] = await Promise.all([
        supabase
          .from("presupuestos")
          .select(
            "fecha, nombre_cliente, domicilio, propuesta_comercial_pref, propuesta_texto_servicios, presupuesto_aprobado"
          )
          .eq("id", presupuestoId)
          .single(),
        resolveNumeroComercial(supabase, presupuestoId),
      ]);

      const { data: pres, error: errP } = presRes;
      setNumeroCorrelativo(correlativo);

      if (errP || !pres) {
        setError(errP?.message ?? "Presupuesto no encontrado.");
        setLoading(false);
        return;
      }

      const f = pres.fecha;
      setFecha(
        typeof f === "string"
          ? f.slice(0, 10)
          : f instanceof Date
            ? f.toISOString().slice(0, 10)
            : String(f ?? "").slice(0, 10)
      );
      setCliente(String(pres.nombre_cliente ?? ""));
      setDomicilio(String(pres.domicilio ?? ""));
      setPresupuestoAprobado(
        Boolean(
          (pres as { presupuesto_aprobado?: boolean }).presupuesto_aprobado
        )
      );

      const propuestaComercialPrefRaw = (
        pres as { propuesta_comercial_pref?: unknown }
      ).propuesta_comercial_pref;

      const selectWithRubros = `
        id,
        presupuesto_id,
        receta_id,
        cantidad,
        precio_material_congelado,
        precio_mo_congelada,
        recetas (
          nombre_item,
          unidad,
          rubro_id,
          rubros ( nombre )
        )
      `;

      const resItems = await supabase
        .from("presupuestos_items")
        .select(selectWithRubros)
        .eq("presupuesto_id", presupuestoId)
        .order("id", { ascending: true });

      let rowsData: Record<string, unknown>[] = (resItems.data ??
        []) as Record<string, unknown>[];
      let errI = resItems.error;

      if (errI) {
        const simple = await supabase
          .from("presupuestos_items")
          .select(
            `
            id,
            presupuesto_id,
            receta_id,
            cantidad,
            precio_material_congelado,
            precio_mo_congelada,
            recetas ( nombre_item, unidad, rubro_id )
          `
          )
          .eq("presupuesto_id", presupuestoId)
          .order("id", { ascending: true });

        if (simple.error) {
          setError(simple.error.message);
          setLoading(false);
          return;
        }

        rowsData = (simple.data ?? []) as Record<string, unknown>[];
        errI = null;
        const ids = new Set<string>();
        for (const row of simple.data ?? []) {
          const r = row as Record<string, unknown>;
          const rec = normalizeRecetaJoin(r.recetas as RecetaJoin | null);
          if (rec?.rubro_id != null) ids.add(String(rec.rubro_id));
        }
        if (ids.size > 0) {
          const { data: rubRows } = await supabase
            .from("rubros")
            .select("id, nombre")
            .in("id", [...ids]);
          const nameById = new Map<string, string>();
          for (const rb of rubRows ?? []) {
            nameById.set(String((rb as { id: string }).id), String((rb as { nombre: string }).nombre));
          }
          const mapped = (simple.data ?? []).map((row) => {
            const base = mapItemRow(row as Record<string, unknown>);
            const rec = normalizeRecetaJoin(
              (row as Record<string, unknown>).recetas as RecetaJoin | null
            );
            const rid = rec?.rubro_id != null ? String(rec.rubro_id) : null;
            return {
              ...base,
              rubroNombre: rid ? nameById.get(rid) ?? null : null,
            };
          });
          setItems(mapped);
          applyFormDefaultsFromItems(mapped);
          aplicarTextoServiciosDesdePresupuesto(
            mapped,
            (pres as { propuesta_texto_servicios?: unknown })
              .propuesta_texto_servicios
          );
          aplicarPropuestaPrefDesdeDb(propuestaComercialPrefRaw);
          setLoading(false);
          return;
        }
      }

      const mapped = rowsData.map((row) => mapItemRow(row));
      setItems(mapped);
      applyFormDefaultsFromItems(mapped);
      aplicarTextoServiciosDesdePresupuesto(
        mapped,
        (pres as { propuesta_texto_servicios?: unknown })
          .propuesta_texto_servicios
      );
      aplicarPropuestaPrefDesdeDb(propuestaComercialPrefRaw);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, [presupuestoId]);

  function syncNotasSegunIva(checked: boolean) {
    setNotasCondiciones((prev) => {
      const escaped = IVA_NOTA_AUTO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(\\n\\n)?${escaped}\\.?`, "g");
      if (checked) {
        return prev.replace(re, "").trimEnd();
      }
      if (prev.includes(IVA_NOTA_AUTO)) return prev;
      const base = prev.trimEnd();
      return base ? `${base}\n\n${IVA_NOTA_AUTO}` : IVA_NOTA_AUTO;
    });
  }

  function aplicarTextoServiciosDesdePresupuesto(
    mapped: (PresupuestoItemRow & { rubroNombre: string | null })[],
    textoGuardado: unknown
  ) {
    if (typeof textoGuardado === "string" && textoGuardado.trim().length > 0) {
      setServiciosRealizar(textoGuardado);
      return;
    }
    setServiciosRealizar(
      generarTextoComercial(
        mapped.map((it) => ({
          rubroNombre: it.rubroNombre,
          cantidad: it.cantidad,
          unidad: it.recetas?.unidad ?? null,
        }))
      )
    );
  }

  function applyFormDefaultsFromItems(
    mapped: (PresupuestoItemRow & { rubroNombre: string | null })[]
  ) {
    setPlantillaVisual("negro");
    setMoneda("ARS");
    setConversionDisclaimer("");
    setFinanciacion("");
    setPlazos("");
    setFormaPago(FORMA_PAGO_DEFAULT);
    setNotasCondiciones(NOTAS_DEFAULT);
    setIncluyeIva(true);
    setValidezOferta(VALIDEZ_DEFAULT);
    setNotaPdfManoObra(false);
    setNotaPdfMateriales(false);
  }

  function aplicarPropuestaPrefDesdeDb(raw: unknown) {
    const pref = parsePropuestaPrefJsonDesdeMismaFila(raw, presupuestoId);
    if (!pref) {
      setRentabilidadPref(null);
      return;
    }
    setRentabilidadPref(pref);
    setMoneda(pref.moneda);
    setIncluyeIva(pref.incluyeIvaEnImporte);
    syncNotasSegunIva(pref.incluyeIvaEnImporte);
    if (pref.moneda === "USD") {
      setConversionDisclaimer(
        pref.conversionDisclaimerSugerido ?? USD_DISCLAIMER_DEFAULT
      );
    } else {
      setConversionDisclaimer("");
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const totales = useMemo(() => {
    let material = 0;
    let mo = 0;
    for (const row of items) {
      const q = Number(row.cantidad) || 0;
      const pm = Number(row.precio_material_congelado) || 0;
      const pmo = Number(row.precio_mo_congelada) || 0;
      material += q * pm;
      mo += q * pmo;
    }
    return { material, mo, total: material + mo };
  }, [items]);

  const montoImportePdf = useMemo(() => {
    if (!rentabilidadPref) return totales.total;
    const ars = importeArsParaPropuesta(rentabilidadPref);
    if (moneda === "USD") {
      const c = rentabilidadPref.cotizacionVentaArsPorUsd;
      if (Number.isFinite(c) && c > 0) {
        return roundArs2(ars / c);
      }
      return 0;
    }
    return ars;
  }, [rentabilidadPref, moneda, totales.total]);

  const montoImportePdfEntero = useMemo(
    () => Math.round(Number.isFinite(montoImportePdf) ? montoImportePdf : 0),
    [montoImportePdf]
  );

  const totalLabel = useMemo(
    () => formatTotalDisplay(montoImportePdfEntero, moneda),
    [montoImportePdfEntero, moneda]
  );

  const numeroComercialHumano = useMemo(() => {
    const pref = prefijoPlantillaComercial(plantillaVisual);
    return formatNumeroComercialHumano(pref, numeroCorrelativo);
  }, [plantillaVisual, numeroCorrelativo]);

  const totalEnLetras = useMemo(
    () => numeroALetrasImporte(montoImportePdfEntero, moneda),
    [montoImportePdfEntero, moneda]
  );

  const notasCondicionesParaPdf = useMemo(() => {
    const base = notasCondiciones.trim();
    if (!notaPdfManoObra || !notaPdfMateriales) return notasCondiciones;
    const extra = NOTA_MO_MATERIALES_PDF.trim();
    return base ? `${base}\n\n${extra}` : extra;
  }, [notasCondiciones, notaPdfManoObra, notaPdfMateriales]);

  function handleMonedaChange(m: "ARS" | "USD") {
    setMoneda(m);
    if (m === "ARS") {
      setConversionDisclaimer("");
    } else {
      setConversionDisclaimer((prev) => prev || USD_DISCLAIMER_DEFAULT);
    }
  }

  function handleIncluyeIvaChange(checked: boolean) {
    setIncluyeIva(checked);
    syncNotasSegunIva(checked);
  }

  async function persistPropuestaTextoServicios() {
    setServiciosDbError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("presupuestos")
        .update({ propuesta_texto_servicios: serviciosRealizar })
        .eq("id", presupuestoId);
      if (error) {
        setServiciosDbError(
          error.message.includes("propuesta_texto_servicios")
            ? "Falta la columna propuesta_texto_servicios en Supabase. Ejecutá la migración correspondiente."
            : error.message
        );
      }
    } catch (e) {
      setServiciosDbError(
        e instanceof Error ? e.message : "No se pudo guardar el texto."
      );
    }
  }

  async function refrescarImporteDesdeNube() {
    setRefrescandoPrefNube(true);
    setPrefComercialDbError(null);
    try {
      const supabase = createClient();
      const { data: pres, error } = await supabase
        .from("presupuestos")
        .select("propuesta_comercial_pref")
        .eq("id", presupuestoId)
        .single();
      if (error || !pres) {
        setPrefComercialDbError(
          error?.message ?? "No se pudo leer el presupuesto en la nube."
        );
        return;
      }
      aplicarPropuestaPrefDesdeDb(
        (pres as { propuesta_comercial_pref?: unknown })
          .propuesta_comercial_pref
      );
    } finally {
      setRefrescandoPrefNube(false);
    }
  }

  async function marcarPdfGeneradoEnSupabase(): Promise<boolean> {
    const supabase = createClient();
    const withMoneda = await supabase
      .from("presupuestos")
      .update({ pdf_generado: true, moneda })
      .eq("id", presupuestoId);
    if (!withMoneda.error) return true;

    const soloFlag = await supabase
      .from("presupuestos")
      .update({ pdf_generado: true })
      .eq("id", presupuestoId);
    if (soloFlag.error) {
      setPdfError(
        soloFlag.error.message ||
          "No se pudo marcar el presupuesto. Verificá la columna pdf_generado."
      );
      return false;
    }
    return true;
  }

  async function handleGenerarPdf() {
    if (!pdfCaptureRef.current) {
      setPdfError("No se pudo preparar la plantilla de impresión.");
      return;
    }
    setPdfError(null);
    setPdfGenerando(true);
    const ok = await marcarPdfGeneradoEnSupabase();
    if (!ok) {
      setPdfGenerando(false);
      return;
    }
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }
    descargarCartaTrasImprimirRef.current = incluirCartaPresentacionEstudio;
    void handlePrint();
  }

  return (
    <div className="min-h-screen bg-ravn-surface px-8 pb-20 pr-20 pt-16 text-ravn-fg">
      {loading ? (
        <p className="font-light text-ravn-muted">Cargando datos…</p>
      ) : error ? (
        <p className="text-sm">{error}</p>
      ) : (
        <>
          <Link
            href="/"
            aria-label="Inicio"
            className="fixed bottom-6 right-6 z-50 rounded-full border border-ravn-line/50 bg-ravn-surface/90 p-2.5 text-ravn-muted shadow-sm backdrop-blur-sm transition-colors hover:border-ravn-line hover:text-ravn-fg"
          >
            <Home className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </Link>
          <PlantillaA4Virtual
            ref={pdfCaptureRef}
            plantillaVisual={plantillaVisual}
            fecha={fecha}
            numeroComercialHumano={numeroComercialHumano}
            cliente={cliente}
            domicilio={domicilio}
            textoComercial={serviciosRealizar}
            totalFormateado={totalLabel}
            totalEnLetras={totalEnLetras}
            moneda={moneda}
            conversionDisclaimer={
              moneda === "USD" ? conversionDisclaimer : undefined
            }
            financiacion={financiacion.trim() || undefined}
            plazos={plazos.trim() || undefined}
            formaPago={formaPago}
            notasCondiciones={notasCondicionesParaPdf}
            incluyeIva={incluyeIva}
            validezOferta={validezOferta}
          />
          <h1 className="font-raleway text-2xl font-medium uppercase tracking-tight md:text-3xl">
            Constructor de propuesta comercial
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ravn-muted">
            Configuración del documento PDF.
          </p>
          <p className="mt-3 max-w-2xl rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 font-raleway text-sm font-medium uppercase tracking-wider text-ravn-fg">
            N.º presupuesto comercial:{" "}
            <span className="tabular-nums text-ravn-accent">{numeroComercialHumano}</span>
          </p>
          {presupuestoAprobado ? (
            <p className="mt-3 max-w-2xl text-xs font-medium uppercase tracking-wider">
              <Link
                href={`/obras/${encodeURIComponent(presupuestoId)}/gastos`}
                className="text-ravn-muted underline-offset-4 transition-colors hover:text-ravn-fg hover:underline"
              >
                Gastos de obra
              </Link>
            </p>
          ) : null}

          <div className="mt-10 flex max-w-3xl flex-col gap-10">
            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Plantilla visual
              </h2>
              <p className="mt-2 text-xs text-ravn-muted">
                El prefijo del número (P1 / P2 / P3) sigue al color elegido; el correlativo es el
                mismo para este presupuesto.
              </p>
              <div className="mt-4">
                <label htmlFor="plantilla" className={labelCls}>
                  Color del PDF
                </label>
                <select
                  id="plantilla"
                  value={plantillaVisual}
                  onChange={(e) =>
                    setPlantillaVisual(e.target.value as PdfPlantilla)
                  }
                  className={inputCls}
                >
                  <option value="negro">Negro (Obra)</option>
                  <option value="beige">Beige (Diseño)</option>
                  <option value="verde">Verde (Parquización)</option>
                </select>
              </div>
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Cabecera
              </h2>
              <div className="mt-6 grid gap-6 md:grid-cols-3">
                <div>
                  <label htmlFor="prop-fecha" className={labelCls}>
                    Fecha
                  </label>
                  <input
                    id="prop-fecha"
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="prop-cliente" className={labelCls}>
                    Cliente
                  </label>
                  <input
                    id="prop-cliente"
                    type="text"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="md:col-span-3">
                  <label htmlFor="prop-domicilio" className={labelCls}>
                    Domicilio
                  </label>
                  <input
                    id="prop-domicilio"
                    type="text"
                    value={domicilio}
                    onChange={(e) => setDomicilio(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Servicios a realizar
              </h2>
              <div className="mt-4">
                <label htmlFor="servicios" className={labelCls}>
                  Texto comercial (rubros del presupuesto)
                </label>
                <textarea
                  id="servicios"
                  value={serviciosRealizar}
                  onChange={(e) => setServiciosRealizar(e.target.value)}
                  onBlur={() => void persistPropuestaTextoServicios()}
                  rows={8}
                  className={`${inputCls} min-h-[12rem] resize-y font-light leading-relaxed`}
                />
                <p className="mt-2 text-xs text-ravn-muted">
                  Se guarda en la nube al salir del campo (no se regenera solo al
                  recargar).
                </p>
                {serviciosDbError ? (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {serviciosDbError}
                  </p>
                ) : null}
              </div>
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Moneda y total
              </h2>
              {rentabilidadPref ? (
                <div className="mt-3 space-y-3 rounded-none border border-ravn-line bg-ravn-subtle px-4 py-3 text-xs text-ravn-fg">
                  <p>
                    El <strong className="font-medium">total</strong> y la base de
                    precio vienen de{" "}
                    <strong className="font-medium">Rentabilidad y costos</strong>{" "}
                    (guardado en la nube). Para una mejora o cambio de números,
                    volvé ahí, ajustá remarques / importe y usá{" "}
                    <strong className="font-medium">
                      continuar a propuesta comercial
                    </strong>{" "}
                    para guardar el nuevo pref; después podés{" "}
                    <strong className="font-medium">
                      actualizar desde la nube
                    </strong>{" "}
                    acá abajo.
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <Link
                      href={`/rentabilidad?id=${encodeURIComponent(presupuestoId)}`}
                      className="font-medium uppercase tracking-wider text-ravn-accent underline-offset-4 transition-colors hover:underline"
                    >
                      Rentabilidad y costos
                    </Link>
                    <Link
                      href="/nuevo-presupuesto"
                      className="font-medium uppercase tracking-wider text-ravn-muted underline-offset-4 transition-colors hover:text-ravn-fg hover:underline"
                    >
                      Presupuesto (líneas y costos)
                    </Link>
                  </div>
                  <p className="text-ravn-muted">
                    Moneda del PDF: podés cambiarla abajo; el total se recalcula
                    desde el mismo importe en pesos.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        setPrefComercialDbError(null);
                        const supabase = createClient();
                        const err = await clearPropuestaPrefInDb(
                          supabase,
                          presupuestoId
                        );
                        if (err) {
                          setPrefComercialDbError(err);
                          return;
                        }
                        setRentabilidadPref(null);
                      })();
                    }}
                    className="text-ravn-muted underline underline-offset-2 transition-colors hover:text-ravn-fg"
                  >
                    Usar total del listado de líneas
                  </button>
                </div>
              ) : (
                <p className="mt-3 rounded-none border border-ravn-line bg-ravn-subtle px-4 py-3 text-xs text-ravn-fg">
                  No hay precio guardado desde Rentabilidad: el total es la suma de
                  ítems. Para definir precio al cliente y márgenes andá a{" "}
                  <Link
                    href={`/rentabilidad?id=${encodeURIComponent(presupuestoId)}`}
                    className="font-medium text-ravn-accent underline-offset-4 hover:underline"
                  >
                    Rentabilidad y costos
                  </Link>
                  .
                </p>
              )}
              {prefComercialDbError ? (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {prefComercialDbError}
                </p>
              ) : null}
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div>
                  <label htmlFor="moneda" className={labelCls}>
                    Moneda
                  </label>
                  <select
                    id="moneda"
                    value={moneda}
                    onChange={(e) =>
                      handleMonedaChange(e.target.value as "ARS" | "USD")
                    }
                    className={inputCls}
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <span className={labelCls}>
                    {rentabilidadPref
                      ? "Total en propuesta / PDF"
                      : "Total calculado"}
                  </span>
                  <div className="rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-lg font-medium tabular-nums text-ravn-fg">
                    {totalLabel}
                  </div>
                  {rentabilidadPref ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void refrescarImporteDesdeNube()}
                        disabled={refrescandoPrefNube}
                        className="mt-3 inline-flex items-center gap-2 rounded-none border border-ravn-line bg-ravn-surface px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 shrink-0 ${refrescandoPrefNube ? "animate-spin" : ""}`}
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        {refrescandoPrefNube
                          ? "Actualizando…"
                          : "Actualizar total desde la nube"}
                      </button>
                      <p className="mt-2 text-xs leading-relaxed text-ravn-muted">
                        Después de guardar cambios en Rentabilidad, tocá este botón
                        para traer el importe nuevo sin recargar toda la página. En{" "}
                        <Link
                          href={`/obras/${encodeURIComponent(presupuestoId)}/gastos`}
                          className="underline underline-offset-2"
                        >
                          gastos de obra
                        </Link>{" "}
                        (aprobado) se usa ese precio para el margen esperado.
                      </p>
                    </>
                  ) : null}
                </div>
              </div>
              {moneda === "USD" ? (
                <div className="mt-6">
                  <label htmlFor="usd-disclaimer" className={labelCls}>
                    Texto conversión (ARS)
                  </label>
                  <textarea
                    id="usd-disclaimer"
                    value={conversionDisclaimer}
                    onChange={(e) => setConversionDisclaimer(e.target.value)}
                    rows={3}
                    className={`${inputCls} resize-y font-light leading-relaxed`}
                  />
                </div>
              ) : null}
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Financiación y plazos
              </h2>
              <p className="mb-4 text-xs text-ravn-muted">
                Opcionales. Si quedan vacíos, no se incluyen en el PDF.
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label htmlFor="financiacion" className={labelCls}>
                    Financiación
                  </label>
                  <input
                    id="financiacion"
                    type="text"
                    value={financiacion}
                    onChange={(e) => setFinanciacion(e.target.value)}
                    className={inputCls}
                    placeholder="—"
                  />
                </div>
                <div>
                  <label htmlFor="plazos" className={labelCls}>
                    Plazos
                  </label>
                  <input
                    id="plazos"
                    type="text"
                    value={plazos}
                    onChange={(e) => setPlazos(e.target.value)}
                    className={inputCls}
                    placeholder="—"
                  />
                </div>
              </div>
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Forma de pago
              </h2>
              <div className="mt-4">
                <label htmlFor="forma-pago" className={labelCls}>
                  Condiciones
                </label>
                <input
                  id="forma-pago"
                  type="text"
                  value={formaPago}
                  onChange={(e) => setFormaPago(e.target.value)}
                  className={inputCls}
                />
              </div>
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Notas y condiciones
              </h2>
              <div className="mt-4">
                <label htmlFor="notas" className={labelCls}>
                  Texto
                </label>
                <textarea
                  id="notas"
                  value={notasCondiciones}
                  onChange={(e) => setNotasCondiciones(e.target.value)}
                  rows={6}
                  className={`${inputCls} resize-y font-light leading-relaxed`}
                />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-ravn-muted">
                Si marcás ambas opciones, al final de las notas del PDF se agrega
                el párrafo estándar sobre mano de obra y materiales (no se
                modifica el texto que escribís arriba).
              </p>
              <div className="mt-4 flex flex-col gap-3 border border-ravn-line px-4 py-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={notaPdfManoObra}
                    onChange={(e) => setNotaPdfManoObra(e.target.checked)}
                    className="h-4 w-4 shrink-0 rounded-none border-ravn-line text-ravn-fg focus:ring-ravn-fg"
                  />
                  <span className="text-sm font-medium text-ravn-fg">
                    Mano de obra
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={notaPdfMateriales}
                    onChange={(e) => setNotaPdfMateriales(e.target.checked)}
                    className="h-4 w-4 shrink-0 rounded-none border-ravn-line text-ravn-fg focus:ring-ravn-fg"
                  />
                  <span className="text-sm font-medium text-ravn-fg">
                    Materiales
                  </span>
                </label>
              </div>
              <label className="mt-6 flex cursor-pointer items-center gap-3 border border-ravn-line px-4 py-3">
                <input
                  type="checkbox"
                  checked={incluyeIva}
                  onChange={(e) => handleIncluyeIvaChange(e.target.checked)}
                  className="h-4 w-4 rounded-none border-ravn-line text-ravn-fg focus:ring-ravn-fg"
                />
                <span className="text-sm font-medium uppercase tracking-wider text-ravn-fg">
                  ¿Incluye IVA?
                </span>
              </label>
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Validez de oferta
              </h2>
              <div className="mt-4">
                <label htmlFor="validez" className={labelCls}>
                  Plazo
                </label>
                <input
                  id="validez"
                  type="text"
                  value={validezOferta}
                  onChange={(e) => setValidezOferta(e.target.value)}
                  className={inputCls}
                />
              </div>
            </section>

            <section className={sectionCls}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Presentación del estudio
              </h2>
              <label className="mt-6 flex cursor-pointer items-start gap-3 border border-ravn-line px-4 py-4">
                <input
                  type="checkbox"
                  checked={incluirCartaPresentacionEstudio}
                  onChange={(e) =>
                    setIncluirCartaPresentacionEstudio(e.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-none border-ravn-line text-ravn-fg focus:ring-ravn-fg"
                />
                <span className="text-sm font-medium uppercase tracking-wider text-ravn-fg">
                  Agregar presentación del estudio comercial
                </span>
              </label>
              <p className="mt-3 text-xs leading-relaxed text-ravn-muted">
                Si está marcado, después de cerrar el cuadro de impresión o
                guardado del PDF de la propuesta, se descarga automáticamente la
                carta de presentación RAVN (PDF fijo del estudio).
              </p>
            </section>

            <div className="flex flex-col gap-4 border-t border-ravn-line pt-10 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/nuevo-presupuesto"
                  className="inline-flex w-fit items-center justify-center rounded-none border-2 border-ravn-line bg-ravn-surface px-6 py-3 text-sm font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg"
                >
                  Volver al presupuesto
                </Link>
                <Link
                  href={`/rentabilidad?id=${encodeURIComponent(presupuestoId)}`}
                  className="inline-flex w-fit items-center justify-center rounded-none border-2 border-ravn-line bg-ravn-surface px-6 py-3 text-sm font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg"
                >
                  Rentabilidad y costos
                </Link>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerarPdf()}
                disabled={pdfGenerando}
                className="w-full rounded-none border-2 border-ravn-accent bg-ravn-accent px-8 py-5 text-center text-base font-medium uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg disabled:cursor-not-allowed disabled:opacity-50 md:ml-auto md:max-w-xl md:flex-1"
              >
                {pdfGenerando ? "Generando…" : "GENERAR PDF"}
              </button>
            </div>
            {pdfError ? (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {pdfError}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
