"use client";

import { Camera, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  adjuntoKindDesdeFile,
  type GastoAdjuntoKind,
} from "@/lib/gastos-storage";

const labelCls =
  "mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted";

const iconBtn =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-none border border-ravn-line bg-ravn-surface text-ravn-fg transition-colors hover:border-ravn-fg hover:bg-ravn-subtle focus-visible:outline focus-visible:ring-1 focus-visible:ring-ravn-fg disabled:opacity-40";

type Props = {
  /** Solo cámara, solo micrófono, o ambos (por defecto). */
  variant?: "foto" | "audio" | "ambos";
  adjuntoFile: File | null;
  adjuntoKind: GastoAdjuntoKind | null;
  onAdjunto: (file: File) => void;
  onClear: () => void;
  onError: (msg: string | null) => void;
};

/** Íconos cámara y/o micrófono según variant. */
export function CashflowMediaCapture({
  variant = "ambos",
  adjuntoFile,
  adjuntoKind,
  onAdjunto,
  onClear,
  onError,
}: Props) {
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [grabando, setGrabando] = useState(false);

  useEffect(() => {
    return () => {
      try {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function toggleGrabacion() {
    if (grabando) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onError("Tu navegador no permite grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];
      const mime =
        mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setGrabando(false);
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        if (blob.size < 80) {
          onError("La grabación quedó vacía.");
          return;
        }
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `audio-${Date.now()}.${ext}`, {
          type: blob.type || "audio/webm",
        });
        onAdjunto(file);
      };
      rec.start(200);
      setGrabando(true);
      onError(null);
    } catch {
      onError("No se pudo usar el micrófono (revisá permisos).");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className={labelCls}>
        {variant === "foto"
          ? "Foto"
          : variant === "audio"
            ? "Audio"
            : "Foto o audio"}
      </span>
      <div className="flex items-center gap-2">
        {(variant === "foto" || variant === "ambos") && (
          <>
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (f) {
                  const k = adjuntoKindDesdeFile(f);
                  if (!k || k !== "foto") {
                    onError("Elegí una imagen o sacá una foto.");
                    return;
                  }
                  onError(null);
                  onAdjunto(f);
                }
              }}
            />
            <button
              type="button"
              className={iconBtn}
              aria-label="Sacar foto o elegir imagen"
              title="Foto"
              onClick={() => fotoInputRef.current?.click()}
            >
              <Camera className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            </button>
          </>
        )}
        {(variant === "audio" || variant === "ambos") && (
          <button
            type="button"
            className={`${iconBtn} ${grabando ? "border-red-500/60 bg-red-950/20 text-red-400" : ""}`}
            aria-label={grabando ? "Detener grabación" : "Grabar audio"}
            title={grabando ? "Detener" : "Grabar audio"}
            onClick={() => void toggleGrabacion()}
          >
            <Mic className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          </button>
        )}
      </div>
      {grabando ? (
        <span className="text-[10px] font-medium uppercase tracking-wider text-red-400">
          Grabando… tocá el micrófono para terminar
        </span>
      ) : null}
      {adjuntoFile ? (
        <div className="flex flex-col gap-1">
          <span className="break-all text-[10px] text-ravn-muted">
            {adjuntoKind === "foto" ? "Foto" : "Audio"}: {adjuntoFile.name}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="w-fit text-[10px] font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 hover:text-ravn-fg hover:underline"
          >
            Quitar
          </button>
        </div>
      ) : null}
    </div>
  );
}
