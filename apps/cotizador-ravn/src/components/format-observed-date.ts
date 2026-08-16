const MONTHS = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
] as const;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

function civilDate(value: string): string | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;

  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

/**
 * Las fuentes guardan fechas civiles y los eventos guardan timestamps.
 * Una fecha civil nunca pasa por UTC: hacerlo la correría al día anterior en Argentina.
 */
export function formatObservedDate(value: string | null): string {
  if (!value) return "SIN FECHA";

  const persistedDate = civilDate(value);
  if (persistedDate) return persistedDate;

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : DATE_TIME.format(parsed);
}
