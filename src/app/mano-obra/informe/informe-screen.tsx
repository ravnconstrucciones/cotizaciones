"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import { InformeMOPrint } from "@/components/informe-mo-print";
import { createClient } from "@/lib/supabase/client";
import { armarInformeMO, type AcuerdoMO, type PagoMO } from "@/lib/mano-obra";

/**
 * Informe de pagos por empleado (/mano-obra/informe): elegir persona + rango
 * de fechas y generar el documento imprimible (formato oficial RAVN negro A4)
 * para dárselo al gremio como registro de todos sus pagos.
 */

type PresupuestoNombre = { id: string; nombre_obra: string | null; nombre_cliente: string | null };

const inputCls =
  "border border-cdm-line bg-transparent px-2 py-1.5 font-mono-hud text-[11px] text-cdm-fg focus-visible:border-cdm-accent focus-visible:outline-none [color-scheme:dark]";

export function InformeMOScreen() {
  const printRef = useRef<HTMLDivElement>(null);
  const [acuerdos, setAcuerdos] = useState<AcuerdoMO[] | null>(null);
  const [pagos, setPagos] = useState<PagoMO[]>([]);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const [cuentas, setCuentas] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [persona, setPersona] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const cargar = useCallback(async () => {
    try {
      const supabase = createClient();
      const [acs, gs, pres, ctas] = await Promise.all([
        supabase.from("mo_acuerdos").select("*").order("created_at", { ascending: true }),
        supabase
          .from("presupuestos_gastos")
          .select("id, mo_acuerdo_id, importe, fecha, descripcion, cotizacion_venta_ars_por_usd, cuenta_id")
          .not("mo_acuerdo_id", "is", null),
        supabase.from("presupuestos").select("id, nombre_obra, nombre_cliente"),
        supabase.from("cuentas").select("id, nombre"),
      ]);
      if (acs.error) {
        setError(acs.error.message);
        return;
      }
      setError(null);
      setAcuerdos((acs.data ?? []) as AcuerdoMO[]);
      setPagos((gs.data ?? []) as PagoMO[]);
      setNombres(
        new Map(
          ((pres.data ?? []) as PresupuestoNombre[]).map((p) => [
            p.id,
            p.nombre_obra?.trim() || p.nombre_cliente?.trim() || "Obra",
          ]),
        ),
      );
      setCuentas(
        new Map(((ctas.data ?? []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre])),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const personas = useMemo(() => {
    const set = new Set<string>();
    for (const a of acuerdos ?? []) if (a.persona) set.add(a.persona);
    return [...set].sort();
  }, [acuerdos]);

  const sinPersona = useMemo(
    () => (acuerdos ?? []).filter((a) => !a.persona).length,
    [acuerdos],
  );

  // Primera persona por defecto apenas cargan los datos
  useEffect(() => {
    if (!persona && personas.length > 0) setPersona(personas[0]);
  }, [persona, personas]);

  const informe = useMemo(
    () => (persona ? armarInformeMO(acuerdos ?? [], pagos, { persona, desde, hasta }) : null),
    [acuerdos, pagos, persona, desde, hasta],
  );

  // "sv-SE" da YYYY-MM-DD en hora LOCAL (toISOString es UTC y de noche salta de día)
  const fechaEmision = new Date().toLocaleDateString("sv-SE");

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: () =>
      `Informe_MO_${persona.replace(/\s+/g, "_")}${desde ? `_${desde}` : ""}${hasta ? `_${hasta}` : ""}`,
    pageStyle: `
      @page { size: A4; margin: 0; }
      @media print {
        html, body {
          background: #1c1c1a !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `,
    onBeforePrint: async () => {
      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
    },
  });

  return (
    <div className="font-grotesk relative flex min-h-dvh flex-col bg-cdm-bg p-4 text-cdm-fg">
      <WavesBackdrop />
      <header className="relative z-10 flex items-baseline justify-between gap-3 px-1">
        <div className="flex items-baseline gap-4">
          <Link
            href="/mano-obra"
            className="font-mono-hud text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
          >
            [← MANO DE OBRA]
          </Link>
          <h1 className="font-mono-hud flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
            INFORME DE PAGOS
          </h1>
        </div>
      </header>

      <div className="relative z-10 mt-4 flex flex-col gap-4 px-1">
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        {!acuerdos && <SkeletonGlass filas={3} anchos={["w-1/2", "w-1/3", "w-2/5"]} />}

        {acuerdos && personas.length === 0 && (
          <p className="text-[12px] text-cdm-muted">
            Ningún acuerdo tiene persona asignada todavía — cargala desde cada obra (Mano de obra).
          </p>
        )}

        {acuerdos && personas.length > 0 && (
          <>
            <section className="flex flex-wrap items-end gap-4 border border-cdm-line p-3">
              <label className="flex flex-col gap-1.5">
                <span className="font-mono-hud text-[9px] uppercase tracking-[0.18em] text-cdm-muted">
                  Persona
                </span>
                <select value={persona} onChange={(e) => setPersona(e.target.value)} className={inputCls}>
                  {personas.map((p) => (
                    <option key={p} value={p} className="bg-cdm-bg">
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono-hud text-[9px] uppercase tracking-[0.18em] text-cdm-muted">
                  Desde (opcional)
                </span>
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-mono-hud text-[9px] uppercase tracking-[0.18em] text-cdm-muted">
                  Hasta (opcional)
                </span>
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
              </label>
              <button
                type="button"
                onClick={() => void handlePrint()}
                disabled={!informe || informe.grupos.length === 0}
                className="font-mono-hud border border-cdm-accent px-4 py-1.5 text-[10px] uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                [DESCARGAR PDF]
              </button>
              {sinPersona > 0 && (
                <span className="font-mono-hud text-[9px] uppercase tracking-[0.08em] text-amber-400">
                  ⚠ {sinPersona} acuerdo{sinPersona > 1 ? "s" : ""} sin persona — no entra{sinPersona > 1 ? "n" : ""} en ningún informe
                </span>
              )}
            </section>

            {informe && informe.grupos.length === 0 && (
              <p className="text-[12px] text-cdm-muted">
                {persona} no tiene pagos en el período elegido.
              </p>
            )}

            {/* Vista previa del documento tal cual sale impreso */}
            {informe && informe.grupos.length > 0 && (
              <div className="overflow-x-auto border border-cdm-line">
                <InformeMOPrint
                  ref={printRef}
                  informe={informe}
                  nombresObras={nombres}
                  cuentas={cuentas}
                  fechaEmision={fechaEmision}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
