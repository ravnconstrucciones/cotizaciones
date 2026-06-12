"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Monolito RAVN (iteración 5 — IGLOO, punto 3D): un prisma oscuro flotando
 * en la niebla con luz cian rozándolo. Rotación lentísima, polvo en
 * suspensión, fog de three que lo funde con la atmósfera CSS de atrás.
 *
 * Reglas de carga (no negociables):
 * - Solo vía next/dynamic ssr:false (el caller decide dónde).
 * - pointer-events: none — nunca roba interacción.
 * - prefers-reduced-motion → UN frame estático, sin RAF.
 * - Pestaña oculta → RAF pausado (visibilitychange).
 * - Cleanup completo: dispose de geometría/material/renderer al desmontar.
 */

type MonolitoProps = {
  className?: string;
  /** Composición: centro (login) o corrido a la derecha (ADN). */
  posicion?: "centro" | "derecha";
  /** Opacidad del canvas (el caller gradúa cuánto pesa en la escena). */
  opacidad?: number;
};

export function Monolito3D({
  className,
  posicion = "centro",
  opacidad = 1,
}: MonolitoProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reducirMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const escena = new THREE.Scene();
    // La niebla de three arranca del MISMO azul-gris del fondo CSS: el
    // monolito se funde con la atmósfera en vez de flotar recortado.
    escena.fog = new THREE.FogExp2(0x05080f, 0.19);

    const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
    camara.position.set(0, 0.1, 3.4);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    // ── El monolito: rounded-rect extruido con bevel chico — las aristas
    //    biseladas son las que ATRAPAN la luz cian (sin bevel parece caja
    //    de tutorial; con bevel parece tallado).
    const ancho = 0.56;
    const alto = 1.62;
    const radio = 0.02;
    const forma = new THREE.Shape();
    forma.moveTo(-ancho / 2 + radio, -alto / 2);
    forma.lineTo(ancho / 2 - radio, -alto / 2);
    forma.quadraticCurveTo(ancho / 2, -alto / 2, ancho / 2, -alto / 2 + radio);
    forma.lineTo(ancho / 2, alto / 2 - radio);
    forma.quadraticCurveTo(ancho / 2, alto / 2, ancho / 2 - radio, alto / 2);
    forma.lineTo(-ancho / 2 + radio, alto / 2);
    forma.quadraticCurveTo(-ancho / 2, alto / 2, -ancho / 2, alto / 2 - radio);
    forma.lineTo(-ancho / 2, -alto / 2 + radio);
    forma.quadraticCurveTo(-ancho / 2, -alto / 2, -ancho / 2 + radio, -alto / 2);

    const geo = new THREE.ExtrudeGeometry(forma, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 6,
    });
    geo.center();

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1119,
      metalness: 0.92,
      roughness: 0.34,
      clearcoat: 0.55,
      clearcoatRoughness: 0.3,
    });
    const monolito = new THREE.Mesh(geo, mat);
    const xBase = posicion === "derecha" ? 1.1 : 0;
    monolito.position.x = xBase;
    monolito.rotation.x = 0.04;
    monolito.rotation.z = -0.045; // levemente fuera de eje: flota, no posa
    escena.add(monolito);

    // ── Luz: cian rasante desde la derecha (las caras frontales quedan en
    //    sombra, solo las aristas atrapan luz), rim azul hielo desde
    //    atrás-izquierda, relleno casi nulo.
    const key = new THREE.DirectionalLight(0x22d3ee, 7);
    key.position.set(3.2, 1.5, 0.6);
    escena.add(key);
    const rim = new THREE.DirectionalLight(0x7dd3fc, 3.4);
    rim.position.set(-2.6, -0.6, -2.2);
    escena.add(rim);
    escena.add(new THREE.AmbientLight(0x12202e, 1.4));

    // ── Polvo en suspensión: puntos cian apenas visibles, deriva lenta.
    const N = 130;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = xBase + (Math.random() - 0.5) * 4.5;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2.6;
    }
    const geoPolvo = new THREE.BufferGeometry();
    geoPolvo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const matPolvo = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.012,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const polvo = new THREE.Points(geoPolvo, matPolvo);
    escena.add(polvo);

    const ajustar = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(host);

    let raf: number | null = null;
    const reloj = new THREE.Clock();
    let t = 0;

    const frame = () => {
      const dt = Math.min(reloj.getDelta(), 0.05);
      t += dt;
      // Rotación lentísima + flotación apenas perceptible: presencia, no show.
      monolito.rotation.y += dt * 0.07;
      monolito.position.y = Math.sin(t * 0.28) * 0.05;
      polvo.rotation.y += dt * 0.008;
      polvo.position.y = Math.sin(t * 0.1) * 0.08;
      renderer.render(escena, camara);
    };

    const tick = () => {
      frame();
      raf = requestAnimationFrame(tick);
    };

    if (reducirMovimiento) {
      // Un solo frame: el monolito existe, quieto en la niebla.
      monolito.rotation.y = 0.55;
      renderer.render(escena, camara);
    } else {
      monolito.rotation.y = 0.35;
      raf = requestAnimationFrame(tick);
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
      } else if (raf === null && !reducirMovimiento) {
        reloj.getDelta(); // descarta el tiempo en pausa
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
      geoPolvo.dispose();
      matPolvo.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [posicion]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      style={{ opacity: opacidad }}
      className={`pointer-events-none ${className ?? ""}`}
    />
  );
}

export default Monolito3D;
