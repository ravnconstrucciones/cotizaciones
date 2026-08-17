import {
  EMPTY_TALLER,
  isPersistableQuoteId,
  parsePostulante,
  type Decision,
  type ItemKey,
  type ManualDraft,
  type ManualItem,
  type PostulanteDraft,
  type PostulanteMO,
  type TallerState,
} from "./types";

/**
 * Acceso a las tablas del taller. Va por PostgREST con `fetch`, igual que el
 * adapter de lectura de App RAVN, para no sumar dependencia (regla 4 de
 * `.ravn/02_AI_RULES.md`): un cliente de Supabase entero para dos tablas y
 * cuatro verbos no se justifica.
 *
 * Server-only: usa la service role key. La puerta de calle del cotizador es su
 * basic auth (`middleware.ts`); RLS sigue cubriendo a cualquier otro cliente.
 */

const DEFAULT_TIMEOUT_MS = 5_000;
const ITEMS = "cotizador_taller_items";
const DECISIONES = "cotizador_taller_decisiones";
const POSTULANTES = "cotizador_taller_postulantes_mo";

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type TallerStoreConfig = {
  url: string;
  serviceKey: string;
  fetchImpl?: FetchImplementation;
  timeoutMs?: number;
};

export type TallerErrorCode =
  | "configuration_error"
  | "not_persistable"
  | "network_error"
  | "timeout"
  | "upstream_error"
  | "invalid_response"
  | "invalid_input";

export class TallerError extends Error {
  readonly code: TallerErrorCode;

  constructor(code: TallerErrorCode, message: string) {
    super(message);
    this.name = "TallerError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** PostgREST puede devolver `numeric` como string; el dominio quiere número. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function rowToManualItem(row: unknown): ManualItem | null {
  if (!isRecord(row)) return null;
  const cantidad = toNumber(row.cantidad);
  const precioUnit = toNumber(row.precio_unit);
  if (
    typeof row.id !== "string" ||
    typeof row.rubro_id !== "string" ||
    typeof row.nombre !== "string" ||
    typeof row.unidad !== "string" ||
    (row.tipo !== "material" && row.tipo !== "mano_de_obra") ||
    cantidad == null ||
    precioUnit == null
  ) {
    return null;
  }

  return {
    id: row.id,
    batchId: row.rubro_id,
    name: row.nombre,
    tipo: row.tipo,
    cantidad,
    unidad: row.unidad,
    precioUnit,
  };
}

function manualDraftToRow(quoteId: string, draft: ManualDraft): Record<string, unknown> {
  return {
    cotizacion_id: quoteId,
    rubro_id: draft.batchId,
    nombre: draft.name,
    tipo: draft.tipo,
    cantidad: draft.cantidad,
    unidad: draft.unidad,
    precio_unit: draft.precioUnit,
  };
}

function rowToPostulante(row: unknown): PostulanteMO | null {
  if (!isRecord(row)) return null;
  return parsePostulante({
    id: row.id,
    batchId: row.rubro_id,
    itemName: row.item_nombre,
    proveedor: row.proveedor,
    precioUnit: toNumber(row.precio_unit),
    // PostgREST devuelve `date` como YYYY-MM-DD; si viniera con hora, se corta.
    fecha: typeof row.fecha === "string" ? row.fecha.slice(0, 10) : row.fecha,
    procedencia: row.procedencia,
    elegido: row.elegido === true,
  });
}

function postulanteDraftToRow(
  quoteId: string,
  draft: PostulanteDraft
): Record<string, unknown> {
  return {
    cotizacion_id: quoteId,
    rubro_id: draft.batchId,
    item_nombre: draft.itemName,
    proveedor: draft.proveedor,
    precio_unit: draft.precioUnit,
    fecha: draft.fecha,
    procedencia: draft.procedencia,
    elegido: false,
  };
}

function rowToDecision(row: unknown): { key: ItemKey; decision: Decision } | null {
  if (!isRecord(row)) return null;
  if (typeof row.item_key !== "string" || typeof row.origen !== "string") return null;
  if (typeof row.decidido_at !== "string") return null;

  return {
    key: row.item_key,
    decision: {
      origin: row.origen,
      value: row.valor === null || row.valor === undefined ? null : toNumber(row.valor),
      at: row.decidido_at,
    },
  };
}

export function createTallerStore(config: TallerStoreConfig) {
  const baseUrl = config.url.replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = config.fetchImpl ?? fetch;

  function assertConfigured(): void {
    if (!baseUrl || !config.serviceKey) {
      throw new TallerError(
        "configuration_error",
        "El taller no tiene la base configurada (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."
      );
    }
  }

  function assertPersistable(quoteId: string): void {
    if (!isPersistableQuoteId(quoteId)) {
      throw new TallerError(
        "not_persistable",
        "Esa cotización no existe en la base: el taller no la puede guardar."
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
        aborted ? "La base no respondió a tiempo." : "No se pudo llegar a la base del taller."
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

  return {
    /** Todo lo que Eze dejó sobre la mesa de esta cotización. */
    async read(quoteId: string): Promise<TallerState> {
      if (!isPersistableQuoteId(quoteId)) return EMPTY_TALLER;

      const query = `cotizacion_id=eq.${encodeURIComponent(quoteId)}`;
      const [itemRows, decisionRows, postulanteRows] = await Promise.all([
        request(`${ITEMS}?${query}&order=creado_at.asc`, { method: "GET" }),
        request(`${DECISIONES}?${query}`, { method: "GET" }),
        request(`${POSTULANTES}?${query}&order=creado_at.asc`, { method: "GET" }),
      ]);

      if (!Array.isArray(itemRows) || !Array.isArray(decisionRows) || !Array.isArray(postulanteRows)) {
        throw new TallerError("invalid_response", "La base no devolvió las filas del taller.");
      }

      const decided: Record<ItemKey, Decision> = {};
      for (const row of decisionRows) {
        const parsed = rowToDecision(row);
        if (parsed) decided[parsed.key] = parsed.decision;
      }

      return {
        manual: itemRows
          .map(rowToManualItem)
          .filter((item): item is ManualItem => item !== null),
        decided,
        postulantes: postulanteRows
          .map(rowToPostulante)
          .filter((p): p is PostulanteMO => p !== null),
      };
    },

    async addManualItem(quoteId: string, draft: ManualDraft): Promise<ManualItem> {
      assertPersistable(quoteId);
      const payload = await request(ITEMS, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(manualDraftToRow(quoteId, draft)),
      });

      const created = Array.isArray(payload) ? rowToManualItem(payload[0]) : null;
      if (!created) {
        throw new TallerError("invalid_response", "La base no devolvió el ítem recién creado.");
      }
      return created;
    },

    async dropManualItem(quoteId: string, id: string): Promise<void> {
      assertPersistable(quoteId);
      await request(
        `${ITEMS}?cotizacion_id=eq.${encodeURIComponent(quoteId)}&id=eq.${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } }
      );
    },

    /** Una decisión por ítem: si ya había, la pisa (el último criterio manda). */
    async saveDecision(
      quoteId: string,
      itemKey: ItemKey,
      origin: string,
      value: number | null
    ): Promise<Decision> {
      assertPersistable(quoteId);
      const payload = await request(DECISIONES, {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          cotizacion_id: quoteId,
          item_key: itemKey,
          origen: origin,
          valor: value,
          decidido_at: new Date().toISOString(),
        }),
      });

      const saved = Array.isArray(payload) ? rowToDecision(payload[0]) : null;
      if (!saved) {
        throw new TallerError("invalid_response", "La base no devolvió la decisión guardada.");
      }
      return saved.decision;
    },

    /** Un presupuesto de MO más sobre la mesa. Entra sin elegir: elegir es otro acto. */
    async addPostulante(quoteId: string, draft: PostulanteDraft): Promise<PostulanteMO> {
      assertPersistable(quoteId);
      const payload = await request(POSTULANTES, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(postulanteDraftToRow(quoteId, draft)),
      });

      const created = Array.isArray(payload) ? rowToPostulante(payload[0]) : null;
      if (!created) {
        throw new TallerError("invalid_response", "La base no devolvió el postulante recién creado.");
      }
      return created;
    },

    async dropPostulante(quoteId: string, id: string): Promise<void> {
      assertPersistable(quoteId);
      await request(
        `${POSTULANTES}?cotizacion_id=eq.${encodeURIComponent(quoteId)}&id=eq.${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } }
      );
    },

    /**
     * "El que me cobran a mí". Se limpia el rubro entero ANTES de marcar: el
     * índice único de la base rechaza dos elegidos y, sin esta secuencia,
     * cambiar de proveedor fallaría siempre. `id` en `null` sólo desmarca.
     *
     * El segundo PATCH filtra por rubro Y por id, así que un id que no es de
     * ese rubro no actualiza NADA — y PostgREST contesta 200 igual. Sin
     * verificar las filas afectadas eso era un no-op silencioso: el rubro
     * quedaba sin nadie elegido (el primer PATCH ya había desmarcado) mientras
     * la consola mostraba al proveedor marcado y el margen calculaba con su
     * número. Por eso se pide la representación y 0 filas es error.
     */
    async elegirPostulante(
      quoteId: string,
      batchId: string,
      id: string | null
    ): Promise<void> {
      assertPersistable(quoteId);
      const delRubro =
        `cotizacion_id=eq.${encodeURIComponent(quoteId)}` +
        `&rubro_id=eq.${encodeURIComponent(batchId)}`;

      await request(`${POSTULANTES}?${delRubro}&elegido=is.true`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ elegido: false }),
      });

      if (id === null) return;

      const marcado = await request(
        `${POSTULANTES}?${delRubro}&id=eq.${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ elegido: true }),
        }
      );

      if (!Array.isArray(marcado) || marcado.length === 0) {
        throw new TallerError(
          "invalid_input",
          "Ese presupuesto ya no está en este rubro: nadie quedó marcado. Recargá la mesa."
        );
      }
    },

    /** Reabrir: se borra la fila y el ítem vuelve a la cola. */
    async clearDecision(quoteId: string, itemKey: ItemKey): Promise<void> {
      assertPersistable(quoteId);
      await request(
        `${DECISIONES}?cotizacion_id=eq.${encodeURIComponent(quoteId)}` +
          `&item_key=eq.${encodeURIComponent(itemKey)}`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } }
      );
    },
  };
}

export type TallerStore = ReturnType<typeof createTallerStore>;

/** Entry point server-only, igual que `loadQuoteWorkspace`. */
export function tallerStore(): TallerStore {
  if (typeof window !== "undefined") {
    throw new TallerError(
      "configuration_error",
      "El taller sólo se escribe del lado del servidor."
    );
  }
  return createTallerStore({
    url: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  });
}
