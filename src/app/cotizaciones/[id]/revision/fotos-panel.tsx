"use client";

import { useCallback, useEffect, useState } from "react";

type Foto = {
  id: string;
  tipo: string;
  titulo: string | null;
  url: string | null;
  en_propuesta: boolean;
};

/** Pestaña FOTOS: galería de cotizacion_archivos con toggle "va en la propuesta". */
export function FotosPanel({ cotizacionId, version }: { cotizacionId: string; version: number }) {
  const [fotos, setFotos] = useState<Foto[] | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/cotizaciones/${cotizacionId}/archivos`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok) setFotos((json?.archivos ?? []).filter((a: Foto) => a.url));
  }, [cotizacionId]);

  useEffect(() => { void cargar(); }, [cargar, version]);

  async function marcar(f: Foto) {
    setFotos((fs) => fs?.map((x) => (x.id === f.id ? { ...x, en_propuesta: !f.en_propuesta } : x)) ?? null);
    await fetch(`/api/cotizaciones/${cotizacionId}/archivos/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ en_propuesta: !f.en_propuesta }),
    });
  }

  if (fotos === null) return null;
  if (fotos.length === 0) {
    return (
      <p className="p-6 text-[11px] leading-relaxed text-cdm-muted">
        Sin fotos todavía. Arrastrá imágenes del proyecto a cualquier parte de la mesa.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
      {fotos.map((f) => (
        <li key={f.id} className="group relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url!} alt={f.titulo ?? f.tipo} className="aspect-[4/3] w-full object-cover" />
          <button
            type="button"
            onClick={() => void marcar(f)}
            className={`absolute bottom-1 left-1 border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] backdrop-blur before:absolute before:-inset-2 before:content-[''] ${
              f.en_propuesta
                ? "border-cdm-accent/60 bg-cdm-accent/20 text-cdm-accent"
                : "border-cdm-line bg-black/40 text-cdm-muted"
            }`}
          >
            {f.en_propuesta ? "En propuesta ✓" : "Sumar a propuesta"}
          </button>
        </li>
      ))}
    </ul>
  );
}
