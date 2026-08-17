"use client";

import { ArrowUp, FileUp, Paperclip } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { apiUrl } from "../lib/api-url";
import { despacharOla, subirUno } from "../lib/intake-client";
import type { BridgeConfig } from "./live-terminals";

/**
 * La PUERTA DE ENTRADA (spec 2026-08-17): Eze tira el archivo / pega el texto
 * y acá nace la cotización. Orden inquebrantable: primero PERSISTE (borrador +
 * archivos en App RAVN — nada se pierde aunque se apague la Mac), después se
 * despacha la ola. Cada paso cuenta lo que REALMENTE pasó (regla anti-slop):
 * si el bridge está apagado, lo dice y no simula que desmenuza.
 */

type Fase = "editando" | "creando" | "subiendo" | "lanzando";

async function jsonDe(res: Response): Promise<Record<string, unknown>> {
  const cuerpo = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const motivo = cuerpo && typeof cuerpo.error === "string" ? cuerpo.error : `HTTP ${res.status}`;
    throw new Error(motivo);
  }
  return cuerpo ?? {};
}

export function IntakeGate({
  bridge,
  active,
  onCreated,
}: {
  bridge: BridgeConfig | null;
  active: boolean;
  onCreated: (cotizacionId: string, aviso: string | null) => void;
}) {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [texto, setTexto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [fase, setFase] = useState<Fase>("editando");
  const [aviso, setAviso] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const agregarArchivos = (nuevos: FileList | File[]) => {
    const lista = Array.from(nuevos).filter((f) => f.size > 0);
    if (lista.length === 0) return;
    setArchivos((actual) => [...actual, ...lista]);
    setTitulo((actual) => actual || lista[0].name.replace(/\.[^.]+$/, ""));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (fase === "editando") agregarArchivos(event.dataTransfer.files);
  };

  const crear = async () => {
    const tituloFinal = titulo.trim() || texto.trim().slice(0, 60);
    if (!tituloFinal) {
      setAviso("Poné un título o algo de texto: sin eso no hay trabajo que nombrar.");
      return;
    }
    if (archivos.length === 0 && !texto.trim()) {
      setAviso("Tirá un archivo o pegá el pedido: no hay nada que desmenuzar.");
      return;
    }

    try {
      setFase("creando");
      setAviso("Creando el borrador en App RAVN…");
      const creado = await jsonDe(
        await fetch(apiUrl("/api/intake"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titulo: tituloFinal, texto: texto.trim() }),
        })
      );
      const cotizacionId = String(creado.cotizacionId ?? "");
      if (!cotizacionId) throw new Error("App RAVN no devolvió el id del borrador.");
      const advertencia = typeof creado.advertencia === "string" ? creado.advertencia : null;

      setFase("subiendo");
      for (const [i, archivo] of archivos.entries()) {
        setAviso(`Subiendo ${archivo.name} (${i + 1}/${archivos.length})…`);
        try {
          await subirUno(cotizacionId, archivo);
        } catch (error) {
          const motivo = error instanceof Error ? error.message : "falló la subida";
          onCreated(
            cotizacionId,
            `El borrador ya existe, pero "${archivo.name}" no subió (${motivo}). Reintentá desde la cotización.`
          );
          return;
        }
      }

      setFase("lanzando");
      setAviso("Despachando la ola de intake…");
      const ola = await despacharOla(cotizacionId, bridge);
      onCreated(cotizacionId, advertencia ?? ola.mensaje);
    } catch (error) {
      setFase("editando");
      setAviso(error instanceof Error ? error.message : "La puerta no pudo crear la cotización.");
    }
  };

  const ocupada = fase !== "editando";

  return (
    <section className="qz-board" data-mobile-active={active} aria-label="Nueva cotización">
      <div
        className="qz-intake qz-panel"
        data-dragging={dragging}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <header className="qz-intake__head">
          <h2>Nueva cotización</h2>
          <p>
            Tirá la OT, el relevamiento, fotos o el pedido del cliente. La cotización nace acá:
            primero se guarda, después la ola la desmenuza.
          </p>
        </header>

        <label className="qz-intake__campo">
          <span>Título del trabajo</span>
          <input
            type="text"
            value={titulo}
            disabled={ocupada}
            maxLength={200}
            placeholder="Ej.: Vanos en Húsares 2255"
            onChange={(event) => setTitulo(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="qz-intake__drop"
          disabled={ocupada}
          onClick={() => inputRef.current?.click()}
        >
          <FileUp size={20} aria-hidden="true" />
          {archivos.length === 0
            ? "Soltá archivos acá o tocá para elegir (PDF, fotos, checklist)"
            : `${archivos.length} archivo(s) listos — tocá para sumar más`}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,image/*,.json,.txt,.md"
          onChange={(event) => {
            if (event.target.files) agregarArchivos(event.target.files);
            event.target.value = "";
          }}
        />

        {archivos.length > 0 ? (
          <ul className="qz-intake__archivos">
            {archivos.map((archivo, i) => (
              <li key={`${archivo.name}-${i}`}>
                <Paperclip size={12} aria-hidden="true" />
                <span>{archivo.name}</span>
                <em>{(archivo.size / 1024 / 1024).toFixed(1)} MB</em>
                {!ocupada ? (
                  <button
                    type="button"
                    aria-label={`Sacar ${archivo.name}`}
                    onClick={() => setArchivos((actual) => actual.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <label className="qz-intake__campo">
          <span>Texto pegado o dictado (opcional si hay archivos)</span>
          <textarea
            rows={5}
            value={texto}
            disabled={ocupada}
            placeholder="Ej.: Hay que abrir dos vanos en pared portante de 20, con dintel…"
            onChange={(event) => setTexto(event.target.value)}
          />
        </label>

        <footer className="qz-intake__pie">
          <p role="status" aria-live="polite">
            {aviso ??
              (bridge
                ? "Al crear, la ola corre en tu Mac por el bridge — sin API de pago."
                : "Sin bridge configurado la ola no corre, pero el borrador igual se guarda.")}
          </p>
          <button type="button" className="qz-send qz-intake__crear" disabled={ocupada} onClick={() => void crear()}>
            <ArrowUp size={16} aria-hidden="true" />
            {ocupada ? "Trabajando…" : "Crear y desmenuzar"}
          </button>
        </footer>
      </div>
    </section>
  );
}
