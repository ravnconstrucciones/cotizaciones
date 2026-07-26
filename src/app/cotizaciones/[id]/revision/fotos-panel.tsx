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
  const [errorMarcar, setErrorMarcar] = useState<string | null>(null);
  // Ids con un PATCH en vuelo: mientras esté acá, el botón queda deshabilitado
  // — evita la carrera de dos taps rápidos pisándose la reversión entre sí.
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/cotizaciones/${cotizacionId}/archivos`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok) setFotos((json?.archivos ?? []).filter((a: Foto) => a.url));
  }, [cotizacionId]);

  useEffect(() => { void cargar(); }, [cargar, version]);

  // Optimista, pero si el PATCH no persiste (404/500/red caída) revertimos el
  // toggle local — si no, la UI muestra "marcada" sin que haya pegado en la
  // base, y esa foto sale (o no sale) del documento emitido sin avisar nada.
  async function marcar(f: Foto) {
    if (pendientes.has(f.id)) return; // ya hay un PATCH en vuelo para esta foto
    const valorNuevo = !f.en_propuesta;
    setErrorMarcar(null);
    setPendientes((p) => new Set(p).add(f.id));
    setFotos((fs) => fs?.map((x) => (x.id === f.id ? { ...x, en_propuesta: valorNuevo } : x)) ?? null);
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/archivos/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ en_propuesta: valorNuevo }),
      });
      if (!res.ok) throw new Error("No se pudo guardar el cambio.");
    } catch {
      setFotos((fs) => fs?.map((x) => (x.id === f.id ? { ...x, en_propuesta: f.en_propuesta } : x)) ?? null);
      setErrorMarcar("No se pudo guardar — probá de nuevo.");
    } finally {
      setPendientes((p) => {
        const siguiente = new Set(p);
        siguiente.delete(f.id);
        return siguiente;
      });
    }
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
    <div>
      {errorMarcar && (
        <p className="px-4 pt-3 text-[11px] leading-relaxed text-red-400">{errorMarcar}</p>
      )}
      <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {fotos.map((f) => (
          <li key={f.id} className="group relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url!} alt={f.titulo ?? f.tipo} className="aspect-[4/3] w-full object-cover" />
            <button
              type="button"
              disabled={pendientes.has(f.id)}
              onClick={() => void marcar(f)}
              className={`absolute bottom-1 left-1 border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] backdrop-blur before:absolute before:-inset-2 before:content-[''] disabled:opacity-40 ${
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
    </div>
  );
}
