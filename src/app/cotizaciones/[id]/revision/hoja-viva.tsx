"use client";

/**
 * Hoja viva (Tramo B) — el desglose como "hojas de Excel sin ser Excel":
 * rubros apilados como botones desplegables (acento fino por rubro + total
 * compacto + chevron), cada uno abre su propia tabla editable inline (precio
 * Eze pisa el rango, cantidad, toggle sí/no, ítems manuales). Antes era una
 * botonera de tabs con UNA tabla a la vez (pedido de Eze 26/07: volver al
 * patrón de acordeón, varios rubros abiertos en simultáneo).
 * Cada edición pega a PATCH /api/cotizaciones/[id]/desglose, que re-corre el
 * motor SERVER-SIDE y persiste — acá no se suma nada, solo se muestra.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Desglose, ItemDesglose, PrecioFechado, Unidad } from "@/lib/cotizador/tipos";
import { RUBRO_POR_ID, RUBROS, rubroDeItem, type RubroDef, type RubroId } from "@/lib/cotizador/rubros";
import { parseLiteral } from "@/lib/cotizador/parse-literal";
import { formatMoneyInt } from "@/lib/format-currency";
import { RecorteItemModal } from "./recorte-item";

const UNIDADES: Unidad[] = ["u", "m2", "ml", "kg", "l", "bolsa", "caja", "m3", "rollo", "dia", "global"];

const INPUT_NUM =
  "w-24 border-0 border-b border-cdm-line bg-transparent px-1 py-1 text-right text-xs tabular-nums text-cdm-fg placeholder:text-cdm-muted/50 focus-visible:border-cdm-accent focus-visible:outline-none disabled:opacity-40";

/** "$9,3M" / "$740k" / "$980" — total del rubro en la fila del acordeón, corto. */
function compacto(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

function compactoRango(min: number, max: number): string {
  if (min === max) return compacto(min);
  return `${compacto(min)}–${compacto(max)}`;
}

/** Caja FIJA de 36×36 por fila: recorte del render del ítem, o ✂ para marcarlo. */
function MiniCrop({
  url,
  editable,
  onAbrir,
}: {
  url: string | null;
  editable: boolean;
  onAbrir: () => void;
}) {
  if (url) {
    return (
      <button
        type="button"
        onClick={editable ? onAbrir : () => window.open(url, "_blank", "noopener")}
        className="h-9 w-9 shrink-0 cursor-pointer overflow-hidden border border-cdm-line"
        title={editable ? "Ver / rehacer el recorte" : "Ver recorte"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="h-full w-full object-cover" />
      </button>
    );
  }
  if (!editable) {
    return <span aria-hidden className="h-9 w-9 shrink-0 border border-cdm-line/30" />;
  }
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="h-9 w-9 shrink-0 cursor-pointer border border-dashed border-cdm-line text-[11px] text-cdm-muted/70 transition-colors hover:border-cdm-accent/60 hover:text-cdm-accent"
      title="Recortar el ítem del render"
    >
      ✂
    </button>
  );
}

function FuenteMini({ etiqueta, precio }: { etiqueta: string; precio?: PrecioFechado }) {
  if (!precio) return null;
  return (
    <span className="block" title={`${precio.fuente} · ${precio.fecha}`}>
      <span className="font-mono-hud uppercase tracking-[0.1em]">{etiqueta}</span>{" "}
      {formatMoneyInt(precio.valor)}
      <span className="opacity-70"> · {precio.fuente}</span>
    </span>
  );
}

type OpPatch =
  | { ajuste: { nombre: string; precio?: number | null; cantidad?: number | null; activo?: boolean } }
  | { manual: { nombre: string; rubro: string; tipo: "material" | "mano_de_obra"; unidad: Unidad; cantidad: number; precio?: number } }
  | { quitar_manual: string };

type FotosCrops = { render_url: string | null; crops: Record<string, string> };
type FormAlta = { nombre: string; cantidad: string; unidad: Unidad; precio: string };

/**
 * Tabla editable de UN rubro — antes era la única tabla visible (la del tab
 * activo); ahora vive adentro del cuerpo desplegable de cada fila-rubro, así
 * que puede haber varias montadas a la vez si Eze abrió más de un rubro.
 */
function TablaRubro({
  items,
  extras,
  editable,
  guardando,
  borradores,
  onBorrador,
  onConfirmar,
  onPatch,
  fotos,
  onRecorte,
}: {
  items: ItemDesglose[];
  /** Solo el rubro "extras" manda su lista acá (readonly v1). */
  extras: Desglose["extras"] | null;
  editable: boolean;
  guardando: boolean;
  borradores: Record<string, string>;
  onBorrador: (clave: string, valor: string) => void;
  onConfirmar: (campo: "precio" | "cantidad", item: ItemDesglose) => void;
  onPatch: (op: OpPatch) => Promise<boolean>;
  fotos: FotosCrops;
  onRecorte: (nombre: string) => void;
}) {
  if (items.length === 0 && (!extras || extras.length === 0)) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
            {editable && <th className="w-8 py-2 pr-2" title="En alcance">✓</th>}
            <th className="py-2 pr-3">Ítem</th>
            <th className="py-2 pr-3 text-right">Cant.</th>
            <th className="py-2 pr-3 text-right">Precio</th>
            <th className="py-2 pr-3">Fuentes</th>
            <th className="py-2 text-right">Subtotal</th>
            {editable && <th className="w-8 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-cdm-line">
          {items.map((it) => {
            const apagado = it.activo === false;
            const eze = it.precios.eze;
            const claveP = `precio:${it.nombre}`;
            const claveC = `cantidad:${it.nombre}`;
            const divergente = it.divergencia_pct != null && it.divergencia_pct > 25;
            return (
              <tr key={it.nombre} className={apagado ? "opacity-45" : undefined}>
                {editable && (
                  <td className="py-2 pr-2 align-top">
                    {/* Un manual no admite toggle (el endpoint solo ajusta ítems
                        de receta): se saca del alcance borrándolo con ×. */}
                    {!it.manual && (
                      <input
                        type="checkbox"
                        checked={!apagado}
                        disabled={guardando}
                        onChange={(e) => void onPatch({ ajuste: { nombre: it.nombre, activo: e.target.checked } })}
                        className="h-3.5 w-3.5 cursor-pointer accent-cdm-accent"
                        title={apagado ? "Volver al alcance" : "Sacar del alcance (no suma)"}
                      />
                    )}
                  </td>
                )}
                <td className="py-2 pr-3 align-top">
                  <span className="flex items-start gap-2.5">
                    {/* Thumbnail de tamaño FIJO (nada se corre de margen). */}
                    <MiniCrop
                      url={fotos.crops[it.nombre] ?? null}
                      editable={editable}
                      onAbrir={() => onRecorte(it.nombre)}
                    />
                    <span className="min-w-0">
                      <span className={apagado ? "line-through" : undefined}>{it.nombre}</span>
                      {it.sin_precio && (
                        <span className="ml-1.5 text-[10px] font-semibold text-amber-300">SIN PRECIO</span>
                      )}
                      {it.manual && (
                        <span className="ml-1.5 cdm-chip border border-cdm-line px-1 text-[9px] uppercase tracking-[0.1em] text-cdm-muted">
                          manual
                        </span>
                      )}
                      <span className="mt-0.5 block font-mono text-[10px] text-cdm-muted">
                        {it.etapa} · {it.formula}
                        {it.desperdicio_pct > 0 ? ` +${it.desperdicio_pct}% desp.` : ""}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-3 text-right align-top">
                  {editable && !it.manual ? (
                    <span className="inline-flex items-center gap-1">
                      {it.cantidad_editada && (
                        <button
                          disabled={guardando}
                          onClick={() => void onPatch({ ajuste: { nombre: it.nombre, cantidad: null } })}
                          className="cursor-pointer text-[10px] text-cdm-muted hover:text-cdm-accent"
                          title="Volver a la cantidad de la fórmula"
                        >
                          ↺
                        </button>
                      )}
                      <input
                        value={borradores[claveC] ?? String(it.cantidad)}
                        disabled={guardando || apagado}
                        inputMode="decimal"
                        onChange={(e) => onBorrador(claveC, e.target.value)}
                        onBlur={() => onConfirmar("cantidad", it)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        className={`${INPUT_NUM} w-16 ${it.cantidad_editada ? "text-cdm-accent" : ""}`}
                      />
                    </span>
                  ) : (
                    <span className="tabular-nums">{it.cantidad}</span>
                  )}
                  <span className="ml-1 text-cdm-muted">{it.unidad}</span>
                </td>
                <td className="py-2 pr-3 text-right align-top">
                  {editable ? (
                    <span className="inline-flex items-center gap-1">
                      {eze && !it.manual && (
                        <button
                          disabled={guardando}
                          onClick={() => void onPatch({ ajuste: { nombre: it.nombre, precio: null } })}
                          className="cursor-pointer text-[10px] text-cdm-muted hover:text-cdm-accent"
                          title="Quitar corrección — volver al rango de fuentes"
                        >
                          ↺
                        </button>
                      )}
                      <input
                        value={borradores[claveP] ?? (eze ? String(eze.valor) : "")}
                        disabled={guardando || apagado || it.manual}
                        inputMode="numeric"
                        placeholder={
                          it.sin_precio
                            ? "sin precio"
                            : it.precio_min === it.precio_max
                              ? String(it.precio_min ?? "")
                              : `${it.precio_min}–${it.precio_max}`
                        }
                        onChange={(e) => onBorrador(claveP, e.target.value)}
                        onBlur={() => onConfirmar("precio", it)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        className={`${INPUT_NUM} ${eze ? "text-cdm-accent" : ""}`}
                        title={it.manual ? "El precio de un ítem manual se fija al crearlo (borralo y volvé a cargarlo)" : "Tu precio pisa el rango (queda con sello Eze)"}
                      />
                    </span>
                  ) : (
                    <span className="tabular-nums">
                      {it.sin_precio
                        ? "—"
                        : it.precio_min === it.precio_max
                          ? formatMoneyInt(it.precio_min!)
                          : `${formatMoneyInt(it.precio_min!)} – ${formatMoneyInt(it.precio_max!)}`}
                    </span>
                  )}
                  {eze && (
                    <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.14em] text-cdm-accent">
                      Eze · {eze.fecha}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 align-top text-[10px] leading-4 text-cdm-muted">
                  <FuenteMini etiqueta="SIS" precio={it.precios.sismat} />
                  <FuenteMini etiqueta="NET" precio={it.precios.internet} />
                  <FuenteMini etiqueta="RET" precio={it.precios.retail} />
                  {divergente && (
                    <span className="font-semibold text-red-400">Δ {it.divergencia_pct}%</span>
                  )}
                </td>
                <td className="py-2 text-right align-top tabular-nums">
                  {it.sin_precio
                    ? "—"
                    : it.subtotal_min === it.subtotal_max
                      ? formatMoneyInt(it.subtotal_min)
                      : `${formatMoneyInt(it.subtotal_min)} – ${formatMoneyInt(it.subtotal_max)}`}
                </td>
                {editable && (
                  <td className="py-2 text-right align-top">
                    {it.manual && (
                      <button
                        disabled={guardando}
                        onClick={() => void onPatch({ quitar_manual: it.nombre })}
                        className="cursor-pointer text-cdm-muted hover:text-red-400"
                        title="Quitar ítem manual"
                      >
                        ×
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}

          {/* Extras (flete, volquete…): solo lectura v1. */}
          {extras?.map((ex) => (
            <tr key={`extra:${ex.nombre}`}>
              {editable && <td className="py-2 pr-2" />}
              <td className="py-2 pr-3">
                {ex.nombre}
                <span className="mt-0.5 block font-mono text-[10px] text-cdm-muted">
                  extra fuera de receta
                </span>
              </td>
              <td className="py-2 pr-3 text-right text-cdm-muted">—</td>
              <td className="py-2 pr-3 text-right text-cdm-muted">—</td>
              <td className="py-2 pr-3 text-[10px] text-cdm-muted">
                {ex.fuente} · {ex.fecha}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatMoneyInt(ex.monto_min)} – {formatMoneyInt(ex.monto_max)}
              </td>
              {editable && <td className="py-2" />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Formulario de alta manual — vive adentro del rubro al que cae el ítem. */
function AltaManual({
  rubroLabel,
  abierta,
  guardando,
  alta,
  onCambiar,
  onAbrir,
  onAgregar,
  onCancelar,
}: {
  rubroLabel: string;
  abierta: boolean;
  guardando: boolean;
  alta: FormAlta;
  onCambiar: (siguiente: FormAlta) => void;
  onAbrir: () => void;
  onAgregar: () => void;
  onCancelar: () => void;
}) {
  if (!abierta) {
    return (
      <button
        onClick={onAbrir}
        className="cdm-chip cursor-pointer border border-cdm-line px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:border-cdm-accent/60 hover:text-cdm-accent"
      >
        + Agregar ítem en {rubroLabel}
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-3 text-xs">
      <label className="min-w-56 flex-1 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
        Ítem
        <input
          value={alta.nombre}
          autoFocus
          onChange={(e) => onCambiar({ ...alta, nombre: e.target.value })}
          placeholder="Nombre del ítem"
          className="mt-1 block w-full border-0 border-b border-cdm-line bg-transparent px-1 py-1.5 text-xs normal-case tracking-normal text-cdm-fg placeholder:text-cdm-muted/50 focus-visible:border-cdm-accent focus-visible:outline-none"
        />
      </label>
      <label className="text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
        Cant.
        <input
          value={alta.cantidad}
          inputMode="decimal"
          onChange={(e) => onCambiar({ ...alta, cantidad: e.target.value })}
          className={`${INPUT_NUM} mt-1 block w-16`}
        />
      </label>
      <label className="text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
        Unidad
        <select
          value={alta.unidad}
          onChange={(e) => onCambiar({ ...alta, unidad: e.target.value as Unidad })}
          className="mt-1 block border border-cdm-line bg-cdm-panel/60 px-2 py-1 text-xs text-cdm-fg focus:border-cdm-accent focus:outline-none"
        >
          {UNIDADES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
      <label className="text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
        Precio (opcional)
        <input
          value={alta.precio}
          inputMode="numeric"
          onChange={(e) => onCambiar({ ...alta, precio: e.target.value })}
          placeholder="sin precio"
          className={`${INPUT_NUM} mt-1 block`}
        />
      </label>
      <button
        disabled={guardando}
        onClick={onAgregar}
        className="cdm-chip cursor-pointer border border-cdm-accent/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-cdm-accent hover:bg-cdm-accent/10 disabled:opacity-50"
      >
        Agregar
      </button>
      <button
        onClick={onCancelar}
        className="cursor-pointer text-[10px] uppercase tracking-[0.14em] text-cdm-muted hover:text-cdm-fg"
      >
        Cancelar
      </button>
    </div>
  );
}

/**
 * Fila-botón de un rubro: acento fino a la izquierda, chevron, nombre + conteo,
 * total compacto a la derecha. Despliega `children` debajo (mismo patrón de
 * expand/collapse que /dinero: height auto + opacity, respeta reduced motion).
 */
function RubroFila({
  rubro,
  abierto,
  onToggle,
  total,
  cuenta,
  reducir,
  children,
}: {
  rubro: RubroDef;
  abierto: boolean;
  onToggle: () => void;
  total: { min: number; max: number };
  cuenta: number;
  reducir: boolean | null;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-cdm-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        className="group flex w-full items-center gap-3 py-3 text-left"
      >
        <span aria-hidden className={`h-6 w-[3px] shrink-0 ${rubro.acento.punto}`} />
        <motion.svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-3 w-3 shrink-0 text-cdm-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          animate={reducir ? undefined : { rotate: abierto ? 90 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
        <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cdm-fg">
          {rubro.label}
          <span className="ml-2 font-normal normal-case tracking-normal text-cdm-muted">· {cuenta}</span>
        </span>
        <span className={`shrink-0 text-sm tabular-nums ${rubro.acento.texto}`}>
          {total.min === 0 && total.max === 0 ? "—" : compactoRango(total.min, total.max)}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            key="cuerpo"
            initial={reducir ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reducir ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-4 pl-[15px]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type Props = {
  cotizacionId: string;
  desglose: Desglose;
  editable: boolean;
  onRefresh: () => Promise<void> | void;
};

export function HojaViva({ cotizacionId, desglose, editable, onRefresh }: Props) {
  // Rubro elegido a mano cuando todavía no hay NINGÚN ítem (fix ronda final
  // finding 5): sin esto, `rubroActivo` da null y el alta manual (gateada por
  // rubroActivo, ver más abajo) nunca puede renderizar — el puente caído deja
  // la mesa muerta en vez de "viva con el puente caído" (ADR).
  const [rubroVacio, setRubroVacio] = useState<RubroId>(RUBROS[0].id);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Borradores de inputs en curso, por "campo:nombre". Se limpian al confirmar.
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  // Qué rubro tiene el form de alta manual abierto (reemplaza el booleano
  // global: el alta ahora vive adentro del desplegable de CADA rubro, no
  // depende de una "tab activa" única — pedido de Eze 26/07).
  const [altaEnRubro, setAltaEnRubro] = useState<RubroId | null>(null);
  const [alta, setAlta] = useState<FormAlta>({ nombre: "", cantidad: "1", unidad: "u", precio: "" });
  // Recortes del render por ítem (thumbnail fijo por fila) + render base.
  const [fotos, setFotos] = useState<FotosCrops>({ render_url: null, crops: {} });
  const [recorteDe, setRecorteDe] = useState<string | null>(null);

  const cargarCrops = useCallback(async () => {
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/crops`, { cache: "no-store" });
      if (!res.ok) return; // sin thumbnails no se rompe nada
      const json = (await res.json()) as { render_url: string | null; crops: Record<string, string> };
      setFotos({ render_url: json.render_url ?? null, crops: json.crops ?? {} });
    } catch {
      /* la hoja sigue funcionando sin fotos */
    }
  }, [cotizacionId]);

  useEffect(() => {
    void cargarCrops();
  }, [cargarCrops]);

  const grupos = useMemo(() => {
    const porRubro = new Map<RubroId, ItemDesglose[]>();
    for (const item of desglose.items) {
      const rubro = rubroDeItem(item);
      const lista = porRubro.get(rubro) ?? [];
      lista.push(item);
      porRubro.set(rubro, lista);
    }
    return porRubro;
  }, [desglose.items]);

  const hayExtras = desglose.extras.length > 0;
  const tabs = RUBROS.filter((r) => grupos.has(r.id) || (r.id === "extras" && hayExtras));
  // Sin ítems todavía (cotización nueva, puente caído o recién arrancando):
  // no hay rubros de dónde elegir, pero si es editable igual necesitamos un
  // rubro activo para que el alta manual tenga dónde caer.
  const sinTabs = tabs.length === 0;

  // Al montar: el primer rubro con ítems abierto (orden canónico de RUBROS),
  // el resto cerrado. Se pueden abrir varios a la vez después.
  const [abiertos, setAbiertos] = useState<Set<RubroId>>(() => (tabs[0] ? new Set([tabs[0].id]) : new Set()));
  const reducirMovimiento = useReducedMotion();

  // Una cotización nueva nace sin ítems (sinTabs=true) y Fable los va cargando
  // por chat mientras RevisionScreen refresca `desglose` SIN desmontar esta
  // pantalla — el useState de arriba solo corre una vez al montar, así que sin
  // esto ningún rubro se abría solo cuando el primer ítem llegaba por chat.
  // Este efecto detecta específicamente la transición "no había tabs → hay
  // tabs" y abre el primer rubro con ítems — PERO nunca si Eze ya tocó el
  // acordeón a mano (usuarioTocoRef), para no pisarle lo que abrió o cerró.
  const teniaTabsRef = useRef(tabs.length > 0);
  const usuarioTocoRef = useRef(false);
  useEffect(() => {
    const hayTabsAhora = tabs.length > 0;
    if (!teniaTabsRef.current && hayTabsAhora && !usuarioTocoRef.current && tabs[0]) {
      setAbiertos(new Set([tabs[0].id]));
    }
    teniaTabsRef.current = hayTabsAhora;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  function toggleRubro(id: RubroId) {
    usuarioTocoRef.current = true;
    setAbiertos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  function totalRubro(id: RubroId): { min: number; max: number } {
    let min = 0;
    let max = 0;
    for (const it of grupos.get(id) ?? []) {
      if (it.activo === false) continue;
      min += it.subtotal_min;
      max += it.subtotal_max;
    }
    if (id === "extras") {
      for (const ex of desglose.extras) {
        min += ex.monto_min;
        max += ex.monto_max;
      }
    }
    return { min, max };
  }

  async function patch(op: OpPatch): Promise<boolean> {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/desglose`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(op),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Error al guardar");
      setBorradores({});
      await onRefresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  /** Commit de un input numérico si cambió de verdad (números literales, sin reinterpretar). */
  function confirmar(campo: "precio" | "cantidad", item: ItemDesglose) {
    const clave = `${campo}:${item.nombre}`;
    const crudo = borradores[clave];
    if (crudo == null) return; // no se tocó
    const descartar = () =>
      setBorradores((b) => {
        const copia = { ...b };
        delete copia[clave];
        return copia;
      });
    const valor = parseLiteral(crudo);
    if (valor == null) return descartar();
    const actual = campo === "precio" ? item.precios.eze?.valor : item.cantidad;
    if (valor === actual) return descartar();
    void patch({ ajuste: { nombre: item.nombre, [campo]: valor } });
  }

  function agregarManual(rubro: RubroId) {
    const cantidad = parseLiteral(alta.cantidad);
    if (!alta.nombre.trim() || cantidad == null) {
      setError("El ítem nuevo necesita nombre y cantidad (> 0).");
      return;
    }
    const precio = alta.precio.trim() === "" ? undefined : (parseLiteral(alta.precio) ?? undefined);
    void patch({
      manual: {
        nombre: alta.nombre.trim(),
        rubro,
        tipo: rubro === "mano_de_obra" ? "mano_de_obra" : "material",
        unidad: alta.unidad,
        cantidad,
        ...(precio != null ? { precio } : {}),
      },
    }).then((ok) => {
      if (!ok) return; // el error quedó visible; no se pierde lo tipeado
      setAlta({ nombre: "", cantidad: "1", unidad: "u", precio: "" });
      setAltaEnRubro(null);
    });
  }

  // Sin ítems y de solo lectura: no hay nada que mostrar ni que editar.
  if (sinTabs && !editable) return null;

  return (
    <div>
      {sinTabs ? (
        <div>
          {/* Sin ningún ítem todavía (mesa viva con el puente caído — fix ronda
              final finding 5): selector de rubro para que el alta manual sepa
              dónde caer, ya que no hay ningún desplegable para abrir. */}
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
            <span>Rubro del primer ítem</span>
            <select
              value={rubroVacio}
              onChange={(e) => setRubroVacio(e.target.value as RubroId)}
              className="border border-cdm-line bg-cdm-panel/60 px-2 py-1 text-[10px] normal-case tracking-normal text-cdm-fg focus:border-cdm-accent focus:outline-none"
            >
              {RUBROS.filter((r) => r.id !== "extras").map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
          {editable && (
            <AltaManual
              rubroLabel={RUBRO_POR_ID[rubroVacio]?.label ?? rubroVacio}
              abierta={altaEnRubro === rubroVacio}
              guardando={guardando}
              alta={alta}
              onCambiar={setAlta}
              onAbrir={() => setAltaEnRubro(rubroVacio)}
              onAgregar={() => agregarManual(rubroVacio)}
              onCancelar={() => setAltaEnRubro(null)}
            />
          )}
        </div>
      ) : (
        <>
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
          <div className="border-t border-cdm-line">
            {tabs.map((r) => {
              const items = grupos.get(r.id) ?? [];
              const cuenta = items.length + (r.id === "extras" ? desglose.extras.length : 0);
              return (
                <RubroFila
                  key={r.id}
                  rubro={r}
                  abierto={abiertos.has(r.id)}
                  onToggle={() => toggleRubro(r.id)}
                  total={totalRubro(r.id)}
                  cuenta={cuenta}
                  reducir={reducirMovimiento}
                >
                  <TablaRubro
                    items={items}
                    extras={r.id === "extras" ? desglose.extras : null}
                    editable={editable}
                    guardando={guardando}
                    borradores={borradores}
                    onBorrador={(clave, valor) => setBorradores((b) => ({ ...b, [clave]: valor }))}
                    onConfirmar={confirmar}
                    onPatch={patch}
                    fotos={fotos}
                    onRecorte={setRecorteDe}
                  />
                  {editable && (
                    <div className="mt-3 border-t border-cdm-line pt-3">
                      <AltaManual
                        rubroLabel={r.label}
                        abierta={altaEnRubro === r.id}
                        guardando={guardando}
                        alta={alta}
                        onCambiar={setAlta}
                        onAbrir={() => setAltaEnRubro(r.id)}
                        onAgregar={() => agregarManual(r.id)}
                        onCancelar={() => setAltaEnRubro(null)}
                      />
                    </div>
                  )}
                </RubroFila>
              );
            })}
          </div>
        </>
      )}

      {/* ── Totales (los suma el motor, no esta pantalla) ─────────────────── */}
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
            {formatMoneyInt(desglose.totales.extras_min)} – {formatMoneyInt(desglose.totales.extras_max)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-cdm-muted">
            Imprevistos {desglose.totales.imprevistos_pct}% · Factor zona{" "}
            {desglose.totales.factor_zona_min}–{desglose.totales.factor_zona_max}
          </dt>
          <dd className="font-medium tabular-nums">
            {formatMoneyInt(desglose.totales.total_min)} – {formatMoneyInt(desglose.totales.total_max)}
          </dd>
        </div>
        <div className="flex justify-between text-cdm-muted">
          <dt>Tiempo estimado</dt>
          <dd>
            {desglose.tiempo.dias_min}–{desglose.tiempo.dias_max} días · {desglose.tiempo.cuadrilla_max}{" "}
            persona(s)
          </dd>
        </div>
      </dl>

      {recorteDe && (
        <RecorteItemModal
          cotizacionId={cotizacionId}
          itemNombre={recorteDe}
          renderUrl={fotos.render_url}
          cropUrl={fotos.crops[recorteDe] ?? null}
          onCerrar={() => setRecorteDe(null)}
          onCambio={cargarCrops}
        />
      )}
    </div>
  );
}
