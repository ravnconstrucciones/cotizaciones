"use client";

import {
  ArrowUp,
  ChevronDown,
  Check,
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
  subtotalToTotalScale,
  type MarginBand,
} from "../domain/margin";
import { decisionRank } from "../domain/price-decision";
import {
  hoyLocalIso,
  laborBoard,
  laborOverrideDelta,
  VENCIMIENTO_MO_DIAS,
  type LaborBoard,
  type LaborContender,
  type LaborRubro,
} from "../domain/labor";
import { apiUrl } from "../lib/api-url";
import {
  momentoDelExpediente,
  textoConAdjuntos,
  tituloProvisional,
  type MomentoExpediente,
} from "../lib/entrada";
import { despacharOla, subirUno } from "../lib/intake-client";
import { localTaller, remoteTaller, type TallerPersistence } from "../taller/persistence";
import {
  isPersistableQuoteId,
  manualSubtotal,
  manualTotal as sumManual,
  type Decision,
  type ManualDraft,
  type ManualItem,
  type PostulanteDraft,
  type PostulanteMO,
} from "../taller/types";
import {
  formatObservedDate as dateTime,
  formatObservedTime as eventTime,
} from "./format-observed-date";
import {
  LiveTerminals,
  type BridgeConfig,
  type BridgeHealth,
  type WaveRequest,
} from "./live-terminals";
import { RavnIso } from "./ravn-iso";
import { RecoBoard, RecoDecisiones, useReconocimiento } from "./reconocimiento-panel";
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
 * El ancho de las columnas es preferencia de ESTE navegador, no dato del
 * negocio: se queda en `localStorage` a propósito. Los ítems a mano y las
 * decisiones, en cambio, ya viven en las tablas del taller (`src/taller/`).
 */
const LAYOUT_KEY = "qz:layout";

const CHAT_MIN = 280;
const CHAT_MAX = 620;
const RAIL_MIN = 280;
const RAIL_MAX = 560;
const RAIL_FOLDED = 46;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
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

/**
 * La cola de decisiones es de MATERIALES. La mano de obra tiene su propio rubro
 * con postulantes (pedido 3): se decide ahí, contra los presupuestos de
 * proveedor, no de a un precio suelto en esta cola. Dejarla en los dos lados
 * sería pedirle la misma decisión dos veces.
 */
function queueEntries(snapshot: QuoteWorkspaceSnapshot): QueueEntry[] {
  return snapshot.batches
    .flatMap((batch) => batch.items.map((item) => ({ batch, item })))
    .filter((entry) => entry.item.tipo !== "mano_de_obra")
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
  initialEntrada = false,
}: {
  initialData: ControlCenterData;
  preview: boolean;
  bridge: BridgeConfig | null;
  initialEntrada?: boolean;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const [data, setData] = useState(initialData);
  const [mobileTab, setMobileTab] = useState<MobileTab>(
    initialEntrada && !preview ? "conversar" : "tablero"
  );
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [localMessages, setLocalMessages] = useState<LocalPreviewMessage[]>([]);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [wave, setWave] = useState<WaveRequest | null>(null);
  const [health, setHealth] = useState<BridgeHealth>("off");
  // Motor encendido/apagado (spec 2026-08-17): la voluntad del bridge vive en
  // App RAVN. Entrar al visor prende; la pestaña abierta marca presencia (y de
  // paso refresca el latido); el chip del header es el botón.
  const [motor, setMotor] = useState<{ deseado: "encendido" | "apagado"; vistoAt: string | null } | null>(null);
  const [motorBusy, setMotorBusy] = useState(false);
  // La puerta de entrada ES la conversación (spec 2026-08-17): en entrada la
  // caja crea el expediente con el primer envío. El visor abre acá.
  const [entrada, setEntrada] = useState(initialEntrada && !preview);
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const waveSeq = useRef(0);
  const requestInFlight = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const snapshot = data.snapshot;
  const momento = momentoDelExpediente({
    entrada,
    legacyState: snapshot.quote.legacyState,
    preview,
  });
  // Reconocimiento en tres columnas (spec 2026-08-17): el estado de la
  // propuesta vive acá arriba para que el tablero del medio y el checklist del
  // rail vean LA MISMA cosa. `loadQuote` se define más abajo — ref mediante.
  const loadQuoteRef = useRef<(id: string, announce?: boolean) => Promise<void>>(async () => {});
  const recoQuoteId = snapshot.quote.id;
  const reco = useReconocimiento({
    quoteId: recoQuoteId,
    bridge,
    activo: momento === "reconocimiento",
    onConfirmada: useCallback(() => {
      void loadQuoteRef.current(recoQuoteId);
    }, [recoQuoteId]),
  });
  const agregarArchivos = useCallback((nuevos: FileList | File[]) => {
    const lista = Array.from(nuevos).filter((f) => f.size > 0);
    if (lista.length > 0) setArchivos((current) => [...current, ...lista]);
  }, []);
  const quitarArchivo = useCallback(
    (index: number) => setArchivos((current) => current.filter((_, i) => i !== index)),
    []
  );
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  // En la ENTRADA el snapshot de fondo es de OTRO expediente: su cola y sus
  // preguntas no se muestran — mezclar expedientes está prohibido.
  const queue = useMemo(
    () =>
      entrada
        ? []
        : queueEntries(snapshot).filter(
            (entry) => !decided[`${entry.batch.id}:${entry.item.name}`]
          ),
    [snapshot, decided, entrada]
  );
  // En reconocimiento lo pendiente son las preguntas de la ola sin responder.
  const pending = entrada
    ? 0
    : momento === "reconocimiento"
      ? reco.sinResponder
      : queue.length + snapshot.decision.questions.length;
  const snapshotDecision = useMemo(
    () =>
      entrada
        ? { ...snapshot, decision: { ...snapshot.decision, questions: [] } }
        : snapshot,
    [snapshot, entrada]
  );

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
    // El espejo del pliegue: si el rail se cerró SOLO (no a mano) y aparecen
    // pendientes —las preguntas de la ola llegan después del primer render—,
    // se reabre solo. Un pliegue manual de Eze no se toca.
    if (pending > 0 && autoFolded.current) {
      autoFolded.current = false;
      setRailOpen(true);
    }
  }, [pending]);

  /**
   * --- la mesa: ítems a mano y decisiones (16/08, PASO 1) ---
   *
   * Antes vivían en `localStorage` y se perdían al cambiar de máquina. Ahora van
   * a las tablas del cotizador. El preview sintético sigue en el navegador: esa
   * cotización no existe en la base y la escritura rebotaría contra la FK.
   *
   * Regla anti-slop: la pantalla NUNCA muestra como guardado algo que la base
   * rechazó. Cada escritura es optimista y, si no entra, se revierte y se avisa.
   */
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [postulantes, setPostulantes] = useState<PostulanteMO[]>([]);
  /** Se fija una vez por sesión: mide la antigüedad de los presupuestos de MO. */
  const [today] = useState(hoyLocalIso);
  const [tallerError, setTallerError] = useState<string | null>(null);
  const [tallerLoading, setTallerLoading] = useState(true);
  const tallerRef = useRef<TallerPersistence | null>(null);

  const taller = useCallback((): TallerPersistence => {
    if (!tallerRef.current) {
      tallerRef.current = preview ? localTaller(window.localStorage) : remoteTaller();
    }
    return tallerRef.current;
  }, [preview]);

  const quoteId = snapshot.quote.id;

  useEffect(() => {
    let cancelled = false;
    setTallerLoading(true);
    setManualItems([]);
    setPostulantes([]);
    setDecided({});

    taller()
      .load(quoteId)
      .then((state) => {
        if (cancelled) return;
        setManualItems(state.manual);
        setPostulantes(state.postulantes);
        setDecided(state.decided);
        setTallerError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTallerError(
          error instanceof Error ? error.message : "No se pudo leer lo que dejaste en la mesa."
        );
      })
      .finally(() => {
        if (!cancelled) setTallerLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quoteId, taller]);

  /** Escritura optimista: si la base la rechaza, se deshace y queda dicho. */
  const persist = useCallback(
    async (apply: () => void, revert: () => void, write: () => Promise<void>) => {
      apply();
      setTallerError(null);
      try {
        await write();
      } catch (error: unknown) {
        revert();
        setTallerError(
          error instanceof Error ? error.message : "El cambio no se pudo guardar."
        );
      }
    },
    []
  );

  const addManual = useCallback(
    async (draft: ManualDraft) => {
      const provisional: ManualItem = { id: `pendiente:${draft.name}:${draft.batchId}`, ...draft };
      await persist(
        () => setManualItems((current) => [...current, provisional]),
        () => setManualItems((current) => current.filter((item) => item.id !== provisional.id)),
        async () => {
          const saved = await taller().addManual(quoteId, draft);
          setManualItems((current) =>
            current.map((item) => (item.id === provisional.id ? saved : item))
          );
        }
      );
    },
    [persist, quoteId, taller]
  );

  const dropManual = useCallback(
    async (id: string) => {
      const removed = manualItems.find((item) => item.id === id);
      await persist(
        () => setManualItems((current) => current.filter((item) => item.id !== id)),
        () => setManualItems((current) => (removed ? [...current, removed] : current)),
        () => taller().dropManual(quoteId, id)
      );
    },
    [manualItems, persist, quoteId, taller]
  );

  /**
   * --- postulantes de mano de obra (pedido 3) ---
   *
   * Un presupuesto de proveedor entra sin elegir: cargarlo y marcarlo son dos
   * actos distintos. Marcar uno PISA el costo y recalcula al toque, sin
   * confirmación ni freno por desvío — decisión de Eze: *"yo de última lo miro
   * y sé cómo manejarlo"*. La herramienta muestra el desvío, no lo tutela.
   */
  const addPostulante = useCallback(
    async (draft: PostulanteDraft) => {
      const provisional: PostulanteMO = {
        id: `pendiente:${draft.proveedor}:${draft.batchId}`,
        ...draft,
        elegido: false,
      };
      await persist(
        () => setPostulantes((current) => [...current, provisional]),
        () => setPostulantes((current) => current.filter((p) => p.id !== provisional.id)),
        async () => {
          const saved = await taller().addPostulante(quoteId, draft);
          setPostulantes((current) => current.map((p) => (p.id === provisional.id ? saved : p)));
        }
      );
    },
    [persist, quoteId, taller]
  );

  const dropPostulante = useCallback(
    async (id: string) => {
      const removed = postulantes.find((p) => p.id === id);
      await persist(
        () => setPostulantes((current) => current.filter((p) => p.id !== id)),
        () => setPostulantes((current) => (removed ? [...current, removed] : current)),
        () => taller().dropPostulante(quoteId, id)
      );
    },
    [persist, postulantes, quoteId, taller]
  );

  /**
   * El rubro de mano de obra, armado en el navegador: los presupuestos que Eze
   * tiene sobre la mesa contra la investigación que ya trajo el motor. Se
   * recalcula solo al marcar un postulante — de ahí sale el "al toque".
   */
  const labor = useMemo(
    () => laborBoard(snapshot.batches, postulantes, today),
    [snapshot.batches, postulantes, today]
  );
  const laborDelta = useMemo(() => laborOverrideDelta(labor), [labor]);

  /**
   * Elegir es la ÚNICA escritura que no se puede revertir en memoria. Son dos
   * pasos en la base (desmarcar el rubro, marcar al nuevo) y si falla el
   * segundo, el rubro queda sin nadie elegido: volver al estado anterior sería
   * mostrar un marcado que ya no existe, y el margen calcularía con su número.
   * Ante el fallo se relee la mesa, que es la única que sabe cómo quedó.
   */
  const elegirPostulante = useCallback(
    async (batchId: string, id: string | null) => {
      setPostulantes((current) =>
        current.map((p) => (p.batchId === batchId ? { ...p, elegido: p.id === id } : p))
      );
      setTallerError(null);
      try {
        await taller().elegirPostulante(quoteId, batchId, id);
      } catch (error: unknown) {
        const motivo =
          error instanceof Error ? error.message : "No se pudo marcar ese presupuesto.";
        try {
          const state = await taller().load(quoteId);
          setPostulantes(state.postulantes);
          setTallerError(motivo);
        } catch {
          setPostulantes((current) =>
            current.map((p) => (p.batchId === batchId ? { ...p, elegido: false } : p))
          );
          setTallerError(`${motivo} Además se perdió la conexión con la mesa: recargá.`);
        }
      }
    },
    [quoteId, taller]
  );

  const decide = useCallback(
    async (key: string, origin: string, value: number | null) => {
      const previous = decided[key];
      await persist(
        () =>
          setDecided((current) => ({
            ...current,
            [key]: { origin, value, at: new Date().toISOString() },
          })),
        () =>
          setDecided((current) => {
            const next = { ...current };
            if (previous) next[key] = previous;
            else delete next[key];
            return next;
          }),
        async () => {
          const saved = await taller().decide(quoteId, key, origin, value);
          setDecided((current) => ({ ...current, [key]: saved }));
        }
      );
    },
    [decided, persist, quoteId, taller]
  );

  const reopen = useCallback(
    async (key: string) => {
      const previous = decided[key];
      await persist(
        () =>
          setDecided((current) => {
            const next = { ...current };
            delete next[key];
            return next;
          }),
        () => setDecided((current) => (previous ? { ...current, [key]: previous } : current)),
        () => taller().reopen(quoteId, key)
      );
    },
    [decided, persist, quoteId, taller]
  );

  const loadQuote = useCallback(
    async (quoteId: string, announce = true) => {
      if (requestInFlight.current || preview) return;
      requestInFlight.current = true;
      if (announce) setBusy(true);
      setRefreshError(null);

      try {
        const response = await fetch(apiUrl(`/api/quotes?quote=${encodeURIComponent(quoteId)}`), {
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
    loadQuoteRef.current = loadQuote;
  }, [loadQuote]);

  useEffect(() => {
    // En la ENTRADA no se refresca nada: el snapshot de fondo es de otro
    // expediente y el poll reescribía la URL (?quote=) estando en la puerta.
    if (preview || entrada) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadQuote(snapshot.quote.id, false);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadQuote, preview, entrada, snapshot.quote.id]);

  /**
   * Pedido 14: la ola arranca DESDE EL CHAT. Lo que escribe acá se muestra en la
   * conversación y, con bridge configurado, dispara la ola real.
   */
  /**
   * La conversación es del EXPEDIENTE, no de la pantalla. Al cambiar de
   * cotización se iba el hilo pero quedaban el borrador a medio escribir, los
   * mensajes locales del preview y el último aviso: texto de la cotización
   * anterior arriba de la nueva, y si le daba enviar entraba en la que no era.
   */
  useEffect(() => {
    setDraft("");
    setArchivos([]);
    setLocalMessages([]);
    setComposerNotice(null);
  }, [quoteId]);

  /**
   * El único que sabe qué pasó con la ola es el que la despachó. El aviso del
   * composer sale de ahí y no de una suposición: antes decía "Ola despachada"
   * apenas se apretaba enviar, así que un bridge que rechazaba la ola dejaba
   * dos carteles contradiciéndose —y en mobile, en solapas distintas—.
   */
  const noteWave = useCallback((message: string) => setComposerNotice(message), []);

  /**
   * La respuesta de la charla entra al hilo DESPUÉS del "Ola terminada" (la
   * persiste el alTerminar del bridge). Refrescar en el primer result llega
   * temprano: se espera al último con un debounce corto y se relee en silencio.
   */
  const refreshTimer = useRef<number | null>(null);
  const scheduleThreadRefresh = useCallback(() => {
    if (preview) return;
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      void loadQuote(quoteId, false);
    }, 900);
  }, [preview, loadQuote, quoteId]);
  useEffect(
    () => () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    },
    []
  );

  /**
   * Conversación operativa (17/08): el composer escribe DE VERDAD. El orden es
   * el inquebrantable de la puerta — primero persiste el mensaje en el hilo
   * real de App RAVN, recién después se despacha la ola de charla. Si la ola
   * no puede salir (sin bridge, Mac apagada), el mensaje ya quedó guardado y
   * el aviso lo dice. En preview se mantiene la demostración local de siempre.
   */
  /**
   * La lámpara del bridge la alimenta LiveTerminals — que en charla vive en el
   * tablero y en reconocimiento en el RecoBoard del medio. Solo en la ENTRADA
   * no hay banda montada: acá se consulta el mismo /health con el mismo
   * criterio para que la lámpara no quede clavada en "off".
   */
  useEffect(() => {
    if (momento !== "entrada" || !bridge) return;
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch(`${bridge.url}/health`, {
          headers: { "x-bridge-token": bridge.token },
          cache: "no-store",
        });
        if (cancelled) return;
        if (!response.ok) throw new Error();
        const payload = (await response.json()) as {
          wave: { status: "running" | "done" } | null;
        };
        setHealth(payload.wave?.status === "running" ? "running" : "ready");
      } catch {
        if (!cancelled) setHealth("off");
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 6000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [momento, bridge]);

  /**
   * Motor encendido/apagado (spec 2026-08-17): toda orden pasa por /api/motor
   * (App RAVN decide, el bridge obedece). La respuesta trae la fila fresca —
   * presencia y estado en un solo viaje.
   */
  const ordenMotor = useCallback(
    async (accion: "encender" | "apagar" | "presencia") => {
      if (preview) return;
      try {
        const res = await fetch(apiUrl("/api/motor"), {
          method: "POST",
          headers: { "content-type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ accion }),
        });
        const payload = (await res.json().catch(() => null)) as {
          deseado?: string;
          visto_at?: string | null;
        } | null;
        if (!res.ok || (payload?.deseado !== "encendido" && payload?.deseado !== "apagado")) return;
        setMotor({ deseado: payload.deseado, vistoAt: payload.visto_at ?? null });
      } catch {
        // Sin red no se miente estado: el chip cae al latido del snapshot.
      }
    },
    [preview]
  );

  // Entrar al visor prende el motor; se dispara al montar, no en loop — si Eze
  // lo apaga a mano queda apagado hasta que toque el botón o vuelva a entrar.
  // El ping de presencia sostiene el auto-apagado de 30 min del bridge.
  useEffect(() => {
    if (preview) return;
    void ordenMotor("encender");
    const timer = window.setInterval(() => void ordenMotor("presencia"), 60_000);
    return () => window.clearInterval(timer);
  }, [preview, ordenMotor]);

  const latidoFresco = motor?.vistoAt
    ? Date.now() - new Date(motor.vistoAt).getTime() < 90_000
    : false;
  // `desconocido` = /api/motor nunca contestó: el chip cae al latido legacy.
  const motorEstado: "encendido" | "apagado" | "sin_senal" | "desconocido" = !motor
    ? "desconocido"
    : !latidoFresco
      ? "sin_senal"
      : motor.deseado === "encendido"
        ? "encendido"
        : "apagado";

  const toggleMotor = () => {
    if (motorBusy) return;
    // Con el bridge sin señal el click igual deja la voluntad escrita: cuando
    // la Mac despierte, arranca como Eze lo dejó.
    const objetivo = motor?.deseado === "encendido" ? "apagar" : "encender";
    setMotorBusy(true);
    void ordenMotor(objetivo).finally(() => setMotorBusy(false));
  };

  /**
   * La puerta conversacional (spec 2026-08-17): en `entrada` el primer envío
   * CREA el expediente — borrador con título provisional, archivos, primer
   * mensaje del hilo y recién después la ola de reconocimiento. Si algo del
   * medio falla, el aviso dice exactamente qué quedó y qué no.
   */
  const enviarDesdeLaEntrada = async (text: string) => {
    setComposerNotice("Creando el expediente…");
    try {
      const nombres = archivos.map((f) => f.name);
      const res = await fetch(apiUrl("/api/intake"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titulo: tituloProvisional(text, nombres), texto: text }),
      });
      const payload = (await res.json().catch(() => null)) as {
        cotizacionId?: string;
        advertencia?: string;
        error?: string;
      } | null;
      if (!res.ok || typeof payload?.cotizacionId !== "string") {
        throw new Error(payload?.error ?? "El expediente no se pudo crear.");
      }
      const id = payload.cotizacionId;

      let aviso = payload.advertencia ?? null;
      setComposerNotice("Expediente creado · subiendo archivos…");
      for (const file of archivos) {
        try {
          await subirUno(id, file);
        } catch (error) {
          const motivo = error instanceof Error ? error.message : "subida rechazada";
          aviso = `${aviso ? `${aviso} ` : ""}El archivo "${file.name}" no subió (${motivo}).`;
        }
      }

      // El primer mensaje del hilo: el expediente arranca con su historia.
      const mensaje = textoConAdjuntos(text, nombres);
      if (mensaje.trim().length > 0) {
        await fetch(apiUrl(`/api/mensajes?quote=${encodeURIComponent(id)}`), {
          method: "POST",
          headers: { "content-type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ texto: mensaje }),
        }).catch(() => {
          aviso = `${aviso ? `${aviso} ` : ""}El mensaje no quedó en el hilo (el intake sí).`;
        });
      }

      const ola = await despacharOla(id, bridge);
      setDraft("");
      setArchivos([]);
      setEntrada(false);
      // loadQuote limpia el aviso al traer el expediente: se setea DESPUÉS.
      await loadQuote(id);
      setComposerNotice(aviso ? `${aviso} ${ola.mensaje}` : ola.mensaje);
    } catch (error) {
      // Nada nació: el borrador no existe y lo escrito sigue en la caja.
      setComposerNotice(
        error instanceof Error ? error.message : "El expediente no se pudo crear."
      );
    }
  };

  /**
   * Momentos reconocimiento y charla: mismo orden inquebrantable de siempre —
   * archivos y mensaje persisten PRIMERO, la ola sale después. En los DOS
   * momentos la ola es la de charla (rápida); en reconocimiento viaja con
   * `momento` y es Fable quien rutea (pedido de Eze 17/08): pregunta →
   * respuesta directa en el hilo; dato o cambio de alcance → respuesta + el
   * bridge encadena el re-reconocimiento completo solo.
   */
  const enviarAlExpediente = async (text: string) => {
    const nombres = archivos.map((f) => f.name);
    setComposerNotice("Guardando el mensaje en el hilo…");
    try {
      let aviso: string | null = null;
      for (const file of archivos) {
        try {
          await subirUno(quoteId, file);
        } catch (error) {
          const motivo = error instanceof Error ? error.message : "subida rechazada";
          aviso = `${aviso ? `${aviso} ` : ""}El archivo "${file.name}" no subió (${motivo}).`;
        }
      }
      const mensaje = textoConAdjuntos(text, nombres);
      const response = await fetch(apiUrl(`/api/mensajes?quote=${encodeURIComponent(quoteId)}`), {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ texto: mensaje }),
      });
      const payload = (await response.json().catch(() => null)) as {
        mensajeId?: string;
        error?: string;
      } | null;
      if (!response.ok || typeof payload?.mensajeId !== "string") {
        throw new Error(payload?.error ?? "El mensaje no se pudo guardar en el hilo.");
      }
      // El borrador recién se suelta cuando el mensaje ESTÁ guardado: un
      // fallo no se come lo que Eze escribió.
      setDraft("");
      setArchivos([]);
      setLocalMessages((current) => [
        ...current,
        { id: `local:${payload.mensajeId}`, text: mensaje, occurredAt: new Date().toISOString() },
      ]);

      waveSeq.current += 1;
      setWave({
        prompt: mensaje,
        seq: waveSeq.current,
        charla: {
          cotizacionId: quoteId,
          mensajeId: payload.mensajeId,
          ...(momento === "reconocimiento" ? { momento: "reconocimiento" as const } : {}),
        },
      });
      setComposerNotice(
        aviso
          ? `${aviso} Mensaje guardado · despachando la ola…`
          : "Mensaje guardado en el hilo · despachando la ola…"
      );
    } catch (error) {
      setComposerNotice(
        error instanceof Error ? error.message : "El mensaje no se pudo guardar en el hilo."
      );
    }
  };

  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && archivos.length === 0) || sending) return;

    if (preview) {
      if (!text) return;
      setLocalMessages((current) => [
        ...current,
        { id: `local:${Date.now()}`, text, occurredAt: new Date().toISOString() },
      ]);
      setDraft("");
      waveSeq.current += 1;
      setWave({ prompt: text, seq: waveSeq.current });
      setComposerNotice("Despachando la ola…");
      return;
    }

    void (async () => {
      setSending(true);
      try {
        if (momento === "entrada") {
          await enviarDesdeLaEntrada(text);
          return;
        }
        await enviarAlExpediente(text);
      } finally {
        setSending(false);
      }
    })();
  };

  const answerInConversation = (question: string) => {
    setMobileTab("conversar");
    // Con algo escrito, antes la pregunta NO entraba: el botón cambiaba de
    // solapa y no pasaba nada más. Ahora se suma al final y no pisa el borrador.
    setDraft((current) =>
      current.trim().length > 0 ? `${current.trimEnd()}\n\n${question} ` : `${question} `
    );
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
            value={entrada ? "__nueva__" : snapshot.quote.id}
            disabled={busy || preview}
            onChange={(event) => {
              if (event.target.value === "__nueva__") {
                setEntrada(true);
                // La puerta ES la conversación: en mobile se abre esa solapa.
                setMobileTab("conversar");
                setDraft("");
                setArchivos([]);
                setComposerNotice(null);
                return;
              }
              setEntrada(false);
              void loadQuote(event.target.value);
            }}
          >
            <option value="__nueva__">+ Nueva cotización</option>
            {data.quotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.title}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
          {entrada ? null : (
            <span className="qz-rail__stage">{STAGE_LABELS[snapshot.core.stage]}</span>
          )}
        </div>

        <div className="qz-rail__state">
          {preview ? <span className="qz-tag qz-tag--preview">PREVIEW</span> : null}
          {preview || motorEstado === "desconocido" ? (
            <span className="qz-lamp" data-state={snapshot.observability.bridge.heartbeat}>
              <i aria-hidden="true" />
              {snapshot.observability.bridge.heartbeat === "fresh"
                ? "Lectura fresca"
                : snapshot.observability.bridge.heartbeat === "stale_or_absent"
                  ? "Lectura demorada"
                  : "Lectura no consultada"}
            </span>
          ) : (
            <button
              type="button"
              className="qz-lamp qz-lamp--btn"
              data-state={motorEstado}
              disabled={motorBusy}
              onClick={toggleMotor}
              title={
                motorEstado === "encendido"
                  ? "El motor procesa la mesa. Click para apagarlo."
                  : motorEstado === "apagado"
                    ? "El motor no procesa nada. Click para prenderlo."
                    : "La Mac está dormida o el bridge murió. El click deja la orden para cuando despierte."
              }
            >
              <i aria-hidden="true" />
              {motorEstado === "encendido"
                ? "Motor encendido"
                : motorEstado === "apagado"
                  ? "Motor apagado"
                  : "Sin señal"}
            </button>
          )}
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
        data-momento={momento}
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
          onSubmit={submitMessage}
          sending={sending}
          localMessages={localMessages}
          notice={composerNotice}
          composerRef={composerRef}
          reduceMotion={reduceMotion}
          momento={momento}
          archivos={archivos}
          onArchivos={agregarArchivos}
          onQuitarArchivo={quitarArchivo}
        />

        <Splitter
          side="chat"
          width={chatWidth}
          min={CHAT_MIN}
          max={CHAT_MAX}
          onWidth={setChatWidth}
          label="Ancho de la conversación"
        />

        {momento === "entrada" ? (
          <EstadoColumna
            active={mobileTab === "tablero"}
            titulo="Nueva cotización"
            detalle="El expediente nace en la conversación: tirá la OT en la caja de al lado."
          />
        ) : momento === "reconocimiento" ? (
          <RecoBoard
            reco={reco}
            bridge={bridge}
            health={health}
            active={mobileTab === "tablero"}
            wave={wave}
            onHealth={setHealth}
            onWaveResult={scheduleThreadRefresh}
            onWaveOutcome={noteWave}
          />
        ) : (
        <BoardColumn
          snapshot={snapshot}
          queue={queue}
          active={mobileTab === "tablero"}
          reduceMotion={reduceMotion}
          bridge={bridge}
          wave={wave}
          onHealth={setHealth}
          onWaveOutcome={noteWave}
          onWaveResult={scheduleThreadRefresh}
          focusedItem={focusedItem}
          manualItems={manualItems}
          onAddManual={addManual}
          onDropManual={dropManual}
          decided={decided}
          onReopen={reopen}
          tallerError={tallerError}
          tallerLoading={tallerLoading}
          tallerKind={preview ? "local" : "remota"}
          labor={labor}
          laborDelta={laborDelta}
          onAddPostulante={addPostulante}
          onDropPostulante={dropPostulante}
          onElegirPostulante={elegirPostulante}
        />
        )}

        <Splitter
          side="rail"
          width={railWidth}
          min={RAIL_MIN}
          max={RAIL_MAX}
          onWidth={setRailWidth}
          disabled={!railOpen}
          label="Ancho del rail de decisión"
        />

        {momento === "reconocimiento" ? (
          <RecoDecisiones
            reco={reco}
            active={mobileTab === "decidir"}
            onFold={() => setRailOpen(false)}
          />
        ) : (
          <DecisionColumn
            snapshot={snapshotDecision}
            queue={queue}
            pending={pending}
            active={mobileTab === "decidir"}
            reduceMotion={reduceMotion}
            onAnswer={answerInConversation}
            onFocusItem={setFocusedItem}
            focusedItem={focusedItem}
            onFold={() => setRailOpen(false)}
            onDecide={decide}
          />
        )}

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
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        // sin esto la flecha redimensiona Y scrollea el tablero al mismo tiempo
        event.preventDefault();
        const step = event.shiftKey ? 48 : 16;
        const towards = side === "chat" ? 1 : -1;
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        onWidth(clamp(width + direction * step * towards, min, max));
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
  sending,
  localMessages,
  notice,
  composerRef,
  reduceMotion,
  momento,
  archivos,
  onArchivos,
  onQuitarArchivo,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  preview: boolean;
  health: BridgeHealth;
  active: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  sending: boolean;
  localMessages: LocalPreviewMessage[];
  notice: string | null;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  reduceMotion: boolean;
  momento: MomentoExpediente;
  archivos: File[];
  onArchivos: (files: FileList | File[]) => void;
  onQuitarArchivo: (index: number) => void;
}) {
  // El hilo entero, las cuatro voces: eze, fable, codex y sistema. Antes fable
  // y codex se filtraban — con la conversación operativa (17/08) la respuesta
  // de Fable ES el producto: esconderla sería una charla contra una pared.
  // En la ENTRADA el hilo del expediente anterior no se muestra: la puerta
  // arranca en blanco.
  const esEntrada = momento === "entrada";
  const thread = esEntrada
    ? []
    : snapshot.events.filter(
        (event): event is Extract<QuoteEvent, { type: "message" }> => event.type === "message"
      );
  const mensajesLocales = esEntrada ? [] : localMessages;
  const threadRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const quoteId = snapshot.quote.id;

  /**
   * Un log se lee por el final. Antes esto sólo miraba los mensajes locales, así
   * que al abrir OTRA cotización el hilo aparecía arrancado desde el mensaje más
   * viejo y lo último hablado quedaba abajo del scroll.
   */
  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [quoteId, thread.length, mensajesLocales.length]);

  return (
    <section
      className="qz-chat qz-panel"
      data-mobile-active={active}
      data-dragging={dragging}
      aria-labelledby="conversation-title"
      onDragOver={(event) => {
        event.preventDefault();
        if (!sending) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!sending) onArchivos(event.dataTransfer.files);
      }}
    >
      {/* Pedido 6: el monolito no ocupa celda propia — es el fondo vivo de la
          conversación y gira según el estado real del bridge. */}
      <div className="qz-chat__backdrop" aria-hidden="true">
        <div className="qz-chat__monolith">
          <RavnMark3D state={health} size={330} />
        </div>
      </div>

      {esEntrada ? (
        <header className="qz-chat__head">
          <h1 id="conversation-title">Nueva cotización</h1>
          <p>Tirá la OT: archivo, foto o contame el trabajo. Con el primer envío nace el expediente.</p>
        </header>
      ) : (
        <header className="qz-chat__head">
          <h1 id="conversation-title">{snapshot.quote.title}</h1>
          <p>
            {snapshot.quote.zone ? `${snapshot.quote.zone} · ` : ""}
            Escribí el alcance o respondé lo que falta: eso dispara la ola.
          </p>
        </header>
      )}

      <div className="qz-thread" role="log" aria-label="Conversación de la cotización" ref={threadRef}>
        {thread.length === 0 && mensajesLocales.length === 0 ? (
          <p className="qz-thread__empty">
            {esEntrada
              ? "El expediente nace acá: soltá archivos en esta columna o escribí el pedido."
              : "No hay conversación guardada para esta cotización."}
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
          {mensajesLocales.map((message) => (
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
          disabled={sending}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={
            esEntrada
              ? "Ej.: OT baño Pueyrredón — demoler revestimiento, impermeabilizar y…"
              : "Ej.: El porcelanato es 60 × 60 y la grifería va embutida…"
          }
          rows={3}
        />
        {archivos.length > 0 ? (
          <ul className="qz-composer__chips">
            {archivos.map((file, i) => (
              <li key={`${file.name}:${i}`}>
                <Paperclip size={11} aria-hidden="true" />
                <span>{file.name}</span>
                <em>{(file.size / 1024 / 1024).toFixed(1)} MB</em>
                {!sending ? (
                  <button
                    type="button"
                    aria-label={`Quitar ${file.name}`}
                    onClick={() => onQuitarArchivo(i)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="qz-composer__footer">
          <button
            type="button"
            className="qz-attach"
            disabled={sending || preview}
            title={
              preview
                ? "Demostración local: los adjuntos no aplican."
                : "Adjuntar archivos al expediente (PDF, fotos, checklist)."
            }
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={15} aria-hidden="true" />
            <span>Adjuntar</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept=".pdf,image/*,.json,.txt,.md"
            onChange={(event) => {
              if (event.target.files) onArchivos(event.target.files);
              event.target.value = "";
            }}
          />
          <motion.button
            className="qz-send"
            type="submit"
            disabled={sending || (draft.trim().length === 0 && archivos.length === 0)}
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
              : esEntrada
                ? "Con el primer envío nace el expediente y Fable desmenuza la OT."
                : "Lo que escribas queda en el hilo del expediente y dispara la ola.")}
        </p>
      </form>
    </section>
  );
}

/**
 * La columna derecha cuando el tablero todavía no existe (entrada y
 * reconocimiento): una tarjeta quieta que dice dónde está la acción. El
 * trabajo pasa en la conversación; acá no se simula nada.
 */
function EstadoColumna({
  active,
  titulo,
  detalle,
}: {
  active: boolean;
  titulo: string;
  detalle: string;
}) {
  return (
    <section className="qz-board" data-mobile-active={active} aria-label="Estado del expediente">
      <div className="qz-estado qz-panel">
        <h2>{titulo}</h2>
        <p>{detalle}</p>
      </div>
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
  onWaveOutcome,
  onWaveResult,
  focusedItem,
  manualItems,
  onAddManual,
  onDropManual,
  decided,
  onReopen,
  tallerError,
  tallerLoading,
  tallerKind,
  labor,
  laborDelta,
  onAddPostulante,
  onDropPostulante,
  onElegirPostulante,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  queue: QueueEntry[];
  active: boolean;
  reduceMotion: boolean;
  bridge: BridgeConfig | null;
  wave: WaveRequest | null;
  onHealth: (health: BridgeHealth) => void;
  onWaveOutcome: (message: string) => void;
  onWaveResult: (text: string) => void;
  focusedItem: string | null;
  manualItems: ManualItem[];
  onAddManual: (draft: ManualDraft) => void;
  onDropManual: (id: string) => void;
  decided: Record<string, Decision>;
  onReopen: (key: string) => void;
  tallerError: string | null;
  tallerLoading: boolean;
  tallerKind: "remota" | "local";
  labor: LaborBoard;
  laborDelta: { min: number; max: number };
  onAddPostulante: (draft: PostulanteDraft) => void;
  onDropPostulante: (id: string) => void;
  onElegirPostulante: (batchId: string, id: string | null) => void;
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
      <MarginConsole
        snapshot={snapshot}
        reduceMotion={reduceMotion}
        manualItems={manualItems}
        decided={decided}
        laborDelta={laborDelta}
        labor={labor}
      />
      <InstrumentRow snapshot={snapshot} queue={queue} />
      <RubroLedger
        snapshot={snapshot}
        reduceMotion={reduceMotion}
        focusedItem={focusedItem}
        manualItems={manualItems}
        onAddManual={onAddManual}
        onDropManual={onDropManual}
        decided={decided}
        onReopen={onReopen}
        tallerError={tallerError}
        tallerLoading={tallerLoading}
        tallerKind={tallerKind}
        registerItem={(key, node) => {
          if (node) itemRefs.current.set(key, node);
          else itemRefs.current.delete(key);
        }}
      />
      <LaborLedger
        board={labor}
        onAdd={onAddPostulante}
        onDrop={onDropPostulante}
        onElegir={onElegirPostulante}
      />
      <LiveTerminals
        onWaveResult={onWaveResult}
        bridge={bridge}
        request={wave}
        onHealth={onHealth}
        onWaveOutcome={onWaveOutcome}
      />
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
  const manualTotal = sumManual(manualItems);

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
/**
 * El campo del precio. Vive aparte porque el instrumento lo muestra en dos
 * estados —con margen medido y sin precio todavía— y en los dos tiene que ser
 * el MISMO campo: si se duplicara el markup, uno de los dos se quedaría atrás.
 */
function PriceField({
  price,
  onPrice,
}: {
  price: number | null;
  onPrice: (value: number | null) => void;
}) {
  return (
    <label className="qz-margin__field">
      <span>Precio de venta</span>
      <input
        inputMode="numeric"
        value={price == null ? "" : price.toLocaleString("es-AR")}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          onPrice(digits ? Number(digits) : null);
        }}
        aria-label="Precio de venta a simular"
      />
    </label>
  );
}

function MarginConsole({
  snapshot,
  reduceMotion,
  manualItems,
  decided,
  laborDelta,
  labor,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  reduceMotion: boolean;
  manualItems: ManualItem[];
  decided: Record<string, Decision>;
  laborDelta: { min: number; max: number };
  labor: LaborBoard;
}) {
  const manualTotal = sumManual(manualItems);
  const laborChosen = labor.withChosen;
  /**
   * Huella de lo que hoy viajaría en el pase. Contar no alcanza: cambiar el
   * proveedor elegido de un rubro deja el conteo igual y la mesa distinta, y el
   * cartel "Pasado a App RAVN" seguía en pantalla describiendo un pase viejo.
   */
  const mesaFirma = useMemo(
    () =>
      [
        manualItems.map((item) => `${item.id}@${item.cantidad}x${item.precioUnit}`).join("|"),
        Object.entries(decided)
          .filter(([, decision]) => decision.value != null)
          .map(([key, decision]) => `${key}=${decision.origin}:${decision.value}`)
          .sort()
          .join("|"),
        labor.rubros
          .filter((rubro) => rubro.chosen)
          .map((rubro) => `${rubro.batchId}=${rubro.chosen?.id}:${rubro.chosen?.unitPrice}`)
          .join("|"),
      ].join("//"),
    [manualItems, decided, labor]
  );
  /**
   * El ítem a mano lo cargás justo cuando el motor se quedó corto: ahí querés
   * ver el margen CON eso adentro. El interruptor lo suma al costo (las dos
   * puntas) y deja dicho que el número ya no es sólo el del motor.
   */
  const [withManual, setWithManual] = useState(true);
  const addOn = manualTotal > 0 && withManual ? manualTotal : 0;
  /**
   * La mano de obra elegida PISA el costo del motor y el margen se recalcula al
   * toque, sin confirmación (regla de Eze). El delta ya viene firmado: puede
   * bajar el costo tanto como subirlo.
   */
  /**
   * El costo persistido es un TOTAL (ya con imprevistos y zona adentro); el
   * add-on a mano y el delta de la MO elegida son SUBTOTALES crudos. Se escalan
   * antes de sumarlos o el margen mide contra un costo que el motor no va a
   * confirmar cuando el pase recalcule en App RAVN.
   */
  const escala = subtotalToTotalScale(snapshot.core.composition);
  const costMin =
    snapshot.core.costRange.min == null
      ? null
      : snapshot.core.costRange.min + (addOn + laborDelta.min) * escala.min;
  const costMax =
    snapshot.core.costRange.max == null
      ? null
      : snapshot.core.costRange.max + (addOn + laborDelta.max) * escala.max;
  const persisted = snapshot.quote.finalNumber;
  const opening = useMemo(
    () => openingPrice({ persistedPrice: persisted, costMax }),
    [persisted, costMax]
  );
  const [price, setPrice] = useState<number | null>(opening?.price ?? null);
  const cotizacionAbierta = useRef(snapshot.quote.id);

  /**
   * El dial vuelve a abrir al cambiar de COTIZACIÓN, no cada vez que se mueve el
   * costo. Con la apertura como dependencia, marcar un postulante de MO o
   * prender el interruptor de ítems a mano cambiaba `costMax`, recalculaba la
   * apertura y **pisaba en silencio el precio que Eze había puesto** — que es
   * justo el que viaja en el pase (`precioPropuesta`). La segunda rama sólo
   * rellena cuando todavía no hay precio (el costo puede llegar después).
   */
  useEffect(() => {
    if (cotizacionAbierta.current !== snapshot.quote.id) {
      cotizacionAbierta.current = snapshot.quote.id;
      setPrice(opening?.price ?? null);
      return;
    }
  }, [snapshot.quote.id, opening]);

  const band = useMemo(
    () => (price == null ? null : marginBand({ price, costMin, costMax })),
    [price, costMin, costMax]
  );
  const dial = costMax != null && costMax > 0 ? priceDialRange(costMax) : null;

  if (costMin == null || costMax == null || !dial) {
    return (
      <section className="qz-margin qz-panel" aria-label="Precio y margen">
        <span className="qz-readout__label">Precio y margen</span>
        <p className="qz-gauge__empty">
          El motor todavía no cerró el costo. Sin costo no hay margen que medir.
        </p>
      </section>
    );
  }

  /**
   * Campo vacío ≠ costo sin cerrar. Borrar el precio para tipear otro dejaba
   * `price` en null, y el panel entero —el input incluido— se reemplazaba por
   * "el motor todavía no cerró el costo": mentira, y sin campo no había forma
   * de volver a escribir. El instrumento se queda, y dice lo que de verdad
   * falta.
   */
  if (!band) {
    return (
      <section className="qz-margin qz-panel" aria-label="Precio y margen">
        <span className="qz-readout__label">Precio y margen</span>
        <div className="qz-margin__control">
          <PriceField price={price} onPrice={setPrice} />
        </div>
        <p className="qz-gauge__empty">
          Poné el precio de venta y el instrumento mide el margen contra el costo.
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
        {manualTotal > 0 ? (
          <label className="qz-margin__switch">
            <input
              type="checkbox"
              checked={withManual}
              onChange={(event) => setWithManual(event.target.checked)}
            />
            <span>
              Contra el costo {withManual ? "con" : "sin"} lo que agregaste a mano
              <small>
                {money(manualTotal)} · {withManual ? "está sumado al costo" : "está afuera"}
              </small>
            </span>
          </label>
        ) : null}
        {laborChosen > 0 ? (
          <p className="qz-margin__labor">
            Mano de obra cerrada con proveedor en {laborChosen}{" "}
            {laborChosen === 1 ? "rubro" : "rubros"}:{" "}
            {laborDelta.max === 0 && laborDelta.min === 0
              ? "no le movió nada al costo."
              : `${laborDelta.max > 0 ? "sube" : "baja"} el techo ${money(Math.abs(laborDelta.max))}` +
                ` y ${laborDelta.min > 0 ? "sube" : "baja"} el piso ${money(Math.abs(laborDelta.min))}.`}
          </p>
        ) : null}
      </div>

      <div className="qz-margin__control">
        <PriceField price={price} onPrice={setPrice} />
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
            : `App RAVN tiene ${money(persisted)} cargado. Mover el dial no lo cambia: se escribe cuando pasás el expediente.`}
        </small>
        <PaseExpediente
          quoteId={snapshot.quote.id}
          price={price}
          manualCount={manualItems.length}
          decidedCount={
            Object.values(decided).filter((decision) => decision.value != null).length
          }
          laborChosen={laborChosen}
          mesaFirma={mesaFirma}
        />
      </div>
    </section>
  );
}

/**
 * El PASE: lo único que el laboratorio escribe en App RAVN.
 *
 * Va acá abajo, pegado al precio, porque es el gesto que sigue a fijarlo. Lo
 * que viaja es el número y el extracto rubro por rubro — nada de texto: el
 * alcance y la redacción de la propuesta son del diagnóstico.
 *
 * Regla anti-slop: nunca se muestra como pasado algo que no entró. El estado
 * `hecho` sólo aparece con la confirmación de App RAVN en la mano, y cualquier
 * rechazo se muestra con su motivo textual.
 */
function PaseExpediente({
  quoteId,
  price,
  manualCount,
  decidedCount,
  laborChosen,
  mesaFirma,
}: {
  quoteId: string;
  price: number | null;
  manualCount: number;
  decidedCount: number;
  /** Rubros con proveedor de MO marcado: viajan como precio cerrado del ítem. */
  laborChosen: number;
  /** Qué hay hoy sobre la mesa, ítem por ítem: si cambia, el pase quedó viejo. */
  mesaFirma: string;
}) {
  type Estado =
    | { kind: "listo" }
    | { kind: "confirmando" }
    | { kind: "pasando" }
    | { kind: "hecho"; detalle: string; descartados: string[] }
    | { kind: "error"; motivo: string };

  const [estado, setEstado] = useState<Estado>({ kind: "listo" });
  const real = isPersistableQuoteId(quoteId);

  // Cambió el precio o la mesa: el "pasado" de antes ya no describe lo que hay.
  useEffect(() => {
    setEstado((current) => (current.kind === "hecho" ? { kind: "listo" } : current));
  }, [price, mesaFirma]);

  const pasar = useCallback(async () => {
    setEstado({ kind: "pasando" });
    try {
      const response = await fetch(apiUrl("/api/pase"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: quoteId, precioPropuesta: price }),
      });
      const cuerpo = (await response.json().catch(() => null)) as
        | { error?: string; aplicados?: { manuales: number; precios: number }; descartados?: Array<{ que: string; motivo: string }> }
        | null;

      if (!response.ok || !cuerpo) {
        setEstado({
          kind: "error",
          motivo: cuerpo?.error ?? "El pase no entró y App RAVN no dijo por qué.",
        });
        return;
      }

      const aplicados = cuerpo.aplicados ?? { manuales: 0, precios: 0 };
      setEstado({
        kind: "hecho",
        detalle: `${aplicados.manuales} a mano · ${aplicados.precios} precios cerrados`,
        descartados: (cuerpo.descartados ?? []).map((d) => `${d.que}: ${d.motivo}`),
      });
    } catch {
      // Se cortó ANTES de leer la respuesta: puede haber entrado o no, y decir
      // que no entró sería inventarlo. El pase es idempotente, así que la
      // salida honesta es mirar y, si hace falta, volver a pasarlo.
      setEstado({
        kind: "error",
        motivo:
          "Se cortó la conexión con App RAVN y no sabemos si el pase entró. " +
          "Fijate la cotización en la app; si no está, volvé a pasarlo (pasar dos veces da lo mismo).",
      });
    }
  }, [price, quoteId]);

  if (!real) {
    return (
      <p className="qz-pase qz-pase--off">
        Vista de prueba: no hay expediente real al que pasarle el número.
      </p>
    );
  }

  if (estado.kind === "hecho") {
    return (
      <div className="qz-pase" data-state="hecho">
        <strong>Pasado a App RAVN</strong>
        <small>{estado.detalle}</small>
        {estado.descartados.length > 0 ? (
          <ul className="qz-pase__descartes">
            {estado.descartados.map((linea) => (
              <li key={linea}>Quedó afuera — {linea}</li>
            ))}
          </ul>
        ) : null}
        <small>Aprobá y emití la propuesta desde la app.</small>
      </div>
    );
  }

  if (estado.kind === "confirmando") {
    return (
      <div className="qz-pase" data-state="confirmando">
        <strong>
          {price == null ? "Sin precio" : money(price)} · {manualCount} a mano · {decidedCount}{" "}
          precios cerrados
          {laborChosen > 0
            ? ` · mano de obra de ${laborChosen} ${laborChosen === 1 ? "rubro" : "rubros"}`
            : ""}
        </strong>
        <small>
          La cotización queda igual a esta mesa. Si editaste algo a mano en App RAVN después del
          último pase, se pisa.
        </small>
        <div className="qz-pase__acciones">
          <button type="button" className="qz-pase__go" onClick={pasar}>
            Pasar
          </button>
          <button type="button" onClick={() => setEstado({ kind: "listo" })}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="qz-pase" data-state={estado.kind === "error" ? "error" : "listo"}>
      <button
        type="button"
        className="qz-pase__go"
        disabled={price == null || estado.kind === "pasando"}
        onClick={() => setEstado({ kind: "confirmando" })}
      >
        {estado.kind === "pasando" ? "Pasando…" : "Pasar el expediente a App RAVN"}
      </button>
      {price == null ? <small>Fijá el precio para poder pasarlo.</small> : null}
      {estado.kind === "error" ? <small role="alert">{estado.motivo}</small> : null}
    </div>
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

/**
 * Dónde está guardado lo que Eze arma. Es un instrumento, no un adorno: si la
 * base rechaza una escritura, la consola lo dice en vez de mostrar el cambio
 * como si hubiera entrado.
 */
function TallerState({
  error,
  loading,
  kind,
}: {
  error: string | null;
  loading: boolean;
  kind: "remota" | "local";
}) {
  if (error) {
    return (
      <span className="qz-taller-state" data-tone="alert" role="status">
        <TriangleAlert size={12} aria-hidden="true" />
        {error}
      </span>
    );
  }

  if (loading) {
    return (
      <span className="qz-taller-state" data-tone="wait" role="status">
        Abriendo la mesa
      </span>
    );
  }

  return (
    <span
      className="qz-taller-state"
      data-tone={kind === "remota" ? "ok" : "local"}
      role="status"
      title={
        kind === "remota"
          ? "Los ítems a mano y las decisiones quedan guardados en la base"
          : "Preview sintético: la mesa vive sólo en este navegador"
      }
    >
      {kind === "remota" ? "Mesa guardada" : "Mesa local (preview)"}
    </span>
  );
}

function RubroLedger({
  snapshot,
  reduceMotion,
  focusedItem,
  registerItem,
  manualItems,
  onAddManual,
  onDropManual,
  decided,
  onReopen,
  tallerError,
  tallerLoading,
  tallerKind,
}: {
  snapshot: QuoteWorkspaceSnapshot;
  reduceMotion: boolean;
  focusedItem: string | null;
  registerItem: (key: string, node: HTMLDivElement | null) => void;
  manualItems: ManualItem[];
  onAddManual: (draft: ManualDraft) => void;
  onDropManual: (id: string) => void;
  decided: Record<string, Decision>;
  onReopen: (key: string) => void;
  tallerError: string | null;
  tallerLoading: boolean;
  tallerKind: "remota" | "local";
}) {
  /**
   * Este ledger es de MATERIALES. Desde el pedido 3 la mano de obra tiene rubro
   * propio (`LaborLedger`) y sale de acá: mostrarla en los dos lados haría que
   * los dos números sumaran de más al leerlos juntos.
   */
  const totalMax = snapshot.batches.reduce(
    (sum, batch) => sum + (batch.materialsRange.max ?? 0),
    0
  );
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);

  return (
    <section className="qz-ledger qz-panel" aria-label="Rubros del costo">
      <header className="qz-ledger__head">
        <h2>Materiales por rubro</h2>
        <span>Cada precio contra la más barata del ítem · la mano de obra va aparte</span>
        <TallerState error={tallerError} loading={tallerLoading} kind={tallerKind} />
      </header>

      <div className="qz-ledger__scroll">
        {snapshot.batches.map((batch, index) => {
          const items = batch.items.filter((item) => item.tipo !== "mano_de_obra");
          if (items.length === 0 && !manualItems.some((item) => item.batchId === batch.id)) {
            return null;
          }
          const share =
            totalMax > 0 ? Math.round(((batch.materialsRange.max ?? 0) / totalMax) * 100) : 0;
          const mine = manualItems.filter((item) => item.batchId === batch.id);
          const mineTotal = sumManual(mine);
          const shut = collapsed.includes(batch.id);
          const openIssues = items.filter(
            (item) =>
              item.decision.kind !== "cerrado" && !decided[`${batch.id}:${item.name}`]
          ).length;
          return (
            <section className="qz-rubro" key={batch.id} data-collapsed={shut}>
              <header className="qz-rubro__head">
                <button
                  type="button"
                  className="qz-rubro__fold"
                  aria-expanded={!shut}
                  aria-label={shut ? `Abrir ${batch.etapa}` : `Cerrar ${batch.etapa}`}
                  onClick={() =>
                    setCollapsed((current) =>
                      current.includes(batch.id)
                        ? current.filter((id) => id !== batch.id)
                        : [...current, batch.id]
                    )
                  }
                >
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                <i style={{ background: rubroColor(index) }} aria-hidden="true" />
                <h3>{batch.etapa}</h3>
                {shut ? (
                  <span className="qz-rubro__share">
                    {items.length} ítems
                    {openIssues > 0 ? ` · ${openIssues} sin cerrar` : " · todos cerrados"}
                  </span>
                ) : null}
                <span className="qz-rubro__share">{share}% de los materiales</span>
                {mineTotal > 0 ? (
                  <span className="qz-rubro__manual">+ {compact(mineTotal)} a mano</span>
                ) : null}
                <strong className="qz-rubro__money">
                  {batch.materialsRange.min === batch.materialsRange.max
                    ? compact(batch.materialsRange.max)
                    : `${compact(batch.materialsRange.min)} — ${compact(batch.materialsRange.max)}`}
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

              {openForm === batch.id && !shut ? (
                <ManualItemForm
                  batchId={batch.id}
                  onCancel={() => setOpenForm(null)}
                  onAdd={(draft) => {
                    onAddManual(draft);
                    setOpenForm(null);
                  }}
                />
              ) : null}

              {shut ? null : (
                <div className="qz-rubro__items">
                  {items.map((item) => {
                    const key = `${batch.id}:${item.name}`;
                    return (
                      <ItemRow
                        key={item.name}
                        batchId={batch.id}
                        item={item}
                        focused={focusedItem === key}
                        reduceMotion={reduceMotion}
                        registerItem={registerItem}
                        decision={decided[key]}
                        onReopen={() => onReopen(key)}
                      />
                    );
                  })}
                  {mine.map((item) => (
                    <ManualItemRow key={item.id} item={item} onDrop={() => onDropManual(item.id)} />
                  ))}
                </div>
              )}
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

/**
 * EL RUBRO DE MANO DE OBRA (pedido 3 de Eze, 16/08).
 *
 * Un rubro propio, y adentro un panel por rubro de obra con los contendientes:
 * los presupuestos de proveedor que él cargó y las dos investigaciones que trajo
 * el motor. Marcar uno PISA el costo y recalcula el margen al toque, sin
 * confirmación — el desvío se muestra, no interrumpe.
 *
 * Nada acá es decorativo: cada número es un precio persistido o uno que Eze
 * tipeó, y cada frase compara dos de ellos.
 */
function LaborLedger({
  board,
  onAdd,
  onDrop,
  onElegir,
}: {
  board: LaborBoard;
  onAdd: (draft: PostulanteDraft) => void;
  onDrop: (id: string) => void;
  onElegir: (batchId: string, id: string | null) => void;
}) {
  const [openForm, setOpenForm] = useState<string | null>(null);

  if (board.rubros.length === 0) return null;

  return (
    <section className="qz-labor qz-panel" aria-label="Mano de obra por rubro">
      <header className="qz-ledger__head">
        <h2>Mano de obra</h2>
        <span>
          {board.withChosen} de {board.rubros.length}{" "}
          {board.rubros.length === 1 ? "rubro cerrado" : "rubros cerrados"} con proveedor ·{" "}
          {board.withCandidates === 0
            ? "sin presupuestos cargados"
            : `${board.withCandidates} con presupuesto`}
        </span>
        <strong className="qz-labor__total">
          {board.totalMin == null || board.totalMax == null
            ? "Sin precio"
            : board.totalMin === board.totalMax
              ? compact(board.totalMax)
              : `${compact(board.totalMin)} — ${compact(board.totalMax)}`}
        </strong>
      </header>

      <div className="qz-ledger__scroll">
        {board.rubros.map((rubro) => (
          <LaborRubroPanel
            key={rubro.batchId}
            rubro={rubro}
            formOpen={openForm === rubro.batchId}
            onToggleForm={() =>
              setOpenForm((current) => (current === rubro.batchId ? null : rubro.batchId))
            }
            onAdd={(draft) => {
              onAdd(draft);
              setOpenForm(null);
            }}
            onDrop={onDrop}
            onElegir={onElegir}
          />
        ))}
      </div>
    </section>
  );
}

function LaborRubroPanel({
  rubro,
  formOpen,
  onToggleForm,
  onAdd,
  onDrop,
  onElegir,
}: {
  rubro: LaborRubro;
  formOpen: boolean;
  onToggleForm: () => void;
  onAdd: (draft: PostulanteDraft) => void;
  onDrop: (id: string) => void;
  onElegir: (batchId: string, id: string | null) => void;
}) {
  return (
    <section className="qz-labor-rubro" data-severity={rubro.readout.severity}>
      <header className="qz-labor-rubro__head">
        <div>
          <h3>{rubro.etapa}</h3>
          <small>
            {rubro.itemName} · {rubro.cantidad.toLocaleString("es-AR")} {rubro.unidad}
          </small>
        </div>
        <span className="qz-labor-rubro__money" data-basis={rubro.costBasis}>
          {rubro.costMin == null || rubro.costMax == null
            ? "Sin precio"
            : rubro.costMin === rubro.costMax
              ? money(rubro.costMax)
              : `${money(rubro.costMin)} — ${money(rubro.costMax)}`}
          <small>
            {rubro.costBasis === "postulante"
              ? "lo que te cobran"
              : rubro.costBasis === "propio"
                ? "tu número"
                : rubro.costBasis === "investigacion"
                  ? "investigación"
                  : "no suma"}
          </small>
        </span>
      </header>

      <p className="qz-labor-rubro__verdict" data-severity={rubro.readout.severity}>
        {rubro.readout.severity !== "ok" ? <TriangleAlert size={13} aria-hidden="true" /> : null}
        {rubro.readout.headline}
      </p>

      {rubro.contenders.length > 0 ? (
        <ul className="qz-contenders">
          {rubro.contenders.map((contender) => (
            <ContenderRow
              key={`${contender.kind}:${contender.id}`}
              contender={contender}
              unidad={rubro.unidad}
              onElegir={() =>
                onElegir(rubro.batchId, contender.chosen ? null : contender.id)
              }
              onDrop={() => onDrop(contender.id)}
            />
          ))}
        </ul>
      ) : null}

      {rubro.readout.lines.length > 0 ? (
        <ul className="qz-labor-rubro__lines">
          {rubro.readout.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {formOpen ? (
        <PostulanteForm
          batchId={rubro.batchId}
          itemName={rubro.itemName}
          unidad={rubro.unidad}
          cantidad={rubro.cantidad}
          onAdd={onAdd}
          onCancel={onToggleForm}
        />
      ) : (
        <button type="button" className="qz-labor-rubro__add" onClick={onToggleForm}>
          <Plus size={13} aria-hidden="true" />
          Presupuesto de proveedor
        </button>
      )}
    </section>
  );
}

function ContenderRow({
  contender,
  unidad,
  onElegir,
  onDrop,
}: {
  contender: LaborContender;
  unidad: string;
  onElegir: () => void;
  onDrop: () => void;
}) {
  const esPostulante = contender.kind === "postulante";

  return (
    <li
      className="qz-contender"
      data-kind={contender.kind}
      data-chosen={contender.chosen}
      data-cheapest={contender.cheapest}
    >
      <div className="qz-contender__who">
        <strong>{contender.label}</strong>
        {contender.kind === "investigacion" ? (
          <span className="qz-contender__tag">investigación</span>
        ) : null}
        {contender.kind === "propio" ? (
          <span className="qz-contender__tag">ya cerrado por vos</span>
        ) : null}
        {contender.chosen ? (
          <span className="qz-contender__tag" data-tone="chosen">
            <Check size={11} aria-hidden="true" />
            el que me cobra
          </span>
        ) : null}
        {contender.cheapest ? <span className="qz-contender__tag">el más barato</span> : null}
        <small>
          {contender.source ?? "sin procedencia"} · {dateTime(contender.date)}
          {contender.expired
            ? ` · ${contender.ageDays} días (límite ${VENCIMIENTO_MO_DIAS})`
            : ""}
        </small>
      </div>

      <span className="qz-contender__price">
        <strong>{money(contender.total)}</strong>
        <small>
          {money(contender.unitPrice)}/{unidad}
          {contender.deltaPct != null && contender.deltaPct !== 0
            ? ` · ${signedPct(contender.deltaPct)}`
            : ""}
        </small>
      </span>

      <span className="qz-contender__actions">
        {esPostulante ? (
          <button
            type="button"
            className="qz-contender__pick"
            data-active={contender.chosen}
            onClick={onElegir}
          >
            {contender.chosen ? "Sacarlo" : "Es el que me cobra"}
          </button>
        ) : (
          <span className="qz-contender__note">
            {contender.kind === "propio" ? "en el costo hoy" : "no entra al costo"}
          </span>
        )}
        {esPostulante ? (
          <button
            type="button"
            className="qz-item__drop"
            onClick={onDrop}
            aria-label={`Sacar el presupuesto de ${contender.label}`}
            title="Sacar de la mesa"
          >
            <X size={13} aria-hidden="true" />
          </button>
        ) : null}
      </span>
    </li>
  );
}

/**
 * Alta de un presupuesto de proveedor. El número se puede tipear como total del
 * rubro o por unidad: los dos existen en la realidad (Fran tira "$40.000 el m²"
 * o "$3.000.000 todo el baño") y la cantidad ya se conoce, así que traducir uno
 * al otro es una división, no una suposición.
 */
function PostulanteForm({
  batchId,
  itemName,
  unidad,
  cantidad,
  onAdd,
  onCancel,
}: {
  batchId: string;
  itemName: string;
  unidad: string;
  cantidad: number;
  onAdd: (draft: PostulanteDraft) => void;
  onCancel: () => void;
}) {
  const [proveedor, setProveedor] = useState("");
  const [monto, setMonto] = useState("");
  const [modo, setModo] = useState<"total" | "unitario">("total");
  const [fecha, setFecha] = useState(hoyLocalIso);
  const [procedencia, setProcedencia] = useState("");

  const montoNum = Number(monto.replace(/\./g, "").replace(",", "."));
  const precioUnit =
    Number.isFinite(montoNum) && montoNum > 0
      ? modo === "total"
        ? montoNum / cantidad
        : montoNum
      : null;
  const valid = proveedor.trim().length > 0 && precioUnit != null && fecha.length === 10;

  return (
    <form
      className="qz-manual-form qz-postulante-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || precioUnit == null) return;
        onAdd({
          batchId,
          itemName,
          proveedor: proveedor.trim(),
          precioUnit,
          fecha,
          procedencia: procedencia.trim() || null,
        });
      }}
    >
      <label>
        <span>Quién pasó el precio</span>
        <input
          value={proveedor}
          autoFocus
          onChange={(event) => setProveedor(event.target.value)}
          placeholder="Ej.: Fran"
        />
      </label>
      <label>
        <span>Cuánto</span>
        <input
          inputMode="numeric"
          value={monto}
          onChange={(event) => setMonto(event.target.value)}
          placeholder="0"
        />
      </label>
      <label>
        <span>Ese número es</span>
        <select value={modo} onChange={(event) => setModo(event.target.value as typeof modo)}>
          <option value="total">Todo el rubro</option>
          <option value="unitario">Por {unidad}</option>
        </select>
      </label>
      <label>
        <span>Cuándo</span>
        <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} />
      </label>
      <label>
        <span>De dónde salió</span>
        <input
          value={procedencia}
          onChange={(event) => setProcedencia(event.target.value)}
          placeholder="Presupuesto por WhatsApp"
        />
      </label>
      <p className="qz-postulante-form__echo">
        {precioUnit == null
          ? `${cantidad.toLocaleString("es-AR")} ${unidad} a cotizar`
          : `${money(precioUnit)}/${unidad} · ${money(precioUnit * cantidad)} el rubro`}
      </p>
      <button type="submit" disabled={!valid}>
        Agregar
      </button>
      <button type="button" className="qz-manual-form__cancel" onClick={onCancel}>
        Cancelar
      </button>
    </form>
  );
}

function ItemRow({
  batchId,
  item,
  focused,
  reduceMotion,
  registerItem,
  decision,
  onReopen,
}: {
  batchId: string;
  item: BatchItem;
  focused: boolean;
  reduceMotion: boolean;
  registerItem: (key: string, node: HTMLDivElement | null) => void;
  decision?: Decision;
  onReopen: () => void;
}) {
  const key = `${batchId}:${item.name}`;
  return (
    <motion.div
      className="qz-item"
      data-decided={Boolean(decision)}
      data-severity={decision ? "ok" : item.decision.severity}
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

      {decision ? (
        <p className="qz-item__verdict qz-item__closed">
          <Check size={13} aria-hidden="true" />
          Lo cerraste vos con {ORIGIN_LABELS[decision.origin] ?? decision.origin}
          {decision.value != null ? ` · ${money(decision.value)}` : ""}
          <button type="button" onClick={onReopen}>
            Reabrir
          </button>
        </p>
      ) : (
        <p className="qz-item__verdict" data-severity={item.decision.severity}>
          {item.decision.severity !== "ok" ? <TriangleAlert size={13} aria-hidden="true" /> : null}
          {item.decision.headline}
        </p>
      )}
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
  onAdd: (draft: ManualDraft) => void;
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
  onDecide,
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
  onDecide: (key: string, origin: string, value: number | null) => void;
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
                        {/* la decisión se toma acá: un clic y el ítem sale de la cola */}
                        <button
                          type="button"
                          className="qz-decision__use"
                          onClick={() => onDecide(key, offer.origin, offer.value)}
                          aria-label={`Usar ${ORIGIN_LABELS[offer.origin] ?? offer.origin} para ${entry.item.name}`}
                        >
                          Usar
                        </button>
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

                <div className="qz-decision__actions">
                  <button
                    type="button"
                    onClick={() => onAnswer(`${entry.item.name}: `)}
                  >
                    Resolver en la conversación
                    <ArrowUp size={13} aria-hidden="true" />
                  </button>
                  {entry.item.offers.length === 0 ? (
                    <small>
                      Sin fuente persistida: cargalo a mano en el rubro o definilo acá.
                    </small>
                  ) : (
                    <button
                      type="button"
                      className="qz-decision__skip"
                      onClick={() => onDecide(key, "eze", null)}
                    >
                      Lo dejo cerrado igual
                    </button>
                  )}
                </div>
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
