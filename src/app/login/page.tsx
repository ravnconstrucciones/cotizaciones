"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { RavnLogo } from "@/components/ravn-logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

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
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-ravn-surface px-6 py-12 text-ravn-fg">
      <div className="flex w-full max-w-sm flex-col items-center gap-10">
        <RavnLogo sizeClassName="text-4xl sm:text-5xl" />

        <form onSubmit={handleLogin} className="flex w-full flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="email"
              className="font-raleway text-xs uppercase tracking-widest text-ravn-fg/60"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-ravn-line bg-transparent px-4 py-3 text-sm text-ravn-fg placeholder-ravn-fg/30 outline-none focus:border-ravn-fg transition-colors"
              placeholder="tu@email.com"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="password"
              className="font-raleway text-xs uppercase tracking-widest text-ravn-fg/60"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-ravn-line bg-transparent px-4 py-3 text-sm text-ravn-fg placeholder-ravn-fg/30 outline-none focus:border-ravn-fg transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="font-raleway text-xs uppercase tracking-wider text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="font-raleway mt-2 inline-flex w-full items-center justify-center border-2 border-ravn-accent bg-ravn-accent px-8 py-4 text-sm font-normal uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}
