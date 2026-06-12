"use client";

import { useEffect, useRef } from "react";
import { createNoise2D } from "simplex-noise";
import { GlassFilter } from "./liquid-glass";

/**
 * Fondo del cockpit — iteración 3: la malla SE VE.
 *
 * El feedback de la iteración 2 fue lapidario: el fondo era casi invisible y
 * el cockpit no se sentía distinto. Cambios de esta pasada:
 * - Trazo cian al 0.18 (antes 0.10) → la malla existe en los primeros 2s.
 * - Gradiente de presencia INVERTIDO: antes oscurecía los bordes (escondía
 *   la malla justo donde no hay paneles); ahora calma el CENTRO (detrás del
 *   contenido) y deja respirar los bordes de la pantalla.
 * - Vignette de profundidad: las esquinas caen a negro → atmósfera de cabina.
 * - Vuelve el "pointer-dot" del original de 21st.dev, ahora con glow cian:
 *   se mueve por refs dentro del mismo RAF (cero re-renders de React).
 *
 * Se conservan las adaptaciones de performance de la iteración 2:
 * - Densidad xGap 18 / yGap 22 → ~4k puntos por frame (~1ms CPU).
 * - prefers-reduced-motion → un solo draw estático, sin RAF, sin dot.
 * - RAF pausado cuando la pestaña está oculta (visibilitychange).
 */

const X_GAP = 18;
const Y_GAP = 22;
const STROKE = "rgba(34, 211, 238, 0.18)";

type Punto = {
  x: number;
  y: number;
  wave: { x: number; y: number };
  cursor: { x: number; y: number; vx: number; vy: number };
};

export function WavesBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    const dot = dotRef.current;
    if (!container || !svg) return;

    // Pedido de Eze (12/06): la malla animada hacía pesada la página en su máquina.
    // El modo estático (un solo draw, sin RAF ni mousemove) pasa a ser el default universal;
    // la atmósfera la siguen dando las masas de niebla CSS, que son baratas.
    const reducirMovimiento = true;

    const noise = createNoise2D();
    const mouse = {
      x: -10,
      y: 0,
      lx: 0,
      ly: 0,
      sx: 0,
      sy: 0,
      v: 0,
      vs: 0,
      a: 0,
      set: false,
    };
    let lines: Punto[][] = [];
    let paths: SVGPathElement[] = [];
    let bounding = container.getBoundingClientRect();
    let raf: number | null = null;

    const setSize = () => {
      bounding = container.getBoundingClientRect();
      svg.style.width = `${bounding.width}px`;
      svg.style.height = `${bounding.height}px`;
    };

    const setLines = () => {
      const { width, height } = bounding;
      lines = [];
      paths.forEach((p) => p.remove());
      paths = [];
      const oWidth = width + 200;
      const oHeight = height + 30;
      const totalLines = Math.ceil(oWidth / X_GAP);
      const totalPoints = Math.ceil(oHeight / Y_GAP);
      const xStart = (width - X_GAP * totalLines) / 2;
      const yStart = (height - Y_GAP * totalPoints) / 2;
      for (let i = 0; i < totalLines; i++) {
        const points: Punto[] = [];
        for (let j = 0; j < totalPoints; j++) {
          points.push({
            x: xStart + X_GAP * i,
            y: yStart + Y_GAP * j,
            wave: { x: 0, y: 0 },
            cursor: { x: 0, y: 0, vx: 0, vy: 0 },
          });
        }
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", STROKE);
        path.setAttribute("stroke-width", "1");
        svg.appendChild(path);
        paths.push(path);
        lines.push(points);
      }
    };

    const movePoints = (time: number) => {
      for (const points of lines) {
        for (const p of points) {
          const move =
            noise((p.x + time * 0.008) * 0.003, (p.y + time * 0.003) * 0.002) *
            8;
          p.wave.x = Math.cos(move) * 12;
          p.wave.y = Math.sin(move) * 6;

          const dx = p.x - mouse.sx;
          const dy = p.y - mouse.sy;
          const d = Math.hypot(dx, dy);
          const l = Math.max(175, mouse.vs);
          if (d < l) {
            const s = 1 - d / l;
            const f = Math.cos(d * 0.001) * s;
            p.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * 0.00035;
            p.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * 0.00035;
          }
          p.cursor.vx += (0 - p.cursor.x) * 0.01;
          p.cursor.vy += (0 - p.cursor.y) * 0.01;
          p.cursor.vx *= 0.95;
          p.cursor.vy *= 0.95;
          p.cursor.x += p.cursor.vx;
          p.cursor.y += p.cursor.vy;
          p.cursor.x = Math.min(50, Math.max(-50, p.cursor.x));
          p.cursor.y = Math.min(50, Math.max(-50, p.cursor.y));
        }
      }
    };

    const moved = (point: Punto, withCursorForce = true) => ({
      x: point.x + point.wave.x + (withCursorForce ? point.cursor.x : 0),
      y: point.y + point.wave.y + (withCursorForce ? point.cursor.y : 0),
    });

    const drawLines = () => {
      lines.forEach((points, lIndex) => {
        if (points.length < 2 || !paths[lIndex]) return;
        const first = moved(points[0], false);
        let d = `M ${first.x} ${first.y}`;
        for (let i = 1; i < points.length; i++) {
          const c = moved(points[i]);
          d += `L ${c.x} ${c.y}`;
        }
        paths[lIndex].setAttribute("d", d);
      });
    };

    const tick = (time: number) => {
      mouse.sx += (mouse.x - mouse.sx) * 0.1;
      mouse.sy += (mouse.y - mouse.sy) * 0.1;
      const dx = mouse.x - mouse.lx;
      const dy = mouse.y - mouse.ly;
      const d = Math.hypot(dx, dy);
      mouse.v = d;
      mouse.vs += (d - mouse.vs) * 0.1;
      mouse.vs = Math.min(100, mouse.vs);
      mouse.lx = mouse.x;
      mouse.ly = mouse.y;
      mouse.a = Math.atan2(dy, dx);
      if (dot) {
        // Punto del cursor con glow cian: sigue la posición suavizada
        // (mouse.sx/sy) por estilo directo — nunca pasa por React.
        dot.style.transform = `translate3d(${mouse.sx}px, ${mouse.sy}px, 0)`;
        dot.style.opacity = mouse.set ? "1" : "0";
      }
      movePoints(time);
      drawLines();
      raf = requestAnimationFrame(tick);
    };

    const onResize = () => {
      setSize();
      setLines();
      if (reducirMovimiento) {
        movePoints(0);
        drawLines();
      }
    };

    // El contenedor es fixed inset-0: clientX/Y mapean directo al viewport
    // (el original usaba pageX + scrollY porque vivía dentro de una sección).
    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX - bounding.left;
      mouse.y = e.clientY - bounding.top;
      if (!mouse.set) {
        mouse.sx = mouse.x;
        mouse.sy = mouse.y;
        mouse.lx = mouse.x;
        mouse.ly = mouse.y;
        mouse.set = true;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
      } else if (raf === null) {
        raf = requestAnimationFrame(tick);
      }
    };

    setSize();
    setLines();

    if (reducirMovimiento) {
      // Textura estática: un solo draw, sin loop ni reacción al mouse.
      movePoints(0);
      drawLines();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(tick);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {/* Atmósfera (iteración 5 — IGLOO): tres masas de niebla azul-gris
          que respiran lentísimo DETRÁS de la malla. El negro plano muere:
          el contenido flota en un espacio con profundidad. */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="cdm-niebla cdm-niebla-a" />
        <div className="cdm-niebla cdm-niebla-b" />
        <div className="cdm-niebla cdm-niebla-c" />
      </div>
      <div ref={containerRef} className="absolute inset-0 overflow-hidden">
        <svg ref={svgRef} className="block h-full w-full" />
        {/* Punto del cursor: dot cian + glow chico, movido por refs en el RAF. */}
        <div
          ref={dotRef}
          className="absolute left-0 top-0 opacity-0 transition-opacity duration-500 will-change-transform"
        >
          <div className="absolute -left-14 -top-14 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.22)_0%,rgba(34,211,238,0.07)_45%,transparent_70%)]" />
          <div className="absolute -left-[2.5px] -top-[2.5px] h-[5px] w-[5px] rounded-full bg-cdm-accent shadow-[0_0_14px_rgba(34,211,238,0.95)]" />
        </div>
      </div>
      {/* Gradiente de presencia: calmo detrás del contenido central,
          la malla respira con fuerza en los bordes de la pantalla. */}
      <div className="absolute inset-0 bg-[radial-gradient(105%_80%_at_50%_42%,rgba(5,8,15,0.62)_0%,rgba(5,8,15,0.34)_55%,rgba(5,8,15,0.04)_100%)]" />
      {/* Vignette de profundidad: las esquinas caen a negro (atmósfera de cabina). */}
      <div className="absolute inset-0 bg-[radial-gradient(135%_115%_at_50%_50%,transparent_58%,rgba(0,0,0,0.46)_100%)]" />
      <GlassFilter />
    </div>
  );
}
