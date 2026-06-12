"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Camera,
  CircleDollarSign,
  ExternalLink,
  FileSearch,
  FileText,
  NotebookPen,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyInt } from "@/lib/format-currency";
import type { FotoNodo, NodoArtefacto, TipoArtefacto } from "@/lib/obra-orbital";

/**
 * Orbital de obra v2 (ref. radial-orbital-timeline de 21st.dev, paleta cdm):
 * los ARTEFACTOS de la carpeta de la obra orbitan el centro (la obra + margen
 * al día). Nodo vivo = tiene contenido real (glow cian); vacío = tenue.
 *
 * Reconversión 2026-06: antes orbitaban los rubros del presupuesto y Eze no
 * los entendía ("¿qué es lo de loseta?"). Ahora: Presupuesto, Diagnóstico,
 * Fotos (grilla de miniaturas + lightbox + borrar), Resumen $ y Gastos.
 * El centro queda igual. La mecánica visual (auto-rotación, expansión,
 * profundidad) es la misma que a Eze le gusta.
 */

const ICONO: Record<TipoArtefacto, React.ElementType> = {
  presupuesto: FileText,
  diagnostico: FileSearch,
  fotos: Camera,
  bitacora: NotebookPen,
  resumen: CircleDollarSign,
  gastos: Receipt,
};

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type OrbitalObraProps = {
  nodos: NodoArtefacto[];
  obraNombre: string;
  /** Margen al día (propuesta − gastado), null si la obra no tiene propuesta. */
  margenAlDia: number | null;
  /** Borra una foto (archivo + fila). Devuelve true si salió bien. */
  onBorrarFoto: (id: string) => Promise<boolean>;
};

/** Miniatura lazy: intenta la transformación de Storage y cae al original. */
function Miniatura({ foto, onClick }: { foto: FotoNodo; onClick: () => void }) {
  const [src, setSrc] = useState(foto.thumbUrl ?? foto.url);
  if (!src) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={foto.titulo ?? "Foto de obra"}
      className="block aspect-square w-full overflow-hidden border border-cdm-line bg-cdm-fg/5 transition-opacity hover:opacity-80"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL efímera, fuera del optimizador */}
      <img
        src={src}
        alt={foto.titulo ?? "Foto de obra"}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => {
          if (foto.url && src !== foto.url) setSrc(foto.url);
        }}
      />
    </button>
  );
}

function Lightbox({
  foto,
  borrando,
  onBorrar,
  onCerrar,
}: {
  foto: FotoNodo;
  borrando: boolean;
  onBorrar: () => void;
  onCerrar: () => void;
}) {
  const [armado, setArmado] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-cdm-bg/95 backdrop-blur-md"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={foto.titulo ?? "Foto de obra"}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono-hud min-w-0 truncate text-[10px] uppercase tracking-[0.18em] text-cdm-muted">
          {foto.titulo ?? "Foto de obra"}
          {foto.creadoAt && (
            <span className="ml-3 text-cdm-muted/60">
              {new Date(foto.creadoAt).toLocaleDateString("es-AR")}
            </span>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={borrando}
            onClick={() => (armado ? onBorrar() : setArmado(true))}
            className={`font-mono-hud flex items-center gap-1.5 border px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] transition-colors disabled:opacity-40 ${
              armado
                ? "border-red-400 bg-red-400/10 text-red-400"
                : "border-cdm-line text-cdm-muted hover:border-red-400/60 hover:text-red-400"
            }`}
          >
            <Trash2 size={12} />
            {borrando ? "Borrando…" : armado ? "Confirmar borrado" : "Borrar"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="border border-cdm-line p-1.5 text-cdm-muted transition-colors hover:border-cdm-accent hover:text-cdm-accent"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {foto.url && (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL efímera
          <img
            src={foto.url}
            alt={foto.titulo ?? "Foto de obra"}
            className="max-h-full max-w-full border border-cdm-line object-contain shadow-[0_0_80px_rgba(34,211,238,0.12)]"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
}

export function OrbitalObra({
  nodos,
  obraNombre,
  margenAlDia,
  onBorrarFoto,
}: OrbitalObraProps) {
  const reducirMovimiento = useReducedMotion();
  const [expandido, setExpandido] = useState<TipoArtefacto | null>(null);
  const [rotacion, setRotacion] = useState(0);
  const [autoRotar, setAutoRotar] = useState(true);
  const [radio, setRadio] = useState(210);
  const [lightbox, setLightbox] = useState<FotoNodo | null>(null);
  const [borrando, setBorrando] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);

  // Radio responsive: en pantallas angostas la órbita se achica para que
  // los nodos no queden recortados (el original fijaba 200 y desbordaba).
  useEffect(() => {
    const medir = () => {
      const w = containerRef.current?.clientWidth ?? 0;
      if (w > 0) setRadio(Math.max(120, Math.min(210, w / 2 - 70)));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  useEffect(() => {
    if (!autoRotar || reducirMovimiento || lightbox) return;
    const timer = setInterval(() => {
      setRotacion((prev) => Number(((prev + 0.25) % 360).toFixed(3)));
    }, 50);
    return () => clearInterval(timer);
  }, [autoRotar, reducirMovimiento, lightbox]);

  const limpiar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandido(null);
      setAutoRotar(true);
    }
  };

  const alternarNodo = (tipo: TipoArtefacto, index: number) => {
    setExpandido((prev) => {
      const abre = prev !== tipo;
      setAutoRotar(!abre);
      if (abre) {
        // Centra el nodo abierto abajo (270°) para que el card tenga aire.
        const target = (index / nodos.length) * 360;
        setRotacion(270 - target);
      }
      return abre ? tipo : null;
    });
  };

  const posicionNodo = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotacion) % 360;
    const radian = (angle * Math.PI) / 180;
    const x = radio * Math.cos(radian);
    const y = radio * Math.sin(radian);
    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = Math.max(
      0.45,
      Math.min(1, 0.45 + 0.55 * ((1 + Math.sin(radian)) / 2))
    );
    return { x, y, zIndex, opacity };
  };

  const borrarFoto = async (id: string) => {
    setBorrando(true);
    try {
      const ok = await onBorrarFoto(id);
      if (ok) setLightbox(null);
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={limpiar}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      <div
        ref={orbitRef}
        className="absolute flex h-full w-full items-center justify-center"
        style={{ perspective: "1000px" }}
      >
        {/* Centro: la obra, con glow cian — queda igual que siempre. */}
        <div className="absolute z-10 flex h-40 w-40 flex-col items-center justify-center rounded-full border border-cdm-accent/30 bg-cdm-bg/80 text-center shadow-[0_0_60px_rgba(34,211,238,0.18)] backdrop-blur-md">
          {!reducirMovimiento && (
            <>
              <div className="absolute h-44 w-44 animate-ping rounded-full border border-cdm-accent/15 opacity-70" />
              <div
                className="absolute h-52 w-52 animate-ping rounded-full border border-cdm-accent/10 opacity-50"
                style={{ animationDelay: "0.6s" }}
              />
            </>
          )}
          <p className="line-clamp-2 max-w-[9rem] break-words px-2 text-[10px] font-semibold uppercase leading-snug tracking-[0.08em] text-cdm-fg">
            {obraNombre}
          </p>
          <p className="mt-2 text-[8px] uppercase tracking-[0.25em] text-cdm-muted">
            Margen al día
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              margenAlDia == null
                ? "text-cdm-muted"
                : margenAlDia >= 0
                  ? "text-cdm-accent"
                  : "text-red-400"
            }`}
          >
            {margenAlDia == null ? "sin propuesta" : formatMoneyInt(margenAlDia)}
          </p>
        </div>

        {/* Órbita guía */}
        <div
          className="absolute rounded-full border border-cdm-fg/10"
          style={{ width: radio * 2, height: radio * 2 }}
        />

        {nodos.map((nodo, index) => {
          const pos = posicionNodo(index, nodos.length);
          const abierto = expandido === nodo.tipo;
          const Icono = ICONO[nodo.tipo];

          return (
            <div
              key={nodo.tipo}
              className="absolute cursor-pointer transition-all duration-700"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                zIndex: abierto ? 200 : pos.zIndex,
                // Nodo vacío: orbita tenue, sin protagonismo.
                opacity: abierto ? 1 : pos.opacity * (nodo.vivo ? 1 : 0.45),
              }}
              onClick={(e) => {
                e.stopPropagation();
                alternarNodo(nodo.tipo, index);
              }}
            >
              {/* Halo de energía: solo los nodos con contenido real respiran. */}
              {nodo.vivo && (
                <div
                  aria-hidden
                  className="absolute rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(34,211,238,0.25) 0%, rgba(34,211,238,0) 70%)",
                    width: "92px",
                    height: "92px",
                    left: "-26px",
                    top: "-26px",
                  }}
                />
              )}

              <button
                type="button"
                aria-expanded={abierto}
                aria-label={`${nodo.nombre}: ${nodo.vivo ? nodo.detalle ?? "con contenido" : "vacío"}`}
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  abierto
                    ? "scale-150 border-cdm-accent bg-cdm-accent text-cdm-bg shadow-lg shadow-cdm-accent/30"
                    : nodo.vivo
                      ? "border-cdm-accent/70 bg-cdm-bg text-cdm-accent"
                      : "border-cdm-fg/25 bg-cdm-bg text-cdm-fg/50"
                }`}
              >
                <Icono size={16} />
              </button>

              <div
                className={`absolute top-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-center transition-all duration-300 ${
                  abierto ? "scale-110" : ""
                }`}
              >
                <div
                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    abierto
                      ? "text-cdm-fg"
                      : nodo.vivo
                        ? "text-cdm-fg/60"
                        : "text-cdm-fg/30"
                  }`}
                >
                  {nodo.nombre}
                </div>
                {nodo.detalle && (
                  <div className="mt-0.5 text-[8px] uppercase tracking-[0.2em] text-cdm-muted">
                    {nodo.detalle}
                  </div>
                )}
              </div>

              {abierto && (
                <Card
                  className={`absolute left-1/2 top-20 -translate-x-1/2 border-cdm-accent/30 bg-cdm-bg/90 shadow-xl shadow-cdm-accent/10 backdrop-blur-lg ${
                    nodo.tipo === "fotos" || nodo.tipo === "bitacora"
                      ? "w-80"
                      : "w-72"
                  }`}
                >
                  <div className="absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2 bg-cdm-accent/50" />
                  <CardHeader className="pb-1">
                    <div className="flex items-center justify-between">
                      <Badge
                        className={
                          nodo.vivo
                            ? "border-cdm-accent/60 bg-transparent text-cdm-accent"
                            : "border-cdm-line bg-transparent text-cdm-muted"
                        }
                      >
                        {nodo.vivo ? nodo.detalle ?? "Cargado" : "Vacío"}
                      </Badge>
                    </div>
                    <CardTitle className="mt-1">{nodo.nombre}</CardTitle>
                  </CardHeader>
                  <CardContent
                    className="text-[11px] text-cdm-fg/80"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Presupuesto / Diagnóstico: documentos abribles */}
                    {(nodo.tipo === "presupuesto" || nodo.tipo === "diagnostico") &&
                      (nodo.docs.length > 0 ? (
                        <ul className="space-y-1.5">
                          {nodo.docs.map((d) => (
                            <li key={d.url}>
                              <a
                                href={d.url}
                                target="_blank"
                                rel="noreferrer"
                                className="group flex items-center justify-between gap-2 border border-cdm-line px-3 py-2 transition-colors hover:border-cdm-accent/60 hover:text-cdm-accent"
                              >
                                <span className="min-w-0 truncate">{d.label}</span>
                                <ExternalLink
                                  size={11}
                                  className="shrink-0 text-cdm-muted group-hover:text-cdm-accent"
                                />
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="py-2 text-[10px] uppercase tracking-[0.15em] text-cdm-muted">
                          {nodo.tipo === "presupuesto"
                            ? "Sin presupuesto cargado."
                            : "Sin diagnóstico cargado."}
                        </p>
                      ))}

                    {/* Fotos: grilla de miniaturas lazy + lightbox */}
                    {nodo.tipo === "fotos" &&
                      (nodo.fotos.length > 0 ? (
                        <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
                          {nodo.fotos.map((f) => (
                            <Miniatura
                              key={f.id}
                              foto={f}
                              onClick={() => setLightbox(f)}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="py-2 text-[10px] uppercase tracking-[0.15em] text-cdm-muted">
                          Sin fotos todavía — mandalas por WhatsApp y se
                          encarpetan solas.
                        </p>
                      ))}

                    {/* Bitácora: historial completo de avances, nuevo → viejo,
                        mono. El último (arriba) en verde — es el que pinta
                        la card del proyecto. */}
                    {nodo.tipo === "bitacora" &&
                      (nodo.avances.length > 0 ? (
                        <ul className="font-mono-hud max-h-56 space-y-2 overflow-y-auto pr-0.5">
                          {nodo.avances.map((a, i) => (
                            <li
                              key={a.id}
                              className={`border-l-2 pl-2.5 ${
                                i === 0
                                  ? "border-emerald-400"
                                  : "border-cdm-line"
                              }`}
                            >
                              <p className="text-[9px] uppercase tracking-[0.18em] text-cdm-muted">
                                <span className="tabular-nums">
                                  {fechaCorta(a.creadoAt)}
                                </span>
                                {a.instancia && (
                                  <span className="ml-2 text-cdm-accent/80">
                                    {a.instancia}
                                  </span>
                                )}
                              </p>
                              <p
                                className={`mt-0.5 text-[11px] leading-snug ${
                                  i === 0
                                    ? "text-emerald-400 light:text-emerald-600"
                                    : "text-cdm-fg/80"
                                }`}
                              >
                                {a.texto}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="py-2 text-[10px] uppercase tracking-[0.15em] text-cdm-muted">
                          Sin avances todavía — cargalos desde la card del
                          proyecto o por WhatsApp.
                        </p>
                      ))}

                    {/* Resumen $: ingreso / egreso / saldo, como está en el resumen */}
                    {nodo.tipo === "resumen" &&
                      (nodo.resumen ? (
                        <dl className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-cdm-muted">Ingresos</dt>
                            <dd className="tabular-nums text-cdm-accent">
                              {formatMoneyInt(nodo.resumen.ingresos)}
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-cdm-muted">Egresos</dt>
                            <dd className="tabular-nums">
                              {formatMoneyInt(nodo.resumen.egresos)}
                            </dd>
                          </div>
                          <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-cdm-line pt-2">
                            <dt className="text-cdm-muted">Saldo</dt>
                            <dd
                              className={`font-semibold tabular-nums ${
                                nodo.resumen.saldo >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {formatMoneyInt(nodo.resumen.saldo)}
                            </dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="py-2 text-[10px] uppercase tracking-[0.15em] text-cdm-muted">
                          La obra todavía no está en el resumen de caja.
                        </p>
                      ))}

                    {/* Gastos: total ejecutado + link al detalle existente */}
                    {nodo.tipo === "gastos" && (
                      <>
                        <dl className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-cdm-muted">Ejecutado</dt>
                            <dd className="tabular-nums">
                              {formatMoneyInt(nodo.gastado ?? 0)}
                            </dd>
                          </div>
                        </dl>
                        {nodo.href && (
                          <Link
                            href={nodo.href}
                            className="font-mono-hud mt-3 flex items-center justify-center gap-2 border border-cdm-accent/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-cdm-accent transition-colors hover:bg-cdm-accent hover:text-cdm-bg"
                          >
                            Ver gastos →
                          </Link>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>

      {lightbox && (
        <Lightbox
          foto={lightbox}
          borrando={borrando}
          onBorrar={() => void borrarFoto(lightbox.id)}
          onCerrar={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
