"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseFormattedNumber } from "@/lib/format-currency";
import { formatRubroName } from "@/lib/format-rubro-name";
import type { RubroRow } from "@/types/ravn";

export function NuevoRecetaModal({
  open,
  onClose,
  rubros,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  rubros: RubroRow[];
  onSuccess: () => void | Promise<void>;
}) {
  const [rubroId, setRubroId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [unidad, setUnidad] = useState("");
  const [precioMaterial, setPrecioMaterial] = useState("");
  const [precioMo, setPrecioMo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRubroId("");
    setDescripcion("");
    setUnidad("");
    setPrecioMaterial("");
    setPrecioMo("");
    setError(null);
  }

  function handleClose() {
    if (!saving) {
      reset();
      onClose();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nombre = descripcion.trim();
    const u = unidad.trim();
    if (!rubroId || !nombre || !u) {
      setError("Completá rubro, descripción y unidad.");
      return;
    }
    const pm = parseFormattedNumber(precioMaterial);
    const pmo = parseFormattedNumber(precioMo);
    if (!Number.isFinite(pm) || !Number.isFinite(pmo) || pm < 0 || pmo < 0) {
      setError("Ingresá precios numéricos válidos (≥ 0).");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("recetas").insert({
        rubro_id: rubroId,
        nombre_item: nombre,
        unidad: u,
        costo_base_material_unitario: pm,
        costo_base_mo_unitario: pmo,
      });

      if (err) {
        setError(err.message);
        return;
      }

      reset();
      await onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
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
      aria-labelledby="nuevo-item-titulo"
    >
      <button
        type="button"
        className="absolute inset-0 bg-ravn-fg/40 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={handleClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-none border-2 border-ravn-line bg-ravn-surface p-8 shadow-none">
        <h2
          id="nuevo-item-titulo"
          className="font-raleway text-lg font-medium uppercase tracking-wide text-ravn-fg"
        >
          Nuevo ítem
        </h2>
        <p className="mt-2 text-sm text-ravn-muted">
          Se agregará al catálogo y al panel de rubros.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-5">
          {error ? (
            <p className="rounded-none border border-ravn-accent bg-ravn-accent px-3 py-2 text-sm text-ravn-accent-contrast">
              {error}
            </p>
          ) : null}

          <div>
            <label
              htmlFor="modal-rubro"
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
            >
              Rubro
            </label>
            <select
              id="modal-rubro"
              required
              value={rubroId}
              onChange={(e) => setRubroId(e.target.value)}
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
            >
              <option value="">Seleccionar rubro…</option>
              {rubros.map((r) => (
                <option key={String(r.id)} value={String(r.id)}>
                  {formatRubroName(r.nombre)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="modal-descripcion"
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
            >
              Descripción
            </label>
            <input
              id="modal-descripcion"
              type="text"
              required
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg placeholder:text-ravn-muted focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
              placeholder="Nombre del ítem"
            />
          </div>

          <div>
            <label
              htmlFor="modal-unidad"
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
            >
              Unidad
            </label>
            <input
              id="modal-unidad"
              type="text"
              required
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg placeholder:text-ravn-muted focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
              placeholder="m², un, kg…"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="modal-pm"
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
              >
                Precio material
              </label>
              <input
                id="modal-pm"
                type="text"
                inputMode="decimal"
                value={precioMaterial}
                onChange={(e) => setPrecioMaterial(e.target.value)}
                className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
                placeholder="0"
              />
            </div>
            <div>
              <label
                htmlFor="modal-pmo"
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
              >
                Precio M.O.
              </label>
              <input
                id="modal-pmo"
                type="text"
                inputMode="decimal"
                value={precioMo}
                onChange={(e) => setPrecioMo(e.target.value)}
                className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
                placeholder="0"
              />
            </div>
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
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
