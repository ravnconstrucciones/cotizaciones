"use client";

import { useEffect, useMemo, useState } from "react";
import type { CashflowTipo } from "@/lib/cashflow-compute";
import { categoriaValidaParaTipo } from "@/lib/cashflow-validate";
import { estadoDesdeTipo } from "@/lib/cashflow-matching";
import { parseFormattedNumber, roundArs2 } from "@/lib/format-currency";

const fieldCls =
  "w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg placeholder:text-ravn-muted focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg";

const labelCls =
  "mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted";

export type CashflowObraOption = { id: string; nombre: string };

export type CashflowItemModalInitial = {
  id?: string;
  tipo: CashflowTipo;
  categoria: string;
  descripcion: string;
  monto_proyectado: number;
  fecha_proyectada: string;
  monto_real: number | null;
  fecha_real: string | null;
  estado: string;
  notas: string;
};

type Props = {
  open: boolean;
  /** Pantalla obra: id fijo. Dashboard: omitir y usar `obraOpciones`. */
  obraId?: string;
  obraOpciones?: CashflowObraOption[];
  /** Alta desde botón + / − */
  presetTipo?: CashflowTipo | null;
  initial: CashflowItemModalInitial | null;
  onClose: () => void;
  onSaved: () => void;
};

function hoyInput(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = p.find((x) => x.type === "year")?.value;
  const m = p.find((x) => x.type === "month")?.value;
  const d = p.find((x) => x.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

export function CashflowItemModal({
  open,
  obraId,
  obraOpciones,
  presetTipo,
  initial,
  onClose,
  onSaved,
}: Props) {
  const selectorObras = useMemo(
    () => (obraOpciones && obraOpciones.length > 0 ? obraOpciones : null),
    [obraOpciones]
  );

  const [selectedObraId, setSelectedObraId] = useState("");
  const [tipo, setTipo] = useState<CashflowTipo>("ingreso");
  const [categoria, setCategoria] = useState("otro");
  const [descripcion, setDescripcion] = useState("");
  const [montoStr, setMontoStr] = useState("");
  const [fecha, setFecha] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (selectorObras?.length) {
      setSelectedObraId(selectorObras[0]!.id);
    } else {
      setSelectedObraId("");
    }
    if (!initial) {
      setTipo(presetTipo ?? "ingreso");
      setCategoria("otro");
      setDescripcion("");
      setMontoStr("");
      setFecha(hoyInput());
      setError(null);
      return;
    }
    setTipo(initial.tipo);
    setCategoria(initial.categoria);
    setDescripcion(initial.descripcion);
    const m = initial.monto_real ?? initial.monto_proyectado;
    setMontoStr(m > 0 ? String(m).replace(".", ",") : "");
    setFecha(
      (initial.fecha_real ?? initial.fecha_proyectada).slice(0, 10) || hoyInput()
    );
    setError(null);
  }, [open, initial, presetTipo, selectorObras]);

  if (!open) return null;

  const titulo = initial?.id
    ? "Editar movimiento"
    : presetTipo === "ingreso"
      ? "Nuevo ingreso"
      : presetTipo === "egreso"
        ? "Nuevo egreso"
        : "Nuevo movimiento";

  const tipoBloqueado = Boolean(!initial?.id && presetTipo);
  const effectiveObraId = selectorObras ? selectedObraId : obraId;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const m = roundArs2(parseFormattedNumber(montoStr));
      if (!fecha) {
        setError("Completá la fecha.");
        setSaving(false);
        return;
      }
      if (m <= 0) {
        setError("El monto debe ser mayor a cero.");
        setSaving(false);
        return;
      }
      if (!effectiveObraId?.trim()) {
        setError("Elegí una obra.");
        setSaving(false);
        return;
      }

      const estado = estadoDesdeTipo(tipo);
      let cat = initial?.id ? categoria : "otro";
      if (!categoriaValidaParaTipo(tipo, cat)) cat = "otro";

      const isEdit = Boolean(initial?.id);
      const url = isEdit
        ? `/cashflow/item/${encodeURIComponent(initial!.id!)}`
        : "/cashflow/item";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                tipo,
                categoria: cat,
                descripcion,
                monto_proyectado: m,
                fecha_proyectada: fecha,
                monto_real: m,
                fecha_real: fecha,
                estado,
              }
            : {
                obra_id: effectiveObraId.trim(),
                tipo,
                categoria: cat,
                descripcion,
                monto: m,
                fecha,
              }
        ),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudo guardar.");
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal
      aria-labelledby="cashflow-item-title"
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col border border-ravn-line bg-ravn-surface shadow-lg sm:max-h-[85vh]">
        <div className="border-b border-ravn-line px-5 py-4">
          <h2
            id="cashflow-item-title"
            className="font-raleway text-base font-semibold uppercase tracking-wide text-ravn-accent"
          >
            {titulo}
          </h2>
          <p className="mt-2 text-xs text-ravn-muted">
            Libreta de caja: un solo monto y fecha; impacta el saldo al guardar.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {selectorObras ? (
            <div>
              <span className={labelCls}>Obra</span>
              <select
                className={fieldCls}
                value={selectedObraId}
                onChange={(e) => setSelectedObraId(e.target.value)}
              >
                {selectorObras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className={selectorObras ? "mt-5" : ""}>
            <span className={labelCls}>Tipo</span>
            <select
              className={fieldCls}
              value={tipo}
              disabled={tipoBloqueado}
              onChange={(e) => {
                const t = e.target.value === "egreso" ? "egreso" : "ingreso";
                setTipo(t);
                if (initial?.id) setCategoria("otro");
              }}
            >
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </select>
          </div>
          <div className="mt-5">
            <span className={labelCls}>Concepto</span>
            <input
              className={fieldCls}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. Cobro cuota / Pago proveedor"
            />
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <span className={labelCls}>Monto (ARS)</span>
              <input
                className={`${fieldCls} tabular-nums`}
                inputMode="decimal"
                value={montoStr}
                onChange={(e) => setMontoStr(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <span className={labelCls}>Fecha</span>
              <input
                type="date"
                className={fieldCls}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
          </div>
          {error ? (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 border-t border-ravn-line px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-none border-2 border-ravn-line px-6 py-3 text-xs font-semibold uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-none border-2 border-ravn-accent bg-ravn-accent px-6 py-3 text-xs font-semibold uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
