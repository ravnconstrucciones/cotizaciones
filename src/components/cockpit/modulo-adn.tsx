"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "./panel";
import type { Referencia } from "@/types/centro-mando";

/** Módulo 9 (teaser): última referencia estética + última frase (spec §4.9). */
export function ModuloAdn({ className }: { className?: string }) {
  const [ultEstetica, setUltEstetica] = useState<Referencia | null>(null);
  const [ultFilosofia, setUltFilosofia] = useState<Referencia | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/referencias?limit=20", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { referencias: Referencia[] };
      setUltEstetica(j.referencias.find((r) => r.tipo === "estetica") ?? null);
      setUltFilosofia(j.referencias.find((r) => r.tipo === "filosofia") ?? null);
    } catch {
      /* el teaser nunca rompe la home */
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <Panel
      titulo="ADN"
      className={className}
      accion={
        <Link
          href="/adn"
          className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted hover:text-cdm-fg"
        >
          Ver todo →
        </Link>
      }
    >
      <div className="space-y-3">
        {ultEstetica?.imagen_url ? (
          <Link href="/adn" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ultEstetica.imagen_url}
              alt={ultEstetica.texto ?? "Referencia estética"}
              className="h-24 w-full object-cover opacity-90 transition-opacity hover:opacity-100"
            />
          </Link>
        ) : (
          <div className="flex h-24 items-center justify-center border border-dashed border-cdm-line">
            <span className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
              Sin referencias aún
            </span>
          </div>
        )}
        {ultFilosofia?.texto && (
          <blockquote className="border-l-2 border-cdm-taupe pl-3 text-[11px] italic leading-relaxed text-cdm-fg/85">
            &ldquo;{ultFilosofia.texto}&rdquo;
            {ultFilosofia.fuente && (
              <footer className="mt-1 text-[9px] uppercase not-italic tracking-[0.15em] text-cdm-muted">
                {ultFilosofia.fuente}
              </footer>
            )}
          </blockquote>
        )}
      </div>
    </Panel>
  );
}
