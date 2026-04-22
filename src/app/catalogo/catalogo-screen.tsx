"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CatalogToast } from "@/components/catalog-toast";
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
      className="w-full min-w-[6rem] rounded-none border border-ravn-line bg-ravn-surface px-3 py-2 text-right text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg disabled:opacity-50"
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
        className="absolute inset-0 bg-ravn-fg/40 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={handleClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-none border-2 border-ravn-line bg-ravn-surface p-8">
        <h2
          id="nuevo-rubro-titulo"
          className="font-raleway text-lg font-medium uppercase tracking-wide text-ravn-fg"
        >
          Nuevo rubro
        </h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-5">
          {localError ? (
            <p className="rounded-none border border-ravn-accent bg-ravn-accent px-3 py-2 text-sm text-ravn-accent-contrast">
              {localError}
            </p>
          ) : null}
          <div>
            <label
              htmlFor="rubro-id-input"
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
            >
              Número (ID)
            </label>
            <input
              id="rubro-id-input"
              type="text"
              inputMode="numeric"
              value={idInput}
              onChange={(e) => setIdInput(e.target.value)}
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
              placeholder="Ej. 1, 2, 10…"
              required
            />
          </div>
          <div>
            <label
              htmlFor="rubro-nombre-input"
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
            >
              Nombre descriptivo
            </label>
            <input
              id="rubro-nombre-input"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
              placeholder="Nombre del rubro"
              required
            />
          </div>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="rounded-none border-2 border-ravn-line bg-ravn-surface px-5 py-3 text-sm font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-none border-2 border-ravn-accent bg-ravn-accent px-5 py-3 text-sm font-medium uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
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
        supabase.from("recetas").select("*").order("nombre_item"),
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

  const [openRubros, setOpenRubros] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (rubros.length > 0) {
      setOpenRubros(new Set(rubros.map((r) => String(r.id))));
    }
  }, [rubros.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const filteredGrouped = useMemo(() => {
    const grouped = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const rid = String(item.rubro_id);
      const arr = grouped.get(rid) ?? [];
      arr.push(item);
      grouped.set(rid, arr);
    }
    return rubrosSorted
      .filter((r) => grouped.has(String(r.id)))
      .map((r) => ({ rubro: r, items: grouped.get(String(r.id)) ?? [] }));
  }, [filtered, rubrosSorted]);

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
        .from("recetas")
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
      const { error: err } = await supabase.from("recetas").delete().eq("id", id);
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
        .from("recetas")
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
          .from("recetas")
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
        .from("recetas")
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

  const tabBtn = (id: CatalogTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-none border-2 px-5 py-3 text-sm font-medium uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg ${
        tab === id
          ? "border-ravn-accent bg-ravn-accent text-ravn-accent-contrast"
          : "border-ravn-line bg-ravn-surface text-ravn-muted hover:border-ravn-fg hover:text-ravn-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-ravn-surface px-8 pb-16 pr-20 pt-16 text-ravn-fg">
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

      <Link
        href="/"
        className="mb-8 inline-block text-sm font-light text-ravn-muted underline-offset-4 hover:text-ravn-fg hover:underline"
      >
        Volver al inicio
      </Link>

      <h1 className="font-raleway text-2xl font-medium uppercase tracking-tight">
        Gestión de catálogo
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-ravn-muted">
        Administración de ítems (recetas) y rubros (categorías).
      </p>

      <div className="mt-8 flex flex-wrap gap-3 border-b border-ravn-line pb-6">
        {tabBtn("items", "Ítems (recetas)")}
        {tabBtn("rubros", "Rubros")}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-none border border-ravn-accent bg-ravn-accent px-4 py-3 text-sm text-ravn-accent-contrast"
        >
          {error}
        </div>
      ) : null}

      {tab === "items" ? (
        <>
          <div className="mt-8 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            <div className="min-w-[200px] flex-1">
              <label
                htmlFor="catalogo-buscar"
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
              >
                Buscar por nombre
              </label>
              <input
                id="catalogo-buscar"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre del ítem…"
                className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg placeholder:text-ravn-muted focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
              />
            </div>
            <div className="min-w-[180px]">
              <label
                htmlFor="catalogo-rubro"
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
              >
                Rubro
              </label>
              <select
                id="catalogo-rubro"
                value={rubroFilter}
                onChange={(e) => setRubroFilter(e.target.value)}
                className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
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
              className="rounded-none border-2 border-ravn-accent bg-ravn-accent px-5 py-3 text-sm font-medium uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg"
            >
              {showForm ? "Cerrar formulario" : "Nuevo ítem"}
            </button>
          </div>

          {showForm ? (
            <form
              onSubmit={(e) => void handleCreateReceta(e)}
              className="mt-8 grid max-w-4xl gap-4 rounded-none border border-ravn-line p-6 md:grid-cols-2"
            >
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted">
                  Rubro
                </label>
                <select
                  required
                  value={draft.rubro_id}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, rubro_id: e.target.value }))
                  }
                  className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg"
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
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted">
                  Nombre del ítem
                </label>
                <input
                  required
                  value={draft.nombre_item}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, nombre_item: e.target.value }))
                  }
                  className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted">
                  Unidad
                </label>
                <input
                  required
                  value={draft.unidad}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, unidad: e.target.value }))
                  }
                  className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted">
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
                  className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted">
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
                  className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg"
                  placeholder="0"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-none border-2 border-ravn-line bg-ravn-surface px-6 py-3 text-sm font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-accent hover:text-ravn-accent-contrast disabled:opacity-50"
                >
                  {creating ? "Guardando…" : "Crear ítem"}
                </button>
              </div>
            </form>
          ) : null}

          <div className="mt-10 space-y-0">
            {loading ? (
              <p className="p-8 font-light text-ravn-muted">
                Cargando catálogo…
              </p>
            ) : filteredGrouped.length === 0 ? (
              <p className="border border-ravn-line px-4 py-10 text-center font-light text-ravn-muted">
                No hay ítems que coincidan con los filtros.
              </p>
            ) : (
              filteredGrouped.map(({ rubro, items }) => {
                const rid = String(rubro.id);
                const isOpen = openRubros.has(rid);
                return (
                  <div key={rid} className="border border-b-0 border-ravn-line">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenRubros((prev) => {
                          const next = new Set(prev);
                          if (next.has(rid)) next.delete(rid);
                          else next.add(rid);
                          return next;
                        })
                      }
                      className="flex w-full items-center justify-between bg-ravn-subtle px-4 py-3 text-left transition-colors hover:bg-ravn-line/30"
                    >
                      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ravn-fg">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ravn-muted" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ravn-muted" />
                        )}
                        {formatRubroName(rubro.nombre)}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-ravn-muted">
                        {items.length} ítem{items.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="overflow-x-auto border-t border-ravn-line">
                        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-ravn-line bg-ravn-surface text-xs font-medium uppercase tracking-wider text-ravn-muted">
                              <th className="border-r border-ravn-line px-4 py-2.5">
                                Nombre
                              </th>
                              <th className="border-r border-ravn-line px-4 py-2.5">
                                Unidad
                              </th>
                              <th className="border-r border-ravn-line px-4 py-2.5 text-right">
                                Precio material
                              </th>
                              <th className="border-r border-ravn-line px-4 py-2.5 text-right">
                                Precio M.O.
                              </th>
                              <th className="w-14 px-2 py-2.5 text-center"> </th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((row) => {
                              const id = String(row.id);
                              const busy = savingId === id || deletingId === id;
                              return (
                                <tr
                                  key={id}
                                  className="border-b border-ravn-line last:border-b-0"
                                >
                                  <td className="border-r border-ravn-line px-4 py-3 font-light text-ravn-fg">
                                    {row.nombre_item}
                                  </td>
                                  <td className="border-r border-ravn-line px-4 py-3 text-ravn-muted">
                                    {row.unidad}
                                  </td>
                                  <td className="border-r border-ravn-line p-1">
                                    <PriceCell
                                      value={
                                        Number(
                                          row.costo_base_material_unitario
                                        ) || 0
                                      }
                                      onSave={(n) =>
                                        updatePrecios(id, {
                                          costo_base_material_unitario: n,
                                        })
                                      }
                                      disabled={busy}
                                    />
                                  </td>
                                  <td className="border-r border-ravn-line p-1">
                                    <PriceCell
                                      value={
                                        Number(row.costo_base_mo_unitario) || 0
                                      }
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
                                      className="inline-flex rounded-none p-2 text-ravn-muted transition-colors hover:bg-ravn-accent hover:text-ravn-accent-contrast focus-visible:outline focus-visible:outline-1 focus-visible:outline-ravn-fg disabled:opacity-50"
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
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
            <div className="border-b border-ravn-line" />
          </div>
        </>
      ) : (
        <>
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setRubroModalOpen(true)}
              className="rounded-none border-2 border-ravn-accent bg-ravn-accent px-5 py-3 text-sm font-medium uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg"
            >
              + Agregar nuevo rubro
            </button>
          </div>

          <div className="mt-10 overflow-x-auto rounded-none border border-ravn-line border-b-0">
            {loading ? (
              <p className="p-8 font-light text-ravn-muted">Cargando rubros…</p>
            ) : (
              <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-t border-ravn-line bg-ravn-surface text-xs font-medium uppercase tracking-wider text-ravn-muted">
                    <th className="border-r border-ravn-line px-4 py-3">
                      ID
                    </th>
                    <th className="border-r border-ravn-line px-4 py-3">
                      Nombre
                    </th>
                    <th className="w-14 px-2 py-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rubrosSorted.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="border-b border-ravn-line px-4 py-10 text-center font-light text-ravn-muted"
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
                          className="border-b border-ravn-line last:border-b"
                        >
                          <td className="border-r border-ravn-line px-4 py-3 font-mono text-sm tabular-nums text-ravn-fg">
                            {id}
                          </td>
                          <td className="border-r border-ravn-line px-4 py-3 align-middle">
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
                              className="w-full min-w-[12rem] rounded-none border border-ravn-line bg-ravn-surface px-3 py-2 text-sm font-light text-ravn-fg placeholder:text-ravn-muted focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg disabled:opacity-50"
                            />
                          </td>
                          <td className="px-2 py-2 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => void handleDeleteRubro(id)}
                              disabled={busy}
                              className="inline-flex rounded-none p-2 text-ravn-muted transition-colors hover:bg-ravn-accent hover:text-ravn-accent-contrast focus-visible:outline focus-visible:outline-1 focus-visible:outline-ravn-fg disabled:opacity-50"
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
  );
}
