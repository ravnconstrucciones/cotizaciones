"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  Gauge,
  GitBranch,
  LockKeyhole,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  QuoteBatch,
  QuoteEvent,
  QuoteRole,
  QuoteSummary,
  QuoteWorkspaceSnapshot,
} from "../domain";
import { formatObservedDate as dateTime } from "./format-observed-date";

type ControlCenterData = {
  quotes: QuoteSummary[];
  snapshot: QuoteWorkspaceSnapshot;
};

type MobileTab = "resumen" | "rubros" | "eventos";

const MONEY = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const COMPACT_MONEY = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  notation: "compact",
  maximumFractionDigits: 1,
});

const STAGE_LABELS: Record<QuoteWorkspaceSnapshot["core"]["stage"], string> = {
  intake: "INGRESO",
  cost_review: "REVISIÓN DE COSTO",
  legacy_approved: "APROBADA LEGACY",
  rejected: "RECHAZADA",
  legacy_document_emitted: "DOCUMENTO LEGACY",
};

const ROLE_STATUS: Record<QuoteRole["status"], string> = {
  persisted_evidence: "MENSAJES PERSISTIDOS",
  no_persisted_evidence: "SIN MENSAJES",
  evidence_present: "EVIDENCIA PRESENTE",
  no_evidence: "SIN EVIDENCIA",
  review_present: "REVISIÓN PERSISTIDA",
  review_incomplete: "REVISIÓN INCOMPLETA",
  no_review: "SIN REVISIÓN",
  locked: "BLOQUEADO",
};

const ORIGIN_LABELS: Record<string, string> = {
  sismat: "SISMAT",
  internet: "INTERNET",
  retail: "RETAIL",
  eze: "EZE",
  extra: "EXTRA",
};

const CHECK_LABELS: Record<
  QuoteWorkspaceSnapshot["observability"]["checks"][number]["id"],
  string
> = {
  checklist: "Checklist del motor",
  sanity: "Sanidad de cantidades",
  stale_prices: "Vencimiento de precios",
  divergences: "Contraste de fuentes",
  open_doubts: "Dudas abiertas",
};

const GAP_LABELS: Record<
  QuoteWorkspaceSnapshot["observability"]["instrumentationGaps"][number],
  string
> = {
  per_agent_heartbeat: "latido individual por agente",
  job_runtime: "runtime y asignación por job",
  queue_runtime: "cola real de trabajos",
  credit_budget: "presupuesto y consumo de créditos",
  deterministic_process_run: "ID de corrida del motor determinístico",
};

function money(value: number | null): string {
  return value == null ? "SIN DATO" : MONEY.format(value);
}

function compactMoney(value: number | null): string {
  return value == null ? "SIN COSTO" : COMPACT_MONEY.format(value);
}

function toneForBlockers(count: number): "blocked" | "ready" {
  return count > 0 ? "blocked" : "ready";
}

function roleTone(role: QuoteRole): "blocked" | "ready" | undefined {
  if (
    ["no_persisted_evidence", "no_evidence", "review_incomplete", "no_review", "locked"].includes(
      role.status
    )
  ) {
    return "blocked";
  }
  if (["persisted_evidence", "evidence_present", "review_present"].includes(role.status)) {
    return "ready";
  }
  return undefined;
}

function sourceUrl(source: string): string | null {
  const match = source.match(/https?:\/\/[^\s]+/);
  if (!match) return null;
  try {
    return new URL(match[0]).toString();
  } catch {
    return null;
  }
}

function batchPosition(index: number, total: number): { x: number; y: number } {
  const angle = (-90 + (index * 360) / Math.max(total, 1)) * (Math.PI / 180);
  return {
    x: 50 + Math.cos(angle) * 38,
    y: 50 + Math.sin(angle) * 37,
  };
}

function batchForEvidence(
  batches: readonly QuoteBatch[],
  event: QuoteEvent
): QuoteBatch | null {
  if (event.type !== "source_evidence") return null;
  return batches.find((batch) => batch.evidence.some((item) => item.id === event.evidence.id)) ?? null;
}

function latestMessageForRole(
  events: readonly QuoteEvent[],
  role: QuoteRole
): Extract<QuoteEvent, { type: "message" }> | null {
  if (role.id !== "fable" && role.id !== "codex") return null;
  return (
    [...events]
      .reverse()
      .find(
        (event): event is Extract<QuoteEvent, { type: "message" }> =>
          event.type === "message" && event.message.autor === role.id
      ) ?? null
  );
}

function batchNames(snapshot: QuoteWorkspaceSnapshot, ids: readonly string[]): string {
  const names = ids
    .map((id) => snapshot.batches.find((batch) => batch.id === id)?.etapa)
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(" · ") : "Sin rubro enlazado";
}

function isControlCenterData(value: unknown): value is ControlCenterData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ControlCenterData>;
  return Array.isArray(candidate.quotes) && Boolean(candidate.snapshot?.quote?.id);
}

export function ControlCenter({
  initialData,
  preview,
}: {
  initialData: ControlCenterData;
  preview: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [data, setData] = useState(initialData);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    initialData.snapshot.batches[0]?.id ?? null
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>("resumen");
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const snapshot = data.snapshot;
  const selectedBatch =
    snapshot.batches.find((batch) => batch.id === selectedBatchId) ?? snapshot.batches[0] ?? null;

  const visibleEvents = useMemo(() => [...snapshot.events].reverse(), [snapshot.events]);

  const loadQuote = useCallback(
    async (quoteId: string, announce = true) => {
      if (requestInFlight.current || preview) return;
      requestInFlight.current = true;
      if (announce) setBusy(true);
      setRefreshError(null);

      try {
        const response = await fetch(`/api/quotes?quote=${encodeURIComponent(quoteId)}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const payload: unknown = await response.json();
        if (!response.ok || !isControlCenterData(payload)) {
          const safeMessage =
            payload &&
            typeof payload === "object" &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "La actualización no devolvió un estado válido.";
          throw new Error(safeMessage);
        }

        setData(payload);
        setSelectedBatchId((current) =>
          payload.snapshot.batches.some((batch) => batch.id === current)
            ? current
            : (payload.snapshot.batches[0]?.id ?? null)
        );
        window.history.replaceState(null, "", `/?quote=${encodeURIComponent(quoteId)}`);
      } catch (error) {
        setRefreshError(
          error instanceof Error ? error.message : "No se pudo actualizar el estado observable."
        );
      } finally {
        requestInFlight.current = false;
        setBusy(false);
      }
    },
    [preview]
  );

  useEffect(() => {
    if (preview) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadQuote(snapshot.quote.id, false);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadQuote, preview, snapshot.quote.id]);

  const bridgeState = snapshot.observability.bridge.heartbeat;
  const bridgeLabel =
    bridgeState === "fresh"
      ? "PUENTE CON LATIDO · ESTADO COMPARTIDO"
      : bridgeState === "stale_or_absent"
        ? "PUENTE SIN LATIDO VIGENTE"
        : "PUENTE NO CONSULTADO";

  return (
    <div className="qz-shell">
      <header className="qz-header">
        <div className="qz-brand">
          <span className="qz-brand__mark">RAVN</span>
          <span className="qz-brand__product">COTIZADOR · CONTROL CENTER</span>
        </div>

        <div className="qz-quote-picker">
          <label htmlFor="quote-picker">Cotización observada</label>
          <select
            id="quote-picker"
            value={snapshot.quote.id}
            disabled={busy || preview}
            onChange={(event) => void loadQuote(event.target.value)}
          >
            {data.quotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.title} · {quote.legacyState}
              </option>
            ))}
          </select>
        </div>

        <div
          className="qz-runtime"
          data-state={bridgeState === "fresh" ? "connected" : "disconnected"}
        >
          <span className="qz-runtime__dot" aria-hidden="true" />
          <span>{bridgeLabel}</span>
          <motion.button
            type="button"
            className="qz-icon-action"
            aria-label="Actualizar estado desde App RAVN"
            title="Actualizar estado desde App RAVN"
            disabled={busy || preview}
            onClick={() => void loadQuote(snapshot.quote.id)}
            animate={{ rotate: busy && !reduceMotion ? 180 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.24 }}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </motion.button>
        </div>
      </header>

      {preview ? (
        <div className="qz-preview-banner" role="status">
          PREVIEW LOCAL · PRECIOS Y EVENTOS FICTICIOS · NINGÚN AGENTE EJECUTADO
        </div>
      ) : null}

      <main className="qz-main">
        <div className="qz-mobile-tabs" role="tablist" aria-label="Vistas del control center">
          {(["resumen", "rubros", "eventos"] as const).map((tab) => (
            <motion.button
              key={tab}
              type="button"
              role="tab"
              className="qz-tab"
              aria-selected={mobileTab === tab}
              onClick={() => setMobileTab(tab)}
              whileTap={reduceMotion ? undefined : { opacity: 0.72 }}
            >
              {tab}
            </motion.button>
          ))}
        </div>

        {refreshError ? (
          <div className="qz-inline-error" role="status" aria-live="polite">
            {refreshError} Se conserva el último estado válido en pantalla.
          </div>
        ) : null}

        <div className="qz-layout">
          <section className="qz-panel" aria-labelledby="workspace-title">
            <header className="qz-panel__header">
              <div>
                <p className="qz-kicker">EXPEDIENTE READ-ONLY · {snapshot.quote.id}</p>
                <h1 className="qz-panel__title" id="workspace-title">
                  {snapshot.quote.title}
                </h1>
              </div>
              <span className="qz-status" data-tone={toneForBlockers(snapshot.core.blockers.length)}>
                {STAGE_LABELS[snapshot.core.stage]}
              </span>
            </header>

            <motion.div
              className="qz-mobile-section"
              data-mobile-visible={mobileTab === "resumen" ? "true" : "false"}
              key={`${snapshot.quote.id}:overview`}
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.28 }}
            >
              <RuntimeTrace snapshot={snapshot} />

              <div className="qz-topology">
                <div className="qz-topology__visual" aria-label="Mapa real de rubros de la cotización">
                  <div className="qz-ring qz-ring--inner" aria-hidden="true" />
                  <div className="qz-ring qz-ring--outer" aria-hidden="true" />
                  <svg
                    className="qz-connectors"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {snapshot.batches.map((batch, index) => {
                      const position = batchPosition(index, snapshot.batches.length);
                      return (
                        <motion.line
                          key={batch.id}
                          x1="50"
                          y1="50"
                          x2={position.x}
                          y2={position.y}
                          initial={false}
                          animate={{ pathLength: 1, opacity: 1 }}
                          transition={{ duration: reduceMotion ? 0 : 0.32, delay: index * 0.035 }}
                        />
                      );
                    })}
                  </svg>

                  <motion.div
                    className="qz-core"
                    key={`${snapshot.quote.id}:${snapshot.core.stage}`}
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.3 }}
                  >
                    <div className="qz-core__content">
                      <p className="qz-label">COSTO PERSISTIDO</p>
                      <p className="qz-core__price">{compactMoney(snapshot.core.costRange.min)}</p>
                      <p className="qz-core__range">
                        {money(snapshot.core.costRange.min)} — {money(snapshot.core.costRange.max)}
                      </p>
                      <p className="qz-core__summary">Ejecución actual del motor: no observable</p>
                      <div className="qz-core__metrics">
                        <div className="qz-core__metric">
                          <strong>{snapshot.core.sourceCoverage.percent}%</strong>
                          <span>Cobertura</span>
                        </div>
                        <div className="qz-core__metric">
                          <strong>{snapshot.core.confidence.level.replace("_", " ")}</strong>
                          <span>Confianza</span>
                        </div>
                        <div className="qz-core__metric">
                          <strong>{snapshot.core.blockers.length}</strong>
                          <span>Bloqueos</span>
                        </div>
                        <div className="qz-core__metric">
                          <strong>N/D</strong>
                          <span>Jobs reales</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  {snapshot.batches.map((batch, index) => {
                    const position = batchPosition(index, snapshot.batches.length);
                    return (
                      <motion.button
                        key={batch.id}
                        type="button"
                        className="qz-batch-node"
                        style={
                          {
                            "--qz-x": `${position.x}%`,
                            "--qz-y": `${position.y}%`,
                          } as React.CSSProperties
                        }
                        aria-pressed={selectedBatch?.id === batch.id}
                        aria-label={`Ver rubro ${batch.etapa}`}
                        onClick={() => setSelectedBatchId(batch.id)}
                        whileHover={reduceMotion ? undefined : { borderColor: "#f2efe8" }}
                        whileTap={reduceMotion ? undefined : { opacity: 0.72 }}
                      >
                        <span className="qz-batch-node__title">{batch.etapa}</span>
                        <span className="qz-batch-node__meta">
                          {batch.sourceCoverage.percent}% · {batch.currentBlocker ? "BLOQUEADO" : "LISTO"}
                        </span>
                      </motion.button>
                    );
                  })}

                  <div className="qz-empty-orbit">
                    CAPA DE JOBS · N/D. El contrato legacy no expone asignación, cola ni runtime por
                    trabajo.
                  </div>
                </div>
              </div>

              <RuntimeObservability snapshot={snapshot} />
            </motion.div>

            <div
              className="qz-mobile-section"
              data-mobile-visible={mobileTab === "rubros" ? "true" : "false"}
            >
              <BatchDetail batch={selectedBatch} />
              <BatchTable
                batches={snapshot.batches}
                selectedBatchId={selectedBatch?.id ?? null}
                onSelect={setSelectedBatchId}
              />
            </div>
          </section>

          <EventConsole
            snapshot={snapshot}
            events={visibleEvents}
            mobileVisible={mobileTab === "eventos"}
          />
        </div>

        <DecisionGate snapshot={snapshot} />
      </main>
    </div>
  );
}

function RuntimeTrace({ snapshot }: { snapshot: QuoteWorkspaceSnapshot }) {
  const bridge = snapshot.observability.bridge.heartbeat;
  const synthetic = snapshot.provenance === "synthetic_preview";
  const ready = snapshot.orchestration.readyToConsolidateBatchIds.length;
  const blocked = snapshot.orchestration.blockedBatchIds.length;

  const steps = [
    {
      icon: Database,
      label: "01 · Lectura",
      title: synthetic ? "Fixture local" : "App RAVN GET",
      status: synthetic ? "SINTÉTICO" : "ACTIVO · SOLO LECTURA",
      detail: synthetic
        ? "Preview explícito; no consulta App RAVN."
        : "Ficha, desglose, revisión y mensajes persistidos.",
      tone: synthetic ? undefined : ("ready" as const),
    },
    {
      icon: ServerCog,
      label: "02 · Motor base",
      title: "cotizar.ts / instanciar.ts",
      status: "SALIDA PERSISTIDA",
      detail: snapshot.observability.engine.persistedOutputAt
        ? `No se ejecuta aquí. Último resultado: ${dateTime(snapshot.observability.engine.persistedOutputAt)}`
        : "No se ejecuta aquí y no hay fecha de salida persistida.",
      tone: undefined,
    },
    {
      icon: GitBranch,
      label: "03 · Puente",
      title: snapshot.observability.bridge.process,
      status:
        bridge === "fresh"
          ? "LATIDO VIGENTE"
          : bridge === "stale_or_absent"
            ? "SIN LATIDO"
            : "NO CONSULTADO",
      detail: "Latido compartido; no prueba ejecución individual de Fable o Codex.",
      tone: bridge === "fresh" ? ("ready" as const) : ("blocked" as const),
    },
    {
      icon: Gauge,
      label: "04 · Consolidación",
      title: `${ready} listos · ${blocked} bloqueados`,
      status: "PROYECCIÓN READ-ONLY",
      detail: "Sin jobs despachables ni scheduler instrumentado.",
      tone: blocked > 0 ? ("blocked" as const) : ("ready" as const),
    },
    {
      icon: LockKeyhole,
      label: "05 · Decisión",
      title: "Margen y propuesta",
      status: "BLOQUEADO",
      detail: "No se habilita propuesta ni handoff sin aprobación explícita de Eze.",
      tone: "blocked" as const,
    },
  ];

  return (
    <section className="qz-runtime-trace" aria-labelledby="runtime-trace-title">
      <div className="qz-runtime-trace__heading">
        <div>
          <p className="qz-kicker">RUNTIME OBSERVABLE</p>
          <h2 id="runtime-trace-title">Qué proceso existe y qué puede verificarse</h2>
        </div>
        <span className="qz-status">
          {synthetic ? "PREVIEW · SIN POLLING" : "POLL READ-ONLY · 30 S"}
        </span>
      </div>
      <div className="qz-process-grid">
        {steps.map((step) => (
          <article className="qz-process-step" key={step.label}>
            <step.icon size={17} strokeWidth={1.5} aria-hidden="true" />
            <p className="qz-label">{step.label}</p>
            <h3>{step.title}</h3>
            <span className="qz-status" data-tone={step.tone}>
              {step.status}
            </span>
            <p>{step.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function RuntimeObservability({ snapshot }: { snapshot: QuoteWorkspaceSnapshot }) {
  return (
    <section className="qz-observability" aria-labelledby="observability-title">
      <header className="qz-section-heading">
        <div>
          <p className="qz-kicker">TRAZA Y RESPONSABILIDAD</p>
          <h2 id="observability-title">Agentes, fuentes y controles visibles</h2>
        </div>
        <span className="qz-status" data-tone="blocked">
          SIN RUNTIME POR JOB
        </span>
      </header>

      <div className="qz-role-grid">
        {snapshot.roles.map((role) => {
          const latest = latestMessageForRole(snapshot.events, role);
          return (
            <article className="qz-role-card" key={role.id}>
              <div className="qz-role-card__heading">
                <h3>{role.label}</h3>
                <span className="qz-status" data-tone={roleTone(role)}>
                  {ROLE_STATUS[role.status]}
                </span>
              </div>
              <p>{role.evidence}</p>
              <dl className="qz-mini-facts">
                <div>
                  <dt>Evidencia persistida</dt>
                  <dd>{role.persistedEvidenceCount}</dd>
                </div>
                <div>
                  <dt>Último registro</dt>
                  <dd>{dateTime(role.lastPersistedEvidenceAt)}</dd>
                </div>
              </dl>
              {latest ? (
                <p className="qz-role-card__latest">
                  <strong>Último mensaje:</strong> {latest.detail}
                </p>
              ) : role.mode === "bridge" ? (
                <p className="qz-role-card__latest">
                  Sin mensaje persistido. El latido compartido no informa qué está analizando.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="qz-observability-grid">
        <article className="qz-observability-card">
          <div className="qz-observability-card__heading">
            <Search size={17} strokeWidth={1.5} aria-hidden="true" />
            <h3>Fuentes persistidas</h3>
          </div>
          <ul className="qz-telemetry-list">
            {snapshot.observability.sources.map((source) => (
              <li key={source.origin}>
                <span>{ORIGIN_LABELS[source.origin] ?? source.origin}</span>
                <strong>{source.evidenceCount}</strong>
                <small>{batchNames(snapshot, source.affectedBatchIds)}</small>
              </li>
            ))}
          </ul>
        </article>

        <article className="qz-observability-card">
          <div className="qz-observability-card__heading">
            <ShieldCheck size={17} strokeWidth={1.5} aria-hidden="true" />
            <h3>Cross-checks persistidos</h3>
          </div>
          <ul className="qz-telemetry-list">
            {snapshot.observability.checks.map((check) => (
              <li key={check.id}>
                <span>{CHECK_LABELS[check.id]}</span>
                <strong>{check.status === "persisted" ? check.persistedCount : "N/D"}</strong>
                <small>
                  {check.status === "persisted"
                    ? batchNames(snapshot, check.affectedBatchIds)
                    : "Salida obligatoria ausente"}
                </small>
                {check.findings.length > 0 ? (
                  <ul className="qz-check-findings">
                    {check.findings.map((finding, index) => (
                      <li key={`${check.id}:${finding.subject}:${index}`}>
                        <div>
                          <strong>{finding.subject}</strong>
                          <span>{finding.state.replaceAll("_", " ")}</span>
                        </div>
                        <p>{finding.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </article>

        <article className="qz-observability-card">
          <div className="qz-observability-card__heading">
            <AlertTriangle size={17} strokeWidth={1.5} aria-hidden="true" />
            <h3>Instrumentación ausente</h3>
          </div>
          <ul className="qz-list">
            {snapshot.observability.instrumentationGaps.map((gap) => (
              <li key={gap}>{GAP_LABELS[gap]}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function BatchDetail({ batch }: { batch: QuoteBatch | null }) {
  if (!batch) {
    return (
      <div className="qz-detail-grid">
        <article className="qz-detail-card">
          <p className="qz-kicker">RUBROS</p>
          <h3>Sin partidas persistidas</h3>
          <p>No hay un batch real que pueda representarse o asignarse.</p>
        </article>
      </div>
    );
  }

  return (
    <div className="qz-detail-grid">
      <article className="qz-detail-card">
        <p className="qz-kicker">RUBRO SELECCIONADO</p>
        <h3>{batch.etapa}</h3>
        <p>{batch.responsibility}</p>
        <div className="qz-metric-row">
          <div className="qz-metric-box">
            <strong>{money(batch.priceRange.min)}</strong>
            <span>Costo mínimo</span>
          </div>
          <div className="qz-metric-box">
            <strong>{money(batch.priceRange.max)}</strong>
            <span>Costo máximo</span>
          </div>
          <div className="qz-metric-box">
            <strong>{batch.sourceCoverage.percent}%</strong>
            <span>Cobertura</span>
          </div>
        </div>
        <p>
          Confianza: <strong>{batch.confidence.level.replace("_", " ")}</strong> · Job: no
          instrumentado
        </p>
        <ul className="qz-list">
          {batch.confidence.basis.map((basis) => (
            <li key={basis}>{basis}</li>
          ))}
        </ul>
        <p>Ítems: {batch.itemNames.join(" · ") || "sin nombres persistidos"}</p>
        {batch.currentBlocker ? (
          <div className="qz-inline-error">Bloqueo actual: {batch.currentBlocker}</div>
        ) : (
          <p className="qz-ready-line">
            <CheckCircle2 size={15} aria-hidden="true" /> Costo del rubro listo para consolidación
            read-only.
          </p>
        )}
      </article>

      <article className="qz-detail-card">
        <p className="qz-kicker">EVIDENCIA EXACTA</p>
        <h3>{batch.evidence.length} fuentes persistidas</h3>
        {batch.evidence.length > 0 ? (
          <ul className="qz-evidence-list">
            {batch.evidence.map((evidence) => {
              const href = sourceUrl(evidence.source);
              return (
                <li key={evidence.id}>
                  <div>
                    <span className="qz-status">{ORIGIN_LABELS[evidence.origin]}</span>
                    <strong>{evidence.item}</strong>
                  </div>
                  <p>{evidence.source}</p>
                  <small>
                    {money(evidence.value)} · {dateTime(evidence.date)}
                  </small>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      Abrir fuente <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Sin fuente fechada persistida. No se infiere búsqueda ni cobertura.</p>
        )}
      </article>
    </div>
  );
}

function BatchTable({
  batches,
  selectedBatchId,
  onSelect,
}: {
  batches: QuoteBatch[];
  selectedBatchId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="qz-table-wrap">
      <table className="qz-table">
        <caption className="qz-sr-only">Rubros derivados de partidas reales persistidas</caption>
        <thead>
          <tr>
            <th>Rubro</th>
            <th>Responsabilidad</th>
            <th>Fuentes</th>
            <th>Rango</th>
            <th>Confianza</th>
            <th>Job</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => (
            <tr key={batch.id}>
              <td data-label="Rubro">{batch.etapa}</td>
              <td data-label="Responsabilidad">{batch.responsibility}</td>
              <td data-label="Fuentes">
                {batch.evidence.length} · {batch.sourceCoverage.percent}%
              </td>
              <td data-label="Rango">
                {money(batch.priceRange.min)} — {money(batch.priceRange.max)}
              </td>
              <td data-label="Confianza">{batch.confidence.level.replace("_", " ")}</td>
              <td data-label="Job">NO INSTRUMENTADO</td>
              <td data-label="Detalle">
                <button
                  type="button"
                  className="qz-table__button"
                  aria-pressed={selectedBatchId === batch.id}
                  onClick={() => onSelect(batch.id)}
                >
                  Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventConsole({
  snapshot,
  events,
  mobileVisible,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  events: QuoteEvent[];
  mobileVisible: boolean;
}) {
  const synthetic = snapshot.provenance === "synthetic_preview";
  return (
    <aside
      className="qz-panel qz-console qz-mobile-section"
      data-mobile-visible={mobileVisible ? "true" : "false"}
      aria-labelledby="event-console-title"
    >
      <header className="qz-panel__header">
        <div>
          <p className="qz-kicker">{synthetic ? "EVENTOS SINTÉTICOS" : "EVENTOS REALES"}</p>
          <h2 className="qz-panel__title" id="event-console-title">
            {synthetic ? "Consola de preview" : "Consola persistida"}
          </h2>
        </div>
        <span className="qz-status">{events.length} EVENTOS</span>
      </header>
      <div className="qz-console__scope">
        Los mensajes legacy no informan rubro ni job. La consola no les atribuye un alcance.
      </div>
      <div className="qz-console__body">
        {events.length > 0 ? (
          events.map((event) => {
            const batch = batchForEvidence(snapshot.batches, event);
            return (
              <article className="qz-console__item" key={event.id}>
                <time className="qz-console__time" dateTime={event.occurredAt}>
                  {dateTime(event.occurredAt)}
                </time>
                <div>
                  <p className="qz-console__title">{event.title}</p>
                  <p className="qz-console__detail">{event.detail}</p>
                  <span className="qz-console__scope-tag">
                    {batch ? `RUBRO · ${batch.etapa}` : "RUBRO/JOB · NO INSTRUMENTADO"}
                  </span>
                </div>
              </article>
            );
          })
        ) : (
          <div className="qz-console__empty">
            No hay eventos persistidos. La consola permanece vacía: no genera actividad visual.
          </div>
        )}
      </div>
    </aside>
  );
}

function DecisionGate({ snapshot }: { snapshot: QuoteWorkspaceSnapshot }) {
  return (
    <section className="qz-decision" aria-labelledby="decision-title">
      <div className="qz-decision__section">
        <p className="qz-kicker">DECISION GATE</p>
        <h2 id="decision-title">
          {snapshot.decision.readyForCostDecision
            ? "Costo listo para decisión"
            : "Costo todavía bloqueado"}
        </h2>

        <div className="qz-decision-columns">
          <div>
            <p className="qz-label">EZE DEBE RESPONDER</p>
            <ul className="qz-list">
              {snapshot.decision.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="qz-label">SIGUE SIN VERIFICAR</p>
            <ul className="qz-list">
              {snapshot.decision.unverified.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="qz-gates">
          <div className="qz-gate">
            <LockKeyhole size={18} aria-hidden="true" />
            <div>
              <strong>Preparación de propuesta bloqueada</strong>
              <span>
                El número final y el margen deben quedar aprobados explícitamente antes de redactar
                para cliente.
              </span>
            </div>
          </div>
          <div className="qz-gate">
            <LockKeyhole size={18} aria-hidden="true" />
            <div>
              <strong>Handoff a App RAVN bloqueado</strong>
              <span>
                Este v1 no escribe ni usa el endpoint legacy que también crea obra y presupuesto.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="qz-decision__section">
        <p className="qz-kicker">GUARD DE DISPATCH</p>
        <h2>Sin presupuesto operativo</h2>
        <div className="qz-dispatch">
          <div className="qz-dispatch__meter">
            <div className="qz-dispatch__metric">
              <strong>N/D</strong>
              <span>Usado</span>
            </div>
            <div className="qz-dispatch__metric">
              <strong>N/D</strong>
              <span>Reservado</span>
            </div>
            <div className="qz-dispatch__metric">
              <strong>N/D</strong>
              <span>Tope</span>
            </div>
          </div>
          <button className="qz-primary-action" type="button" disabled>
            Despachar trabajos · no disponible
          </button>
          <p className="qz-meta">{snapshot.budget.dispatchDisabledReason}</p>
          <p className="qz-meta">
            COLA REAL: N/D · EN EJECUCIÓN: N/D · JOBS: N/D
          </p>
        </div>
      </div>
    </section>
  );
}
