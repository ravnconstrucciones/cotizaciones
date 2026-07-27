/**
 * Isotipo RAVN — la "R" geométrica, en SVG puro.
 *
 * Trazado vectorial exacto del original (polígono de 10 vértices, sin curvas:
 * verificado contra el PNG maestro con 0.13% de diferencia — solo el antialias
 * de las dos diagonales). Al ser vector NUNCA pixela ni se deforma:
 *
 *   · `viewBox` + `preserveAspectRatio="xMidYMid meet"` → la relación 595:623
 *     se respeta siempre, aunque el contenedor sea cuadrado o más ancho.
 *   · `aspect-ratio` en el style → reserva el espacio antes de pintar (cero CLS)
 *     y evita que un `height` suelto lo achate.
 *   · `shrink-0` → dentro de un flex NO se comprime (la causa #1 de logos
 *     aplastados en cabeceras).
 *   · `fill="currentColor"` → hereda el color del tema claro/oscuro, igual que
 *     el wordmark. Cero color, coherente con el ADN de marca.
 */

/** Relación de aspecto del isotipo (ancho : alto). */
export const ISO_RATIO = 595 / 623;

/** Trazado del isotipo, por si hace falta reusarlo (favicons, docs, OG). */
export const ISO_PATH =
  "M0,0 L346,0 L541,196 L289,196 L594,622 L270,622 L270,443 L201,443 L201,622 L0,622 Z";

export function RavnIso({
  className,
  /** Se pasa a `aria-label`; con `null` el isotipo queda decorativo. */
  label = "RAVN",
  style,
}: {
  className?: string;
  label?: string | null;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 595 623"
      preserveAspectRatio="xMidYMid meet"
      fill="currentColor"
      role={label ? "img" : "presentation"}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={["shrink-0", className ?? ""].filter(Boolean).join(" ")}
      style={{ aspectRatio: "595 / 623", ...style }}
    >
      <path d={ISO_PATH} />
    </svg>
  );
}
