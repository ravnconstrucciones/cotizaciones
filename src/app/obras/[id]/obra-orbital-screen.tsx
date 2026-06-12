"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OrbitalObra } from "@/components/cockpit/orbital-obra";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { importeGastoObraArs } from "@/lib/cashflow-gastos-obra";
import {
  derivarOrbitalObra,
  type OrbitalObra as OrbitalData,
} from "@/lib/obra-orbital";
import { createClient } from "@/lib/supabase/client";

/**
 * Vista orbital de la obra (/obras/[id], id = presupuesto_id — misma
 * convención que /obras/[id]/gastos): los rubros del presupuesto orbitan
 * el centro (la obra + margen al día). Datos: presupuestos_items ×
 * catalogo_recetas (presupuestado por rubro), presupuestos_gastos
 * (ejecutado real) y /cashflow/resumen (margen al día de la obra).
 */

type RecetaJoin = { rubro_id: string | null } | { rubro_id: string | null }[] | null;

type ItemRow = {
  cantidad: number | string | null;
  precio_material_congelado: number | string | null;
  precio_mo_congelada: number | string | null;
  recetas: RecetaJoin;
};

type GastoRow = { rubro_id: string | null; importe: unknown };

type ResumenObra = {
  presupuesto_id: string;
  margen_al_dia_ars: number | null;
};

function rubroIdDeJoin(recetas: RecetaJoin): string | null {
  if (recetas == null) return null;
  const r = Array.isArray(recetas) ? recetas[0] : recetas;
  return r?.rubro_id ?? null;
}

export function ObraOrbitalScreen({ presupuestoId }: { presupuestoId: string }) {
  const [nombre, setNombre] = useState<string>("Obra");
  const [orbital, setOrbital] = useState<OrbitalData | null>(null);
  const [margen, setMargen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const supabase = createClient();
      const [pres, items, gastos, rubros, resumen] = await Promise.all([
        supabase
          .from("presupuestos")
          .select("id, nombre_obra, nombre_cliente")
          .eq("id", presupuestoId)
          .maybeSingle(),
        supabase
          .from("presupuestos_items")
          .select(
            "cantidad, precio_material_congelado, precio_mo_congelada, recetas:catalogo_recetas ( rubro_id )"
          )
          .eq("presupuesto_id", presupuestoId),
        supabase
          .from("presupuestos_gastos")
          .select("rubro_id, importe")
          .eq("presupuesto_id", presupuestoId),
        supabase.from("rubros").select("id, nombre"),
        fetch("/cashflow/resumen", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      if (pres.error) {
        setError(pres.error.message);
        return;
      }
      setError(null);
      setNombre(
        pres.data?.nombre_obra?.trim() ||
          pres.data?.nombre_cliente?.trim() ||
          "Obra"
      );

      const nombresRubros: Record<string, string> = {};
      for (const r of (rubros.data ?? []) as { id: string; nombre: string }[]) {
        nombresRubros[String(r.id)] = r.nombre;
      }

      setOrbital(
        derivarOrbitalObra(
          ((items.data ?? []) as unknown as ItemRow[]).map((it) => ({
            cantidad: Number(it.cantidad) || 0,
            precioMaterial: Number(it.precio_material_congelado) || 0,
            precioMo: Number(it.precio_mo_congelada) || 0,
            rubroId: rubroIdDeJoin(it.recetas),
          })),
          ((gastos.data ?? []) as GastoRow[]).map((g) => ({
            rubroId: g.rubro_id,
            importeArs: importeGastoObraArs(g),
          })),
          nombresRubros
        )
      );

      const fila = (resumen?.obras_activas as ResumenObra[] | undefined)?.find(
        (o) => o.presupuesto_id === presupuestoId
      );
      setMargen(fila?.margen_al_dia_ars ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, [presupuestoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  // El orbital respira en vivo: cada gasto nuevo recalcula la energía.
  useRealtimeTable("presupuestos_gastos", cargar);

  return (
    <div className="font-grotesk relative flex h-dvh flex-col bg-cdm-bg p-4 text-cdm-fg">
      <WavesBackdrop />

      <header className="relative z-10 flex items-baseline justify-between gap-3 px-1">
        <div className="flex items-baseline gap-4">
          <Link
            href="/obras"
            className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted transition-colors hover:text-cdm-fg"
          >
            ← Proyectos
          </Link>
          <h1 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
            <span
              aria-hidden
              className="h-[5px] w-[5px] bg-cdm-taupe shadow-[0_0_8px_rgba(200,180,154,0.9)]"
            />
            {nombre}
          </h1>
        </div>
        <Link
          href={`/obras/${presupuestoId}/gastos`}
          className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted transition-colors hover:text-cdm-fg"
        >
          Gastos →
        </Link>
      </header>

      <div className="relative z-10 min-h-0 flex-1">
        {error && (
          <p className="px-1 pt-4 text-[11px] text-red-400">{error}</p>
        )}
        {!error && !orbital && (
          <p className="px-1 pt-4 text-[11px] text-cdm-muted">Cargando…</p>
        )}
        {orbital && orbital.nodos.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-cdm-muted">
              Este presupuesto todavía no tiene rubros cargados.
            </p>
          </div>
        )}
        {orbital && orbital.nodos.length > 0 && (
          <OrbitalObra
            nodos={orbital.nodos}
            obraNombre={nombre}
            margenAlDia={margen}
            gastoSinRubro={orbital.gastoSinRubro}
          />
        )}
      </div>
    </div>
  );
}
