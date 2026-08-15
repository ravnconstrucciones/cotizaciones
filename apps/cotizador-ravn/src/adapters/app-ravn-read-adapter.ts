import type {
  CotizacionRow,
  EstadoCotizacion,
  ItemDesglose,
} from "../../../../src/lib/cotizador/tipos";
import {
  isActiveLegacyState,
  projectQuoteSummary,
  projectQuoteWorkspace,
  type MensajeHilo,
  type QuoteSummary,
  type QuoteWorkspaceSnapshot,
} from "../domain/quote-workspace";

const DEFAULT_TIMEOUT_MS = 5_000;
const LEGACY_STATES: readonly EstadoCotizacion[] = [
  "borrador",
  "en_revision",
  "aprobada",
  "rechazada",
  "documento_emitido",
];
const MESSAGE_AUTHORS = new Set(["eze", "sistema", "fable", "codex"]);

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

type AdapterConfig = {
  baseUrl: string;
  readSecret: string;
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
};

export type QuoteWorkspaceLoadResult = {
  quotes: QuoteSummary[];
  snapshot: QuoteWorkspaceSnapshot;
};

export type QuoteReadErrorCode =
  | "configuration_error"
  | "network_error"
  | "timeout"
  | "upstream_error"
  | "invalid_response"
  | "no_active_quote";

export class QuoteReadError extends Error {
  readonly code: QuoteReadErrorCode;

  constructor(code: QuoteReadErrorCode, message: string) {
    super(message);
    this.name = "QuoteReadError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isLegacyState(value: unknown): value is EstadoCotizacion {
  return typeof value === "string" && (LEGACY_STATES as readonly string[]).includes(value);
}

function isPrice(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.valor === "number" &&
    Number.isFinite(value.valor) &&
    typeof value.fuente === "string" &&
    value.fuente.trim().length > 0 &&
    typeof value.fecha === "string" &&
    value.fecha.trim().length > 0
  );
}

function isLegacyItem(value: unknown): value is ItemDesglose {
  if (!isRecord(value) || !isRecord(value.precios)) return false;
  const prices = value.precios;
  const priceSlotsValid = ["sismat", "internet", "retail", "eze"].every(
    (slot) => prices[slot] === undefined || isPrice(prices[slot])
  );
  return (
    priceSlotsValid &&
    typeof value.nombre === "string" &&
    typeof value.etapa === "string" &&
    (value.tipo === "material" || value.tipo === "mano_de_obra") &&
    typeof value.subtotal_min === "number" &&
    Number.isFinite(value.subtotal_min) &&
    typeof value.subtotal_max === "number" &&
    Number.isFinite(value.subtotal_max) &&
    isNullableNumber(value.precio_min) &&
    isNullableNumber(value.precio_max) &&
    typeof value.sin_precio === "boolean"
  );
}

function isLegacyExtra(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.nombre === "string" &&
    typeof value.monto_min === "number" &&
    Number.isFinite(value.monto_min) &&
    typeof value.monto_max === "number" &&
    Number.isFinite(value.monto_max) &&
    typeof value.fuente === "string" &&
    value.fuente.trim().length > 0 &&
    typeof value.fecha === "string" &&
    value.fecha.trim().length > 0
  );
}

function isLegacyDesglose(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!("items" in value)) return Object.keys(value).length === 0;
  if (!Array.isArray(value.items) || !value.items.every(isLegacyItem)) return false;
  return (
    typeof value.receta_nombre === "string" &&
    typeof value.receta_version === "number" &&
    isRecord(value.parametros) &&
    Array.isArray(value.extras) &&
    value.extras.every(isLegacyExtra) &&
    isRecord(value.totales) &&
    isRecord(value.tiempo) &&
    typeof value.generado_at === "string"
  );
}

function isLegacyRevision(value: unknown): boolean {
  if (value === null) return true;
  return (
    isRecord(value) &&
    Array.isArray(value.checklist) &&
    value.checklist.every((entry) => isRecord(entry) && typeof entry.item === "string") &&
    Array.isArray(value.sanidad) &&
    value.sanidad.every((entry) => isRecord(entry) && typeof entry.chequeo === "string") &&
    Array.isArray(value.precios_vencidos) &&
    value.precios_vencidos.every(
      (entry) => isRecord(entry) && typeof entry.item === "string"
    ) &&
    Array.isArray(value.divergencias) &&
    value.divergencias.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.item === "string" &&
        (entry.nivel === "marca" || entry.nivel === "critica")
    ) &&
    Array.isArray(value.dudas) &&
    value.dudas.every((entry) => typeof entry === "string")
  );
}

function isCotizacionRow(value: unknown): value is CotizacionRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.creado_at === "string" &&
    typeof value.titulo === "string" &&
    isNullableString(value.zona) &&
    isLegacyState(value.estado) &&
    isNullableString(value.trabajo_id) &&
    isNullableString(value.receta_id) &&
    isRecord(value.ficha) &&
    isLegacyDesglose(value.desglose) &&
    isNullableNumber(value.total_min) &&
    isNullableNumber(value.total_max) &&
    isNullableNumber(value.precio_propuesta) &&
    isLegacyRevision(value.revision) &&
    isNullableString(value.motivo_rechazo) &&
    isNullableString(value.presupuesto_id) &&
    isNullableString(value.foto_portada_path)
  );
}

type QuoteListRow = Pick<
  CotizacionRow,
  "id" | "creado_at" | "titulo" | "zona" | "estado" | "total_min" | "total_max" | "precio_propuesta"
>;

function normalizeListRow(value: unknown): QuoteListRow | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.creado_at !== "string" ||
    typeof value.titulo !== "string" ||
    !isNullableString(value.zona) ||
    !isLegacyState(value.estado) ||
    !isNullableNumber(value.total_min) ||
    !isNullableNumber(value.total_max) ||
    !isNullableNumber(value.precio_propuesta)
  ) {
    return null;
  }
  return {
    id: value.id,
    creado_at: value.creado_at,
    titulo: value.titulo,
    zona: value.zona,
    estado: value.estado,
    total_min: value.total_min,
    total_max: value.total_max,
    precio_propuesta: value.precio_propuesta,
  };
}

export function normalizeMensajeHilo(value: unknown): MensajeHilo | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.fecha !== "string" ||
    !MESSAGE_AUTHORS.has(String(value.autor)) ||
    typeof value.texto !== "string" ||
    value.texto.trim().length === 0 ||
    typeof value.etiqueta !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    fecha: value.fecha,
    autor: value.autor as MensajeHilo["autor"],
    texto: value.texto,
    etiqueta: value.etiqueta,
  };
}

function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1";
    const secureTransport = url.protocol === "https:" || (url.protocol === "http:" && loopback);
    if (!secureTransport || url.username || url.password) {
      throw new Error("unsupported URL");
    }
    url.pathname = url.pathname.replace(/\/$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new QuoteReadError(
      "configuration_error",
      "La URL de App RAVN no está configurada correctamente."
    );
  }
}

function validateConfig(config: AdapterConfig): Required<Omit<AdapterConfig, "fetchImpl">> & {
  fetchImpl: FetchImplementation;
} {
  if (!config.readSecret.trim()) {
    throw new QuoteReadError(
      "configuration_error",
      "Falta configurar la credencial de lectura de App RAVN."
    );
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new QuoteReadError("configuration_error", "El timeout de lectura es inválido.");
  }
  return {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    readSecret: config.readSecret,
    timeoutMs,
    fetchImpl: config.fetchImpl ?? ((input, init) => fetch(input, init)),
  };
}

async function getJson(
  config: ReturnType<typeof validateConfig>,
  path: string
): Promise<unknown> {
  const url = new URL(path, `${config.baseUrl}/`);
  let response: Response;
  try {
    response = await config.fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "x-ravn-cotizador-read": config.readSecret,
      },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    if (error instanceof QuoteReadError) throw error;
    const name = isRecord(error) && typeof error.name === "string" ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new QuoteReadError("timeout", "App RAVN no respondió dentro de 5 segundos.");
    }
    throw new QuoteReadError("network_error", "No se pudo conectar con App RAVN.");
  }

  if (!response.ok) {
    throw new QuoteReadError(
      "upstream_error",
      "App RAVN rechazó o no pudo completar la lectura solicitada."
    );
  }

  try {
    return await response.json();
  } catch {
    throw new QuoteReadError("invalid_response", "App RAVN devolvió una respuesta inválida.");
  }
}

/**
 * Adaptador read-only. La única operación posible es GET y toda dependencia
 * mutable se inyecta para poder verificar el límite HTTP sin tocar App RAVN.
 */
export function createAppRavnReadAdapter(configInput: AdapterConfig): {
  loadQuoteWorkspace(selectedId?: string): Promise<QuoteWorkspaceLoadResult>;
} {
  const config = validateConfig(configInput);

  return {
    async loadQuoteWorkspace(selectedId?: string): Promise<QuoteWorkspaceLoadResult> {
      const listPayload = await getJson(config, "/api/cotizaciones");
      if (!isRecord(listPayload) || !Array.isArray(listPayload.cotizaciones)) {
        throw new QuoteReadError("invalid_response", "La lista de cotizaciones es inválida.");
      }

      const rows = listPayload.cotizaciones
        .map(normalizeListRow)
        .filter((row): row is QuoteListRow => row !== null)
        .sort((left, right) => right.creado_at.localeCompare(left.creado_at));
      const quotes = rows.map(projectQuoteSummary);
      const explicitId = selectedId?.trim();
      const quoteId = explicitId || rows.find((row) => isActiveLegacyState(row.estado))?.id;
      if (!quoteId) {
        throw new QuoteReadError(
          "no_active_quote",
          "No hay una cotización activa disponible para mostrar."
        );
      }

      const encodedId = encodeURIComponent(quoteId);
      const [detailPayload, messagePayload] = await Promise.all([
        getJson(config, `/api/cotizaciones/${encodedId}`),
        getJson(config, `/api/cotizaciones/${encodedId}/mensajes`),
      ]);

      if (!isRecord(detailPayload) || !isCotizacionRow(detailPayload.cotizacion)) {
        throw new QuoteReadError("invalid_response", "El detalle de la cotización es inválido.");
      }
      if (detailPayload.cotizacion.id !== quoteId) {
        throw new QuoteReadError(
          "invalid_response",
          "App RAVN devolvió una cotización distinta de la solicitada."
        );
      }
      if (!isRecord(messagePayload) || !Array.isArray(messagePayload.mensajes)) {
        throw new QuoteReadError("invalid_response", "El hilo de la cotización es inválido.");
      }

      const messages = messagePayload.mensajes
        .map(normalizeMensajeHilo)
        .filter((message): message is MensajeHilo => message !== null);
      const bridgeConnected =
        typeof messagePayload.motor_conectado === "boolean"
          ? messagePayload.motor_conectado
          : null;
      const pickerQuotes = quotes.some((quote) => quote.id === quoteId)
        ? quotes
        : [...quotes, projectQuoteSummary(detailPayload.cotizacion)];

      return {
        quotes: pickerQuotes,
        snapshot: projectQuoteWorkspace({
          quote: detailPayload.cotizacion,
          messages,
          bridgeConnected,
          provenance: "app_ravn_readonly",
        }),
      };
    },
  };
}

/** Entry point server-only: usa secretos privados y nunca se importa desde un Client Component. */
export async function loadQuoteWorkspace(
  selectedId?: string
): Promise<QuoteWorkspaceLoadResult> {
  if (typeof window !== "undefined") {
    throw new QuoteReadError(
      "configuration_error",
      "La lectura de App RAVN sólo está disponible del lado del servidor."
    );
  }
  return createAppRavnReadAdapter({
    baseUrl: process.env.RAVN_APP_URL ?? "",
    readSecret: process.env.RAVN_COTIZADOR_READ_SECRET ?? "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }).loadQuoteWorkspace(selectedId);
}
