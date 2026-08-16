"use client";

import {
  ArrowUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleSlash2,
  LockKeyhole,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert,
  X,
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
  type PointerEvent as ReactPointerEvent,
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
import {
  MARGEN_PISO_PCT,
  marginBand,
  openingPrice,
  priceDialRange,
  roundUpToSellable,
  type MarginBand,
} from "../domain/margin";
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

/**
 * Ítem que Eze agrega a mano en la mesa (pedido del 16/08). El visor es
 * READ-ONLY contra App RAVN: esto vive en SU navegador, por cotización, y se
 * muestra siempre marcado. Nunca se mezcla con el rango que cerró el motor —
 * se suma aparte, para que el número persistido no quede contaminado.
 */
type ManualItem = {
  id: string;
  batchId: string;
  name: string;
  tipo: "material" | "mano_de_obra";
  cantidad: number;
  unidad: string;
  precioUnit: number;
};

const MANUAL_KEY = (quoteId: string) => `qz:manual:${quoteId}`;
const LAYOUT_KEY = "qz:layout";

const CHAT_MIN = 280;
const CHAT_MAX = 620;
const RAIL_MIN = 280;
const RAIL_MAX = 560;
const RAIL_FOLDED = 46;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function manualSubtotal(item: ManualItem): number {
  return item.cantidad * item.precioUnit;
}

function readManualItems(quoteId: string): ManualItem[] {
  try {
    const raw = window.localStorage.getItem(MANUAL_KEY(quoteId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ManualItem =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as ManualItem).id === "string" &&
        typeof (entry as ManualItem).batchId === "string" &&
        typeof (entry as ManualItem).name === "string" &&
        Number.isFinite((entry as ManualItem).cantidad) &&
        Number.isFinite((entry as ManualItem).precioUnit)
    );
  } catch {
    return [];
  }
}

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
  const pending = queue.length + snapshot.decision.questions.length;

  // --- ventanas manipulables (pedido 4): anchos arrastrados y recordados ---
  const [chatWidth, setChatWidth] = useState(360);
  const [railWidth, setRailWidth] = useState(356);
  const [railOpen, setRailOpen] = useState(true);
  const autoFolded = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_KEY);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (!saved || typeof saved !== "object") return;
      const { chat, rail } = saved as { chat?: number; rail?: number };
      if (Number.isFinite(chat)) setChatWidth(clamp(chat!, CHAT_MIN, CHAT_MAX));
      if (Number.isFinite(rail)) setRailWidth(clamp(rail!, RAIL_MIN, RAIL_MAX));
    } catch {
      /* sin layout guardado se abre con el de fábrica */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LAYOUT_KEY,
        JSON.stringify({ chat: chatWidth, rail: railWidth })
      );
    } catch {
      /* si el navegador no deja guardar, la consola sigue funcionando */
    }
  }, [chatWidth, railWidth]);

  /**
   * "Una vez que respondí todo, que aparezca el tablero completo": cuando no
   * queda nada por decidir el rail se pliega solo UNA vez y el tablero se queda
   * con la pantalla. Si vuelve a haber pendientes, el pliegue automático se
   * rearma; si él lo abre a mano, no se le vuelve a cerrar.
   */
  useEffect(() => {
    if (pending === 0 && !autoFolded.current) {
      autoFolded.current = true;
      setRailOpen(false);
      return;
    }
    if (pending > 0) autoFolded.current = false;
  }, [pending]);

  // --- ítems agregados a mano, por cotización ---
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const manualLoaded = useRef<string | null>(null);

  useEffect(() => {
    setManualItems(readManualItems(snapshot.quote.id));
    manualLoaded.current = snapshot.quote.id;
  }, [snapshot.quote.id]);

  useEffect(() => {
    if (manualLoaded.current !== snapshot.quote.id) return;
    try {
      window.localStorage.setItem(MANUAL_KEY(snapshot.quote.id), JSON.stringify(manualItems));
    } catch {
      /* sin localStorage el ítem vive sólo en esta pestaña */
    }
  }, [manualItems, snapshot.quote.id]);

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
            ["decidir", `Decidir · ${pending}`, TriangleAlert],
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

      <main
        className="qz-body"
        data-rail={railOpen ? "open" : "closed"}
        style={
          {
            "--qz-chat-w": `${chatWidth}px`,
            "--qz-rail-w": railOpen ? `${railWidth}px` : `${RAIL_FOLDED}px`,
          } as CSSProperties
        }
      >
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

        <Splitter
          side="chat"
          width={chatWidth}
          min={CHAT_MIN}
          max={CHAT_MAX}
          onWidth={setChatWidth}
          label="Ancho de la conversación"
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
          manualItems={manualItems}
          onAddManual={(item) => setManualItems((current) => [...current, item])}
          onDropManual={(id) =>
            setManualItems((current) => current.filter((entry) => entry.id !== id))
          }
        />

        <Splitter
          side="rail"
          width={railWidth}
          min={RAIL_MIN}
          max={RAIL_MAX}
          onWidth={setRailWidth}
          disabled={!railOpen}
          label="Ancho del rail de decisión"
        />

        <DecisionColumn
          snapshot={snapshot}
          queue={queue}
          pending={pending}
          active={mobileTab === "decidir"}
          reduceMotion={reduceMotion}
          onAnswer={answerInConversation}
          onFocusItem={setFocusedItem}
          focusedItem={focusedItem}
          onFold={() => setRailOpen(false)}
        />

        <button
          type="button"
          className="qz-spine"
          onClick={() => setRailOpen(true)}
          aria-label={
            pending > 0
              ? `Abrir lo que falta decidir: ${pending} pendientes`
              : "Abrir lo que falta decidir"
          }
          title={pending > 0 ? `${pending} sin decidir` : "Nada pendiente"}
        >
          <ChevronsLeft size={15} aria-hidden="true" />
          {pending > 0 ? (
            <>
              <span className="qz-spine__bang" aria-hidden="true">
                !
              </span>
              <span className="qz-spine__count">{pending}</span>
            </>
          ) : null}
          <span
            className={pending > 0 ? "qz-spine__label" : "qz-spine__label qz-spine__clear"}
          >
            {pending > 0 ? "Lo que falta decidir" : "Todo decidido"}
          </span>
        </button>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------ separadores */

/**
 * Barra movible entre regiones (pedido 4). Se ve siempre, se agarra con el
 * mouse y también se mueve con el teclado — es un `separator` enfocable, que es
 * lo que ARIA define para un divisor de ventanas.
 */
function Splitter({
  side,
  width,
  min,
  max,
  onWidth,
  disabled = false,
  label,
}: {
  side: "chat" | "rail";
  width: number;
  min: number;
  max: number;
  onWidth: (value: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const [dragging, setDragging] = useState(false);
  const origin = useRef({ x: 0, width: 0 });

  const start = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    origin.current = { x: event.clientX, width };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    const delta = event.clientX - origin.current.x;
    // el rail crece hacia la izquierda: el mismo gesto, el signo invertido
    onWidth(clamp(origin.current.width + (side === "chat" ? delta : -delta), min, max));
  };

  const stop = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <button
      type="button"
      className={`qz-splitter qz-splitter--${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      data-dragging={dragging}
      disabled={disabled}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => onWidth(side === "chat" ? 360 : 356)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 48 : 16;
        const towards = side === "chat" ? 1 : -1;
        if (event.key === "ArrowLeft") onWidth(clamp(width - step * towards, min, max));
        if (event.key === "ArrowRight") onWidth(clamp(width + step * towards, min, max));
      }}
    />
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
  manualItems,
  onAddManual,
  onDropManual,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  queue: QueueEntry[];
  active: boolean;
  reduceMotion: boolean;
  bridge: BridgeConfig | null;
  wave: WaveRequest | null;
  onHealth: (health: BridgeHealth) => void;
  focusedItem: string | null;
  manualItems: ManualItem[];
  onAddManual: (item: ManualItem) => void;
  onDropManual: (id: string) => void;
}) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!focusedItem) return;
    itemRefs.current.get(focusedItem)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusedItem]);

  return (
    <section className="qz-board" data-mobile-active={active} aria-label="Tablero del costo">
      <Readout
        snapshot={snapshot}
        queue={queue}
        reduceMotion={reduceMotion}
        manualItems={manualItems}
      />
      <MarginConsole snapshot={snapshot} reduceMotion={reduceMotion} />
      <InstrumentRow snapshot={snapshot} queue={queue} />
      <RubroLedger
        snapshot={snapshot}
        reduceMotion={reduceMotion}
        focusedItem={focusedItem}
        manualItems={manualItems}
        onAddManual={onAddManual}
        onDropManual={onDropManual}
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
  manualItems,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  queue: QueueEntry[];
  reduceMotion: boolean;
  manualItems: ManualItem[];
}) {
  const { min, max } = snapshot.core.costRange;
  const composition = snapshot.core.composition;
  const width = rangeWidthPct(min, max);
  const itemCount = snapshot.batches.reduce((sum, batch) => sum + batch.itemCount, 0);
  const blocking = queue.filter((entry) => entry.item.decision.severity === "blocking").length;
  const manualTotal = manualItems.reduce((sum, item) => sum + manualSubtotal(item), 0);

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
        {manualTotal > 0 ? (
          <div>
            <dt>Agregado a mano</dt>
            <dd>{compact(manualTotal)}</dd>
            <small>
              {max != null ? `techo con lo tuyo ${compact(max + manualTotal)}` : "sin techo"} ·
              no está en App RAVN
            </small>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

/**
 * Consola de margen: el tramo que faltaba, de costo a precio. Toda la
 * aritmética sale de `domain/margin.ts` — acá no se calcula nada, se muestra.
 *
 * Es un SIMULADOR: nada de lo que se toque acá se escribe en App RAVN (el
 * visor sigue siendo read-only en v1). El número final lo sigue fijando Eze en
 * la app; esto le dice contra qué lo está fijando.
 */
function MarginConsole({
  snapshot,
  reduceMotion,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  reduceMotion: boolean;
}) {
  const { min: costMin, max: costMax } = snapshot.core.costRange;
  const persisted = snapshot.quote.finalNumber;
  const opening = useMemo(
    () => openingPrice({ persistedPrice: persisted, costMax }),
    [persisted, costMax]
  );
  const [price, setPrice] = useState<number | null>(opening?.price ?? null);

  // Al cambiar de cotización el dial vuelve a abrir donde corresponde.
  useEffect(() => {
    setPrice(opening?.price ?? null);
  }, [opening]);

  const band = useMemo(
    () => (price == null ? null : marginBand({ price, costMin, costMax })),
    [price, costMin, costMax]
  );
  const dial = costMax != null && costMax > 0 ? priceDialRange(costMax) : null;

  if (costMin == null || costMax == null || !band || !dial) {
    return (
      <section className="qz-margin qz-panel" aria-label="Precio y margen">
        <span className="qz-readout__label">Precio y margen</span>
        <p className="qz-gauge__empty">
          El motor todavía no cerró el costo. Sin costo no hay margen que medir.
        </p>
      </section>
    );
  }

  const tone =
    band.verdict.severity === "ok"
      ? "ok"
      : band.verdict.severity === "warning"
        ? "warn"
        : "alert";

  return (
    <section className="qz-margin qz-panel" data-tone={tone} aria-label="Precio y margen">
      <div className="qz-margin__reading">
        <span className="qz-readout__label">Margen sobre venta</span>
        <strong className="qz-readout__value">
          <span>{band.pctAtCostMax.toLocaleString("es-AR")}</span>
          <i aria-hidden="true">—</i>
          <span>{band.pctAtCostMin.toLocaleString("es-AR")}%</span>
        </strong>
        <span className="qz-readout__exact">
          Ganás {money(band.profitAtCostMax)} a {money(band.profitAtCostMin)} · se juegan{" "}
          {band.spreadPoints.toLocaleString("es-AR")} puntos entre que la obra salga cara o barata
        </span>
        <MarginScale band={band} dial={dial} reduceMotion={reduceMotion} />
        <p className="qz-margin__verdict">
          <strong>{band.verdict.headline}</strong>
          <small>{band.verdict.criterion}</small>
        </p>
      </div>

      <div className="qz-margin__control">
        <label className="qz-margin__field">
          <span>Precio de venta</span>
          <input
            inputMode="numeric"
            value={price == null ? "" : price.toLocaleString("es-AR")}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "");
              setPrice(digits ? Number(digits) : null);
            }}
            aria-label="Precio de venta a simular"
          />
        </label>
        <input
          className="qz-margin__dial"
          type="range"
          min={dial.min}
          max={dial.max}
          step={10_000}
          value={Math.min(Math.max(band.price, dial.min), dial.max)}
          onChange={(event) => setPrice(Number(event.target.value))}
          aria-label="Dial de precio de venta"
        />
        <div className="qz-margin__presets">
          <button type="button" onClick={() => setPrice(roundUpToSellable(band.priceAtFloorOverCostMax))}>
            Piso {MARGEN_PISO_PCT}% s/ techo
          </button>
          <button type="button" onClick={() => setPrice(roundUpToSellable(band.priceAtFloorOverCostMin))}>
            Piso {MARGEN_PISO_PCT}% s/ piso
          </button>
          <button type="button" onClick={() => setPrice(roundUpToSellable(band.price))}>
            Redondear
          </button>
          {persisted != null ? (
            <button type="button" onClick={() => setPrice(Math.round(persisted))}>
              El de la app
            </button>
          ) : null}
        </div>
        <small className="qz-margin__note">
          {persisted == null
            ? `Sin precio cargado en App RAVN: el dial abre en el piso de ${MARGEN_PISO_PCT}% sobre el costo techo.`
            : `App RAVN tiene ${money(persisted)} cargado. Simular acá no lo cambia: el número final lo fijás en la app.`}
        </small>
      </div>
    </section>
  );
}

/**
 * Escala del precio: los dos precios que cierran el piso (uno contra el costo
 * techo, otro contra el piso) y dónde cae el precio simulado. Entre las dos
 * marcas está la franja donde el piso depende de cómo salga la obra.
 */
function MarginScale({
  band,
  dial,
  reduceMotion,
}: {
  band: MarginBand;
  dial: { min: number; max: number };
  reduceMotion: boolean;
}) {
  const span = dial.max - dial.min;
  const at = (value: number) => Math.max(0, Math.min(100, ((value - dial.min) / span) * 100));
  const riskLeft = at(band.priceAtFloorOverCostMin);
  const riskRight = at(band.priceAtFloorOverCostMax);
  const here = at(band.price);

  return (
    <div
      className="qz-scale qz-scale--margin"
      role="img"
      aria-label={`Precio simulado ${MONEY.format(band.price)}; el piso de ${MARGEN_PISO_PCT}% se cierra siempre desde ${MONEY.format(band.priceAtFloorOverCostMax)}`}
    >
      <i className="qz-scale__ticks" aria-hidden="true" />
      <span
        className="qz-scale__risk"
        style={{ left: `${riskLeft}%`, width: `${Math.max(0, riskRight - riskLeft)}%` }}
        aria-hidden="true"
      />
      <motion.i
        className="qz-scale__band"
        aria-hidden="true"
        initial={reduceMotion ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ left: 0, width: `${here}%` }}
      />
      <span className="qz-scale__mark" style={{ left: `${here}%` }} aria-hidden="true" />
      <span className="qz-scale__legend" style={{ left: `${riskRight}%` }} aria-hidden="true">
        piso {MARGEN_PISO_PCT}%
      </span>
    </div>
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
  const schedule = snapshot.core.schedule;
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

      <article className="qz-gauge qz-panel">
        <span className="qz-gauge__label">Tiempo de obra</span>
        {schedule ? (
          <>
            <div className="qz-gauge__body">
              <strong className="qz-gauge__figure">
                {schedule.daysMin === schedule.daysMax
                  ? schedule.daysMax
                  : `${schedule.daysMin}—${schedule.daysMax}`}
                <i>días</i>
              </strong>
            </div>
            <small>
              {schedule.crewMax} en obra ·{" "}
              {schedule.crewDaysMin === schedule.crewDaysMax
                ? `${schedule.crewDaysMax} jornales`
                : `${schedule.crewDaysMin} a ${schedule.crewDaysMax} jornales`}
              {schedule.laborPerCrewDayMin != null && schedule.laborPerCrewDayMax != null
                ? ` · la MO cotizada paga ${money(schedule.laborPerCrewDayMin)} a ${money(schedule.laborPerCrewDayMax)} el día de cuadrilla`
                : " · sin desglose de MO para cruzar el jornal"}
            </small>
          </>
        ) : (
          <p className="qz-gauge__empty">La receta no persistió días ni cuadrilla.</p>
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
            : `${spreads.length} ítem(s) con las dos fuentes · el motor marca arriba de 25%`}
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
  manualItems,
  onAddManual,
  onDropManual,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  reduceMotion: boolean;
  focusedItem: string | null;
  registerItem: (key: string, node: HTMLDivElement | null) => void;
  manualItems: ManualItem[];
  onAddManual: (item: ManualItem) => void;
  onDropManual: (id: string) => void;
}) {
  const totalMax = snapshot.batches.reduce((sum, batch) => sum + (batch.priceRange.max ?? 0), 0);
  const [openForm, setOpenForm] = useState<string | null>(null);

  return (
    <section className="qz-ledger qz-panel" aria-label="Rubros del costo">
      <header className="qz-ledger__head">
        <h2>Rubros y precios por ítem</h2>
        <span>Cada precio contra la más barata del ítem</span>
      </header>

      <div className="qz-ledger__scroll">
        {snapshot.batches.map((batch, index) => {
          const share = totalMax > 0 ? Math.round(((batch.priceRange.max ?? 0) / totalMax) * 100) : 0;
          const mine = manualItems.filter((item) => item.batchId === batch.id);
          const mineTotal = mine.reduce((sum, item) => sum + manualSubtotal(item), 0);
          return (
            <section className="qz-rubro" key={batch.id}>
              <header className="qz-rubro__head">
                <i style={{ background: rubroColor(index) }} aria-hidden="true" />
                <h3>{batch.etapa}</h3>
                <span className="qz-rubro__share">{share}% del costo</span>
                {mineTotal > 0 ? (
                  <span className="qz-rubro__manual">+ {compact(mineTotal)} a mano</span>
                ) : null}
                <strong className="qz-rubro__money">
                  {batch.priceRange.min === batch.priceRange.max
                    ? compact(batch.priceRange.max)
                    : `${compact(batch.priceRange.min)} — ${compact(batch.priceRange.max)}`}
                </strong>
                <button
                  type="button"
                  className="qz-rubro__add"
                  aria-expanded={openForm === batch.id}
                  onClick={() => setOpenForm((current) => (current === batch.id ? null : batch.id))}
                >
                  <Plus size={13} aria-hidden="true" />
                  Ítem
                </button>
              </header>

              {openForm === batch.id ? (
                <ManualItemForm
                  batchId={batch.id}
                  onCancel={() => setOpenForm(null)}
                  onAdd={(item) => {
                    onAddManual(item);
                    setOpenForm(null);
                  }}
                />
              ) : null}

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
                {mine.map((item) => (
                  <ManualItemRow key={item.id} item={item} onDrop={() => onDropManual(item.id)} />
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

/**
 * Alta de un ítem a mano dentro del rubro. Cinco campos y nada más: lo que hace
 * falta para que la línea sea una línea de costo de verdad (qué, de qué tipo,
 * cuánto, en qué unidad y a cuánto). El subtotal lo hace la multiplicación, no
 * se pide.
 */
function ManualItemForm({
  batchId,
  onAdd,
  onCancel,
}: {
  batchId: string;
  onAdd: (item: ManualItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [tipo, setTipo] = useState<ManualItem["tipo"]>("material");
  const [cantidad, setCantidad] = useState("1");
  const [unidad, setUnidad] = useState("u");
  const [precio, setPrecio] = useState("");

  const cantidadNum = Number(cantidad.replace(",", "."));
  const precioNum = Number(precio.replace(/\./g, "").replace(",", "."));
  const valid =
    name.trim().length > 0 &&
    Number.isFinite(cantidadNum) &&
    cantidadNum > 0 &&
    Number.isFinite(precioNum) &&
    precioNum > 0;

  return (
    <form
      className="qz-manual-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onAdd({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `manual:${Date.now()}`,
          batchId,
          name: name.trim(),
          tipo,
          cantidad: cantidadNum,
          unidad: unidad.trim() || "u",
          precioUnit: precioNum,
        });
      }}
    >
      <label>
        <span>Qué agregás</span>
        <input
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="Ej.: Bacha de apoyo"
        />
      </label>
      <label>
        <span>Tipo</span>
        <select
          value={tipo}
          onChange={(event) => setTipo(event.target.value as ManualItem["tipo"])}
        >
          <option value="material">Material</option>
          <option value="mano_de_obra">Mano de obra</option>
        </select>
      </label>
      <label>
        <span>Cantidad</span>
        <input inputMode="decimal" value={cantidad} onChange={(event) => setCantidad(event.target.value)} />
      </label>
      <label>
        <span>Unidad</span>
        <input value={unidad} onChange={(event) => setUnidad(event.target.value)} />
      </label>
      <label>
        <span>Precio unitario</span>
        <input
          inputMode="numeric"
          value={precio}
          onChange={(event) => setPrecio(event.target.value)}
          placeholder="0"
        />
      </label>
      <button type="submit" disabled={!valid}>
        Agregar
      </button>
      <button type="button" className="qz-manual-form__cancel" onClick={onCancel}>
        Cancelar
      </button>
    </form>
  );
}

function ManualItemRow({ item, onDrop }: { item: ManualItem; onDrop: () => void }) {
  return (
    <div className="qz-item" data-manual="true">
      <div className="qz-item__head">
        <div>
          <strong>{item.name}</strong>
          <span className="qz-item__flag">A mano</span>
          <small>
            {item.tipo === "mano_de_obra" ? "Mano de obra" : "Material"} ·{" "}
            {item.cantidad.toLocaleString("es-AR")} {item.unidad} × {money(item.precioUnit)}
          </small>
        </div>
        <span className="qz-item__subtotal">
          {money(manualSubtotal(item))}
          <button
            type="button"
            className="qz-item__drop"
            onClick={onDrop}
            aria-label={`Sacar ${item.name} de la mesa`}
            title="Sacar de la mesa"
          >
            <X size={13} aria-hidden="true" />
          </button>
        </span>
      </div>
      <p className="qz-item__verdict">
        Lo pusiste vos en la mesa: queda en este navegador y no entra al costo que cerró el motor.
      </p>
    </div>
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
  pending,
  active,
  reduceMotion,
  onAnswer,
  onFocusItem,
  focusedItem,
  onFold,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  queue: QueueEntry[];
  pending: number;
  active: boolean;
  reduceMotion: boolean;
  onAnswer: (question: string) => void;
  onFocusItem: (key: string | null) => void;
  focusedItem: string | null;
  onFold: () => void;
}) {
  const questions = snapshot.decision.questions;
  const blocking = queue.filter((entry) => entry.item.decision.severity === "blocking").length;

  return (
    <section
      className="qz-decisions qz-panel"
      data-mobile-active={active}
      aria-labelledby="decisions-title"
    >
      <header className="qz-decisions__head">
        <button
          type="button"
          className="qz-decisions__fold"
          onClick={onFold}
          aria-label="Plegar lo que falta decidir"
          title="Plegar y dejarle la pantalla al tablero"
        >
          <ChevronsRight size={14} aria-hidden="true" />
        </button>
        <h2 id="decisions-title">Lo que falta decidir</h2>
        <span className="qz-decisions__count" data-alert={blocking > 0}>
          {pending}
        </span>
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
