/**
 * Skeleton glass del cockpit (ronda 6): barras de vidrio con barrido cian
 * tenue para los paneles de datos — reemplaza todo "Cargando…" crudo de
 * las listas. El dato "se proyecta" en el panel, igual que en el HUD.
 *
 * Server-compatible (cero hooks): sirve en Suspense fallbacks y estados
 * de carga de client screens por igual.
 */

type SkeletonGlassProps = {
  /** Cantidad de filas (default 3). */
  filas?: number;
  /** Alto de cada barra (clase Tailwind, default h-3). */
  alto?: string;
  /** Anchos por fila (cíclico) para que no parezca un bloque sólido. */
  anchos?: string[];
  className?: string;
};

const ANCHOS_DEFAULT = ["w-3/4", "w-1/2", "w-2/3"];

export function SkeletonGlass({
  filas = 3,
  alto = "h-3",
  anchos = ANCHOS_DEFAULT,
  className,
}: SkeletonGlassProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`space-y-3 ${className ?? ""}`}
    >
      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className={`cdm-skeleton ${alto} ${anchos[i % anchos.length]}`}
        />
      ))}
      <span className="sr-only">Cargando datos</span>
    </div>
  );
}

/**
 * Skeleton de cifra heroica: una barra grande (la plata que está por
 * aparecer) + dos líneas chicas. Para los módulos Plata/Obras del nivel 1.
 */
export function SkeletonCifra({ className }: { className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <div aria-hidden className="cdm-skeleton h-9 w-40" />
      <div aria-hidden className="cdm-skeleton mt-2 h-2.5 w-28" />
      <span className="sr-only">Cargando datos</span>
    </div>
  );
}
