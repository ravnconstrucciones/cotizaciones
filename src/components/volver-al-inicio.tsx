import Link from "next/link";

/** Enlace minimalista a la Home (esquina superior, todas las pantallas secundarias). */
export function VolverAlInicio() {
  return (
    <nav className="mb-8" aria-label="Volver al inicio">
      <Link
        href="/"
        className="text-[10px] font-medium uppercase tracking-[0.2em] text-ravn-muted transition-colors hover:text-ravn-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg"
      >
        ← Volver
      </Link>
    </nav>
  );
}
