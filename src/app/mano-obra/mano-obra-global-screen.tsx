"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { createClient } from "@/lib/supabase/client";
import {
  resumirAcuerdos,
  type AcuerdoMO,
  type PagoMO,
  type ResumenAcuerdo,
} from "@/lib/mano-obra";

/**
 * Mano de obra GLOBAL (/mano-obra): todos los acuerdos de todas las obras —
 * a quién se le debe, cuánto y hace cuánto no cobra. El detalle y el alta
 * viven en /obras/[id]/mano-obra; esto es el tablero de deuda con gremios.
 */

const fmt = (n: number, moneda = "ARS") =>
  `${moneda === "USD" ? "US$" : "$"}${Math.round(n).toLocaleString("es-AR")}`;

const haceDias = (fechaIso: string | null) => {
  if (!fechaIso) return "nunca cobró";
  const dias = Math.floor((Date.now() - new Date(fechaIso).getTime()) / 86400000);
  if (dias <= 0) return "cobró hoy";
  return `último pago hace ${dias} día${dias > 1 ? "s" : ""}`;
};

type PresupuestoNombre = { id: string; nombre_obra: string | null; nombre_cliente: string | null };

export function ManoObraGlobalScreen() {
  const [acuerdos, setAcuerdos] = useState<AcuerdoMO[] | null>(null);
  const [pagos, setPagos] = useState<PagoMO[]>([]);
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [verSaldados, setVerSaldados] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const supabase = createClient();
      const [acs, gs, pres] = await Promise.all([
        supabase.from("mo_acuerdos").select("*").order("created_at", { ascending: true }),
        supabase
          .from("presupuestos_gastos")
          .select("id, mo_acuerdo_id, importe, fecha, descripcion, cotizacion_venta_ars_por_usd")
          .not("mo_acuerdo_id", "is", null),
        supabase.from("presupuestos").select("id, nombre_obra, nombre_cliente"),
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("presupuestos_gastos", cargar);
  useRealtimeTable("mo_acuerdos", cargar);

  // Grupos por obra, en el orden de carga de los acuerdos.
  const grupos = useMemo(() => {
    const visibles = (acuerdos ?? []).filter((a) => verSaldados || a.estado === "abierto");
    const resumenes = resumirAcuerdos(visibles, pagos);
    const porObra = new Map<string, ResumenAcuerdo[]>();
    for (const r of resumenes) {
      const lista = porObra.get(r.acuerdo.presupuesto_id) ?? [];
      lista.push(r);
      porObra.set(r.acuerdo.presupuesto_id, lista);
    }
    return [...porObra.entries()];
  }, [acuerdos, pagos, verSaldados]);

  const totalAdeudado = useMemo(
    () =>
      grupos
        .flatMap(([, rs]) => rs)
        .filter((r) => r.acuerdo.estado === "abierto" && r.acuerdo.moneda === "ARS")
        .reduce((a, r) => a + r.saldo, 0),
    [grupos],
  );

  return (
    <div className="font-grotesk relative flex min-h-dvh flex-col bg-cdm-bg p-4 text-cdm-fg">
      <WavesBackdrop />
      <header className="relative z-10 flex items-baseline justify-between gap-3 px-1">
        <div className="flex items-baseline gap-4">
          <Link
            href="/obras"
            className="font-mono-hud text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
          >
            [← PROYECTOS]
          </Link>
          <h1 className="font-mono-hud flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
            MANO DE OBRA
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setVerSaldados((v) => !v)}
          className="font-mono-hud text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
        >
          {verSaldados ? "[OCULTAR SALDADOS]" : "[VER SALDADOS]"}
        </button>
      </header>

      <div className="relative z-10 mt-4 flex flex-col gap-4 px-1">
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        {!acuerdos && <SkeletonGlass filas={4} anchos={["w-1/2", "w-1/3", "w-2/5", "w-1/4"]} />}

        {grupos.map(([presupuestoId, rs]) => {
          // Avance de la obra: solo acuerdos abiertos en ARS (mismo criterio que el total)
          const abiertos = rs.filter((r) => r.acuerdo.estado === "abierto" && r.acuerdo.moneda === "ARS");
          const arreglado = abiertos.reduce((a, r) => a + Number(r.acuerdo.monto_arreglado), 0);
          const pagado = abiertos.reduce((a, r) => a + r.pagado, 0);
          const pct = arreglado > 0 ? Math.round((pagado / arreglado) * 100) : 0;
          return (
          <section key={presupuestoId} className="border border-cdm-line p-3">
            <Link
              href={`/obras/${presupuestoId}/mano-obra`}
              className="font-mono-hud text-[11px] font-semibold uppercase tracking-[0.18em] text-cdm-fg transition-colors hover:text-cdm-accent"
            >
              {nombres.get(presupuestoId) ?? "Obra"} ↑
            </Link>
            <ul className="mt-2 flex flex-col gap-1.5">
              {rs.map((r) => (
                <li
                  key={r.acuerdo.id}
                  className={`flex flex-wrap items-baseline justify-between gap-2 text-[12px] ${r.acuerdo.estado === "saldado" ? "opacity-50" : ""}`}
                >
                  <span>
                    {r.acuerdo.persona && <span className="text-cdm-muted">{r.acuerdo.persona} — </span>}
                    {r.acuerdo.trabajo}
                    {r.acuerdo.estado === "saldado" && (
                      <span className="font-mono-hud text-[9px] uppercase tracking-widest text-emerald-400"> ✓</span>
                    )}
                  </span>
                  <span className="font-mono-hud flex flex-wrap items-baseline gap-3">
                    <span className="text-[10px] text-cdm-muted">{haceDias(r.ultimoPago)}</span>
                    <span className="text-[11px] text-cdm-muted">
                      arreglado {fmt(Number(r.acuerdo.monto_arreglado), r.acuerdo.moneda)} · pagado{" "}
                      {fmt(r.pagado, r.acuerdo.moneda)} ({r.porcentajePagado}%)
                    </span>
                    <span
                      className={
                        r.saldo < 0 ? "text-red-400" : r.saldo === 0 ? "text-emerald-400" : "text-cdm-accent"
                      }
                    >
                      falta {fmt(r.saldo, r.acuerdo.moneda)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {arreglado > 0 && (
              <div className="mt-2 border-t border-cdm-line/50 pt-2">
                <div className="font-mono-hud flex flex-wrap items-baseline gap-3 text-[11px]">
                  <span className="text-cdm-muted">obra: arreglado {fmt(arreglado)}</span>
                  <span className="text-cdm-muted">pagado {fmt(pagado)}</span>
                  <span className={pct >= 100 ? "text-emerald-400" : "text-cdm-accent"}>{pct}% pagado</span>
                </div>
                {/* La barra se clampa a 100; el número dice la verdad si se pagó de más */}
                <div className="mt-1.5 h-[3px] w-full bg-cdm-line/60">
                  <div
                    className={`h-full ${pct > 100 ? "bg-red-400" : pct === 100 ? "bg-emerald-400" : "bg-cdm-accent"}`}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  />
                </div>
              </div>
            )}
          </section>
          );
        })}

        {acuerdos && grupos.length === 0 && (
          <p className="text-[12px] text-cdm-muted">
            No hay acuerdos {verSaldados ? "" : "abiertos "}todavía — se cargan desde cada obra
            (Mano de obra).
          </p>
        )}

        {acuerdos && grupos.length > 0 && (
          <footer className="font-mono-hud flex items-baseline gap-4 border-t border-cdm-line px-1 pt-3 text-[12px]">
            <span className="text-cdm-muted">TOTAL ADEUDADO (ARS):</span>
            <span className={totalAdeudado < 0 ? "text-red-400" : "text-cdm-accent"}>
              {fmt(totalAdeudado)}
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
