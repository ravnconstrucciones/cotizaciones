import { describe, expect, it, vi } from "vitest";
import type { CotizacionRow, Desglose } from "../../../../src/lib/cotizador/tipos";
import {
  QuoteReadError,
  createAppRavnReadAdapter,
} from "./app-ravn-read-adapter";

const DETAIL: CotizacionRow = {
  id: "active id",
  creado_at: "2026-08-15T10:00:00.000Z",
  trabajo_id: null,
  titulo: "Baño",
  zona: "Nordelta",
  estado: "en_revision",
  receta_id: "recipe-1",
  ficha: { trabajo: "Baño", parametros: {} },
  desglose: {
    receta_nombre: "bano",
    receta_version: 1,
    parametros: {},
    items: [],
    extras: [],
    totales: {
      materiales_min: 0,
      materiales_max: 0,
      mano_de_obra_min: 0,
      mano_de_obra_max: 0,
      extras_min: 0,
      extras_max: 0,
      subtotal_min: 0,
      subtotal_max: 0,
      imprevistos_pct: 0,
      factor_zona_min: 1,
      factor_zona_max: 1,
      total_min: 0,
      total_max: 0,
    },
    tiempo: { dias_min: 0, dias_max: 0, cuadrilla_max: 0 },
    generado_at: "2026-08-15T09:00:00.000Z",
  },
  total_min: 0,
  total_max: 0,
  precio_propuesta: null,
  revision: { checklist: [], sanidad: [], precios_vencidos: [], divergencias: [], dudas: [] },
  motivo_rechazo: null,
  presupuesto_id: null,
  foto_portada_path: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("App RAVN read adapter", () => {
  it("rejects plaintext remote URLs before a secret can be sent", () => {
    expect(() =>
      createAppRavnReadAdapter({
        baseUrl: "http://app.example.test",
        readSecret: "secret",
        fetchImpl: vi.fn<typeof fetch>(),
      })
    ).toThrowError(QuoteReadError);

    expect(() =>
      createAppRavnReadAdapter({
        baseUrl: "http://127.0.0.1:3000",
        readSecret: "secret",
        fetchImpl: vi.fn<typeof fetch>(),
      })
    ).not.toThrow();
  });

  it("uses GET, no-store, the read-only header and the explicitly selected id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/cotizaciones")) {
        return json({
          cotizaciones: [
            {
              id: "active id",
              creado_at: DETAIL.creado_at,
              titulo: DETAIL.titulo,
              zona: DETAIL.zona,
              estado: DETAIL.estado,
              total_min: 0,
              total_max: 0,
              precio_propuesta: null,
            },
          ],
        });
      }
      if (url.endsWith("/api/cotizaciones/active%20id")) return json({ cotizacion: DETAIL });
      if (url.endsWith("/api/cotizaciones/active%20id/mensajes")) {
        return json({
          mensajes: [
            {
              id: "m-1",
              fecha: "2026-08-15T11:00:00.000Z",
              autor: "fable",
              texto: "Encontré evidencia.",
              etiqueta: "busqueda",
            },
            { id: 4, autor: "inventado" },
          ],
          motor_conectado: true,
        });
      }
      return json({ error: "unexpected" }, 500);
    });
    const adapter = createAppRavnReadAdapter({
      baseUrl: "https://app.example.test/",
      readSecret: "top-secret",
      fetchImpl,
      timeoutMs: 5_000,
    });

    const loaded = await adapter.loadQuoteWorkspace("active id");

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
      const headers = new Headers(init?.headers);
      expect(headers.get("x-ravn-cotizador-read")).toBe("top-secret");
      expect(headers.get("x-ravn-agente")).toBeNull();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(loaded.quotes).toHaveLength(1);
    expect(loaded.snapshot.quote.id).toBe("active id");
    expect(loaded.snapshot.events.filter((event) => event.type === "message")).toHaveLength(1);
    expect(loaded.snapshot.roles[0]).toMatchObject({
      id: "fable",
      status: "persisted_evidence",
      connection: "shared_bridge_fresh",
    });
  });

  it("chooses the latest active quote rather than a newer rejected quote", async () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/api/cotizaciones")) {
        return json({
          cotizaciones: [
            {
              id: "rejected-new",
              creado_at: "2026-08-15T12:00:00.000Z",
              titulo: "Rechazada",
              zona: null,
              estado: "rechazada",
              total_min: 1,
              total_max: 2,
              precio_propuesta: null,
            },
            {
              id: "active id",
              creado_at: "2026-08-15T10:00:00.000Z",
              titulo: "Activa",
              zona: null,
              estado: "en_revision",
              total_min: 0,
              total_max: 0,
              precio_propuesta: null,
            },
          ],
        });
      }
      if (url.endsWith("/mensajes")) return json({ mensajes: [], motor_conectado: false });
      return json({ cotizacion: DETAIL });
    });
    const adapter = createAppRavnReadAdapter({
      baseUrl: "https://app.example.test",
      readSecret: "secret",
      fetchImpl,
    });

    await adapter.loadQuoteWorkspace();

    expect(requested.some((url) => url.includes("rejected-new/mensajes"))).toBe(false);
    expect(requested.some((url) => url.endsWith("/api/cotizaciones/active%20id"))).toBe(true);
  });

  it("adds an explicitly loaded quote to the picker when it is outside the list page", async () => {
    const explicit = { ...DETAIL, id: "historic-id", estado: "rechazada" as const };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/cotizaciones")) {
        return json({
          cotizaciones: [
            {
              id: DETAIL.id,
              creado_at: DETAIL.creado_at,
              titulo: DETAIL.titulo,
              zona: DETAIL.zona,
              estado: DETAIL.estado,
              total_min: DETAIL.total_min,
              total_max: DETAIL.total_max,
              precio_propuesta: DETAIL.precio_propuesta,
            },
          ],
        });
      }
      if (url.endsWith("/mensajes")) return json({ mensajes: [], motor_conectado: false });
      return json({ cotizacion: explicit });
    });
    const adapter = createAppRavnReadAdapter({
      baseUrl: "https://app.example.test",
      readSecret: "secret",
      fetchImpl,
    });

    const loaded = await adapter.loadQuoteWorkspace("historic-id");

    expect(loaded.snapshot.quote.id).toBe("historic-id");
    expect(loaded.quotes.map((quote) => quote.id)).toEqual(["active id", "historic-id"]);
  });

  it("rejects blank source evidence instead of counting it as coverage", async () => {
    const invalidDetail: CotizacionRow = {
      ...DETAIL,
      desglose: {
        ...(DETAIL.desglose as Desglose),
        items: [
          {
            nombre: "Adhesivo",
            etapa: "Pisos",
            tipo: "material",
            unidad: "bolsa",
            formula: "1",
            cantidad_base: 1,
            desperdicio_pct: 0,
            cantidad: 1,
            precios: {
              internet: { valor: 100, fuente: "", fecha: "" },
            },
            precio_min: 100,
            precio_max: 100,
            subtotal_min: 100,
            subtotal_max: 100,
            divergencia_pct: null,
            sin_precio: false,
          },
        ],
      },
    };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/cotizaciones")) {
        return json({
          cotizaciones: [
            {
              id: DETAIL.id,
              creado_at: DETAIL.creado_at,
              titulo: DETAIL.titulo,
              zona: DETAIL.zona,
              estado: DETAIL.estado,
              total_min: DETAIL.total_min,
              total_max: DETAIL.total_max,
              precio_propuesta: DETAIL.precio_propuesta,
            },
          ],
        });
      }
      if (url.endsWith("/mensajes")) return json({ mensajes: [], motor_conectado: false });
      return json({ cotizacion: invalidDetail });
    });
    const adapter = createAppRavnReadAdapter({
      baseUrl: "https://app.example.test",
      readSecret: "secret",
      fetchImpl,
    });

    const caught = await adapter.loadQuoteWorkspace().catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(QuoteReadError);
    expect((caught as QuoteReadError).code).toBe("invalid_response");
  });

  it("rejects an extra with blank source metadata instead of emitting fake evidence", async () => {
    const invalidDetail: CotizacionRow = {
      ...DETAIL,
      desglose: {
        ...(DETAIL.desglose as Desglose),
        extras: [
          { nombre: "Flete", monto_min: 100, monto_max: 120, fuente: " ", fecha: "" },
        ],
      },
    };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/cotizaciones")) {
        return json({
          cotizaciones: [
            {
              id: DETAIL.id,
              creado_at: DETAIL.creado_at,
              titulo: DETAIL.titulo,
              zona: DETAIL.zona,
              estado: DETAIL.estado,
              total_min: DETAIL.total_min,
              total_max: DETAIL.total_max,
              precio_propuesta: DETAIL.precio_propuesta,
            },
          ],
        });
      }
      if (url.endsWith("/mensajes")) return json({ mensajes: [], motor_conectado: false });
      return json({ cotizacion: invalidDetail });
    });
    const adapter = createAppRavnReadAdapter({
      baseUrl: "https://app.example.test",
      readSecret: "secret",
      fetchImpl,
    });

    const caught = await adapter.loadQuoteWorkspace().catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(QuoteReadError);
    expect((caught as QuoteReadError).code).toBe("invalid_response");
  });

  it("returns safe read errors without leaking the secret or upstream response", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({ error: "database exploded; token=do-not-leak" }, 500)
    );
    const adapter = createAppRavnReadAdapter({
      baseUrl: "https://app.example.test",
      readSecret: "do-not-leak",
      fetchImpl,
    });

    const caught = await adapter.loadQuoteWorkspace().catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(QuoteReadError);
    expect(String(caught)).not.toContain("do-not-leak");
    expect(String(caught)).not.toContain("database exploded");
    expect((caught as QuoteReadError).code).toBe("upstream_error");
  });

  it.each([{ desglose: { items: [] } }])(
    "rejects partial legacy JSON safely instead of throwing a TypeError",
    async (partial) => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/cotizaciones")) {
        return json({
          cotizaciones: [
            {
              id: DETAIL.id,
              creado_at: DETAIL.creado_at,
              titulo: DETAIL.titulo,
              zona: DETAIL.zona,
              estado: DETAIL.estado,
              total_min: DETAIL.total_min,
              total_max: DETAIL.total_max,
              precio_propuesta: DETAIL.precio_propuesta,
            },
          ],
        });
      }
      if (url.endsWith("/mensajes")) return json({ mensajes: [], motor_conectado: false });
      return json({ cotizacion: { ...DETAIL, ...partial } });
    });
    const adapter = createAppRavnReadAdapter({
      baseUrl: "https://app.example.test",
      readSecret: "secret",
      fetchImpl,
    });

      const caught = await adapter.loadQuoteWorkspace().catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(QuoteReadError);
      expect((caught as QuoteReadError).code).toBe("invalid_response");
    }
  );

  /**
   * En la base conviven dos formas de `revision`: la del motor de recetas y una
   * de investigación en curso (`{dudas, estado, evidencia_fuente, …}`). La
   * revisión es metadata OPCIONAL — exigir una sola forma hacía ilegible el
   * expediente entero (el Garage de Glorietas no abría por esto). Lo que no se
   * reconoce se degrada a `null`, que aguas abajo ya significa "falta la
   * revisión".
   */
  it.each([
    { revision: { ...DETAIL.revision, checklist: [null] } },
    { revision: { dudas: ["Confirmar el adoquín"], estado: "investigacion_en_curso" } },
  ])("degrada una revisión que no reconoce en vez de tirar la cotización", async (partial) => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/cotizaciones")) {
        return json({
          cotizaciones: [
            {
              id: DETAIL.id,
              creado_at: DETAIL.creado_at,
              titulo: DETAIL.titulo,
              zona: DETAIL.zona,
              estado: DETAIL.estado,
              total_min: DETAIL.total_min,
              total_max: DETAIL.total_max,
              precio_propuesta: DETAIL.precio_propuesta,
            },
          ],
        });
      }
      if (url.endsWith("/mensajes")) return json({ mensajes: [], motor_conectado: false });
      return json({ cotizacion: { ...DETAIL, ...partial } });
    });

    const result = await createAppRavnReadAdapter({
      baseUrl: "https://app.example.test",
      readSecret: "secret",
      fetchImpl,
    }).loadQuoteWorkspace();

    expect(result.snapshot.quote.id).toBe(DETAIL.id);
  });
});
