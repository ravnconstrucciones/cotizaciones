"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  Desglose,
  ItemDesglose,
  ParametroReceta,
  PrecioItem,
  Receta,
  Revision,
} from "@/lib/cotizador/tipos";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { CifraHeroica } from "@/components/cockpit/cifra-heroica";

/** Fila mínima de `recetas` que necesita el selector (Task 6, panel exploratorio). */
export type RecetaOpcion = Pick<
  Receta,
  "id" | "nombre" | "titulo" | "estado" | "parametros" | "preguntas_abiertas" | "version"
>;

type TakeoffOk = {
  desglose: Desglose;
  revision: Revision;
  total_min: number;
  total_max: number;
  revisado: Record<string, string>;
};

type RefreshResp = { actualizados: number; sin_precio: string[] };

const CHECK_COLOR: Record<string, string> = {
  ok: "text-emerald-400",
  fuera_de_rango: "text-red-400",
  sin_datos: "text-amber-300",
};

const CHECK_ICONO: Record<string, string> = {
  ok: "✓",
  fuera_de_rango: "✗",
  sin_datos: "?",
};

const INPUT_CLS =
  "mt-1 block w-full border-0 border-b border-cdm-line bg-transparent px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]";

const INPUT_CLS_FALTA =
  "mt-1 block w-full border-0 border-b border-amber-300/70 bg-amber-300/[0.06] px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-amber-300 focus-visible:outline-none";

/** "hace 2 h" / "hace 3 días" / "hace 1 mes" — traza de vigencia del precio. */
function haceCuanto(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "sin fecha";
  const diffMs = Date.now() - then;
  const minutos = Math.floor(diffMs / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `hace ${dias} día${dias === 1 ? "" : "s"}`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} mes${meses === 1 ? "" : "es"}`;
  const anios = Math.floor(meses / 12);
  return `hace ${anios} año${anios === 1 ? "" : "s"}`;
}

function fuentesDeItem(precios: PrecioItem): { label: string; fuente: string; fecha: string }[] {
  const out: { label: string; fuente: string; fecha: string }[] = [];
  if (precios.sismat) out.push({ label: "SISMAT", fuente: precios.sismat.fuente, fecha: precios.sismat.fecha });
  if (precios.internet)
    out.push({ label: "Internet", fuente: precios.internet.fuente, fecha: precios.internet.fecha });
  if (precios.retail) out.push({ label: "Retail", fuente: precios.retail.fuente, fecha: precios.retail.fecha });
  return out;
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="cdm-glass mb-6 p-5">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-cdm-accent">
        {titulo}
      </h2>
      <div className="border-t border-cdm-line pt-3">{children}</div>
    </section>
  );
}

function CampoParametro({
  parametro,
  value,
  onChange,
  falta,
}: {
  parametro: ParametroReceta;
  value: string;
  onChange: (v: string) => void;
  falta: boolean;
}) {
  const cls = falta ? INPUT_CLS_FALTA : INPUT_CLS;
  return (
    <label className="block text-xs text-cdm-muted">
      {parametro.etiqueta}
      {parametro.requerido && <span className="text-amber-300"> *</span>}
      {parametro.tipo === "opcion" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">— elegir —</option>
          {(parametro.opciones ?? []).map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={parametro.tipo === "numero" ? "number" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
      {falta && (
        <span className="mt-1 block text-[10px] text-amber-300">
          Este dato falta — la receta lo necesita para calcular.
        </span>
      )}
    </label>
  );
}

/** Agrupa los ítems del desglose por etapa, preservando el orden de llegada. */
function agruparPorEtapa(items: ItemDesglose[]): Array<{ nombre: string; items: ItemDesglose[] }> {
  const etapas: Array<{ nombre: string; items: ItemDesglose[] }> = [];
  for (const it of items) {
    const ultima = etapas[etapas.length - 1];
    if (ultima && ultima.nombre === it.etapa) ultima.items.push(it);
    else etapas.push({ nombre: it.etapa, items: [it] });
  }
  return etapas;
}

export function CotizarScreen({
  recetas,
  errorCarga,
}: {
  recetas: RecetaOpcion[];
  errorCarga?: string;
}) {
  const [recetaNombre, setRecetaNombre] = useState<string>("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [faltantes, setFaltantes] = useState<Set<string>>(new Set());
  const [calculando, setCalculando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [refrescoMsg, setRefrescoMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<TakeoffOk | null>(null);
  /** Guardia anti-carrera: solo el pedido más reciente puede escribir el resultado. */
  const calculoSeq = useRef(0);

  const receta = useMemo(
    () => recetas.find((r) => r.nombre === recetaNombre) ?? null,
    [recetas, recetaNombre]
  );

  const cambiarReceta = useCallback((nombre: string) => {
    setRecetaNombre(nombre);
    setValores({});
    setFaltantes(new Set());
    setResultado(null);
    setError(null);
    setRefrescoMsg(null);
  }, []);

  const bodyParametros = useCallback((): Record<string, number | string> => {
    const out: Record<string, number | string> = {};
    for (const p of receta?.parametros ?? []) {
      const raw = valores[p.nombre];
      if (raw === undefined || raw === "") continue;
      out[p.nombre] = p.tipo === "numero" ? Number(raw) : raw;
    }
    return out;
  }, [receta, valores]);

  const calcular = useCallback(async () => {
    if (!receta) return;
    const miSeq = ++calculoSeq.current;
    setCalculando(true);
    setError(null);
    try {
      const res = await fetch("/api/cotizar/takeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receta: receta.nombre, parametros: bodyParametros() }),
      });
      const json = (await res.json().catch(() => null)) as
        | (TakeoffOk & { error?: undefined })
        | { error: string; faltan?: string[] }
        | null;
      // Si mientras esperábamos esta respuesta se disparó un pedido más nuevo
      // (Calcular/Refrescar), esta respuesta quedó obsoleta: no pisar el resultado fresco.
      if (miSeq !== calculoSeq.current) return;
      if (!res.ok) {
        if (json && json.error === "faltan_parametros" && Array.isArray(json.faltan)) {
          // No es un error del sistema: la receta está pidiendo datos.
          setFaltantes(new Set(json.faltan));
          setResultado(null);
          return;
        }
        throw new Error((json as { error?: string })?.error ?? "Error al calcular el take-off");
      }
      setFaltantes(new Set());
      setResultado(json as TakeoffOk);
    } catch (e) {
      if (miSeq !== calculoSeq.current) return;
      setError(e instanceof Error ? e.message : "Error al calcular el take-off");
    } finally {
      if (miSeq === calculoSeq.current) setCalculando(false);
    }
  }, [receta, bodyParametros]);

  const refrescarPrecios = useCallback(async () => {
    if (!receta) return;
    setRefrescando(true);
    setError(null);
    setRefrescoMsg(null);
    try {
      const res = await fetch("/api/cotizar/precios/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receta: receta.nombre }),
      });
      const json = (await res.json().catch(() => null)) as
        | (RefreshResp & { error?: undefined })
        | { error: string }
        | null;
      if (!res.ok) throw new Error((json as { error?: string })?.error ?? "Error al refrescar precios");
      const r = json as RefreshResp;
      setRefrescoMsg(
        `${r.actualizados} actualizados${r.sin_precio.length > 0 ? `; sin precio: ${r.sin_precio.join(", ")}` : ""}`
      );
      // Recalcular automáticamente con los precios frescos.
      await calcular();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al refrescar precios");
    } finally {
      setRefrescando(false);
    }
  }, [receta, calcular]);

  const desglose = resultado?.desglose ?? null;
  const revision = resultado?.revision ?? null;
  const etapas = useMemo(() => (desglose ? agruparPorEtapa(desglose.items) : []), [desglose]);

  return (
    <main className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-10 text-cdm-fg sm:px-6">
      <WavesBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <VolverAlInicio />

        <header className="relative mb-8 pb-4">
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <p className="font-mono-hud flex items-baseline gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
            Cotizadora — Capítulo 1
          </p>
          <h1 className="mt-2 text-2xl font-light">Cotizar</h1>
          <p className="mt-1 text-xs text-cdm-muted">
            Panel exploratorio: elegí una receta, completá los parámetros y calculá el take-off
            en vivo. No crea una cotización formal — eso sigue siendo la mesa de revisión.
          </p>
        </header>

        {errorCarga && (
          <p className="mb-4 border border-red-400/50 bg-red-400/[0.08] px-4 py-3 text-sm text-red-400">
            {errorCarga}
          </p>
        )}
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <Seccion titulo="Receta">
          {recetas.length === 0 ? (
            <p className="text-xs text-cdm-muted">
              {errorCarga
                ? "No se pudo traer el listado de recetas por el error de arriba."
                : "Todavía no hay recetas cargadas."}
            </p>
          ) : (
            <label className="block max-w-xl text-xs text-cdm-muted">
              Elegí la receta a cotizar
              <select
                value={recetaNombre}
                onChange={(e) => cambiarReceta(e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">— seleccionar —</option>
                {recetas.map((r) => (
                  <option key={r.nombre} value={r.nombre}>
                    {r.estado === "candidata" ? "[CANDIDATA] " : ""}
                    {r.titulo} (v{r.version})
                  </option>
                ))}
              </select>
            </label>
          )}

          {receta && receta.estado === "candidata" && (
            <div className="mt-4 border border-amber-300/50 bg-amber-300/[0.08] p-4">
              <p className="font-mono-hud text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
                CANDIDATA
              </p>
              <p className="mt-1 text-xs text-amber-200">
                El sistema no pudo determinar esto — se construye con Eze.
              </p>
              {Array.isArray(receta.preguntas_abiertas) && receta.preguntas_abiertas.length > 0 && (
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-100">
                  {receta.preguntas_abiertas.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Seccion>

        {receta && (
          <Seccion titulo="Parámetros">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(receta.parametros ?? []).map((p) => (
                <CampoParametro
                  key={p.nombre}
                  parametro={p}
                  value={valores[p.nombre] ?? ""}
                  falta={faltantes.has(p.nombre)}
                  onChange={(v) => setValores((prev) => ({ ...prev, [p.nombre]: v }))}
                />
              ))}
            </div>
            {faltantes.size > 0 && (
              <p className="mt-4 text-xs text-amber-300">
                Faltan completar {faltantes.size} dato(s) marcado(s) arriba — la receta los
                necesita para poder calcular.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={calculando || refrescando}
                onClick={() => void calcular()}
                className="cdm-chip cursor-pointer border border-cdm-accent/60 bg-cdm-accent/15 px-4 py-2 text-xs uppercase tracking-[0.14em] text-cdm-accent shadow-[0_0_18px_-6px_rgba(34,211,238,0.55)] transition-colors hover:bg-cdm-accent/25 disabled:opacity-50"
              >
                {calculando ? "Calculando…" : "Calcular"}
              </button>
              <button
                type="button"
                disabled={calculando || refrescando}
                onClick={() => void refrescarPrecios()}
                className="cdm-chip cursor-pointer border border-cdm-line px-4 py-2 text-xs uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg disabled:opacity-50"
              >
                {refrescando ? "Refrescando…" : "Refrescar precios ahora"}
              </button>
              {refrescoMsg && <span className="text-xs text-cdm-muted">{refrescoMsg}</span>}
            </div>
          </Seccion>
        )}

        {desglose && resultado && (
          <>
            <header className="mb-2">
              <CifraHeroica className="text-[clamp(24px,2.2vw,36px)] leading-none">
                {formatMoneyInt(resultado.total_min)} – {formatMoneyInt(resultado.total_max)}
              </CifraHeroica>
            </header>

            <Seccion titulo="Ítems — cantidades por fórmula y precio">
              {etapas.map((etapa, ei) => (
                <div key={ei} className="mb-5 last:mb-0">
                  <p className="font-mono-hud mb-2 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                    {etapa.nombre}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                          <th className="py-2 pr-3">Ítem</th>
                          <th className="py-2 pr-3">Tipo</th>
                          <th className="py-2 pr-3 text-right">Cant.</th>
                          <th className="py-2 pr-3 text-right">Precio</th>
                          <th className="py-2 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cdm-line">
                        {etapa.items.map((it, i) => {
                          const revisadoIso = resultado.revisado[it.nombre];
                          const fuentes = fuentesDeItem(it.precios);
                          return (
                            <tr key={i} className={it.sin_precio ? "bg-amber-300/10" : undefined}>
                              <td className="py-2 pr-3">{it.nombre}</td>
                              <td className="py-2 pr-3 text-cdm-muted">
                                {it.tipo === "material" ? "Mat." : "M.O."}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {it.cantidad} {it.unidad}
                                <span className="block text-[10px] font-mono text-cdm-muted">
                                  {it.formula}
                                  {it.desperdicio_pct > 0 ? ` +${it.desperdicio_pct}% desp.` : ""}
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {it.sin_precio ? (
                                  <span className="font-semibold text-amber-300">
                                    SIN PRECIO — pregunta abierta, no se inventa
                                  </span>
                                ) : (
                                  <>
                                    {formatMoneyInt(it.precio_min ?? 0)} –{" "}
                                    {formatMoneyInt(it.precio_max ?? 0)}
                                    <span className="block text-[10px] text-cdm-muted">
                                      {fuentes.map((f) => `${f.label} · ${f.fecha}`).join(" · ")}
                                      {revisadoIso ? ` · revisado ${haceCuanto(revisadoIso)}` : ""}
                                    </span>
                                  </>
                                )}
                              </td>
                              <td className="py-2 text-right tabular-nums">
                                {it.sin_precio
                                  ? "—"
                                  : `${formatMoneyInt(it.subtotal_min)} – ${formatMoneyInt(it.subtotal_max)}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {desglose.extras.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {desglose.extras.map((ex, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {ex.nombre}{" "}
                        <span className="text-cdm-muted">
                          ({ex.fuente} · {ex.fecha})
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {formatMoneyInt(ex.monto_min)} – {formatMoneyInt(ex.monto_max)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <dl className="mt-4 space-y-1 border-t border-cdm-line pt-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-cdm-muted">Materiales</dt>
                  <dd className="tabular-nums">
                    {formatMoneyInt(desglose.totales.materiales_min)} –{" "}
                    {formatMoneyInt(desglose.totales.materiales_max)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-cdm-muted">Mano de obra</dt>
                  <dd className="tabular-nums">
                    {formatMoneyInt(desglose.totales.mano_de_obra_min)} –{" "}
                    {formatMoneyInt(desglose.totales.mano_de_obra_max)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-cdm-muted">Extras</dt>
                  <dd className="tabular-nums">
                    {formatMoneyInt(desglose.totales.extras_min)} –{" "}
                    {formatMoneyInt(desglose.totales.extras_max)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-cdm-muted">
                    Imprevistos {desglose.totales.imprevistos_pct}% · Factor zona{" "}
                    {desglose.totales.factor_zona_min}–{desglose.totales.factor_zona_max}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {formatMoneyInt(desglose.totales.total_min)} –{" "}
                    {formatMoneyInt(desglose.totales.total_max)}
                  </dd>
                </div>
                <div className="flex justify-between text-cdm-muted">
                  <dt>Tiempo estimado</dt>
                  <dd>
                    {desglose.tiempo.dias_min}–{desglose.tiempo.dias_max} días ·{" "}
                    {desglose.tiempo.cuadrilla_max} persona(s)
                  </dd>
                </div>
              </dl>
            </Seccion>

            {revision && (
              <Seccion titulo="Revisión">
                {revision.sanidad.some((s) => s.estado !== "ok") && (
                  <div className="mb-3">
                    <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                      Sanidad física
                    </p>
                    <ul className="space-y-1 text-xs">
                      {revision.sanidad
                        .filter((s) => s.estado !== "ok")
                        .map((s, i) => (
                          <li key={i} className="flex gap-2">
                            <span className={CHECK_COLOR[s.estado]}>{CHECK_ICONO[s.estado]}</span>
                            <span className="font-medium">{s.chequeo}</span>
                            <span className="text-cdm-muted">— {s.detalle}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {revision.precios_vencidos.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                      Precios vencidos
                    </p>
                    <ul className="space-y-1 text-xs text-amber-300">
                      {revision.precios_vencidos.map((v, i) => (
                        <li key={i}>
                          {v.item} — {v.fuente} del {v.fecha} ({v.dias} días; límite {v.limite}d).
                          Re-buscar antes de aprobar.
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {revision.divergencias.length > 0 && (
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                      Divergencias SISMAT vs internet
                    </p>
                    <ul className="space-y-1 text-xs">
                      {revision.divergencias.map((d, i) => (
                        <li
                          key={i}
                          className={d.nivel === "critica" ? "text-red-400" : "text-amber-300"}
                        >
                          {d.nivel === "critica" ? "⚠ " : ""}
                          {d.item}: SISMAT {formatMoneyInt(d.sismat)} vs internet{" "}
                          {formatMoneyInt(d.internet)} ({d.divergencia_pct}%)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {revision.sanidad.every((s) => s.estado === "ok") &&
                  revision.precios_vencidos.length === 0 &&
                  revision.divergencias.length === 0 && (
                    <p className="text-xs text-emerald-400">
                      Sin alertas de sanidad, precios vencidos ni divergencias.
                    </p>
                  )}
              </Seccion>
            )}
          </>
        )}
      </div>
    </main>
  );
}
