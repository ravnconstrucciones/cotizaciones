/**
 * Persistencia del INTAKE (puerta de entrada, spec 2026-08-17): la fila de
 * `cotizador_intake` por cotización. Mismo molde PostgREST que el taller
 * (service role desde el server del cotizador; el bridge escribe la propuesta
 * por su lado). Nada acá toca plata ni estado de cotizaciones.
 */
import { TallerError } from "./store";
import { isPersistableQuoteId } from "./types";

const DEFAULT_TIMEOUT_MS = 5_000;

export type EstadoIntake = "esperando_ola" | "propuesta_lista" | "confirmada" | "error";

export type FilaIntake = {
  cotizacion_id: string;
  estado: EstadoIntake;
  texto: string | null;
  propuesta: unknown;
  error: string | null;
  actualizado_at: string;
};

type IntakeStoreConfig = {
  url: string;
  serviceKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ESTADOS: EstadoIntake[] = ["esperando_ola", "propuesta_lista", "confirmada", "error"];

function rowToFila(row: unknown): FilaIntake | null {
  if (!isRecord(row)) return null;
  if (typeof row.cotizacion_id !== "string") return null;
  if (typeof row.estado !== "string" || !(ESTADOS as string[]).includes(row.estado)) return null;
  return {
    cotizacion_id: row.cotizacion_id,
    estado: row.estado as EstadoIntake,
    texto: typeof row.texto === "string" ? row.texto : null,
    propuesta: row.propuesta ?? null,
    error: typeof row.error === "string" ? row.error : null,
    actualizado_at: typeof row.actualizado_at === "string" ? row.actualizado_at : "",
  };
}

export function createIntakeStore(config: IntakeStoreConfig) {
  const baseUrl = config.url.replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = config.fetchImpl ?? fetch;

  function assertConfigured(): void {
    if (!baseUrl || !config.serviceKey) {
      throw new TallerError(
        "configuration_error",
        "El intake no tiene la base configurada (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
      );
    }
  }

  async function request(path: string, init: RequestInit): Promise<unknown> {
    assertConfigured();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new TallerError(
        aborted ? "timeout" : "network_error",
        aborted ? "La base no respondió a tiempo." : "No se pudo llegar a la base del intake."
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new TallerError("upstream_error", `La base rechazó la operación (${response.status}).`);
    }
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new TallerError("invalid_response", "La base devolvió una respuesta ilegible.");
    }
  }

  function assertPersistable(quoteId: string): void {
    if (!isPersistableQuoteId(quoteId)) {
      throw new TallerError(
        "not_persistable",
        "Esa cotización no existe en la base: el intake no se puede guardar."
      );
    }
  }

  return {
    /**
     * Alta idempotente: reintentar el alta del mismo intake es seguro
     * (merge-duplicates sobre el unique de cotizacion_id).
     */
    async crear(quoteId: string, texto: string | null): Promise<void> {
      assertPersistable(quoteId);
      await request("cotizador_intake?on_conflict=cotizacion_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ cotizacion_id: quoteId, texto, estado: "esperando_ola" }),
      });
    },

    async leer(quoteId: string): Promise<FilaIntake | null> {
      if (!isPersistableQuoteId(quoteId)) return null;
      const rows = await request(
        `cotizador_intake?cotizacion_id=eq.${encodeURIComponent(quoteId)}&limit=1`,
        { method: "GET" }
      );
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rowToFila(rows[0]);
    },

    async marcarConfirmada(quoteId: string): Promise<void> {
      assertPersistable(quoteId);
      const rows = await request(
        `cotizador_intake?cotizacion_id=eq.${encodeURIComponent(quoteId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ estado: "confirmada", actualizado_at: new Date().toISOString() }),
        }
      );
      // 0 filas afectadas nunca es éxito (regla anti no-op silencioso).
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new TallerError("upstream_error", "El intake a confirmar no existe en la base.");
      }
    },

    /** Relanzar la ola: vuelve a esperando_ola y limpia el error viejo. */
    async relanzar(quoteId: string): Promise<void> {
      assertPersistable(quoteId);
      const rows = await request(
        `cotizador_intake?cotizacion_id=eq.${encodeURIComponent(quoteId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            estado: "esperando_ola",
            error: null,
            actualizado_at: new Date().toISOString(),
          }),
        }
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new TallerError("upstream_error", "El intake a relanzar no existe en la base.");
      }
    },
  };
}

export type IntakeStore = ReturnType<typeof createIntakeStore>;

/** Entry point server-only: usa el service role, nunca se importa del cliente. */
export function intakeStore(): IntakeStore {
  if (typeof window !== "undefined") {
    throw new TallerError("configuration_error", "El intake sólo se escribe del lado del servidor.");
  }
  return createIntakeStore({
    url: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  });
}
