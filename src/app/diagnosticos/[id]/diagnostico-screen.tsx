"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ESTADOS_DIAGNOSTICO,
  ESTADO_LABEL,
  type ContenidoDiagnostico,
  type Diagnostico,
  type EstadoDiagnostico,
  type SeccionDiagnostico,
} from "../tipos";

const inputCls =
  "w-full border-0 border-b border-cdm-line bg-transparent px-1 py-1.5 text-sm text-cdm-fg placeholder:text-cdm-muted/50 focus-visible:border-cdm-accent focus-visible:outline-none";
const areaCls =
  "w-full border border-cdm-line bg-cdm-panel/40 p-3 text-sm leading-relaxed text-cdm-fg placeholder:text-cdm-muted/50 focus-visible:border-cdm-accent focus-visible:outline-none";
const labelCls =
  "font-mono-hud mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-cdm-muted";
const btnCls =
  "font-mono-hud inline-flex items-center rounded-full border border-cdm-accent/50 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent/10 disabled:opacity-40";

/** Lista editable como texto: una línea = un ítem. Más rápido que N inputs. */
function lineasATexto(v: string[] | undefined): string {
  return (v ?? []).join("\n");
}
function textoALineas(v: string): string[] {
  return v
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function DiagnosticoScreen({ id }: { id: string }) {
  const router = useRouter();
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [cotizando, setCotizando] = useState(false);
  const [verRelevamiento, setVerRelevamiento] = useState(false);

  // Campos editables (espejo local del registro).
  const [titulo, setTitulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [direccion, setDireccion] = useState("");
  const [estado, setEstado] = useState<EstadoDiagnostico>("borrador");
  const [resumen, setResumen] = useState("");
  const [secciones, setSecciones] = useState<SeccionDiagnostico[]>([]);
  const [alcance, setAlcance] = useState("");
  const [recomendaciones, setRecomendaciones] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/diagnosticos/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar");
      const d = json.diagnostico as Diagnostico;
      setDiag(d);
      setTitulo(d.titulo);
      setCliente(d.cliente ?? "");
      setDireccion(d.direccion ?? "");
      setEstado(d.estado);
      const c: ContenidoDiagnostico = d.contenido ?? {};
      setResumen(c.resumen ?? "");
      setSecciones(c.secciones ?? []);
      setAlcance(lineasATexto(c.alcance));
      setRecomendaciones(lineasATexto(c.recomendaciones));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar() {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      const contenido: ContenidoDiagnostico = {
        ...(diag?.contenido ?? {}),
        resumen,
        secciones,
        alcance: textoALineas(alcance),
        recomendaciones: textoALineas(recomendaciones),
      };
      const res = await fetch(`/api/diagnosticos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, cliente, direccion, estado, contenido }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
      setGuardado(true);
      window.setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function enviarACotizar() {
    if (cotizando) return;
    if (diag?.cotizacion_id) {
      router.push(`/cotizaciones/${diag.cotizacion_id}/revision`);
      return;
    }
    if (!window.confirm("Se crea una cotización con este relevamiento y se abre la mesa. ¿Vamos?")) {
      return;
    }
    setCotizando(true);
    setError(null);
    try {
      const res = await fetch(`/api/diagnosticos/${id}/cotizar`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo enviar a cotizar");
      router.push(`/cotizaciones/${json.cotizacion_id}/revision`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar a cotizar");
      setCotizando(false);
    }
  }

  function editarSeccion(i: number, patch: Partial<SeccionDiagnostico>) {
    setSecciones((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  if (cargando) {
    return (
      <div className="font-geist min-h-screen bg-cdm-bg px-6 pt-10 text-cdm-fg md:px-10">
        <p className="font-mono-hud text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
          Cargando…
        </p>
      </div>
    );
  }

  if (!diag) {
    return (
      <div className="font-geist min-h-screen bg-cdm-bg px-6 pt-10 text-cdm-fg md:px-10">
        <p className="text-[13px] text-red-400">{error ?? "No se encontró el diagnóstico."}</p>
        <Link href="/diagnosticos" className="mt-4 inline-block text-[12px] text-cdm-muted underline">
          Volver
        </Link>
      </div>
    );
  }

  const faltantes = diag.contenido?.faltantes ?? [];

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg pb-24 text-cdm-fg">
      <header className="relative z-10 flex flex-wrap items-baseline justify-between gap-4 px-6 pt-8 md:px-10">
        <div>
          <Link
            href="/diagnosticos"
            className="font-mono-hud text-[10px] uppercase tracking-[0.18em] text-cdm-muted transition-colors hover:text-cdm-fg"
          >
            ← Diagnósticos
          </Link>
          <h1 className="mt-2 font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            {titulo || "Sin título"}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/diagnosticos/${id}/documento`} target="_blank" className={btnCls}>
            Ver documento
          </Link>
          <button onClick={() => void enviarACotizar()} disabled={cotizando} className={btnCls}>
            {diag.cotizacion_id
              ? "Ir a la cotización"
              : cotizando
                ? "Enviando…"
                : "Enviar a cotizar"}
          </button>
          <button onClick={() => void guardar()} disabled={guardando} className={btnCls}>
            {guardando ? "Guardando…" : guardado ? "Guardado ✓" : "Guardar"}
          </button>
        </div>
      </header>

      {error && <p className="px-6 pt-4 text-[12px] text-red-400 md:px-10">{error}</p>}

      {faltantes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mx-6 mt-6 border border-amber-400/40 bg-amber-400/5 p-4 md:mx-10"
        >
          <p className="font-mono-hud text-[10px] uppercase tracking-[0.18em] text-amber-400">
            Datos que faltan del relevamiento
          </p>
          <ul className="mt-2 space-y-1 text-[13px] text-cdm-fg">
            {faltantes.map((f, i) => (
              <li key={i}>· {f}</li>
            ))}
          </ul>
        </motion.div>
      )}

      <div className="relative z-10 grid grid-cols-1 gap-8 px-6 pt-8 md:px-10 lg:grid-cols-[1.4fr_1fr]">
        {/* Izquierda — el documento */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className={labelCls} htmlFor="diag-titulo">Título</label>
              <input id="diag-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="diag-cliente">Cliente</label>
              <input id="diag-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="diag-direccion">Dirección</label>
              <input id="diag-direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="diag-resumen">Resumen</label>
            <textarea
              id="diag-resumen"
              value={resumen}
              onChange={(e) => setResumen(e.target.value)}
              rows={4}
              placeholder="Qué se encontró, en una lectura."
              className={areaCls}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className={labelCls}>Secciones</span>
              <button
                onClick={() => setSecciones((p) => [...p, { titulo: "", cuerpo: "" }])}
                className="font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg"
              >
                + Agregar
              </button>
            </div>
            <div className="space-y-4">
              {secciones.map((s, i) => (
                <div key={i} className="border border-cdm-line p-4">
                  <div className="flex items-center gap-2">
                    <input
                      value={s.titulo}
                      onChange={(e) => editarSeccion(i, { titulo: e.target.value })}
                      placeholder="Título de la sección"
                      className={inputCls}
                    />
                    <button
                      onClick={() => setSecciones((p) => p.filter((_, j) => j !== i))}
                      className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-red-400"
                    >
                      Quitar
                    </button>
                  </div>
                  <textarea
                    value={s.cuerpo}
                    onChange={(e) => editarSeccion(i, { cuerpo: e.target.value })}
                    rows={5}
                    placeholder="Qué pasa, por qué pasa y qué hay que hacer."
                    className={`${areaCls} mt-3`}
                  />
                </div>
              ))}
              {secciones.length === 0 && (
                <p className="text-[12px] text-cdm-muted">
                  Todavía no hay secciones. Agregá una, o dejá que la Mac las escriba desde el relevamiento.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="diag-alcance">Alcance (una línea por ítem)</label>
              <textarea id="diag-alcance" value={alcance} onChange={(e) => setAlcance(e.target.value)} rows={6} className={areaCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="diag-recom">Recomendaciones (una línea por ítem)</label>
              <textarea id="diag-recom" value={recomendaciones} onChange={(e) => setRecomendaciones(e.target.value)} rows={6} className={areaCls} />
            </div>
          </div>
        </div>

        {/* Derecha — estado y materia prima */}
        <aside className="space-y-6">
          <div>
            <span className={labelCls}>Estado</span>
            <div className="flex flex-wrap gap-2">
              {ESTADOS_DIAGNOSTICO.map((e) => (
                <button
                  key={e}
                  onClick={() => setEstado(e)}
                  className={`font-mono-hud inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 transition-colors ${
                    estado === e
                      ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
                      : "text-cdm-muted ring-cdm-line hover:text-cdm-fg"
                  }`}
                >
                  {ESTADO_LABEL[e]}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-cdm-line p-4">
            <button
              onClick={() => setVerRelevamiento((v) => !v)}
              className="font-mono-hud flex w-full items-center justify-between text-[10px] uppercase tracking-[0.18em] text-cdm-muted transition-colors hover:text-cdm-fg"
            >
              <span>Relevamiento crudo</span>
              <span>{verRelevamiento ? "−" : "+"}</span>
            </button>
            {verRelevamiento && (
              <pre className="mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-cdm-fg/80">
                {diag.relevamiento || "Sin relevamiento cargado."}
              </pre>
            )}
          </div>

          {diag.cotizacion_id && (
            <Link
              href={`/cotizaciones/${diag.cotizacion_id}/revision`}
              className="block border border-cdm-line p-4 transition-colors hover:border-cdm-accent/40"
            >
              <p className="font-mono-hud text-[10px] uppercase tracking-[0.18em] text-cdm-muted">
                Cotización vinculada
              </p>
              <p className="mt-1 text-[13px] text-cdm-fg">Abrir la mesa →</p>
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
