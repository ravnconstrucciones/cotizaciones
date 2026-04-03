"use client";

import { forwardRef, Fragment, type ReactNode } from "react";

export type PdfPlantillaVisual = "negro" | "beige" | "verde";

const IVA_LEYENDA_PDF =
  "Dicho presupuesto NO contempla el impuesto al valor agregado (IVA).";

/**
 * Tipografía medida en los PDF “Presupuesto Black” exportados desde Canva
 * (`docs/referencia-presupuesto-black.pdf` + página condiciones): PyMuPDF `get_text("dict")`.
 * Título “Propuesta”: Raleway **Light** (~300), 43,5 pt, interletrado **0**, interlineado **1,4**, oración.
 * PDF / app: solo Raleway (variable local).
 */
const PDF = {
  ptPropuesta: 43.5,
  /** Interlineado del cuadro de texto “Propuesta” en Canva (Espaciado → 1,4). */
  leadingPropuesta: 1.4,
  ptTituloSeccion: 17.71,
  ptMeta: 10.47,
  ptCuerpoServicios: 11.51,
  ptCuerpoPagina2: 10.33,
  ptFooter: 12,
  /** Marca “RAVN.” solo cabecera pág. 1 (más grande que el pie). */
  ptCabeceraMarca: 24,
  /** Entre líneas de párrafo ~11.51 pt en Canva (salto ~6 pt). */
  leadingCuerpo: 1.52,
  /** De baseline título “Propuesta” a bloque Cliente. */
  gapPropuestaAMetaPt: 34.59,
  /** De bloque meta a “Servicios presupuestados”. */
  gapMetaAServiciosPt: 35.85,
  /**
   * Offset vertical del título “Propuesta” desde el inicio del área útil,
   * calibrado al PDF de referencia (y ≈ 152 pt desde el borde superior de la página A4).
   */
  offsetPropuestaDesdeTopeAreaPt: 123,
  /** Fila “RAVN.” en la cabecera en flujo; se resta del offset del título. */
  alturaReservadaCabeceraMarcaPt: 32,
} as const;

/** Cifra del importe destacada; el párrafo alrededor sigue a 10,33 pt (Canva). */
const CLASE_IMPORTE_NUMERICO =
  "font-raleway text-5xl font-light leading-tight tabular-nums text-current";

const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function notasYaMencionanIva(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("no contempla el impuesto al valor agregado") ||
    t.includes("impuesto al valor agregado (iva)")
  );
}

export type PlantillaA4VirtualProps = {
  plantillaVisual: PdfPlantillaVisual;
  fecha: string;
  numeroComercialHumano: string;
  cliente: string;
  domicilio: string;
  textoComercial: string;
  totalFormateado: string;
  totalEnLetras: string;
  moneda: "ARS" | "USD";
  conversionDisclaimer?: string;
  financiacion?: string;
  plazos?: string;
  formaPago: string;
  notasCondiciones: string;
  incluyeIva: boolean;
  validezOferta: string;
};

type Theme = {
  bg: string;
  fg: string;
  muted: string;
  line: string;
  lateral: string;
};

function themeFor(plantilla: PdfPlantillaVisual): Theme {
  switch (plantilla) {
    case "beige":
      return {
        bg: "#fef7f2",
        fg: "#181817",
        muted: "rgba(24,24,23,0.52)",
        line: "rgba(24,24,23,0.22)",
        lateral: "rgba(24,24,23,0.55)",
      };
    case "verde":
      return {
        bg: "#3F4E3E",
        fg: "#FFFFFF",
        muted: "rgba(255,255,255,0.72)",
        line: "rgba(255,255,255,0.32)",
        lateral: "#FFFFFF",
      };
    default:
      return {
        bg: "#181817",
        fg: "#FFFFFF",
        muted: "rgba(255,255,255,0.7)",
        line: "rgba(255,255,255,0.35)",
        lateral: "#FFFFFF",
      };
  }
}

function formatFechaLargaPdf(iso: string): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  const di = Number(d);
  if (!y || mi < 0 || mi > 11 || !Number.isFinite(di)) return "—";
  return `${di} de ${MESES_LARGOS[mi]} de ${y}`;
}

const printExact = {
  WebkitPrintColorAdjust: "exact" as const,
  printColorAdjust: "exact" as const,
};

/** Regla horizontal tipo Canva / referencia (más fina que 1 px). */
const GROSOR_LINEA_HORIZONTAL_PT = 0.35;

function LineaBajoTitulo({ color }: { color: string }) {
  return (
    <div
      className="mb-5 mt-1.5 w-full"
      style={{
        height: `${GROSOR_LINEA_HORIZONTAL_PT}pt`,
        minHeight: 0.5,
        backgroundColor: color,
        ...printExact,
      }}
      aria-hidden
    />
  );
}

function LineaBajoServicios({ color }: { color: string }) {
  return (
    <div
      className="mb-5 mt-1.5 w-full"
      style={{
        height: `${GROSOR_LINEA_HORIZONTAL_PT}pt`,
        minHeight: 0.5,
        backgroundColor: color,
        ...printExact,
      }}
      aria-hidden
    />
  );
}

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconWhatsApp({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function IconMail({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

/**
 * Misma lógica tipográfica que `RavnLogo` (interletrado 517 / 326),
 * adaptada a PDF: alineación a derecha con compensación del tracking.
 */
function PdfMarcaRavnCabecera() {
  const pt = `${PDF.ptCabeceraMarca}pt`;
  return (
    <div
      className="flex w-full justify-end"
      style={{ ...printExact, marginRight: "-2.5mm" }}
    >
      <p
        className="m-0 font-raleway font-normal uppercase"
        style={{
          fontSize: pt,
          letterSpacing: "0.517em",
          paddingRight: "0.32em",
          lineHeight: 1.2,
        }}
      >
        RAVN.
      </p>
    </div>
  );
}

function PdfMarcaRavnPie({ ptFooter }: { ptFooter: string }) {
  return (
    <div className="shrink-0 text-right" style={printExact}>
      <p
        className="m-0 font-raleway font-normal uppercase"
        style={{
          fontSize: ptFooter,
          letterSpacing: "0.517em",
          paddingRight: "0.517em",
          lineHeight: 1.2,
        }}
      >
        RAVN.
      </p>
      <p
        className="m-0 mt-1.5 font-raleway font-normal uppercase opacity-90"
        style={{
          fontSize: "7.5pt",
          letterSpacing: "0.326em",
          paddingRight: "0.326em",
          lineHeight: 1.2,
        }}
      >
        OBRA + DISEÑO
      </p>
    </div>
  );
}

function PdfFooterContactos({ muted }: { muted: string }) {
  const iconWrap =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current opacity-90";
  const row = "flex items-center gap-3 leading-snug";
  const ptFooter = `${PDF.ptFooter}pt`;
  return (
    <footer
      className="mt-auto flex w-full flex-nowrap items-center justify-start break-inside-avoid pt-12"
      style={printExact}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <div className={`${row} font-raleway font-normal`} style={{ fontSize: ptFooter }}>
          <span className={iconWrap} style={{ borderColor: muted }}>
            <IconGlobe className="opacity-95" />
          </span>
          <span>ravnconstrucciones.com.ar</span>
        </div>
        <div
          className={`${row} font-raleway font-normal`}
          style={{ fontSize: ptFooter }}
        >
          <span className={iconWrap} style={{ borderColor: muted }}>
            <span className="flex h-full w-full items-center justify-center p-1.5">
              <IconWhatsApp className="opacity-95" />
            </span>
          </span>
          <span>11 7385-6263</span>
        </div>
        <div
          className={`${row} font-raleway font-normal`}
          style={{ fontSize: ptFooter }}
        >
          <span className={iconWrap} style={{ borderColor: muted }}>
            <IconMail className="opacity-95" />
          </span>
          <span>contacto@ravnconstrucciones.com.ar</span>
        </div>
      </div>
    </footer>
  );
}

const GROSOR_LINEA_LATERAL_MM = 1.05;

function HojaPdfConLineaLateral({
  children,
  lateralColor,
  className,
  style,
  marcaEsquinaInfDerecha,
}: {
  children: ReactNode;
  lateralColor: string;
  className?: string;
  style?: React.CSSProperties;
  /** Solo última hoja: bloque RAVN / tagline al pie derecho, junto a la línea lateral. */
  marcaEsquinaInfDerecha?: ReactNode;
}) {
  return (
    <div className={`relative ${className ?? ""}`} style={style}>
      <div
        aria-hidden
        className="pointer-events-none absolute z-0"
        style={{
          top: 0,
          bottom: 0,
          right: "6.5mm",
          width: `${GROSOR_LINEA_LATERAL_MM}mm`,
          backgroundColor: lateralColor,
          ...printExact,
        }}
      />
      <div className="relative z-[1] min-h-0">{children}</div>
      {marcaEsquinaInfDerecha ? (
        <div
          className="pointer-events-none absolute z-[3] text-right"
          style={{
            bottom: "11mm",
            /* Más separación respecto de la línea lateral (~6,5 mm del borde). */
            right: "12mm",
            maxWidth: "52mm",
            ...printExact,
          }}
        >
          {marcaEsquinaInfDerecha}
        </div>
      ) : null}
    </div>
  );
}

function SeccionPagina2({
  titulo,
  lineColor,
  children,
  first,
}: {
  titulo: string;
  lineColor: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section className={`break-inside-auto ${first ? "mt-0" : "mt-[36pt]"}`}>
      <h3
        className="font-raleway font-normal tracking-normal"
        style={{
          fontSize: `${PDF.ptTituloSeccion}pt`,
          lineHeight: 1.1,
        }}
      >
        {titulo}
      </h3>
      <LineaBajoTitulo color={lineColor} />
      <div
        className="font-raleway font-normal"
        style={{
          fontSize: `${PDF.ptCuerpoPagina2}pt`,
          lineHeight: PDF.leadingCuerpo,
        }}
      >
        {children}
      </div>
    </section>
  );
}

export const PlantillaA4Virtual = forwardRef<
  HTMLDivElement,
  PlantillaA4VirtualProps
>(function PlantillaA4Virtual(props, ref) {
  const {
    plantillaVisual,
    fecha,
    numeroComercialHumano,
    cliente,
    domicilio,
    textoComercial,
    totalFormateado,
    totalEnLetras,
    moneda,
    conversionDisclaimer,
    financiacion,
    plazos,
    formaPago,
    notasCondiciones,
    incluyeIva,
    validezOferta,
  } = props;

  const theme = themeFor(plantillaVisual);
  const fechaLarga = formatFechaLargaPdf(fecha);
  const finOk = Boolean(financiacion?.trim());
  const plazosOk = Boolean(plazos?.trim());
  const disclaimerUsd =
    moneda === "USD" && conversionDisclaimer?.trim()
      ? conversionDisclaimer.trim()
      : moneda === "USD"
        ? "En caso de realizar la conversión en ARS se tomará el valor del dólar blue punta venta al momento de gestionar el pago."
        : null;

  const notasBody = notasCondiciones.trim();
  const cuerpoServicios = textoComercial.trim() || "—";

  const rootFontStack =
    "var(--font-raleway), Raleway, ui-sans-serif, system-ui, sans-serif";

  return (
    <div
      className="pointer-events-none absolute -left-[9999px] top-0 z-0 overflow-visible"
      aria-hidden
    >
      <div
        ref={ref}
        data-ravn-print-sheet
        className="ravn-print-root box-border w-[210mm] antialiased text-current"
        style={{
          backgroundColor: theme.bg,
          color: theme.fg,
          fontFamily: rootFontStack,
          ...printExact,
        }}
      >
        <HojaPdfConLineaLateral
          lateralColor={theme.lateral}
          className="box-border flex min-h-[297mm] flex-col pl-[14mm] pr-[16mm] pb-[12mm] pt-[10mm]"
          style={{ ...printExact, breakAfter: "page" }}
        >
          <div className="relative min-w-0 flex-1 break-inside-auto">
            <PdfMarcaRavnCabecera />
            <h1
              className="font-raleway font-normal"
              style={{
                fontSize: `${PDF.ptPropuesta}pt`,
                lineHeight: PDF.leadingPropuesta,
                letterSpacing: 0,
                marginTop: `${
                  PDF.offsetPropuestaDesdeTopeAreaPt -
                  PDF.alturaReservadaCabeceraMarcaPt
                }pt`,
              }}
            >
              Propuesta
            </h1>

            <dl
              className="grid font-raleway font-normal"
              style={{
                marginTop: `${PDF.gapPropuestaAMetaPt}pt`,
                fontSize: `${PDF.ptMeta}pt`,
                lineHeight: PDF.leadingCuerpo,
                gridTemplateColumns: "max-content 1fr",
                columnGap: "1.75rem",
                rowGap: "0.25rem",
              }}
            >
              <dt>Cliente:</dt>
              <dd className="m-0 min-w-0">{cliente.trim() || "—"}</dd>
              <dt>Fecha:</dt>
              <dd className="m-0 min-w-0">{fechaLarga}</dd>
              <dt>Lugar:</dt>
              <dd className="m-0 min-w-0">{domicilio.trim() || "—"}</dd>
              <dt className="pt-1 opacity-90">N.º presupuesto:</dt>
              <dd className="m-0 min-w-0 pt-1 opacity-90">
                {numeroComercialHumano}
              </dd>
            </dl>

            <section
              className="min-w-0 break-inside-auto"
              style={{ marginTop: `${PDF.gapMetaAServiciosPt}pt` }}
            >
              <div
                className="min-w-0 break-inside-avoid"
                style={{
                  paddingTop: "14pt",
                  paddingBottom: "10pt",
                }}
              >
                <h2
                  className="m-0 font-raleway font-normal tracking-normal"
                  style={{
                    fontSize: `${PDF.ptTituloSeccion}pt`,
                    lineHeight: 1.15,
                  }}
                >
                  Servicios Presupuestados
                </h2>
                <LineaBajoServicios color={theme.line} />
              </div>
              <div
                className="font-raleway font-normal break-inside-auto"
                style={{
                  fontSize: `${PDF.ptCuerpoServicios}pt`,
                  lineHeight: PDF.leadingCuerpo,
                  whiteSpace: "pre-wrap",
                }}
              >
                {cuerpoServicios}
              </div>
            </section>
          </div>
        </HojaPdfConLineaLateral>

        <HojaPdfConLineaLateral
          lateralColor={theme.lateral}
          className="box-border flex min-h-[297mm] flex-col pl-[14mm] pr-[16mm] pb-[10mm] pt-[12mm]"
          style={printExact}
          marcaEsquinaInfDerecha={
            <PdfMarcaRavnPie ptFooter={`${PDF.ptFooter}pt`} />
          }
        >
          <div
            className="relative min-h-0 flex-1"
            style={{ paddingTop: "20pt" }}
          >
            <SeccionPagina2 titulo="Importe" lineColor={theme.line} first>
              <p>El valor total presupuestado es de</p>
              <p className={`mt-2 ${CLASE_IMPORTE_NUMERICO}`}>
                {totalFormateado}
              </p>
              {disclaimerUsd ? (
                <p className="mt-3 opacity-90">({disclaimerUsd})</p>
              ) : null}
              <p className="mt-3">{totalEnLetras}</p>
            </SeccionPagina2>

            {finOk ? (
              <SeccionPagina2 titulo="Financiación" lineColor={theme.line}>
                <p className="whitespace-pre-wrap">{financiacion!.trim()}</p>
              </SeccionPagina2>
            ) : null}

            {plazosOk ? (
              <SeccionPagina2 titulo="Plazo" lineColor={theme.line}>
                <p className="whitespace-pre-wrap">{plazos!.trim()}</p>
              </SeccionPagina2>
            ) : null}

            <SeccionPagina2 titulo="Forma de Pago" lineColor={theme.line}>
              <p className="whitespace-pre-wrap">
                {formaPago.trim() || "—"}
              </p>
            </SeccionPagina2>

            <SeccionPagina2 titulo="Notas" lineColor={theme.line}>
              <Fragment>
                <div className="whitespace-pre-wrap">{notasBody || "—"}</div>
                {!incluyeIva && !notasYaMencionanIva(notasBody) ? (
                  <p className="mt-4">{IVA_LEYENDA_PDF}</p>
                ) : null}
                {validezOferta.trim() ? (
                  <p
                    className="mt-5 font-normal"
                    style={{ fontSize: `${PDF.ptCuerpoPagina2}pt` }}
                  >
                    Validez de oferta: {validezOferta.trim()}
                  </p>
                ) : null}
              </Fragment>
            </SeccionPagina2>
          </div>

          <PdfFooterContactos muted={theme.line} />
        </HojaPdfConLineaLateral>
      </div>
    </div>
  );
});

PlantillaA4Virtual.displayName = "PlantillaA4Virtual";
