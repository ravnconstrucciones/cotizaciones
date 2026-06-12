"use client";

import type { ReactNode } from "react";

/**
 * Liquid glass del cockpit (referencia: componente "liquid glass" de 21st.dev).
 * Adaptación a dark RAVN — el original usa tintes blancos 0.25/0.5 pensados
 * para fondos claros; acá el lavado es off-white al 6–10% y los highlights
 * inset al 10–15%, para que la superficie "moje" el fondo sin lavar el negro.
 *
 * DOSIFICACIÓN (criterio de la iteración 2): SOLO piezas chicas — el prompt
 * box, los chips de tipo. Los paneles grandes ya tienen .cdm-glass y el
 * filtro de distorsión en superficies grandes deforma la lectura.
 */

type LiquidGlassProps = {
  children: ReactNode;
  /** Posición/radius del wrapper (las capas heredan el radius). */
  className?: string;
  /** Blur del backdrop en px (10–12 para superficies con texto, 3–4 para chips). */
  blur?: number;
  /** Alpha del lavado off-white (rango dark: 0.06–0.10). */
  tint?: number;
};

export function LiquidGlass({
  children,
  className = "",
  blur = 10,
  tint = 0.07,
}: LiquidGlassProps) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Capa 1: distorsión líquida — refracta lo que pasa por detrás. */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 rounded-[inherit]"
        style={{
          backdropFilter: `blur(${blur}px)`,
          WebkitBackdropFilter: `blur(${blur}px)`,
          filter: "url(#glass-distortion)",
          isolation: "isolate",
        }}
      />
      {/* Capa 2: tinte off-white muy bajo en oscuro; en claro el mismo
          alpha se multiplica (--cdm-lg-alpha-boost) para que el vidrio
          sea blanco translúcido visible sobre blanco frío. */}
      <div
        aria-hidden
        className="absolute inset-0 z-10 rounded-[inherit]"
        style={{
          background: `rgb(var(--cdm-lg-tint-rgb) / calc(${tint} * var(--cdm-lg-alpha-boost)))`,
        }}
      />
      {/* Capa 3: highlights inset — el "borde mojado" (tokens por tema:
          blanco brillante arriba / gris-azul abajo en claro). */}
      <div
        aria-hidden
        className="absolute inset-0 z-20 rounded-[inherit]"
        style={{
          boxShadow:
            "inset 1.5px 1.5px 1px 0 var(--cdm-lg-hi-1), inset -1px -1px 1px 1px var(--cdm-lg-hi-2)",
        }}
      />
      <div className="relative z-30 min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Filtro SVG #glass-distortion (feTurbulence + specular + displacement) —
 * la clave del efecto. Se monta UNA vez por vista (lo trae WavesBackdrop,
 * la carcasa de fondo del cockpit). display:none → costo cero hasta que
 * una capa lo referencia.
 */
export function GlassFilter() {
  return (
    <svg style={{ display: "none" }} aria-hidden>
      <filter
        id="glass-distortion"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        filterUnits="objectBoundingBox"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.001 0.005"
          numOctaves="1"
          seed="17"
          result="turbulence"
        />
        <feComponentTransfer in="turbulence" result="mapped">
          <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
          <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
          <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
        </feComponentTransfer>
        <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
        <feSpecularLighting
          in="softMap"
          surfaceScale="5"
          specularConstant="1"
          specularExponent="100"
          lightingColor="#eaf6fb"
          result="specLight"
        >
          <fePointLight x="-200" y="-200" z="300" />
        </feSpecularLighting>
        <feComposite
          in="specLight"
          operator="arithmetic"
          k1="0"
          k2="1"
          k3="1"
          k4="0"
          result="litImage"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="softMap"
          scale="140"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
