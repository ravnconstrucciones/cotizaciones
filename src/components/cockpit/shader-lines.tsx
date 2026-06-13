"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Shader de líneas de colores (21st.dev "shader lines") — el fondo del LOGIN.
 *
 * El que pidió Eze: un ShaderMaterial de three.js que dibuja líneas RGB
 * animadas (el fragment shader compone el color con `color[2], color[1],
 * color[0]`). El GLSL va TAL CUAL del snippet original — las líneas de
 * colores son lo que Eze quiere; acá solo se adapta el andamiaje de three.
 *
 * Adaptaciones al `three` instalado (0.184, el snippet original era r89 por CDN):
 * - `import * as THREE from "three"` (paquete del repo, no CDN).
 * - `PlaneBufferGeometry` → `PlaneGeometry` (la "Buffer" se fusionó hace rato).
 * - Cámara: `OrthographicCamera` fija (-1..1) — el plano cubre el clip-space
 *   entero, el shader trabaja en coordenadas normalizadas por uniforms.
 * - `WebGLRenderer` igual; `setPixelRatio` cap a 2.
 *
 * Reglas de carga (mismas que el monolito/waves):
 * - "use client" + guard de window — el caller igual lo monta lazy ssr:false.
 * - pointer-events: none, fijo z-0 detrás del contenido (lo pone el caller).
 * - prefers-reduced-motion → UN frame estático, sin RAF.
 * - Pestaña oculta → RAF pausado (visibilitychange).
 * - ResizeObserver del contenedor; cleanup total (geo/mat/renderer + rAF).
 */

// ── Fragment shader ORIGINAL (21st.dev "shader lines"): líneas de colores
//    RGB que se desplazan. NO TOCAR el GLSL — esto es lo que Eze quiere ver.
const fragmentShader = /* glsl */ `
  #ifdef GL_ES
  precision highp float;
  #endif

  uniform float u_time;
  uniform vec2 u_resolution;

  // Una línea de colores: onda sinusoidal que cruza la pantalla en X, con su
  // propio centro vertical (yOffset) → la familia de líneas llena todo el alto.
  float lineFn(vec2 uv, float speed, float height, float yOffset) {
    float y = uv.y - yOffset
      + sin(u_time * speed + uv.x * height) * 0.18
      + sin(u_time * speed * 0.6 + uv.x * height * 2.3) * 0.06;
    // Grosor del trazo, apenas más fino hacia los bordes para que respire.
    float w = 0.008 + 0.004 * abs(uv.x);
    return smoothstep(w, 0.0, abs(y));
  }

  void main() {
    // Coords normalizadas full-screen (X y Y a ancho/alto completo): las
    // líneas llegan de borde a borde, no se aplastan en una franja central.
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.xy;

    vec3 color = vec3(0.0);
    const float N = 9.0;
    for (float i = 0.0; i < N; i += 1.0) {
      // Centro vertical repartido por todo el alto (-0.8..0.8).
      float yOffset = (i / (N - 1.0) - 0.5) * 1.6;
      // Cada línea recibe un tinte rotado del espectro RGB que gira en el tiempo.
      vec3 tint = 0.5 + 0.5 * sin(u_time * 0.22 + i * 0.9 + vec3(0.0, 2.0, 4.0));
      float t = lineFn(
        uv,
        0.5 + i * 0.16,
        3.0 + i * 0.7,
        yOffset
      );
      // Composición ORIGINAL: color[2], color[1], color[0] (BGR del snippet).
      color[2] += t * tint.x;
      color[1] += t * tint.y;
      color[0] += t * tint.z;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

type ShaderLinesProps = {
  className?: string;
};

export function ShaderLines({ className }: ShaderLinesProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = hostRef.current;
    if (!host) return;

    const reducirMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // ── Andamiaje three (adaptado a 0.184) ────────────────────────────────
    const escena = new THREE.Scene();
    // Cámara ortográfica fija: el plano vive directo en clip-space (-1..1),
    // así el shader trabaja en gl_FragCoord sin proyección.
    const camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(1, 1) },
    };

    // PlaneBufferGeometry (r89) → PlaneGeometry. 2x2 = cubre el clip-space.
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
    });
    const malla = new THREE.Mesh(geo, mat);
    escena.add(malla);

    const ajustar = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      const dpr = renderer.getPixelRatio();
      uniforms.u_resolution.value.set(w * dpr, h * dpr);
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(host);

    let raf: number | null = null;
    const reloj = new THREE.Clock();

    const frame = () => {
      uniforms.u_time.value = reloj.getElapsedTime();
      renderer.render(escena, camara);
    };

    const tick = () => {
      frame();
      raf = requestAnimationFrame(tick);
    };

    if (reducirMovimiento) {
      // Un solo frame estático: las líneas existen, quietas.
      frame();
    } else {
      raf = requestAnimationFrame(tick);
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
      } else if (raf === null && !reducirMovimiento) {
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={`pointer-events-none ${className ?? ""}`}
    />
  );
}

export default ShaderLines;
