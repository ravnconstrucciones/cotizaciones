"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { RavnIso } from "@/components/ravn-iso";
import { EASE, Wordmark } from "./portal-ui";

/** Puerta del portal: muestra el nombre de la obra y pide su contraseña. */
export function PinGate({ slug, obra }: { slug: string; obra: string }) {
  const quieto = useReducedMotion();
  const [pin, setPin] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError("");
    try {
      const res = await fetch(`/api/portal/${slug}/acceso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: pin.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        // Al entrar, el cliente arranca en la agenda (pedido de Eze, 20/11/2026).
        window.location.hash = "agenda";
        window.location.reload();
        return;
      }
      setError(j.error ?? "No pudimos validar la contraseña. Probá de nuevo.");
      setPin("");
    } catch {
      setError("No hay conexión. Revisá tu señal y probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="flex min-h-dvh flex-col bg-[#070707] px-6 text-[#f2efe8] antialiased"
      style={{ fontFamily: '-apple-system, system-ui, "Helvetica Neue", Arial, sans-serif' }}
    >
      <motion.main
        className="m-auto w-full max-w-sm py-16"
        initial={quieto ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <div className="flex flex-col items-start gap-5">
          <RavnIso label={null} style={{ height: 44 }} className="text-[#f2efe8]" />
          <Wordmark className="text-[15px]" />
        </div>

        <p className="mt-14 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#f2efe8]/75">Tu obra</p>
        <h1 className="mt-3 text-[clamp(30px,8vw,40px)] font-semibold leading-[1.06] tracking-[-0.035em] [overflow-wrap:anywhere]">{obra}</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-[#f2efe8]/80">
          Ingresá la contraseña que te enviamos para ver el avance, la agenda y los registros.
        </p>

        <form onSubmit={entrar} className="mt-10" noValidate>
          <div className="flex items-baseline justify-between">
            <label htmlFor="clave" className="block text-[12px] font-semibold uppercase tracking-[0.14em] text-[#f2efe8]/75">
              Contraseña
            </label>
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              aria-pressed={ver}
              className="cursor-pointer text-[13px] font-medium text-[#f2efe8]/80 underline underline-offset-4 hover:text-[#f2efe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f2efe8]"
            >
              {ver ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <input
            id="clave"
            name="clave"
            type={ver ? "text" : "password"}
            value={pin}
            onChange={(e) => setPin(e.target.value.slice(0, 40))}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            aria-describedby={error ? "pin-error" : undefined}
            aria-invalid={Boolean(error)}
            className="mt-3 block h-14 w-full rounded-none border border-[#f2efe8]/30 bg-transparent px-4 text-[18px] font-medium text-[#f2efe8] outline-none transition-colors focus:border-[#f2efe8]"
          />
          <p id="pin-error" role="alert" aria-live="polite" className="mt-3 min-h-[1.5em] text-[14px] text-[#f2efe8]">
            {error}
          </p>
          <button
            type="submit"
            disabled={enviando || pin.trim().length < 6}
            className="mt-3 inline-flex h-14 w-full cursor-pointer items-center justify-center bg-[#f2efe8] text-[15px] font-semibold tracking-[-0.015em] text-[#070707] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f2efe8] disabled:cursor-default disabled:opacity-40"
          >
            {enviando ? "Verificando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-10 text-[14px] leading-relaxed text-[#f2efe8]/80">
          Si no tenés la contraseña, pedila a tu contacto en RAVN.
        </p>
      </motion.main>
    </div>
  );
}
