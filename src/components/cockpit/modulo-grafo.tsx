"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Panel } from "./panel";
import { SkeletonCifra } from "./skeleton-glass";
import { fetchGrafo, type GrafoVault } from "@/lib/grafo";
import { dibujarGrafo, vistaInicial } from "@/lib/grafo-dibujo";

/**
 * EL GRAFO — el segundo cerebro visible en la home. Mini-preview del grafo de
 * conocimiento del vault (graphify) dibujado en canvas con el layout que ya
 * viene precalculado de /api/grafo: acá es UN dibujo estático (cero física,
 * cero rAF) — data viva, no zombie: se refresca sola con cada
 * `/graphify --update` de la Mac. Tocar la preview abre /grafo.
 */
export function ModuloGrafo({ className }: { className?: string }) {
  const [grafo, setGrafo] = useState<GrafoVault | null>(null);
  const [error, setError] = useState(false);
  const contRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const tema: "dark" | "light" = resolvedTheme === "light" ? "light" : "dark";

  useEffect(() => {
    fetchGrafo().then((g) => (g ? setGrafo(g) : setError(true)));
  }, []);

  const dibujar = useCallback(() => {
    const cont = contRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!cont || !canvas || !ctx || !grafo) return;
    const r = cont.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dibujarGrafo(ctx, grafo, vistaInicial(r.width, r.height), r.width, r.height, {
      tema,
      comunidadActiva: null,
      nodoActivo: null,
      busqueda: null,
      etiquetas: false,
      alpha: 1,
    });
  }, [grafo, tema]);

  useEffect(() => {
    const cont = contRef.current;
    if (!cont || !grafo) return;
    const ro = new ResizeObserver(dibujar);
    ro.observe(cont);
    dibujar();
    return () => ro.disconnect();
  }, [grafo, dibujar]);

  return (
    <Panel
      titulo="El grafo"
      className={className}
      accion={
        <Link
          href="/grafo"
          className="font-mono-hud text-[9px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
        >
          [VER] ↑
        </Link>
      }
    >
      {error && (
        <p className="text-[11px] text-cdm-muted">
          El grafo no está disponible — se genera desde la Mac con /graphify.
        </p>
      )}
      {!grafo && !error && <SkeletonCifra className="mt-2" />}

      {grafo && (
        <>
          <Link
            href="/grafo"
            aria-label="Abrir el grafo de conocimiento completo"
            className="block cursor-pointer"
          >
            <div
              ref={contRef}
              className="relative h-48 overflow-hidden rounded-2xl ring-1 ring-cdm-line transition-opacity hover:opacity-90 sm:h-56"
            >
              <canvas ref={canvasRef} aria-hidden className="h-full w-full" />
            </div>
          </Link>

          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono-hud text-[10px] uppercase tracking-[0.2em] text-cdm-muted">
              {grafo.stats.nodos.toLocaleString("es-AR")} nodos ·{" "}
              {grafo.stats.aristas.toLocaleString("es-AR")} conexiones ·{" "}
              {grafo.stats.comunidades} comunidades
            </p>
            <p className="font-mono-hud text-[9px] uppercase tracking-[0.14em] text-cdm-muted/70">
              vault → {grafo.actualizado}
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}
