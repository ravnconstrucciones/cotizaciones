"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CatalogToast } from "@/components/catalog-toast";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import { createClient } from "@/lib/supabase/client";
import { formatNumber, parseFormattedNumber } from "@/lib/format-currency";
import { formatRubroName } from "@/lib/format-rubro-name";
import type { Receta, RubroRow } from "@/types/ravn";

const DENEGADA_MSG =
  "Acción denegada. El rubro contiene ítems. Elimina o reasigna los materiales primero.";

type CatalogTab = "items" | "rubros";

function sortRubrosByNumericId(rubros: RubroRow[]): RubroRow[] {
  return [...rubros].sort((a, b) => {
    const na = Number(a.id);
    const nb = Number(b.id);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a.id).localeCompare(String(b.id), undefined, {
      numeric: true,
    });
  });
}

function parseRubroIdForInsert(raw: string): string | number {
  const t = raw.trim();
  if (!t) throw new Error("Ingresá el número o ID del rubro.");
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (!Number.isSafeInteger(n)) return t;
    return n;
  }
  return t;
}

function PriceCell({
  value,
  onSave,
  disabled,
}: {
  value: number;
  onSave: (n: number) => Promise<void>;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [edit, setEdit] = useState("");
  const display = focused ? edit : formatNumber(value, 2);

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      className="font-geist w-full min-w-[6rem] rounded-xl border border-cdm-line bg-transparent px-3 py-2 text-right text-[13px] tabular-nums text-cdm-fg focus-visible:border-cdm-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cdm-accent/40 disabled:opacity-50"
      value={display}
      onFocus={() => {
        setFocused(true);
        setEdit(String(value));
      }}
      onChange={(e) => setEdit(e.target.value)}
      onBlur={() => {
        const raw = edit;
        const n = parseFormattedNumber(raw);
        setFocused(false);
        setEdit("");
        if (Number.isFinite(n) && n >= 0) void onSave(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function NuevoRubroModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [idInput, setIdInput] = useState("");
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function reset() {
    setIdInput("");
    setNombre("");
    setLocalError(null);
  }

  function handleClose() {
    if (!saving) {
      reset();
      onClose();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nom = nombre.trim();
    if (!nom) {
      setLocalError("Completá el nombre del rubro.");
      return;
    }
    let idValue: string | number;
    try {
      idValue = parseRubroIdForInsert(idInput);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "ID inválido.");
      return;
    }

    setSaving(true);
    setLocalError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("rubros")
        .insert({ id: idValue, nombre: nom });

      if (err) {
        setLocalError(err.message);
        return;
      }
      reset();
      await onCreated();
      onClose();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Error al crear.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nuevo-rubro-titulo"
    >
      <button
        type="button"
        className="absolute inset-0 bg-cdm-fg/30 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={handleClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-[24px] p-8 ring-1 ring-cdm-line bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md">
        <h2
          id="nuevo-rubro-titulo"
          className="font-geist text-xl font-semibold tracking-tight text-cdm-fg"
        >
          Nuevo rubro
        </h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-5">
          {localError ? (
            <p className="rounded-xl bg-red-400/10 px-3 py-2 text-[12px] text-red-400 ring-1 ring-red-400/30">
              {localError}
            </p>
          ) : null}
          <div>
            <label
              htmlFor="rubro-id-input"
              className="font-mono-hud mb-2 block text-[10px] uppercase tracking-[0.14em] text-cdm-muted"
            >
              Número (ID)
            </label>
            <input
              id="rubro-id-input"
              type="text"
              inputMode="numeric"
              value={idInput}
              onChange={(e) => setIdInput(e.target.value)}
              className="font-geist w-full rounded-xl border border-cdm-line bg-transparent px-4 py-3 text-sm text-cdm-fg focus-visible:border-cdm-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cdm-accent/40"
              placeholder="Ej. 1, 2, 10…"
              required
            />
          </div>
          <div>
            <label
              htmlFor="rubro-nombre-input"
              className="font-mono-hud mb-2 block text-[10px] uppercase tracking-[0.14em] text-cdm-muted"
            >
              Nombre descriptivo
            </label>
            <input
              id="rubro-nombre-input"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="font-geist w-full rounded-xl border border-cdm-line bg-transparent px-4 py-3 text-sm text-cdm-fg focus-visible:border-cdm-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cdm-accent/40"
              placeholder="Nombre del rubro"
              required
            />
          </div>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="font-mono-hud inline-flex items-center justify-center rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-muted ring-1 ring-cdm-line transition-colors hover:text-cdm-fg hover:ring-cdm-accent/30 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="font-mono-hud inline-flex items-center justify-center rounded-full bg-cdm-accent/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent ring-1 ring-cdm-accent/50 transition-colors hover:bg-cdm-accent/20 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CatalogoScreen() {
  const [tab, setTab] = useState<CatalogTab>("items");
  const [rubros, setRubros] = useState<RubroRow[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rubroFilter, setRubroFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [rubroModalOpen, setRubroModalOpen] = useState(false);
  const [deletingRubroId, setDeletingRubroId] = useState<string | null>(null);
  const [savingRubroNombreId, setSavingRubroNombreId] = useState<string | null>(
    null
  );
  const rubroNombreAlFocusRef = useRef<Map<string, string>>(new Map());
  const [toast, setToast] = useState<{
    message: string;
    variant: "error" | "success";
  } | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const [draft, setDraft] = useState({
    rubro_id: "",
    nombre_item: "",
    unidad: "",
    costo_base_material_unitario: "",
    costo_base_mo_unitario: "",
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const [rRes, recRes] = await Promise.all([
        supabase.from("rubros").select("id, nombre"),
        supabase.from("catalogo_recetas").select("*").order("nombre_item"),
      ]);

      if (rRes.error) {
        setError(rRes.error.message);
        setRubros([]);
      } else {
        setRubros(sortRubrosByNumericId((rRes.data ?? []) as RubroRow[]));
      }

      if (recRes.error) {
        setError(recRes.error.message);
        setRecetas([]);
      } else {
        setRecetas((recRes.data ?? []) as Receta[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const rubrosSorted = useMemo(() => sortRubrosByNumericId(rubros), [rubros]);

  const rubroLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rubros) m.set(String(r.id), r.nombre);
    return m;
  }, [rubros]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recetas.filter((r) => {
      if (rubroFilter && String(r.rubro_id) !== rubroFilter) return false;
      if (!q) return true;
      return r.nombre_item.toLowerCase().includes(q);
    });
  }, [recetas, search, rubroFilter]);

  async function updatePrecios(
    id: string,
    patch: Partial<
      Pick<Receta, "costo_base_material_unitario" | "costo_base_mo_unitario">
    >
  ) {
    setSavingId(id);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("catalogo_recetas")
        .update(patch)
        .eq("id", id);
      if (err) {
        setError(err.message);
        return;
      }
      setRecetas((prev) =>
        prev.map((r) => (String(r.id) === id ? { ...r, ...patch } : r))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteReceta(id: string) {
    if (
      !confirm("¿Estás seguro de eliminar este ítem del catálogo?")
    )
      return;
    setDeletingId(id);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("catalogo_recetas").delete().eq("id", id);
      if (err) {
        setError(err.message);
        return;
      }
      setRecetas((prev) => prev.filter((r) => String(r.id) !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteRubro(rubroId: string) {
    setDeletingRubroId(rubroId);
    try {
      const supabase = createClient();
      let itemCount = 0;
      const { count, error: countErr } = await supabase
        .from("catalogo_recetas")
        .select("id", { count: "exact", head: true })
        .eq("rubro_id", rubroId);

      if (countErr) {
        setToast({
          variant: "error",
          message: countErr.message,
        });
        return;
      }

      if (typeof count === "number") {
        itemCount = count;
      } else {
        const { data: sample } = await supabase
          .from("catalogo_recetas")
          .select("id")
          .eq("rubro_id", rubroId)
          .limit(1);
        itemCount = sample && sample.length > 0 ? 1 : 0;
      }

      if (itemCount > 0) {
        setToast({ variant: "error", message: DENEGADA_MSG });
        return;
      }

      if (
        !confirm(
          "¿Eliminar este rubro? Esta acción no se puede deshacer."
        )
      ) {
        return;
      }

      const { error: delErr } = await supabase
        .from("rubros")
        .delete()
        .eq("id", rubroId);

      if (delErr) {
        setToast({ variant: "error", message: delErr.message });
        return;
      }

      setRubros((prev) =>
        sortRubrosByNumericId(prev.filter((r) => String(r.id) !== rubroId))
      );
      setRubroFilter((f) => (f === rubroId ? "" : f));
    } catch (e) {
      setToast({
        variant: "error",
        message: e instanceof Error ? e.message : "Error al eliminar rubro.",
      });
    } finally {
      setDeletingRubroId(null);
    }
  }

  async function handleSaveRubroNombre(rubroId: string, nombre: string) {
    const nom = nombre.trim();
    if (!nom) {
      setToast({
        variant: "error",
        message: "El nombre del rubro no puede estar vacío.",
      });
      await loadAll();
      return;
    }
    const row = rubros.find((x) => String(x.id) === rubroId);
    if (!row) return;

    setSavingRubroNombreId(rubroId);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("rubros")
        .update({ nombre: nom })
        .eq("id", row.id);
      if (err) {
        setToast({ variant: "error", message: err.message });
        await loadAll();
        return;
      }
      setRubros((prev) =>
        sortRubrosByNumericId(
          prev.map((r) =>
            String(r.id) === rubroId ? { ...r, nombre: nom } : r
          )
        )
      );
    } catch (e) {
      setToast({
        variant: "error",
        message: e instanceof Error ? e.message : "Error al guardar el rubro.",
      });
      await loadAll();
    } finally {
      setSavingRubroNombreId(null);
    }
  }

  async function handleCreateReceta(e: React.FormEvent) {
    e.preventDefault();
    const nombre = draft.nombre_item.trim();
    const unidad = draft.unidad.trim();
    if (!draft.rubro_id || !nombre || !unidad) {
      setError("Completá rubro, nombre y unidad.");
      return;
    }
    const pm = parseFormattedNumber(draft.costo_base_material_unitario);
    const pmo = parseFormattedNumber(draft.costo_base_mo_unitario);
    if (!Number.isFinite(pm) || !Number.isFinite(pmo) || pm < 0 || pmo < 0) {
      setError("Precios inválidos.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("catalogo_recetas")
        .insert({
          rubro_id: draft.rubro_id,
          nombre_item: nombre,
          unidad,
          costo_base_material_unitario: pm,
          costo_base_mo_unitario: pmo,
        })
        .select("*")
        .single();

      if (err) {
        setError(err.message);
        return;
      }
      setRecetas((prev) =>
        [...prev, data as Receta].sort((a, b) =>
          a.nombre_item.localeCompare(b.nombre_item)
        )
      );
      setDraft({
        rubro_id: "",
        nombre_item: "",
        unidad: "",
        costo_base_material_unitario: "",
        costo_base_mo_unitario: "",
      });
      setShowForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear.");
    } finally {
      setCreating(false);
    }
  }

  const tabBtn = (id: CatalogTab, label: string) => {
    const activo = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className={`font-mono-hud inline-flex items-center rounded-full px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 transition-colors ${
          activo
            ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
            : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg text-cdm-fg">
      <CatalogToast
        message={toast?.message ?? null}
        variant={toast?.variant ?? "error"}
        onDismiss={dismissToast}
      />

      <NuevoRubroModal
        open={rubroModalOpen}
        onClose={() => setRubroModalOpen(false)}
        onCreated={async () => {
          await loadAll();
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-baseline justify-between px-6 pt-8 md:px-10">
        <div>
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Catálogo
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Recetas &amp; rubros
          </p>
        </div>
        <Link
          href="/"
          className="font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg"
        >
          ← Inicio
        </Link>
      </header>

      {/* Tabs */}
      <div className="relative z-10 flex flex-wrap gap-2 px-6 pt-6 md:px-10">
        {tabBtn("items", "Ítems (recetas)")}
        {tabBtn("rubros", "Rubros")}
      </div>

      {/* Error global */}
      {error ? (
        <p className="px-6 pt-4 text-[12px] text-red-400 md:px-10" role="alert">
          {error}
        </p>
      ) : null}

      {/* Contenido */}
      <div className="relative z-10 px-6 pt-8 pb-24 md:px-10">
        {tab === "items" ? (
          <>
            {/* Filtros + botón nuevo */}
            <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
              <div className="min-w-[200px] flex-1">
                <label
                  htmlFor="catalogo-buscar"
                  className="font-mono-hud mb-2 block text-[10px] uppercase tracking-[0.14em] text-cdm-muted"
                >
                  Buscar por nombre
                </label>
                <input
                  id="catalogo-buscar"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre del ítem…"
                  className="font-geist w-full rounded-xl border border-cdm-line bg-white/60 px-4 py-2.5 text-sm text-cdm-fg placeholder:text-cdm-muted focus-visible:border-cdm-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cdm-accent/40 dark:bg-zinc-900/40"
                />
              </div>
              <div className="min-w-[180px]">
                <label
                  htmlFor="catalogo-rubro"
                  className="font-mono-hud mb-2 block text-[10px] uppercase tracking-[0.14em] text-cdm-muted"
                >
                  Rubro
                </label>
                <select
                  id="catalogo-rubro"
                  value={rubroFilter}
                  onChange={(e) => setRubroFilter(e.target.value)}
                  className="font-geist w-full rounded-xl border border-cdm-line bg-white/60 px-4 py-2.5 text-sm text-cdm-fg focus-visible:border-cdm-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cdm-accent/40 dark:bg-zinc-900/40"
                >
                  <option value="">Todos los rubros</option>
                  {rubrosSorted.map((r) => (
                    <option key={String(r.id)} value={String(r.id)}>
                      {formatRubroName(r.nombre)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setShowForm((s) => !s)}
                className="font-mono-hud inline-flex items-center rounded-full bg-cdm-accent/10 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent ring-1 ring-cdm-accent/50 transition-colors hover:bg-cdm-accent/20"
              >
                {showForm ? "Cerrar formulario" : "+ Nuevo ítem"}
              </button>
            </div>

            {/* Formulario nuevo ítem */}
            {showForm ? (
              <form
                onSubmit={(e) => void handleCreateReceta(e)}
                className="mt-6 grid max-w-4xl gap-4 rounded-[24px] p-6 ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 md:grid-cols-2"
              >
                <div className="md:col-span-2">
                  <label className="font-mono-hud mb-2 block text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                    Rubro
                  </label>
                  <select
                    required
                    value={draft.rubro_id}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, rubro_id: e.target.value }))
                    }
                    className="font-geist w-full rounded-xl border border-cdm-line bg-white/60 px-4 py-2.5 text-sm text-cdm-fg dark:bg-zinc-900/40"
                  >
                    <option value="">Seleccionar…</option>
                    {rubrosSorted.map((r) => (
                      <option key={String(r.id)} value={String(r.id)}>
                        {formatRubroName(r.nombre)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-mono-hud mb-2 block text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                    Nombre del ítem
                  </label>
                  <input
                    required
                    value={draft.nombre_item}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, nombre_item: e.target.value }))
                    }
                    className="font-geist w-full rounded-xl border border-cdm-line bg-white/60 px-4 py-2.5 text-sm text-cdm-fg dark:bg-zinc-900/40"
                  />
                </div>
                <div>
                  <label className="font-mono-hud mb-2 block text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                    Unidad
                  </label>
                  <input
                    required
                    value={draft.unidad}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, unidad: e.target.value }))
                    }
                    className="font-geist w-full rounded-xl border border-cdm-line bg-white/60 px-4 py-2.5 text-sm text-cdm-fg dark:bg-zinc-900/40"
                  />
                </div>
                <div>
                  <label className="font-mono-hud mb-2 block text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                    Precio material unit.
                  </label>
                  <input
                    value={draft.costo_base_material_unitario}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        costo_base_material_unitario: e.target.value,
                      }))
                    }
                    className="font-geist w-full rounded-xl border border-cdm-line bg-white/60 px-4 py-2.5 text-sm text-cdm-fg dark:bg-zinc-900/40"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="font-mono-hud mb-2 block text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                    Precio M.O. unit.
                  </label>
                  <input
                    value={draft.costo_base_mo_unitario}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        costo_base_mo_unitario: e.target.value,
                      }))
                    }
                    className="font-geist w-full rounded-xl border border-cdm-line bg-white/60 px-4 py-2.5 text-sm text-cdm-fg dark:bg-zinc-900/40"
                    placeholder="0"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="font-mono-hud inline-flex items-center rounded-full bg-cdm-accent/10 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent ring-1 ring-cdm-accent/50 transition-colors hover:bg-cdm-accent/20 disabled:opacity-50"
                  >
                    {creating ? "Guardando…" : "Crear ítem"}
                  </button>
                </div>
              </form>
            ) : null}

            {/* Tabla ítems */}
            <div className="mt-6 overflow-x-auto rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40">
              {loading ? (
                <div className="p-8">
                  <SkeletonGlass filas={5} anchos={["w-full", "w-3/4", "w-2/3", "w-5/6", "w-1/2"]} />
                </div>
              ) : (
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-cdm-line">
                      <th className="font-mono-hud border-r border-cdm-line px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-muted">
                        Nombre
                      </th>
                      <th className="font-mono-hud border-r border-cdm-line px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-muted">
                        Rubro
                      </th>
                      <th className="font-mono-hud border-r border-cdm-line px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-muted">
                        Unidad
                      </th>
                      <th className="font-mono-hud border-r border-cdm-line px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-muted">
                        Precio material
                      </th>
                      <th className="font-mono-hud border-r border-cdm-line px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-muted">
                        Precio M.O.
                      </th>
                      <th className="w-14 px-2 py-3 text-center"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="font-mono-hud px-4 py-10 text-center text-[11px] uppercase tracking-[0.14em] text-cdm-muted"
                        >
                          No hay ítems que coincidan con los filtros.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row) => {
                        const id = String(row.id);
                        const busy = savingId === id || deletingId === id;
                        return (
                          <tr
                            key={id}
                            className="border-b border-cdm-line last:border-b-0 transition-colors hover:bg-cdm-fg/[0.02]"
                          >
                            <td className="font-geist border-r border-cdm-line px-4 py-3 text-[13px] font-medium leading-snug text-cdm-fg">
                              {row.nombre_item}
                            </td>
                            <td className="font-mono-hud border-r border-cdm-line px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-cdm-muted">
                              {formatRubroName(
                                rubroLabel.get(String(row.rubro_id)) ??
                                  `Rubro ${row.rubro_id}`
                              )}
                            </td>
                            <td className="font-mono-hud border-r border-cdm-line px-4 py-3 text-[10px] uppercase tracking-[0.1em] text-cdm-muted">
                              {row.unidad}
                            </td>
                            <td className="border-r border-cdm-line p-1">
                              <PriceCell
                                value={
                                  Number(row.costo_base_material_unitario) || 0
                                }
                                onSave={(n) =>
                                  updatePrecios(id, {
                                    costo_base_material_unitario: n,
                                  })
                                }
                                disabled={busy}
                              />
                            </td>
                            <td className="border-r border-cdm-line p-1">
                              <PriceCell
                                value={Number(row.costo_base_mo_unitario) || 0}
                                onSave={(n) =>
                                  updatePrecios(id, {
                                    costo_base_mo_unitario: n,
                                  })
                                }
                                disabled={busy}
                              />
                            </td>
                            <td className="px-2 py-2 text-center align-middle">
                              <button
                                type="button"
                                onClick={() => void handleDeleteReceta(id)}
                                disabled={busy}
                                className="inline-flex items-center justify-center rounded-full p-2 text-cdm-muted/50 transition-colors hover:bg-red-400/10 hover:text-red-400 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-line disabled:opacity-40"
                                title="Eliminar"
                              >
                                <Trash2
                                  className="h-4 w-4"
                                  strokeWidth={1.25}
                                />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Botón nuevo rubro */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setRubroModalOpen(true)}
                className="font-mono-hud inline-flex items-center rounded-full bg-cdm-accent/10 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent ring-1 ring-cdm-accent/50 transition-colors hover:bg-cdm-accent/20"
              >
                + Agregar nuevo rubro
              </button>
            </div>

            {/* Tabla rubros */}
            <div className="overflow-x-auto rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40">
              {loading ? (
                <div className="p-8">
                  <SkeletonGlass filas={4} anchos={["w-2/3", "w-1/2", "w-3/4", "w-2/5"]} />
                </div>
              ) : (
                <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-cdm-line">
                      <th className="font-mono-hud border-r border-cdm-line px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-muted">
                        ID
                      </th>
                      <th className="font-mono-hud border-r border-cdm-line px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-muted">
                        Nombre
                      </th>
                      <th className="font-mono-hud w-14 px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-muted">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rubrosSorted.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="font-mono-hud px-4 py-10 text-center text-[11px] uppercase tracking-[0.14em] text-cdm-muted"
                        >
                          No hay rubros. Creá uno con el botón superior.
                        </td>
                      </tr>
                    ) : (
                      rubrosSorted.map((r) => {
                        const id = String(r.id);
                        const busy =
                          deletingRubroId === id || savingRubroNombreId === id;
                        return (
                          <tr
                            key={id}
                            className="border-b border-cdm-line last:border-b-0 transition-colors hover:bg-cdm-fg/[0.02]"
                          >
                            <td className="font-mono-hud border-r border-cdm-line px-4 py-3 text-[11px] tabular-nums text-cdm-fg">
                              {id}
                            </td>
                            <td className="border-r border-cdm-line px-4 py-3 align-middle">
                              <input
                                type="text"
                                value={r.nombre}
                                disabled={busy}
                                title="Editá el nombre y salí del campo para guardar"
                                onFocus={() => {
                                  rubroNombreAlFocusRef.current.set(id, r.nombre);
                                }}
                                onChange={(e) =>
                                  setRubros((prev) =>
                                    sortRubrosByNumericId(
                                      prev.map((x) =>
                                        String(x.id) === id
                                          ? { ...x, nombre: e.target.value }
                                          : x
                                      )
                                    )
                                  )
                                }
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  const orig = (
                                    rubroNombreAlFocusRef.current.get(id) ?? ""
                                  ).trim();
                                  rubroNombreAlFocusRef.current.delete(id);
                                  if (v === orig) return;
                                  void handleSaveRubroNombre(id, v);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    (e.target as HTMLInputElement).blur();
                                }}
                                className="font-geist w-full min-w-[12rem] rounded-xl border border-cdm-line bg-transparent px-3 py-2 text-[13px] text-cdm-fg placeholder:text-cdm-muted focus-visible:border-cdm-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cdm-accent/40 disabled:opacity-50"
                              />
                            </td>
                            <td className="px-2 py-2 text-center align-middle">
                              <button
                                type="button"
                                onClick={() => void handleDeleteRubro(id)}
                                disabled={busy}
                                className="inline-flex items-center justify-center rounded-full p-2 text-cdm-muted/50 transition-colors hover:bg-red-400/10 hover:text-red-400 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-line disabled:opacity-40"
                                title="Eliminar rubro"
                              >
                                <Trash2
                                  className="h-4 w-4"
                                  strokeWidth={1.25}
                                />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
