/**
 * El TALLER: lo que Eze arma sobre la mesa antes de que exista el número.
 *
 * Hasta el 16/08 esto vivía en el `localStorage` del navegador y se perdía al
 * cambiar de máquina. Ahora persiste en tablas propias del cotizador
 * (`cotizador_taller_*`), en la MISMA base de App RAVN. El límite es por momento
 * del laburo, no por tecnología: el taller es antes del número, la oficina
 * (documento, plata, obra) es después y sigue siendo de la app.
 *
 * Regla que no se toca: el agregado a mano se suma SIEMPRE aparte del rango que
 * cerró el motor. Nunca se mezcla con el total persistido de la cotización.
 */

export type ManualTipo = "material" | "mano_de_obra";

/** Ítem que Eze agrega a mano dentro de un rubro. */
export type ManualItem = {
  id: string;
  /** Rubro al que se cuelga: `QuoteBatch["id"]`. */
  batchId: string;
  name: string;
  tipo: ManualTipo;
  cantidad: number;
  unidad: string;
  precioUnit: number;
};

/** Alta de un ítem a mano: todo menos el id, que lo pone la base. */
export type ManualDraft = Omit<ManualItem, "id">;

/**
 * Decisión tomada desde la tarjeta: cuál de los precios usa y cuándo. Reabrir
 * borra la fila — el ítem vuelve a la cola sin dejar estado fantasma.
 */
export type Decision = {
  origin: string;
  value: number | null;
  at: string;
};

/** Clave de la decisión dentro de una cotización: `<rubro>:<ítem>`. */
export type ItemKey = string;

export type TallerState = {
  manual: ManualItem[];
  decided: Record<ItemKey, Decision>;
};

export const EMPTY_TALLER: TallerState = { manual: [], decided: {} };

export function manualSubtotal(item: ManualItem): number {
  return item.cantidad * item.precioUnit;
}

export function manualTotal(items: readonly ManualItem[]): number {
  return items.reduce((sum, item) => sum + manualSubtotal(item), 0);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El preview sintético usa `synthetic-preview-quote` como id. Sin este guard la
 * escritura viajaría a la base y rebotaría contra la foreign key: mejor cortarla
 * acá y dejar que el visor caiga al modo local.
 */
export function isPersistableQuoteId(value: string): boolean {
  return UUID.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  return null;
}

function nonNegativeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return null;
}

function trimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

/**
 * Valida el alta que llega del navegador. Devuelve `null` ante cualquier campo
 * incompleto: la mesa no repara datos rotos, los rechaza.
 */
export function parseManualDraft(value: unknown): ManualDraft | null {
  if (!isRecord(value)) return null;

  const batchId = trimmed(value.batchId);
  const name = trimmed(value.name);
  const unidad = trimmed(value.unidad);
  const cantidad = positiveNumber(value.cantidad);
  const precioUnit = nonNegativeNumber(value.precioUnit);
  const tipo = value.tipo === "material" || value.tipo === "mano_de_obra" ? value.tipo : null;

  if (!batchId || !name || !unidad || !tipo || cantidad == null || precioUnit == null) {
    return null;
  }

  return { batchId, name, tipo, cantidad, unidad, precioUnit };
}

export function parseManualItem(value: unknown): ManualItem | null {
  if (!isRecord(value)) return null;
  const id = trimmed(value.id);
  const draft = parseManualDraft(value);
  return id && draft ? { id, ...draft } : null;
}

export function parseDecision(value: unknown): Decision | null {
  if (!isRecord(value)) return null;
  const origin = trimmed(value.origin);
  const at = trimmed(value.at);
  const value_ = value.value;
  const numeric = value_ === null || value_ === undefined ? null : nonNegativeNumber(value_);
  if (!origin || !at || (value_ !== null && value_ !== undefined && numeric == null)) return null;
  return { origin, value: numeric, at };
}

export function parseTallerState(value: unknown): TallerState {
  if (!isRecord(value)) return EMPTY_TALLER;

  const manual = Array.isArray(value.manual)
    ? value.manual.map(parseManualItem).filter((item): item is ManualItem => item !== null)
    : [];

  const decided: Record<string, Decision> = {};
  if (isRecord(value.decided)) {
    for (const [key, raw] of Object.entries(value.decided)) {
      const decision = parseDecision(raw);
      if (decision) decided[key] = decision;
    }
  }

  return { manual, decided };
}
