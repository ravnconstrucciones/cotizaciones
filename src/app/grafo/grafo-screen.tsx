"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { CargandoCockpit } from "@/components/cockpit/cargando-cockpit";
import {
  comunidadesTop,
  fetchGrafo,
  type GrafoVault,
} from "@/lib/grafo";
import {
  dibujarGrafo,
  escalaBase,
  nodoEn,
  vistaInicial,
  type VistaGrafo,
} from "@/lib/grafo-dibujo";

/**
 * /grafo — el segundo cerebro, visible. El grafo de conocimiento del vault
 * (graphify: 1.577 nodos, 235 comunidades) navegable: pan/zoom/pinch, tap en
 * un nodo para ver qué es, leyenda de comunidades para iluminar un tema,
 * búsqueda para saltar a un concepto. El layout viene precalculado de la Mac
 * (/api/grafo) — acá solo se dibuja, apto celular.
 */

const LABEL = "font-mono-hud text-[10px] uppercase tracking-[0.24em] text-cdm-muted";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 14;

export function GrafoScreen() {
  const [grafo, setGrafo] = useState<GrafoVault | null>(null);
  const [error, setError] = useState(false);
  const [comunidadActiva, setComunidadActiva] = useState<number | null>(null);
  const [nodoActivo, setNodoActivo] = useState<number | null>(null);
  const [consulta, setConsulta] = useState("");
  const reducir = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const tema: "dark" | "light" = resolvedTheme === "light" ? "light" : "dark";

  const contRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vistaRef = useRef<VistaGrafo>({ k: 1, ox: 0, oy: 0 });
  const tamRef = useRef({ w: 0, h: 0 });
  const alphaRef = useRef(0);
  // Punteros activos (drag / pinch) — fuera del estado React: el redraw va
  // directo a canvas, re-renderizar el árbol por cada move sería tirar frames.
  const punterosRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<number | null>(null);
  const arrastreRef = useRef(false);

  useEffect(() => {
    fetchGrafo().then((g) => (g ? setGrafo(g) : setError(true)));
  }, []);

  const matches = useMemo(() => {
    if (!grafo || consulta.trim().length < 2) return null;
    const q = consulta.trim().toLowerCase();
    const ids = new Set<number>();
    const lista: number[] = [];
    for (let i = 0; i < grafo.nodos.length; i++) {
      if (grafo.nodos[i][4].toLowerCase().includes(q)) {
        ids.add(i);
        if (lista.length < 8) lista.push(i);
      }
    }
    return { ids, lista };
  }, [grafo, consulta]);

  const leyenda = useMemo(
    () => (grafo ? comunidadesTop(grafo, 12) : []),
    [grafo]
  );

  const redibujar = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !grafo) return;
    const { w, h } = tamRef.current;
    dibujarGrafo(ctx, grafo, vistaRef.current, w, h, {
      tema,
      comunidadActiva,
      nodoActivo,
      busqueda: matches?.ids ?? null,
      etiquetas: true,
      alpha: alphaRef.current,
    });
  }, [grafo, tema, comunidadActiva, nodoActivo, matches]);

  // Tamaño + DPR + primer dibujo (con fade de entrada salvo reduced-motion).
  useEffect(() => {
    const cont = contRef.current;
    const canvas = canvasRef.current;
    if (!cont || !canvas || !grafo) return;

    const ajustar = () => {
      const r = cont.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      const previo = tamRef.current;
      if (previo.w === 0) {
        vistaRef.current = vistaInicial(r.width, r.height);
      } else {
        // Mantener el centro al rotar el teléfono / redimensionar.
        vistaRef.current.ox += (r.width - previo.w) / 2;
        vistaRef.current.oy += (r.height - previo.h) / 2;
      }
      tamRef.current = { w: r.width, h: r.height };
      redibujar();
    };

    const ro = new ResizeObserver(ajustar);
    ro.observe(cont);
    ajustar();

    if (alphaRef.current < 1) {
      if (reducir) {
        alphaRef.current = 1;
        redibujar();
      } else {
        const t0 = performance.now();
        const paso = (t: number) => {
          alphaRef.current = Math.min(1, (t - t0) / 600);
          redibujar();
          if (alphaRef.current < 1) requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
      }
    }
    return () => ro.disconnect();
  }, [grafo, redibujar, reducir]);

  useEffect(redibujar, [redibujar]);

  // ── Interacción: drag, pinch, rueda, tap ──
  const zoomEn = useCallback(
    (sx: number, sy: number, factor: number) => {
      const v = vistaRef.current;
      const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * factor));
      const real = k / v.k;
      v.ox = sx - (sx - v.ox) * real;
      v.oy = sy - (sy - v.oy) * real;
      v.k = k;
      redibujar();
    },
    [redibujar]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    punterosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    arrastreRef.current = false;
    if (punterosRef.current.size === 2) {
      const [a, b] = [...punterosRef.current.values()];
      pinchRef.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = punterosRef.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    punterosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (punterosRef.current.size === 2 && pinchRef.current !== null) {
      const [a, b] = [...punterosRef.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = e.currentTarget.getBoundingClientRect();
      zoomEn(
        (a.x + b.x) / 2 - rect.left,
        (a.y + b.y) / 2 - rect.top,
        d / pinchRef.current
      );
      pinchRef.current = d;
      arrastreRef.current = true;
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) > 2) arrastreRef.current = true;
    if (arrastreRef.current) {
      vistaRef.current.ox += dx;
      vistaRef.current.oy += dy;
      redibujar();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    punterosRef.current.delete(e.pointerId);
    if (punterosRef.current.size < 2) pinchRef.current = null;
    if (arrastreRef.current || !grafo) return;
    // Tap limpio → hit-test de nodo.
    const rect = e.currentTarget.getBoundingClientRect();
    const { w, h } = tamRef.current;
    const i = nodoEn(
      grafo,
      vistaRef.current,
      w,
      h,
      e.clientX - rect.left,
      e.clientY - rect.top,
      18
    );
    setNodoActivo(i);
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    zoomEn(
      e.clientX - rect.left,
      e.clientY - rect.top,
      Math.exp(-e.deltaY * 0.0016)
    );
  };

  /** Centrar la vista en un nodo (resultado de búsqueda). */
  const irANodo = useCallback(
    (i: number) => {
      if (!grafo) return;
      const { w, h } = tamRef.current;
      const base = escalaBase(w, h);
      const k = Math.max(vistaRef.current.k, 4);
      vistaRef.current = {
        k,
        ox: w / 2 - grafo.nodos[i][0] * base * k,
        oy: h / 2 - grafo.nodos[i][1] * base * k,
      };
      setNodoActivo(i);
      setConsulta("");
      redibujar();
    },
    [grafo, redibujar]
  );

  if (error)
    return (
      <main className="font-geist relative flex min-h-screen items-center justify-center bg-cdm-bg text-red-400">
        No se pudo cargar el grafo. Probá recargar.
      </main>
    );
  if (!grafo) return <CargandoCockpit label="Grafo" />;

  const nodo = nodoActivo !== null ? grafo.nodos[nodoActivo] : null;

  return (
    <main className="font-geist relative flex h-dvh flex-col overflow-hidden bg-cdm-bg px-4 pt-14 text-cdm-fg sm:px-8">
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col">
        <VolverAlInicio />

        {/* Header: título + stats + búsqueda */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-grotesk text-xl font-semibold tracking-tight sm:text-2xl">
              El grafo
            </h1>
            <p className={LABEL}>
              {grafo.stats.nodos.toLocaleString("es-AR")} nodos ·{" "}
              {grafo.stats.aristas.toLocaleString("es-AR")} conexiones ·{" "}
              {grafo.stats.comunidades} comunidades · {grafo.actualizado}
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <label htmlFor="buscar-nodo" className="sr-only">
              Buscar en el grafo
            </label>
            <input
              id="buscar-nodo"
              type="search"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Buscar un concepto…"
              autoComplete="off"
              className="h-11 w-full rounded-full bg-white/60 px-4 text-[14px] text-cdm-fg outline-none ring-1 ring-cdm-line placeholder:text-cdm-muted focus-visible:ring-2 focus-visible:ring-cdm-accent dark:bg-zinc-900/50"
            />
            <AnimatePresence>
              {matches && matches.lista.length > 0 && (
                <motion.ul
                  initial={reducir ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl bg-white/90 shadow-lg ring-1 ring-cdm-line backdrop-blur dark:bg-zinc-900/90"
                >
                  {matches.lista.map((i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => irANodo(i)}
                        className="flex w-full cursor-pointer items-baseline justify-between gap-2 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-cdm-accent/10"
                      >
                        <span className="min-w-0 truncate">
                          {grafo.nodos[i][4]}
                        </span>
                        <span className="font-mono-hud shrink-0 text-[9px] uppercase tracking-[0.14em] text-cdm-muted">
                          {grafo.comunidades[String(grafo.nodos[i][3])] ?? ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Leyenda: comunidades top, iluminan su zona del grafo */}
        <div
          className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]"
          role="group"
          aria-label="Comunidades del grafo"
        >
          {leyenda.map((c) => {
            const activa = comunidadActiva === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setComunidadActiva(activa ? null : c.id);
                  setNodoActivo(null);
                }}
                aria-pressed={activa}
                className={`h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3.5 text-[12px] ring-1 transition-colors ${
                  activa
                    ? "bg-cdm-accent/15 text-cdm-accent ring-cdm-accent/40"
                    : "text-cdm-muted ring-cdm-line hover:text-cdm-fg"
                }`}
              >
                {c.label}
                <span className="ml-1.5 font-mono-hud text-[9px] opacity-60">
                  {c.nodos}
                </span>
              </button>
            );
          })}
        </div>

        {/* El grafo */}
        <div
          ref={contRef}
          className="relative mb-4 min-h-0 flex-1 overflow-hidden rounded-[24px] ring-1 ring-cdm-line"
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Grafo de conocimiento del vault: ${grafo.stats.nodos} nodos en ${grafo.stats.comunidades} comunidades. Arrastrá para mover, pellizcá o usá la rueda para acercar, tocá un nodo para ver su detalle.`}
            className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          />

          {/* Detalle del nodo tocado */}
          <AnimatePresence>
            {nodo && (
              <motion.div
                key={nodoActivo}
                initial={reducir ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-2xl bg-white/85 px-4 py-3 shadow-lg ring-1 ring-cdm-line backdrop-blur sm:inset-x-auto sm:left-3 sm:max-w-md dark:bg-zinc-900/85"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-zinc-900 dark:text-zinc-50">
                    {nodo[4]}
                  </p>
                  <p className="font-mono-hud truncate text-[9px] uppercase tracking-[0.18em] text-cdm-muted">
                    {grafo.comunidades[String(nodo[3])] ?? `Comunidad ${nodo[3]}`}{" "}
                    · {nodo[2]} conexiones
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNodoActivo(null)}
                  aria-label="Cerrar detalle"
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-cdm-muted transition-colors hover:bg-zinc-900/5 hover:text-cdm-fg dark:hover:bg-white/10"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
