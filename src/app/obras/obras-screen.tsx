"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import {
  SeccionProyecto,
  type ProyectoCard,
} from "@/components/cockpit/seccion-proyecto";
import { createClient } from "@/lib/supabase/client";

/**
 * Galería de proyectos (/obras): una sección por obra activa alternando
 * el layout (ref. section-with-mockup de 21st.dev), con la mockup card
 * como mini-dashboard vivo. Datos: /cashflow/resumen (caja, margen,
 * movimientos) + presupuestos (cliente y fecha de inicio).
 */

type ObraResumen = {
  obra_id: string;
  presupuesto_id: string;
  nombre_obra: string;
  saldo_caja: number;
  egresos_caja: number;
  referencia_propuesta_ars: number | null;
  margen_al_dia_ars: number | null;
  cobranza_cerrada?: boolean;
  finalizada: boolean;
};

type MovimientoResumen = {
  obra_id: string;
  tipo: "ingreso" | "egreso";
  descripcion: string;
  monto_real: number;
  fecha_real: string;
};

type PresupuestoMeta = {
  id: string;
  nombre_cliente: string | null;
  fecha: string | null;
};

function estadoDe(o: ObraResumen): { label: string; cls: string } {
  if (o.cobranza_cerrada)
    return { label: "Cobranza cerrada", cls: "text-cdm-taupe" };
  if (o.finalizada) return { label: "Finalizada", cls: "text-amber-300" };
  return { label: "En curso", cls: "text-emerald-400" };
}

function fechaDisplay(iso: string | null): string | null {
  const d = iso?.trim().slice(0, 10);
  if (d && d.length === 10 && d[4] === "-" && d[7] === "-") {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  return null;
}

export function ObrasScreen() {
  const [proyectos, setProyectos] = useState<ProyectoCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/cashflow/resumen", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar el resumen.");
        return;
      }
      const obras = (j.obras_activas ?? []) as ObraResumen[];
      const movimientos = (j.movimientos_recientes ?? []) as MovimientoResumen[];

      // Cliente + fecha de inicio del presupuesto (no vienen en el resumen).
      const metaPorId = new Map<string, PresupuestoMeta>();
      if (obras.length > 0) {
        const supabase = createClient();
        const { data } = await supabase
          .from("presupuestos")
          .select("id, nombre_cliente, fecha")
          .in(
            "id",
            obras.map((o) => o.presupuesto_id)
          );
        for (const p of (data ?? []) as PresupuestoMeta[]) {
          metaPorId.set(p.id, p);
        }
      }

      setError(null);
      setProyectos(
        obras.map((o) => {
          const meta = metaPorId.get(o.presupuesto_id);
          const estado = estadoDe(o);
          return {
            presupuestoId: o.presupuesto_id,
            nombre: o.nombre_obra,
            cliente: meta?.nombre_cliente?.trim() || null,
            estadoLabel: estado.label,
            estadoCls: estado.cls,
            desde: fechaDisplay(meta?.fecha ?? null),
            saldoCaja: o.saldo_caja,
            margenAlDia: o.margen_al_dia_ars,
            pctConsumido:
              o.referencia_propuesta_ars && o.referencia_propuesta_ars > 0
                ? (o.egresos_caja / o.referencia_propuesta_ars) * 100
                : null,
            movimientos: movimientos
              .filter((m) => m.obra_id === o.obra_id)
              .slice(0, 3)
              .map((m) => ({
                descripcion: m.descripcion,
                monto: m.monto_real,
                tipo: m.tipo,
                fecha: m.fecha_real,
              })),
          };
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="font-grotesk relative min-h-screen bg-cdm-bg text-cdm-fg">
      <WavesBackdrop />

      <header className="relative z-10 flex items-baseline justify-between px-6 pt-6 md:px-10">
        <h1 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
          <span
            aria-hidden
            className="h-[5px] w-[5px] bg-cdm-taupe shadow-[0_0_8px_rgba(200,180,154,0.9)]"
          />
          Proyectos
        </h1>
        <Link
          href="/"
          className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted transition-colors hover:text-cdm-fg"
        >
          ← Centro de mando
        </Link>
      </header>

      <div className="relative z-10">
        {error && (
          <p className="px-6 pt-6 text-[11px] text-red-400 md:px-10">{error}</p>
        )}
        {!error && proyectos === null && (
          <p className="px-6 pt-6 text-[11px] text-cdm-muted md:px-10">
            Cargando…
          </p>
        )}
        {proyectos !== null && proyectos.length === 0 && (
          <div className="flex min-h-[60vh] items-center justify-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-cdm-muted">
              Sin obras activas. Aprobá un presupuesto para verla acá.
            </p>
          </div>
        )}
        {proyectos?.map((p, i) => (
          <SeccionProyecto
            key={p.presupuestoId}
            proyecto={p}
            reverseLayout={i % 2 === 1}
          />
        ))}
      </div>
    </div>
  );
}
