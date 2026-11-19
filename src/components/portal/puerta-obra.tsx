"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { RavnIso } from "@/components/ravn-iso";
import { EASE } from "./portal-ui";

/** Puerta única del portal (/o): el cliente escribe el nombre de su obra y la contraseña. */
export function PuertaObra() {
  const quieto = useReducedMotion();
  const [obra, setObra] = useState("");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/portal/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obra: obra.trim(), clave: clave.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; destino?: string };
      if (res.ok && j.ok && j.destino) {
        window.location.assign(j.destino);
        return;
      }
      setError(j.error ?? "No pudimos validar el acceso. Probá de nuevo.");
      setClave("");
    } catch {
      setError("No hay conexión. Revisá tu señal y probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const etiqueta = "block text-[17px] font-semibold leading-tight tracking-[-0.025em] text-[#f2efe8]";
  const campo =
    "mt-3 block h-14 w-full rounded-none border border-[#f2efe8]/30 bg-transparent px-4 text-[18px] font-medium text-[#f2efe8] outline-none transition-colors focus:border-[#f2efe8]";

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
        <div className="flex justify-center">
          <RavnIso label="RAVN" style={{ height: 112 }} className="text-[#f2efe8]" />
        </div>

        <h1 className="mt-10 text-center text-[clamp(26px,7vw,34px)] font-semibold leading-[1.06] tracking-[-0.035em]">Acceso al portal</h1>
        <p className="mt-3 text-center text-[16px] leading-relaxed text-[#f2efe8]/80">
          Ingresá el nombre de tu obra y la contraseña que te enviamos.
        </p>

        <form onSubmit={entrar} className="mt-10" noValidate>
          <label htmlFor="obra" className={etiqueta}>
            Nombre de la obra
          </label>
          <input
            id="obra"
            name="obra"
            value={obra}
            onChange={(e) => setObra(e.target.value.slice(0, 200))}
            autoComplete="username"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            className={campo}
          />

          <label htmlFor="clave" className={`${etiqueta} mt-6`}>
            Contraseña
          </label>
          <div className="relative mt-3">
          <input
            id="clave"
            name="clave"
            type={ver ? "text" : "password"}
            value={clave}
            onChange={(e) => setClave(e.target.value.slice(0, 40))}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            aria-describedby={error ? "acceso-error" : undefined}
            aria-invalid={Boolean(error)}
            className={`${campo} !mt-0 pr-14`}
          />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              aria-pressed={ver}
              aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-1 top-1/2 inline-flex size-12 -translate-y-1/2 cursor-pointer items-center justify-center text-[#f2efe8]/75 transition-colors hover:text-[#f2efe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#f2efe8]"
            >
              {ver ? <EyeOff size={20} strokeWidth={1.5} aria-hidden /> : <Eye size={20} strokeWidth={1.5} aria-hidden />}
            </button>
          </div>
          <p id="acceso-error" role="alert" aria-live="polite" className="mt-3 min-h-[1.5em] text-[14px] text-[#f2efe8]">
            {error}
          </p>
          <button
            type="submit"
            disabled={enviando || !obra.trim() || clave.trim().length < 6}
            className="mt-3 inline-flex h-14 w-full cursor-pointer items-center justify-center bg-[#f2efe8] text-[15px] font-semibold tracking-[-0.015em] text-[#070707] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f2efe8] disabled:cursor-default disabled:opacity-40"
          >
            {enviando ? "Verificando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-10 text-[14px] leading-relaxed text-[#f2efe8]/80">Si no tenés tus datos de acceso, pedilos a tu contacto en RAVN.</p>
      </motion.main>
    </div>
  );
}
