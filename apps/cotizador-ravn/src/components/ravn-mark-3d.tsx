"use client";

import { useEffect, useRef, useState } from "react";
import { RavnIso } from "./ravn-iso";

/**
 * Núcleo 3D del cotizador: el isotipo RAVN real (`/ravn-mark.glb`, modelo de Eze)
 * girando como único momento autoral de la vista. Es funcional, no decorativo:
 * la velocidad de giro refleja el estado real del bridge (apagado / listo /
 * corriendo) — nunca simula actividad que no existe.
 *
 * Guardas de performance (vara de Eze: "funcional, no by the way"):
 * - `three` se importa dinámico recién al montar; no entra al bundle inicial.
 * - Solo desktop (≥900px). En mobile y `prefers-reduced-motion` cae al iso 2D.
 * - El loop se pausa fuera de viewport y con la pestaña oculta; DPR ≤ 2.
 */

type CoreState = "off" | "ready" | "running";

const TURN_SECONDS: Record<CoreState, number> = {
  off: 40,
  ready: 18,
  running: 6,
};

export function RavnMark3D({ state, size = 168 }: { state: CoreState; size?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<CoreState>(state);
  const [fallback, setFallback] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);

  stateRef.current = state;

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 900px)").matches;
    setWebgl(!reduced && desktop);
  }, []);

  useEffect(() => {
    if (!webgl || fallback) return;
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let frame = 0;
    let visible = true;
    let onScreen = true;
    let cleanupScene: (() => void) | null = null;

    (async () => {
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(size, size);
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
        camera.position.set(0, 0, 5.2);

        // Acero RAVN: blanco cálido con luz dura lateral, sin ningún color.
        // Intensidades bajas a propósito: si la cara se quema a blanco pleno
        // se pierde la silueta de la R contra el fondo.
        scene.add(new THREE.AmbientLight(0xf2efe8, 0.4));
        const key = new THREE.DirectionalLight(0xf2efe8, 1.6);
        key.position.set(2.4, 2.2, 3.4);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xf2efe8, 0.5);
        rim.position.set(-2.6, -1.4, -2.2);
        scene.add(rim);

        const material = new THREE.MeshStandardMaterial({
          color: 0xf2efe8,
          metalness: 0.6,
          roughness: 0.5,
        });

        const gltf = await new GLTFLoader().loadAsync("/ravn-mark.glb");
        if (disposed) {
          renderer.dispose();
          return;
        }

        const mark = gltf.scene;
        mark.traverse((child) => {
          if (child instanceof THREE.Mesh) child.material = material;
        });

        const box = new THREE.Box3().setFromObject(mark);
        const center = box.getCenter(new THREE.Vector3());
        const extent = box.getSize(new THREE.Vector3());
        const scale = 2.5 / Math.max(extent.x, extent.y, extent.z);
        mark.position.sub(center);
        const pivot = new THREE.Group();
        pivot.add(mark);
        pivot.scale.setScalar(scale);
        scene.add(pivot);

        const clock = new THREE.Clock();
        // arranca mostrando la cara de la R levemente girada, no el canto
        let angle = -0.45;

        const tick = () => {
          if (disposed) return;
          frame = window.requestAnimationFrame(tick);
          if (!visible || !onScreen) return;
          const delta = clock.getDelta();
          angle += (delta * Math.PI * 2) / TURN_SECONDS[stateRef.current];
          pivot.rotation.y = angle;
          pivot.rotation.x = -0.16;
          renderer.render(scene, camera);
        };
        tick();

        const onVisibility = () => {
          visible = document.visibilityState === "visible";
          if (visible) clock.getDelta();
        };
        document.addEventListener("visibilitychange", onVisibility);

        const observer = new IntersectionObserver(
          ([entry]) => {
            onScreen = entry?.isIntersecting ?? true;
            if (onScreen) clock.getDelta();
          },
          { threshold: 0.05 }
        );
        observer.observe(host);

        cleanupScene = () => {
          document.removeEventListener("visibilitychange", onVisibility);
          observer.disconnect();
          window.cancelAnimationFrame(frame);
          renderer.dispose();
          material.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (!disposed) setFallback(true);
      }
    })();

    return () => {
      disposed = true;
      cleanupScene?.();
    };
  }, [webgl, fallback, size]);

  if (webgl === null) {
    return <div className="qz-core__mark" style={{ width: size, height: size }} aria-hidden="true" />;
  }

  if (!webgl || fallback) {
    return (
      <div className="qz-core__mark qz-core__mark--flat" style={{ width: size, height: size }}>
        <RavnIso className="qz-core__iso" />
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className="qz-core__mark"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
