import type {
  CotizacionRow,
  Desglose,
  EstadoCotizacion,
  ItemDesglose,
  OrigenPrecio,
  PrecioFechado,
  Revision,
  TipoItem,
  Unidad,
} from "../../../../src/lib/cotizador/tipos";

export type AutorMensaje = "eze" | "sistema" | "fable" | "codex";

/** Contrato normalizado que ya expone GET /api/cotizaciones/:id/mensajes. */
export type MensajeHilo = {
  id: string;
  fecha: string;
  autor: AutorMensaje;
  texto: string;
  etiqueta: string;
};

export type QuoteStage =
  | "intake"
  | "cost_review"
  | "legacy_approved"
  | "rejected"
  | "legacy_document_emitted";

export type ConfidenceLevel = "alta" | "media" | "baja" | "sin_calcular";

export type QuoteConfidence = {
  level: ConfidenceLevel;
  basis: string[];
};

export type MoneyRange = {
  min: number | null;
  max: number | null;
  currency: "ARS";
  basis: "legacy_persisted_totals" | "persisted_item_subtotals";
};

export type SourceCoverage = {
  coveredItems: number;
  totalItems: number;
  percent: number;
  basis: string;
};

export type EvidenceOrigin = OrigenPrecio | "extra";

export type QuoteEvidence = {
  id: string;
  item: string;
  origin: EvidenceOrigin;
  source: string;
  date: string;
  value: number;
  persisted: true;
};

export type BatchJobState = "not_instrumented";

/** Detalle persistido de un ítem del rubro, para el alcance expandible. */
export type BatchItem = {
  name: string;
  tipo: TipoItem;
  unidad: Unidad;
  cantidad: number;
  subtotalMin: number;
  subtotalMax: number;
  priced: boolean;
  /** Orígenes de precio persistidos (sismat/internet/retail/eze). */
  origins: OrigenPrecio[];
  /** true = decisión fechada de Eze o doble fuente SISMAT + internet. */
  corroborated: boolean;
  manual: boolean;
};

export type QuoteBatch = {
  id: string;
  etapa: string;
  itemCount: number;
  itemNames: string[];
  items: BatchItem[];
  responsibility: string;
  evidence: QuoteEvidence[];
  priceRange: MoneyRange;
  /** Subtotales persistidos solo de mano de obra del rubro. */
  laborRange: MoneyRange;
  /** Subtotales persistidos solo de materiales del rubro. */
  materialsRange: MoneyRange;
  sourceCoverage: SourceCoverage;
  confidence: QuoteConfidence;
  blockers: string[];
  currentBlocker: string | null;
  jobState: BatchJobState;
};

/** Composición del costo directo tal como la persistió el motor en desglose.totales. */
export type CostComposition = {
  laborMin: number;
  laborMax: number;
  materialsMin: number;
  materialsMax: number;
  extrasMin: number;
  extrasMax: number;
  subtotalMin: number;
  subtotalMax: number;
  imprevistosPct: number;
  factorZonaMin: number;
  factorZonaMax: number;
  basis: "persisted_desglose_totales";
};

export type QuoteBlockerCode =
  | "no_recipe"
  | "no_items"
  | "missing_prices"
  | "missing_revision"
  | "missing_review_outputs"
  | "incomplete_checklist"
  | "sanity_issues"
  | "stale_prices"
  | "source_divergences"
  | "critical_divergences"
  | "open_doubts"
  | "missing_final_number"
  | "margin_approval_unavailable";

export type QuoteBlocker = {
  code: QuoteBlockerCode;
  label: string;
  detail: string;
  severity: "blocking" | "warning";
};

export type QuoteEvent =
  | {
      id: string;
      type: "quote_created";
      occurredAt: string;
      title: string;
      detail: string;
      persisted: true;
    }
  | {
      id: string;
      type: "source_evidence";
      occurredAt: string;
      title: string;
      detail: string;
      persisted: true;
      evidence: QuoteEvidence;
    }
  | {
      id: string;
      type: "message";
      occurredAt: string;
      title: string;
      detail: string;
      persisted: true;
      message: MensajeHilo;
    };

export type QuoteSummary = {
  id: string;
  title: string;
  zone: string | null;
  createdAt: string;
  legacyState: EstadoCotizacion;
  stage: QuoteStage;
  costRange: MoneyRange;
  finalNumber: number | null;
  active: boolean;
};

export type QuoteRole = {
  id: "fable" | "codex" | "sismat" | "deterministic_verifier" | "proposal_prep";
  label: string;
  status:
    | "persisted_evidence"
    | "no_persisted_evidence"
    | "evidence_present"
    | "no_evidence"
    | "review_present"
    | "review_incomplete"
    | "no_review"
    | "locked";
  connection:
    | "shared_bridge_fresh"
    | "shared_bridge_stale_or_absent"
    | "not_queried"
    | "not_applicable";
  mode: "bridge" | "persisted_evidence" | "read_only" | "locked_gate";
  canDispatch: false;
  persistedEvidenceCount: number;
  lastPersistedEvidenceAt: string | null;
  evidence: string;
};

export type QuoteWorkspaceSnapshot = {
  schemaVersion: 1;
  provenance: "app_ravn_readonly" | "synthetic_preview";
  quote: {
    id: string;
    title: string;
    zone: string | null;
    createdAt: string;
    legacyState: EstadoCotizacion;
    finalNumber: number | null;
    linkedBudgetId: string | null;
  };
  core: {
    costRange: MoneyRange;
    sourceCoverage: SourceCoverage;
    stage: QuoteStage;
    confidence: QuoteConfidence;
    blockers: QuoteBlocker[];
    /** null cuando la cotización no persiste desglose.totales. */
    composition: CostComposition | null;
  };
  batches: QuoteBatch[];
  roles: QuoteRole[];
  events: QuoteEvent[];
  jobs: null;
  observability: {
    bridge: {
      process: "puente-cotizador";
      heartbeat: "fresh" | "stale_or_absent" | "not_queried";
      source: "legacy_motor_conectado";
      perAgentHeartbeat: "not_instrumented";
    };
    engine: {
      kind: "legacy_deterministic";
      execution: "not_observed";
      persistedOutputAt: string | null;
      processRunId: null;
    };
    checks: Array<{
      id: "checklist" | "sanity" | "stale_prices" | "divergences" | "open_doubts";
      status: "persisted" | "absent";
      persistedCount: number;
      affectedBatchIds: string[];
      findings: Array<{ subject: string; state: string; detail: string }>;
    }>;
    sources: Array<{
      origin: EvidenceOrigin;
      evidenceCount: number;
      affectedBatchIds: string[];
    }>;
    instrumentationGaps: Array<
      | "per_agent_heartbeat"
      | "job_runtime"
      | "queue_runtime"
      | "credit_budget"
      | "deterministic_process_run"
    >;
  };
  budget: {
    configured: false;
    taskCap: null;
    used: null;
    reserved: null;
    dispatchEnabled: false;
    dispatchDisabledReason: string;
    queued: null;
    running: null;
  };
  orchestration: {
    mode: "read_only_projection";
    parallelEligibleBatchIds: string[];
    blockedBatchIds: string[];
    readyToConsolidateBatchIds: string[];
    awaitingEze: boolean;
  };
  gates: {
    proposalPrep: { locked: true; reasons: QuoteBlockerCode[] };
    appHandoff: { locked: true; reasons: QuoteBlockerCode[] };
  };
  decision: {
    requiresEzeAnswer: boolean;
    questions: string[];
    unverified: string[];
    readyForCostDecision: boolean;
    readyForProposal: false;
  };
};

export type ProjectQuoteWorkspaceInput = {
  quote: CotizacionRow;
  messages?: readonly MensajeHilo[];
  /** Latido real de puente-cotizador que trae el endpoint legacy. */
  bridgeConnected?: boolean | null;
  provenance?: QuoteWorkspaceSnapshot["provenance"];
};

const COVERAGE_BASIS =
  "Ítems activos con precio calculado y al menos una fuente de costo persistida (SISMAT, internet o Eze); retail solo es referencia.";

const DISPATCH_DISABLED_REASON =
  "No hay presupuesto de tareas ni despachador configurado en este v1 de solo lectura.";

const SOURCE_ORDER: OrigenPrecio[] = ["sismat", "internet", "retail", "eze"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asDesglose(value: CotizacionRow["desglose"]): Desglose | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  return value as Desglose;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function persistedCostRange(quote: CotizacionRow, desglose: Desglose | null): MoneyRange {
  const rowHasRange = isFiniteNumber(quote.total_min) && isFiniteNumber(quote.total_max);
  if (rowHasRange) {
    return {
      min: quote.total_min,
      max: quote.total_max,
      currency: "ARS",
      basis: "legacy_persisted_totals",
    };
  }

  const totals = desglose?.totales;
  if (isFiniteNumber(totals?.total_min) && isFiniteNumber(totals?.total_max)) {
    return {
      min: totals.total_min,
      max: totals.total_max,
      currency: "ARS",
      basis: "legacy_persisted_totals",
    };
  }

  return { min: null, max: null, currency: "ARS", basis: "legacy_persisted_totals" };
}

export function stageFromLegacyState(state: EstadoCotizacion): QuoteStage {
  switch (state) {
    case "borrador":
      return "intake";
    case "en_revision":
      return "cost_review";
    case "aprobada":
      return "legacy_approved";
    case "rechazada":
      return "rejected";
    case "documento_emitido":
      return "legacy_document_emitted";
  }
}

export function isActiveLegacyState(state: EstadoCotizacion): boolean {
  return state === "borrador" || state === "en_revision" || state === "aprobada";
}

export function projectQuoteSummary(quote: Pick<
  CotizacionRow,
  "id" | "titulo" | "zona" | "creado_at" | "estado" | "total_min" | "total_max" | "precio_propuesta"
>): QuoteSummary {
  return {
    id: quote.id,
    title: quote.titulo,
    zone: quote.zona,
    createdAt: quote.creado_at,
    legacyState: quote.estado,
    stage: stageFromLegacyState(quote.estado),
    costRange: {
      min: isFiniteNumber(quote.total_min) ? quote.total_min : null,
      max: isFiniteNumber(quote.total_max) ? quote.total_max : null,
      currency: "ARS",
      basis: "legacy_persisted_totals",
    },
    finalNumber: isFiniteNumber(quote.precio_propuesta) ? quote.precio_propuesta : null,
    active: isActiveLegacyState(quote.estado),
  };
}

function hasPersistedCostSource(item: ItemDesglose): boolean {
  return Boolean(item.precios.eze || item.precios.sismat || item.precios.internet);
}

function hasCalculatedPrice(item: ItemDesglose): boolean {
  return (
    item.sin_precio !== true &&
    isFiniteNumber(item.precio_min) &&
    isFiniteNumber(item.precio_max) &&
    hasPersistedCostSource(item)
  );
}

function sourceCoverage(items: readonly ItemDesglose[]): SourceCoverage {
  const coveredItems = items.filter(hasCalculatedPrice).length;
  return {
    coveredItems,
    totalItems: items.length,
    percent: items.length === 0 ? 0 : Math.round((coveredItems / items.length) * 100),
    basis: COVERAGE_BASIS,
  };
}

function evidenceId(etapa: string, itemIndex: number, origin: EvidenceOrigin): string {
  return `evidence:${encodeURIComponent(etapa)}:${itemIndex}:${origin}`;
}

function evidenceFromPrice(args: {
  etapa: string;
  item: ItemDesglose;
  itemIndex: number;
  origin: OrigenPrecio;
  price: PrecioFechado;
}): QuoteEvidence {
  return {
    id: evidenceId(args.etapa, args.itemIndex, args.origin),
    item: args.item.nombre,
    origin: args.origin,
    source: args.price.fuente,
    date: args.price.fecha,
    value: args.price.valor,
    persisted: true,
  };
}

function evidenceForItems(etapa: string, items: readonly ItemDesglose[]): QuoteEvidence[] {
  const evidence: QuoteEvidence[] = [];
  items.forEach((item, itemIndex) => {
    for (const origin of SOURCE_ORDER) {
      const price = item.precios[origin];
      if (price) evidence.push(evidenceFromPrice({ etapa, item, itemIndex, origin, price }));
    }
  });
  return evidence;
}

function batchPriceRange(items: readonly ItemDesglose[]): MoneyRange {
  const valid = items.every(
    (item) => isFiniteNumber(item.subtotal_min) && isFiniteNumber(item.subtotal_max)
  );
  return {
    min: valid ? items.reduce((sum, item) => sum + item.subtotal_min, 0) : null,
    max: valid ? items.reduce((sum, item) => sum + item.subtotal_max, 0) : null,
    currency: "ARS",
    basis: "persisted_item_subtotals",
  };
}

function typedPriceRange(items: readonly ItemDesglose[], tipo: TipoItem): MoneyRange {
  return batchPriceRange(items.filter((item) => item.tipo === tipo));
}

function itemCorroborated(item: ItemDesglose): boolean {
  return Boolean(item.precios.eze) || Boolean(item.precios.sismat && item.precios.internet);
}

function batchItems(items: readonly ItemDesglose[]): BatchItem[] {
  return items.map((item) => ({
    name: item.nombre,
    tipo: item.tipo,
    unidad: item.unidad,
    cantidad: item.cantidad,
    subtotalMin: isFiniteNumber(item.subtotal_min) ? item.subtotal_min : 0,
    subtotalMax: isFiniteNumber(item.subtotal_max) ? item.subtotal_max : 0,
    priced: hasCalculatedPrice(item),
    origins: SOURCE_ORDER.filter((origin) => Boolean(item.precios[origin])),
    corroborated: hasCalculatedPrice(item) && itemCorroborated(item),
    manual: item.manual === true,
  }));
}

function costComposition(desglose: Desglose | null): CostComposition | null {
  const totals = desglose?.totales;
  if (
    !totals ||
    !isFiniteNumber(totals.materiales_min) ||
    !isFiniteNumber(totals.materiales_max) ||
    !isFiniteNumber(totals.mano_de_obra_min) ||
    !isFiniteNumber(totals.mano_de_obra_max) ||
    !isFiniteNumber(totals.subtotal_min) ||
    !isFiniteNumber(totals.subtotal_max)
  ) {
    return null;
  }
  return {
    laborMin: totals.mano_de_obra_min,
    laborMax: totals.mano_de_obra_max,
    materialsMin: totals.materiales_min,
    materialsMax: totals.materiales_max,
    extrasMin: isFiniteNumber(totals.extras_min) ? totals.extras_min : 0,
    extrasMax: isFiniteNumber(totals.extras_max) ? totals.extras_max : 0,
    subtotalMin: totals.subtotal_min,
    subtotalMax: totals.subtotal_max,
    imprevistosPct: isFiniteNumber(totals.imprevistos_pct) ? totals.imprevistos_pct : 0,
    factorZonaMin: isFiniteNumber(totals.factor_zona_min) ? totals.factor_zona_min : 1,
    factorZonaMax: isFiniteNumber(totals.factor_zona_max) ? totals.factor_zona_max : 1,
    basis: "persisted_desglose_totales",
  };
}

type ReviewState = "absent" | "incomplete" | "complete";

function reviewState(revision: Revision | null): ReviewState {
  if (!revision) return "absent";
  return revision.checklist.length > 0 && revision.sanidad.length > 0
    ? "complete"
    : "incomplete";
}

function batchConfidence(args: {
  items: readonly ItemDesglose[];
  staleCount: number;
  criticalCount: number;
  checklistMissingCount: number;
  sanityIssueCount: number;
  markedDivergenceCount: number;
  reviewState: ReviewState;
}): QuoteConfidence {
  const {
    items,
    staleCount,
    criticalCount,
    checklistMissingCount,
    sanityIssueCount,
    markedDivergenceCount,
    reviewState: persistedReviewState,
  } = args;
  const coverage = sourceCoverage(items);
  if (coverage.coveredItems === 0) {
    return {
      level: "sin_calcular",
      basis: ["Ningún ítem tiene una fuente de costo persistida."],
    };
  }
  if (items.some((item) => !hasCalculatedPrice(item))) {
    return { level: "baja", basis: ["Hay ítems activos sin precio persistido."] };
  }
  if (persistedReviewState === "absent") {
    return { level: "baja", basis: ["No hay revisión determinística persistida."] };
  }
  if (persistedReviewState === "incomplete") {
    return {
      level: "baja",
      basis: ["La revisión persistida no contiene checklist y sanidad obligatorios."],
    };
  }
  if (checklistMissingCount > 0) {
    return { level: "baja", basis: ["Hay requisitos faltantes en el checklist persistido."] };
  }
  if (sanityIssueCount > 0) {
    return { level: "baja", basis: ["Hay chequeos de sanidad fuera de rango o sin datos."] };
  }
  if (staleCount > 0) {
    return { level: "baja", basis: ["Hay precios persistidos marcados como vencidos."] };
  }
  if (criticalCount > 0) {
    return { level: "baja", basis: ["Hay divergencias críticas sin resolver."] };
  }
  if (markedDivergenceCount > 0) {
    return { level: "baja", basis: ["Hay divergencias de fuente que requieren revisión."] };
  }

  const independentlyCorroborated = items.every(itemCorroborated);
  if (coverage.percent === 100 && independentlyCorroborated) {
    return {
      level: "alta",
      basis: ["Todos los ítems tienen precio persistido y corroboración doble o decisión fechada de Eze."],
    };
  }

  return {
    level: "media",
    basis: ["Hay cobertura de precio, pero falta corroboración independiente en al menos un ítem."],
  };
}

function sanityItemName(check: string): string | null {
  const match = /^(?:rendimiento|precio):\s*(.+)$/i.exec(check.trim());
  const itemName = match?.[1]?.trim();
  return itemName ? itemName : null;
}

function groupedBatches(items: readonly ItemDesglose[], revision: Revision | null): QuoteBatch[] {
  const groups = new Map<string, ItemDesglose[]>();
  for (const item of items) {
    const etapa = item.etapa.trim() || "Sin etapa persistida";
    const group = groups.get(etapa) ?? [];
    group.push(item);
    groups.set(etapa, group);
  }

  return Array.from(groups.entries()).map(([etapa, group], index) => {
    const names = new Set(group.map((item) => item.nombre));
    const missing = group.filter((item) => !hasCalculatedPrice(item));
    const stale = (revision?.precios_vencidos ?? []).filter((entry) => names.has(entry.item));
    const checklistMissing = (revision?.checklist ?? []).filter(
      (entry) => entry.estado === "faltante" && names.has(entry.item)
    );
    const sanityIssues = (revision?.sanidad ?? []).filter((entry) => {
      if (entry.estado === "ok") return false;
      const itemName = sanityItemName(entry.chequeo);
      return itemName ? names.has(itemName) : true;
    });
    const markedDivergences = (revision?.divergencias ?? []).filter(
      (entry) => entry.nivel === "marca" && names.has(entry.item)
    );
    const critical = (revision?.divergencias ?? []).filter(
      (entry) => entry.nivel === "critica" && names.has(entry.item)
    );
    const blockers: string[] = [];
    if (missing.length > 0) blockers.push(`${missing.length} ítem(s) sin precio persistido.`);
    if (!revision) {
      blockers.push("No hay revisión determinística persistida para este rubro.");
    } else if (reviewState(revision) === "incomplete") {
      blockers.push("La revisión no contiene checklist y sanidad obligatorios.");
    }
    if (checklistMissing.length > 0) {
      blockers.push(`${checklistMissing.length} requisito(s) del checklist siguen faltantes.`);
    }
    if (sanityIssues.length > 0) {
      blockers.push(
        `${sanityIssues.length} chequeo(s) de sanidad están fuera de rango o sin datos.`
      );
    }
    if (stale.length > 0) blockers.push(`${stale.length} precio(s) marcado(s) como vencido(s).`);
    if (markedDivergences.length > 0) {
      blockers.push(`${markedDivergences.length} divergencia(s) de fuente requieren revisión.`);
    }
    if (critical.length > 0) blockers.push(`${critical.length} divergencia(s) crítica(s) sin resolver.`);

    const responsibility =
      missing.length > 0
        ? "Investigación de precios pendiente de despacho"
        : blockers.length > 0
          ? "Verificación de evidencia y costos"
          : "Consolidación determinística del costo";

    return {
      id: `batch:${index}:${encodeURIComponent(etapa)}`,
      etapa,
      itemCount: group.length,
      itemNames: group.map((item) => item.nombre),
      items: batchItems(group),
      responsibility,
      evidence: evidenceForItems(etapa, group),
      priceRange: batchPriceRange(group),
      laborRange: typedPriceRange(group, "mano_de_obra"),
      materialsRange: typedPriceRange(group, "material"),
      sourceCoverage: sourceCoverage(group),
      confidence: batchConfidence({
        items: group,
        staleCount: stale.length,
        criticalCount: critical.length,
        checklistMissingCount: checklistMissing.length,
        sanityIssueCount: sanityIssues.length,
        markedDivergenceCount: markedDivergences.length,
        reviewState: reviewState(revision),
      }),
      blockers,
      currentBlocker: blockers[0] ?? null,
      jobState: "not_instrumented",
    };
  });
}

function buildBlockers(args: {
  quote: CotizacionRow;
  desglose: Desglose | null;
  activeItems: readonly ItemDesglose[];
  revision: Revision | null;
}): QuoteBlocker[] {
  const { quote, desglose, activeItems, revision } = args;
  const blockers: QuoteBlocker[] = [];
  if (!quote.receta_id || !desglose?.receta_nombre?.trim()) {
    blockers.push({
      code: "no_recipe",
      label: "Sin receta",
      detail: "La cotización legacy no conserva una receta identificable.",
      severity: "blocking",
    });
  }
  if (activeItems.length === 0) {
    blockers.push({
      code: "no_items",
      label: "Sin ítems activos",
      detail: "No hay partidas activas persistidas para consolidar.",
      severity: "blocking",
    });
  }
  const missing = activeItems.filter((item) => !hasCalculatedPrice(item));
  if (missing.length > 0) {
    blockers.push({
      code: "missing_prices",
      label: "Precios faltantes",
      detail: `${missing.length} ítem(s) activo(s) no tienen precio y evidencia de costo persistidos.`,
      severity: "blocking",
    });
  }
  if (!revision) {
    blockers.push({
      code: "missing_revision",
      label: "Sin revisión determinística",
      detail: "No hay checklist, sanidad ni contraste persistidos para validar el costo.",
      severity: "blocking",
    });
  } else if (reviewState(revision) === "incomplete") {
    blockers.push({
      code: "missing_review_outputs",
      label: "Revisión incompleta",
      detail: "La revisión no contiene los resultados obligatorios de checklist y sanidad.",
      severity: "blocking",
    });
  }
  const checklistMissing = (revision?.checklist ?? []).filter(
    (entry) => entry.estado === "faltante"
  );
  if (checklistMissing.length > 0) {
    blockers.push({
      code: "incomplete_checklist",
      label: "Checklist incompleto",
      detail: `${checklistMissing.length} requisito(s) del motor siguen marcados como faltantes.`,
      severity: "blocking",
    });
  }
  const sanityIssues = (revision?.sanidad ?? []).filter((entry) => entry.estado !== "ok");
  if (sanityIssues.length > 0) {
    blockers.push({
      code: "sanity_issues",
      label: "Sanidad sin resolver",
      detail: `${sanityIssues.length} chequeo(s) están fuera de rango o sin datos.`,
      severity: "blocking",
    });
  }
  const stale = revision?.precios_vencidos ?? [];
  if (stale.length > 0) {
    blockers.push({
      code: "stale_prices",
      label: "Precios vencidos",
      detail: `${stale.length} precio(s) fueron marcados como vencidos en la revisión persistida.`,
      severity: "blocking",
    });
  }
  const markedDivergences = (revision?.divergencias ?? []).filter(
    (entry) => entry.nivel === "marca"
  );
  if (markedDivergences.length > 0) {
    blockers.push({
      code: "source_divergences",
      label: "Fuentes divergentes",
      detail: `${markedDivergences.length} divergencia(s) de precio requieren revisión.`,
      severity: "blocking",
    });
  }
  const critical = (revision?.divergencias ?? []).filter((entry) => entry.nivel === "critica");
  if (critical.length > 0) {
    blockers.push({
      code: "critical_divergences",
      label: "Divergencias críticas",
      detail: `${critical.length} divergencia(s) crítica(s) siguen abiertas.`,
      severity: "blocking",
    });
  }
  const doubts = revision?.dudas ?? [];
  if (doubts.length > 0) {
    blockers.push({
      code: "open_doubts",
      label: "Dudas abiertas",
      detail: `${doubts.length} definición(es) requieren respuesta de Eze.`,
      severity: "blocking",
    });
  }
  if (!isFiniteNumber(quote.precio_propuesta)) {
    blockers.push({
      code: "missing_final_number",
      label: "Falta el número final",
      detail: "precio_propuesta todavía no contiene un número final aprobado.",
      severity: "blocking",
    });
  }

  blockers.push({
    code: "margin_approval_unavailable",
    label: "Aprobación de margen no verificable",
    detail:
      "El contrato legacy no persiste una aprobación explícita del margen. No se infiere desde estado, importe ni documento.",
    severity: "blocking",
  });

  return blockers;
}

function coreConfidence(args: {
  costRange: MoneyRange;
  batches: readonly QuoteBatch[];
  blockers: readonly QuoteBlocker[];
}): QuoteConfidence {
  const { costRange, batches, blockers } = args;
  if (costRange.min == null || costRange.max == null || batches.length === 0) {
    return {
      level: "sin_calcular",
      basis: ["No hay un rango de costo y partidas activas suficientes para calcular confianza."],
    };
  }
  const technicalBlockers = blockers.filter(
    (blocker) =>
      blocker.code !== "missing_final_number" && blocker.code !== "margin_approval_unavailable"
  );
  if (
    technicalBlockers.length > 0 ||
    batches.some((batch) => batch.confidence.level === "baja" || batch.confidence.level === "sin_calcular")
  ) {
    return {
      level: "baja",
      basis: ["Hay bloqueos técnicos o de evidencia en el costo persistido."],
    };
  }
  if (batches.every((batch) => batch.confidence.level === "alta")) {
    return {
      level: "alta",
      basis: ["Todos los rubros activos tienen cobertura y corroboración suficiente."],
    };
  }
  return {
    level: "media",
    basis: ["El costo está cubierto, pero al menos un rubro depende de una sola fuente."],
  };
}

function messageRole(author: AutorMensaje): string {
  switch (author) {
    case "eze":
      return "Eze";
    case "fable":
      return "Fable";
    case "codex":
      return "Codex";
    case "sistema":
      return "Sistema";
  }
}

function buildEvents(args: {
  quote: CotizacionRow;
  batches: readonly QuoteBatch[];
  desglose: Desglose | null;
  messages: readonly MensajeHilo[];
}): QuoteEvent[] {
  const events: QuoteEvent[] = [];

  for (const batch of args.batches) {
    for (const evidence of batch.evidence) {
      events.push({
        id: `event:${evidence.id}`,
        type: "source_evidence",
        occurredAt: evidence.date,
        title: `Evidencia · ${evidence.item}`,
        detail: `${evidence.origin.toUpperCase()} · ${evidence.source}`,
        persisted: true,
        evidence,
      });
    }
  }

  for (const [index, extra] of (args.desglose?.extras ?? []).entries()) {
    const evidence: QuoteEvidence = {
      id: evidenceId("extras", index, "extra"),
      item: extra.nombre,
      origin: "extra",
      source: extra.fuente,
      date: extra.fecha,
      value: extra.monto_max,
      persisted: true,
    };
    events.push({
      id: `event:${evidence.id}`,
      type: "source_evidence",
      occurredAt: evidence.date,
      title: `Evidencia · ${evidence.item}`,
      detail: `EXTRA · ${evidence.source}`,
      persisted: true,
      evidence,
    });
  }

  events.push({
    id: `quote-created:${args.quote.id}`,
    type: "quote_created",
    occurredAt: args.quote.creado_at,
    title: "Cotización creada",
    detail: args.quote.titulo,
    persisted: true,
  });

  for (const message of args.messages) {
    events.push({
      id: `message:${message.id}`,
      type: "message",
      occurredAt: message.fecha,
      title: `${messageRole(message.autor)} · ${message.etiqueta}`,
      detail: message.texto,
      persisted: true,
      message,
    });
  }

  return events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

function roles(args: {
  messages: readonly MensajeHilo[];
  bridgeConnected: boolean | null;
  batches: readonly QuoteBatch[];
  revision: Revision | null;
}): QuoteRole[] {
  const { messages, bridgeConnected, batches, revision } = args;
  const connection =
    bridgeConnected === true
      ? "shared_bridge_fresh"
      : bridgeConnected === false
        ? "shared_bridge_stale_or_absent"
        : "not_queried";
  const connectionEvidence =
    bridgeConnected === true
      ? "El endpoint legacy informó un latido vigente de puente-cotizador."
      : bridgeConnected === false
        ? "El endpoint legacy informó que el latido de puente-cotizador está ausente o vencido."
        : "La conectividad de puente-cotizador no fue consultada.";

  const bridgeRoles: QuoteRole[] = (["fable", "codex"] as const).map((id) => {
    const persisted = messages.filter((message) => message.autor === id);
    return {
      id,
      label: id === "fable" ? "Fable" : "Codex",
      status: persisted.length > 0 ? "persisted_evidence" : "no_persisted_evidence",
      connection,
      mode: "bridge",
      canDispatch: false,
      persistedEvidenceCount: persisted.length,
      lastPersistedEvidenceAt: persisted.at(-1)?.fecha ?? null,
      evidence: connectionEvidence,
    };
  });

  const sismatEvidence = batches
    .flatMap((batch) => batch.evidence)
    .filter((entry) => entry.origin === "sismat");
  const persistedReviewState = reviewState(revision);
  const reviewEvidenceCount = revision
    ? revision.checklist.length +
      revision.sanidad.length +
      revision.precios_vencidos.length +
      revision.divergencias.length +
      revision.dudas.length
    : 0;

  return [
    ...bridgeRoles,
    {
      id: "sismat",
      label: "SISMAT",
      status: sismatEvidence.length > 0 ? "evidence_present" : "no_evidence",
      connection: "not_applicable",
      mode: "persisted_evidence",
      canDispatch: false,
      persistedEvidenceCount: sismatEvidence.length,
      lastPersistedEvidenceAt:
        sismatEvidence.map((entry) => entry.date).sort().at(-1) ?? null,
      evidence:
        sismatEvidence.length > 0
          ? "Hay fuentes SISMAT fechadas en el desglose persistido; esto no confirma conectividad en vivo."
          : "No hay fuentes SISMAT persistidas; no se consultó conectividad en vivo.",
    },
    {
      id: "deterministic_verifier",
      label: "Verificador determinístico",
      status:
        persistedReviewState === "complete"
          ? "review_present"
          : persistedReviewState === "incomplete"
            ? "review_incomplete"
            : "no_review",
      connection: "not_applicable",
      mode: "read_only",
      canDispatch: false,
      persistedEvidenceCount: reviewEvidenceCount,
      lastPersistedEvidenceAt: null,
      evidence:
        persistedReviewState === "complete"
          ? "Se proyecta la revisión determinística ya persistida; este v1 no puede ejecutarla."
          : persistedReviewState === "incomplete"
            ? "Hay un objeto de revisión, pero faltan checklist o sanidad obligatorios."
            : "No hay revisión determinística persistida para esta cotización.",
    },
    {
      id: "proposal_prep",
      label: "Preparación de propuesta",
      status: "locked",
      connection: "not_applicable",
      mode: "locked_gate",
      canDispatch: false,
      persistedEvidenceCount: 0,
      lastPersistedEvidenceAt: null,
      evidence:
        "Bloqueada porque el contrato legacy no acredita la aprobación explícita del margen.",
    },
  ];
}

function affectedBatchIds(
  batches: readonly QuoteBatch[],
  itemNames: readonly string[]
): string[] {
  const names = new Set(itemNames);
  if (names.size === 0) return [];
  return batches
    .filter((batch) => batch.itemNames.some((itemName) => names.has(itemName)))
    .map((batch) => batch.id);
}

function sanityAffectedBatchIds(
  batches: readonly QuoteBatch[],
  checks: readonly Revision["sanidad"][number][]
): string[] {
  return batches
    .filter((batch) =>
      checks.some((check) => {
        const itemName = sanityItemName(check.chequeo);
        return itemName ? batch.itemNames.includes(itemName) : true;
      })
    )
    .map((batch) => batch.id);
}

function observability(args: {
  bridgeConnected: boolean | null;
  desglose: Desglose | null;
  revision: Revision | null;
  batches: readonly QuoteBatch[];
}): QuoteWorkspaceSnapshot["observability"] {
  const { bridgeConnected, desglose, revision, batches } = args;
  const revisionStatus = revision ? "persisted" : "absent";
  const checklist = revision?.checklist ?? [];
  const sanity = revision?.sanidad ?? [];
  const stale = revision?.precios_vencidos ?? [];
  const divergences = revision?.divergencias ?? [];
  const doubts = revision?.dudas ?? [];

  return {
    bridge: {
      process: "puente-cotizador",
      heartbeat:
        bridgeConnected === true
          ? "fresh"
          : bridgeConnected === false
            ? "stale_or_absent"
            : "not_queried",
      source: "legacy_motor_conectado",
      perAgentHeartbeat: "not_instrumented",
    },
    engine: {
      kind: "legacy_deterministic",
      execution: "not_observed",
      persistedOutputAt:
        desglose && typeof desglose.generado_at === "string" ? desglose.generado_at : null,
      processRunId: null,
    },
    checks: [
      {
        id: "checklist",
        status: revision && checklist.length > 0 ? "persisted" : "absent",
        persistedCount: checklist.length,
        affectedBatchIds: affectedBatchIds(
          batches,
          checklist.map((entry) => entry.item)
        ),
        findings: checklist.map((entry) => ({
          subject: entry.item,
          state: entry.estado,
          detail: entry.detalle,
        })),
      },
      {
        id: "sanity",
        status: revision && sanity.length > 0 ? "persisted" : "absent",
        persistedCount: sanity.length,
        affectedBatchIds: sanityAffectedBatchIds(batches, sanity),
        findings: sanity.map((entry) => ({
          subject: entry.chequeo,
          state: entry.estado,
          detail: entry.detalle,
        })),
      },
      {
        id: "stale_prices",
        status: revisionStatus,
        persistedCount: stale.length,
        affectedBatchIds: affectedBatchIds(
          batches,
          stale.map((entry) => entry.item)
        ),
        findings: stale.map((entry) => ({
          subject: entry.item,
          state: "vencido",
          detail: `${entry.fuente} · ${entry.dias} días de antigüedad (límite ${entry.limite}).`,
        })),
      },
      {
        id: "divergences",
        status: revisionStatus,
        persistedCount: divergences.length,
        affectedBatchIds: affectedBatchIds(
          batches,
          divergences.map((entry) => entry.item)
        ),
        findings: divergences.map((entry) => ({
          subject: entry.item,
          state: entry.nivel,
          detail: `SISMAT ${entry.sismat} vs internet ${entry.internet} · ${entry.divergencia_pct}%.`,
        })),
      },
      {
        id: "open_doubts",
        status: revisionStatus,
        persistedCount: doubts.length,
        affectedBatchIds: [],
        findings: doubts.map((detail) => ({
          subject: "Pregunta a Eze",
          state: "abierta",
          detail,
        })),
      },
    ],
    sources: ([...SOURCE_ORDER, "extra"] as const).map((origin) => {
      if (origin === "extra") {
        return {
          origin,
          evidenceCount: desglose?.extras.length ?? 0,
          affectedBatchIds: [],
        };
      }
      const affected = batches.filter((batch) =>
        batch.evidence.some((entry) => entry.origin === origin)
      );
      return {
        origin,
        evidenceCount: affected.reduce(
          (count, batch) =>
            count + batch.evidence.filter((entry) => entry.origin === origin).length,
          0
        ),
        affectedBatchIds: affected.map((batch) => batch.id),
      };
    }),
    instrumentationGaps: [
      "per_agent_heartbeat",
      "job_runtime",
      "queue_runtime",
      "credit_budget",
      "deterministic_process_run",
    ],
  };
}

export function projectQuoteWorkspace(input: ProjectQuoteWorkspaceInput): QuoteWorkspaceSnapshot {
  const messages = [...(input.messages ?? [])].sort((left, right) =>
    left.fecha.localeCompare(right.fecha)
  );
  const desglose = asDesglose(input.quote.desglose);
  const activeItems = (desglose?.items ?? []).filter((item) => item.activo !== false);
  const revision = input.quote.revision;
  const batches = groupedBatches(activeItems, revision);
  const blockers = buildBlockers({ quote: input.quote, desglose, activeItems, revision });
  const costRange = persistedCostRange(input.quote, desglose);
  const coverage = sourceCoverage(activeItems);
  const blockerCodes = blockers.map((blocker) => blocker.code);
  const technicalBlockers = blockers.filter(
    (blocker) =>
      blocker.code !== "missing_final_number" && blocker.code !== "margin_approval_unavailable"
  );
  const terminal =
    input.quote.estado === "rechazada" || input.quote.estado === "documento_emitido";
  const questions = terminal ? [] : [...(revision?.dudas ?? [])];
  if (!terminal && blockerCodes.includes("missing_final_number")) {
    questions.push("¿Cuál es el número final aprobado para esta cotización?");
  }
  if (!terminal) {
    questions.push("¿Cuál es el margen aprobado por Eze para habilitar la propuesta?");
  }

  return {
    schemaVersion: 1,
    provenance: input.provenance ?? "app_ravn_readonly",
    quote: {
      id: input.quote.id,
      title: input.quote.titulo,
      zone: input.quote.zona,
      createdAt: input.quote.creado_at,
      legacyState: input.quote.estado,
      finalNumber: isFiniteNumber(input.quote.precio_propuesta)
        ? input.quote.precio_propuesta
        : null,
      linkedBudgetId: input.quote.presupuesto_id,
    },
    core: {
      costRange,
      sourceCoverage: coverage,
      stage: stageFromLegacyState(input.quote.estado),
      confidence: coreConfidence({ costRange, batches, blockers }),
      blockers,
      composition: costComposition(desglose),
    },
    batches,
    roles: roles({
      messages,
      bridgeConnected: input.bridgeConnected ?? null,
      batches,
      revision,
    }),
    events: buildEvents({ quote: input.quote, batches, desglose, messages }),
    jobs: null,
    observability: observability({
      bridgeConnected: input.bridgeConnected ?? null,
      desglose,
      revision,
      batches,
    }),
    budget: {
      configured: false,
      taskCap: null,
      used: null,
      reserved: null,
      dispatchEnabled: false,
      dispatchDisabledReason: DISPATCH_DISABLED_REASON,
      queued: null,
      running: null,
    },
    orchestration: {
      mode: "read_only_projection",
      parallelEligibleBatchIds: [],
      blockedBatchIds: batches
        .filter((batch) => batch.currentBlocker != null)
        .map((batch) => batch.id),
      readyToConsolidateBatchIds: batches
        .filter((batch) => batch.currentBlocker == null)
        .map((batch) => batch.id),
      awaitingEze: questions.length > 0,
    },
    gates: {
      proposalPrep: { locked: true, reasons: blockerCodes },
      appHandoff: { locked: true, reasons: blockerCodes },
    },
    decision: {
      requiresEzeAnswer: questions.length > 0,
      questions,
      unverified: blockers.map((blocker) => blocker.detail),
      readyForCostDecision: !terminal && technicalBlockers.length === 0,
      readyForProposal: false,
    },
  };
}
