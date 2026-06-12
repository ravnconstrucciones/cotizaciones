import { RavnLogo } from "@/components/ravn-logo";

/**
 * Estado de carga del cockpit (ronda 6 — muerte del loader feo).
 *
 * Antes: vacío negro + "Cargando…" crudo + el cuadrado del theme-toggle
 * como única señal de vida. Ahora: la marca RAVN. con bloom RESPIRANDO
 * sobre la atmósfera de niebla — el mismo lenguaje del login y la home.
 *
 * Server-compatible a propósito (cero hooks, CSS puro): lo usan
 * `app/loading.tsx` y los Suspense fallbacks, que corren antes de hidratar.
 * La niebla son las clases .cdm-niebla de globals.css (radial-gradient,
 * sin canvas) — barata y disponible al instante.
 */
export function CargandoCockpit({
  /** `pantalla` ocupa min-h-screen (loading.tsx); `bloque` rellena el alto del caller. */
  variante = "pantalla",
  /** Texto terminal bajo la marca (default: CARGANDO). */
  label = "Cargando",
}: {
  variante?: "pantalla" | "bloque";
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`font-grotesk relative flex items-center justify-center overflow-hidden bg-cdm-bg text-cdm-fg ${
        variante === "pantalla" ? "min-h-screen" : "min-h-[40vh] w-full"
      }`}
    >
      {/* Atmósfera: la misma niebla volumétrica del cockpit, sin canvas. */}
      <div aria-hidden className="absolute inset-0">
        <span className="cdm-niebla cdm-niebla-a" />
        <span className="cdm-niebla cdm-niebla-b" />
        <span className="cdm-niebla cdm-niebla-c" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* La marca emana luz y respira: bloom + pulso (solo opacity). */}
        <div className="cdm-pulso-carga drop-shadow-[0_0_28px_rgba(34,211,238,0.35)]">
          <RavnLogo showTagline={false} shimmer sizeClassName="text-3xl" />
        </div>
        <p className="font-mono-hud text-[10px] uppercase tracking-[0.3em] text-cdm-muted">
          <span aria-hidden className="mr-2 text-cdm-accent/50">
            {"//////"}
          </span>
          {label}
          <span aria-hidden className="cdm-pulso-carga ml-1 text-cdm-accent">
            ▍
          </span>
        </p>
      </div>
      <span className="sr-only">Cargando contenido</span>
    </div>
  );
}
