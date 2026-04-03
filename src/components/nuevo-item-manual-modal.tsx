"use client";

import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RubroRow } from "@/types/ravn";
import { parseFormattedNumber } from "@/lib/format-currency";
import { formatRubroName } from "@/lib/format-rubro-name";

const UNIDADES_PREDEF = ["M2", "ML", "M", "U", "GL", "KG", "L", "HA", "MES", "JOR"];

type Props = {
  open: boolean;
  onClose: () => void;
  presupuestoId: string;
  rubros: RubroRow[];
  onCreated: () => void;
};

export function NuevoItemManualModal({
  open,
  onClose,
  presupuestoId,
  rubros,
  onCreated,
}: Props) {
  const baseId = useId();
  const [rubroId, setRubroId] = useState("");
  const [detalle, setDetalle] = useState("");
  const [unidadMode, setUnidadMode] = useState<"lista" | "otra">("lista");
  const [unidadLista, setUnidadLista] = useState("M2");
  const [unidadOtra, setUnidadOtra] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precioMat, setPrecioMat] = useState("0");
  const [precioMo, setPrecioMo] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRubroId(rubros[0]?.id ?? "");
    setDetalle("");
    setUnidadMode("lista");
    setUnidadLista("M2");
    setUnidadOtra("");
    setCantidad("1");
    setPrecioMat("0");
    setPrecioMo("0");
  }, [open, rubros]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const unidadFinal =
    unidadMode === "lista"
      ? unidadLista.trim()
      : unidadOtra.trim().toUpperCase();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!rubroId) {
      setError("Seleccioná un rubro.");
      return;
    }
    const desc = detalle.trim();
    if (!desc) {
      setError("Ingresá el detalle del ítem.");
      return;
    }
    if (!unidadFinal) {
      setError("Ingresá o elegí una unidad.");
      return;
    }

    const q = parseFormattedNumber(cantidad);
    const pm = parseFormattedNumber(precioMat);
    const pmo = parseFormattedNumber(precioMo);
    if (!Number.isFinite(q) || q <= 0) {
      setError("La cantidad debe ser mayor a cero.");
      return;
    }
    if (!Number.isFinite(pm) || !Number.isFinite(pmo) || pm < 0 || pmo < 0) {
      setError("Ingresá precios numéricos válidos (≥ 0).");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: recetaRow, error: errReceta } = await supabase
        .from("recetas")
        .insert({
          rubro_id: rubroId,
          nombre_item: desc,
          unidad: unidadFinal,
          costo_base_material_unitario: pm,
          costo_base_mo_unitario: pmo,
        })
        .select("id")
        .single();

      if (errReceta || !recetaRow?.id) {
        setError(errReceta?.message ?? "No se pudo crear la receta.");
        return;
      }

      const { error: errItem } = await supabase.from("presupuestos_items").insert({
        presupuesto_id: presupuestoId,
        receta_id: String(recetaRow.id),
        cantidad: q,
        precio_material_congelado: pm,
        precio_mo_congelada: pmo,
      });

      if (errItem) {
        setError(errItem.message);
        return;
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${baseId}-title`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#181817]/70 backdrop-blur-sm"
        aria-label="Cerrar modal"
        onClick={onClose}
      />
      <div className="relative z-[101] w-full max-w-lg border border-ravn-line bg-ravn-surface p-8 shadow-none">
        <h2
          id={`${baseId}-title`}
          className="font-raleway text-sm font-bold uppercase tracking-wider text-ravn-ink"
        >
          Agregar nuevo ítem
        </h2>
        <p className="mt-2 text-xs text-ravn-subtle">
          Se crea una línea en el catálogo (receta) y se agrega al presupuesto con los precios indicados.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor={`${baseId}-rubro`}
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-subtle"
            >
              Rubro
            </label>
            <select
              id={`${baseId}-rubro`}
              value={rubroId}
              onChange={(e) => setRubroId(e.target.value)}
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-ink focus-visible:border-ravn-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-ink"
              required
            >
              {rubros.length === 0 ? (
                <option value="">No hay rubros cargados</option>
              ) : null}
              {rubros.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatRubroName(r.nombre)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={`${baseId}-detalle`}
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-subtle"
            >
              Detalle / descripción
            </label>
            <input
              id={`${baseId}-detalle`}
              type="text"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-ink placeholder:text-ravn-subtle focus-visible:border-ravn-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-ink"
              placeholder="Descripción del ítem"
              autoComplete="off"
            />
          </div>

          <div>
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-subtle">
              Unidad
            </span>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-ravn-ink">
                <input
                  type="radio"
                  name={`${baseId}-unidad-mode`}
                  checked={unidadMode === "lista"}
                  onChange={() => setUnidadMode("lista")}
                  className="border-ravn-line text-ravn-ink focus:ring-ravn-ink"
                />
                Predefinida
              </label>
              <label className="flex items-center gap-2 text-sm text-ravn-ink">
                <input
                  type="radio"
                  name={`${baseId}-unidad-mode`}
                  checked={unidadMode === "otra"}
                  onChange={() => setUnidadMode("otra")}
                  className="border-ravn-line text-ravn-ink focus:ring-ravn-ink"
                />
                Otra
              </label>
            </div>
            {unidadMode === "lista" ? (
              <select
                value={unidadLista}
                onChange={(e) => setUnidadLista(e.target.value)}
                className="mt-3 w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-ink focus-visible:border-ravn-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-ink"
              >
                {UNIDADES_PREDEF.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={unidadOtra}
                onChange={(e) => setUnidadOtra(e.target.value)}
                className="mt-3 w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm uppercase text-ravn-ink placeholder:text-ravn-subtle focus-visible:border-ravn-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-ink"
                placeholder="Ej: M3"
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor={`${baseId}-cant`}
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-subtle"
              >
                Cantidad
              </label>
              <input
                id={`${baseId}-cant`}
                type="text"
                inputMode="decimal"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-ink focus-visible:border-ravn-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-ink"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-pm`}
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-subtle"
              >
                Precio material
              </label>
              <input
                id={`${baseId}-pm`}
                type="text"
                inputMode="decimal"
                value={precioMat}
                onChange={(e) => setPrecioMat(e.target.value)}
                className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-ink focus-visible:border-ravn-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-ink"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-pmo`}
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-subtle"
              >
                Precio M.O.
              </label>
              <input
                id={`${baseId}-pmo`}
                type="text"
                inputMode="decimal"
                value={precioMo}
                onChange={(e) => setPrecioMo(e.target.value)}
                className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-ink focus-visible:border-ravn-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-ink"
              />
            </div>
          </div>

          {error ? (
            <p className="border border-ravn-ink bg-ravn-ink px-4 py-3 text-sm text-ravn-surface">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-ravn-line pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-none border-2 border-ravn-line bg-ravn-surface px-6 py-3 text-sm font-bold uppercase tracking-wider text-ravn-ink transition-colors hover:bg-ravn-subtle/20"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || rubros.length === 0}
              className="rounded-none border-2 border-ravn-ink bg-ravn-ink px-6 py-3 text-sm font-bold uppercase tracking-wider text-ravn-surface transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Guardando…" : "Guardar ítem"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
