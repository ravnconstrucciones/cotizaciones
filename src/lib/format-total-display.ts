import { formatMoneyInt } from "@/lib/format-currency";

/** Total de propuesta / listados: importe entero, sin centavos. */
export function formatTotalDisplay(amount: number, moneda: "ARS" | "USD"): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const entero = Math.round(n);
  if (moneda === "USD") {
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(entero);
    return `US$ ${formatted}`;
  }
  return formatMoneyInt(entero);
}
