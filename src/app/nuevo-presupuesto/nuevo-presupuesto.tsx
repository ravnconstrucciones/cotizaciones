"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { NuevoRecetaModal } from "@/components/nuevo-receta-modal";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { CifraHeroica } from "@/components/cockpit/cifra-heroica";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatMoney,
  formatNumber,
  parseFormattedNumber,
  roundArs2,
} from "@/lib/format-currency";
import { formatRubroName } from "@/lib/format-rubro-name";
import type {
  PresupuestoItemRow,
  Receta,
  RecetaNombreUnidad,
  RubroRow,
} from "@/types/ravn";

type StatusMessage = { type: "error" | "success"; text: string } | null;

/**
 * Input del cockpit (iteración 3): fondo transparente, borde inferior 1px
 * que se enciende taupe al focus con un lavado de glow debajo. El parámetro
 * `inverted` se conserva por compatibilidad con los call sites.
 */
function fieldClass(disabled?: boolean, _inverted?: boolean) {
  return [
    "w-full rounded-none border-0 border-b border-cdm-line bg-transparent px-1 py-2.5 text-sm text-cdm-fg",
    "placeholder:text-cdm-muted/50",
    "transition-[border-color,box-shadow] duration-200",
    "focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]",
    disabled ? "cursor-not-allowed opacity-40" : "",
  ].join(" ");
}

function labelClass(_inverted?: boolean) {
  return "mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-cdm-muted";
}

function sortRubroIdsNumerically(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

function uniqueRubroIds(recetas: Receta[]): string[] {
  const set = new Set<string>();
  for (const r of recetas) {
    if (r.rubro_id != null && String(r.rubro_id) !== "") {
      set.add(String(r.rubro_id));
    }
  }
  return sortRubroIdsNumerically([...set]);
}

/** Orden de sidebar: numérico por `id` cuando aplica, si no alfabético por id. */
function fechaPresupuestoAInput(fecha: unknown): string {
  if (fecha == null) return new Date().toISOString().slice(0, 10);
  const s = String(fecha).trim();
  if (s.length >= 10 && s[4] === "-" && s[7] === "-") return s.slice(0, 10);
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {
    /* fallthrough */
  }
  return new Date().toISOString().slice(0, 10);
}

function sortRubrosRowsByNumericId(rubros: RubroRow[]): RubroRow[] {
  return [...rubros].sort((a, b) => {
    const na = Number(a.id);
    const nb = Number(b.id);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a.id).localeCompare(String(b.id));
  });
}

function normalizeRecetaJoin(
  raw: RecetaNombreUnidad | RecetaNombreUnidad[] | null | undefined
): RecetaNombreUnidad | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function mapPresupuestoItemRow(raw: Record<string, unknown>): PresupuestoItemRow {
  const rawDisc = Number(raw.descuento_material_pct);
  const disc = Number.isFinite(rawDisc)
    ? Math.min(100, Math.max(0, rawDisc))
    : 0;
  return {
    id: String(raw.id),
    presupuesto_id: String(raw.presupuesto_id),
    receta_id: String(raw.receta_id),
    cantidad: Number(raw.cantidad),
    precio_material_congelado: Number(raw.precio_material_congelado),
    descuento_material_pct: disc,
    precio_mo_congelada: Number(raw.precio_mo_congelada),
    recetas: normalizeRecetaJoin(
      raw.recetas as RecetaNombreUnidad | RecetaNombreUnidad[] | null
    ),
  };
}

async function fetchRubroLabels(
  rubroIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (rubroIds.length === 0) return map;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("rubros")
    .select("id, nombre")
    .in("id", rubroIds);

  if (error || !data) {
    for (const id of rubroIds) {
      map.set(id, `Rubro ${id}`);
    }
    return map;
  }

  for (const row of data as { id: string; nombre: string }[]) {
    map.set(String(row.id), row.nombre);
  }
  for (const id of rubroIds) {
    if (!map.has(id)) map.set(id, `Rubro ${id}`);
  }
  return map;
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/**
 * Monto ARS editable: `type="text"` con formato es-AR al blur; al foco se edita
 * con coma decimal; el símbolo `$` queda fijo a la izquierda.
 */
function PesosAmountInput({
  amount,
  onAmountChange,
  onBlur,
  disabled,
  readOnly,
  bold,
}: {
  amount: number;
  onAmountChange?: (next: number) => void;
  onBlur?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  bold?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [editVal, setEditVal] = useState("");
  const v = roundArs2(amount);
  const formatted = formatNumber(v, 2);
  const displayVal = !focused ? formatted : editVal;
  const baseInput = [
    "min-w-0 flex-1 border-0 border-none bg-transparent py-1.5 text-center text-sm tabular-nums text-cdm-fg outline-none",
    "focus:border-none focus:outline-none focus:ring-0 focus:ring-offset-0",
    "disabled:opacity-50 read-only:cursor-default",
  ].join(" ");

  const pesoMark = (
    <span
      className="shrink-0 min-w-[1.75rem] text-center text-sm font-semibold tabular-nums text-cdm-accent"
      aria-hidden
    >
      $
    </span>
  );

  if (readOnly) {
    return (
      <div className="flex min-w-0 w-full items-center">
        {pesoMark}
        <input
          type="text"
          readOnly
          tabIndex={-1}
          value={formatted}
          className={`${baseInput} w-full min-w-0 ${bold ? "font-semibold" : "font-light"}`}
          aria-label="Total ítem"
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 w-full items-center">
      {pesoMark}
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={displayVal}
        onFocus={() => {
          if (disabled) return;
          setFocused(true);
          setEditVal(formatted);
        }}
        onChange={(e) => {
          if (disabled || !onAmountChange) return;
          const raw = e.target.value;
          setEditVal(raw);
          const x = parseFormattedNumber(raw);
          if (x >= 0) onAmountChange(roundArs2(x));
        }}
        onBlur={() => {
          setFocused(false);
          setEditVal("");
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`${baseInput} ${bold ? "font-semibold" : "font-light"}`}
      />
    </div>
  );
}

function FormattedNumberInput({
  value,
  decimals,
  onChange,
  onBlur,
  disabled,
  className,
  pesoPrefix,
}: {
  value: number;
  decimals: number;
  onChange: (n: number) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  pesoPrefix?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [editVal, setEditVal] = useState("");
  const displayVal = focused ? editVal : formatNumber(value, decimals);
  const inputClass = pesoPrefix
    ? `${className ?? ""} min-w-0 flex-1`.trim()
    : className;
  const input = (
    <input
      type="text"
      inputMode="decimal"
      value={displayVal}
      onFocus={() => {
        setFocused(true);
        setEditVal(formatNumber(value, decimals));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setEditVal(raw);
        onChange(parseFormattedNumber(raw));
      }}
      onBlur={() => {
        setFocused(false);
        setEditVal("");
        onBlur?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      disabled={disabled}
      className={inputClass}
    />
  );
  if (!pesoPrefix) return input;
  return (
    <div className="flex min-w-0 w-full items-center">
      <span
        className="shrink-0 min-w-[1.75rem] text-center text-sm font-semibold tabular-nums text-cdm-accent"
        aria-hidden
      >
        $
      </span>
      {input}
    </div>
  );
}

function ChevronIcon({
  expanded,
  className,
}: {
  expanded: boolean;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-300 ease-out ${expanded ? "rotate-90" : ""} ${className ?? ""}`}
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function NuevoPresupuestoScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idDesdeUrl = (searchParams.get("id") ?? "").trim();

  const [fecha, setFecha] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [nombreCliente, setNombreCliente] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [presupuestoId, setPresupuestoId] = useState<string | null>(null);

  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [rubroLabels, setRubroLabels] = useState<Map<string, string>>(
    new Map()
  );
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [rubrosAll, setRubrosAll] = useState<RubroRow[]>([]);
  const [nuevoItemModalOpen, setNuevoItemModalOpen] = useState(false);

  const [rubroSeleccionado, setRubroSeleccionado] = useState<string | null>(
    null
  );
  const [expandedRubros, setExpandedRubros] = useState<Set<string>>(new Set());
  const [recetaId, setRecetaId] = useState("");
  const [cantidad, setCantidad] = useState<string>("1");
  const [precioMaterial, setPrecioMaterial] = useState<string>("");
  const [precioMo, setPrecioMo] = useState<string>("");

  const [items, setItems] = useState<PresupuestoItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [desestimando, setDesestimando] = useState(false);
  const [agregandoTodosRubro, setAgregandoTodosRubro] = useState<string | null>(
    null
  );
  const [quitandoTodosRubro, setQuitandoTodosRubro] = useState<string | null>(
    null
  );

  const [banner, setBanner] = useState<StatusMessage>(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const itemsRef = useRef<PresupuestoItemRow[]>([]);
  /** Evita re-hidratar por `?id=` justo después de desestimar / limpiar pantalla. */
  const ignorarSiguienteCargaPorUrlRef = useRef(false);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const w = Math.min(480, Math.max(200, e.clientX));
      setSidebarWidth(w);
    };
    const onUp = () => setIsResizing(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  function updateItemInState(
    itemId: string,
    field:
      | "cantidad"
      | "precio_material_congelado"
      | "precio_mo_congelada"
      | "descuento_material_pct",
    value: number
  ) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, [field]: value } : i
      )
    );
  }

  async function handleUpdateItem(
    itemId: string,
    payload: {
      cantidad: number;
      precio_material_congelado: number;
      descuento_material_pct: number;
      precio_mo_congelada: number;
    }
  ) {
    if (!presupuestoId) return;
    setUpdatingItemId(itemId);
    setBanner(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("presupuestos_items")
        .update(payload)
        .eq("id", itemId);

      if (error) {
        setBanner({ type: "error", text: error.message });
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al guardar.";
      setBanner({ type: "error", text: msg });
    } finally {
      setUpdatingItemId(null);
    }
  }

  function persistRow(itemId: string) {
    const row = itemsRef.current.find((i) => i.id === itemId);
    if (!row) return;
    const q = Number(row.cantidad);
    const pm = Number(row.precio_material_congelado);
    const pmo = Number(row.precio_mo_congelada);
    const rawDisc = Number(row.descuento_material_pct);
    const disc = Number.isFinite(rawDisc)
      ? Math.min(100, Math.max(0, rawDisc))
      : 0;
    if (!Number.isFinite(q) || q < 0) return;
    if (!Number.isFinite(pm) || pm < 0) return;
    if (!Number.isFinite(pmo) || pmo < 0) return;
    void handleUpdateItem(row.id, {
      cantidad: q,
      precio_material_congelado: pm,
      descuento_material_pct: disc,
      precio_mo_congelada: pmo,
    });
  }
  /** Todos los rubros de la tabla `rubros` (Supabase), no solo los que tienen recetas. */
  const rubrosSidebarOrdenados = useMemo(
    () => sortRubrosRowsByNumericId(rubrosAll),
    [rubrosAll]
  );

  const recetasDelRubro = useMemo(() => {
    if (!rubroSeleccionado) return [];
    return recetas
      .filter((r) => String(r.rubro_id) === rubroSeleccionado)
      .sort((a, b) => a.nombre_item.localeCompare(b.nombre_item));
  }, [recetas, rubroSeleccionado]);

  const recetaSeleccionada = useMemo(() => {
    if (!recetaId) return undefined;
    return recetas.find((r) => String(r.id) === recetaId);
  }, [recetas, recetaId]);

  useEffect(() => {
    if (recetaSeleccionada) {
      setPrecioMaterial(
        String(recetaSeleccionada.costo_base_material_unitario ?? "")
      );
      setPrecioMo(String(recetaSeleccionada.costo_base_mo_unitario ?? ""));
    } else {
      setPrecioMaterial("");
      setPrecioMo("");
    }
    setCantidad("1");
  }, [recetaSeleccionada?.id]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const supabase = createClient();
      const [rubRes, recRes] = await Promise.all([
        supabase.from("rubros").select("id, nombre").order("id", { ascending: true }),
        supabase.from("catalogo_recetas").select("*"),
      ]);

      if (rubRes.error) {
        setRubrosAll([]);
      } else {
        setRubrosAll((rubRes.data ?? []) as RubroRow[]);
      }

      if (recRes.error) {
        setCatalogError(
          [rubRes.error?.message, recRes.error.message].filter(Boolean).join(" · ")
        );
        setRecetas([]);
        setCatalogLoading(false);
        return;
      }

      if (rubRes.error) {
        setCatalogError(rubRes.error.message);
      }

      const rows = (recRes.data ?? []) as Receta[];
      setRecetas(rows);

      const labelMap = new Map<string, string>();
      for (const r of (rubRes.data ?? []) as RubroRow[]) {
        labelMap.set(String(r.id), r.nombre);
      }
      const ids = uniqueRubroIds(rows);
      const missing = ids.filter((id) => !labelMap.has(id));
      if (missing.length > 0) {
        const extra = await fetchRubroLabels(missing);
        extra.forEach((nombre, id) => labelMap.set(id, nombre));
      }
      setRubroLabels(labelMap);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al cargar el catálogo.";
      setCatalogError(msg);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const loadItems = useCallback(async (pid: string) => {
    setItemsLoading(true);
    setBanner(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("presupuestos_items")
        .select(
          `
          id,
          presupuesto_id,
          receta_id,
          cantidad,
          precio_material_congelado,
          descuento_material_pct,
          precio_mo_congelada,
          recetas:catalogo_recetas ( nombre_item, unidad, rubro_id )
        `
        )
        .eq("presupuesto_id", pid)
        .order("id", { ascending: true });

      if (error) {
        setBanner({ type: "error", text: error.message });
        setItems([]);
        return;
      }

      setItems(
        (data ?? []).map((row) =>
          mapPresupuestoItemRow(row as Record<string, unknown>)
        )
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "No se pudieron cargar los ítems.";
      setBanner({ type: "error", text: msg });
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (presupuestoId) void loadItems(presupuestoId);
    else setItems([]);
  }, [presupuestoId, loadItems]);

  useEffect(() => {
    if (!idDesdeUrl) {
      ignorarSiguienteCargaPorUrlRef.current = false;
      return;
    }

    if (ignorarSiguienteCargaPorUrlRef.current) {
      ignorarSiguienteCargaPorUrlRef.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("presupuestos")
        .select("id, fecha, nombre_cliente, domicilio")
        .eq("id", idDesdeUrl)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setBanner({
          type: "error",
          text: error?.message ?? "No se encontró el presupuesto.",
        });
        router.replace("/nuevo-presupuesto", { scroll: false });
        return;
      }
      const row = data as {
        id: string;
        fecha: unknown;
        nombre_cliente: string | null;
        domicilio: string | null;
      };
      setPresupuestoId(String(row.id));
      setFecha(fechaPresupuestoAInput(row.fecha));
      setNombreCliente(row.nombre_cliente?.trim() ?? "");
      setDomicilio(row.domicilio?.trim() ?? "");
      setBanner(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [idDesdeUrl, router]);

  const totales = useMemo(() => {
    let material = 0;
    let mo = 0;
    for (const row of items) {
      const q = Number(row.cantidad) || 0;
      const pm = Number(row.precio_material_congelado) || 0;
      const pmo = Number(row.precio_mo_congelada) || 0;
      const rawDisc = Number(row.descuento_material_pct);
      const disc = Number.isFinite(rawDisc)
        ? Math.min(100, Math.max(0, rawDisc))
        : 0;
      const facMat = Math.max(0, 1 - disc / 100);
      material += roundArs2(q * pm * facMat);
      mo += roundArs2(q * pmo);
    }
    return {
      material,
      mo,
      total: roundArs2(material + mo),
    };
  }, [items]);

  const itemCountByRubro = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const joinRubro = item.recetas?.rubro_id;
      if (joinRubro != null && String(joinRubro) !== "") {
        const rid = String(joinRubro);
        map.set(rid, (map.get(rid) ?? 0) + 1);
        continue;
      }
      const rec = recetas.find((r) => String(r.id) === String(item.receta_id));
      const rid = rec?.rubro_id != null ? String(rec.rubro_id) : null;
      if (rid) map.set(rid, (map.get(rid) ?? 0) + 1);
    }
    return map;
  }, [items, recetas]);

  function resetPantalla() {
    ignorarSiguienteCargaPorUrlRef.current = true;
    router.replace("/nuevo-presupuesto", { scroll: false });
    setPresupuestoId(null);
    setItems([]);
    setFecha(new Date().toISOString().slice(0, 10));
    setNombreCliente("");
    setDomicilio("");
    setRubroSeleccionado(null);
    setRecetaId("");
    setCantidad("1");
    setPrecioMaterial("");
    setPrecioMo("");
    setBanner(null);
  }

  async function handleCrearPresupuesto() {
    const cliente = nombreCliente.trim();
    const dom = domicilio.trim();
    if (!fecha || !cliente || !dom) {
      setBanner({
        type: "error",
        text: "Completá fecha, cliente y domicilio.",
      });
      return;
    }

    setCreating(true);
    setBanner(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("presupuestos")
        .insert({
          nombre_obra: cliente,
          nombre_cliente: cliente,
          domicilio: dom,
          fecha,
          ajuste_total_obra_pct: 0,
          estado: "borrador",
        })
        .select("id")
        .single();

      if (error) {
        setBanner({ type: "error", text: error.message });
        return;
      }

      const id = data?.id != null ? String(data.id) : null;
      if (!id) {
        setBanner({
          type: "error",
          text: "No se recibió el id del presupuesto.",
        });
        return;
      }

      setPresupuestoId(id);
      router.replace(
        `/nuevo-presupuesto?id=${encodeURIComponent(id)}`,
        { scroll: false }
      );
      setBanner({
        type: "success",
        text: "Presupuesto creado. Seleccioná un rubro y agregá ítems.",
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Error al crear el presupuesto.";
      setBanner({ type: "error", text: msg });
    } finally {
      setCreating(false);
    }
  }

  async function handleAgregarItem() {
    if (!presupuestoId) return;
    const receta = recetaSeleccionada;
    if (!receta) {
      setBanner({ type: "error", text: "Seleccioná un ítem." });
      return;
    }

    const q = Number.parseFloat(cantidad.replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) {
      setBanner({
        type: "error",
        text: "Ingresá una cantidad numérica mayor a cero.",
      });
      return;
    }

    const pm = Number.parseFloat(precioMaterial.replace(",", "."));
    const pmo = Number.parseFloat(precioMo.replace(",", "."));
    if (!Number.isFinite(pm) || !Number.isFinite(pmo)) {
      setBanner({
        type: "error",
        text: "Ingresá precios válidos para material y mano de obra.",
      });
      return;
    }

    setAdding(true);
    setBanner(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("presupuestos_items").insert({
        presupuesto_id: presupuestoId,
        receta_id: receta.id,
        cantidad: q,
        precio_material_congelado: pm,
        descuento_material_pct: 0,
        precio_mo_congelada: pmo,
      });

      if (error) {
        setBanner({ type: "error", text: error.message });
        return;
      }

      setRecetaId("");
      setCantidad("1");
      setBanner({ type: "success", text: "Ítem agregado." });
      await loadItems(presupuestoId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al agregar el ítem.";
      setBanner({ type: "error", text: msg });
    } finally {
      setAdding(false);
    }
  }

  async function handleEliminarItem(itemId: string) {
    if (!presupuestoId) return;
    setDeletingItemId(itemId);
    setBanner(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("presupuestos_items")
        .delete()
        .eq("id", itemId);

      if (error) {
        setBanner({ type: "error", text: error.message });
        return;
      }

      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al eliminar.";
      setBanner({ type: "error", text: msg });
    } finally {
      setDeletingItemId(null);
    }
  }

  async function handleDesestimarPresupuesto() {
    if (!presupuestoId) return;
    if (!confirm("¿Desestimar este presupuesto? Se eliminarán todos los ítems."))
      return;

    setDesestimando(true);
    setBanner(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("presupuestos_items")
        .delete()
        .eq("presupuesto_id", presupuestoId);

      if (error) {
        setBanner({ type: "error", text: error.message });
        setDesestimando(false);
        return;
      }

      const { error: errPresupuesto } = await supabase
        .from("presupuestos")
        .delete()
        .eq("id", presupuestoId);

      if (errPresupuesto) {
        setBanner({ type: "error", text: errPresupuesto.message });
        setDesestimando(false);
        return;
      }

      setBanner({ type: "success", text: "Presupuesto desestimado." });
      resetPantalla();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al desestimar.";
      setBanner({ type: "error", text: msg });
    } finally {
      setDesestimando(false);
    }
  }

  const itemsBloqueados = !presupuestoId || catalogLoading;

  const recetasEnPresupuesto = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) set.add(i.receta_id);
    return set;
  }, [items]);

  function toggleRubroExpanded(rubroId: string) {
    setExpandedRubros((prev) => {
      const next = new Set(prev);
      if (next.has(rubroId)) next.delete(rubroId);
      else next.add(rubroId);
      return next;
    });
  }

  async function handleCheckboxChange(receta: Receta, checked: boolean) {
    if (!presupuestoId) return;
    if (checked) {
      const nuevoItem: PresupuestoItemRow = {
        id: `temp-${receta.id}`,
        presupuesto_id: presupuestoId,
        receta_id: String(receta.id),
        cantidad: 1,
        precio_material_congelado: receta.costo_base_material_unitario ?? 0,
        descuento_material_pct: 0,
        precio_mo_congelada: receta.costo_base_mo_unitario ?? 0,
        recetas: {
          nombre_item: receta.nombre_item,
          unidad: receta.unidad,
          rubro_id: String(receta.rubro_id),
        },
      };
      setItems((prev) => [...prev, nuevoItem]);
      setBanner(null);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("presupuestos_items")
          .insert({
            presupuesto_id: presupuestoId,
            receta_id: receta.id,
            cantidad: 1,
            precio_material_congelado: receta.costo_base_material_unitario ?? 0,
            descuento_material_pct: 0,
            precio_mo_congelada: receta.costo_base_mo_unitario ?? 0,
          })
          .select(
            "id, presupuesto_id, receta_id, cantidad, precio_material_congelado, descuento_material_pct, precio_mo_congelada, recetas:catalogo_recetas ( nombre_item, unidad, rubro_id )"
          )
          .single();
        if (error) {
          setItems((prev) => prev.filter((i) => i.id !== nuevoItem.id));
          setBanner({ type: "error", text: error.message });
          return;
        }
        setItems((prev) =>
          prev.map((i) =>
            i.id === nuevoItem.id
              ? mapPresupuestoItemRow(
                  data as unknown as Record<string, unknown>
                )
              : i
          )
        );
      } catch (e) {
        setItems((prev) => prev.filter((i) => i.id !== nuevoItem.id));
        const msg = e instanceof Error ? e.message : "Error al agregar.";
        setBanner({ type: "error", text: msg });
      }
    } else {
      const itemsToRemove = items.filter(
        (i) => String(i.receta_id) === String(receta.id)
      );
      if (itemsToRemove.length === 0) return;
      const idsToRemove = itemsToRemove.map((i) => i.id);
      setItems((prev) => prev.filter((i) => !idsToRemove.includes(i.id)));
      setBanner(null);
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("presupuestos_items")
          .delete()
          .in("id", idsToRemove);
        if (error) {
          setBanner({ type: "error", text: error.message });
          await loadItems(presupuestoId);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al quitar.";
        setBanner({ type: "error", text: msg });
        await loadItems(presupuestoId);
      }
    }
  }

  async function handleAgregarTodosRubro(rubroId: string) {
    if (!presupuestoId) return;
    const recetasToAdd = recetas.filter((r) => String(r.rubro_id) === rubroId);
    if (recetasToAdd.length === 0) {
      setBanner({
        type: "error",
        text: "Este rubro no tiene ítems en el catálogo.",
      });
      return;
    }

    const nuevosItems: PresupuestoItemRow[] = recetasToAdd.map((r) => ({
      id: `temp-${r.id}`,
      presupuesto_id: presupuestoId,
      receta_id: String(r.id),
      cantidad: 1,
      precio_material_congelado: r.costo_base_material_unitario ?? 0,
      descuento_material_pct: 0,
      precio_mo_congelada: r.costo_base_mo_unitario ?? 0,
      recetas: {
        nombre_item: r.nombre_item,
        unidad: r.unidad,
        rubro_id: String(r.rubro_id),
      },
    }));
    setItems((prev) => [...prev, ...nuevosItems]);
    setAgregandoTodosRubro(rubroId);
    setBanner(null);
    try {
      const supabase = createClient();
      const rows = recetasToAdd.map((r) => ({
        presupuesto_id: presupuestoId,
        receta_id: r.id,
        cantidad: 1,
        precio_material_congelado: r.costo_base_material_unitario ?? 0,
        descuento_material_pct: 0,
        precio_mo_congelada: r.costo_base_mo_unitario ?? 0,
      }));
      const { data, error } = await supabase
        .from("presupuestos_items")
        .insert(rows)
        .select(
          "id, presupuesto_id, receta_id, cantidad, precio_material_congelado, descuento_material_pct, precio_mo_congelada, recetas:catalogo_recetas ( nombre_item, unidad, rubro_id )"
        );
      if (error) {
        const tempIds = new Set(nuevosItems.map((i) => i.id));
        setItems((prev) => prev.filter((i) => !tempIds.has(i.id)));
        setBanner({ type: "error", text: error.message });
      } else {
        const created = (data ?? []).map((row) =>
          mapPresupuestoItemRow(row as Record<string, unknown>)
        );
        const tempIds = new Set(nuevosItems.map((i) => i.id));
        setItems((prev) => [
          ...prev.filter((i) => !tempIds.has(i.id)),
          ...created,
        ]);
        setBanner({
          type: "success",
          text: `${recetasToAdd.length} ítem(s) agregado(s).`,
        });
      }
    } catch (e) {
      const tempIds = new Set(nuevosItems.map((i) => i.id));
      setItems((prev) => prev.filter((i) => !tempIds.has(i.id)));
      const msg = e instanceof Error ? e.message : "Error al agregar.";
      setBanner({ type: "error", text: msg });
    } finally {
      setAgregandoTodosRubro(null);
    }
  }

  async function handleQuitarTodosRubro(rubroId: string) {
    if (!presupuestoId) return;
    const recetaIdsSet = new Set(
      recetas
        .filter((r) => String(r.rubro_id) === rubroId)
        .map((r) => String(r.id))
    );
    const itemsToDelete = items.filter((i) =>
      recetaIdsSet.has(String(i.receta_id))
    );
    if (itemsToDelete.length === 0) {
      setBanner({ type: "error", text: "No hay ítems de este rubro en el presupuesto." });
      return;
    }

    const idsToDelete = itemsToDelete.map((i) => i.id);
    setItems((prev) => prev.filter((i) => !idsToDelete.includes(i.id)));
    setQuitandoTodosRubro(rubroId);
    setBanner(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("presupuestos_items")
        .delete()
        .in("id", idsToDelete);
      if (error) {
        setBanner({ type: "error", text: error.message });
        await loadItems(presupuestoId);
      } else {
        setBanner({
          type: "success",
          text: `${itemsToDelete.length} ítem(s) eliminado(s).`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al quitar.";
      setBanner({ type: "error", text: msg });
      await loadItems(presupuestoId);
    } finally {
      setQuitandoTodosRubro(null);
    }
  }

  return (
    <>
    <div className="font-grotesk relative flex h-[100dvh] min-h-0 overflow-hidden bg-cdm-bg text-cdm-fg">
      <WavesBackdrop />
      <aside
        className="relative z-10 flex h-full min-h-0 flex-shrink-0 flex-col border-r border-cdm-line bg-cdm-bg/70 backdrop-blur-xl"
        style={{ width: sidebarWidth, minWidth: 200, maxWidth: 480 }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          className="absolute -right-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-cdm-accent/40"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />
        <div className="flex flex-col justify-end border-b border-cdm-line px-6 py-4">
          {/* La marca vive en la carcasa (sidebar del shell) — acá solo el rol del panel. */}
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cdm-accent">
            Rubros
          </h2>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {catalogLoading ? (
            <p className="font-light text-cdm-muted">Cargando…</p>
          ) : catalogError ? (
            <p className="text-sm text-cdm-fg">{catalogError}</p>
          ) : rubrosSidebarOrdenados.length === 0 ? (
            <p className="text-sm font-light text-cdm-muted">
              No hay rubros en la base. Cargalos desde Catálogo.
            </p>
          ) : (
            <div className="space-y-1">
              {rubrosSidebarOrdenados.map((rubroRow) => {
                const rubroId = String(rubroRow.id);
                const nombreCrudo =
                  rubroRow.nombre?.trim() ||
                  rubroLabels.get(rubroId) ||
                  "";
                const label =
                  formatRubroName(nombreCrudo) || `Rubro ${rubroId}`;
                const isExpanded = expandedRubros.has(rubroId);
                const recetasEnRubro = recetas
                  .filter((r) => String(r.rubro_id) === rubroId)
                  .sort((a, b) => a.nombre_item.localeCompare(b.nombre_item));
                const sinRecetasEnCatalogo = recetasEnRubro.length === 0;
                return (
                  <div
                    key={rubroId}
                    className="border border-cdm-line bg-cdm-panel/55 transition-[border-color,box-shadow] duration-300 hover:border-cdm-accent/40 hover:shadow-[0_0_26px_-10px_rgba(34,211,238,0.35)]"
                  >
                    <button
                      type="button"
                      onClick={() => toggleRubroExpanded(rubroId)}
                      className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-cdm-fg transition-colors hover:bg-cdm-fg/[0.04]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ChevronIcon
                          expanded={isExpanded}
                          className="shrink-0 text-cdm-accent"
                        />
                        <span className="truncate">{label}</span>
                      </span>
                      {(itemCountByRubro.get(rubroId) ?? 0) > 0 ? (
                        <span
                          className="shrink-0 bg-cdm-accent px-2 py-0.5 text-xs font-bold tabular-nums text-cdm-bg shadow-[0_0_12px_rgba(34,211,238,0.45)]"
                          aria-label={`${itemCountByRubro.get(rubroId)} ítems en el presupuesto`}
                        >
                          {itemCountByRubro.get(rubroId)}
                        </span>
                      ) : null}
                    </button>
                    {isExpanded && (
                      <div className="overflow-hidden border-t border-cdm-line p-3">
                        <div className="mb-3 flex min-w-0 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void handleAgregarTodosRubro(rubroId)
                            }
                            disabled={
                              itemsBloqueados ||
                              agregandoTodosRubro === rubroId ||
                              sinRecetasEnCatalogo
                            }
                            className="flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-none border border-cdm-accent/40 bg-cdm-accent/10 px-2 py-2 text-xs font-medium text-cdm-accent transition-all duration-200 hover:bg-cdm-accent hover:text-cdm-bg hover:shadow-[0_0_20px_rgba(34,211,238,0.35)] disabled:opacity-40"
                          >
                            <CheckIcon className="shrink-0" />
                            <span className="truncate">Agregar todos</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleQuitarTodosRubro(rubroId)
                            }
                            disabled={
                              !presupuestoId ||
                              quitandoTodosRubro === rubroId
                            }
                            className="flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-none border border-cdm-line bg-transparent px-2 py-2 text-xs font-medium text-cdm-muted transition-colors hover:border-cdm-fg/40 hover:text-cdm-fg disabled:opacity-40"
                          >
                            <TrashIcon className="shrink-0" />
                            <span className="truncate">Quitar todos</span>
                          </button>
                        </div>
                        <ul className="max-h-48 space-y-1 overflow-y-auto">
                          {sinRecetasEnCatalogo ? (
                            <li className="px-2 py-2 text-xs font-light text-cdm-muted">
                              No hay ítems en el catálogo para este rubro.
                            </li>
                          ) : (
                            recetasEnRubro.map((receta) => {
                              const rid = String(receta.id);
                              const isInPresupuesto = recetasEnPresupuesto.has(
                                rid
                              );
                              return (
                                <li
                                  key={rid}
                                  className="flex items-center gap-2 rounded-none px-2 py-1.5 transition-colors hover:bg-cdm-fg/[0.04]"
                                >
                                  <input
                                    type="checkbox"
                                    id={`receta-${rid}`}
                                    checked={isInPresupuesto}
                                    onChange={(e) =>
                                      void handleCheckboxChange(
                                        receta,
                                        e.target.checked
                                      )
                                    }
                                    disabled={!presupuestoId}
                                    className="h-4 w-4 cursor-pointer accent-cdm-accent"
                                  />
                                  <label
                                    htmlFor={`receta-${rid}`}
                                    className="cursor-pointer flex-1 truncate text-[13px] font-light text-cdm-fg"
                                  >
                                    {receta.nombre_item}
                                  </label>
                                </li>
                              );
                            })
                          )}
                        </ul>
                        <p className="mt-2 text-xs text-cdm-muted">
                          Casillero = agregar/quitar ítem. Agregar todos = todos del rubro.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
          <div className="shrink-0 border-t border-cdm-line p-4">
            <button
              type="button"
              onClick={() => setNuevoItemModalOpen(true)}
              disabled={catalogLoading}
              className="w-full rounded-none border border-cdm-line bg-transparent py-3 text-xs font-medium uppercase tracking-[0.18em] text-cdm-muted transition-all duration-200 hover:border-cdm-accent/50 hover:text-cdm-fg hover:shadow-[0_0_24px_-10px_rgba(34,211,238,0.4)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cdm-accent"
            >
              + Agregar Nuevo Ítem
            </button>
          </div>
        </nav>
      </aside>

      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden text-cdm-fg">
        <div className="z-10 flex shrink-0 flex-col">
          <div className="relative flex flex-col justify-end px-10 py-4 sm:py-5">
            {/* Línea de horizonte detrás del header (iteración 3). */}
            <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
            <h1 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
              <span
                aria-hidden
                className="h-[5px] w-[5px] bg-cdm-accent shadow-[0_0_8px_rgba(34,211,238,0.9)]"
              />
              Nuevo presupuesto
            </h1>
          </div>

          {banner ? (
            <div
              role="status"
              className={
                banner.type === "error"
                  ? "mx-10 mt-3 rounded-none border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                  : "mx-10 mt-3 rounded-none border border-cdm-accent/40 bg-cdm-accent/10 px-4 py-3 text-sm text-cdm-accent"
              }
            >
              {banner.text}
            </div>
          ) : null}

          <div className="px-10 pb-5 pt-4">
            <section className="cdm-glass p-5 sm:p-6">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cdm-accent">
                Cabecera
              </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <label htmlFor="fecha" className={labelClass(true)}>
                  Fecha
                </label>
                <input
                  id="fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  disabled={!!presupuestoId}
                  className={fieldClass(!!presupuestoId, true)}
                />
              </div>
              <div>
                <label htmlFor="nombre-cliente" className={labelClass(true)}>
                  Cliente
                </label>
                <input
                  id="nombre-cliente"
                  type="text"
                  autoComplete="name"
                  value={nombreCliente}
                  onChange={(e) => setNombreCliente(e.target.value)}
                  disabled={!!presupuestoId}
                  className={fieldClass(!!presupuestoId, true)}
                  placeholder="Nombre o razón social"
                />
              </div>
              <div>
                <label htmlFor="domicilio" className={labelClass(true)}>
                  Domicilio
                </label>
                <input
                  id="domicilio"
                  type="text"
                  autoComplete="street-address"
                  value={domicilio}
                  onChange={(e) => setDomicilio(e.target.value)}
                  disabled={!!presupuestoId}
                  className={fieldClass(!!presupuestoId, true)}
                  placeholder="Dirección de la obra"
                />
              </div>
            </div>
            <div className="mt-6">
              {/* CTA protagonista: off-white sólido + glow taupe al hover. */}
              <motion.button
                type="button"
                onClick={() => void handleCrearPresupuesto()}
                disabled={creating || !!presupuestoId}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.985 }}
                className="rounded-none border border-cdm-fg bg-cdm-fg px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-cdm-bg transition-shadow duration-300 hover:shadow-[0_0_36px_-4px_rgba(34,211,238,0.55)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cdm-accent"
              >
                {creating ? "Creando…" : "Iniciar / Crear presupuesto"}
              </motion.button>
            </div>
          </section>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div
            className={
              presupuestoId
                ? "px-10 py-5 pb-80 sm:py-6 sm:pb-72"
                : "px-10 py-5 sm:py-6"
            }
          >
          {presupuestoId && rubroSeleccionado ? (
            <section
              className={`cdm-glass mb-8 p-5 sm:p-6 ${itemsBloqueados ? "opacity-60" : ""}`}
            >
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cdm-accent">
                Ítems —{" "}
                {formatRubroName(
                  rubroLabels.get(rubroSeleccionado) ?? rubroSeleccionado
                ) || rubroSeleccionado}
              </h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label htmlFor="item" className={labelClass(true)}>
                    Ítem
                  </label>
                  <select
                    id="item"
                    value={recetaId}
                    onChange={(e) => setRecetaId(e.target.value)}
                    disabled={itemsBloqueados || catalogError !== null}
                    className={fieldClass(itemsBloqueados || catalogError !== null, true)}
                  >
                    <option value="">Seleccionar ítem</option>
                    {recetasDelRubro.map((r) => (
                      <option key={String(r.id)} value={String(r.id)}>
                        {r.nombre_item}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cantidad" className={labelClass(true)}>
                    Cantidad{" "}
                    {recetaSeleccionada?.unidad ? (
                      <span className="font-normal text-cdm-muted">
                        ({recetaSeleccionada.unidad})
                      </span>
                    ) : null}
                  </label>
                  <input
                    id="cantidad"
                    type="text"
                    inputMode="decimal"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    disabled={itemsBloqueados || catalogError !== null}
                    className={fieldClass(
                      itemsBloqueados || catalogError !== null,
                      true
                    )}
                    placeholder="1"
                  />
                </div>
                <div>
                  <label htmlFor="precio-material" className={labelClass(true)}>
                    Precio material unit.
                  </label>
                  <input
                    id="precio-material"
                    type="text"
                    inputMode="decimal"
                    value={precioMaterial}
                    onChange={(e) => setPrecioMaterial(e.target.value)}
                    disabled={
                      itemsBloqueados ||
                      catalogError !== null ||
                      !recetaSeleccionada
                    }
                    className={fieldClass(
                      itemsBloqueados ||
                        catalogError !== null ||
                        !recetaSeleccionada,
                      true
                    )}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="precio-mo" className={labelClass(true)}>
                    Precio MO unit.
                  </label>
                  <input
                    id="precio-mo"
                    type="text"
                    inputMode="decimal"
                    value={precioMo}
                    onChange={(e) => setPrecioMo(e.target.value)}
                    disabled={
                      itemsBloqueados ||
                      catalogError !== null ||
                      !recetaSeleccionada
                    }
                    className={fieldClass(
                      itemsBloqueados ||
                        catalogError !== null ||
                        !recetaSeleccionada,
                      true
                    )}
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={() => void handleAgregarItem()}
                    disabled={
                      adding ||
                      itemsBloqueados ||
                      catalogError !== null ||
                      !recetaId
                    }
                    className="rounded-none border border-cdm-accent/50 bg-cdm-accent/10 px-4 py-3 text-sm font-medium uppercase tracking-wider text-cdm-accent transition-all duration-200 hover:bg-cdm-accent hover:text-cdm-bg hover:shadow-[0_0_24px_rgba(34,211,238,0.35)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cdm-accent"
                  >
                    {adding ? "…" : "Agregar ítem"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <section className="mb-8 sm:mb-10">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cdm-accent">
                Líneas del presupuesto
              </h2>
              {presupuestoId && itemsLoading ? (
                <span className="text-xs text-cdm-muted">
                  Actualizando tabla…
                </span>
              ) : null}
            </div>

            <div className="cdm-glass w-full max-w-full min-w-0">
              <div
                className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
                role="region"
                aria-label="Tabla de ítems (desplazá horizontalmente en pantallas chicas)"
              >
              {/*
                table-auto + min-w por columna: en viewports angostos la tabla supera el 100%
                y este contenedor hace scroll horizontal — sin recortar titulares.
              */}
              <table className="w-max min-w-full border-separate border-spacing-0 text-center text-sm table-auto [min-width:max(100%,106rem)]">
                <thead>
                  <tr className="border-b border-t border-cdm-line text-[10px] font-medium uppercase tracking-[0.12em] text-cdm-muted">
                    <th className="sticky top-0 left-0 z-[25] box-border min-w-[5.5rem] border-b border-r border-t border-cdm-line bg-cdm-panel px-3 py-3 text-center font-medium whitespace-normal leading-snug">
                      Acción
                    </th>
                    <th className="sticky top-0 z-[24] box-border min-w-[12rem] border-b border-r border-t border-cdm-line bg-cdm-panel px-3 py-3 text-left font-medium leading-snug shadow-[4px_0_14px_-6px_rgba(0,0,0,0.55)] [left:5.5rem] sm:min-w-[15rem] md:min-w-[18rem]">
                      Rubro / Detalle
                    </th>
                    <th className="sticky top-0 z-20 min-w-[6.25rem] border-b border-r border-t border-cdm-line bg-cdm-panel px-3 py-3 text-center font-medium whitespace-normal leading-snug">
                      Unidad
                    </th>
                    <th className="sticky top-0 z-20 min-w-[7.5rem] border-b border-r border-t border-cdm-line bg-cdm-panel px-3 py-3 text-center font-medium whitespace-normal leading-snug">
                      Cantidad
                    </th>
                    <th className="sticky top-0 z-20 min-w-[14rem] border-b border-r border-t border-cdm-line bg-cdm-panel px-3 py-3 text-center font-medium leading-snug whitespace-normal">
                      Precio Material
                    </th>
                    <th className="sticky top-0 z-20 min-w-[7.5rem] border-b border-r border-t border-cdm-line bg-cdm-panel px-2 py-3 text-center font-medium leading-snug whitespace-normal">
                      Desc. %
                    </th>
                    <th className="sticky top-0 z-20 min-w-[14.5rem] border-b border-r border-t border-cdm-line bg-cdm-panel px-3 py-3 text-center font-medium leading-snug whitespace-normal">
                      Subtotal materiales
                    </th>
                    <th className="sticky top-0 z-20 min-w-[12rem] border-b border-r border-t border-cdm-line bg-cdm-panel px-3 py-3 text-center font-medium leading-snug whitespace-normal">
                      Precio M.O.
                    </th>
                    <th className="sticky top-0 z-20 min-w-[13rem] border-b border-r border-t border-cdm-line bg-cdm-panel px-3 py-3 text-center font-medium leading-snug whitespace-normal">
                      Subtotal M.O.
                    </th>
                    <th className="sticky top-0 z-20 min-w-[12rem] border-b border-l border-r border-t border-cdm-line bg-cdm-panel px-3 py-3 text-center text-[10px] font-semibold leading-snug text-cdm-accent whitespace-normal">
                      Total Ítem
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!presupuestoId ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="border-b border-cdm-line bg-transparent px-5 py-10 text-center font-light text-cdm-muted sm:py-12"
                      >
                        Creá un presupuesto para ver las líneas aquí.
                      </td>
                    </tr>
                  ) : items.length === 0 && !itemsLoading ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="border-b border-cdm-line bg-transparent px-5 py-10 text-center font-light text-cdm-muted sm:py-12"
                      >
                        Aún no hay ítems. Elegí un rubro y agregá líneas.
                      </td>
                    </tr>
                  ) : (
                    items.map((row) => {
                      const q = Number(row.cantidad) || 0;
                      const pm =
                        Number(row.precio_material_congelado) || 0;
                      const pmo = Number(row.precio_mo_congelada) || 0;
                      const rawDisc = Number(row.descuento_material_pct);
                      const pctLine = Number.isFinite(rawDisc)
                        ? Math.min(100, Math.max(0, rawDisc))
                        : 0;
                      const facMat = Math.max(0, 1 - pctLine / 100);
                      const subtotalMaterial = roundArs2(q * pm * facMat);
                      const subtotalMo = roundArs2(q * pmo);
                      const totalItem = roundArs2(
                        subtotalMaterial + subtotalMo
                      );
                      const nombre =
                        row.recetas?.nombre_item ?? "Ítem (sin nombre)";
                      const rid =
                        row.recetas?.rubro_id != null
                          ? String(row.recetas.rubro_id)
                          : null;
                      const rubroRaw =
                        rid != null ? rubroLabels.get(rid) ?? null : null;
                      const rubroDisplay =
                        rubroRaw != null ? formatRubroName(rubroRaw) : null;
                      const unidad = row.recetas?.unidad ?? "—";
                      const isDeleting = deletingItemId === row.id;
                      const isUpdating = updatingItemId === row.id;
                      const inputClass =
                        "w-full min-w-0 border-0 border-none bg-transparent px-2 py-1.5 text-center text-sm font-light tabular-nums text-cdm-fg outline-none focus:border-none focus:outline-none focus:ring-0 focus:ring-offset-0 whitespace-nowrap";

                      return (
                        <tr key={row.id} className="transition-colors hover:bg-cdm-fg/[0.025]">
                          <td className="sticky left-0 z-[15] box-border min-w-[5.5rem] border-b border-r border-cdm-line bg-cdm-panel p-0 align-middle">
                            <div className="flex min-h-[2.75rem] items-center justify-center px-1">
                              <button
                                type="button"
                                onClick={() =>
                                  void handleEliminarItem(row.id)
                                }
                                disabled={isDeleting}
                                className="shrink-0 rounded-none p-1 text-cdm-muted transition-colors hover:bg-red-500/15 hover:text-red-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-accent disabled:opacity-50"
                                title="Eliminar ítem"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </td>
                          <td className="sticky z-[14] min-w-[12rem] border-b border-r border-cdm-line bg-cdm-panel px-3 py-1.5 text-left font-light text-cdm-fg leading-snug shadow-[4px_0_14px_-6px_rgba(0,0,0,0.5)] [left:5.5rem] sm:min-w-[15rem] md:min-w-[18rem]">
                            <span className="block break-words">
                              {rubroDisplay ? (
                                <>
                                  <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-cdm-accent/80">
                                    {rubroDisplay}
                                  </span>
                                  <span>{nombre}</span>
                                </>
                              ) : (
                                nombre
                              )}
                            </span>
                          </td>
                          <td className="min-w-[6.25rem] border-b border-r border-cdm-line bg-transparent px-3 py-1.5 text-center font-light text-cdm-muted leading-snug">
                            {unidad}
                          </td>
                          <td className="min-w-[7.5rem] border-b border-r border-cdm-line bg-transparent p-0">
                            <FormattedNumberInput
                              value={row.cantidad}
                              decimals={2}
                              onChange={(v) =>
                                updateItemInState(
                                  row.id,
                                  "cantidad",
                                  v >= 0 ? v : 0
                                )
                              }
                              onBlur={() => persistRow(row.id)}
                              disabled={isUpdating}
                              className={inputClass}
                            />
                          </td>
                          <td className="min-w-[14rem] overflow-visible whitespace-nowrap border-b border-r border-cdm-line bg-transparent p-0">
                            <FormattedNumberInput
                              value={row.precio_material_congelado}
                              decimals={2}
                              pesoPrefix
                              onChange={(v) =>
                                updateItemInState(
                                  row.id,
                                  "precio_material_congelado",
                                  v >= 0 ? v : 0
                                )
                              }
                              onBlur={() => persistRow(row.id)}
                              disabled={isUpdating}
                              className={inputClass}
                            />
                          </td>
                          <td className="min-w-[7.5rem] border-b border-r border-cdm-line bg-transparent p-0">
                            <FormattedNumberInput
                              value={pctLine}
                              decimals={2}
                              onChange={(v) =>
                                updateItemInState(
                                  row.id,
                                  "descuento_material_pct",
                                  Math.min(100, Math.max(0, v))
                                )
                              }
                              onBlur={() => persistRow(row.id)}
                              disabled={isUpdating}
                              className={inputClass}
                            />
                          </td>
                          <td className="min-w-[14.5rem] overflow-visible whitespace-nowrap border-b border-r border-cdm-line bg-transparent p-0">
                            <PesosAmountInput
                              amount={subtotalMaterial}
                              disabled={isUpdating || facMat <= 0}
                              onAmountChange={(next) => {
                                const qq = Number(row.cantidad) || 0;
                                if (qq <= 0 || facMat <= 0) return;
                                const listSub = roundArs2(next / facMat);
                                updateItemInState(
                                  row.id,
                                  "precio_material_congelado",
                                  roundArs2(listSub / qq)
                                );
                              }}
                              onBlur={() => persistRow(row.id)}
                            />
                          </td>
                          <td className="min-w-[12rem] overflow-visible whitespace-nowrap border-b border-r border-cdm-line bg-transparent p-0">
                            <FormattedNumberInput
                              value={row.precio_mo_congelada}
                              decimals={2}
                              pesoPrefix
                              onChange={(v) =>
                                updateItemInState(
                                  row.id,
                                  "precio_mo_congelada",
                                  v >= 0 ? v : 0
                                )
                              }
                              onBlur={() => persistRow(row.id)}
                              disabled={isUpdating}
                              className={inputClass}
                            />
                          </td>
                          <td className="min-w-[13rem] overflow-visible whitespace-nowrap border-b border-r border-cdm-line bg-transparent p-0">
                            <PesosAmountInput
                              amount={subtotalMo}
                              disabled={isUpdating}
                              onAmountChange={(next) => {
                                const qq = Number(row.cantidad) || 0;
                                updateItemInState(
                                  row.id,
                                  "precio_mo_congelada",
                                  qq > 0 ? roundArs2(next / qq) : 0
                                );
                              }}
                              onBlur={() => persistRow(row.id)}
                            />
                          </td>
                          <td className="min-w-[12rem] overflow-visible whitespace-nowrap border-b border-l border-r border-cdm-line bg-cdm-fg/[0.03] p-0">
                            <PesosAmountInput
                              amount={totalItem}
                              readOnly
                              bold
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
              {presupuestoId && items.length > 0 ? (
                <div className="w-full max-w-full border-t border-cdm-line px-0 py-4">
                  <div className="flex w-full max-w-full flex-col gap-4 px-4">
                    <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 sm:gap-8">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
                          Total materiales
                        </p>
                        <p className="font-raleway w-full min-w-0 text-right text-xl font-bold tabular-nums text-cdm-fg">
                          {formatMoney(totales.material)}
                        </p>
                      </div>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
                          Total mano de obra
                        </p>
                        <p className="font-raleway w-full min-w-0 text-right text-xl font-bold tabular-nums text-cdm-fg">
                          {formatMoney(totales.mo)}
                        </p>
                      </div>
                    </div>
                    {/* Total general en display heroico: el número que manda en la pantalla. */}
                    <div className="flex flex-wrap items-baseline justify-end gap-x-4 gap-y-2 border-t border-cdm-line pt-4">
                      <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-cdm-muted">
                        Total general
                      </span>
                      <CifraHeroica className="whitespace-nowrap text-[clamp(32px,3.4vw,56px)] leading-none">
                        {formatMoney(totales.total)}
                      </CifraHeroica>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          </div>
          </div>

          {presupuestoId ? (
            <div
              className="shrink-0 border-t border-cdm-line bg-cdm-bg/80 px-10 py-4 backdrop-blur-xl"
              role="region"
              aria-label="Acciones del presupuesto"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
                <Link
                  href={`/rentabilidad?id=${encodeURIComponent(presupuestoId)}`}
                  className="inline-flex w-fit items-center justify-center rounded-none border border-cdm-line bg-transparent px-6 py-3 text-sm font-medium uppercase tracking-wider text-cdm-fg transition-colors hover:border-cdm-accent/50 hover:text-cdm-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cdm-accent"
                >
                  Rentabilidad y costos
                </Link>
                <Link
                  href={`/propuesta?id=${encodeURIComponent(presupuestoId)}`}
                  className="inline-flex w-fit items-center justify-center rounded-none border border-cdm-fg bg-cdm-fg px-6 py-3 text-sm font-semibold uppercase tracking-wider text-cdm-bg transition-shadow duration-300 hover:shadow-[0_0_32px_-4px_rgba(34,211,238,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cdm-accent"
                >
                  Continuar a propuesta comercial
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDesestimarPresupuesto()}
                  disabled={desestimando}
                  className="w-fit rounded-none border border-cdm-line/60 bg-transparent px-5 py-2.5 text-sm font-medium uppercase tracking-wider text-cdm-muted transition-colors hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cdm-accent"
                >
                  {desestimando ? "Desestimando…" : "Desestimar presupuesto"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
    <NuevoRecetaModal
      open={nuevoItemModalOpen}
      onClose={() => setNuevoItemModalOpen(false)}
      rubros={rubrosAll}
      onSuccess={() => void loadCatalog()}
    />
    </>
  );
}
