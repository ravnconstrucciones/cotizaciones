"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Captura por IA de /gasto: foto de ticket (selector nativo: cámara o
 * galería) y nota de voz grabada acá (MediaRecorder). Manda el archivo a
 * /api/cashflow/extract-comprobante con el contexto de obras/rubros y
 * devuelve lo extraído al padre — la pantalla PRECARGA, nunca guarda sola.
 */

export type DatosExtraidos = {
  monto_ars: number | null;
  fecha: string | null;
  concepto: string;
  tipo: "ingreso" | "egreso" | null;
  transcripcion?: string;
  obra_id?: string | null;
  rubro_id?: string | null;
  tipo_gasto?: "obra" | "empresa" | "personal" | null;
};

export type ContextoIa = {
  obras: Array<{ id: string; nombre: string }>;
  rubros: Array<{ id: string; nombre: string }>;
};

type Modo = "idle" | "grabando" | "procesando";

const MAX_SEGUNDOS = 60;

const BTN =
  "font-mono-hud inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full ring-1 ring-cdm-line px-4 text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-fg disabled:opacity-40";

function IconoCamara() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.5-2h7L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function IconoMic() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </svg>
  );
}

function mensajeMic(e: unknown): string {
  const nombre = e instanceof DOMException ? e.name : "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "iOS bloqueó el micrófono. En Ajustes → Apps → Gasto (o Safari) → Micrófono, permitilo y probá de nuevo.";
  }
  if (nombre === "NotFoundError") return "No se encontró micrófono en el dispositivo.";
  return "No se pudo grabar. Probá de nuevo.";
}

export function CapturaIa({
  contexto,
  deshabilitado,
  onExtraido,
}: {
  contexto: ContextoIa;
  /** Mientras se guarda un gasto, no tiene sentido disparar otra lectura. */
  deshabilitado?: boolean;
  onExtraido: (d: DatosExtraidos, origen: "foto" | "audio") => void;
}) {
  const reducir = useReducedMotion();
  const [modo, setModo] = useState<Modo>("idle");
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fotoRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const descartarRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const frenarTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  // Desmontaje: soltar el micrófono sí o sí (luz naranja de iOS).
  useEffect(
    () => () => {
      frenarTimer();
      const rec = recRef.current;
      if (rec && rec.state !== "inactive") {
        descartarRef.current = true;
        rec.stop();
      }
      rec?.stream.getTracks().forEach((t) => t.stop());
    },
    [frenarTimer]
  );

  const enviar = useCallback(
    async (archivo: File, origen: "foto" | "audio") => {
      setModo("procesando");
      setError(null);
      try {
        const fd = new FormData();
        fd.append("file", archivo);
        fd.append("contexto", JSON.stringify(contexto));
        const res = await fetch("/api/cashflow/extract-comprobante", {
          method: "POST",
          body: fd,
        });
        const esHtml = (res.headers.get("content-type") ?? "").includes("text/html");
        if (res.status === 401 || esHtml) {
          throw new Error("Sesión vencida. Entrá de nuevo desde el Centro de Mando.");
        }
        const body = (await res.json().catch(() => null)) as
          | (DatosExtraidos & { error?: string })
          | null;
        if (!res.ok || !body || body.error) {
          throw new Error(body?.error ?? "No se pudo leer. Probá de nuevo o cargalo a mano.");
        }
        onExtraido(body, origen);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo leer. Probá de nuevo.");
      } finally {
        setModo("idle");
      }
    },
    [contexto, onExtraido]
  );

  const elegirFoto = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) void enviar(f, "foto");
    },
    [enviar]
  );

  const cortarGrabacion = useCallback((descartar: boolean) => {
    descartarRef.current = descartar;
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const grabar = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(mensajeMic(e));
      return;
    }
    // iOS Safari graba audio/mp4 (AAC); Chrome, audio/webm. Ambos los toma Gemini.
    const tipo = MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    recRef.current = rec;
    chunksRef.current = [];
    descartarRef.current = false;
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      frenarTimer();
      if (descartarRef.current) {
        setModo("idle");
        return;
      }
      const mime = (rec.mimeType || tipo || "audio/mp4").split(";")[0];
      const blob = new Blob(chunksRef.current, { type: mime });
      if (blob.size === 0) {
        setError("No se grabó nada. Probá de nuevo.");
        setModo("idle");
        return;
      }
      const ext = mime.includes("webm") ? "webm" : "m4a";
      void enviar(new File([blob], `gasto-audio.${ext}`, { type: mime }), "audio");
    };
    rec.start();
    setSegundos(0);
    setModo("grabando");
    timerRef.current = setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= MAX_SEGUNDOS) cortarGrabacion(false);
        return s + 1;
      });
    }, 1000);
  }, [cortarGrabacion, enviar, frenarTimer]);

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

  return (
    <div>
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={elegirFoto}
        aria-hidden
        tabIndex={-1}
      />

      {modo === "grabando" ? (
        <div className="flex min-h-[48px] items-center gap-3 rounded-full px-4 ring-1 ring-red-400/40">
          <motion.span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full bg-red-400"
            animate={reducir ? undefined : { opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span className="font-mono-hud text-[11px] tabular-nums text-red-400" aria-live="polite">
            {mmss}
          </span>
          <span className="font-mono-hud flex-1 truncate text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
            Decí monto, qué fue y de qué obra
          </span>
          <button
            type="button"
            onClick={() => cortarGrabacion(true)}
            className="font-mono-hud min-h-[44px] px-2 text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg"
          >
            [X]
          </button>
          <button
            type="button"
            onClick={() => cortarGrabacion(false)}
            className="font-mono-hud min-h-[44px] px-2 text-[10px] uppercase tracking-[0.14em] text-cdm-fg"
          >
            [LISTO]
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fotoRef.current?.click()}
            disabled={deshabilitado || modo === "procesando"}
            className={BTN}
          >
            <IconoCamara />
            {modo === "procesando" ? "Leyendo…" : "Foto ticket"}
          </button>
          <button
            type="button"
            onClick={() => void grabar()}
            disabled={deshabilitado || modo === "procesando"}
            className={BTN}
          >
            <IconoMic />
            {modo === "procesando" ? "Leyendo…" : "Dictar"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
