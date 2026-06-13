"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OrbitalObra } from "@/components/cockpit/orbital-obra";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { importeGastoObraArs } from "@/lib/cashflow-gastos-obra";
import { DOCUMENTOS_OBRA } from "@/lib/documentos-obra";
import {
  derivarArtefactosObra,
  ordenarAvances,
  type ArchivoObraRow,
  type NodoArtefacto,
} from "@/lib/obra-orbital";
import type { ObraAvance } from "@/types/centro-mando";
import { createClient } from "@/lib/supabase/client";

/**
 * Carpeta orbital de la obra (/obras/[id], id = presupuesto_id — misma
 * convención que /obras/[id]/gastos): los ARTEFACTOS de la obra orbitan el
 * centro (la obra + margen al día). Presupuesto y Diagnóstico salen del mapeo
 * DOCUMENTOS_OBRA + obra_archivos; Fotos del bucket privado vía
 * /api/obra-archivos (las manda Eze por WhatsApp y el bot las encarpeta);
 * Resumen $ de /cashflow/resumen; Gastos linkea al detalle existente.
 */

type GastoRow = { importe: unknown };

type ResumenObra = {
  presupuesto_id: string;
  ingresos_caja: number | null;
  egresos_caja: number | null;
  saldo_caja: number | null;
  margen_al_dia_ars: number | null;
};

export function ObraOrbitalScreen({ presupuestoId }: { presupuestoId: string }) {
  const [nombre, setNombre] = useState<string>("Obra");
  const [nodos, setNodos] = useState<NodoArtefacto[] | null>(null);
  const [margen, setMargen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const supabase = createClient();
      const [pres, gastos, avances, archivosRes, resumen] = await Promise.all([
        supabase
          .from("presupuestos")
          .select("id, nombre_obra, nombre_cliente")
          .eq("id", presupuestoId)
          .maybeSingle(),
        supabase
          .from("presupuestos_gastos")
          .select("importe")
          .eq("presupuesto_id", presupuestoId),
        supabase
          .from("obra_avances")
          .select("*")
          .eq("presupuesto_id", presupuestoId)
          .order("creado_at", { ascending: false }),
        fetch(`/api/obra-archivos?presupuesto_id=${presupuestoId}`, {
          cache: "no-store",
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/cashflow/resumen", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      if (pres.error) {
        setError(pres.error.message);
        return;
      }
      // Gastos/avances son secundarios: si una de esas queries falla, la
      // carpeta igual se arma (cae a lista vacía vía `?? []`). Dejamos rastro
      // en consola sin romper la pantalla por un dato no crítico.
      if (gastos.error) {
        console.error("[obra-orbital] gastos:", gastos.error.message);
      }
      if (avances.error) {
        console.error("[obra-orbital] avances:", avances.error.message);
      }
      setError(null);
      setNombre(
        pres.data?.nombre_obra?.trim() ||
          pres.data?.nombre_cliente?.trim() ||
          "Obra"
      );

      const gastosRows = (gastos.data ?? []) as GastoRow[];
      const gastado = gastosRows.reduce(
        (acc, g) => acc + importeGastoObraArs(g),
        0
      );

      const fila = (resumen?.obras_activas as ResumenObra[] | undefined)?.find(
        (o) => o.presupuesto_id === presupuestoId
      );
      setMargen(fila?.margen_al_dia_ars ?? null);

      setNodos(
        derivarArtefactosObra({
          presupuestoId,
          docsMapeados: DOCUMENTOS_OBRA[presupuestoId] ?? [],
          archivos: (archivosRes?.archivos ?? []) as ArchivoObraRow[],
          avances: ordenarAvances((avances.data ?? []) as ObraAvance[]),
          resumen: fila
            ? {
                ingresos: Number(fila.ingresos_caja) || 0,
                egresos: Number(fila.egresos_caja) || 0,
                saldo: Number(fila.saldo_caja) || 0,
              }
            : null,
          gastado,
          cantGastos: gastosRows.length,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, [presupuestoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  // La carpeta respira en vivo: cada gasto, foto o avance nuevo (bot) recarga.
  useRealtimeTable("presupuestos_gastos", cargar);
  useRealtimeTable("obra_archivos", cargar);
  useRealtimeTable("obra_avances", cargar);

  const borrarFoto = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const r = await fetch("/api/obra-archivos", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!r.ok) return false;
        await cargar();
        return true;
      } catch {
        return false;
      }
    },
    [cargar]
  );

  return (
    <div className="font-grotesk relative flex h-dvh flex-col bg-cdm-bg p-4 text-cdm-fg">
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
            {nombre}
          </h1>
        </div>
        <Link
          href={`/obras/${presupuestoId}/gastos`}
          className="font-mono-hud text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
        >
          [GASTOS] ↑
        </Link>
      </header>

      <div className="relative z-10 min-h-0 flex-1">
        {error && (
          <p className="px-1 pt-4 text-[11px] text-red-400">{error}</p>
        )}
        {!error && !nodos && (
          <div className="px-1 pt-6">
            <SkeletonGlass filas={4} anchos={["w-1/3", "w-1/2", "w-1/4", "w-2/5"]} />
          </div>
        )}
        {nodos && (
          <OrbitalObra
            nodos={nodos}
            obraNombre={nombre}
            margenAlDia={margen}
            onBorrarFoto={borrarFoto}
          />
        )}
      </div>
    </div>
  );
}
