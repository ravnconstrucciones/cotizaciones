/** Redondeo a centavos (ARS). */
export function roundArs2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

const NBSP = /\u00a0/g;

const moneyArs = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyArsInt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const moneyUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyUsdInt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function numberFmt(decimals: number): Intl.NumberFormat {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const numberFmtCache = new Map<number, Intl.NumberFormat>();

function getNumberFmt(decimals: number): Intl.NumberFormat {
  let f = numberFmtCache.get(decimals);
  if (!f) {
    f = numberFmt(decimals);
    numberFmtCache.set(decimals, f);
  }
  return f;
}

function normalizeMoneySpaces(s: string): string {
  return s.replace(NBSP, " ");
}

/** Dinero ARS con locale es-AR (ej. $ 1.365.174,00). */
export function formatMoney(value: number): string {
  return normalizeMoneySpaces(
    moneyArs.format(Number.isFinite(value) ? value : 0)
  );
}

/** Dinero ARS sin centavos. */
export function formatMoneyInt(value: number): string {
  return normalizeMoneySpaces(
    moneyArsInt.format(Math.round(Number.isFinite(value) ? value : 0))
  );
}

export function formatMoneyMoneda(
  value: number,
  moneda: "ARS" | "USD"
): string {
  const n = Number.isFinite(value) ? value : 0;
  if (moneda === "USD") {
    return normalizeMoneySpaces(moneyUsd.format(n));
  }
  return formatMoney(n);
}

/** Dólares sin centavos (vista previa / totales enteros). */
export function formatMoneyUsdInt(value: number): string {
  return normalizeMoneySpaces(
    moneyUsdInt.format(Math.round(Number.isFinite(value) ? value : 0))
  );
}

/**
 * Solo dígitos (y pegado con puntos) → entero ARS con separadores de miles es-AR.
 * Para campos de importe sin decimales.
 */
export function formatArsEnteroDesdeDigitos(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0) return "";
  return formatNumber(n, 0);
}

/** Número con separadores es-AR (miles `.`, decimales `,`). */
export function formatNumber(value: number, decimals = 2): string {
  return getNumberFmt(decimals).format(Number.isFinite(value) ? value : 0);
}

/**
 * Interpreta entrada con convención argentina: miles con `.`, decimales con `,`.
 * Acepta también un único `.` como decimal (p. ej. al pegar valores US) si
 * la parte derecha tiene 1–2 dígitos.
 */
export function parseFormattedNumber(s: string): number {
  const raw = String(s ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\$/g, "")
    .replace(/ARS/gi, "");
  if (!raw) return 0;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma) {
    const lastComma = raw.lastIndexOf(",");
    const intPart = raw
      .slice(0, lastComma)
      .replace(/\./g, "")
      .replace(/[^\d]/g, "");
    const decPart = raw.slice(lastComma + 1).replace(/[^\d]/g, "");
    const n = parseFloat(intPart + (decPart ? `.${decPart}` : ""));
    return Number.isFinite(n) ? n : 0;
  }

  if (hasDot) {
    const parts = raw.split(".");
    if (parts.length === 2) {
      const right = parts[1] ?? "";
      if (right.length >= 1 && right.length <= 2) {
        const left = (parts[0] ?? "").replace(/[^\d-]/g, "");
        const n = parseFloat(`${left}.${right.replace(/[^\d]/g, "")}`);
        return Number.isFinite(n) ? n : 0;
      }
    }
    const digits = raw.replace(/\./g, "").replace(/[^\d]/g, "");
    const n = parseFloat(digits);
    return Number.isFinite(n) ? n : 0;
  }

  const n = parseFloat(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
