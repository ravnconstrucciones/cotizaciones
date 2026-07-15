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
 * Mano de obra de la obra (/obras/[id]/mano-obra, id = presupuesto_id).
 * Acuerdos (arreglado/pagado/saldo) + alta/edición (ÚNICA vía de alta — el
 * bot solo paga) + vincular pagos ya cargados (gastos sin mo_acuerdo_id).
 */

const fmt = (n: number, moneda = "ARS") =>
  `${moneda === "USD" ? "US$" : "$"}${Math.round(n).toLocaleString("es-AR")}`;

export function ManoObraScreen({ presupuestoId }: { presupuestoId: string }) {
  const [nombre, setNombre] = useState("Obra");
  const [acuerdos, setAcuerdos] = useState<AcuerdoMO[] | null>(null);
  const [pagos, setPagos] = useState<PagoMO[]>([]);
  const [sueltos, setSueltos] = useState<PagoMO[]>([]); // gastos sin acuerdo, para vincular
  const [error, setError] = useState<string | null>(null);
  // Alta / edición inline
  const [formAbierto, setFormAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [persona, setPersona] = useState("");
  const [trabajo, setTrabajo] = useState("");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Vincular pagos existentes: id del acuerdo en modo "elegir pagos"
  const [vinculando, setVinculando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const supabase = createClient();
      const [pres, acs, gs] = await Promise.all([
        supabase
          .from("presupuestos")
          .select("nombre_obra, nombre_cliente")
          .eq("id", presupuestoId)
          .maybeSingle(),
        supabase
          .from("mo_acuerdos")
          .select("*")
          .eq("presupuesto_id", presupuestoId)
          .order("created_at", { ascending: true }),
        supabase
          .from("presupuestos_gastos")
          .select("id, mo_acuerdo_id, importe, fecha, descripcion, cotizacion_venta_ars_por_usd")
          .eq("presupuesto_id", presupuestoId)
          .order("fecha", { ascending: false }),
      ]);
      if (acs.error) {
        setError(acs.error.message);
        return;
      }
      setError(null);
      setNombre(pres.data?.nombre_obra?.trim() || pres.data?.nombre_cliente?.trim() || "Obra");
      setAcuerdos((acs.data ?? []) as AcuerdoMO[]);
      const todos = (gs.data ?? []) as PagoMO[];
      setPagos(todos.filter((g) => g.mo_acuerdo_id));
      setSueltos(todos.filter((g) => !g.mo_acuerdo_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, [presupuestoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  // Un pago por bot aparece al toque (mismo criterio vivo que el orbital).
  useRealtimeTable("presupuestos_gastos", cargar);
  useRealtimeTable("mo_acuerdos", cargar);

  const resumenes: ResumenAcuerdo[] = useMemo(
    () => resumirAcuerdos(acuerdos ?? [], pagos),
    [acuerdos, pagos],
  );
  const totales = useMemo(() => {
    const abiertos = resumenes.filter(
      (r) => r.acuerdo.estado === "abierto" && r.acuerdo.moneda === "ARS",
    );
    return {
      arreglado: abiertos.reduce((a, r) => a + Number(r.acuerdo.monto_arreglado), 0),
      pagado: abiertos.reduce((a, r) => a + r.pagado, 0),
      saldo: abiertos.reduce((a, r) => a + r.saldo, 0),
    };
  }, [resumenes]);

  const abrirAlta = () => {
    setEditandoId(null);
    setPersona("");
    setTrabajo("");
    setMonto("");
    setFormAbierto(true);
  };
  const abrirEdicion = (a: AcuerdoMO) => {
    setEditandoId(a.id);
    setPersona(a.persona ?? "");
    setTrabajo(a.trabajo);
    setMonto(String(a.monto_arreglado));
    setFormAbierto(true);
  };

  const guardar = useCallback(async () => {
    const montoNum = Number(monto.replace(/\./g, "").replace(",", "."));
    if (!trabajo.trim() || !(montoNum >= 0) || guardando) return;
    setGuardando(true);
    try {
      const supabase = createClient();
      const fila = { persona: persona.trim() || null, trabajo: trabajo.trim(), monto_arreglado: montoNum };
      const { error } = editandoId
        ? await supabase
            .from("mo_acuerdos")
            .update({ ...fila, updated_at: new Date().toISOString() })
            .eq("id", editandoId)
        : await supabase.from("mo_acuerdos").insert({ ...fila, presupuesto_id: presupuestoId });
      if (error) {
        setError(error.message);
        return;
      }
      setFormAbierto(false);
      await cargar();
    } finally {
      setGuardando(false);
    }
  }, [persona, trabajo, monto, editandoId, guardando, presupuestoId, cargar]);

  const setEstado = useCallback(
    async (a: AcuerdoMO, estado: "abierto" | "saldado") => {
      const supabase = createClient();
      const { error } = await supabase
        .from("mo_acuerdos")
        .update({ estado, updated_at: new Date().toISOString() })
        .eq("id", a.id);
      if (error) setError(error.message);
      else await cargar();
    },
    [cargar],
  );

  const vincular = useCallback(
    async (gastoId: string, acuerdoId: string | null) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("presupuestos_gastos")
        .update({ mo_acuerdo_id: acuerdoId })
        .eq("id", gastoId);
      if (error) setError(error.message);
      else await cargar();
    },
    [cargar],
  );

  return (
    <div className="font-grotesk relative flex min-h-dvh flex-col bg-cdm-bg p-4 text-cdm-fg">
      <WavesBackdrop />
      <header className="relative z-10 flex items-baseline justify-between gap-3 px-1">
        <div className="flex items-baseline gap-4">
          <Link
            href={`/obras/${presupuestoId}`}
            className="font-mono-hud text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
          >
            [← OBRA]
          </Link>
          <h1 className="font-mono-hud flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
            MANO DE OBRA — {nombre}
          </h1>
        </div>
        <button
          type="button"
          onClick={abrirAlta}
          className="font-mono-hud border border-cdm-accent/50 bg-cdm-accent/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent hover:text-cdm-bg"
        >
          + ACUERDO
        </button>
      </header>

      <div className="relative z-10 mt-4 flex flex-col gap-3 px-1">
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        {!acuerdos && <SkeletonGlass filas={3} anchos={["w-1/2", "w-1/3", "w-2/5"]} />}

        {formAbierto && (
          <div className="flex flex-col gap-2 border border-cdm-line p-3 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-[10px] uppercase tracking-widest text-cdm-muted">
              Persona / gremio (opcional)
              <input
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                className="border border-cdm-line bg-transparent px-2 py-1.5 text-[13px] normal-case tracking-normal text-cdm-fg focus:border-cdm-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[10px] uppercase tracking-widest text-cdm-muted">
              Trabajo
              <input
                value={trabajo}
                onChange={(e) => setTrabajo(e.target.value)}
                className="border border-cdm-line bg-transparent px-2 py-1.5 text-[13px] normal-case tracking-normal text-cdm-fg focus:border-cdm-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-cdm-muted">
              Arreglado ($)
              <input
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                inputMode="numeric"
                className="w-36 border border-cdm-line bg-transparent px-2 py-1.5 text-[13px] text-cdm-fg focus:border-cdm-accent focus:outline-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={guardando || !trabajo.trim() || !monto.trim()}
                className="font-mono-hud border border-emerald-400/60 px-3 py-1.5 text-[11px] uppercase tracking-widest text-emerald-400 hover:bg-emerald-400 hover:text-cdm-bg disabled:opacity-30"
              >
                {guardando ? "…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setFormAbierto(false)}
                className="font-mono-hud px-2 text-[10px] uppercase tracking-widest text-cdm-muted hover:text-cdm-fg"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {resumenes.map((r) => (
          <div
            key={r.acuerdo.id}
            className={`border p-3 ${r.acuerdo.estado === "saldado" ? "border-cdm-line/50 opacity-60" : "border-cdm-line"}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-3">
                <span className="text-[14px] font-medium">{r.acuerdo.trabajo}</span>
                {r.acuerdo.persona && (
                  <span className="text-[12px] text-cdm-muted">{r.acuerdo.persona}</span>
                )}
                {r.acuerdo.estado === "saldado" && (
                  <span className="font-mono-hud text-[10px] uppercase tracking-widest text-emerald-400">
                    ✓ saldado
                  </span>
                )}
              </div>
              <div className="font-mono-hud flex items-baseline gap-4 text-[12px]">
                <span className="text-cdm-muted">
                  arreglado {fmt(Number(r.acuerdo.monto_arreglado), r.acuerdo.moneda)}
                </span>
                <span className="text-cdm-muted">pagado {fmt(r.pagado, r.acuerdo.moneda)}</span>
                <span
                  className={
                    r.saldo < 0 ? "text-red-400" : r.saldo === 0 ? "text-emerald-400" : "text-cdm-accent"
                  }
                >
                  falta {fmt(r.saldo, r.acuerdo.moneda)}
                </span>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="text-[11px] text-cdm-muted">
                {r.pagos.length
                  ? `${r.pagos.length} pago${r.pagos.length > 1 ? "s" : ""} · último ${r.ultimoPago}`
                  : "sin pagos todavía"}
                {r.pagosSinCotizacion > 0 && (
                  <span className="text-amber-300">
                    {" "}· {r.pagosSinCotizacion} pago(s) USD sin cotización — no suman
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => abrirEdicion(r.acuerdo)}
                className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted hover:text-cdm-accent"
              >
                editar
              </button>
              <button
                type="button"
                onClick={() => setVinculando(vinculando === r.acuerdo.id ? null : r.acuerdo.id)}
                className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted hover:text-cdm-accent"
              >
                {vinculando === r.acuerdo.id ? "cerrar" : "vincular pagos"}
              </button>
              {r.acuerdo.estado === "abierto" ? (
                <button
                  type="button"
                  onClick={() => void setEstado(r.acuerdo, "saldado")}
                  className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted hover:text-emerald-400"
                >
                  saldar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void setEstado(r.acuerdo, "abierto")}
                  className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted hover:text-amber-300"
                >
                  reabrir
                </button>
              )}
            </div>

            {/* Pagos vinculados (desvincular = mo_acuerdo_id → null, el gasto NO se borra) */}
            {r.pagos.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 border-t border-cdm-line/50 pt-2">
                {r.pagos.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="text-cdm-muted">
                      {p.fecha} · {p.descripcion || "pago"}
                    </span>
                    <span className="flex items-baseline gap-3">
                      <span className="font-mono-hud">{fmt(Number(p.importe))}</span>
                      <button
                        type="button"
                        onClick={() => void vincular(p.id, null)}
                        className="font-mono-hud text-[9px] uppercase tracking-widest text-cdm-muted hover:text-red-400"
                      >
                        quitar
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Vincular gastos ya cargados (Baño Correa tiene pagos previos al módulo) */}
            {vinculando === r.acuerdo.id && (
              <ul className="mt-2 flex flex-col gap-1 border-t border-cdm-accent/30 pt-2">
                {sueltos.length === 0 && (
                  <li className="text-[11px] text-cdm-muted">No hay gastos sin acuerdo en esta obra.</li>
                )}
                {sueltos.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="text-cdm-muted">
                      {p.fecha} · {p.descripcion || "gasto"} · {fmt(Number(p.importe))}
                    </span>
                    <button
                      type="button"
                      onClick={() => void vincular(p.id, r.acuerdo.id)}
                      className="font-mono-hud text-[9px] uppercase tracking-widest text-cdm-accent hover:text-emerald-400"
                    >
                      + vincular
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {acuerdos && acuerdos.length === 0 && !formAbierto && (
          <p className="text-[12px] text-cdm-muted">
            Sin acuerdos todavía — cargá el primero con + ACUERDO.
          </p>
        )}

        {acuerdos && acuerdos.length > 0 && (
          <footer className="font-mono-hud flex flex-wrap items-baseline gap-4 border-t border-cdm-line px-1 pt-3 text-[12px]">
            <span className="text-cdm-muted">TOTAL ABIERTO (ARS):</span>
            <span className="text-cdm-muted">arreglado {fmt(totales.arreglado)}</span>
            <span className="text-cdm-muted">pagado {fmt(totales.pagado)}</span>
            <span className={totales.saldo < 0 ? "text-red-400" : "text-cdm-accent"}>
              falta {fmt(totales.saldo)}
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
