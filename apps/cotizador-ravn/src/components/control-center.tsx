"use client";

import {
  ArrowUp,
  ChevronDown,
  CircleSlash2,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import type {
  BatchItem,
  ItemOffer,
  QuoteBatch,
  QuoteEvent,
  QuoteSummary,
  QuoteWorkspaceSnapshot,
} from "../domain";
import { decisionRank } from "../domain/price-decision";
import { formatObservedDate as dateTime } from "./format-observed-date";
import {
  LiveTerminals,
  type BridgeConfig,
  type BridgeHealth,
  type WaveRequest,
} from "./live-terminals";
import { RavnIso } from "./ravn-iso";
import { RavnMark3D } from "./ravn-mark-3d";

type ControlCenterData = {
  quotes: QuoteSummary[];
  snapshot: QuoteWorkspaceSnapshot;
};

type MobileTab = "conversar" | "tablero" | "decidir";

type LocalPreviewMessage = {
  id: string;
  text: string;
  occurredAt: string;
};

/** Un ítem con su rubro: la unidad de decisión de la cola. */
type QueueEntry = {
  batch: QuoteBatch;
  item: BatchItem;
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
  maximumFractionDigits: 2,
});

const TIME = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

const STAGE_LABELS: Record<QuoteWorkspaceSnapshot["core"]["stage"], string> = {
  intake: "Relevando",
  cost_review: "Armando el costo",
  legacy_approved: "Número aprobado",
  rejected: "Rechazada",
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
  eze: "Tu número",
  extra: "Extra",
};

const DECISION_TAGS: Record<string, string> = {
  sin_precio: "SIN PRECIO",
  divergencia_critica: "FUENTES EN CONFLICTO",
  divergencia: "DISPERSIÓN ALTA",
  precio_vencido: "PRECIO VENCIDO",
  sin_contraste: "SIN CONTRASTE",
  cerrado: "CERRADO",
};

/** Paleta categórica RAVN por rubro, validada sobre #0a0a0a (dataviz). */
const RUBRO_COLORS = ["#3f72b3", "#c9739a", "#118066", "#8d78cf", "#8f9440", "#918e87"] as const;

function money(value: number | null): string {
  return value == null ? "N/D" : MONEY.format(value);
}

function compact(value: number | null): string {
  return value == null ? "N/D" : COMPACT_MONEY.format(value);
}

function signedPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "=";
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("es-AR")}%`;
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

function rubroColor(index: number): string {
  return RUBRO_COLORS[index % RUBRO_COLORS.length];
}

/** Ancho del rango: cuánto se puede mover el costo entre piso y techo. */
function rangeWidthPct(min: number | null, max: number | null): number | null {
  if (min == null || max == null || min <= 0) return null;
  return Math.round(((max - min) / min) * 1000) / 10;
}

function queueEntries(snapshot: QuoteWorkspaceSnapshot): QueueEntry[] {
  return snapshot.batches
    .flatMap((batch) => batch.items.map((item) => ({ batch, item })))
    .filter((entry) => entry.item.decision.kind !== "cerrado")
    .sort((left, right) => {
      const byRank = decisionRank(left.item.decision.kind) - decisionRank(right.item.decision.kind);
      return byRank !== 0 ? byRank : right.item.subtotalMax - left.item.subtotalMax;
    });
}

function isControlCenterData(value: unknown): value is ControlCenterData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ControlCenterData>;
  return Array.isArray(candidate.quotes) && Boolean(candidate.snapshot?.quote?.id);
}

export function ControlCenter({
  initialData,
  preview,
  bridge,
}: {
  initialData: ControlCenterData;
  preview: boolean;
  bridge: BridgeConfig | null;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const [data, setData] = useState(initialData);
  const [mobileTab, setMobileTab] = useState<MobileTab>("tablero");
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalPreviewMessage[]>([]);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [wave, setWave] = useState<WaveRequest | null>(null);
  const [health, setHealth] = useState<BridgeHealth>("off");
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const waveSeq = useRef(0);
  const requestInFlight = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const snapshot = data.snapshot;
  const queue = useMemo(() => queueEntries(snapshot), [snapshot]);

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
        setLocalMessages([]);
        setComposerNotice(null);
        setFocusedItem(null);
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

  /**
   * Pedido 14: la ola arranca DESDE EL CHAT. Lo que escribe acá se muestra en la
   * conversación y, con bridge configurado, dispara la ola real.
   */
  const submitPreviewMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!preview || !text) return;
    setLocalMessages((current) => [
      ...current,
      { id: `local:${Date.now()}`, text, occurredAt: new Date().toISOString() },
    ]);
    setDraft("");
    waveSeq.current += 1;
    setWave({ prompt: text, seq: waveSeq.current });
    setComposerNotice(
      bridge
        ? "Ola despachada: Codex y Fable la están trabajando."
        : "Entrada agregada a esta demostración. Sin bridge configurado no salió ninguna ola."
    );
  };

  const answerInConversation = (question: string) => {
    setMobileTab("conversar");
    setDraft((current) => (current.length > 0 ? current : `${question} `));
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  return (
    <div className="qz-console">
      <header className="qz-rail">
        <Link className="qz-brand" href="/" aria-label="Cotizador RAVN, inicio">
          <RavnIso className="qz-brand__iso" drawing={busy} />
          <span className="qz-brand__mark">RAVN.</span>
          <span className="qz-brand__product">COTIZADOR</span>
        </Link>

        <div className="qz-rail__quote">
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
          <ChevronDown size={14} aria-hidden="true" />
          <span className="qz-rail__stage">{STAGE_LABELS[snapshot.core.stage]}</span>
        </div>

        <div className="qz-rail__state">
          {preview ? <span className="qz-tag qz-tag--preview">PREVIEW</span> : null}
          <span className="qz-lamp" data-state={snapshot.observability.bridge.heartbeat}>
            <i aria-hidden="true" />
            {snapshot.observability.bridge.heartbeat === "fresh"
              ? "Lectura fresca"
              : snapshot.observability.bridge.heartbeat === "stale_or_absent"
                ? "Lectura demorada"
                : "Lectura no consultada"}
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
            <RefreshCw size={15} aria-hidden="true" />
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
            ["tablero", "Tablero", SlidersHorizontal],
            ["decidir", `Decidir · ${queue.length}`, TriangleAlert],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            aria-current={mobileTab === id ? "page" : undefined}
            onClick={() => setMobileTab(id)}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      <main className="qz-body">
        <ConversationColumn
          snapshot={snapshot}
          preview={preview}
          health={health}
          active={mobileTab === "conversar"}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={submitPreviewMessage}
          localMessages={localMessages}
          notice={composerNotice}
          composerRef={composerRef}
          reduceMotion={reduceMotion}
        />

        <BoardColumn
          snapshot={snapshot}
          queue={queue}
          active={mobileTab === "tablero"}
          reduceMotion={reduceMotion}
          bridge={bridge}
          wave={wave}
          onHealth={setHealth}
          focusedItem={focusedItem}
        />

        <DecisionColumn
          snapshot={snapshot}
          queue={queue}
          active={mobileTab === "decidir"}
          reduceMotion={reduceMotion}
          onAnswer={answerInConversation}
          onFocusItem={setFocusedItem}
          focusedItem={focusedItem}
        />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------ conversación */

function ConversationColumn({
  snapshot,
  preview,
  health,
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
  health: BridgeHealth;
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
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [localMessages.length]);

  return (
    <section
      className="qz-chat qz-panel"
      data-mobile-active={active}
      aria-labelledby="conversation-title"
    >
      {/* Pedido 6: el monolito no ocupa celda propia — es el fondo vivo de la
          conversación y gira según el estado real del bridge. */}
      <div className="qz-chat__backdrop" aria-hidden="true">
        <div className="qz-chat__monolith">
          <RavnMark3D state={health} size={330} />
        </div>
      </div>

      <header className="qz-chat__head">
        <h1 id="conversation-title">{snapshot.quote.title}</h1>
        <p>
          {snapshot.quote.zone ? `${snapshot.quote.zone} · ` : ""}
          Escribí el alcance o respondé lo que falta: eso dispara la ola.
        </p>
      </header>

      <div className="qz-thread" role="log" aria-label="Conversación de la cotización" ref={threadRef}>
        {thread.length === 0 && localMessages.length === 0 ? (
          <p className="qz-thread__empty">
            No hay conversación guardada para esta cotización.
          </p>
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
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
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
          rows={3}
        />
        <div className="qz-composer__footer">
          <button
            type="button"
            className="qz-attach"
            disabled
            title="Falta el contrato de subida: la conversación todavía es de solo lectura."
          >
            <Paperclip size={15} aria-hidden="true" />
            <span>Adjuntar</span>
          </button>
          <motion.button
            className="qz-send"
            type="submit"
            disabled={!preview || draft.trim().length === 0}
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            aria-label="Enviar al cotizador"
          >
            <ArrowUp size={17} aria-hidden="true" />
          </motion.button>
        </div>
        <p className="qz-composer__notice" role="status" aria-live="polite">
          {notice ??
            (preview
              ? "Demostración local: la entrada no modifica datos de App RAVN."
              : "Esta versión lee la conversación pero todavía no puede escribir.")}
        </p>
      </form>
    </section>
  );
}

/* ---------------------------------------------------------------- tablero */

function BoardColumn({
  snapshot,
  queue,
  active,
  reduceMotion,
  bridge,
  wave,
  onHealth,
  focusedItem,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  queue: QueueEntry[];
  active: boolean;
  reduceMotion: boolean;
  bridge: BridgeConfig | null;
  wave: WaveRequest | null;
  onHealth: (health: BridgeHealth) => void;
  focusedItem: string | null;
}) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!focusedItem) return;
    itemRefs.current.get(focusedItem)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusedItem]);

  return (
    <section className="qz-board" data-mobile-active={active} aria-label="Tablero del costo">
      <Readout snapshot={snapshot} queue={queue} reduceMotion={reduceMotion} />
      <InstrumentRow snapshot={snapshot} queue={queue} />
      <RubroLedger
        snapshot={snapshot}
        reduceMotion={reduceMotion}
        focusedItem={focusedItem}
        registerItem={(key, node) => {
          if (node) itemRefs.current.set(key, node);
          else itemRefs.current.delete(key);
        }}
      />
      <LiveTerminals bridge={bridge} request={wave} onHealth={onHealth} />
    </section>
  );
}

function Readout({
  snapshot,
  queue,
  reduceMotion,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  queue: QueueEntry[];
  reduceMotion: boolean;
}) {
  const { min, max } = snapshot.core.costRange;
  const composition = snapshot.core.composition;
  const width = rangeWidthPct(min, max);
  const itemCount = snapshot.batches.reduce((sum, batch) => sum + batch.itemCount, 0);
  const blocking = queue.filter((entry) => entry.item.decision.severity === "blocking").length;

  return (
    <section className="qz-readout qz-panel" aria-label="Rango de costo">
      <div className="qz-readout__figure">
        <span className="qz-readout__label">Costo directo estimado</span>
        <strong className="qz-readout__value">
          <span>{compact(min)}</span>
          <i aria-hidden="true">—</i>
          <span>{compact(max)}</span>
        </strong>
        <span className="qz-readout__exact">
          {money(min)} a {money(max)}
          {composition
            ? ` · imprevistos ${composition.imprevistosPct}% · zona ×${composition.factorZonaMin.toLocaleString("es-AR")}`
            : ""}
        </span>
        {min != null && max != null && max > 0 ? (
          <RangeScale min={min} max={max} reduceMotion={reduceMotion} />
        ) : null}
      </div>

      <dl className="qz-readout__deltas">
        <div>
          <dt>Ancho del rango</dt>
          <dd data-tone={width != null && width > 10 ? "warn" : "ok"}>
            {width == null ? "N/D" : signedPct(width)}
          </dd>
          <small>{max != null && min != null ? `${money(max - min)} de diferencia` : "N/D"}</small>
        </div>
        <div>
          <dt>Ítems en el costo</dt>
          <dd>{itemCount}</dd>
          <small>{snapshot.batches.length} rubros</small>
        </div>
        <div>
          <dt>Frenan el número</dt>
          <dd data-tone={blocking > 0 ? "alert" : "ok"}>{blocking}</dd>
          <small>{queue.length} decisiones abiertas</small>
        </div>
      </dl>
    </section>
  );
}

/** Escala del rango sobre el techo: dónde cae el piso y cuánto se puede mover. */
function RangeScale({
  min,
  max,
  reduceMotion,
}: {
  min: number;
  max: number;
  reduceMotion: boolean;
}) {
  const left = Math.max(0, Math.min(100, (min / max) * 100));
  return (
    <div className="qz-scale" role="img" aria-label={`El piso del costo está al ${Math.round(left)}% del techo`}>
      <i className="qz-scale__ticks" aria-hidden="true" />
      <motion.i
        className="qz-scale__band"
        aria-hidden="true"
        initial={reduceMotion ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ left: `${left}%`, width: `${100 - left}%` }}
      />
      <span className="qz-scale__mark" style={{ left: `${left}%` }} aria-hidden="true" />
    </div>
  );
}

function InstrumentRow({
  snapshot,
  queue,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  queue: QueueEntry[];
}) {
  const coverage = snapshot.core.sourceCoverage;
  const composition = snapshot.core.composition;
  const ready = snapshot.orchestration.readyToConsolidateBatchIds.length;
  const totalItems = snapshot.batches.reduce((sum, batch) => sum + batch.items.length, 0);
  const closed = totalItems - queue.length;
  const splitTotal = composition ? composition.laborMax + composition.materialsMax : 0;
  const laborPct = splitTotal > 0 ? Math.round((composition!.laborMax / splitTotal) * 100) : null;
  const spreads = snapshot.batches
    .flatMap((batch) => batch.items.map((item) => item.decision.spreadPct))
    .filter((value): value is number => value != null);
  const maxSpread = spreads.length > 0 ? Math.max(...spreads) : null;

  return (
    <div className="qz-instruments" aria-label="Instrumentos del costo">
      <article className="qz-gauge qz-panel" data-level={snapshot.core.confidence.level}>
        <span className="qz-gauge__label">Confianza</span>
        <div className="qz-gauge__body">
          <CoverageDial percent={coverage.percent} />
          <div>
            <strong>{CONFIDENCE_LABELS[snapshot.core.confidence.level]}</strong>
            <small>
              {coverage.coveredItems} de {coverage.totalItems} ítems con fuente fechada
            </small>
          </div>
        </div>
      </article>

      <article className="qz-gauge qz-panel">
        <span className="qz-gauge__label">Decisiones cerradas</span>
        <div className="qz-gauge__body">
          <strong className="qz-gauge__figure">
            {closed}
            <i>de {totalItems}</i>
          </strong>
          <div className="qz-gauge__track" aria-hidden="true">
            {snapshot.batches.flatMap((batch) =>
              batch.items.map((item) => (
                <span
                  key={`${batch.id}:${item.name}`}
                  data-state={
                    item.decision.severity === "ok"
                      ? "ok"
                      : item.decision.severity === "blocking"
                        ? "alert"
                        : "warn"
                  }
                />
              ))
            )}
          </div>
        </div>
        <small>{ready} de {snapshot.batches.length} rubros sin bloqueo</small>
      </article>

      <article className="qz-gauge qz-panel">
        <span className="qz-gauge__label">Mano de obra vs materiales</span>
        {composition && splitTotal > 0 ? (
          <>
            <div className="qz-gauge__body">
              <strong className="qz-gauge__figure">{laborPct}%</strong>
              <div className="qz-split" aria-hidden="true">
                <span style={{ width: `${laborPct}%` }} />
              </div>
            </div>
            <small>
              MO {compact(composition.laborMax)} · materiales {compact(composition.materialsMax)}
            </small>
          </>
        ) : (
          <p className="qz-gauge__empty">Sin desglose de totales persistido.</p>
        )}
      </article>

      <article className="qz-gauge qz-panel" data-tone={maxSpread != null && maxSpread > 25 ? "warn" : undefined}>
        <span className="qz-gauge__label">Dispersión máxima entre fuentes</span>
        <div className="qz-gauge__body">
          <strong className="qz-gauge__figure">
            {maxSpread == null ? "N/D" : `${maxSpread.toLocaleString("es-AR")}%`}
          </strong>
        </div>
        <small>
          {maxSpread == null
            ? "Ningún ítem tiene dos fuentes comparables."
            : `Sobre ${spreads.length} ítem(s) con SISMAT e internet. El motor marca arriba de 25%.`}
        </small>
      </article>
    </div>
  );
}

/**
 * Dial de cobertura: anillo de ticks que se llena hasta el porcentaje REAL de
 * ítems con fuente y fecha. Coordenadas a 2 decimales para que servidor y
 * cliente serialicen igual (si no, React acusa hydration mismatch).
 */
function CoverageDial({ percent }: { percent: number }) {
  const TICKS = 44;
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * TICKS);
  return (
    <div className="qz-dial">
      <svg viewBox="0 0 96 96" aria-hidden="true">
        {Array.from({ length: TICKS }, (_, index) => {
          const angle = (index / TICKS) * Math.PI * 2 - Math.PI / 2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          return (
            <line
              key={index}
              x1={(48 + cos * 34).toFixed(2)}
              y1={(48 + sin * 34).toFixed(2)}
              x2={(48 + cos * 45).toFixed(2)}
              y2={(48 + sin * 45).toFixed(2)}
              data-on={index < filled}
            />
          );
        })}
      </svg>
      <span className="qz-dial__center">{clamped}%</span>
    </div>
  );
}

/* ----------------------------------------------------------------- rubros */

function RubroLedger({
  snapshot,
  reduceMotion,
  focusedItem,
  registerItem,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  reduceMotion: boolean;
  focusedItem: string | null;
  registerItem: (key: string, node: HTMLDivElement | null) => void;
}) {
  const totalMax = snapshot.batches.reduce((sum, batch) => sum + (batch.priceRange.max ?? 0), 0);

  return (
    <section className="qz-ledger qz-panel" aria-label="Rubros del costo">
      <header className="qz-ledger__head">
        <h2>Rubros y precios por ítem</h2>
        <span>Cada precio contra la más barata del ítem</span>
      </header>

      <div className="qz-ledger__scroll">
        {snapshot.batches.map((batch, index) => {
          const share = totalMax > 0 ? Math.round(((batch.priceRange.max ?? 0) / totalMax) * 100) : 0;
          return (
            <section className="qz-rubro" key={batch.id}>
              <header className="qz-rubro__head">
                <i style={{ background: rubroColor(index) }} aria-hidden="true" />
                <h3>{batch.etapa}</h3>
                <span className="qz-rubro__share">{share}% del costo</span>
                <strong className="qz-rubro__money">
                  {batch.priceRange.min === batch.priceRange.max
                    ? compact(batch.priceRange.max)
                    : `${compact(batch.priceRange.min)} — ${compact(batch.priceRange.max)}`}
                </strong>
              </header>

              <div className="qz-rubro__items">
                {batch.items.map((item) => (
                  <ItemRow
                    key={item.name}
                    batchId={batch.id}
                    item={item}
                    focused={focusedItem === `${batch.id}:${item.name}`}
                    reduceMotion={reduceMotion}
                    registerItem={registerItem}
                  />
                ))}
              </div>
            </section>
          );
        })}
        {snapshot.batches.length === 0 ? (
          <p className="qz-ledger__empty">No hay rubros guardados para formar el costo.</p>
        ) : null}
      </div>
    </section>
  );
}

function ItemRow({
  batchId,
  item,
  focused,
  reduceMotion,
  registerItem,
}: {
  batchId: string;
  item: BatchItem;
  focused: boolean;
  reduceMotion: boolean;
  registerItem: (key: string, node: HTMLDivElement | null) => void;
}) {
  const key = `${batchId}:${item.name}`;
  return (
    <motion.div
      className="qz-item"
      data-severity={item.decision.severity}
      data-focused={focused}
      ref={(node) => registerItem(key, node)}
      animate={
        focused && !reduceMotion
          ? { backgroundColor: "rgba(242,239,232,0.06)" }
          : { backgroundColor: "rgba(242,239,232,0)" }
      }
      transition={{ duration: reduceMotion ? 0 : 0.5 }}
    >
      <div className="qz-item__head">
        <div>
          <strong>{item.name}</strong>
          <small>
            {item.tipo === "mano_de_obra" ? "Mano de obra" : "Material"} ·{" "}
            {item.cantidad.toLocaleString("es-AR")} {item.unidad}
            {item.manual ? " · agregado en la mesa" : ""}
          </small>
        </div>
        <span className="qz-item__subtotal">
          {item.priced
            ? item.subtotalMin === item.subtotalMax
              ? money(item.subtotalMax)
              : `${money(item.subtotalMin)} — ${money(item.subtotalMax)}`
            : "Sin precio"}
        </span>
      </div>

      {item.offers.length > 0 ? (
        <ul className="qz-offers">
          {item.offers.map((offer) => (
            <OfferChip key={offer.origin} offer={offer} />
          ))}
        </ul>
      ) : null}

      <p className="qz-item__verdict" data-severity={item.decision.severity}>
        {item.decision.severity !== "ok" ? <TriangleAlert size={13} aria-hidden="true" /> : null}
        {item.decision.headline}
      </p>
    </motion.div>
  );
}

function OfferChip({ offer }: { offer: ItemOffer }) {
  const href = sourceUrl(offer.source);
  const state = offer.recommended
    ? "recommended"
    : offer.discarded
      ? "discarded"
      : offer.reference
        ? "reference"
        : "plain";

  return (
    <li className="qz-offer" data-state={state} title={`${offer.source} · ${dateTime(offer.date)}`}>
      <span className="qz-offer__origin">{ORIGIN_LABELS[offer.origin] ?? offer.origin}</span>
      <strong className="qz-offer__value">{money(offer.value)}</strong>
      {offer.deltaPct != null && offer.deltaPct !== 0 ? (
        <span className="qz-offer__delta">{signedPct(offer.deltaPct)}</span>
      ) : null}
      {offer.cheapest ? <span className="qz-offer__flag">más barata</span> : null}
      {offer.recommended ? <span className="qz-offer__flag">la que usaría</span> : null}
      {offer.note ? <span className="qz-offer__note">{offer.note}</span> : null}
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" aria-label={`Abrir la fuente de ${offer.source}`}>
          <ArrowUp size={11} aria-hidden="true" />
        </a>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------- controles y actividad */

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

function ControlsDrawer({ snapshot }: { snapshot: QuoteWorkspaceSnapshot }) {
  const events = [...snapshot.events].reverse();
  const persisted = snapshot.observability.checks.filter((check) => check.status === "persisted");

  return (
    <div className="qz-drawers">
      <details>
        <summary>
          <span>Controles guardados</span>
          <small>{persisted.length} de {snapshot.observability.checks.length}</small>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <ul className="qz-checks">
          {snapshot.observability.checks.map((check) => (
            <li key={check.id} data-status={check.status}>
              <div>
                <strong>{CHECK_LABELS[check.id]}</strong>
                <span>{check.status === "persisted" ? check.persistedCount : "Sin salida"}</span>
              </div>
              {check.findings.slice(0, 3).map((finding, index) => (
                <p key={`${finding.subject}:${index}`}>
                  {finding.subject}: {finding.detail}
                </p>
              ))}
            </li>
          ))}
        </ul>
        <p className="qz-drawers__gap">
          Todavía no se observa {snapshot.observability.instrumentationGaps.map((gap) => GAP_LABELS[gap]).join(", ")}.
        </p>
      </details>

      <details>
        <summary>
          <span>Qué cambió</span>
          <small>{events.length} movimientos</small>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <ol className="qz-events">
          {events.map((event) => (
            <li key={event.id}>
              <time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>
              <div>
                <strong>{event.title}</strong>
                <p>{event.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        {events.length === 0 ? <p className="qz-drawers__gap">No hay actividad guardada.</p> : null}
      </details>
    </div>
  );
}

/* --------------------------------------------------------------- decisión */

function DecisionColumn({
  snapshot,
  queue,
  active,
  reduceMotion,
  onAnswer,
  onFocusItem,
  focusedItem,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  queue: QueueEntry[];
  active: boolean;
  reduceMotion: boolean;
  onAnswer: (question: string) => void;
  onFocusItem: (key: string | null) => void;
  focusedItem: string | null;
}) {
  const questions = snapshot.decision.questions;

  return (
    <section
      className="qz-decisions qz-panel"
      data-mobile-active={active}
      aria-labelledby="decisions-title"
    >
      <header className="qz-decisions__head">
        <h2 id="decisions-title">Lo que falta decidir</h2>
        <span>{queue.length}</span>
      </header>

      <div className="qz-decisions__scroll">
        <AnimatePresence initial={false}>
          {queue.map((entry) => {
            const key = `${entry.batch.id}:${entry.item.name}`;
            return (
              <motion.article
                className="qz-decision"
                key={key}
                data-severity={entry.item.decision.severity}
                data-focused={focusedItem === key}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 16 }}
                transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
                onMouseEnter={() => onFocusItem(key)}
                onMouseLeave={() => onFocusItem(null)}
              >
                <header>
                  <span className="qz-decision__tag">
                    {DECISION_TAGS[entry.item.decision.kind] ?? entry.item.decision.kind}
                  </span>
                  <small>{entry.batch.etapa}</small>
                </header>
                <h3>{entry.item.name}</h3>
                <p className="qz-decision__headline">{entry.item.decision.headline}</p>

                {entry.item.offers.length > 0 ? (
                  <ul className="qz-decision__offers">
                    {entry.item.offers.map((offer) => (
                      <li key={offer.origin} data-state={offer.recommended ? "recommended" : offer.discarded ? "discarded" : "plain"}>
                        <span>{ORIGIN_LABELS[offer.origin] ?? offer.origin}</span>
                        <strong>{money(offer.value)}</strong>
                        <em>
                          {offer.recommended
                            ? "la que usaría"
                            : offer.discarded
                              ? "descartada"
                              : offer.reference
                                ? "referencia"
                                : offer.deltaPct != null && offer.deltaPct !== 0
                                  ? signedPct(offer.deltaPct)
                                  : "más barata"}
                        </em>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="qz-decision__none">
                    <CircleSlash2 size={13} aria-hidden="true" />
                    Ninguna fuente persistida para este ítem.
                  </p>
                )}

                <p className="qz-decision__criterion">{entry.item.decision.criterion}</p>

                <button
                  type="button"
                  onClick={() => onAnswer(`${entry.item.name}: `)}
                >
                  Resolver en la conversación
                  <ArrowUp size={13} aria-hidden="true" />
                </button>
              </motion.article>
            );
          })}
        </AnimatePresence>

        {queue.length === 0 ? (
          <p className="qz-decisions__clear">
            Ningún ítem espera decisión: todos los precios están cerrados con fuente fechada.
          </p>
        ) : null}

        {questions.length > 0 ? (
          <section className="qz-questions">
            <h3>Preguntas abiertas de la cotización</h3>
            <ul>
              {questions.map((question) => (
                <li key={question}>
                  <p>{question}</p>
                  <button type="button" onClick={() => onAnswer(question)}>
                    Responder
                    <ArrowUp size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ControlsDrawer snapshot={snapshot} />

        <footer className="qz-decisions__lock">
          <LockKeyhole size={15} aria-hidden="true" />
          <div>
            <strong>Propuesta bloqueada</strong>
            <span>Primero se cierra el número final y el margen en App RAVN.</span>
          </div>
        </footer>
      </div>
    </section>
  );
}
