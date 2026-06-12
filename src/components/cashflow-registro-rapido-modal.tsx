"use client";

import { useEffect, useState } from "react";
import { parseFormattedNumber, roundArs2 } from "@/lib/format-currency";
import type { QuickTipoRegistro } from "@/lib/cashflow-matching";

const fieldCls =
  "w-full border-0 border-b border-cdm-line bg-transparent px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]";

const selectCls =
  "w-full border border-cdm-line bg-cdm-panel/60 px-3 py-2 text-sm text-cdm-fg focus:border-cdm-accent focus:outline-none";

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

const OPCIONES: { value: QuickTipoRegistro; label: string }[] = [
  { value: "cobre_cliente", label: "Cobré al cliente" },
  { value: "pago_proveedor", label: "Pagué proveedor" },
  { value: "compra_material", label: "Compré material" },
  { value: "pago_mano_obra", label: "Pagué mano de obra" },
  { value: "otro", label: "Otro" },
];

type Props = {
  open: boolean;
  obraId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function CashflowRegistroRapidoModal({
  open,
  obraId,
  onClose,
  onSaved,
}: Props) {
  const [quick, setQuick] = useState<QuickTipoRegistro>("cobre_cliente");
  const [desc, setDesc] = useState("");
  const [montoStr, setMontoStr] = useState("");
  const [fecha, setFecha] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuick("cobre_cliente");
    setDesc("");
    setMontoStr("");
    setFecha(hoyInput());
    setErr(null);
  }, [open]);

  if (!open) return null;

  async function guardar() {
    setBusy(true);
    setErr(null);
    try {
      const monto_real = roundArs2(parseFormattedNumber(montoStr));
      if (monto_real <= 0) {
        setErr("Indicá un monto válido.");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/cashflow/registrar-movimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obra_id: obraId,
          quick_tipo: quick,
          descripcion: desc.trim() || undefined,
          monto_real,
          fecha,
        }),
      });
      const j = (await res.json()) as { error?: string; modo?: string };
      if (!res.ok) {
        setErr(j.error ?? "Error");
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal
      aria-labelledby="reg-rapido-title"
    >
      <div className="cdm-glass font-grotesk flex w-full max-w-md flex-col">
        <div className="border-b border-cdm-line px-5 py-4">
          <h2
            id="reg-rapido-title"
            className="text-base font-semibold uppercase tracking-wide text-cdm-accent"
          >
            Registrar movimiento
          </h2>
          <p className="mt-2 text-xs text-cdm-muted">
            Siempre agrega una línea nueva en la libreta de caja de la obra.
          </p>
        </div>
        <div className="space-y-5 px-5 py-5">
          <div>
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-cdm-muted">
              Tipo
            </span>
            <select
              className={selectCls}
              value={quick}
              onChange={(e) =>
                setQuick(e.target.value as QuickTipoRegistro)
              }
            >
              {OPCIONES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-cdm-muted">
              Descripción (opcional)
            </span>
            <input
              className={fieldCls}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Ej. Factura 1234"
            />
          </div>
          <div>
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-cdm-muted">
              Monto real (ARS)
            </span>
            <input
              className={`${fieldCls} tabular-nums`}
              inputMode="decimal"
              value={montoStr}
              onChange={(e) => setMontoStr(e.target.value)}
            />
          </div>
          <div>
            <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-cdm-muted">
              Fecha
            </span>
            <input
              type="date"
              className={selectCls}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          {err ? (
            <p className="text-sm text-red-400">{err}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 border-t border-cdm-line px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="cdm-chip cursor-pointer border border-cdm-line px-6 py-3 text-xs font-semibold uppercase tracking-wider text-cdm-muted transition-colors hover:border-cdm-accent/30 hover:text-cdm-fg"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="cdm-chip cursor-pointer border border-cdm-accent/60 bg-cdm-accent/15 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-cdm-accent shadow-[0_0_18px_-6px_rgba(34,211,238,0.55)] transition-colors hover:bg-cdm-accent/25 disabled:opacity-50"
            onClick={() => void guardar()}
            disabled={busy}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
