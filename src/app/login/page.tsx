"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { RavnLogo } from "@/components/ravn-logo";

/**
 * Shader de líneas de colores (21st.dev "shader lines"): lazy, solo cliente —
 * el fondo full-screen del login. Reemplaza a la malla Waves + niebla cian y
 * al monolito 3D (que quedan solo en el resto del cockpit / ADN).
 */
const ShaderLines = dynamic(
  () => import("@/components/cockpit/shader-lines"),
  { ssr: false }
);

/**
 * Login (iteración 4 — shader lines): el fondo ahora son las líneas de
 * colores RGB animadas del shader. El form es NEUTRO (sin cian): glass
 * oscuro sobrio sobre el fondo colorido para que se lea bien. La marca
 * "RAVN." va en off-white plano (sin shimmer cian). La lógica de auth no
 * cambió. El resto del cockpit (adentro) sigue cian — esto es SOLO el login.
 */

// Inputs NEUTROS: línea inferior gris, foco blanco/gris tenue (NO cian).
const fieldCls =
  "w-full rounded-none border-0 border-b border-white/15 bg-transparent px-1 py-3 text-sm text-white placeholder:text-white/35 transition-[border-color,box-shadow] duration-200 focus-visible:border-white/55 focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-18px_rgba(255,255,255,0.45)]";

const labelCls =
  "text-[10px] font-medium uppercase tracking-[0.24em] text-white/55";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const reducirMovimiento = useReducedMotion();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Usuario o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="font-grotesk relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-black px-6 py-12 text-white">
      {/* Fondo: shader de líneas de colores, full-screen, detrás de todo. */}
      <ShaderLines className="fixed inset-0 z-0" />
      {/* Velo oscuro uniforme: baja parejo el brillo del shader (sin columna
          central) para que las líneas no compitan con el texto. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] bg-black/45"
      />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-10">
        <motion.div
          initial={reducirMovimiento ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Marca en off-white plano — sin shimmer cian. */}
          <RavnLogo
            sizeClassName="text-4xl sm:text-5xl"
            className="text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.85)]"
          />
        </motion.div>

        <motion.form
          onSubmit={handleLogin}
          initial={reducirMovimiento ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.55,
            delay: 0.12,
            ease: [0.22, 1, 0.36, 1],
          }}
          // Panel glass oscuro sobrio (negro translúcido + blur), borde gris
          // neutro — NADA de cian. Se lee bien sobre las líneas de colores.
          className="flex w-full flex-col gap-6 border border-white/10 bg-black/55 p-8 shadow-[0_32px_80px_-28px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className={labelCls}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldCls}
              placeholder="tu@email.com"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className={labelCls}>
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldCls}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs uppercase tracking-wider text-red-300"
            >
              {error}
            </p>
          )}

          {/* Botón INGRESAR off-white sobrio (como estaba el blanco), sin cian. */}
          <motion.button
            type="submit"
            disabled={loading}
            whileHover={reducirMovimiento ? undefined : { y: -1 }}
            whileTap={reducirMovimiento ? undefined : { scale: 0.985 }}
            className="mt-2 inline-flex w-full items-center justify-center rounded-none border border-white/20 bg-white/90 px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-black transition-colors duration-200 hover:bg-white disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </motion.button>
        </motion.form>
      </div>
    </main>
  );
}
