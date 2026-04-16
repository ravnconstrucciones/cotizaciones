"use client";

import {
  forwardRef,
  Fragment,
  type CSSProperties,
  type ReactNode,
} from "react";

import { LEYENDA_CONDICION_IVA_PDF } from "@/lib/ravn-propuesta-leyendas";

export type PdfPlantillaVisual = "negro" | "beige" | "verde";

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
  /** Subtítulos numerados dentro de “Servicios presupuestados” (cuerpo ~11,51 pt). */
  ptSubtituloServicios: 13.25,
  /**
   * Texto previo al primer `1.` (p. ej. “Detalle técnico de obra: …”): título intermedio,
   * más grande que subtítulos numerados y un poco menor que “Servicios presupuestados”.
   */
  ptTituloDetalleServicios: 16.35,
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

/**
 * Parsea texto con marcadores **negrita** y devuelve nodos React.
 * Las líneas que contienen **texto** se renderizan con font-semibold.
 * El whitespace:pre-wrap del contenedor padre preserva los saltos de línea.
 */
function renderConNegrita(text: string): ReactNode {
  const tokens = text.split(/(\*\*[^*\n]+\*\*)/g);
  if (tokens.length === 1) return text;
  return (
    <>
      {tokens.map((token, i) =>
        token.startsWith("**") && token.endsWith("**") && token.length > 4 ? (
          <strong key={i} className="font-raleway font-semibold">
            {token.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{token}</Fragment>
        )
      )}
    </>
  );
}

/** Línea tipo `3. Título del ítem` (también con ** opcionales alrededor del número). */
const SUBTITULO_SERVICIOS_RE =
  /^\s*(?:\*\*)?(\d+)\.(?:\*\*)?\s+(\S.*)$/;

type ServiciosPdfBlock =
  | { kind: "preamble"; text: string }
  | { kind: "section"; titulo: string; cuerpo: string };

function parseServiciosPresupuestadosBloques(raw: string): ServiciosPdfBlock[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: ServiciosPdfBlock[] = [];
  const preamble: string[] = [];
  let sectionTitulo: string | null = null;
  const sectionCuerpo: string[] = [];

  const pushPreamble = () => {
    const t = preamble.join("\n");
    if (t.trim()) {
      blocks.push({ kind: "preamble", text: t });
    }
    preamble.length = 0;
  };

  const pushSection = () => {
    if (sectionTitulo !== null) {
      blocks.push({
        kind: "section",
        titulo: sectionTitulo,
        cuerpo: sectionCuerpo.join("\n"),
      });
      sectionTitulo = null;
      sectionCuerpo.length = 0;
    }
  };

  for (const line of lines) {
    if (SUBTITULO_SERVICIOS_RE.test(line)) {
      pushPreamble();
      pushSection();
      sectionTitulo = line;
      continue;
    }
    if (sectionTitulo !== null) {
      sectionCuerpo.push(line);
    } else {
      preamble.push(line);
    }
  }
  pushPreamble();
  pushSection();
  return blocks;
}

/**
 * Aire al cortar entre páginas dentro de “Servicios” (`box-decoration-break: clone`).
 * `paddingTop` se repite en cada fragmento (hoja 2+ del mismo bloque). El hijo con
 * `SERVICIOS_CUERPO_PULL_PRIMERA_PAG` compensa solo el inicio del flujo en pág. 1
 * para no abrir demasiado bajo el título “Servicios presupuestados”.
 */
const SERVICIOS_PDF_FRAG_PAD = {
  paddingTop: "48pt",
  paddingBottom: "22pt",
  boxDecorationBreak: "clone" as const,
  WebkitBoxDecorationBreak: "clone" as const,
};

const SERVICIOS_CUERPO_PULL_PRIMERA_PAG = "-26pt";

/** Espacio antes del subtítulo respecto del bloque anterior (párrafo o preámbulo). */
const SERVICIOS_SEC_MARGIN_TOP_PRIMERO = "12pt";
const SERVICIOS_SEC_MARGIN_TOP_RESTO = "22pt";
/** Aire después del subtítulo, antes del cuerpo. */
const SERVICIOS_SUBTITULO_MARGIN_BOTTOM = "12pt";

function renderServiciosPresupuestadosPdf(text: string): ReactNode {
  const blocks = parseServiciosPresupuestadosBloques(text);
  if (blocks.length === 0) {
    return renderConNegrita(text.trim() || "—");
  }

  let indiceSeccion = 0;
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "preamble") {
          if (!b.text.trim()) return null;
          return (
            <div
              key={`pre-${i}`}
              className="whitespace-pre-wrap font-raleway font-semibold"
              style={{
                fontSize: `${PDF.ptTituloDetalleServicios}pt`,
                lineHeight: 1.22,
                marginBottom: "20pt",
              }}
            >
              {renderConNegrita(b.text)}
            </div>
          );
        }
        const idx = indiceSeccion;
        indiceSeccion += 1;
        const marginTopSeccion =
          idx === 0 ? SERVICIOS_SEC_MARGIN_TOP_PRIMERO : SERVICIOS_SEC_MARGIN_TOP_RESTO;
        return (
          <div
            key={`sec-${i}`}
            style={{
              marginTop: marginTopSeccion,
              /* Si el bloque entra en una hoja, evita cortar entre título y cuerpo;
               * si es más alto que una página, el motor puede partir dentro del cuerpo. */
              breakInside: "avoid",
              pageBreakInside: "avoid",
            }}
          >
            <p
              className="m-0 font-raleway font-semibold"
              style={{
                fontSize: `${PDF.ptSubtituloServicios}pt`,
                lineHeight: 1.25,
                marginBottom: SERVICIOS_SUBTITULO_MARGIN_BOTTOM,
                breakAfter: "avoid",
                pageBreakAfter: "avoid",
              }}
            >
              {renderConNegrita(b.titulo.trim())}
            </p>
            {b.cuerpo.trim() ? (
              <div
                className="whitespace-pre-wrap font-normal"
                style={{
                  marginTop: 0,
                  orphans: 3,
                  widows: 3,
                }}
              >
                {renderConNegrita(b.cuerpo)}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function HojaPdfConLineaLateral({
  children,
  className,
  style,
  marcaEsquinaInfDerecha,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Solo última hoja: bloque RAVN / tagline al pie derecho, junto a la línea lateral. */
  marcaEsquinaInfDerecha?: ReactNode;
}) {
  /*
   * La línea vertical en PDF la pinta `.ravn-print-lateral-strip` (fixed, solo @media print)
   * en el ancestro `.ravn-print-root`, para que en cada hoja llegue de arriba a abajo.
   * Acá solo reservamos el mismo espacio: mr-[6.5mm] + pr del className (9,5mm).
   */
  return (
    <div className="relative" style={style}>
      <div className={`mr-[6.5mm] ${className ?? ""}`}>
        <div className="relative z-[1] min-h-0">{children}</div>
      </div>
      {marcaEsquinaInfDerecha ? (
        <div
          className="pointer-events-none absolute z-[3] text-right"
          style={{
            bottom: "11mm",
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
          ...({
            "--ravn-lateral-color": theme.lateral,
            "--ravn-lateral-w": `${GROSOR_LINEA_LATERAL_MM}mm`,
          } as CSSProperties),
          ...printExact,
        }}
      >
        <div aria-hidden className="ravn-print-lateral-strip" />
        <HojaPdfConLineaLateral
          className="box-border flex min-h-[297mm] flex-col pl-[14mm] pr-[9.5mm] pb-[12mm] pt-[10mm]"
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
                  paddingTop: "12pt",
                  paddingBottom: "6pt",
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
                  ...SERVICIOS_PDF_FRAG_PAD,
                }}
              >
                <div style={{ marginTop: SERVICIOS_CUERPO_PULL_PRIMERA_PAG }}>
                  {renderServiciosPresupuestadosPdf(cuerpoServicios)}
                </div>
              </div>
            </section>
          </div>
        </HojaPdfConLineaLateral>

        <HojaPdfConLineaLateral
          className="box-border flex min-h-[297mm] flex-col pl-[14mm] pr-[9.5mm] pb-[10mm] pt-[11mm]"
          style={printExact}
          marcaEsquinaInfDerecha={
            <PdfMarcaRavnPie ptFooter={`${PDF.ptFooter}pt`} />
          }
        >
          <div
            className="relative min-h-0 flex-1"
            style={{ paddingTop: "14pt" }}
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
                <p className="mt-4">{LEYENDA_CONDICION_IVA_PDF}</p>
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
