import { describe, expect, it } from "vitest";
import { createTallerStore, TallerError } from "./store";
import {
  isPersistableQuoteId,
  manualTotal,
  parseManualDraft,
  parseTallerState,
} from "./types";

const QUOTE = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

type Call = { url: string; init: RequestInit };

function stubFetch(responder: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return responder(call);
  };
  return { calls, fetchImpl };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function storeWith(responder: (call: Call) => Response) {
  const { calls, fetchImpl } = stubFetch(responder);
  const store = createTallerStore({ url: "https://base.test/", serviceKey: "clave", fetchImpl });
  return { calls, store };
}

describe("parseManualDraft", () => {
  const valid = {
    batchId: "rubro-1",
    name: "Perfil omega",
    tipo: "material",
    cantidad: 12,
    unidad: "u",
    precioUnit: 4500,
  };

  it("acepta un alta completa", () => {
    expect(parseManualDraft(valid)).toEqual(valid);
  });

  it("rechaza cantidad cero o negativa", () => {
    expect(parseManualDraft({ ...valid, cantidad: 0 })).toBeNull();
    expect(parseManualDraft({ ...valid, cantidad: -3 })).toBeNull();
  });

  it("rechaza precio negativo pero acepta cero", () => {
    expect(parseManualDraft({ ...valid, precioUnit: -1 })).toBeNull();
    expect(parseManualDraft({ ...valid, precioUnit: 0 })).not.toBeNull();
  });

  it("rechaza un tipo que no es del dominio", () => {
    expect(parseManualDraft({ ...valid, tipo: "flete" })).toBeNull();
  });

  it("rechaza texto vacío o sólo espacios", () => {
    expect(parseManualDraft({ ...valid, name: "   " })).toBeNull();
    expect(parseManualDraft({ ...valid, unidad: "" })).toBeNull();
  });
});

describe("isPersistableQuoteId", () => {
  it("acepta un uuid y rechaza el id del preview sintético", () => {
    expect(isPersistableQuoteId(QUOTE)).toBe(true);
    expect(isPersistableQuoteId("synthetic-preview-quote")).toBe(false);
  });
});

describe("read", () => {
  it("mapea las filas al dominio y arma el diccionario de decisiones", async () => {
    const { store } = storeWith((call) =>
      call.url.includes("cotizador_taller_items")
        ? json([
            {
              id: "item-1",
              rubro_id: "rubro-1",
              nombre: "Perfil omega",
              tipo: "material",
              cantidad: "12",
              unidad: "u",
              precio_unit: "4500.50",
            },
          ])
        : json([
            {
              item_key: "rubro-1:Adhesivo",
              origen: "sismat",
              valor: "18200",
              decidido_at: "2026-08-16T18:00:00.000Z",
            },
          ])
    );

    const state = await store.read(QUOTE);

    expect(state.manual).toEqual([
      {
        id: "item-1",
        batchId: "rubro-1",
        name: "Perfil omega",
        tipo: "material",
        cantidad: 12,
        unidad: "u",
        precioUnit: 4500.5,
      },
    ]);
    expect(state.decided["rubro-1:Adhesivo"]).toEqual({
      origin: "sismat",
      value: 18200,
      at: "2026-08-16T18:00:00.000Z",
    });
  });

  it("descarta filas rotas en vez de romper la mesa entera", async () => {
    const { store } = storeWith((call) =>
      call.url.includes("cotizador_taller_items")
        ? json([{ id: "roto" }, { id: "x", rubro_id: "r", nombre: "n", tipo: "material", cantidad: 1, unidad: "u", precio_unit: 10 }])
        : json([{ item_key: "sin-origen" }])
    );

    const state = await store.read(QUOTE);
    expect(state.manual).toHaveLength(1);
    expect(state.decided).toEqual({});
  });

  it("no viaja a la base con un id que no es persistible", async () => {
    const { calls, store } = storeWith(() => json([]));
    const state = await store.read("synthetic-preview-quote");
    expect(calls).toHaveLength(0);
    expect(state).toEqual({ manual: [], decided: {}, postulantes: [] });
  });
});

describe("escrituras", () => {
  const draft = {
    batchId: "rubro-1",
    name: "Sellador",
    tipo: "material" as const,
    cantidad: 3,
    unidad: "u",
    precioUnit: 9000,
  };

  it("manda el alta con los nombres de columna de la base", async () => {
    const { calls, store } = storeWith(() =>
      json([
        {
          id: "nuevo",
          rubro_id: "rubro-1",
          nombre: "Sellador",
          tipo: "material",
          cantidad: 3,
          unidad: "u",
          precio_unit: 9000,
        },
      ])
    );

    const created = await store.addManualItem(QUOTE, draft);

    expect(created.id).toBe("nuevo");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      cotizacion_id: QUOTE,
      rubro_id: "rubro-1",
      nombre: "Sellador",
      tipo: "material",
      cantidad: 3,
      unidad: "u",
      precio_unit: 9000,
    });
  });

  it("guarda la decisión como upsert: el último criterio manda", async () => {
    const { calls, store } = storeWith(() =>
      json([
        {
          item_key: "rubro-1:Adhesivo",
          origen: "internet",
          valor: null,
          decidido_at: "2026-08-16T19:00:00.000Z",
        },
      ])
    );

    const decision = await store.saveDecision(QUOTE, "rubro-1:Adhesivo", "internet", null);

    expect(decision).toEqual({
      origin: "internet",
      value: null,
      at: "2026-08-16T19:00:00.000Z",
    });
    expect(String(calls[0].init.headers && (calls[0].init.headers as Record<string, string>).Prefer)).toContain(
      "merge-duplicates"
    );
  });

  it("reabrir borra la fila acotada a esa cotización", async () => {
    const { calls, store } = storeWith(() => new Response(null, { status: 204 }));
    await store.clearDecision(QUOTE, "rubro-1:Adhesivo");
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toContain(`cotizacion_id=eq.${QUOTE}`);
    expect(calls[0].url).toContain("item_key=eq.rubro-1%3AAdhesivo");
  });

  it("no escribe contra un id que no es persistible", async () => {
    const { calls, store } = storeWith(() => json([]));
    await expect(store.addManualItem("synthetic-preview-quote", draft)).rejects.toMatchObject({
      code: "not_persistable",
    });
    expect(calls).toHaveLength(0);
  });

  it("traduce el rechazo de la base a un error del dominio", async () => {
    const { store } = storeWith(() => json({ message: "violates foreign key" }, 409));
    await expect(store.addManualItem(QUOTE, draft)).rejects.toBeInstanceOf(TallerError);
  });
});

describe("configuración", () => {
  it("falla cerrado si no hay base configurada", async () => {
    const store = createTallerStore({ url: "", serviceKey: "", fetchImpl: async () => json([]) });
    await expect(store.read(QUOTE)).rejects.toMatchObject({ code: "configuration_error" });
  });
});

describe("parseTallerState", () => {
  it("filtra lo ilegible del payload que llega al navegador", () => {
    const state = parseTallerState({
      manual: [
        { id: "a", batchId: "r", name: "n", tipo: "material", cantidad: 2, unidad: "u", precioUnit: 100 },
        { id: "b" },
      ],
      decided: {
        ok: { origin: "eze", value: 10, at: "2026-08-16T00:00:00.000Z" },
        roto: { origin: "eze" },
      },
    });

    expect(state.manual).toHaveLength(1);
    expect(Object.keys(state.decided)).toEqual(["ok"]);
    expect(manualTotal(state.manual)).toBe(200);
  });
});
