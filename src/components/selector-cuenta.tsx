"use client";

import { useEffect, useState } from "react";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { formatMoneyInt } from "@/lib/format-currency";
import type { SaldosCuentas } from "@/lib/cuentas";

/**
 * Selector de CUENTA de origen para formularios de movimientos (¿de qué
 * cuenta salió/entró la plata?). Trae las cuentas activas con su saldo
 * derivado de /api/cuentas. Dejarlo vacío no bloquea el registro (nada se
 * pierde en obra), pero el movimiento queda PENDIENTE en la bandeja de
 * /archivados hasta que se le asigne cuenta — por eso se pinta en rojo.
 */
export function SelectorCuenta({
  value,
  onChange,
  monedas = ["ARS", "USD"],
  className,
}: {
  value: string | null;
  onChange: (cuentaId: string | null) => void;
  /** Filtra por moneda de la cuenta (p.ej. un retiro en pesos: ["ARS"]). */
  monedas?: ("ARS" | "USD")[];
  className?: string;
}) {
  const [cuentas, setCuentas] = useState<SaldosCuentas["cuentas"] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetchCompartido("/api/cuentas");
      if (!cancelled && r.ok) {
        setCuentas((r.body as SaldosCuentas).cuentas ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const opciones = (cuentas ?? []).filter(
    (c) => c.activa && monedas.includes(c.moneda)
  );

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={
        className ??
        "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none focus:border-cyan-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-50"
      }
      // Inline para ganarle a cualquier className de los forms: sin cuenta = rojo.
      style={value ? undefined : { color: "#f87171" }}
    >
      <option value="">Sin cuenta — queda pendiente</option>
      {opciones.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre} —{" "}
          {c.moneda === "USD"
            ? `US$ ${new Intl.NumberFormat("es-AR").format(c.saldo)}`
            : formatMoneyInt(c.saldo)}
        </option>
      ))}
    </select>
  );
}
