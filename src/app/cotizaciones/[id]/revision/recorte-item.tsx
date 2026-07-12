"use client";

/**
 * Modal de recorte del render por ítem (Tramo B ítem 5, "manual primero").
 * Muestra el render de la cotización (su foto de portada), Eze marca el
 * recuadro del ítem arrastrando y el recorte se corta EN EL BROWSER (canvas,
 * sin dependencias) antes de subirse a /api/cotizaciones/[id]/crops.
 * Si la cotización todavía no tiene render, ofrece subirlo acá mismo
 * (reusa POST /portada, que es la foto base de la tarjeta).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  escalaExport,
  normalizarRect,
  slugItem,
  type RectCrop,
} from "@/lib/cotizador/crops";

type Props = {
  cotizacionId: string;
  itemNombre: string;
  renderUrl: string | null;
  cropUrl: string | null;
  onCerrar: () => void;
  /** Se llama tras guardar/quitar para que la hoja refresque sus thumbnails. */
  onCambio: () => Promise<void> | void;
};

export function RecorteItemModal({
  cotizacionId,
  itemNombre,
  renderUrl,
  cropUrl,
  onCerrar,
  onCambio,
}: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subiendoRender, setSubiendoRender] = useState(false);
  // Imagen del render como object URL local (mismo origen → canvas sin taint).
  const [imgLocal, setImgLocal] = useState<string | null>(null);
  const [rect, setRect] = useState<RectCrop | null>(null);
  const arrastrando = useRef(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const inputRenderRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // Baja el render firmado a un blob local (el canvas necesita mismo origen).
  useEffect(() => {
    let vivo = true;
    let url: string | null = null;
    if (renderUrl) {
      fetch(renderUrl)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("No pude bajar el render."))))
        .then((b) => {
          if (!vivo) return;
          url = URL.createObjectURL(b);
          setImgLocal(url);
        })
        .catch((e: unknown) => {
          if (vivo) setError(e instanceof Error ? e.message : "No pude bajar el render.");
        });
    }
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [renderUrl]);

  /** Coordenadas del puntero en px de la imagen ORIGINAL (no la mostrada). */
  const posEnImagen = useCallback((e: React.PointerEvent): { x: number; y: number } | null => {
    const img = imgRef.current;
    if (!img || img.naturalWidth === 0) return null;
    const box = img.getBoundingClientRect();
    const fx = img.naturalWidth / box.width;
    const fy = img.naturalHeight / box.height;
    return { x: (e.clientX - box.left) * fx, y: (e.clientY - box.top) * fy };
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    const p = posEnImagen(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastrando.current = true;
    setRect({ x: p.x, y: p.y, ancho: 0, alto: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!arrastrando.current) return;
    const p = posEnImagen(e);
    if (!p) return;
    setRect((r) => (r ? { ...r, ancho: p.x - r.x, alto: p.y - r.y } : r));
  }

  function onPointerUp() {
    arrastrando.current = false;
  }

  /** Rect en % de la imagen mostrada, para dibujar el recuadro. */
  function rectVisible(): { left: string; top: string; width: string; height: string } | null {
    const img = imgRef.current;
    if (!rect || !img || img.naturalWidth === 0) return null;
    const norm = {
      x: rect.ancho < 0 ? rect.x + rect.ancho : rect.x,
      y: rect.alto < 0 ? rect.y + rect.alto : rect.y,
      ancho: Math.abs(rect.ancho),
      alto: Math.abs(rect.alto),
    };
    return {
      left: `${(norm.x / img.naturalWidth) * 100}%`,
      top: `${(norm.y / img.naturalHeight) * 100}%`,
      width: `${(norm.ancho / img.naturalWidth) * 100}%`,
      height: `${(norm.alto / img.naturalHeight) * 100}%`,
    };
  }

  async function guardarRecorte() {
    const img = imgRef.current;
    if (!img || !rect) return;
    const zona = normalizarRect(rect, img.naturalWidth, img.naturalHeight);
    if (!zona) {
      setError("Marcá un recuadro más grande sobre el ítem.");
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      const escala = escalaExport(zona.ancho, zona.alto);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(zona.ancho * escala);
      canvas.height = Math.round(zona.alto * escala);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas no disponible en este navegador.");
      ctx.drawImage(
        img,
        zona.x,
        zona.y,
        zona.ancho,
        zona.alto,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.9)
      );
      if (!blob) throw new Error("No pude generar el recorte.");

      const form = new FormData();
      form.append("file", blob, `${slugItem(itemNombre)}.jpg`);
      form.append("item_nombre", itemNombre);
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/crops`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Error al guardar el recorte.");
      await onCambio();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar el recorte.");
    } finally {
      setOcupado(false);
    }
  }

  async function quitarRecorte() {
    setOcupado(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/crops`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_nombre: itemNombre }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Error al quitar el recorte.");
      await onCambio();
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al quitar el recorte.");
    } finally {
      setOcupado(false);
    }
  }

  async function subirRender(file: File) {
    setSubiendoRender(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/portada`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; url?: string | null }
        | null;
      if (!res.ok) throw new Error(json?.error ?? "Error al subir el render.");
      // El padre refresca render_url; mientras tanto lo mostramos ya.
      setImgLocal(URL.createObjectURL(file));
      await onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir el render.");
    } finally {
      setSubiendoRender(false);
    }
  }

  const marco = rectVisible();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Recorte del render — ${itemNombre}`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={onCerrar}
      />
      <div className="cdm-glass relative z-[101] w-full max-w-3xl p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cdm-accent">
            Recorte del render
          </h2>
          <button
            onClick={onCerrar}
            className="cursor-pointer text-sm text-cdm-muted hover:text-cdm-fg"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-xs text-cdm-fg">{itemNombre}</p>

        {!renderUrl && !imgLocal ? (
          <div className="mt-4 border border-dashed border-cdm-line p-6 text-center">
            <p className="text-xs text-cdm-muted">
              Esta cotización todavía no tiene el render cargado. Subilo una vez y
              recortás todos los ítems desde acá.
            </p>
            <input
              ref={inputRenderRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subirRender(f);
                e.target.value = "";
              }}
            />
            <button
              disabled={subiendoRender}
              onClick={() => inputRenderRef.current?.click()}
              className="cdm-chip mt-3 cursor-pointer border border-cdm-accent/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-cdm-accent hover:bg-cdm-accent/10 disabled:opacity-50"
            >
              {subiendoRender ? "Subiendo…" : "Subir render / foto"}
            </button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
              Arrastrá sobre la imagen para marcar el ítem
            </p>
            <div
              className="relative mt-2 max-h-[60vh] touch-none select-none overflow-hidden"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {imgLocal ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={imgRef}
                  src={imgLocal}
                  alt={`Render de la cotización`}
                  draggable={false}
                  className="max-h-[60vh] w-full object-contain"
                />
              ) : (
                <p className="p-6 text-center text-xs text-cdm-muted">Cargando render…</p>
              )}
              {marco && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute border-2 border-cdm-accent bg-cdm-accent/10"
                  style={marco}
                />
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                disabled={ocupado || !rect}
                onClick={() => void guardarRecorte()}
                className="cdm-chip cursor-pointer border border-cdm-accent/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-cdm-accent hover:bg-cdm-accent/10 disabled:opacity-50"
              >
                {ocupado ? "Guardando…" : "Guardar recorte"}
              </button>
              {cropUrl && (
                <button
                  disabled={ocupado}
                  onClick={() => void quitarRecorte()}
                  className="cursor-pointer text-[10px] uppercase tracking-[0.14em] text-cdm-muted hover:text-red-400 disabled:opacity-50"
                >
                  Quitar recorte actual
                </button>
              )}
              <button
                onClick={onCerrar}
                className="cursor-pointer text-[10px] uppercase tracking-[0.14em] text-cdm-muted hover:text-cdm-fg"
              >
                Cancelar
              </button>
              {cropUrl && (
                <span className="ml-auto inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                  Actual
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cropUrl}
                    alt={`Recorte actual de ${itemNombre}`}
                    className="h-9 w-9 border border-cdm-line object-cover"
                  />
                </span>
              )}
            </div>
          </>
        )}

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
