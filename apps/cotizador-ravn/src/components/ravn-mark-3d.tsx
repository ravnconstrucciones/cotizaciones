"use client";

import { useEffect, useRef, useState } from "react";
import { RavnIso } from "./ravn-iso";

/**
 * Núcleo del cotizador: el MONOLITO RAVN — la R en piedra fundida parada sobre
 * un plinto de grafito. Contorno, proporciones, materiales y puesta de luz son
 * los del diseño de Eze en Claude Design ("RAVN stone monolith", bundle del
 * 16/08); acá se construyen por código en vez de cargarse como modelo.
 *
 * Es funcional, no decorativo: la velocidad de giro refleja el estado real del
 * bridge (apagado / listo / ola corriendo). Nunca simula actividad que no existe.
 *
 * Performance (vara de Eze, 16/08 — "lo MÁS importante es la performance"):
 * - Geometría PROCEDURAL: se fue el fetch del `.glb` y el GLTFLoader del bundle.
 * - `three` entra por import dinámico al montar; no toca el First Load JS.
 * - Sin shadow map: sobre fondo negro una sombra proyectada no se lee y costaba
 *   un pase de render entero por cuadro. El plinto es el que apoya la pieza.
 * - Loop clavado a 30 fps: la vuelta más rápida es de 6 s, a 60 fps se gastaba
 *   el doble de GPU para el mismo movimiento.
 * - Se pausa fuera de viewport y con la pestaña oculta; DPR ≤ 2.
 * - `prefers-reduced-motion`: se dibuja UN cuadro y no hay loop.
 * - Mobile (<900px): cae al iso 2D, no se levanta WebGL.
 */

type CoreState = "off" | "ready" | "running";

/**
 * Piso de PERCEPCIÓN, no sólo de estado (Eze, 16/08: "el logo dejó de moverse,
 * me gustaba que se moviera"). A 40 s por vuelta la pieza giraba de verdad —
 * 9°/s — pero contra el fondo negro y detrás del velo se leía quieta. La
 * velocidad sigue codificando el estado real del bridge; lo que subió es el
 * piso, para que "apagado" también se vea vivo.
 */
const TURN_SECONDS: Record<CoreState, number> = {
  off: 20,
  ready: 11,
  running: 5,
};

/** Cabeceo lento sobre el eje X: el giro se lee aunque la cara quede de frente. */
const WOBBLE_RAD = 0.07;
const WOBBLE_TURNS = 0.5;

/** Contorno de la R trazado del isotipo (px, y hacia abajo, bbox 596 × 624). */
const OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [345, 0],
  [541, 198],
  [289, 198],
  [596, 624],
  [269, 624],
  [269, 444],
  [202, 444],
  [202, 624],
  [0, 624],
];

const SRC_W = 596;
const SRC_H = 624;
const MARK_H = 0.7;
const MARK_DEPTH = 0.17;
const PLINTH_W = 0.86;
const PLINTH_H = 0.055;
const PLINTH_D = 0.42;
/** Arranca mostrando la cara de la R girada hacia la cámara, no el canto. */
const START_ANGLE = 0.45;
const MIN_FRAME_S = 1 / 30;

/**
 * 300 px es el piso de legibilidad: probado a 216 el monolito no se lee como la
 * R — a ese tamaño la pieza girada parece una cuña. La celda del núcleo se
 * dimensionó para esto, no al revés.
 */
export function RavnMark3D({ state, size = 300 }: { state: CoreState; size?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<CoreState>(state);
  const [fallback, setFallback] = useState(false);
  const [mode, setMode] = useState<"pending" | "flat" | "live" | "still">("pending");

  stateRef.current = state;

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 900px)").matches;
    if (!desktop) {
      setMode("flat");
      return;
    }
    setMode(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "still" : "live"
    );
  }, []);

  useEffect(() => {
    if ((mode !== "live" && mode !== "still") || fallback) return;
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let frame = 0;
    let cleanupScene: (() => void) | null = null;

    void (async () => {
      try {
        const THREE = await import("three");
        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(size, size);
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();

        // --- la R extruida ------------------------------------------------
        const scale = MARK_H / SRC_H;
        const cx = SRC_W / 2;
        const shape = new THREE.Shape();
        OUTLINE.forEach(([px, py], index) => {
          const x = (px - cx) * scale;
          const y = (SRC_H - py) * scale;
          if (index === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        });
        shape.closePath();

        const markGeometry = new THREE.ExtrudeGeometry(shape, {
          depth: MARK_DEPTH,
          bevelEnabled: true,
          bevelThickness: 0.006,
          bevelSize: 0.005,
          bevelSegments: 2,
          curveSegments: 1,
        });
        markGeometry.center();

        // Piedra fundida: mate, casi sin metal. El brillo lo pone la luz, no el
        // material — con metalness alto y sin envmap la pieza se va a negro.
        const stone = new THREE.MeshStandardMaterial({
          color: 0xdedfdc,
          roughness: 0.72,
          metalness: 0.05,
        });
        const graphite = new THREE.MeshStandardMaterial({
          color: 0x18191b,
          roughness: 0.55,
          metalness: 0.25,
        });

        const mark = new THREE.Mesh(markGeometry, stone);
        const plinthGeometry = new THREE.BoxGeometry(PLINTH_W, PLINTH_H, PLINTH_D);
        const plinth = new THREE.Mesh(plinthGeometry, graphite);

        plinth.position.y = PLINTH_H / 2;
        mark.position.y = PLINTH_H + MARK_H / 2 - 0.001;

        const monolith = new THREE.Group();
        monolith.add(plinth, mark);
        scene.add(monolith);

        // --- luz de estudio -----------------------------------------------
        scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.0));
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(4, 7, 5);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xfff4e6, 0.5);
        fill.position.set(-5, 3, -4);
        scene.add(fill);

        // --- encuadre -------------------------------------------------------
        // El centro de la pieza cae sobre el eje Y, así que la esfera envolvente
        // no cambia al girar: se calcula una sola vez y nunca recorta.
        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
        const sphere = new THREE.Box3()
          .setFromObject(monolith)
          .getBoundingSphere(new THREE.Sphere());
        const distance =
          (sphere.radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.35;
        camera.position
          .copy(sphere.center)
          .add(new THREE.Vector3(1, 0.55, 1.25).normalize().multiplyScalar(distance));
        camera.near = Math.max(distance / 100, 0.01);
        camera.far = distance * 100;
        camera.lookAt(sphere.center);
        camera.updateProjectionMatrix();

        monolith.rotation.y = START_ANGLE;
        renderer.render(scene, camera);

        const disposeGpu = () => {
          markGeometry.dispose();
          plinthGeometry.dispose();
          stone.dispose();
          graphite.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };

        if (mode === "still") {
          cleanupScene = disposeGpu;
          return;
        }

        // --- turntable ------------------------------------------------------
        const clock = new THREE.Clock();
        let angle = START_ANGLE;
        let pending = 0;
        let visible = true;
        let onScreen = true;

        const tick = () => {
          if (disposed) return;
          frame = window.requestAnimationFrame(tick);
          const delta = clock.getDelta();
          if (!visible || !onScreen) return;
          pending += delta;
          if (pending < MIN_FRAME_S) return;
          angle += (pending * Math.PI * 2) / TURN_SECONDS[stateRef.current];
          pending = 0;
          monolith.rotation.y = angle;
          monolith.rotation.x = Math.sin(angle * WOBBLE_TURNS) * WOBBLE_RAD;
          renderer.render(scene, camera);
        };
        tick();

        const onVisibility = () => {
          visible = document.visibilityState === "visible";
        };
        document.addEventListener("visibilitychange", onVisibility);

        const observer = new IntersectionObserver(
          ([entry]) => {
            onScreen = entry?.isIntersecting ?? true;
          },
          { threshold: 0.05 }
        );
        observer.observe(host);

        cleanupScene = () => {
          document.removeEventListener("visibilitychange", onVisibility);
          observer.disconnect();
          window.cancelAnimationFrame(frame);
          disposeGpu();
        };
      } catch {
        if (!disposed) setFallback(true);
      }
    })();

    return () => {
      disposed = true;
      cleanupScene?.();
    };
  }, [mode, fallback, size]);

  if (mode === "pending") {
    return (
      <div className="qz-core__mark" style={{ width: size, height: size }} aria-hidden="true" />
    );
  }

  if (mode === "flat" || fallback) {
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
