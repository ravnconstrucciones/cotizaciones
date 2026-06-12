"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";

/**
 * Fondo del cockpit (rediseño futurista): NeuroNoise de
 * @paper-design/shaders-react (los "paper shaders" de 21st.dev) — red de
 * líneas fluidas en la paleta cdm: humo de bronce sobre obsidiana.
 *
 * Reglas de performance:
 * - UN solo canvas WebGL, fijo, detrás de todo (z-0) y pointer-events none.
 * - Lazy (ssr:false): no entra en el bundle inicial ni rompe el SSR.
 * - maxPixelCount capea la resolución del canvas en pantallas grandes.
 * - prefers-reduced-motion → speed 0 (queda como textura estática).
 * - Overlay radial encima: el contenido siempre gana en legibilidad.
 */
const NeuroNoise = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.NeuroNoise),
  { ssr: false }
);

export function ShaderBackdrop() {
  const reducirMovimiento = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <NeuroNoise
        colorFront="#c8b49a"
        colorMid="#574634"
        colorBack="#0a0a0a"
        brightness={0.05}
        contrast={0.34}
        scale={0.9}
        speed={reducirMovimiento ? 0 : 0.35}
        maxPixelCount={1920 * 1080}
        style={{ width: "100%", height: "100%", opacity: 0.55 }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_8%,rgba(10,10,10,0.30)_0%,rgba(10,10,10,0.80)_100%)]" />
    </div>
  );
}
