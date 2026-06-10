// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { RavnLogo } from "@/components/ravn-logo";

const EASE = [0.16, 1, 0.3, 1] as const;
const W   = "#fef7f2";
const BEI = "#C9B99A";
const MUT = "#555555";
const BG  = "#0d0d0d";

// ──────────────────────────────────────────────────────────────
// MARQUEE STRIP
// ──────────────────────────────────────────────────────────────
const MQ = ["Reforma","·","Venta","·","Mudanza","·","Compra","·","Diseño","·","RAVN","·"];

function MarqueeStrip({ reverse = false }: { reverse?: boolean }) {
  const items = Array(10).fill(MQ).flat();
  return (
    <div style={{ overflow: "hidden", padding: "1.2rem 0", borderTop: "1px solid #161616", borderBottom: "1px solid #161616", background: BG }}>
      <div style={{ display: "flex", width: "max-content", animation: `${reverse ? "mqR" : "mq"} 40s linear infinite` }}>
        {items.map((w, i) => (
          <span key={i} style={{ fontSize: "0.5rem", letterSpacing: "0.55em", textTransform: "uppercase", color: w === "·" ? BEI : "#252525", padding: "0 2.4rem", flexShrink: 0, fontFamily: "Raleway, sans-serif", opacity: w === "·" ? 0.5 : 1 }}>
            {w}
          </span>
        ))}
      </div>
      <style>{`@keyframes mq{0%{transform:translateX(0)}100%{transform:translateX(-50%)}} @keyframes mqR{0%{transform:translateX(-50%)}100%{transform:translateX(0)}}`}</style>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// THREE CANVAS — Three.js loaded lazily inside useEffect
// ──────────────────────────────────────────────────────────────
type AnimateFn = (group: { rotation: { x: number; y: number; z: number }; position: { x: number; y: number; z: number } }, t: number) => void;
type BuildFn   = (THREE: typeof import("three")) => { rotation: { x: number; y: number; z: number }; position: { x: number; y: number; z: number }; [k: string]: unknown };

function ThreeCanvas({
  build, onAnimate, camPos,
}: {
  build: BuildFn;
  onAnimate: AnimateFn;
  camPos?: [number, number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;
    let raf: number;
    let disposed = false;

    import("three").then((THREE) => {
      if (disposed) return;

      const w = mount.clientWidth  || 600;
      const h = mount.clientHeight || 500;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      mount.appendChild(renderer.domElement);

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
      if (camPos) camera.position.set(...camPos);
      else camera.position.set(0, 0.6, 6);

      scene.add(new THREE.AmbientLight(0xffffff, 0.45));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(4, 7, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xc9b99a, 1.0);
      rim.position.set(-5, 2, -4);
      scene.add(rim);
      scene.add(new THREE.HemisphereLight(0x1a1a1a, 0x050505, 0.5));

      const onResize = () => {
        const nw = mount.clientWidth;
        const nh = mount.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener("resize", onResize);

      const group = build(THREE) as unknown as ReturnType<typeof THREE.Group.prototype.clone>;
      scene.add(group as unknown as THREE.Object3D);

      const loop = () => {
        raf = requestAnimationFrame(loop);
        onAnimate(group as unknown as Parameters<AnimateFn>[0], Date.now() * 0.001);
        renderer.render(scene, camera);
      };
      loop();

      // cleanup
      const origCleanup = () => {
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      };
      (mount as unknown as { _cleanup?: () => void })._cleanup = origCleanup;
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      const m = mount as unknown as { _cleanup?: () => void };
      m._cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

// ──────────────────────────────────────────────────────────────
// 3D BUILDERS  (receive THREE as parameter — no top-level import)
// ──────────────────────────────────────────────────────────────
type T = typeof import("three");

function mkMesh(
  THREE: T,
  geo: InstanceType<T["BufferGeometry"]>,
  mat: InstanceType<T["Material"]>,
  pos: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0]
) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
}

function buildHouse(THREE: T, wireframe = false) {
  const g   = new THREE.Group();
  const wf  = wireframe;
  const wht = new THREE.MeshStandardMaterial({ color: 0xfef7f2, wireframe: wf, roughness: 0.25, metalness: 0.18 });
  const bei = new THREE.MeshStandardMaterial({ color: 0xc9b99a, wireframe: wf, roughness: 0.38 });
  const drk = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, wireframe: wf });
  const gls = new THREE.MeshStandardMaterial({ color: 0x99aabb, wireframe: wf, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.72 });

  g.add(mkMesh(THREE, new THREE.BoxGeometry(2.2, 1.62, 2.2),     wht, [0, -0.19, 0]));
  g.add(mkMesh(THREE, new THREE.ConeGeometry(1.73, 1.32, 4),     bei, [0, 1.11, 0], [0, Math.PI/4, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.54, 0.9, 0.042),   bei, [0, -0.555, 1.12]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.42, 0.78, 0.06),   drk, [0, -0.61, 1.136]));
  for (const x of [-0.7, 0.7]) {
    g.add(mkMesh(THREE, new THREE.BoxGeometry(0.54, 0.5, 0.042), bei, [x, -0.04, 1.12]));
    g.add(mkMesh(THREE, new THREE.BoxGeometry(0.42, 0.38, 0.06), gls, [x, -0.04, 1.136]));
    g.add(mkMesh(THREE, new THREE.BoxGeometry(0.42, 0.03, 0.065),bei, [x, -0.04, 1.132]));
    g.add(mkMesh(THREE, new THREE.BoxGeometry(0.03, 0.38, 0.065),bei, [x, -0.04, 1.132]));
  }
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.23, 0.62, 0.23),   bei, [0.58, 1.53, 0.46]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.92, 0.072, 0.44),  bei, [0, -1.03, 1.24]));
  return g;
}

function buildKey(THREE: T) {
  const g    = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4aa70, roughness: 0.07, metalness: 0.98 });
  const gd2  = new THREE.MeshStandardMaterial({ color: 0xb8903a, roughness: 0.18, metalness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x161614, roughness: 0.6 });
  g.add(mkMesh(THREE, new THREE.TorusGeometry(0.58, 0.14, 30, 120), gold, [0, 0.9, 0]));
  g.add(mkMesh(THREE, new THREE.TorusGeometry(0.32, 0.065, 20, 60), dark, [0, 0.9, 0]));
  g.add(mkMesh(THREE, new THREE.CylinderGeometry(0.09, 0.09, 2.25, 24), gold, [0, -0.24, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.27, 0.2, 0.13),  gd2, [0, -1.29, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.27, 0.26, 0.13), gold,[0.2, -0.82, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.21, 0.21, 0.13), gd2, [0.18, -1.08, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.16, 0.16, 0.13), gold,[0.16, -1.3,  0]));
  return g;
}

function buildTruck(THREE: T) {
  const g    = new THREE.Group();
  const wht  = new THREE.MeshStandardMaterial({ color: 0xfef7f2, roughness: 0.28, metalness: 0.12 });
  const bei  = new THREE.MeshStandardMaterial({ color: 0xc9b99a, roughness: 0.36 });
  const drk  = new THREE.MeshStandardMaterial({ color: 0x0c0c0c });
  const gry  = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.72 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const hub  = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.26, metalness: 0.78 });
  const gls  = new THREE.MeshStandardMaterial({ color: 0x7799bb, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.58 });
  const tl   = new THREE.MeshStandardMaterial({ color: 0xcc2211, roughness: 0.4, emissive: new THREE.Color(0x660000), emissiveIntensity: 0.6 });

  g.add(mkMesh(THREE, new THREE.BoxGeometry(3.02, 1.78, 1.88), wht, [-0.36, 0.1, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(3.0,  0.3,  0.016),drk, [-0.36, 0.44, 0.948]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.16, 0.12, 0.016),tl,  [-1.87, -0.1,  0.95]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.16, 0.12, 0.016),tl,  [-1.87, -0.1, -0.95]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(1.2,  1.42, 1.88), bei, [1.43, -0.05, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.065,0.84, 1.38), gls, [0.84, 0.12, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.72, 0.52, 0.065),gls, [1.36, 0.22,  0.948]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.72, 0.52, 0.065),gls, [1.36, 0.22, -0.948]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.09, 0.54, 1.58), gry, [2.03, -0.32, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(4.24, 0.12, 1.88), gry, [0.2, -0.82, 0]));
  for (const z of [-0.948, 0.948])
    g.add(mkMesh(THREE, new THREE.BoxGeometry(4.24, 0.065, 0.044), gry, [0.2, -0.76, z]));

  const wGeo = new THREE.CylinderGeometry(0.335, 0.335, 0.28, 26);
  const hGeo = new THREE.CylinderGeometry(0.185, 0.185, 0.29, 26);
  for (const [px, py, pz] of [
    [-1.02,-0.97, 1.07],[0.66,-0.97, 1.07],
    [-1.02,-0.97,-1.07],[0.66,-0.97,-1.07],
    [ 1.64,-0.97, 1.07],[1.64,-0.97,-1.07],
  ] as [number,number,number][]) {
    g.add(mkMesh(THREE, wGeo, tire, [px, py, pz], [Math.PI/2, 0, 0]));
    g.add(mkMesh(THREE, hGeo, hub,  [px, py, pz], [Math.PI/2, 0, 0]));
  }
  return g;
}

function buildModernBuilding(THREE: T) {
  const g    = new THREE.Group();
  const wht  = new THREE.MeshStandardMaterial({ color: 0xfef7f2, roughness: 0.28, metalness: 0.12 });
  const bei  = new THREE.MeshStandardMaterial({ color: 0xc9b99a, roughness: 0.36 });
  const gls  = new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.65 });
  const drk  = new THREE.MeshStandardMaterial({ color: 0x0d0d0d });

  g.add(mkMesh(THREE, new THREE.BoxGeometry(2.2, 2.1, 1.8),     wht, [0, 0, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(2.4, 0.1, 2.0),     bei, [0, 1.08, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(2.4, 0.06, 0.12),   bei, [0,  0.24, 0.96]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(2.4, 0.06, 0.12),   bei, [0, -0.38, 0.96]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.55, 0.85, 0.04),  gls, [-0.5,  0.1,  0.92]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.55, 0.85, 0.04),  gls, [ 0.5,  0.1,  0.92]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.55, 0.85, 0.04),  gls, [-0.5,  0.1, -0.92]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.55, 0.85, 0.04),  gls, [ 0.5,  0.1, -0.92]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.46, 0.88, 0.04),  drk, [0, -0.62, 0.92]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.08, 2.12, 0.08),  bei, [-1.16, 0, 0.96]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.08, 2.12, 0.08),  bei, [ 1.16, 0, 0.96]));
  return g;
}

function buildDesign(THREE: T) {
  const g    = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9b99a, roughness: 0.15, metalness: 0.85 });
  const wht  = new THREE.MeshStandardMaterial({ color: 0xfef7f2, roughness: 0.3,  metalness: 0.1 });
  const drk  = new THREE.MeshStandardMaterial({ color: 0x1a1a18, roughness: 0.5 });

  g.add(mkMesh(THREE, new THREE.BoxGeometry(0.09, 2.2, 0.07),  gold, [-0.72, 0.1, 0]));
  g.add(mkMesh(THREE, new THREE.BoxGeometry(1.9,  0.09, 0.07), gold, [0.22, -1.0, 0]));
  for (let i = -0.8; i <= 0.8; i += 0.2)
    g.add(mkMesh(THREE, new THREE.BoxGeometry(0.02, 0.12, 0.08), gold, [i + 0.22, -0.91, 0]));

  const a = Math.PI / 6;
  g.add(mkMesh(THREE, new THREE.CylinderGeometry(0.065, 0.065, 1.9, 8), wht,
    [0.55, 0.3, 0.1], [0, 0, a]));
  g.add(mkMesh(THREE, new THREE.ConeGeometry(0.065, 0.22, 8), gold,
    [0.55 + Math.sin(a)*1.06, 0.3 - Math.cos(a)*1.06, 0.1], [0, 0, a]));
  g.add(mkMesh(THREE, new THREE.ConeGeometry(0.065, 0.14, 8), drk,
    [0.55 + Math.sin(a)*1.17, 0.3 - Math.cos(a)*1.17, 0.1], [0, 0, a]));

  g.add(mkMesh(THREE, new THREE.TorusGeometry(0.28, 0.04, 16, 80), gold, [-0.72, 1.12, 0]));
  return g;
}

// ──────────────────────────────────────────────────────────────
// STORY SECTION
// ──────────────────────────────────────────────────────────────
function StorySection({
  step, fill, stroke, body, canvas, reverse = false,
}: {
  step: string;
  fill: string;
  stroke: string;
  body: string;
  canvas: React.ReactNode;
  reverse?: boolean;
}) {
  const ref    = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });

  return (
    <section
      ref={ref}
      style={{ minHeight: "100dvh", display: "flex", alignItems: "center", background: BG, overflow: "hidden" }}
    >
      <div style={{ width: "100%", display: "flex", flexDirection: reverse ? "row-reverse" : "row", alignItems: "stretch" }}>
        <motion.div
          style={{ flex: 1, padding: "4rem 4.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}
          initial={{ opacity: 0, x: reverse ? 72 : -72 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <span style={{ display: "block", fontSize: "0.56rem", letterSpacing: "0.6em", textTransform: "uppercase", color: BEI, marginBottom: "2rem", fontFamily: "Raleway, sans-serif", fontWeight: 300 }}>
            {step}
          </span>
          <h2 style={{ lineHeight: 0.88, marginBottom: "2.4rem" }}>
            <span style={{ display: "block", fontSize: "clamp(2.8rem, 7vw, 6.5rem)", fontWeight: 800, letterSpacing: "-0.02em", textTransform: "uppercase", color: W, lineHeight: 0.92, fontFamily: "Raleway, sans-serif" }}>
              {fill}
            </span>
            <span style={{ display: "block", fontSize: "clamp(2.8rem, 7vw, 6.5rem)", fontWeight: 800, letterSpacing: "-0.02em", textTransform: "uppercase", color: "transparent", WebkitTextStroke: `1.5px ${W}`, lineHeight: 0.97, fontFamily: "Raleway, sans-serif" }}>
              {stroke}
            </span>
          </h2>
          <p style={{ fontSize: "clamp(0.82rem, 1.15vw, 1rem)", fontWeight: 300, lineHeight: 2.1, color: MUT, maxWidth: "360px", fontFamily: "Raleway, sans-serif" }}>
            {body}
          </p>
        </motion.div>

        <motion.div
          style={{ flex: 1, minHeight: "60dvh", position: "relative" }}
          initial={{ opacity: 0, scale: 0.88, y: 40 }}
          animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
          transition={{ duration: 1.3, ease: EASE, delay: 0.1 }}
        >
          {canvas}
        </motion.div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────
// MAIN EXPORT
// ──────────────────────────────────────────────────────────────
export default function LandingClient() {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = heroRef.current;
    if (!mount) return;
    let raf: number;
    let disposed = false;

    import("three").then((THREE) => {
      if (disposed) return;
      const w = mount.clientWidth  || 600;
      const h = mount.clientHeight || 500;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      mount.appendChild(renderer.domElement);
      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
      camera.position.set(0, 0.8, 7.5);
      scene.add(new THREE.AmbientLight(0xffffff, 0.45));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(4, 7, 5); scene.add(key);
      const rim = new THREE.DirectionalLight(0xc9b99a, 1.0);
      rim.position.set(-5, 2, -4); scene.add(rim);
      scene.add(new THREE.HemisphereLight(0x1a1a1a, 0x050505, 0.5));
      const house = buildHouse(THREE, true);
      house.scale.setScalar(1.3);
      scene.add(house);
      const loop = () => {
        raf = requestAnimationFrame(loop);
        house.rotation.y += 0.003;
        renderer.render(scene, camera);
      };
      loop();
      (mount as unknown as { _renderer?: typeof renderer })._renderer = renderer;
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      const m = mount as unknown as { _renderer?: { dispose: () => void; domElement: HTMLElement } };
      if (m._renderer) {
        m._renderer.dispose();
        if (mount.contains(m._renderer.domElement)) mount.removeChild(m._renderer.domElement);
      }
    };
  }, []);

  return (
    <div style={{ background: BG, overflowX: "hidden" }}>

      {/* ── HERO ──────────────────────────────────────────── */}
      <section style={{ position: "relative", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", background: BG }}>
        <div ref={heroRef} style={{ position: "absolute", inset: 0, opacity: 0.28 }} />
        <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: "1.6rem", textAlign: "center", padding: "0 2rem" }}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: EASE }}>
            <RavnLogo sizeClassName="text-2xl sm:text-3xl" showTagline />
          </motion.div>
          <motion.div
            style={{ display: "flex", flexDirection: "column" }}
            initial={{ opacity: 0, y: 44 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.6, delay: 0.25, ease: EASE }}
          >
            <span style={{ display: "block", fontSize: "clamp(3rem, 12vw, 10rem)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 0.88, textTransform: "uppercase", color: W, fontFamily: "Raleway, sans-serif" }}>
              Nos encargamos
            </span>
            <span style={{ display: "block", fontSize: "clamp(3rem, 12vw, 10rem)", fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 0.96, textTransform: "uppercase", color: "transparent", WebkitTextStroke: `1.5px ${W}`, fontFamily: "Raleway, sans-serif" }}>
              de todo.
            </span>
          </motion.div>
          <motion.div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 1 }}>
            <div style={{ width: 60, height: 1, background: BEI }} />
            <p style={{ fontSize: "0.58rem", letterSpacing: "0.5em", textTransform: "uppercase", color: MUT, fontFamily: "Raleway, sans-serif", fontWeight: 300 }}>
              Reforma &nbsp;·&nbsp; Venta &nbsp;·&nbsp; Mudanza &nbsp;·&nbsp; Compra &nbsp;·&nbsp; Diseño
            </p>
          </motion.div>
        </div>
        <motion.div style={{ position: "absolute", bottom: "2.5rem", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", zIndex: 2 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.1, duration: 1 }}>
          <motion.div style={{ width: 1, height: 56, background: "linear-gradient(to bottom, #444, transparent)" }} animate={{ scaleY: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }} />
          <span style={{ fontSize: "0.47rem", letterSpacing: "0.4em", textTransform: "uppercase", color: "#333", fontFamily: "Raleway, sans-serif" }}>Scroll</span>
        </motion.div>
      </section>

      <MarqueeStrip />

      {/* ── 01 REFORMA ── */}
      <StorySection
        step="01 — Reforma"
        fill="Reformamos"
        stroke="tu propiedad."
        body="Ponemos a punto tu inmueble antes de ponerlo en valor. Materiales de primera, ejecución impecable y estética pensada para el mercado premium de zona norte."
        canvas={
          <ThreeCanvas
            build={(T) => buildHouse(T, false)}
            camPos={[0, 0.8, 6.5]}
            onAnimate={(g, t) => { g.rotation.y += 0.004; g.position.y = Math.sin(t * 0.7) * 0.12; }}
          />
        }
      />

      <MarqueeStrip reverse />

      {/* ── 02 VENTA ── */}
      <StorySection
        step="02 — Venta"
        fill="Vendemos"
        stroke="al mejor precio."
        body="Gestionamos la venta con criterio técnico-comercial. Cada trámite, negociación y cierre orientado a maximizar tu resultado. Vos recibís el número."
        canvas={
          <ThreeCanvas
            build={(T) => buildKey(T)}
            camPos={[0, 0, 5.5]}
            onAnimate={(g, t) => { g.rotation.y += 0.006; g.rotation.z = Math.sin(t * 0.8) * 0.14; g.position.y = Math.sin(t * 0.9) * 0.14; }}
          />
        }
        reverse
      />

      <MarqueeStrip />

      {/* ── 03 MUDANZA ── */}
      <StorySection
        step="03 — Mudanza"
        fill="Te mudamos"
        stroke="sin estrés."
        body="Coordinamos toda la logística de la mudanza. El camión RAVN se encarga de cada detalle. Sin sorpresas, sin improviso. Vos llegás al nuevo lugar."
        canvas={
          <ThreeCanvas
            build={(T) => buildTruck(T)}
            camPos={[0, 1, 7.8]}
            onAnimate={(g, t) => { g.rotation.y += 0.003; g.position.y = Math.sin(t * 0.6) * 0.1; }}
          />
        }
      />

      <MarqueeStrip reverse />

      {/* ── 04 COMPRA ── */}
      <StorySection
        step="04 — Compra"
        fill="Te guiamos"
        stroke="en la compra."
        body="¿Querés comprar tu próxima propiedad? Te asesoramos para encontrar la mejor opción, determinamos el valor real y cerramos la negociación en tus términos."
        canvas={
          <ThreeCanvas
            build={(T) => buildModernBuilding(T)}
            camPos={[0, 0.5, 6.5]}
            onAnimate={(g, t) => { g.rotation.y += 0.004; g.position.y = Math.sin(t * 0.65) * 0.12; }}
          />
        }
        reverse
      />

      <MarqueeStrip />

      {/* ── 05 DISEÑO ── */}
      <StorySection
        step="05 — Diseño"
        fill="Diseñamos"
        stroke="la nueva a tu gusto."
        body="Reformamos y acondicionamos tu nueva propiedad exactamente como la imaginás. Diseño de interiores, materiales premium y ejecución desde el primer boceto."
        canvas={
          <ThreeCanvas
            build={(T) => buildDesign(T)}
            camPos={[0, 0, 5]}
            onAnimate={(g, t) => { g.rotation.y = Math.sin(t * 0.4) * 0.35; g.position.y = Math.sin(t * 0.7) * 0.1; }}
          />
        }
      />

      {/* ── CTA ── */}
      <section style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6rem 2rem", background: BG, textAlign: "center" }}>
        <motion.div
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2.4rem", maxWidth: 800 }}
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 1.2, ease: EASE }}
        >
          <div style={{ width: 60, height: 1, background: BEI }} />
          <h2 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 100, fontSize: "clamp(2.2rem, 5.5vw, 4.8rem)", lineHeight: 1.1, letterSpacing: "-0.02em", color: W }}>
            Tu propiedad merece un nuevo capítulo.
          </h2>
          <p style={{ fontFamily: "Raleway, sans-serif", fontWeight: 300, fontSize: "0.95rem", lineHeight: 2, color: MUT, maxWidth: 380 }}>
            Escribinos y te contamos cómo trabajamos. Sin compromiso.
          </p>
          <motion.a
            href="https://wa.me/5491173856263?text=Hola%20RAVN%2C%20quiero%20saber%20m%C3%A1s%20sobre%20sus%20servicios"
            target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.9rem", padding: "1.15rem 3.4rem", border: `1px solid rgba(254,247,242,0.6)`, color: W, fontFamily: "Raleway, sans-serif", fontSize: "0.7rem", fontWeight: 300, letterSpacing: "0.32em", textTransform: "uppercase", textDecoration: "none" }}
            whileHover={{ backgroundColor: W, color: BG, borderColor: W }}
            transition={{ duration: 0.3 }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            Hablemos
          </motion.a>
          <div style={{ marginTop: "4rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontFamily: "Raleway, sans-serif", fontWeight: 100, fontSize: "1.8rem", letterSpacing: "0.48em", textTransform: "uppercase", color: "#2a2a2a" }}>RAVN</span>
            <span style={{ fontFamily: "Raleway, sans-serif", fontSize: "0.5rem", letterSpacing: "0.32em", textTransform: "uppercase", color: "#1a1a1a" }}>Construcciones</span>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
