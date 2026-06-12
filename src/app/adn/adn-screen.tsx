"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import type { Referencia } from "@/types/centro-mando";

type Vista = "estetica" | "filosofia";

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const CHIP_ACTIVO =
  "border-cdm-taupe bg-cdm-taupe text-cdm-bg";
const CHIP_IDLE =
  "border-cdm-line text-cdm-muted hover:text-cdm-fg";

/** Vista ADN (spec §7.2): el lineamiento estético y filosófico de Ravn, captura a captura. */
export function AdnScreen() {
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [vista, setVista] = useState<Vista>("estetica");
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/referencias?limit=200", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar el ADN.");
        return;
      }
      setError(null);
      setReferencias(j.referencias ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const esteticas = useMemo(
    () => referencias.filter((r) => r.tipo === "estetica"),
    [referencias]
  );
  const filosofia = useMemo(
    () => referencias.filter((r) => r.tipo === "filosofia"),
    [referencias]
  );
  const etiquetas = useMemo(() => {
    const s = new Set<string>();
    for (const r of esteticas) for (const e of r.etiquetas ?? []) s.add(e);
    return [...s].sort();
  }, [esteticas]);
  const filtradas = etiqueta
    ? esteticas.filter((r) => (r.etiquetas ?? []).includes(etiqueta))
    : esteticas;

  return (
    <div className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <WavesBackdrop />
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="relative pb-3">
          {/* Línea de horizonte detrás del header — mismo lenguaje que historial/obras. */}
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <h1 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
            <span
              aria-hidden
              className="h-[5px] w-[5px] bg-cdm-taupe shadow-[0_0_8px_rgba(200,180,154,0.9)]"
            />
            ADN
          </h1>
        </div>
        <p className="mt-4 text-sm text-cdm-muted">
          La filosofía y la estética de Ravn construyéndose solas, captura a captura.
        </p>

        <div className="mt-6 flex gap-2">
          {(["estetica", "filosofia"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`border px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                vista === v ? CHIP_ACTIVO : CHIP_IDLE
              }`}
            >
              {v === "estetica"
                ? `Estética (${esteticas.length})`
                : `Filosofía (${filosofia.length})`}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-[11px] text-red-400">{error}</p>}
        {!error && cargando && (
          <p className="mt-6 text-[11px] text-cdm-muted">Cargando…</p>
        )}

        {!error && !cargando && vista === "estetica" && (
          <>
            {etiquetas.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setEtiqueta(null)}
                  className={`border px-3 py-1 text-[9px] uppercase tracking-[0.18em] transition-colors ${
                    etiqueta === null ? CHIP_ACTIVO : CHIP_IDLE
                  }`}
                >
                  Todas
                </button>
                {etiquetas.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEtiqueta(e)}
                    className={`border px-3 py-1 text-[9px] uppercase tracking-[0.18em] transition-colors ${
                      etiqueta === e ? CHIP_ACTIVO : CHIP_IDLE
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {filtradas.length === 0 ? (
              <div className="mt-8 flex h-32 items-center justify-center border border-dashed border-cdm-line">
                <span className="px-4 text-center text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
                  Mandale una foto al bot — acá nace el moodboard
                </span>
              </div>
            ) : (
              <div className="mt-6 columns-2 gap-3 md:columns-3 xl:columns-4">
                {filtradas.map((r, i) => (
                  <motion.figure
                    key={r.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.6) }}
                    className="mb-3 break-inside-avoid border border-cdm-line bg-cdm-panel"
                  >
                    {r.imagen_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.imagen_url}
                        alt={r.texto ?? "Referencia estética"}
                        className="w-full"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center border-b border-cdm-line">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
                          Sin imagen
                        </span>
                      </div>
                    )}
                    <figcaption className="px-3 py-2">
                      {r.texto && (
                        <p className="text-[11px] leading-snug text-cdm-fg/85">{r.texto}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {(r.etiquetas ?? []).map((e) => (
                          <button
                            key={e}
                            onClick={() => setEtiqueta(e)}
                            className="border border-cdm-line px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-cdm-taupe transition-colors hover:bg-cdm-taupe hover:text-cdm-bg"
                          >
                            {e}
                          </button>
                        ))}
                        <span className="ml-auto text-[9px] tabular-nums text-cdm-muted">
                          {fmtFecha(r.creado_at)}
                        </span>
                      </div>
                    </figcaption>
                  </motion.figure>
                ))}
              </div>
            )}
          </>
        )}

        {!error && !cargando && vista === "filosofia" && (
          <div className="mx-auto mt-8 max-w-2xl space-y-6">
            {filosofia.length === 0 && (
              <div className="flex h-32 items-center justify-center border border-dashed border-cdm-line">
                <span className="px-4 text-center text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
                  Mandale una frase al bot — acá nace la filosofía
                </span>
              </div>
            )}
            {filosofia.map((r, i) => (
              <motion.blockquote
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.6) }}
                className="border-l-2 border-cdm-taupe pl-4"
              >
                <p className="text-sm italic leading-relaxed text-cdm-fg/90">
                  &ldquo;{r.texto}&rdquo;
                </p>
                <footer className="mt-1.5 text-[9px] uppercase tracking-[0.2em] text-cdm-muted">
                  {r.fuente ? `${r.fuente} · ` : ""}
                  {fmtFecha(r.creado_at)}
                </footer>
              </motion.blockquote>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
