"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StackedObra } from "@/components/cockpit/stacked-obra";
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
 * Carpeta de la obra (/obras/[id], id = presupuesto_id — misma convención que
 * /obras/[id]/gastos): stacked glass cards, una por artefacto (Fotos,
 * Bitácora, Presupuesto, Diagnóstico, Gastos, Resumen $). Reemplaza al
 * orbital v2: Eze quería acceso directo a cada sección y poder cargar fotos
 * y documentos desde el celu. La subida va DIRECTO al bucket con URL firmada
 * (dos pasos vía POST /api/obra-archivos) — el límite de request de Vercel
 * no banca una foto de iPhone.
 */

type GastoRow = { importe: unknown };

type ResumenObra = {
  presupuesto_id: string;
  ingresos_caja: number | null;
  egresos_caja: number | null;
  saldo_caja: number | null;
  margen_al_dia_ars: number | null;
  finalizada?: boolean;
};

const BUCKET = "obra-archivos";
/** Fotos: por encima de esto se re-encodea a JPEG achicado antes de subir. */
const MAX_BYTES_SIN_COMPRIMIR = 1_500_000;
const MAX_LADO_PX = 2048;

/**
 * Achica la foto en el cliente (canvas → JPEG). Si el navegador no puede
 * decodificarla (p. ej. HEIC raro), devuelve el original y que suba igual.
 */
async function comprimirImagen(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_BYTES_SIN_COMPRIMIR) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_LADO_PX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.82)
    );
    if (!blob || blob.size >= file.size) return file;
    const nombre = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function ObraOrbitalScreen({ presupuestoId }: { presupuestoId: string }) {
  const [nombre, setNombre] = useState<string>("Obra");
  const [nodos, setNodos] = useState<NodoArtefacto[] | null>(null);
  const [margen, setMargen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finalizada, setFinalizada] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [confirmCerrar, setConfirmCerrar] = useState(false);

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
      setFinalizada(Boolean(fila?.finalizada));

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

  // Subida desde el celu: firmar → subir directo al bucket → confirmar fila.
  const subirArchivo = useCallback(
    async (file: File, tipo: "foto" | "documento"): Promise<string | null> => {
      try {
        const listo = tipo === "foto" ? await comprimirImagen(file) : file;
        const rFirma = await fetch("/api/obra-archivos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paso: "firmar",
            presupuesto_id: presupuestoId,
            tipo,
            filename: listo.name,
          }),
        });
        const firma = (await rFirma.json().catch(() => ({}))) as {
          path?: string;
          token?: string;
          error?: string;
        };
        if (!rFirma.ok || !firma.path || !firma.token) {
          return firma.error ?? "No se pudo firmar la subida.";
        }

        const supabase = createClient();
        const up = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(firma.path, firma.token, listo, {
            contentType: listo.type || "application/octet-stream",
          });
        if (up.error) return up.error.message;

        const rConf = await fetch("/api/obra-archivos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paso: "confirmar",
            presupuesto_id: presupuestoId,
            tipo,
            titulo: file.name,
            storage_path: firma.path,
          }),
        });
        if (!rConf.ok) {
          const j = (await rConf.json().catch(() => ({}))) as { error?: string };
          return j.error ?? "Subió pero no se pudo asentar la fila.";
        }
        await cargar();
        return null;
      } catch {
        return "Error de red al subir.";
      }
    },
    [presupuestoId, cargar]
  );

  // Agregar avance (la card Bitácora maneja el input; el bot también mete
  // avances por WhatsApp).
  const agregarAvance = useCallback(
    async (texto: string): Promise<boolean> => {
      const supabase = createClient();
      const { error } = await supabase
        .from("obra_avances")
        .insert({ presupuesto_id: presupuestoId, texto });
      if (error) {
        setError(error.message);
        return false;
      }
      await cargar();
      return true;
    },
    [presupuestoId, cargar]
  );

  // Pedir diagnóstico: encola el trabajo; la Mac arma el HTML (formato
  // oficial) y lo adjunta a la obra → aparece en la card Diagnóstico.
  const pedirDiagnostico = useCallback(
    async (detalle: string): Promise<string> => {
      try {
        const res = await fetch(`/api/obras/${presupuestoId}/diagnostico`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ detalle }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return `⚠ ${j.error ?? "No se pudo pedir el diagnóstico."}`;
        return "🩺 Tomado. La Mac lo está armando — aparece acá cuando esté listo.";
      } catch {
        return "⚠ Error de red al pedir el diagnóstico.";
      }
    },
    [presupuestoId]
  );

  // Cerrar obra (finalizar): setea finalizada_at vía el endpoint existente.
  const cerrarObra = useCallback(async () => {
    if (cerrando) return;
    setCerrando(true);
    try {
      const res = await fetch(`/api/obras/${presupuestoId}/finalizar`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudo cerrar la obra.");
        return;
      }
      setConfirmCerrar(false);
      await cargar();
    } finally {
      setCerrando(false);
    }
  }, [cerrando, presupuestoId, cargar]);

  return (
    <div className="font-grotesk relative flex h-dvh flex-col bg-cdm-bg p-4 text-cdm-fg">
      <WavesBackdrop />

      <header className="relative z-10 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 px-1 pb-2">
        <div className="flex min-w-0 items-baseline gap-4">
          <Link
            href="/obras"
            className="font-mono-hud shrink-0 text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
          >
            [← PROYECTOS]
          </Link>
          <h1 className="font-mono-hud flex min-w-0 items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="shrink-0 text-cdm-accent/60">{"//////"}</span>
            <span className="truncate">{nombre}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/obras/${presupuestoId}/plan`}
            className="font-mono-hud border border-cdm-accent/50 bg-cdm-accent/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent hover:text-cdm-bg"
          >
            PLAN Y CRUCE ↑
          </Link>
          <Link
            href={`/obras/${presupuestoId}/mano-obra`}
            className="font-mono-hud text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
          >
            [MANO DE OBRA] ↑
          </Link>
        </div>
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
          <StackedObra
            nodos={nodos}
            margenAlDia={margen}
            onBorrarFoto={borrarFoto}
            onSubirArchivo={subirArchivo}
            onAgregarAvance={agregarAvance}
            onPedirDiagnostico={pedirDiagnostico}
          />
        )}
      </div>

      {/* Cierre de obra — lo único que queda fuera de las cards. */}
      {nodos && (
        <footer className="relative z-10 mt-2 flex items-center gap-2 border-t border-cdm-line px-1 pt-3">
          {finalizada ? (
            <span className="font-mono-hud text-[10px] uppercase tracking-[0.18em] text-emerald-400">
              ✓ Obra cerrada
            </span>
          ) : confirmCerrar ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void cerrarObra()}
                disabled={cerrando}
                className="font-mono-hud border border-amber-300/60 bg-amber-300/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-amber-300 transition-colors hover:bg-amber-300 hover:text-cdm-bg disabled:opacity-40"
              >
                {cerrando ? "Cerrando…" : "Confirmar cierre"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCerrar(false)}
                className="font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted hover:text-cdm-fg"
              >
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCerrar(true)}
              className="font-mono-hud border border-cdm-line px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:border-amber-300/60 hover:text-amber-300"
            >
              Cerrar obra
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
