type RavnLogoProps = {
  className?: string;
  sizeClassName?: string;
  /** Si es false, solo se muestra "RAVN." (sin "OBRA + DISEÑO"). */
  showTagline?: boolean;
  /**
   * `center`: bloque centrado (landing, etc.).
   * `start`: alineado al margen izquierdo (sidebar, cabeceras).
   */
  align?: "center" | "start";
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
}: RavnLogoProps) {
  const isStart = align === "start";
  return (
    <div
      className={[
        "font-raleway flex flex-col text-ravn-fg select-none leading-[1.4]",
        isStart ? "items-start text-left" : "items-center text-center",
        sizeClassName,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={showTagline ? "RAVN Obra más diseño" : "RAVN"}
    >
      {/* tracking: pl compensa hueco al centrar; en start la R queda en el margen */}
      <span
        className="font-light uppercase"
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
}
