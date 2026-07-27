import { RavnIso } from "@/components/ravn-iso";

type RavnLogoProps = {
  className?: string;
  sizeClassName?: string;
  /** Si es false, solo se muestra "RAVN." (sin "OBRA + DISEÑO"). */
  showTagline?: boolean;
  /**
   * Isotipo (la "R" geométrica) acompañando al wordmark:
   *   `none` → solo tipografía (default; es lo que usan los documentos A4).
   *   `top`  → isotipo arriba, wordmark abajo — lockup vertical de marca
   *            (landing, login, pantalla de carga).
   *   `side` → isotipo a la izquierda, altura ~1.15em — lockup horizontal para
   *            cabeceras slim.
   */
  iso?: "none" | "top" | "side";
  /**
   * Escala del isotipo en el lockup vertical, 1 = proporción del original
   * (ancho del isotipo ≈ ancho óptico de las letras "RAVN."). Bajarla cuando
   * la marca no tiene que dominar la composición (loader, formularios).
   */
  isoScale?: number;
  /**
   * `center`: bloque centrado (landing, etc.).
   * `start`: alineado al margen izquierdo (sidebar, cabeceras).
   */
  align?: "center" | "start";
  /**
   * Shimmer sutil sobre "RAVN." (gradiente taupe animado lento) — la firma
   * del cockpit. SOLO para pantallas de la app (sidebar, login); los
   * documentos A4 no lo reciben nunca.
   */
  shimmer?: boolean;
};

/**
 * Marca RAVN — tipografía Raleway (peso 300), parámetros del diseño institucional:
 *   "RAVN."        → interletrado 517 (= 0.517em) · interlineado 1.4
 *   "OBRA + DISEÑO" → interletrado 326 (= 0.326em) · tamaño 4.4/26.4 ≈ 0.167em relativo
 * El padding-left compensa el espacio extra que el tracking agrega al final,
 * de modo que el bloque quede ópticamente centrado.
 * El color hereda de text-ravn-fg → cambia automáticamente con el tema claro/oscuro.
 */
export function RavnLogo({
  className,
  sizeClassName = "text-3xl sm:text-4xl md:text-5xl",
  showTagline = true,
  align = "center",
  shimmer = false,
  iso = "none",
  isoScale = 1,
}: RavnLogoProps) {
  const isStart = align === "start";

  // Proporción del lockup original: el isotipo mide de ancho lo mismo que las
  // letras visibles de "RAVN." (≈5.07em con el interletrado 0.517), y su alto
  // sale de la relación 595:623 del isotipo → 5.07 / (595/623) ≈ 5.31em.
  // Va en `em` y no en `%` a propósito: un ancho porcentual se realimenta con
  // el tamaño intrínseco del SVG y el isotipo se dispara (pasó en el hero).
  const altoIso = `${(5.31 * isoScale).toFixed(3)}em`;

  const marca = (
    <div
      className={[
        "font-raleway flex flex-col select-none leading-[1.4]",
        isStart ? "items-start text-left" : "items-center text-center",
        iso === "side" ? "" : "w-full",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* tracking: pl compensa hueco al centrar; en start la R queda en el margen */}
      {/* Con shimmer la marca además EMANA luz (cdm-bloom: dos copias del
          texto con blur detrás — bloom volumétrico, no drop-shadow). */}
      <span
        className={
          shimmer
            ? "cdm-shimmer cdm-bloom font-light uppercase"
            : "font-light uppercase"
        }
        data-bloom={shimmer ? "RAVN." : undefined}
        style={{
          letterSpacing: "0.517em",
          paddingLeft: isStart ? 0 : "0.517em",
        }}
      >
        RAVN.
      </span>

      {showTagline ? (
        <span
          className="font-light uppercase"
          style={{
            fontSize: "0.167em",
            letterSpacing: "0.326em",
            paddingLeft: isStart ? 0 : "0.326em",
            marginTop: "0.6em",
          }}
        >
          OBRA + DISEÑO
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      className={[
        "text-ravn-fg select-none",
        iso === "side"
          ? "flex flex-row items-center gap-[0.45em]"
          : "flex flex-col",
        iso === "top" ? "w-fit max-w-full" : "",
        iso === "side" || isStart ? "items-start" : "items-center",
        sizeClassName,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label={showTagline ? "RAVN Obra más diseño" : "RAVN"}
    >
      {iso === "top" ? (
        <RavnIso
          label={null}
          className="mb-[0.55em] max-w-full"
          style={{ height: altoIso }}
        />
      ) : null}
      {iso === "side" ? (
        <RavnIso label={null} style={{ height: "1.15em" }} />
      ) : null}
      {marca}
    </div>
  );
}
