import { describe, expect, it } from "vitest";
import { DECIDED_KEY, MANUAL_KEY, localTaller, remoteTaller } from "./persistence";

const QUOTE = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

const DRAFT = {
  batchId: "rubro-1",
  name: "Sellador",
  tipo: "material" as const,
  cantidad: 3,
  unidad: "u",
  precioUnit: 9000,
};

function fakeStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("localTaller", () => {
  it("da de alta, lee y saca un ítem a mano", async () => {
    const storage = fakeStorage();
    const taller = localTaller(storage);

    const created = await taller.addManual(QUOTE, DRAFT);
    expect((await taller.load(QUOTE)).manual).toEqual([created]);

    await taller.dropManual(QUOTE, created.id);
    expect((await taller.load(QUOTE)).manual).toEqual([]);
  });

  it("cierra y reabre una decisión", async () => {
    const storage = fakeStorage();
    const taller = localTaller(storage);

    const decision = await taller.decide(QUOTE, "rubro-1:Adhesivo", "sismat", 18200);
    expect(decision.origin).toBe("sismat");
    expect((await taller.load(QUOTE)).decided["rubro-1:Adhesivo"]).toEqual(decision);

    await taller.reopen(QUOTE, "rubro-1:Adhesivo");
    expect((await taller.load(QUOTE)).decided).toEqual({});
  });

  it("lee lo que ya había guardado el visor con las claves viejas", async () => {
    const storage = fakeStorage({
      [MANUAL_KEY(QUOTE)]: JSON.stringify([{ id: "viejo", ...DRAFT }]),
      [DECIDED_KEY(QUOTE)]: JSON.stringify({
        "rubro-1:X": { origin: "eze", value: 1000, at: "2026-08-16T00:00:00.000Z" },
      }),
    });

    const state = await localTaller(storage).load(QUOTE);
    expect(state.manual[0].id).toBe("viejo");
    expect(state.decided["rubro-1:X"].origin).toBe("eze");
  });

  it("aguanta un localStorage con basura sin romper la mesa", async () => {
    const storage = fakeStorage({ [MANUAL_KEY(QUOTE)]: "{no es json" });
    expect(await localTaller(storage).load(QUOTE)).toEqual({ manual: [], decided: {} });
  });
});

describe("remoteTaller", () => {
  function stub(responder: (url: string, init?: RequestInit) => Response) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return responder(String(input), init);
    }) as typeof fetch;
    return { calls, taller: remoteTaller(fetchImpl) };
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("pide la mesa de la cotización que está abierta", async () => {
    const { calls, taller } = stub(() => json({ manual: [], decided: {} }));
    await taller.load(QUOTE);
    expect(calls[0].url).toBe(`/api/taller?quote=${QUOTE}`);
  });

  it("manda el alta y devuelve el ítem con el id de la base", async () => {
    const { calls, taller } = stub(() => json({ id: "de-la-base", ...DRAFT }, 201));
    const created = await taller.addManual(QUOTE, DRAFT);

    expect(created.id).toBe("de-la-base");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(DRAFT);
  });

  it("propaga el mensaje de la ruta cuando la escritura no entra", async () => {
    const { taller } = stub(() => json({ error: "La base rechazó la operación (409)." }, 409));
    await expect(taller.addManual(QUOTE, DRAFT)).rejects.toThrow("La base rechazó la operación");
  });

  it("reabre borrando la decisión por su clave", async () => {
    const { calls, taller } = stub(() => json({ ok: true }));
    await taller.reopen(QUOTE, "rubro-1:Adhesivo");
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toContain("item=rubro-1%3AAdhesivo");
  });
});
