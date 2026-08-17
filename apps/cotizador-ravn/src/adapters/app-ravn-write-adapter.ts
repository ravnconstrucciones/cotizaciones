/**
 * El PASE del expediente: la única escritura que el laboratorio hace sobre App
 * RAVN.
 *
 * Espejo del adaptador de lectura, con una diferencia deliberada: credencial
 * propia (`RAVN_COTIZADOR_WRITE_SECRET`, header `x-ravn-cotizador-write`) y una
 * sola ruta. La de lectura sigue siendo incapaz de escribir, y ésta no puede
 * aprobar, emitir ni tocar plata — App RAVN lo hace cumplir en su middleware,
 * acá no hay nada que se pueda ampliar de este lado.
 *
 * Lo que viaja es el EXTRACTO (ítems a mano + precios cerrados) y el NÚMERO.
 * Nada de texto: título, alcance y notas son del flujo de diagnóstico.
 */

import type { OrigenPrecio, TipoItem, Unidad } from "../../../../src/lib/cotizador/tipos";

const DEFAULT_TIMEOUT_MS = 10_000;

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

type WriteAdapterConfig = {
  baseUrl: string;
  writeSecret: string;
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
};

export type QuoteWriteErrorCode =
  | "configuration_error"
  | "network_error"
  | "timeout"
  | "rejected"
  | "conflict"
  | "upstream_error"
  | "invalid_response";

export class QuoteWriteError extends Error {
  readonly code: QuoteWriteErrorCode;

  constructor(code: QuoteWriteErrorCode, message: string) {
    super(message);
    this.name = "QuoteWriteError";
    this.code = code;
  }
}

/** Ítem que Eze agregó a mano en el taller, tal como lo espera App RAVN. */
export type PaseManual = {
  nombre: string;
  rubro: string;
  tipo: TipoItem;
  unidad: Unidad;
  cantidad: number;
  precio?: number;
  notas?: string;
};

/** Precio que Eze cerró, CON el origen del que salió (sólo `eze` calibra). */
export type PasePrecioCerrado = {
  nombre: string;
  valor: number;
  origen: OrigenPrecio;
  /**
   * Quién pasó el número, cuando tiene nombre: el proveedor de mano de obra que
   * ganó el rubro. Viaja para que `precios_items` aprenda "Fran" y no una
   * etiqueta genérica. Sólo tiene efecto con origen `eze`.
   */
  fuente?: string;
};

export type PasePayload = {
  precioPropuesta: number | null;
  manuales: PaseManual[];
  preciosCerrados: PasePrecioCerrado[];
};

export type PaseResultado = {
  totalMin: number | null;
  totalMax: number | null;
  precioPropuesta: number | null;
  aplicados: { manuales: number; precios: number; calibrados: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function contador(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Mismo criterio que la lectura: sin HTTPS (salvo loopback) no se sale. */
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
    throw new QuoteWriteError(
      "configuration_error",
      "La URL de App RAVN no está configurada correctamente."
    );
  }
}

function validateConfig(config: WriteAdapterConfig): Required<Omit<WriteAdapterConfig, "fetchImpl">> & {
  fetchImpl: FetchImplementation;
} {
  if (!config.writeSecret.trim()) {
    throw new QuoteWriteError(
      "configuration_error",
      "Falta la credencial de escritura de App RAVN — el pase no puede salir."
    );
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new QuoteWriteError("configuration_error", "El timeout del pase es inválido.");
  }
  return {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    writeSecret: config.writeSecret,
    timeoutMs,
    fetchImpl: config.fetchImpl ?? ((input, init) => fetch(input, init)),
  };
}

/**
 * Traduce el estado del taller al body del pase. El taller manda: lo que no
 * viene acá deja de existir en la cotización.
 */
function bodyDelPase(payload: PasePayload): Record<string, unknown> {
  return {
    precio_propuesta: payload.precioPropuesta,
    manuales: payload.manuales.map((m) => ({
      nombre: m.nombre,
      rubro: m.rubro,
      tipo: m.tipo,
      unidad: m.unidad,
      cantidad: m.cantidad,
      ...(m.precio != null ? { precio: m.precio } : {}),
      ...(m.notas ? { notas: m.notas } : {}),
    })),
    precios_cerrados: payload.preciosCerrados.map((p) => ({
      nombre: p.nombre,
      valor: p.valor,
      origen: p.origen,
      ...(p.fuente ? { fuente: p.fuente } : {}),
    })),
  };
}

export function createAppRavnWriteAdapter(configInput: WriteAdapterConfig): {
  pasarExpediente(quoteId: string, payload: PasePayload): Promise<PaseResultado>;
} {
  const config = validateConfig(configInput);

  return {
    async pasarExpediente(quoteId: string, payload: PasePayload): Promise<PaseResultado> {
      const url = new URL(
        `/api/cotizaciones/${encodeURIComponent(quoteId)}/pase`,
        `${config.baseUrl}/`
      );

      let response: Response;
      try {
        response = await config.fetchImpl(url, {
          method: "POST",
          cache: "no-store",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-ravn-cotizador-write": config.writeSecret,
          },
          body: JSON.stringify(bodyDelPase(payload)),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        const name = isRecord(error) && typeof error.name === "string" ? error.name : "";
        if (name === "AbortError" || name === "TimeoutError") {
          throw new QuoteWriteError("timeout", "App RAVN no respondió — el pase no entró.");
        }
        throw new QuoteWriteError("network_error", "No se pudo conectar con App RAVN.");
      }

      if (!response.ok) {
        // El motivo de App RAVN ya viene en castellano y es más preciso que
        // cualquier texto genérico: se muestra tal cual. Regla anti-slop: si no
        // entró, Eze tiene que leer POR QUÉ.
        const detalle = await response
          .json()
          .then((cuerpo: unknown) =>
            isRecord(cuerpo) && typeof cuerpo.error === "string" ? cuerpo.error : null
          )
          .catch(() => null);

        if (response.status === 409) {
          throw new QuoteWriteError(
            "conflict",
            detalle ?? "La cotización cambió de estado — el pase no entró."
          );
        }
        if (response.status === 400 || response.status === 404) {
          throw new QuoteWriteError("rejected", detalle ?? "App RAVN rechazó el pase.");
        }
        throw new QuoteWriteError(
          "upstream_error",
          detalle ?? "App RAVN no pudo completar el pase."
        );
      }

      const cuerpo: unknown = await response.json().catch(() => null);
      if (!isRecord(cuerpo) || cuerpo.ok !== true) {
        throw new QuoteWriteError(
          "invalid_response",
          "App RAVN contestó algo que el laboratorio no puede confirmar — revisá la cotización."
        );
      }

      const aplicados = isRecord(cuerpo.aplicados) ? cuerpo.aplicados : {};
      return {
        totalMin: nullableNumber(cuerpo.total_min),
        totalMax: nullableNumber(cuerpo.total_max),
        precioPropuesta: nullableNumber(cuerpo.precio_propuesta),
        aplicados: {
          manuales: contador(aplicados.manuales),
          precios: contador(aplicados.precios),
          calibrados: contador(aplicados.calibrados),
        },
      };
    },
  };
}

/** Entry point server-only: usa secretos privados, nunca se importa del cliente. */
export async function pasarExpediente(
  quoteId: string,
  payload: PasePayload
): Promise<PaseResultado> {
  if (typeof window !== "undefined") {
    throw new QuoteWriteError(
      "configuration_error",
      "El pase sólo puede salir del lado del servidor."
    );
  }
  return createAppRavnWriteAdapter({
    baseUrl: process.env.RAVN_APP_URL ?? "",
    writeSecret: process.env.RAVN_COTIZADOR_WRITE_SECRET ?? "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }).pasarExpediente(quoteId, payload);
}
