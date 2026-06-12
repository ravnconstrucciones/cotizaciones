"use client";

import { useEffect, useRef } from "react";
import { createNoise2D } from "simplex-noise";
import { GlassFilter } from "./liquid-glass";

/**
 * Fondo del cockpit — iteración 2: Waves (ref. wave-background de 21st.dev),
 * malla de líneas SVG con simplex-noise QUE REACCIONA AL MOUSE.
 *
 * Ganó la competencia contra el NeuroNoise (shader WebGL) de la iteración 1:
 * - Reacciona al cursor → el cockpit se siente vivo (el shader era ambiente puro).
 * - La malla de líneas es ADN RAVN (precisión arquitectónica) vs. humo orgánico.
 * - Misma paleta ley: trazo taupe al 10% sobre #0a0a0a.
 *
 * Adaptaciones de performance sobre el original (que usaba xGap/yGap 8 →
 * ~36k puntos por frame):
 * - Densidad bajada a xGap 18 / yGap 22 → ~4k puntos por frame (~1ms CPU).
 * - prefers-reduced-motion → un solo draw estático, sin RAF ni listeners.
 * - RAF pausado cuando la pestaña está oculta (visibilitychange).
 * - Sin el "pointer-dot" del original (desaparecía detrás de los paneles).
 * - El overlay radial de legibilidad de la iteración 1 se conserva:
 *   el fondo NUNCA gana contra el contenido.
 */

const X_GAP = 18;
const Y_GAP = 22;
const STROKE = "rgba(200, 180, 154, 0.10)";

type Punto = {
  x: number;
  y: number;
  wave: { x: number; y: number };
  cursor: { x: number; y: number; vx: number; vy: number };
};

export function WavesBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const reducirMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

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

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.pageX - bounding.left;
      mouse.y = e.pageY - bounding.top + window.scrollY;
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
      <div ref={containerRef} className="absolute inset-0 overflow-hidden">
        <svg ref={svgRef} className="block h-full w-full" />
      </div>
      {/* Overlay de legibilidad: el contenido siempre gana. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_8%,rgba(10,10,10,0.30)_0%,rgba(10,10,10,0.78)_100%)]" />
      <GlassFilter />
    </div>
  );
}
