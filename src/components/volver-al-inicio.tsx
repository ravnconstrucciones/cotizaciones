import Link from "next/link";

/**
 * Enlace minimalista a la Home (esquina superior, todas las pantallas
 * secundarias). Lenguaje cockpit: tokens cdm + Space Grotesk.
 */
export function VolverAlInicio() {
  return (
    <nav className="mb-8" aria-label="Volver al inicio">
      <Link
        href="/"
        className="font-grotesk text-[10px] font-medium uppercase tracking-[0.2em] text-cdm-muted transition-colors hover:text-cdm-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-cdm-accent"
      >
        ← Centro de mando
      </Link>
    </nav>
  );
}
