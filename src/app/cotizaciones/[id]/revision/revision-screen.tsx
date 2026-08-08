"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type DragEvent } from "react";
import { motion } from "framer-motion";
import type {
  CotizacionRow,
  Desglose,
  FuenteReceta,
  Revision,
} from "@/lib/cotizador/tipos";
import { compatDesglose } from "@/lib/cotizador/desglose-compat";
import { formatMoneyInt } from "@/lib/format-currency";
import { esUuid } from "@/lib/uuid";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { CifraHeroica } from "@/components/cockpit/cifra-heroica";
import { MesaChat } from "./mesa-chat";
import { HojaViva } from "./hoja-viva";
import { PropuestaViva } from "./propuesta-viva";
import { FotosPanel } from "./fotos-panel";
import { ESTADO_COLOR, ESTADO_LABEL } from "../../cotizaciones-screen";
import { MAX_SUBIDA_BYTES } from "@/lib/cotizador/subida-directa";
import { subirDirecto } from "@/lib/subida-directa-cliente";

const MAX_SUBIDA_MB = Math.round(MAX_SUBIDA_BYTES / 1024 / 1024);

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

/**
 * Desglose vacío (fix ronda final finding 5): una cotización nueva nace con
 * `desglose: {}` — sin esto, la pestaña Rubros solo muestra el placeholder y
 * el alta manual del primer ítem nunca puede arrancar mientras el puente
 * está caído (contradice el ADR "la mesa sigue viva con el puente caído").
 * Se monta HojaViva igual, con totales en cero — el motor los recalcula en
 * cuanto entra el primer ítem.
 */
const DESGLOSE_VACIO: Desglose = {
  receta_nombre: "",
  receta_version: 0,
  parametros: {},
  items: [],
  extras: [],
  totales: {
    materiales_min: 0,
    materiales_max: 0,
    mano_de_obra_min: 0,
    mano_de_obra_max: 0,
    extras_min: 0,
    extras_max: 0,
    subtotal_min: 0,
    subtotal_max: 0,
    imprevistos_pct: 0,
    factor_zona_min: 1,
    factor_zona_max: 1,
    total_min: 0,
    total_max: 0,
  },
  tiempo: { dias_min: 0, dias_max: 0, cuadrilla_max: 0 },
  generado_at: new Date(0).toISOString(),
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

export function RevisionScreen({ id }: { id: string }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [importeFinal, setImporteFinal] = useState("");
  const [motivo, setMotivo] = useState("");
  const [mostrarRechazo, setMostrarRechazo] = useState(false);

  // Layout B (spec 2026-07-25): pestaña activa del panel derecho + versión de
  // fotos (se bumpea tras un drop para que Propuesta/Fotos re-fetcheen).
  // 26/07: "Rubros" salió del panel — la hoja vive full-width abajo del chat.
  const [pestana, setPestana] = useState<"propuesta" | "fotos">("propuesta");
  const [versionFotos, setVersionFotos] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);

  const [docCliente, setDocCliente] = useState("");
  const [docLugar, setDocLugar] = useState("");
  const [docFormaPago, setDocFormaPago] = useState("");
  const [docPlazo, setDocPlazo] = useState("");
  const [docNotas, setDocNotas] = useState("VALIDEZ DE OFERTA: 10 DÍAS CORRIDOS");

  // Precarga de la emisión desde el borrador vivo de la mesa (spec 2026-07-25).
  const [docPrecargado, setDocPrecargado] = useState(false);
  useEffect(() => {
    const b = detalle?.revision?.documento_borrador;
    if (!b || docPrecargado) return;
    setDocPrecargado(true);
    if (b.cliente) setDocCliente((v) => v || b.cliente);
    if (b.lugar) setDocLugar((v) => v || b.lugar);
    if (b.forma_pago.length) setDocFormaPago((v) => v || b.forma_pago.join("\n"));
    if (b.plazo.length) setDocPlazo((v) => v || b.plazo.join("\n"));
    if (b.notas.length) setDocNotas((v) => (v === "VALIDEZ DE OFERTA: 10 DÍAS CORRIDOS" || !v ? b.notas.join("\n") : v));
  }, [detalle, docPrecargado]);

  // Precio de la propuesta (spec 08/08): campo suelto, editable en cualquier
  // estado — lo fija Eze, no lo calcula el motor. Solo se sincroniza desde el
  // servidor mientras el campo no fue tocado, para no pisar una edición en
  // curso cuando el realtime dispara un refresh silencioso.
  const [precioPropuesta, setPrecioPropuesta] = useState("");
  const [precioPropuestaTocado, setPrecioPropuestaTocado] = useState(false);
  const [guardandoPropuesta, setGuardandoPropuesta] = useState(false);

  useEffect(() => {
    if (precioPropuestaTocado) return;
    setPrecioPropuesta(detalle?.precio_propuesta != null ? String(detalle.precio_propuesta) : "");
  }, [detalle?.precio_propuesta, precioPropuestaTocado]);

  async function guardarPrecioPropuesta() {
    setGuardandoPropuesta(true);
    setError(null);
    try {
      const valor = precioPropuesta.trim() === "" ? null : Number(precioPropuesta);
      const res = await fetch(`/api/cotizaciones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ precio_propuesta: valor }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Error al guardar la propuesta");
      setPrecioPropuestaTocado(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar la propuesta");
    } finally {
      setGuardandoPropuesta(false);
    }
  }

  // Selector de obra (loop de oro §6.2.5): opciones desde `presupuestos`.
  const [presupuestos, setPresupuestos] = useState<PresupuestoOpcion[]>([]);
  const [vinculando, setVinculando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const supabase = createClient();
    supabase
      .from("presupuestos")
      .select("id, nombre_obra, nombre_cliente, fecha")
      .order("fecha", { ascending: false })
      .limit(100)
      .then(({ data, error: errP }) => {
        if (!vivo) return;
        if (errP) {
          // El selector de obra es opcional (loop de oro): si falla, queda vacío
          // y la mesa sigue funcionando. No pisamos el error principal de carga.
          console.error("[revision] presupuestos:", errP.message);
          setPresupuestos([]);
          return;
        }
        setPresupuestos(Array.isArray(data) ? (data as PresupuestoOpcion[]) : []);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // silencioso: refresco sin skeleton (la hoja viva re-pide datos tras cada
  // edición y no debe desmontarse — perdería la pestaña activa).
  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${id}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; cotizacion?: Detalle }
        | null;
      if (!res.ok) throw new Error(json?.error ?? "Error al cargar");
      setDetalle(json?.cotizacion ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Estable para MesaChat: si fuera un arrow inline en el JSX, cada setState
  // de esta pantalla (tipear en docCliente, importeFinal, etc.) recrearía la
  // prop y reiniciaría los efectos de MesaChat (re-fetch, resuscripción del
  // canal Realtime y el setInterval del latido de 30s).
  const actividadMotor = useCallback(() => void cargar(true), [cargar]);

  // Realtime de la cotización (Fable/Codex editan desde afuera de la mesa):
  // mismo callback estable que usa MesaChat, no hace falta duplicar lógica.
  useRealtimeTable("cotizaciones", actividadMotor);

  // Drop global de fotos (patrón de command-bar.tsx): sube cada imagen suelta
  // como "foto", avisa al hilo con un mensaje de sistema (adjuntos) y salta a
  // la pestaña Fotos para que Eze vea el resultado.
  async function soltarFotos(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setArrastrando(false);
    setError(null);
    const sueltas = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (sueltas.length === 0) return;
    // Subida DIRECTA a Supabase Storage (firmar → bucket → confirmar): ya no
    // pasa por el body de la función de Vercel, así que el techo es el del
    // bucket (25 MB acá) y no los ~4,5 MB de plataforma.
    const pesadas = sueltas.filter((f) => f.size > MAX_SUBIDA_BYTES);
    const files = sueltas.filter((f) => f.size <= MAX_SUBIDA_BYTES);
    const adjuntos: Array<{ archivo_id: string; storage_path: string; titulo?: string }> = [];
    for (const file of files) {
      // Fallo en esta foto puntual: seguimos con el resto del lote, el aviso
      // queda en el conteo de fallos de abajo.
      const r = await subirDirecto({ cotizacionId: id, file, tipo: "foto", titulo: file.name });
      if (r.ok && r.archivo?.id) {
        adjuntos.push({
          archivo_id: r.archivo.id,
          storage_path: r.archivo.storage_path ?? "",
          titulo: file.name,
        });
      }
    }
    const fallidas = files.length - adjuntos.length;
    const avisos: string[] = [];
    if (pesadas.length > 0) {
      avisos.push(
        `Máximo ${MAX_SUBIDA_MB} MB por archivo (${
          pesadas.length === 1 ? "1 foto pesada" : `${pesadas.length} fotos pesadas`
        } sin subir).`
      );
    }
    if (fallidas > 0) {
      avisos.push(
        adjuntos.length === 0
          ? `No se pudo subir ${files.length === 1 ? "la foto" : "ninguna de las fotos"}.`
          : `No se pudieron subir ${fallidas} de ${files.length} fotos.`
      );
    }
    if (avisos.length > 0) setError(avisos.join(" "));
    if (adjuntos.length === 0) return;
    // Aviso al puente por el mismo canal (autor sistema, meta adjuntos).
    await fetch(`/api/cotizaciones/${id}/mensajes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjuntos }),
    });
    setVersionFotos((v) => v + 1);
    setPestana("fotos");
  }

  async function accion(path: string, body: Record<string, unknown>) {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setEnviando(false);
    }
  }

  async function vincularObra(presupuestoId: string) {
    // Vacío = desvincular (null). Si viene un valor, exigimos que sea un uuid
    // antes de pegarle al PATCH (las opciones son uuids; cualquier otra cosa
    // es estado corrupto del DOM y no debe llegar al backend).
    const limpio = presupuestoId.trim();
    if (limpio !== "" && !esUuid(limpio)) {
      setError("La obra seleccionada no es válida (id inesperado).");
      return;
    }
    setVinculando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presupuesto_id: limpio || null }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Error al vincular la obra");
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
          <div className="grid gap-6">
            <div className="cdm-glass p-5">
              <SkeletonGlass filas={5} anchos={["w-2/3", "w-full", "w-1/2", "w-3/4", "w-2/5"]} />
            </div>
            <div className="cdm-glass p-5">
              <SkeletonGlass filas={3} anchos={["w-3/4", "w-1/2", "w-2/3"]} />
            </div>
          </div>
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

  // El chequeo estructural vive en compatDesglose: distingue el Desglose del
  // motor del shape viejo de consola ({item, costo}) y convierte este último
  // en vez de castearlo a ciegas (antes reventaba en rubroDeItem).
  const compat = compatDesglose(detalle.desglose);
  const desglose = compat?.desglose ?? null;
  const desgloseLegacy = compat?.legacy ?? false;
  const revision = (detalle.revision ?? null) as Revision | null;
  const receta = detalle.receta;
  // Mismo predicado en los dos lugares que gatean edición de mesa (Rubros y
  // Decisión): borrador o en_revision — el resto de estados es de solo lectura.
  const editableMesa = detalle.estado === "en_revision" || detalle.estado === "borrador";

  return (
    <main
      className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-10 text-cdm-fg sm:px-6"
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastrando(false);
      }}
      onDrop={(e) => void soltarFotos(e)}
    >
      <WavesBackdrop />
      {arrastrando && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-dashed border-cdm-accent/60 bg-cdm-bg/70 backdrop-blur-sm"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-cdm-accent">
            Soltá las fotos del proyecto
          </p>
        </motion.div>
      )}
      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <VolverAlInicio />

        <header className="relative mb-8 pb-4">
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono-hud flex items-baseline gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
                <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
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
              <span className="ml-2 font-mono-hud text-[10px] uppercase tracking-[0.16em] text-cdm-muted">
                costo estimado
              </span>
            </p>
          )}

          {/* Precio de propuesta (spec 08/08): lo fija Eze, no el motor —
              distinto del costo de arriba. Un campo, un botón, nada más. */}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-xs text-cdm-muted">
              Precio de propuesta (ARS)
              <input
                value={precioPropuesta}
                onChange={(e) => {
                  setPrecioPropuestaTocado(true);
                  setPrecioPropuesta(e.target.value.replace(/[^\d]/g, ""));
                }}
                inputMode="numeric"
                placeholder="Sin definir"
                className={`${INPUT_CLS} w-44`}
              />
            </label>
            <button
              disabled={guardandoPropuesta}
              onClick={() => void guardarPrecioPropuesta()}
              className="cdm-chip cursor-pointer border border-cdm-accent/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent/10 disabled:opacity-50"
            >
              {guardandoPropuesta ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </header>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {/* Layout B (spec 2026-07-25): mesa a la izquierda, pestañas a la
            derecha. En mobile (<lg) se apila: chat arriba, panel abajo. */}
        <div className="mb-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <MesaChat cotizacionId={id} onActividadMotor={actividadMotor} />

          <div className="cdm-glass flex min-h-0 flex-col">
            <div className="-mx-1 flex gap-2 overflow-x-auto border-b border-cdm-line px-4 pb-3 pt-4">
              {(
                [
                  { id: "propuesta" as const, label: "Propuesta" },
                  { id: "fotos" as const, label: "Fotos" },
                ]
              ).map((p) => {
                const activa = pestana === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPestana(p.id)}
                    className={`cdm-chip flex min-h-11 shrink-0 cursor-pointer items-center border px-3 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                      activa
                        ? "border-cdm-accent/60 bg-white/[0.04] text-cdm-accent"
                        : "border-cdm-line text-cdm-muted hover:border-cdm-muted/60 hover:text-cdm-fg"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {pestana === "propuesta" && <PropuestaViva cotizacion={detalle} version={versionFotos} />}
              {pestana === "fotos" && <FotosPanel cotizacionId={id} version={versionFotos} />}
            </div>
          </div>
        </div>

        {/* Hoja de cotización (pedido de Eze 26/07): la grilla + solapas salen
            del panel derecho y ocupan el ancho completo abajo del chat — con
            10 columnas apretadas en media pantalla no se leía nada. */}
        <Seccion titulo="Hoja de cotización">
          {desglose ? (
            <>
              {desgloseLegacy && (
                <p className="mb-3 text-[11px] text-cdm-muted">
                  Desglose cargado por consola — solo lectura acá (editarlo lo pisaría con el
                  motor de recetas).
                </p>
              )}
              <HojaViva
                cotizacionId={id}
                desglose={desglose}
                editable={editableMesa && !desgloseLegacy}
                onRefresh={actividadMotor}
              />
            </>
          ) : editableMesa ? (
            <>
              <p className="mb-3 text-[11px] text-cdm-muted">
                Sin rubros todavía — contale a Fable qué hay que cotizar, o cargá el primer ítem a
                mano (sirve aunque el puente esté caído).
              </p>
              <HojaViva
                cotizacionId={id}
                desglose={DESGLOSE_VACIO}
                editable
                onRefresh={actividadMotor}
              />
            </>
          ) : (
            <p className="text-[11px] text-cdm-muted">
              Sin rubros todavía — contale a Fable qué hay que cotizar.
            </p>
          )}
        </Seccion>

        <div>
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

            {revision && (
              <>
                {revision.divergencias.length > 0 && (
                  <Seccion
                    titulo={`Divergencia SISMAT vs internet${
                      revision.divergencias.some((d) => d.nivel === "critica")
                        ? " — ⚠ HAY CRÍTICAS"
                        : ""
                    }`}
                  >
                    <ul className="space-y-2 text-xs">
                      {revision.divergencias.map((d, i) => {
                        const critica = d.nivel === "critica";
                        return (
                          <li
                            key={i}
                            className={`rounded-lg border p-2.5 ${
                              critica
                                ? "border-red-400/50 bg-red-400/10"
                                : "border-amber-300/40 bg-amber-300/[0.06]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{d.item}</span>
                              <span
                                className={`font-mono-hud text-[10px] font-bold uppercase tracking-[0.12em] ${
                                  critica ? "text-red-400" : "text-amber-300"
                                }`}
                              >
                                {critica ? `⚠ ${d.divergencia_pct}%` : `${d.divergencia_pct}%`}
                              </span>
                            </div>
                            <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] text-cdm-muted sm:grid-cols-2">
                              <span>
                                SISMAT {formatMoneyInt(d.sismat)}{" "}
                                <span className="opacity-70">· {d.fuente_sismat}</span>
                              </span>
                              <span>
                                Internet {formatMoneyInt(d.internet)}{" "}
                                <span className="opacity-70">· {d.fuente_internet}</span>
                              </span>
                            </div>
                            {d.retail != null && (
                              <p className="mt-1.5 text-[11px] text-cdm-muted">
                                <span className="font-mono-hud uppercase tracking-[0.12em] text-cdm-accent-2">
                                  {d.fuente_retail ?? "Retail"}
                                </span>{" "}
                                {formatMoneyInt(d.retail)}
                                {d.retail_respalda ? (
                                  <span className="opacity-80">
                                    {" "}
                                    — el mercado le da la razón a{" "}
                                    <span className="font-semibold text-cdm-fg">
                                      {d.retail_respalda === "sismat" ? "SISMAT" : "internet"}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="opacity-70"> — no concluye (queda en el medio)</span>
                                )}
                              </p>
                            )}
                            {critica && (
                              <p className="mt-1.5 text-[10px] leading-snug text-red-300/90">
                                Una fuente es ≥2x la otra — casi siempre es un ítem SISMAT que no
                                corresponde al laburo. Verificá que “{d.fuente_sismat}” sea
                                realmente lo que va antes de aprobar.
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Seccion>
                )}

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

            {editableMesa && (
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
        </div>
      </div>
    </main>
  );
}
