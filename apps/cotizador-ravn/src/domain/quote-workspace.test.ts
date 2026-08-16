import { describe, expect, it } from "vitest";
import type { CotizacionRow, ItemDesglose, Revision } from "../../../../src/lib/cotizador/tipos";
import { projectQuoteWorkspace, type MensajeHilo } from "./quote-workspace";

const BASE_ITEM: ItemDesglose = {
  nombre: "Adhesivo cementicio",
  etapa: "Pisos",
  tipo: "material",
  unidad: "bolsa",
  formula: "1",
  cantidad_base: 1,
  desperdicio_pct: 0,
  cantidad: 1,
  precios: {
    sismat: { valor: 100, fuente: "SISMAT 05.01", fecha: "2026-08-14" },
    internet: { valor: 120, fuente: "Proveedor local", fecha: "2026-08-15" },
  },
  precio_min: 100,
  precio_max: 120,
  subtotal_min: 100,
  subtotal_max: 120,
  divergencia_pct: 20,
  sin_precio: false,
};

const EMPTY_REVISION: Revision = {
  checklist: [],
  sanidad: [],
  precios_vencidos: [],
  divergencias: [],
  dudas: [],
};

const CLEAN_REVISION: Revision = {
  ...EMPTY_REVISION,
  checklist: [
    { item: BASE_ITEM.nombre, estado: "cubierto", detalle: "Ítem cubierto por la receta." },
  ],
  sanidad: [
    { chequeo: "consumo por m2", estado: "ok", detalle: "Dentro del rango esperado." },
  ],
};

function quote(overrides: Partial<CotizacionRow> = {}): CotizacionRow {
  return {
    id: "quote-1",
    creado_at: "2026-08-15T10:00:00.000Z",
    trabajo_id: null,
    titulo: "Baño principal",
    zona: "Nordelta",
    estado: "en_revision",
    receta_id: "recipe-1",
    ficha: { trabajo: "Reforma de baño", parametros: {} },
    desglose: {
      receta_nombre: "reforma-bano",
      receta_version: 2,
      parametros: {},
      items: [BASE_ITEM],
      extras: [],
      totales: {
        materiales_min: 100,
        materiales_max: 120,
        mano_de_obra_min: 0,
        mano_de_obra_max: 0,
        extras_min: 0,
        extras_max: 0,
        subtotal_min: 100,
        subtotal_max: 120,
        imprevistos_pct: 0,
        factor_zona_min: 1,
        factor_zona_max: 1,
        total_min: 100,
        total_max: 120,
      },
      tiempo: { dias_min: 1, dias_max: 1, cuadrilla_max: 1 },
      generado_at: "2026-08-15T09:00:00.000Z",
    },
    total_min: 100,
    total_max: 120,
    precio_propuesta: null,
    revision: CLEAN_REVISION,
    motivo_rechazo: null,
    presupuesto_id: null,
    foto_portada_path: null,
    ...overrides,
  };
}

describe("projectQuoteWorkspace", () => {
  it("groups only active persisted items by etapa and sums their persisted subtotals", () => {
    const second: ItemDesglose = {
      ...BASE_ITEM,
      nombre: "Pastina",
      precios: {
        retail: { valor: 230, fuente: "Easy", fecha: "2026-08-15" },
        eze: { valor: 200, fuente: "Eze · llamada proveedor", fecha: "2026-08-15" },
      },
      precio_min: 200,
      precio_max: 200,
      subtotal_min: 200,
      subtotal_max: 200,
      divergencia_pct: null,
    };
    const inactive: ItemDesglose = {
      ...BASE_ITEM,
      nombre: "Fuera de alcance",
      etapa: "Pintura",
      activo: false,
      subtotal_min: 999,
      subtotal_max: 999,
    };
    const input = quote({
      desglose: {
        ...quote().desglose,
        items: [BASE_ITEM, second, inactive],
      } as CotizacionRow["desglose"],
    });

    const result = projectQuoteWorkspace({ quote: input });

    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]).toMatchObject({
      etapa: "Pisos",
      itemCount: 2,
      priceRange: { min: 300, max: 320, currency: "ARS", basis: "persisted_item_subtotals" },
      sourceCoverage: { coveredItems: 2, totalItems: 2, percent: 100 },
      confidence: { level: "alta" },
      jobState: "not_instrumented",
      currentBlocker: null,
    });
    expect(result.batches[0].evidence.map((entry) => entry.origin)).toEqual([
      "sismat",
      "internet",
      "retail",
      "eze",
    ]);
  });

  it("projects labor/material split, item detail and persisted cost composition", () => {
    const labour: ItemDesglose = {
      ...BASE_ITEM,
      nombre: "Colocación",
      tipo: "mano_de_obra",
      unidad: "m2",
      cantidad: 10,
      precios: {
        eze: { valor: 30, fuente: "Eze · cuadrilla", fecha: "2026-08-15" },
      },
      precio_min: 30,
      precio_max: 30,
      subtotal_min: 300,
      subtotal_max: 300,
      divergencia_pct: null,
    };
    const singleSource: ItemDesglose = {
      ...BASE_ITEM,
      nombre: "Pastina",
      precios: {
        sismat: { valor: 50, fuente: "SISMAT 05.02", fecha: "2026-08-14" },
      },
      precio_min: 50,
      precio_max: 50,
      subtotal_min: 50,
      subtotal_max: 50,
      divergencia_pct: null,
    };
    const input = quote({
      desglose: {
        ...quote().desglose,
        items: [BASE_ITEM, labour, singleSource],
      } as CotizacionRow["desglose"],
    });

    const result = projectQuoteWorkspace({ quote: input });

    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].laborRange).toMatchObject({ min: 300, max: 300 });
    expect(result.batches[0].materialsRange).toMatchObject({ min: 150, max: 170 });
    expect(result.batches[0].items).toEqual([
      expect.objectContaining({
        name: BASE_ITEM.nombre,
        tipo: "material",
        priced: true,
        origins: ["sismat", "internet"],
        corroborated: true,
        manual: false,
      }),
      expect.objectContaining({
        name: "Colocación",
        tipo: "mano_de_obra",
        cantidad: 10,
        unidad: "m2",
        subtotalMin: 300,
        subtotalMax: 300,
        origins: ["eze"],
        corroborated: true,
      }),
      expect.objectContaining({
        name: "Pastina",
        origins: ["sismat"],
        corroborated: false,
      }),
    ]);
    expect(result.core.composition).toEqual({
      laborMin: 0,
      laborMax: 0,
      materialsMin: 100,
      materialsMax: 120,
      extrasMin: 0,
      extrasMax: 0,
      subtotalMin: 100,
      subtotalMax: 120,
      imprevistosPct: 0,
      factorZonaMin: 1,
      factorZonaMax: 1,
      basis: "persisted_desglose_totales",
    });
  });

  it("returns a null composition when the quote persists no desglose totals", () => {
    const result = projectQuoteWorkspace({
      quote: quote({ desglose: {}, receta_id: null, total_min: null, total_max: null }),
    });
    expect(result.core.composition).toBeNull();
  });

  it("exposes every required blocker without inferring margin approval", () => {
    const missing: ItemDesglose = {
      ...BASE_ITEM,
      nombre: "Grifería",
      precios: {},
      precio_min: null,
      precio_max: null,
      subtotal_min: 0,
      subtotal_max: 0,
      divergencia_pct: null,
      sin_precio: true,
    };
    const revision: Revision = {
      ...CLEAN_REVISION,
      precios_vencidos: [
        { item: "Grifería", fuente: "Lista vieja", fecha: "2026-06-01", dias: 75, limite: 15 },
      ],
      divergencias: [
        {
          item: "Grifería",
          sismat: 10,
          internet: 25,
          divergencia_pct: 150,
          nivel: "critica",
          fuente_sismat: "SISMAT",
          fuente_internet: "Proveedor",
        },
      ],
      dudas: ["Confirmar modelo de grifería"],
      aprobacion: { fecha: "2026-08-15", importe_final: 500 },
    };
    const input = quote({
      receta_id: null,
      precio_propuesta: null,
      revision,
      desglose: {
        ...quote().desglose,
        receta_nombre: "",
        items: [missing],
      } as CotizacionRow["desglose"],
    });

    const result = projectQuoteWorkspace({ quote: input });

    expect(result.core.blockers.map((blocker) => blocker.code)).toEqual([
      "no_recipe",
      "missing_prices",
      "stale_prices",
      "critical_divergences",
      "open_doubts",
      "missing_final_number",
      "margin_approval_unavailable",
    ]);
    expect(result.gates.proposalPrep.locked).toBe(true);
    expect(result.gates.appHandoff.locked).toBe(true);
    expect(result.decision.requiresEzeAnswer).toBe(true);
  });

  it("reports no-items separately for an empty legacy desglose", () => {
    const result = projectQuoteWorkspace({
      quote: quote({ desglose: {}, receta_id: null, total_min: null, total_max: null }),
    });

    expect(result.core.blockers.map((blocker) => blocker.code)).toEqual([
      "no_recipe",
      "no_items",
      "missing_final_number",
      "margin_approval_unavailable",
    ]);
    expect(result.core.confidence.level).toBe("sin_calcular");
    expect(result.core.costRange).toEqual({
      min: null,
      max: null,
      currency: "ARS",
      basis: "legacy_persisted_totals",
    });
  });

  it("keeps proposal, handoff, dispatch and credit budget locked even for a legacy approved row", () => {
    const result = projectQuoteWorkspace({
      quote: quote({ estado: "aprobada", precio_propuesta: 900, presupuesto_id: "budget-1" }),
      bridgeConnected: true,
    });

    expect(result.budget).toEqual({
      configured: false,
      taskCap: null,
      used: null,
      reserved: null,
      dispatchEnabled: false,
      dispatchDisabledReason: "No hay presupuesto de tareas ni despachador configurado en este v1 de solo lectura.",
      queued: null,
      running: null,
    });
    expect(result.gates.proposalPrep).toMatchObject({ locked: true });
    expect(result.gates.appHandoff).toMatchObject({ locked: true });
    expect(result.roles.map((role) => [role.id, role.status, role.canDispatch])).toEqual([
      ["fable", "no_persisted_evidence", false],
      ["codex", "no_persisted_evidence", false],
      ["sismat", "evidence_present", false],
      ["deterministic_verifier", "review_present", false],
      ["proposal_prep", "locked", false],
    ]);
    expect(result.roles.map((role) => String(role.id))).not.toContain("fabiola");
    expect(result.roles.slice(0, 2).map((role) => role.connection)).toEqual([
      "shared_bridge_fresh",
      "shared_bridge_fresh",
    ]);
    expect(result.core.blockers.map((blocker) => blocker.code)).toContain(
      "margin_approval_unavailable"
    );
  });

  it("never claims live SISMAT and reports missing persisted evidence explicitly", () => {
    const internetOnly: ItemDesglose = {
      ...BASE_ITEM,
      precios: { internet: BASE_ITEM.precios.internet },
      precio_min: 120,
      precio_max: 120,
      subtotal_min: 120,
      subtotal_max: 120,
      divergencia_pct: null,
    };
    const result = projectQuoteWorkspace({
      quote: quote({
        revision: null,
        desglose: {
          ...quote().desglose,
          items: [internetOnly],
        } as CotizacionRow["desglose"],
      }),
    });

    expect(result.roles.find((role) => role.id === "sismat")).toMatchObject({
      status: "no_evidence",
      connection: "not_applicable",
      canDispatch: false,
    });
    expect(result.roles.find((role) => role.id === "deterministic_verifier")).toMatchObject({
      status: "no_review",
      mode: "read_only",
      canDispatch: false,
    });
    expect(result.roles.find((role) => role.id === "proposal_prep")).toMatchObject({
      status: "locked",
      mode: "locked_gate",
      canDispatch: false,
    });
  });

  it("uses explicit deterministic confidence bases for uncalculated, low and medium batches", () => {
    const noPrice: ItemDesglose = {
      ...BASE_ITEM,
      precios: {},
      precio_min: null,
      precio_max: null,
      subtotal_min: 0,
      subtotal_max: 0,
      sin_precio: true,
    };
    const oneSource: ItemDesglose = {
      ...BASE_ITEM,
      precios: { internet: { valor: 100, fuente: "Proveedor", fecha: "2026-08-15" } },
      precio_min: 100,
      precio_max: 100,
      subtotal_min: 100,
      subtotal_max: 100,
      divergencia_pct: null,
      sin_precio: false,
    };

    const uncalculated = projectQuoteWorkspace({
      quote: quote({
        desglose: { ...quote().desglose, items: [noPrice] } as CotizacionRow["desglose"],
      }),
    });
    const medium = projectQuoteWorkspace({
      quote: quote({
        desglose: { ...quote().desglose, items: [oneSource] } as CotizacionRow["desglose"],
      }),
    });
    const low = projectQuoteWorkspace({
      quote: quote({
        revision: {
          ...CLEAN_REVISION,
          precios_vencidos: [
            { item: oneSource.nombre, fuente: "Proveedor", fecha: "2026-06-01", dias: 75, limite: 15 },
          ],
        },
        desglose: { ...quote().desglose, items: [oneSource] } as CotizacionRow["desglose"],
      }),
    });

    expect(uncalculated.batches[0].confidence).toMatchObject({ level: "sin_calcular" });
    expect(uncalculated.batches[0].confidence.basis).toContain(
      "Ningún ítem tiene una fuente de costo persistida."
    );
    expect(medium.batches[0].confidence).toMatchObject({ level: "media" });
    expect(medium.batches[0].confidence.basis).toContain(
      "Hay cobertura de precio, pero falta corroboración independiente en al menos un ítem."
    );
    expect(low.batches[0].confidence).toMatchObject({ level: "baja" });
    expect(low.batches[0].confidence.basis).toContain("Hay precios persistidos marcados como vencidos.");
  });

  it("builds the event console only from creation, persisted evidence and actual messages", () => {
    const messages: MensajeHilo[] = [
      {
        id: "m-1",
        fecha: "2026-08-15T11:00:00.000Z",
        autor: "eze",
        texto: "Confirmo el metraje.",
        etiqueta: "charla",
      },
    ];

    const result = projectQuoteWorkspace({ quote: quote(), messages });

    expect(result.events.map((event) => event.type)).toEqual([
      "source_evidence",
      "source_evidence",
      "quote_created",
      "message",
    ]);
    expect(result.events.filter((event) => event.type === "message")).toHaveLength(1);
    const eventTypes = result.events.map((event) => String(event.type));
    expect(eventTypes).not.toContain("job_progress");
    expect(eventTypes).not.toContain("blocker_detected");
    expect(result.batches.every((batch) => batch.jobState === "not_instrumented")).toBe(true);
  });

  it("exposes persisted runtime observability and every missing instrumentation surface", () => {
    const result = projectQuoteWorkspace({ quote: quote(), bridgeConnected: true });
    const batchId = result.batches[0].id;

    expect(result.observability.bridge).toEqual({
      process: "puente-cotizador",
      heartbeat: "fresh",
      source: "legacy_motor_conectado",
      perAgentHeartbeat: "not_instrumented",
    });
    expect(result.observability.engine).toEqual({
      kind: "legacy_deterministic",
      execution: "not_observed",
      persistedOutputAt: "2026-08-15T09:00:00.000Z",
      processRunId: null,
    });
    expect(result.observability.sources.find((source) => source.origin === "sismat")).toEqual({
      origin: "sismat",
      evidenceCount: 1,
      affectedBatchIds: [batchId],
    });
    expect(result.observability.checks.find((check) => check.id === "stale_prices")).toEqual({
      id: "stale_prices",
      status: "persisted",
      persistedCount: 0,
      affectedBatchIds: [],
      findings: [],
    });
    expect(result.observability.instrumentationGaps).toEqual([
      "per_agent_heartbeat",
      "job_runtime",
      "queue_runtime",
      "credit_budget",
      "deterministic_process_run",
    ]);
  });

  it("links persisted checks to a batch even when the affected item has no source evidence", () => {
    const missing: ItemDesglose = {
      ...BASE_ITEM,
      nombre: "Grifería sin definir",
      precios: {},
      precio_min: null,
      precio_max: null,
      subtotal_min: 0,
      subtotal_max: 0,
      divergencia_pct: null,
      sin_precio: true,
    };
    const result = projectQuoteWorkspace({
      quote: quote({
        revision: {
          ...CLEAN_REVISION,
          precios_vencidos: [
            {
              item: "Grifería sin definir",
              fuente: "Lista previa",
              fecha: "2026-06-01",
              dias: 75,
              limite: 15,
            },
          ],
        },
        desglose: {
          ...quote().desglose,
          items: [missing],
        } as CotizacionRow["desglose"],
      }),
    });

    expect(
      result.observability.checks.find((check) => check.id === "stale_prices")
        ?.affectedBatchIds
    ).toEqual([result.batches[0].id]);
  });

  it("counts persisted extras as global source evidence without assigning a fake batch", () => {
    const result = projectQuoteWorkspace({
      quote: quote({
        desglose: {
          ...quote().desglose,
          extras: [
            {
              nombre: "Flete",
              monto_min: 50,
              monto_max: 60,
              fuente: "Proveedor logístico",
              fecha: "2026-08-15",
            },
          ],
        } as CotizacionRow["desglose"],
      }),
    });

    expect(result.observability.sources.find((source) => source.origin === "extra")).toEqual({
      origin: "extra",
      evidenceCount: 1,
      affectedBatchIds: [],
    });
  });

  it("derives orchestration awaiting-Eze from the same questions shown in decision output", () => {
    const active = projectQuoteWorkspace({ quote: quote() });
    const rejected = projectQuoteWorkspace({
      quote: quote({ estado: "rechazada", precio_propuesta: null }),
    });

    expect(active.decision.requiresEzeAnswer).toBe(true);
    expect(active.orchestration.awaitingEze).toBe(true);
    expect(active.decision.questions).toEqual([
      "¿Cuál es el número final aprobado para esta cotización?",
      "¿Cuál es el margen aprobado por Eze para habilitar la propuesta?",
    ]);
    expect(rejected.decision.questions).toEqual([]);
    expect(rejected.decision.requiresEzeAnswer).toBe(false);
    expect(rejected.orchestration.awaitingEze).toBe(false);
  });

  it("keeps jobs and queue counts unknown when no runtime contract exists", () => {
    const result = projectQuoteWorkspace({ quote: quote() });

    expect(result.batches[0].jobState).toBe("not_instrumented");
    expect(result.jobs).toBeNull();
    expect(result.budget.queued).toBeNull();
    expect(result.budget.running).toBeNull();
  });

  it("blocks cost readiness and every batch when deterministic revision is absent", () => {
    const result = projectQuoteWorkspace({ quote: quote({ revision: null }) });

    expect(result.core.blockers.map((blocker) => blocker.code)).toContain("missing_revision");
    expect(result.core.confidence.level).toBe("baja");
    expect(result.decision.readyForCostDecision).toBe(false);
    expect(result.batches[0].currentBlocker).toBe(
      "No hay revisión determinística persistida para este rubro."
    );
    expect(result.batches[0].confidence.basis).toContain(
      "No hay revisión determinística persistida."
    );
  });

  it("treats empty mandatory checklist and sanity outputs as an incomplete review", () => {
    const result = projectQuoteWorkspace({ quote: quote({ revision: EMPTY_REVISION }) });

    expect(result.core.blockers.map((blocker) => blocker.code)).toContain(
      "missing_review_outputs"
    );
    expect(result.decision.readyForCostDecision).toBe(false);
    expect(result.roles.find((role) => role.id === "deterministic_verifier")).toMatchObject({
      status: "review_incomplete",
    });
    expect(result.observability.checks.find((check) => check.id === "checklist")?.status).toBe(
      "absent"
    );
    expect(result.observability.checks.find((check) => check.id === "sanity")?.status).toBe(
      "absent"
    );
  });

  it("blocks cost readiness on checklist, sanity and noncritical divergence findings", () => {
    const revision: Revision = {
      ...EMPTY_REVISION,
      checklist: [
        { item: BASE_ITEM.nombre, estado: "faltante", detalle: "Falta definir consumo." },
      ],
      sanidad: [
        {
          chequeo: "rendimiento de adhesivo",
          estado: "fuera_de_rango",
          detalle: "El rendimiento no cierra.",
        },
      ],
      divergencias: [
        {
          item: BASE_ITEM.nombre,
          sismat: 100,
          internet: 140,
          divergencia_pct: 40,
          nivel: "marca",
          fuente_sismat: "SISMAT",
          fuente_internet: "Proveedor",
        },
      ],
    };

    const result = projectQuoteWorkspace({ quote: quote({ revision }) });

    expect(result.core.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(["incomplete_checklist", "sanity_issues", "source_divergences"])
    );
    expect(result.core.confidence.level).toBe("baja");
    expect(result.decision.readyForCostDecision).toBe(false);
    expect(result.batches[0].blockers).toEqual(
      expect.arrayContaining([
        "1 requisito(s) del checklist siguen faltantes.",
        "1 divergencia(s) de fuente requieren revisión.",
      ])
    );
  });

  it("blocks the affected batch when sanity alone reports an item issue", () => {
    const revision: Revision = {
      ...CLEAN_REVISION,
      sanidad: [
        {
          chequeo: `rendimiento: ${BASE_ITEM.nombre}`,
          estado: "fuera_de_rango",
          detalle: "El rendimiento físico no cierra.",
        },
      ],
    };

    const result = projectQuoteWorkspace({ quote: quote({ revision }) });
    const sanity = result.observability.checks.find((check) => check.id === "sanity");

    expect(result.batches[0].confidence.level).toBe("baja");
    expect(result.batches[0].currentBlocker).toBe(
      "1 chequeo(s) de sanidad están fuera de rango o sin datos."
    );
    expect(sanity?.affectedBatchIds).toEqual([result.batches[0].id]);
  });

  it("treats a global price-per-m2 sanity issue as affecting every batch", () => {
    const labour: ItemDesglose = {
      ...BASE_ITEM,
      nombre: "Colocación",
      etapa: "Mano de obra",
      tipo: "mano_de_obra",
    };
    const revision: Revision = {
      ...CLEAN_REVISION,
      sanidad: [
        {
          chequeo: "precio por m2",
          estado: "sin_datos",
          detalle: "Falta la banda de mercado.",
        },
      ],
    };
    const input = quote({
      revision,
      desglose: {
        ...quote().desglose,
        items: [BASE_ITEM, labour],
      } as CotizacionRow["desglose"],
    });

    const result = projectQuoteWorkspace({ quote: input });
    const sanity = result.observability.checks.find((check) => check.id === "sanity");

    expect(result.batches.every((batch) => batch.currentBlocker != null)).toBe(true);
    expect(sanity?.affectedBatchIds).toEqual(result.batches.map((batch) => batch.id));
  });

  it("exposes the exact persisted state and detail of deterministic checks", () => {
    const revision: Revision = {
      ...EMPTY_REVISION,
      checklist: [
        { item: BASE_ITEM.nombre, estado: "faltante", detalle: "Falta definir consumo." },
      ],
      sanidad: [
        {
          chequeo: "rendimiento de adhesivo",
          estado: "sin_datos",
          detalle: "No hay superficie cargada.",
        },
      ],
    };
    const result = projectQuoteWorkspace({ quote: quote({ revision }) });
    const checklist = result.observability.checks.find((check) => check.id === "checklist") as
      | ({ findings?: Array<{ subject: string; state: string; detail: string }> })
      | undefined;
    const sanity = result.observability.checks.find((check) => check.id === "sanity") as
      | ({ findings?: Array<{ subject: string; state: string; detail: string }> })
      | undefined;

    expect(checklist?.findings).toEqual([
      {
        subject: "Adhesivo cementicio",
        state: "faltante",
        detail: "Falta definir consumo.",
      },
    ]);
    expect(sanity?.findings).toEqual([
      {
        subject: "rendimiento de adhesivo",
        state: "sin_datos",
        detail: "No hay superficie cargada.",
      },
    ]);
  });
});
