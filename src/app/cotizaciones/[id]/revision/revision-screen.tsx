"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  CotizacionRow,
  Desglose,
  FuenteReceta,
  PrecioFechado,
  Revision,
} from "@/lib/cotizador/tipos";
import { formatMoneyInt } from "@/lib/format-currency";
import { createClient } from "@/lib/supabase/client";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { CifraHeroica } from "@/components/cockpit/cifra-heroica";
import { ConversacionPanel } from "./conversacion-panel";
import { ESTADO_COLOR, ESTADO_LABEL } from "../../cotizaciones-screen";

type RecetaJoin = {
  id: string;
  nombre: string;
  titulo: string;
  estado: "investigada" | "confiable";
  fuentes: FuenteReceta[];
  version: number;
} | null;

/** Opción del selector de obra (fila mínima de `presupuestos`). */
type PresupuestoOpcion = {
  id: string;
  nombre_obra: string | null;
  nombre_cliente: string | null;
};

type Detalle = CotizacionRow & {
  receta: RecetaJoin;
  presupuesto: PresupuestoOpcion | null;
};

function etiquetaPresupuesto(p: PresupuestoOpcion): string {
  const obra = p.nombre_obra?.trim() || "Sin nombre de obra";
  const cliente = p.nombre_cliente?.trim();
  return cliente ? `${obra} — ${cliente}` : obra;
}

const CHECK_COLOR: Record<string, string> = {
  cubierto: "text-emerald-400",
  ok: "text-emerald-400",
  faltante: "text-red-400",
  fuera_de_rango: "text-red-400",
  no_aplica: "text-cdm-muted",
  sin_datos: "text-amber-300",
};

const CHECK_ICONO: Record<string, string> = {
  cubierto: "✓",
  ok: "✓",
  faltante: "✗",
  fuera_de_rango: "✗",
  no_aplica: "—",
  sin_datos: "?",
};

const INPUT_CLS =
  "mt-1 block w-full border-0 border-b border-cdm-line bg-transparent px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]";

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

function PrecioCelda({ precio }: { precio?: PrecioFechado }) {
  if (!precio) return <span className="text-cdm-muted">—</span>;
  return (
    <span title={`${precio.fuente} · ${precio.fecha}`}>
      {formatMoneyInt(precio.valor)}
      <span className="block text-[10px] text-cdm-muted">
        {precio.fuente} · {precio.fecha}
      </span>
    </span>
  );
}

export function RevisionScreen({ id }: { id: string }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [importeFinal, setImporteFinal] = useState("");
  const [motivo, setMotivo] = useState("");
  const [mostrarRechazo, setMostrarRechazo] = useState(false);

  const [docCliente, setDocCliente] = useState("");
  const [docLugar, setDocLugar] = useState("");
  const [docFormaPago, setDocFormaPago] = useState("");
  const [docPlazo, setDocPlazo] = useState("");
  const [docNotas, setDocNotas] = useState("VALIDEZ DE OFERTA: 10 DÍAS CORRIDOS");

  // Selector de obra (loop de oro §6.2.5): opciones desde `presupuestos`.
  const [presupuestos, setPresupuestos] = useState<PresupuestoOpcion[]>([]);
  const [vinculando, setVinculando] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("presupuestos")
      .select("id, nombre_obra, nombre_cliente, fecha")
      .order("fecha", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setPresupuestos((data as PresupuestoOpcion[] | null) ?? []);
      });
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar");
      setDetalle(json.cotizacion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(path: string, body: Record<string, unknown>) {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setEnviando(false);
    }
  }

  async function vincularObra(presupuestoId: string) {
    setVinculando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presupuesto_id: presupuestoId || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al vincular la obra");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al vincular la obra");
    } finally {
      setVinculando(false);
    }
  }

  if (cargando) {
    return (
      <main className="font-grotesk relative min-h-screen bg-cdm-bg px-6 py-10 text-cdm-fg">
        <WavesBackdrop />
        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <VolverAlInicio />
          <p className="text-sm text-cdm-muted">Cargando…</p>
        </div>
      </main>
    );
  }
  if (!detalle) {
    return (
      <main className="font-grotesk relative min-h-screen bg-cdm-bg px-6 py-10 text-cdm-fg">
        <WavesBackdrop />
        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <VolverAlInicio />
          <p className="text-sm text-red-400">{error ?? "Cotización no encontrada."}</p>
        </div>
      </main>
    );
  }

  const desglose =
    detalle.desglose && "items" in detalle.desglose ? (detalle.desglose as Desglose) : null;
  const revision = (detalle.revision ?? null) as Revision | null;
  const receta = detalle.receta;

  return (
    <main className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-10 text-cdm-fg sm:px-6">
      <WavesBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <VolverAlInicio />

        <header className="relative mb-8 pb-4">
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-cdm-muted">
                <span
                  aria-hidden
                  className="h-[5px] w-[5px] bg-cdm-accent shadow-[0_0_8px_rgba(34,211,238,0.9)]"
                />
                Mesa de revisión
              </p>
              <h1 className="mt-2 text-2xl font-light">{detalle.titulo}</h1>
              <p className="mt-1 text-xs text-cdm-muted">
                {detalle.zona ? `${detalle.zona} · ` : ""}
                {new Date(detalle.creado_at).toLocaleDateString("es-AR")}
              </p>
            </div>
            <span
              className={`cdm-chip border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${ESTADO_COLOR[detalle.estado]}`}
            >
              {ESTADO_LABEL[detalle.estado]}
            </span>
          </div>
          {detalle.total_min != null && detalle.total_max != null && (
            <p className="mt-5">
              <CifraHeroica className="text-[clamp(26px,2.4vw,40px)] leading-none">
                {formatMoneyInt(detalle.total_min)} – {formatMoneyInt(detalle.total_max)}
              </CifraHeroica>
            </p>
          )}
        </header>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            {receta && (
              <Seccion titulo="Receta">
                <p className="text-sm">
                  {receta.titulo}{" "}
                  <span className="text-xs text-cdm-muted">
                    ({receta.nombre} · v{receta.version})
                  </span>
                </p>
                {receta.estado === "investigada" ? (
                  <p className="mt-2 border border-amber-300/40 px-3 py-2 text-xs text-amber-300">
                    RECETA INVESTIGADA — sin validar en obra todavía. Revisá las fuentes con más
                    dureza (protocolo &quot;Seia no lo tiene&quot;, spec §6.3).
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-emerald-400">
                    Receta confiable (validada en obra).
                  </p>
                )}
                {Array.isArray(receta.fuentes) && receta.fuentes.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-cdm-muted">
                    {receta.fuentes.map((f, i) => (
                      <li key={i}>
                        [{f.tipo}] {f.titulo} · {f.fecha}
                        {f.url ? ` · ${f.url}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </Seccion>
            )}

            {desglose && (
              <Seccion titulo="Ítems — cantidades por fórmula y doble precio">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                        <th className="py-2 pr-3">Etapa</th>
                        <th className="py-2 pr-3">Ítem</th>
                        <th className="py-2 pr-3">Fórmula</th>
                        <th className="py-2 pr-3 text-right">Cant.</th>
                        <th className="py-2 pr-3 text-right">SISMAT</th>
                        <th className="py-2 pr-3 text-right">Internet</th>
                        <th className="py-2 pr-3 text-right">Δ%</th>
                        <th className="py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cdm-line">
                      {desglose.items.map((it, i) => {
                        const divergente = it.divergencia_pct != null && it.divergencia_pct > 25;
                        return (
                          <tr key={i} className={divergente ? "bg-red-400/5" : undefined}>
                            <td className="py-2 pr-3 text-cdm-muted">{it.etapa}</td>
                            <td className="py-2 pr-3">
                              {it.nombre}
                              {it.sin_precio && (
                                <span className="ml-1 text-[10px] text-amber-300">SIN PRECIO</span>
                              )}
                            </td>
                            <td className="py-2 pr-3 font-mono text-[10px] text-cdm-muted">
                              {it.formula}
                              {it.desperdicio_pct > 0 ? ` +${it.desperdicio_pct}% desp.` : ""}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {it.cantidad} {it.unidad}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              <PrecioCelda precio={it.precios.sismat} />
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              <PrecioCelda precio={it.precios.internet} />
                            </td>
                            <td
                              className={`py-2 pr-3 text-right tabular-nums ${divergente ? "font-semibold text-red-400" : "text-cdm-muted"}`}
                            >
                              {it.divergencia_pct != null ? `${it.divergencia_pct}%` : "—"}
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

                {desglose.extras.length > 0 && (
                  <ul className="mt-4 space-y-1 text-xs">
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
            )}

            {revision && (
              <>
                <Seccion titulo="Checklist anti-olvidos">
                  <ul className="space-y-1 text-xs">
                    {revision.checklist.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={CHECK_COLOR[c.estado]}>{CHECK_ICONO[c.estado]}</span>
                        <span className="font-medium">{c.item}</span>
                        <span className="text-cdm-muted">— {c.detalle}</span>
                      </li>
                    ))}
                  </ul>
                </Seccion>

                <Seccion titulo="Sanidad física">
                  <ul className="space-y-1 text-xs">
                    {revision.sanidad.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={CHECK_COLOR[s.estado]}>{CHECK_ICONO[s.estado]}</span>
                        <span className="font-medium">{s.chequeo}</span>
                        <span className="text-cdm-muted">— {s.detalle}</span>
                      </li>
                    ))}
                  </ul>
                </Seccion>

                {revision.precios_vencidos.length > 0 && (
                  <Seccion titulo="Precios vencidos">
                    <ul className="space-y-1 text-xs text-amber-300">
                      {revision.precios_vencidos.map((v, i) => (
                        <li key={i}>
                          {v.item} — {v.fuente} del {v.fecha} ({v.dias} días; límite {v.limite}d).
                          Re-buscar antes de aprobar.
                        </li>
                      ))}
                    </ul>
                  </Seccion>
                )}

                {revision.dudas.length > 0 && (
                  <Seccion titulo="Dudas abiertas del sistema">
                    <ul className="list-inside list-disc space-y-1 text-xs">
                      {revision.dudas.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </Seccion>
                )}
              </>
            )}

            <Seccion titulo="Obra vinculada — loop de oro">
              <p className="mb-2 text-xs text-cdm-muted">
                Vinculá la cotización a la obra (presupuesto) para que, al finalizarla, el
                contraste cotizado vs gastado real deje su lección (spec §6.2.5). Es opcional,
                pero sin vínculo el loop de oro no corre para esta cotización.
              </p>
              <select
                value={detalle.presupuesto_id ?? ""}
                disabled={vinculando}
                onChange={(e) => void vincularObra(e.target.value)}
                className="block w-full max-w-md border border-cdm-line bg-cdm-panel/60 px-3 py-2 text-sm text-cdm-fg focus:border-cdm-accent focus:outline-none disabled:opacity-50"
              >
                <option value="">— sin obra vinculada —</option>
                {presupuestos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {etiquetaPresupuesto(p)}
                  </option>
                ))}
              </select>
              {detalle.presupuesto ? (
                <p className="mt-2 text-xs text-emerald-400">
                  Vinculada a: {etiquetaPresupuesto(detalle.presupuesto)}
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-300">
                  Sin obra vinculada — el contraste al cerrar obra NO va a correr para esta
                  cotización.
                </p>
              )}
            </Seccion>

            {detalle.estado === "en_revision" && (
              <Seccion titulo="Decisión">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-xs text-cdm-muted">
                    Importe final (opcional, ARS)
                    <input
                      value={importeFinal}
                      onChange={(e) => setImporteFinal(e.target.value.replace(/[^\d]/g, ""))}
                      inputMode="numeric"
                      placeholder={detalle.total_max != null ? String(detalle.total_max) : ""}
                      className={`${INPUT_CLS} w-44`}
                    />
                  </label>
                  <button
                    disabled={enviando}
                    onClick={() =>
                      void accion("aprobar", {
                        importe_final: importeFinal ? Number(importeFinal) : undefined,
                      })
                    }
                    className="cdm-chip cursor-pointer border border-emerald-400/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-emerald-400 transition-colors hover:bg-emerald-400/10 disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                  <button
                    disabled={enviando}
                    onClick={() => setMostrarRechazo((v) => !v)}
                    className="cdm-chip cursor-pointer border border-red-400/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
                  >
                    Rechazar…
                  </button>
                </div>
                {mostrarRechazo && (
                  <div className="mt-4">
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      rows={2}
                      placeholder="Motivo del rechazo (va a cotizador_lecciones — sé concreto)"
                      className={`${INPUT_CLS} w-full`}
                    />
                    <button
                      disabled={enviando || !motivo.trim()}
                      onClick={() => void accion("rechazar", { motivo })}
                      className="cdm-chip mt-2 cursor-pointer border border-red-400/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
                    >
                      Confirmar rechazo
                    </button>
                  </div>
                )}
              </Seccion>
            )}

            {detalle.estado === "aprobada" && (
              <Seccion titulo="Emitir documento oficial">
                <p className="mb-3 text-xs text-cdm-muted">
                  Aprobada el {revision?.aprobacion?.fecha ?? "—"}
                  {revision?.aprobacion?.importe_final != null
                    ? ` · importe final ${formatMoneyInt(revision.aprobacion.importe_final)}`
                    : ""}
                  . Completá los datos del documento (formato Presupuesto oficial).
                </p>
                <div className="grid max-w-xl gap-3 text-xs">
                  <label className="text-cdm-muted">
                    Cliente
                    <input
                      value={docCliente}
                      onChange={(e) => setDocCliente(e.target.value)}
                      className={INPUT_CLS}
                    />
                  </label>
                  <label className="text-cdm-muted">
                    Lugar
                    <input
                      value={docLugar}
                      onChange={(e) => setDocLugar(e.target.value)}
                      className={INPUT_CLS}
                    />
                  </label>
                  <label className="text-cdm-muted">
                    Forma de pago (una línea por renglón)
                    <textarea
                      value={docFormaPago}
                      onChange={(e) => setDocFormaPago(e.target.value)}
                      rows={3}
                      className={INPUT_CLS}
                    />
                  </label>
                  <label className="text-cdm-muted">
                    Plazo (una línea por renglón)
                    <textarea
                      value={docPlazo}
                      onChange={(e) => setDocPlazo(e.target.value)}
                      rows={2}
                      className={INPUT_CLS}
                    />
                  </label>
                  <label className="text-cdm-muted">
                    Notas (una línea por renglón)
                    <textarea
                      value={docNotas}
                      onChange={(e) => setDocNotas(e.target.value)}
                      rows={2}
                      className={INPUT_CLS}
                    />
                  </label>
                  <button
                    disabled={enviando || !docCliente.trim() || !docLugar.trim()}
                    onClick={() =>
                      void accion("emitir", {
                        cliente: docCliente,
                        lugar: docLugar,
                        forma_pago: docFormaPago,
                        plazo: docPlazo,
                        notas: docNotas,
                      })
                    }
                    className="cdm-chip w-fit cursor-pointer border border-cdm-accent/60 bg-cdm-accent/15 px-4 py-2 text-xs uppercase tracking-[0.14em] text-cdm-accent shadow-[0_0_18px_-6px_rgba(34,211,238,0.55)] transition-colors hover:bg-cdm-accent/25 disabled:opacity-50"
                  >
                    Emitir documento
                  </button>
                </div>
              </Seccion>
            )}

            {detalle.estado === "documento_emitido" && (
              <Seccion titulo="Documento">
                <Link
                  href={`/cotizaciones/${id}/documento`}
                  className="cdm-chip inline-block border border-cdm-accent/60 bg-cdm-accent/15 px-4 py-2 text-xs uppercase tracking-[0.14em] text-cdm-accent shadow-[0_0_18px_-6px_rgba(34,211,238,0.55)] transition-colors hover:bg-cdm-accent/25"
                >
                  Ver documento oficial →
                </Link>
              </Seccion>
            )}

            {detalle.estado === "rechazada" && (
              <Seccion titulo="Rechazada">
                <p className="text-xs text-red-400">
                  Motivo: {detalle.motivo_rechazo ?? "—"} (quedó como lección en
                  cotizador_lecciones)
                </p>
              </Seccion>
            )}
          </div>

          {/* Columna derecha: el hilo de ESTA cotización (sticky en desktop). */}
          <div className="xl:sticky xl:top-6">
            <ConversacionPanel
              cotizacionId={id}
              estado={detalle.estado}
              onCambioEstado={() => void cargar()}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
