import { describe, expect, it, vi } from "vitest";
import { createIntakeStore } from "./intake-store";

const ID = "3718c02c-4c36-452c-bae9-48b972935289";

function storeCon(respuesta: { status?: number; body?: unknown }) {
  const fetchImpl = vi.fn(async () =>
    new Response(JSON.stringify(respuesta.body ?? []), {
      status: respuesta.status ?? 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  const store = createIntakeStore({
    url: "https://base.supabase.co",
    serviceKey: "service-key",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { store, fetchImpl };
}

describe("intakeStore", () => {
  it("crear hace upsert idempotente con el service role", async () => {
    const { store, fetchImpl } = storeCon({ body: [{ cotizacion_id: ID }] });
    await store.crear(ID, "texto de Eze");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/rest/v1/cotizador_intake?on_conflict=cotizacion_id");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Prefer).toContain("merge-duplicates");
    expect((init.headers as Record<string, string>).apikey).toBe("service-key");
    expect(JSON.parse(String(init.body))).toEqual({
      cotizacion_id: ID,
      texto: "texto de Eze",
      estado: "esperando_ola",
    });
  });

  it("leer devuelve la fila normalizada o null", async () => {
    const fila = {
      cotizacion_id: ID,
      estado: "propuesta_lista",
      texto: null,
      propuesta: { titulo: "x" },
      error: null,
      actualizado_at: "2026-08-17T12:00:00Z",
    };
    const { store } = storeCon({ body: [fila] });
    expect(await store.leer(ID)).toEqual(fila);

    const { store: vacio } = storeCon({ body: [] });
    expect(await vacio.leer(ID)).toBeNull();
  });

  it("leer sobre el preview (id no persistible) devuelve null sin tocar la red", async () => {
    const { store, fetchImpl } = storeCon({ body: [] });
    expect(await store.leer("preview")).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("relanzar con 0 filas afectadas es error, nunca éxito fantasma", async () => {
    const { store } = storeCon({ body: [] });
    await expect(store.relanzar(ID)).rejects.toThrow(/no existe/);
  });

  it("marcarConfirmada patchea el estado y verifica filas", async () => {
    const { store, fetchImpl } = storeCon({ body: [{ cotizacion_id: ID }] });
    await store.marcarConfirmada(ID);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`cotizacion_id=eq.${ID}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body)).estado).toBe("confirmada");
  });

  it("sin config falla cerrado", async () => {
    const store = createIntakeStore({ url: "", serviceKey: "" });
    await expect(store.leer(ID)).rejects.toThrow(/configurada/);
  });
});
