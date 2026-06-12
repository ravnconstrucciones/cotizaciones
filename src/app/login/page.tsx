"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { RavnLogo } from "@/components/ravn-logo";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";

/**
 * Login (iteración 3 — primera impresión): la malla Waves también vive acá
 * (antes era negro plano), la marca grande con shimmer y el form como panel
 * glass flotante con entrada animada. La lógica de auth no cambió.
 */

const fieldCls =
  "w-full rounded-none border-0 border-b border-cdm-line bg-transparent px-1 py-3 text-sm text-cdm-fg placeholder:text-cdm-muted/40 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]";

const labelCls =
  "text-[10px] font-medium uppercase tracking-[0.24em] text-cdm-muted";

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
    <main className="font-grotesk relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-cdm-bg px-6 py-12 text-cdm-fg">
      <WavesBackdrop />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-10">
        <motion.div
          initial={reducirMovimiento ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <RavnLogo
            shimmer
            sizeClassName="text-4xl sm:text-5xl"
            className="drop-shadow-[0_0_28px_rgba(34,211,238,0.25)]"
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
          className="cdm-glass flex w-full flex-col gap-6 p-8"
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

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={reducirMovimiento ? undefined : { y: -1 }}
            whileTap={reducirMovimiento ? undefined : { scale: 0.985 }}
            className="mt-2 inline-flex w-full items-center justify-center rounded-none border border-cdm-fg bg-cdm-fg px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-cdm-bg transition-shadow duration-300 hover:shadow-[0_0_36px_-4px_rgba(34,211,238,0.55)] disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </motion.button>
        </motion.form>
      </div>
    </main>
  );
}
