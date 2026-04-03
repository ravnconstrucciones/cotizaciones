import Link from "next/link";
import { RavnLogo } from "@/components/ravn-logo";

export default function Home() {
  return (
    <main className="flex min-h-[100dvh] min-h-screen flex-col items-center justify-center bg-ravn-surface px-6 py-12 text-ravn-fg sm:px-8">
      <div className="flex w-full max-w-md flex-col items-center gap-12 text-center">
        <RavnLogo sizeClassName="text-4xl sm:text-5xl md:text-6xl" />
        <nav
          className="font-raleway flex w-full flex-col gap-4"
          aria-label="Navegación principal"
        >
          <Link
            href="/nuevo-presupuesto"
            className="inline-flex w-full items-center justify-center rounded-none border-2 border-ravn-accent bg-ravn-accent px-8 py-4 text-sm font-normal uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg"
          >
            Nuevo presupuesto
          </Link>
          <Link
            href="/catalogo"
            className="inline-flex w-full items-center justify-center rounded-none border-2 border-ravn-line bg-ravn-surface px-8 py-4 text-sm font-normal uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg"
          >
            Gestión de catálogo
          </Link>
          <Link
            href="/historial"
            className="inline-flex w-full items-center justify-center rounded-none border-2 border-ravn-line bg-ravn-surface px-8 py-4 text-sm font-normal uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg"
          >
            Historial de presupuestos
          </Link>
          <Link
            href="/control-gastos"
            className="inline-flex w-full items-center justify-center rounded-none border-2 border-ravn-line bg-ravn-surface px-8 py-4 text-sm font-normal uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg"
          >
            Control de gastos
          </Link>
        </nav>
      </div>
    </main>
  );
}
