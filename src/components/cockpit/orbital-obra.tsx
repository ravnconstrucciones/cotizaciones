"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Blocks,
  Brush,
  Droplets,
  Grid2x2,
  Hammer,
  HardHat,
  Layers,
  Lightbulb,
  PaintRoller,
  Plug,
  Ruler,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyInt } from "@/lib/format-currency";
import { formatRubroName } from "@/lib/format-rubro-name";
import type { EstadoNodo, NodoRubro } from "@/lib/obra-orbital";

/**
 * Orbital de obra (ref. radial-orbital-timeline de 21st.dev, re-coloreado a
 * la paleta cdm): los rubros del presupuesto orbitan la obra. El glow de
 * cada nodo crece con su % ejecutado (energy); el centro muestra la obra y
 * su margen al día con glow cian (nada del gradiente violeta original).
 *
 * Diferencias deliberadas con el original:
 * - sin h-screen ni bg-black: vive dentro de la carcasa del cockpit
 * - sin "connected nodes": los rubros no tienen agrupación en la app
 * - auto-rotación respeta prefers-reduced-motion (queda quieta)
 */

const ESTADO_LABEL: Record<EstadoNodo, string> = {
  completed: "Ejecutado",
  "in-progress": "En curso",
  pending: "Pendiente",
};

const ESTADO_BADGE: Record<EstadoNodo, string> = {
  completed: "border-cdm-accent bg-cdm-accent text-cdm-bg",
  "in-progress": "border-cdm-accent/60 bg-transparent text-cdm-accent",
  pending: "border-cdm-line bg-transparent text-cdm-muted",
};

/** Icono por palabra clave del nombre de rubro (fallback casco de obra). */
function iconoRubro(nombre: string): React.ElementType {
  const n = nombre.toLowerCase();
  if (n.includes("pintur")) return PaintRoller;
  if (n.includes("alba")) return Blocks;
  if (n.includes("electr") || n.includes("ilumin"))
    return n.includes("ilumin") ? Lightbulb : Plug;
  if (n.includes("sanitar") || n.includes("plomer") || n.includes("agua"))
    return Droplets;
  if (n.includes("revest") || n.includes("piso") || n.includes("solado"))
    return Grid2x2;
  if (n.includes("demolic")) return Hammer;
  if (n.includes("carpinter") || n.includes("muebl")) return Wrench;
  if (n.includes("yeso") || n.includes("durlock") || n.includes("cielorraso"))
    return Layers;
  if (n.includes("terminac") || n.includes("limpieza")) return Brush;
  if (n.includes("medic") || n.includes("proyect")) return Ruler;
  return HardHat;
}

type OrbitalObraProps = {
  nodos: NodoRubro[];
  obraNombre: string;
  /** Margen al día (propuesta − gastado), null si la obra no tiene propuesta. */
  margenAlDia: number | null;
  /** Plata ejecutada fuera de los rubros (gastos sin rubro_id). */
  gastoSinRubro: number;
};

export function OrbitalObra({
  nodos,
  obraNombre,
  margenAlDia,
  gastoSinRubro,
}: OrbitalObraProps) {
  const reducirMovimiento = useReducedMotion();
  const [expandido, setExpandido] = useState<string | null>(null);
  const [rotacion, setRotacion] = useState(0);
  const [autoRotar, setAutoRotar] = useState(true);
  const [radio, setRadio] = useState(210);
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
    if (!autoRotar || reducirMovimiento) return;
    const timer = setInterval(() => {
      setRotacion((prev) => Number(((prev + 0.25) % 360).toFixed(3)));
    }, 50);
    return () => clearInterval(timer);
  }, [autoRotar, reducirMovimiento]);

  const limpiar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandido(null);
      setAutoRotar(true);
    }
  };

  const alternarNodo = (rubroId: string, index: number) => {
    setExpandido((prev) => {
      const abre = prev !== rubroId;
      setAutoRotar(!abre);
      if (abre) {
        // Centra el nodo abierto abajo (270°) para que el card tenga aire.
        const target = (index / nodos.length) * 360;
        setRotacion(270 - target);
      }
      return abre ? rubroId : null;
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
        {/* Centro: la obra, con glow cian (sin el gradiente violeta original). */}
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
          {gastoSinRubro > 0 && (
            <p className="mt-1 max-w-[8.5rem] text-[8px] leading-tight text-cdm-muted">
              Fuera de rubros: {formatMoneyInt(gastoSinRubro)}
            </p>
          )}
        </div>

        {/* Órbita guía */}
        <div
          className="absolute rounded-full border border-cdm-fg/10"
          style={{ width: radio * 2, height: radio * 2 }}
        />

        {nodos.map((nodo, index) => {
          const pos = posicionNodo(index, nodos.length);
          const abierto = expandido === nodo.rubroId;
          const Icono = iconoRubro(nodo.nombre);
          const glow = nodo.energy * 0.5 + 44;

          return (
            <div
              key={nodo.rubroId}
              className="absolute cursor-pointer transition-all duration-700"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                zIndex: abierto ? 200 : pos.zIndex,
                opacity: abierto ? 1 : pos.opacity,
              }}
              onClick={(e) => {
                e.stopPropagation();
                alternarNodo(nodo.rubroId, index);
              }}
            >
              {/* Halo de energía: crece con el % ejecutado. */}
              <div
                aria-hidden
                className="absolute rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(34,211,238,0.25) 0%, rgba(34,211,238,0) 70%)",
                  width: `${glow}px`,
                  height: `${glow}px`,
                  left: `-${(glow - 40) / 2}px`,
                  top: `-${(glow - 40) / 2}px`,
                }}
              />

              <button
                type="button"
                aria-expanded={abierto}
                aria-label={`Rubro ${formatRubroName(nodo.nombre)}: ${
                  ESTADO_LABEL[nodo.status]
                }, ${nodo.energy}% ejecutado`}
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  abierto
                    ? "scale-150 border-cdm-accent bg-cdm-accent text-cdm-bg shadow-lg shadow-cdm-accent/30"
                    : nodo.status === "completed"
                      ? "border-cdm-accent/70 bg-cdm-bg text-cdm-accent"
                      : "border-cdm-fg/30 bg-cdm-bg text-cdm-fg"
                }`}
              >
                <Icono size={16} />
              </button>

              <div
                className={`absolute top-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] transition-all duration-300 ${
                  abierto ? "scale-110 text-cdm-fg" : "text-cdm-fg/60"
                }`}
              >
                {formatRubroName(nodo.nombre)}
              </div>

              {abierto && (
                <Card className="absolute left-1/2 top-20 w-72 -translate-x-1/2 border-cdm-accent/30 bg-cdm-bg/90 shadow-xl shadow-cdm-accent/10 backdrop-blur-lg">
                  <div className="absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2 bg-cdm-accent/50" />
                  <CardHeader className="pb-1">
                    <div className="flex items-center justify-between">
                      <Badge className={ESTADO_BADGE[nodo.status]}>
                        {ESTADO_LABEL[nodo.status]}
                      </Badge>
                      <span className="font-mono text-[10px] tabular-nums text-cdm-muted">
                        {Math.round(nodo.pctEjecutado)}%
                      </span>
                    </div>
                    <CardTitle className="mt-1">
                      {formatRubroName(nodo.nombre)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-[11px] text-cdm-fg/80">
                    <dl className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-cdm-muted">Presupuestado</dt>
                        <dd className="tabular-nums">
                          {formatMoneyInt(nodo.presupuestado)}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-cdm-muted">Gastado</dt>
                        <dd className="tabular-nums">
                          {formatMoneyInt(nodo.gastado)}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-cdm-muted">Desvío</dt>
                        <dd
                          className={`tabular-nums ${
                            nodo.desvio >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {formatMoneyInt(nodo.desvio)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 border-t border-cdm-line pt-3">
                      <div className="mb-1 flex items-center justify-between text-[10px]">
                        <span className="uppercase tracking-[0.15em] text-cdm-muted">
                          Ejecutado
                        </span>
                        <span className="font-mono tabular-nums">
                          {nodo.energy}%
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-cdm-fg/10">
                        <div
                          className="h-full bg-gradient-to-r from-cdm-deep to-cdm-accent"
                          style={{ width: `${nodo.energy}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
