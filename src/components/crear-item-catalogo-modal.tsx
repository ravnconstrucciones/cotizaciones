"use client";

import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRubroName } from "@/lib/format-rubro-name";
import type { RubroRow } from "@/types/ravn";

type Props = {
  open: boolean;
  onClose: () => void;
  rubros: RubroRow[];
  onCreated: () => void;
};

export function CrearItemCatalogoModal({
  open,
  onClose,
  rubros,
  onCreated,
}: Props) {
  const baseId = useId();
  const [rubroId, setRubroId] = useState("");
  const [nombreItem, setNombreItem] = useState("");
  const [unidad, setUnidad] = useState("");
  const [costoMat, setCostoMat] = useState("");
  const [costoMo, setCostoMo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRubroId(rubros[0]?.id ?? "");
    setNombreItem("");
    setUnidad("");
    setCostoMat("");
    setCostoMo("");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!rubroId) {
      setError("Seleccioná un rubro.");
      return;
    }
    const desc = nombreItem.trim();
    if (!desc) {
      setError("Ingresá la descripción del ítem.");
      return;
    }
    const u = unidad.trim();
    if (!u) {
      setError("Ingresá la unidad de medida.");
      return;
    }

    const pm = Number.parseFloat(costoMat.replace(",", "."));
    const pmo = Number.parseFloat(costoMo.replace(",", "."));
    if (!Number.isFinite(pm) || !Number.isFinite(pmo) || pm < 0 || pmo < 0) {
      setError("Los costos base deben ser números mayores o iguales a cero.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: errIns } = await supabase.from("recetas").insert({
        rubro_id: rubroId,
        nombre_item: desc,
        unidad: u,
        costo_base_material_unitario: pm,
        costo_base_mo_unitario: pmo,
      });

      if (errIns) {
        setError(errIns.message);
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
          Crear ítem en catálogo
        </h2>
        <p className="mt-2 text-xs text-ravn-subtle">
          Se guarda solo en <code className="text-ravn-ink">recetas</code>.
          Luego podés agregarlo al presupuesto desde el panel.
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
                <option value="">No hay rubros en la base</option>
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
              htmlFor={`${baseId}-nombre`}
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-subtle"
            >
              Descripción del ítem
            </label>
            <input
              id={`${baseId}-nombre`}
              type="text"
              value={nombreItem}
              onChange={(e) => setNombreItem(e.target.value)}
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-ink placeholder:text-ravn-subtle focus-visible:border-ravn-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-ink"
              placeholder="Nombre que verá el cliente / obra"
              autoComplete="off"
            />
          </div>

          <div>
            <label
              htmlFor={`${baseId}-unidad`}
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-subtle"
            >
              Unidad de medida
            </label>
            <input
              id={`${baseId}-unidad`}
              type="text"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-ink placeholder:text-ravn-subtle focus-visible:border-ravn-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-ink"
              placeholder="Ej: m2, ml, u, gl"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${baseId}-cmat`}
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-subtle"
              >
                Precio material
              </label>
              <input
                id={`${baseId}-cmat`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={costoMat}
                onChange={(e) => setCostoMat(e.target.value)}
                className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-ink focus-visible:border-ravn-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-ink"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-cmo`}
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-subtle"
              >
                Precio M.O.
              </label>
              <input
                id={`${baseId}-cmo`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={costoMo}
                onChange={(e) => setCostoMo(e.target.value)}
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
