/**
 * Identidad visual del bot (iteración 4): círculo de vidrio con la R de
 * RAVN en cian + ojo-LED del cuervo. Tipográfico/geométrico, sin imagen
 * externa. Acompaña cada captura que entró por WhatsApp.
 * Server-compatible (sin hooks ni motion).
 */
export function AvatarBot({
  className = "h-6 w-6",
  title = "Capturado por el bot RAVN",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full border border-cdm-accent/50 bg-cdm-accent/10 shadow-[0_0_10px_-2px_rgba(34,211,238,0.6),inset_0_1px_0_rgba(234,246,251,0.15)] backdrop-blur-sm ${className}`}
    >
      <span className="font-grotesk text-[9px] font-bold leading-none text-cdm-accent">
        R
      </span>
      {/* El ojo del cuervo: LED cian en el borde superior derecho. */}
      <span
        aria-hidden
        className="absolute -right-px -top-px h-1 w-1 rounded-full bg-cdm-accent shadow-[0_0_6px_rgba(34,211,238,0.9)]"
      />
    </span>
  );
}
