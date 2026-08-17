import {
  EMPTY_TALLER,
  parseManualItem,
  parseDecision,
  parsePostulante,
  parseTallerState,
  type Decision,
  type ItemKey,
  type ManualDraft,
  type ManualItem,
  type PostulanteDraft,
  type PostulanteMO,
  type TallerState,
} from "./types";

/**
 * Cómo persiste la mesa, visto desde el navegador. Dos implementaciones con la
 * misma cara:
 *
 * - `remoteTaller`: las tablas del cotizador en Supabase, vía `/api/taller`. Es
 *   la de verdad — lo que Eze arma sobrevive al navegador y a la máquina.
 * - `localTaller`: `localStorage`, para el preview sintético (esa cotización no
 *   existe en la base, así que la escritura rebotaría contra la foreign key).
 *
 * La consola no sabe cuál está usando: pide y escribe igual en los dos casos.
 */
export type TallerPersistence = {
  readonly kind: "remota" | "local";
  load(quoteId: string): Promise<TallerState>;
  addManual(quoteId: string, draft: ManualDraft): Promise<ManualItem>;
  dropManual(quoteId: string, id: string): Promise<void>;
  decide(
    quoteId: string,
    itemKey: ItemKey,
    origin: string,
    value: number | null
  ): Promise<Decision>;
  reopen(quoteId: string, itemKey: ItemKey): Promise<void>;
  addPostulante(quoteId: string, draft: PostulanteDraft): Promise<PostulanteMO>;
  dropPostulante(quoteId: string, id: string): Promise<void>;
  elegirPostulante(quoteId: string, batchId: string, id: string | null): Promise<void>;
};

export const MANUAL_KEY = (quoteId: string) => `qz:manual:${quoteId}`;
export const DECIDED_KEY = (quoteId: string) => `qz:decidido:${quoteId}`;
export const POSTULANTES_KEY = (quoteId: string) => `qz:postulantes:${quoteId}`;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function readJson(storage: Storage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* si el navegador no deja guardar, la mesa sigue viva en esta pestaña */
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `local-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function localTaller(storage: Storage): TallerPersistence {
  function state(quoteId: string): TallerState {
    return parseTallerState({
      manual: readJson(storage, MANUAL_KEY(quoteId)),
      decided: readJson(storage, DECIDED_KEY(quoteId)),
      postulantes: readJson(storage, POSTULANTES_KEY(quoteId)),
    });
  }

  return {
    kind: "local",

    async load(quoteId) {
      return state(quoteId);
    },

    async addManual(quoteId, draft) {
      const item: ManualItem = { id: newId(), ...draft };
      writeJson(storage, MANUAL_KEY(quoteId), [...state(quoteId).manual, item]);
      return item;
    },

    async dropManual(quoteId, id) {
      writeJson(
        storage,
        MANUAL_KEY(quoteId),
        state(quoteId).manual.filter((item) => item.id !== id)
      );
    },

    async decide(quoteId, itemKey, origin, value) {
      const decision: Decision = { origin, value, at: new Date().toISOString() };
      writeJson(storage, DECIDED_KEY(quoteId), { ...state(quoteId).decided, [itemKey]: decision });
      return decision;
    },

    async reopen(quoteId, itemKey) {
      const decided = { ...state(quoteId).decided };
      delete decided[itemKey];
      writeJson(storage, DECIDED_KEY(quoteId), decided);
    },

    async addPostulante(quoteId, draft) {
      const postulante: PostulanteMO = { id: newId(), ...draft, elegido: false };
      writeJson(storage, POSTULANTES_KEY(quoteId), [...state(quoteId).postulantes, postulante]);
      return postulante;
    },

    async dropPostulante(quoteId, id) {
      writeJson(
        storage,
        POSTULANTES_KEY(quoteId),
        state(quoteId).postulantes.filter((p) => p.id !== id)
      );
    },

    async elegirPostulante(quoteId, batchId, id) {
      writeJson(
        storage,
        POSTULANTES_KEY(quoteId),
        state(quoteId).postulantes.map((p) =>
          p.batchId === batchId ? { ...p, elegido: p.id === id } : p
        )
      );
    },
  };
}

type FetchImplementation = typeof fetch;

async function send(
  fetchImpl: FetchImplementation,
  url: string,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetchImpl(url, {
    cache: "no-store",
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers },
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "El taller no pudo guardar el cambio.";
    throw new Error(message);
  }
  return payload;
}

export function remoteTaller(fetchImpl: FetchImplementation = fetch): TallerPersistence {
  const q = (quoteId: string) => `quote=${encodeURIComponent(quoteId)}`;

  return {
    kind: "remota",

    async load(quoteId) {
      const payload = await send(fetchImpl, `/api/taller?${q(quoteId)}`);
      return payload ? parseTallerState(payload) : EMPTY_TALLER;
    },

    async addManual(quoteId, draft) {
      const payload = await send(fetchImpl, `/api/taller/items?${q(quoteId)}`, {
        method: "POST",
        body: JSON.stringify(draft),
      });
      const item = parseManualItem(payload);
      if (!item) throw new Error("El taller guardó el ítem pero devolvió algo ilegible.");
      return item;
    },

    async dropManual(quoteId, id) {
      await send(
        fetchImpl,
        `/api/taller/items?${q(quoteId)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
    },

    async decide(quoteId, itemKey, origin, value) {
      const payload = await send(fetchImpl, `/api/taller/decisiones?${q(quoteId)}`, {
        method: "POST",
        body: JSON.stringify({ itemKey, origin, value }),
      });
      const decision = parseDecision(payload);
      if (!decision) throw new Error("El taller guardó la decisión pero devolvió algo ilegible.");
      return decision;
    },

    async reopen(quoteId, itemKey) {
      await send(
        fetchImpl,
        `/api/taller/decisiones?${q(quoteId)}&item=${encodeURIComponent(itemKey)}`,
        { method: "DELETE" }
      );
    },

    async addPostulante(quoteId, draft) {
      const payload = await send(fetchImpl, `/api/taller/postulantes?${q(quoteId)}`, {
        method: "POST",
        body: JSON.stringify(draft),
      });
      const postulante = parsePostulante(payload);
      if (!postulante) {
        throw new Error("El taller guardó el postulante pero devolvió algo ilegible.");
      }
      return postulante;
    },

    async dropPostulante(quoteId, id) {
      await send(
        fetchImpl,
        `/api/taller/postulantes?${q(quoteId)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
    },

    async elegirPostulante(quoteId, batchId, id) {
      await send(fetchImpl, `/api/taller/postulantes?${q(quoteId)}`, {
        method: "PATCH",
        body: JSON.stringify({ batchId, id }),
      });
    },
  };
}
