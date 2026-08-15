"use client";

import {
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileCheck2,
  FileText,
  Link2,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from "react";
import type {
  BatchItem,
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

type MobileTab = "conversar" | "equipo" | "cotizacion";

type LocalPreviewMessage = {
  id: string;
  text: string;
  occurredAt: string;
};

type Workstation = {
  id: "fable" | "codex" | "sources" | "verification";
  label: string;
  remit: string;
  status: string;
  action: string;
  artifact: string;
  batchIds: string[];
  evidenceCount: number;
  observed: boolean;
  icon: LucideIcon;
};

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

const TIME = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});

const STAGE_LABELS: Record<QuoteWorkspaceSnapshot["core"]["stage"], string> = {
  intake: "Relevando el trabajo",
  cost_review: "Armando el costo",
  legacy_approved: "Número aprobado",
  rejected: "Cotización rechazada",
  legacy_document_emitted: "Documento emitido",
};

const CONFIDENCE_LABELS: Record<QuoteWorkspaceSnapshot["core"]["confidence"]["level"], string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  sin_calcular: "Sin calcular",
};

const ORIGIN_LABELS: Record<string, string> = {
  sismat: "SISMAT",
  internet: "Internet",
  retail: "Retail",
  eze: "Número de Eze",
  extra: "Extra",
};

const CHECK_LABELS: Record<
  QuoteWorkspaceSnapshot["observability"]["checks"][number]["id"],
  string
> = {
  checklist: "Alcance y requisitos",
  sanity: "Cantidades y rendimientos",
  stale_prices: "Vigencia de precios",
  divergences: "Cruce entre fuentes",
  open_doubts: "Preguntas abiertas",
};

const GAP_LABELS: Record<
  QuoteWorkspaceSnapshot["observability"]["instrumentationGaps"][number],
  string
> = {
  per_agent_heartbeat: "actividad individual por rol",
  job_runtime: "asignación y progreso por tarea",
  queue_runtime: "cola de investigación",
  credit_budget: "presupuesto y consumo de créditos",
  deterministic_process_run: "identificador de cada cálculo",
};

function money(value: number | null): string {
  return value == null ? "Sin costo calculado" : MONEY.format(value);
}

function compactMoney(value: number | null): string {
  return value == null ? "—" : COMPACT_MONEY.format(value);
}

function initialBatchId(snapshot: QuoteWorkspaceSnapshot): string | null {
  return snapshot.batches.find((batch) => batch.currentBlocker)?.id ?? snapshot.batches[0]?.id ?? null;
}

function eventTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : TIME.format(parsed);
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

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function batchFromLabel(batches: readonly QuoteBatch[], label: string): QuoteBatch | null {
  const normalized = label.trim().toLocaleLowerCase("es-AR");
  if (!normalized) return null;
  return (
    batches.find((batch) => batch.etapa.trim().toLocaleLowerCase("es-AR") === normalized) ?? null
  );
}

function batchForEvent(batches: readonly QuoteBatch[], event: QuoteEvent): QuoteBatch | null {
  if (event.type === "source_evidence") {
    return batches.find((batch) => batch.evidence.some((item) => item.id === event.evidence.id)) ?? null;
  }
  if (event.type === "message") return batchFromLabel(batches, event.message.etiqueta);
  return null;
}

function latestMessageFor(
  events: readonly QuoteEvent[],
  author: "fable" | "codex"
): Extract<QuoteEvent, { type: "message" }> | null {
  return (
    [...events]
      .reverse()
      .find(
        (event): event is Extract<QuoteEvent, { type: "message" }> =>
          event.type === "message" && event.message.autor === author
      ) ?? null
  );
}

function roleById(snapshot: QuoteWorkspaceSnapshot, id: QuoteRole["id"]): QuoteRole | null {
  return snapshot.roles.find((role) => role.id === id) ?? null;
}

function modelBatchIds(
  snapshot: QuoteWorkspaceSnapshot,
  author: "fable" | "codex"
): string[] {
  return unique(
    snapshot.events.flatMap((event) => {
      if (event.type !== "message" || event.message.autor !== author) return [];
      const batch = batchFromLabel(snapshot.batches, event.message.etiqueta);
      return batch ? [batch.id] : [];
    })
  );
}

function buildWorkstations(snapshot: QuoteWorkspaceSnapshot): Workstation[] {
  const fable = roleById(snapshot, "fable");
  const codex = roleById(snapshot, "codex");
  const fableMessage = latestMessageFor(snapshot.events, "fable");
  const codexMessage = latestMessageFor(snapshot.events, "codex");
  const sourceRows = snapshot.observability.sources.filter((source) => source.evidenceCount > 0);
  const sourceCount = sourceRows.reduce((sum, source) => sum + source.evidenceCount, 0);
  const sourceBatchIds = unique(sourceRows.flatMap((source) => source.affectedBatchIds));
  const sourceNames = sourceRows
    .map((source) => ORIGIN_LABELS[source.origin] ?? source.origin)
    .join(" · ");
  const persistedChecks = snapshot.observability.checks.filter(
    (check) => check.status === "persisted"
  );
  const checkCount = persistedChecks.reduce((sum, check) => sum + check.persistedCount, 0);
  const findingCount = persistedChecks.reduce((sum, check) => sum + check.findings.length, 0);
  const checkBatchIds = unique(persistedChecks.flatMap((check) => check.affectedBatchIds));

  const workstationForMessage = (
    id: "fable" | "codex",
    label: string,
    remit: string,
    icon: LucideIcon,
    role: QuoteRole | null,
    message: Extract<QuoteEvent, { type: "message" }> | null
  ): Workstation => {
    const batch = message ? batchFromLabel(snapshot.batches, message.message.etiqueta) : null;
    return {
      id,
      label,
      remit,
      status: message ? "APORTE REGISTRADO" : "SIN ACTIVIDAD OBSERVADA",
      action: message?.detail ?? "Todavía no hay un análisis guardado para esta cotización.",
      artifact: message
        ? `${message.message.etiqueta} · ${eventTime(message.occurredAt)}`
        : "Sin artefacto o mensaje persistido",
      batchIds: batch ? [batch.id] : [],
      evidenceCount: role?.persistedEvidenceCount ?? 0,
      observed: Boolean(message),
      icon,
    };
  };

  return [
    workstationForMessage(
      "codex",
      "Codex",
      "Método y alcance",
      FileText,
      codex,
      codexMessage
    ),
    workstationForMessage(
      "fable",
      "Fable",
      "Investigación y alternativas",
      ScanSearch,
      fable,
      fableMessage
    ),
    {
      id: "sources",
      label: "Precios y fuentes",
      remit: "SISMAT · proveedores · web",
      status: sourceCount > 0 ? "EVIDENCIA REGISTRADA" : "SIN FUENTES OBSERVADAS",
      action:
        sourceCount > 0
          ? `${sourceCount} referencias fechadas alimentan ${sourceBatchIds.length} rubro(s).`
          : "No hay precios con fuente y fecha guardados para esta cotización.",
      artifact: sourceNames || "Sin origen persistido",
      batchIds: sourceBatchIds,
      evidenceCount: sourceCount,
      observed: sourceCount > 0,
      icon: Search,
    },
    {
      id: "verification",
      label: "Control de costo",
      remit: "Cantidades · vigencia · duplicados",
      status: checkCount > 0 ? "CONTROL REGISTRADO" : "SIN CONTROL OBSERVADO",
      action:
        checkCount > 0
          ? `${checkCount} controles guardados; ${findingCount} resultado(s) para revisar.`
          : "No hay una revisión completa guardada para mostrar.",
      artifact: checkCount > 0 ? "Revisión determinística" : "Sin salida de control",
      batchIds: checkBatchIds,
      evidenceCount: checkCount,
      observed: checkCount > 0,
      icon: ShieldCheck,
    },
  ];
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
    initialBatchId(initialData.snapshot)
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>("conversar");
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalPreviewMessage[]>([]);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const snapshot = data.snapshot;
  const selectedBatch =
    snapshot.batches.find((batch) => batch.id === selectedBatchId) ?? snapshot.batches[0] ?? null;
  const workstations = useMemo(() => buildWorkstations(snapshot), [snapshot]);
  const events = useMemo(() => [...snapshot.events].reverse(), [snapshot.events]);

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
            : initialBatchId(payload.snapshot)
        );
        setLocalMessages([]);
        setComposerNotice(null);
        window.history.replaceState(null, "", `/?quote=${encodeURIComponent(quoteId)}`);
      } catch (error) {
        setRefreshError(
          error instanceof Error ? error.message : "No se pudo actualizar la cotización."
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
      if (document.visibilityState === "visible") void loadQuote(snapshot.quote.id, false);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadQuote, preview, snapshot.quote.id]);

  const submitPreviewMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!preview || !text) return;
    setLocalMessages((current) => [
      ...current,
      { id: `local:${Date.now()}`, text, occurredAt: new Date().toISOString() },
    ]);
    setDraft("");
    setComposerNotice("Entrada agregada a esta demostración. No se despachó ningún trabajo.");
  };

  const focusConversation = () => {
    setMobileTab("conversar");
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const connectionLabel =
    snapshot.observability.bridge.heartbeat === "fresh"
      ? "Datos actualizados"
      : snapshot.observability.bridge.heartbeat === "stale_or_absent"
        ? "Actualización demorada"
        : "Estado no consultado";

  return (
    <div className="qz-shell">
      <header className="qz-header">
        <Link className="qz-brand" href="/" aria-label="Cotizador RAVN, inicio">
          <span className="qz-brand__mark">RAVN</span>
          <span className="qz-brand__product">COTIZADOR</span>
        </Link>

        <div className="qz-quote-picker">
          <label className="qz-sr-only" htmlFor="quote-picker">
            Cotización abierta
          </label>
          <select
            id="quote-picker"
            value={snapshot.quote.id}
            disabled={busy || preview}
            onChange={(event) => void loadQuote(event.target.value)}
          >
            {data.quotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.title}
              </option>
            ))}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </div>

        <div className="qz-header__state">
          {preview ? <span className="qz-preview-chip">PREVIEW</span> : null}
          <span className="qz-connection" data-state={snapshot.observability.bridge.heartbeat}>
            <span aria-hidden="true" />
            {connectionLabel}
          </span>
          <motion.button
            type="button"
            className="qz-icon-action"
            aria-label="Actualizar cotización"
            title="Actualizar cotización"
            disabled={busy || preview}
            onClick={() => void loadQuote(snapshot.quote.id)}
            animate={{ rotate: busy && !reduceMotion ? 180 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </motion.button>
        </div>
      </header>

      {refreshError ? (
        <div className="qz-inline-error" role="status" aria-live="polite">
          {refreshError} Se conserva el último estado disponible.
        </div>
      ) : null}

      <nav className="qz-mobile-tabs" aria-label="Áreas del cotizador">
        {(
          [
            ["conversar", "Conversar", MessageSquare],
            ["equipo", "Equipo", Link2],
            ["cotizacion", "Cotización", FileCheck2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            aria-current={mobileTab === id ? "page" : undefined}
            onClick={() => setMobileTab(id)}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      <main className="qz-workspace">
        <ConversationDesk
          snapshot={snapshot}
          preview={preview}
          active={mobileTab === "conversar"}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={submitPreviewMessage}
          localMessages={localMessages}
          notice={composerNotice}
          composerRef={composerRef}
          reduceMotion={Boolean(reduceMotion)}
        />

        <div className="qz-deck">
          <FormationBoard
            snapshot={snapshot}
            selectedBatch={selectedBatch}
            onSelectBatch={setSelectedBatchId}
            onAnswer={focusConversation}
            active={mobileTab === "cotizacion"}
            preview={preview}
            reduceMotion={Boolean(reduceMotion)}
          />

          <TeamWorkspace
            snapshot={snapshot}
            stations={workstations}
            events={events}
            selectedBatch={selectedBatch}
            onSelectBatch={setSelectedBatchId}
            active={mobileTab === "equipo"}
            reduceMotion={Boolean(reduceMotion)}
          />
        </div>
      </main>

      <TechnicalDetails snapshot={snapshot} selectedBatch={selectedBatch} events={events} />
    </div>
  );
}

function ConversationDesk({
  snapshot,
  preview,
  active,
  draft,
  onDraftChange,
  onSubmit,
  localMessages,
  notice,
  composerRef,
  reduceMotion,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  preview: boolean;
  active: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  localMessages: LocalPreviewMessage[];
  notice: string | null;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  reduceMotion: boolean;
}) {
  const thread = snapshot.events.filter(
    (event): event is Extract<QuoteEvent, { type: "message" }> =>
      event.type === "message" &&
      (event.message.autor === "eze" || event.message.autor === "sistema")
  );

  return (
    <section
      className="qz-conversation qz-mobile-panel"
      data-mobile-active={active}
      aria-labelledby="conversation-title"
    >
      <header className="qz-column-header">
        <div>
          <h1 id="conversation-title">Decime qué trabajo querés cotizar</h1>
          <p>Contame el alcance o respondé lo que falta. El equipo ordena el resto por rubros.</p>
        </div>
      </header>

      <div className="qz-current-matter">
        <span>Ahora</span>
        <strong>{snapshot.quote.title}</strong>
        <small>{STAGE_LABELS[snapshot.core.stage]}</small>
      </div>

      <div className="qz-thread" role="log" aria-label="Conversación de la cotización">
        {thread.length === 0 && localMessages.length === 0 ? (
          <div className="qz-thread-empty">
            <MessageSquare size={22} strokeWidth={1.4} aria-hidden="true" />
            <p>No hay una conversación guardada para esta cotización.</p>
            <span>El pedido y las respuestas aparecerán acá cuando estén disponibles.</span>
          </div>
        ) : null}

        {thread.map((event) => {
          const fromEze = event.message.autor === "eze";
          return (
            <article className="qz-message" data-author={fromEze ? "eze" : "ravn"} key={event.id}>
              <div className="qz-message__meta">
                <span>{fromEze ? "EZE" : "RAVN"}</span>
                <time dateTime={event.occurredAt}>{eventTime(event.occurredAt)}</time>
              </div>
              <p>{event.detail}</p>
            </article>
          );
        })}

        <AnimatePresence initial={false}>
          {localMessages.map((message) => (
            <motion.article
              className="qz-message"
              data-author="eze"
              key={message.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
            >
              <div className="qz-message__meta">
                <span>EZE</span>
                <time dateTime={message.occurredAt}>{eventTime(message.occurredAt)}</time>
              </div>
              <p>{message.text}</p>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>

      <form className="qz-composer" onSubmit={onSubmit}>
        <label className="qz-sr-only" htmlFor="quote-command">
          Escribí el pedido o una respuesta para el cotizador
        </label>
        <textarea
          id="quote-command"
          ref={composerRef}
          value={draft}
          disabled={!preview}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={
            preview
              ? "Ej.: El porcelanato es 60 × 60 y la grifería va embutida…"
              : "La conversación todavía no está habilitada en esta versión."
          }
          rows={4}
        />
        <div className="qz-composer__footer">
          <button type="button" className="qz-attach" disabled aria-label="Adjuntar archivo">
            <Paperclip size={17} aria-hidden="true" />
            <span>Adjuntar</span>
          </button>
          <span className="qz-composer__state">
            {preview ? "Demostración local" : "Escritura pendiente"}
          </span>
          <motion.button
            className="qz-send"
            type="submit"
            disabled={!preview || draft.trim().length === 0}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            aria-label="Enviar al cotizador"
          >
            <ArrowUp size={18} aria-hidden="true" />
          </motion.button>
        </div>
      </form>
      <p className="qz-composer-notice" role="status" aria-live="polite">
        {notice ??
          (preview
            ? "Podés probar la entrada; no activa agentes ni modifica datos."
            : "Esta versión muestra la conversación existente pero todavía no puede enviar respuestas.")}
      </p>
    </section>
  );
}

function TeamWorkspace({
  snapshot,
  stations,
  events,
  selectedBatch,
  onSelectBatch,
  active,
  reduceMotion,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  stations: Workstation[];
  events: QuoteEvent[];
  selectedBatch: QuoteBatch | null;
  onSelectBatch: (id: string) => void;
  active: boolean;
  reduceMotion: boolean;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const codexBatchIds = modelBatchIds(snapshot, "codex");
  const fableBatchIds = modelBatchIds(snapshot, "fable");
  const modelCoverage = unique([...codexBatchIds, ...fableBatchIds]);
  const sharedBatchIds = codexBatchIds.filter((id) => fableBatchIds.includes(id));
  const complementaryBatchIds = modelCoverage.filter((id) => !sharedBatchIds.includes(id));
  const untouchedBatches = snapshot.batches.filter((batch) => !modelCoverage.includes(batch.id));
  const sharedNames = sharedBatchIds
    .map((id) => snapshot.batches.find((batch) => batch.id === id)?.etapa)
    .filter((name): name is string => Boolean(name));
  const modelContributionCount = stations.reduce((sum, station) => sum + station.evidenceCount, 0);

  return (
    <section
      className="qz-team qz-mobile-panel"
      data-mobile-active={active}
      aria-labelledby="team-title"
    >
      <header className="qz-section-bar">
        <div>
          <h2 id="team-title">Codex + Fable contrastan el mismo pedido</h2>
          <p>Sus aportes se cruzan por rubro; fuentes y controles validan qué entra al costo.</p>
        </div>
        <span className="qz-column-state">{modelContributionCount} aportes</span>
      </header>

      <div className="qz-team-grid" aria-label="Aportes de modelos, fuentes y controles">
        {stations.map((station) => (
          <WorkstationCard
            key={station.id}
            snapshot={snapshot}
            station={station}
            selectedBatch={selectedBatch}
            onSelectBatch={onSelectBatch}
            reduceMotion={reduceMotion}
            expand={
              station.id === "sources" && station.evidenceCount > 0
                ? {
                    open: sourcesOpen,
                    count: station.evidenceCount,
                    onToggle: () => setSourcesOpen((current) => !current),
                  }
                : undefined
            }
          />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {sourcesOpen ? (
          <motion.div
            id="qz-sources-panel"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <SourcesPanel snapshot={snapshot} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="qz-model-comparison" aria-label="Cruce entre los dos modelos">
        <div>
          <span>Cruces por rubro</span>
          <strong>{sharedNames.length > 0 ? sharedNames.join(" · ") : "Ninguno guardado"}</strong>
        </div>
        <div>
          <span>Se complementan</span>
          <strong>{complementaryBatchIds.length} rubro(s)</strong>
        </div>
        <div>
          <span>Divergencias</span>
          <strong>Sin comparación persistida</strong>
        </div>
        <div>
          <span>Huecos de ambos</span>
          <strong>{untouchedBatches.length} rubro(s)</strong>
        </div>
      </div>

      <div className="qz-activity-strip" aria-label="Últimos movimientos registrados">
        <div className="qz-activity-strip__title">
          <span>Qué cambió</span>
          <strong>{snapshot.events.length}</strong>
        </div>
        {events.slice(0, 3).map((event) => {
          const batch = batchForEvent(snapshot.batches, event);
          return (
            <article key={event.id}>
              <time dateTime={event.occurredAt}>{eventTime(event.occurredAt)}</time>
              <div>
                <strong>{event.title}</strong>
                <span>{batch?.etapa ?? "Cotización general"}</span>
              </div>
            </article>
          );
        })}
        {events.length === 0 ? <p>No hay movimientos guardados.</p> : null}
      </div>
    </section>
  );
}

function WorkstationCard({
  snapshot,
  station,
  selectedBatch,
  onSelectBatch,
  reduceMotion,
  expand,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  station: Workstation;
  selectedBatch: QuoteBatch | null;
  onSelectBatch: (id: string) => void;
  reduceMotion: boolean;
  expand?: { open: boolean; count: number; onToggle: () => void };
}) {
  const linkedToSelected = Boolean(selectedBatch && station.batchIds.includes(selectedBatch.id));
  return (
    <motion.article
      className="qz-station"
      data-observed={station.observed}
      data-linked={linkedToSelected}
      layout
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
    >
      <header>
        <station.icon size={18} strokeWidth={1.5} aria-hidden="true" />
        <div>
          <h3>{station.label}</h3>
          <p>{station.remit}</p>
        </div>
        <span>{station.status}</span>
      </header>
      <p className="qz-station__action">{station.action}</p>
      {expand ? (
        <button
          type="button"
          className="qz-station__expand"
          aria-expanded={expand.open}
          aria-controls="qz-sources-panel"
          onClick={expand.onToggle}
        >
          {expand.open ? "Ocultar el detalle" : `Ver los ${expand.count} precios con fuente`}
          <ChevronDown size={14} aria-hidden="true" data-open={expand.open} />
        </button>
      ) : null}
      <footer>
        <span>
          <FileCheck2 size={14} aria-hidden="true" />
          {station.artifact}
        </span>
        <strong>{station.evidenceCount}</strong>
      </footer>
      <div className="qz-station__rubros">
        {station.batchIds.length > 0 ? (
          station.batchIds.slice(0, 2).map((id) => {
            const batch = snapshot.batches.find((item) => item.id === id);
            if (!batch) return null;
            return (
              <button type="button" key={id} onClick={() => onSelectBatch(id)}>
                {batch.etapa}
              </button>
            );
          })
        ) : (
          <span>Sin rubro enlazado</span>
        )}
      </div>
    </motion.article>
  );
}

function itemSourceFlag(item: BatchItem): string | null {
  if (!item.priced) return "Sin precio de costo";
  if (item.corroborated) return null;
  if (item.origins.length === 1 && item.origins[0] === "sismat") {
    return "Solo SISMAT · falta contraste en internet";
  }
  return "Una sola fuente · falta contraste";
}

function SourcesPanel({ snapshot }: { snapshot: QuoteWorkspaceSnapshot }) {
  const extras = snapshot.events.filter(
    (event): event is Extract<QuoteEvent, { type: "source_evidence" }> =>
      event.type === "source_evidence" && event.evidence.origin === "extra"
  );

  return (
    <section className="qz-sources" aria-label="Todos los precios con fuente y fecha">
      {snapshot.batches.map((batch) => {
        if (batch.evidence.length === 0) return null;
        return (
          <div className="qz-sources__group" key={batch.id}>
            <h3>
              {batch.etapa}
              <span>{batch.evidence.length} precio(s)</span>
            </h3>
            {batch.items
              .filter((item) => item.origins.length > 0)
              .map((item) => {
                const rows = batch.evidence.filter((entry) => entry.item === item.name);
                const flag = itemSourceFlag(item);
                return (
                  <div className="qz-sources__item" key={item.name}>
                    <div className="qz-sources__item-head">
                      <strong>{item.name}</strong>
                      {flag ? <span className="qz-sources__flag">{flag}</span> : null}
                    </div>
                    <ul>
                      {rows.map((evidence) => {
                        const href = sourceUrl(evidence.source);
                        return (
                          <li key={evidence.id}>
                            <span className="qz-sources__origin">
                              {ORIGIN_LABELS[evidence.origin] ?? evidence.origin}
                            </span>
                            <p>{evidence.source}</p>
                            <span className="qz-sources__value">
                              {money(evidence.value)} · {dateTime(evidence.date)}
                            </span>
                            {href ? (
                              <a href={href} target="_blank" rel="noreferrer">
                                Abrir <ArrowUp size={12} aria-hidden="true" />
                              </a>
                            ) : (
                              <span className="qz-sources__nolink">Sin link</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
          </div>
        );
      })}

      {extras.length > 0 ? (
        <div className="qz-sources__group">
          <h3>
            Extras fuera de receta
            <span>{extras.length} precio(s)</span>
          </h3>
          {extras.map((event) => {
            const href = sourceUrl(event.evidence.source);
            return (
              <div className="qz-sources__item" key={event.id}>
                <div className="qz-sources__item-head">
                  <strong>{event.evidence.item}</strong>
                </div>
                <ul>
                  <li>
                    <span className="qz-sources__origin">Extra</span>
                    <p>{event.evidence.source}</p>
                    <span className="qz-sources__value">
                      {money(event.evidence.value)} · {dateTime(event.evidence.date)}
                    </span>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer">
                        Abrir <ArrowUp size={12} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="qz-sources__nolink">Sin link</span>
                    )}
                  </li>
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function FormationBoard({
  snapshot,
  selectedBatch,
  onSelectBatch,
  onAnswer,
  active,
  preview,
  reduceMotion,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  selectedBatch: QuoteBatch | null;
  onSelectBatch: (id: string) => void;
  onAnswer: () => void;
  active: boolean;
  preview: boolean;
  reduceMotion: boolean;
}) {
  const question = snapshot.decision.questions[0] ?? selectedBatch?.currentBlocker ?? null;
  const ready = snapshot.orchestration.readyToConsolidateBatchIds.length;
  const waiting = snapshot.orchestration.blockedBatchIds.length;
  const blockedBatches = snapshot.batches.filter((batch) => batch.currentBlocker);
  const questionBatch = blockedBatches.length === 1 ? blockedBatches[0] : null;
  const coverage = snapshot.core.sourceCoverage.percent;
  const confidence = snapshot.core.confidence.level;

  return (
    <section
      className="qz-board qz-mobile-panel"
      data-mobile-active={active}
      aria-labelledby="formation-title"
    >
      <header className="qz-section-bar">
        <div>
          <h2 id="formation-title">Cotización en formación</h2>
          <p>{snapshot.quote.title}</p>
        </div>
        <span className="qz-column-state">{STAGE_LABELS[snapshot.core.stage]}</span>
      </header>

      <div className="qz-board-grid">
        <article className="qz-kpi qz-kpi--cost" aria-label="Rango de costo">
          <span className="qz-kpi__label">Rango estimado</span>
          <strong>
            {compactMoney(snapshot.core.costRange.min)} — {compactMoney(snapshot.core.costRange.max)}
          </strong>
          <small>
            {money(snapshot.core.costRange.min)} — {money(snapshot.core.costRange.max)}
          </small>
        </article>

        <CompositionCard snapshot={snapshot} reduceMotion={reduceMotion} />

        <div className="qz-kpi-stack">
          <article
            className="qz-kpi qz-kpi--confidence"
            data-level={confidence}
            aria-label={`Confianza del costo: ${CONFIDENCE_LABELS[confidence]}`}
          >
            <span className="qz-kpi__label">Confianza</span>
            <strong>{CONFIDENCE_LABELS[confidence]}</strong>
            <i className="qz-meter" aria-hidden="true">
              <span />
              <span />
              <span />
            </i>
            <small>{coverage}% del costo con fuente y fecha</small>
          </article>
          <article className="qz-kpi" aria-label={`Rubros listos: ${ready} de ${snapshot.batches.length}`}>
            <span className="qz-kpi__label">Rubros listos</span>
            <strong>
              {ready}
              <i>/{snapshot.batches.length}</i>
            </strong>
            <small>{waiting > 0 ? `${waiting} esperan respuesta` : "ninguno espera respuesta"}</small>
          </article>
        </div>

        <section className="qz-rubro-board" aria-labelledby="rubro-board-title">
          <div className="qz-rubro-board__heading">
            <h3 id="rubro-board-title">Rubros</h3>
            <span>{snapshot.batches.length}</span>
          </div>
          <div className="qz-rubro-board__list">
            {snapshot.batches.map((batch) => {
              const expanded = selectedBatch?.id === batch.id;
              return (
                <div className="qz-rubro" key={batch.id}>
                  <button
                    type="button"
                    data-state={batch.currentBlocker ? "warn" : "ok"}
                    aria-pressed={expanded}
                    aria-expanded={expanded}
                    onClick={() => onSelectBatch(batch.id)}
                  >
                    <div>
                      <strong>{batch.etapa}</strong>
                      <span>
                        {batch.itemCount} ítem(s) · {batch.evidence.length} evidencias
                      </span>
                    </div>
                    <span className="qz-rubro-board__pct">{batch.sourceCoverage.percent}%</span>
                    <i aria-hidden="true">
                      <span style={{ "--qz-progress": `${batch.sourceCoverage.percent}%` } as CSSProperties} />
                    </i>
                    <small>{batch.currentBlocker ?? "Costo cubierto con fuentes persistidas."}</small>
                  </button>
                  <AnimatePresence initial={false}>
                    {expanded ? (
                      <motion.div
                        className="qz-rubro-items"
                        role="region"
                        aria-label={`Qué contempla ${batch.etapa}`}
                        initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <ul>
                          {batch.items.map((item) => (
                            <li key={item.name} data-priced={item.priced}>
                              <div className="qz-rubro-items__head">
                                <strong>{item.name}</strong>
                                <span>
                                  {item.priced
                                    ? rangeMoney(item.subtotalMin, item.subtotalMax)
                                    : "Sin precio"}
                                </span>
                              </div>
                              <small>
                                {item.tipo === "mano_de_obra" ? "Mano de obra" : "Material"} ·{" "}
                                {item.cantidad} {item.unidad}
                                {item.manual ? " · agregado en la mesa" : ""}
                                {item.origins.length > 0
                                  ? ` · ${item.origins
                                      .map((origin) => ORIGIN_LABELS[origin] ?? origin)
                                      .join(" + ")}`
                                  : ""}
                              </small>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
            {snapshot.batches.length === 0 ? <p>No hay rubros guardados para formar el costo.</p> : null}
          </div>
        </section>

        <div className="qz-decision-cell">
          <AnimatePresence mode="wait" initial={false}>
            {question ? (
              <motion.section
                className="qz-question"
                key={question}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
                aria-labelledby="question-title"
              >
                <CircleHelp size={20} strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <h3 id="question-title">Necesitamos tu respuesta</h3>
                  <p>{question}</p>
                  <small>{questionBatch ? `Afecta ${questionBatch.etapa}` : "Afecta la cotización"}</small>
                </div>
                <button type="button" onClick={onAnswer}>
                  {preview ? "Responder en conversación" : "Ver conversación"}
                  <ArrowUp size={15} aria-hidden="true" />
                </button>
              </motion.section>
            ) : (
              <motion.section
                className="qz-question qz-question--ready"
                key="ready"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              >
                <CheckCircle2 size={20} strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <h3>Costo listo para decidir</h3>
                  <p>No quedan respuestas de Eze registradas como pendientes.</p>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <footer className="qz-decision-lock">
            <LockKeyhole size={18} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <strong>Propuesta todavía no habilitada</strong>
              <span>Primero se confirma el número final y el margen.</span>
            </div>
          </footer>
        </div>
      </div>
    </section>
  );
}

type CompositionMeasure = "todo" | "solo_mo";

/**
 * Paleta categórica RAVN para rubros, validada (dataviz) sobre #0a0a0a:
 * banda L dark, croma ≥ 0.10, ΔE adyacente CVD ≥ 8, contraste ≥ 3:1.
 * Orden fijo por rubro; los acentos de estado (salvia/ámbar/óxido) quedan reservados.
 */
const RUBRO_SLICE_COLORS = ["#3f72b3", "#c9739a", "#118066", "#8d78cf", "#8f9440"] as const;
const FOLD_SLICE_COLOR = "#918e87";
const EXTRA_SLICE_COLOR = "#5c5952";
const MAX_RUBRO_SLICES = RUBRO_SLICE_COLORS.length;

type CompositionSlice = {
  key: string;
  label: string;
  min: number;
  max: number;
  color: string;
};

function compositionSlices(
  snapshot: QuoteWorkspaceSnapshot,
  measure: CompositionMeasure
): CompositionSlice[] {
  const rubros = snapshot.batches.map((batch, index) => {
    const range = measure === "todo" ? batch.priceRange : batch.laborRange;
    return {
      key: batch.id,
      label: batch.etapa,
      min: range.min ?? 0,
      max: range.max ?? 0,
      color: index < MAX_RUBRO_SLICES ? RUBRO_SLICE_COLORS[index] : FOLD_SLICE_COLOR,
      folded: index >= MAX_RUBRO_SLICES,
    };
  });
  const slices: CompositionSlice[] = rubros.filter((rubro) => !rubro.folded && rubro.max > 0);
  const folded = rubros.filter((rubro) => rubro.folded && rubro.max > 0);
  if (folded.length > 0) {
    slices.push({
      key: "fold",
      label: `Otros (${folded.length} rubros)`,
      min: folded.reduce((sum, rubro) => sum + rubro.min, 0),
      max: folded.reduce((sum, rubro) => sum + rubro.max, 0),
      color: FOLD_SLICE_COLOR,
    });
  }
  const composition = snapshot.core.composition;
  if (measure === "todo" && composition && composition.extrasMax > 0) {
    slices.push({
      key: "extras",
      label: "Extras",
      min: composition.extrasMin,
      max: composition.extrasMax,
      color: EXTRA_SLICE_COLOR,
    });
  }
  return slices;
}

function rangeMoney(min: number, max: number): string {
  return min === max ? compactMoney(max) : `${compactMoney(min)} — ${compactMoney(max)}`;
}

function Donut({
  slices,
  total,
  reduceMotion,
}: {
  slices: CompositionSlice[];
  total: number;
  reduceMotion: boolean;
}) {
  const gap = slices.length > 1 ? 1.4 : 0;
  let start = 0;
  return (
    <svg className="qz-donut" viewBox="0 0 120 120" aria-hidden="true">
      <g transform="rotate(-90 60 60)">
        {slices.map((slice) => {
          const percent = (slice.max / total) * 100;
          const length = Math.max(percent - gap, 0.4);
          const offset = -(start + gap / 2);
          start += percent;
          return (
            <motion.circle
              key={slice.key}
              cx={60}
              cy={60}
              r={48}
              pathLength={100}
              fill="none"
              stroke={slice.color}
              strokeWidth={13}
              initial={false}
              animate={{
                strokeDasharray: `${length} ${100 - length}`,
                strokeDashoffset: offset,
              }}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          );
        })}
      </g>
    </svg>
  );
}

function CompositionCard({
  snapshot,
  reduceMotion,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  reduceMotion: boolean;
}) {
  const [measure, setMeasure] = useState<CompositionMeasure>("todo");
  const slices = compositionSlices(snapshot, measure);
  const total = slices.reduce((sum, slice) => sum + slice.max, 0);
  const composition = snapshot.core.composition;
  const splitTotal = composition ? composition.laborMax + composition.materialsMax : 0;

  return (
    <article className="qz-kpi qz-kpi--mix" aria-label="Composición del costo">
      <header className="qz-mix-head">
        <span className="qz-kpi__label">Composición del costo</span>
        <div className="qz-mix-toggle" role="group" aria-label="Medida de la composición">
          <button
            type="button"
            aria-pressed={measure === "todo"}
            onClick={() => setMeasure("todo")}
          >
            MO + materiales
          </button>
          <button
            type="button"
            aria-pressed={measure === "solo_mo"}
            onClick={() => setMeasure("solo_mo")}
          >
            Solo MO
          </button>
        </div>
      </header>

      {slices.length > 0 ? (
        <div className="qz-mix-body">
          <div className="qz-donut-wrap">
            <Donut slices={slices} total={total} reduceMotion={reduceMotion} />
            <div className="qz-donut-center">
              <strong>{compactMoney(total)}</strong>
              <small>techo del rango</small>
            </div>
          </div>
          <ul className="qz-mix-legend">
            {slices.map((slice) => (
              <li key={slice.key}>
                <i style={{ background: slice.color }} aria-hidden="true" />
                <span className="qz-mix-legend__name">{slice.label}</span>
                <span className="qz-mix-legend__val">
                  {rangeMoney(slice.min, slice.max)} ·{" "}
                  <b>{Math.round((slice.max / total) * 100)}%</b>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="qz-mix-empty">
          {measure === "solo_mo"
            ? "No hay mano de obra con subtotal persistido."
            : "Sin desglose persistido para componer el costo."}
        </p>
      )}

      {composition && splitTotal > 0 ? (
        <div
          className="qz-mix-split"
          role="img"
          aria-label={`Mano de obra ${rangeMoney(composition.laborMin, composition.laborMax)}, materiales ${rangeMoney(composition.materialsMin, composition.materialsMax)}`}
        >
          <i aria-hidden="true">
            <span
              className="qz-mix-split__mo"
              style={{ width: `${(composition.laborMax / splitTotal) * 100}%` }}
            />
            <span className="qz-mix-split__mat" />
          </i>
          <div>
            <span>
              <b>Mano de obra</b> {rangeMoney(composition.laborMin, composition.laborMax)} ·{" "}
              {Math.round((composition.laborMax / splitTotal) * 100)}%
            </span>
            <span>
              <b>Materiales</b> {rangeMoney(composition.materialsMin, composition.materialsMax)} ·{" "}
              {Math.round((composition.materialsMax / splitTotal) * 100)}%
            </span>
          </div>
        </div>
      ) : null}

      <small className="qz-mix-note">
        Costo directo persistido, antes de imprevistos y zona; participación sobre el techo del
        rango.
      </small>
    </article>
  );
}

function TechnicalDetails({
  snapshot,
  selectedBatch,
  events,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  selectedBatch: QuoteBatch | null;
  events: QuoteEvent[];
}) {
  return (
    <section className="qz-secondary" aria-label="Detalle de la cotización">
      <details id="technical-evidence">
        <summary>
          <span>Evidencia y controles</span>
          <small>{selectedBatch?.etapa ?? "Sin rubro seleccionado"}</small>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div className="qz-detail-body qz-detail-body--split">
          <div>
            <h3>Fuentes del rubro</h3>
            {selectedBatch && selectedBatch.evidence.length > 0 ? (
              <ul className="qz-evidence-list">
                {selectedBatch.evidence.map((evidence) => {
                  const href = sourceUrl(evidence.source);
                  return (
                    <li key={evidence.id}>
                      <span>{ORIGIN_LABELS[evidence.origin] ?? evidence.origin}</span>
                      <div>
                        <strong>{evidence.item}</strong>
                        <p>{evidence.source}</p>
                        <small>
                          {money(evidence.value)} · {dateTime(evidence.date)}
                        </small>
                      </div>
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer">
                          Abrir <ArrowUp size={13} aria-hidden="true" />
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No hay evidencia fechada para el rubro seleccionado.</p>
            )}
          </div>
          <div>
            <h3>Controles guardados</h3>
            <ul className="qz-check-list">
              {snapshot.observability.checks.map((check) => (
                <li key={check.id}>
                  <div>
                    <strong>{CHECK_LABELS[check.id]}</strong>
                    <span>{check.status === "persisted" ? check.persistedCount : "Sin salida"}</span>
                  </div>
                  {check.findings.slice(0, 4).map((finding, index) => (
                    <p key={`${finding.subject}:${index}`}>
                      {finding.subject}: {finding.detail}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <details>
        <summary>
          <span>Actividad completa</span>
          <small>{events.length} movimientos guardados</small>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div className="qz-detail-body">
          <ol className="qz-event-list">
            {events.map((event) => {
              const batch = batchForEvent(snapshot.batches, event);
              return (
                <li key={event.id}>
                  <time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.detail}</p>
                    <span>{batch?.etapa ?? "Cotización general"}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          {events.length === 0 ? <p>No hay actividad guardada para mostrar.</p> : null}
        </div>
      </details>

      <details>
        <summary>
          <span>Estado técnico</span>
          <small>Instrumentación parcial</small>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div className="qz-detail-body qz-detail-body--split">
          <div>
            <h3>Qué todavía no puede observarse</h3>
            <p>
              Esta versión no recibe todavía{" "}
              {snapshot.observability.instrumentationGaps
                .map((gap) => GAP_LABELS[gap])
                .join(", ")}.
            </p>
            <p>
              Por eso no atribuye tareas en cola, actividad en curso ni consumo a ningún agente.
            </p>
          </div>
          <div>
            <h3>Acciones protegidas</h3>
            <ul className="qz-protected-list">
              <li>
                <LockKeyhole size={16} aria-hidden="true" />
                Preparar la propuesta para el cliente
              </li>
              <li>
                <LockKeyhole size={16} aria-hidden="true" />
                Registrar la cotización final en App RAVN
              </li>
              <li>
                <LockKeyhole size={16} aria-hidden="true" />
                Despachar tareas o consumir créditos
              </li>
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}
