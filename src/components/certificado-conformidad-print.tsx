"use client";

import { forwardRef } from "react";

const printExact = {
  WebkitPrintColorAdjust: "exact" as const,
  printColorAdjust: "exact" as const,
};

function formatFechaDdMmYyyy(iso: string): string {
  const d = iso.trim().slice(0, 10);
  if (d.length !== 10 || d[4] !== "-" || d[7] !== "-") return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export type CertificadoConformidadPrintProps = {
  numeroBase: string;
  numeroSufijo: string;
  fechaIso: string;
  clienteBarrio: string;
  cuit: string;
  ubicacionLote: string;
  /** Presupuesto de obra al que amarra el remito (la factura referencia al remito, no al revés). */
  referenciaPresupuesto: string;
  servicioRubro: string;
  detalleTrabajos: string;
  estadoCantidad: string;
};

/**
 * Vista A4 para imprimir / guardar como PDF (Certificado de conformidad).
 * Alineado al contenido del documento de referencia RAVN.
 */
export const CertificadoConformidadPrint = forwardRef<
  HTMLDivElement,
  CertificadoConformidadPrintProps
>(function CertificadoConformidadPrint(props, ref) {
  const {
    numeroBase,
    numeroSufijo,
    fechaIso,
    clienteBarrio,
    cuit,
    ubicacionLote,
    referenciaPresupuesto,
    servicioRubro,
    detalleTrabajos,
    estadoCantidad,
  } = props;

  const numeroLinea = `${numeroBase.trim() || "—"}${
    numeroSufijo.trim() ? ` - ${numeroSufijo.trim()}` : ""
  }`;
  const fechaDdMmYyyy = formatFechaDdMmYyyy(fechaIso);

  return (
    <div
      ref={ref}
      data-ravn-print-sheet
      className="box-border w-[210mm] min-h-[297mm] bg-white p-[14mm] text-[14px] leading-normal text-black antialiased"
      style={{
        fontFamily:
          "var(--font-raleway), Raleway, ui-sans-serif, system-ui, sans-serif",
        ...printExact,
      }}
    >
      {/* Encabezado: tres columnas — marca / aviso no factura / datos fiscales */}
      <header className="border-b border-black pb-5">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-x-4 gap-y-3 font-raleway text-black">
          <div className="min-w-0 text-left text-[8.5pt] leading-[1.65]">
            <p
              className="m-0 font-raleway text-[13pt] font-bold uppercase leading-snug"
              style={{ letterSpacing: "0.18em" }}
            >
              R A V N .
            </p>
            <p
              className="m-0 mt-2 font-raleway text-[9.5pt] font-normal uppercase leading-normal"
              style={{ letterSpacing: "0.1em" }}
            >
              OBRA + DISEÑO
            </p>
            <p className="m-0 mt-3">CUIT: 23-37121103-9</p>
            <p className="m-0 mt-1">Domicilio: Conesa 2171, Cap. Fed.</p>
          </div>

          <div className="flex max-w-[min(52mm,100%)] shrink-0 items-center gap-2 self-center text-[8.5pt] leading-snug">
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-black font-bold leading-none"
              aria-hidden
            >
              X
            </span>
            <span className="text-left">
              Documento no válido como factura
            </span>
          </div>

          <div
            className="min-w-0 text-right text-[8.5pt] leading-[1.65]"
            style={{
              /* Misma línea base que «OBRA + DISEÑO»: altura de «R A V N .» + mt-2 del bloque izquierdo */
              paddingTop: "calc(13pt * 1.375 + 0.5rem)",
            }}
          >
            <p className="m-0">Inicio de Actividades: 9/2024</p>
            <p className="m-0 mt-1">Condición IVA: Monotributista</p>
            <p className="m-0 mt-1">IIBB: 23-37121103-9</p>
          </div>
        </div>
      </header>

      <h1
        className="mt-7 text-center font-raleway text-[13pt] font-semibold uppercase text-black"
        style={{ letterSpacing: "0.06em", lineHeight: 1.35 }}
      >
        Certificado de conformidad
      </h1>

      <div className="mt-5 space-y-3 text-[13px]">
        <p>
          <span className="font-semibold">Número:</span>{" "}
          <span className="border-b border-black/30 pb-px">{numeroLinea}</span>
        </p>
        <p>
          <span className="font-semibold">Fecha:</span> {fechaDdMmYyyy}
        </p>
        <p className="break-words">
          <span className="font-semibold">Cliente / barrio:</span>{" "}
          {clienteBarrio.trim() || "—"}
        </p>
        <p>
          <span className="font-semibold">CUIT:</span>{" "}
          {cuit.trim() || "—"}
        </p>
        <p className="break-words">
          <span className="font-semibold">Ubicación / lote:</span>{" "}
          {ubicacionLote.trim() || "—"}
        </p>
        <p>
          <span className="font-semibold">Referencia presupuesto N°:</span>{" "}
          {referenciaPresupuesto.trim() || "—"}
        </p>
      </div>

      <div className="mt-6">
        <table className="w-full border-collapse border border-black text-left text-[12px]">
          <thead>
            <tr className="bg-black/[0.06]">
              <th className="border border-black px-2 py-2 font-semibold uppercase tracking-wide">
                Descripción de los trabajos realizados
              </th>
              <th className="w-[28%] border border-black px-2 py-2 font-semibold uppercase tracking-wide">
                Estado / cantidad
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="align-top">
              <td className="border border-black px-2 py-2">
                <p className="font-medium">{servicioRubro.trim() || "—"}</p>
                <p className="mt-2 text-[11px] leading-relaxed">
                  <span className="font-semibold">Detalle:</span>{" "}
                  {detalleTrabajos.trim() || "—"}
                </p>
              </td>
              <td className="border border-black px-2 py-2 text-[12px]">
                {estadoCantidad.trim() || "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <section className="mt-6 text-[10px] leading-relaxed text-black/90">
        <p className="font-semibold">Términos y condiciones</p>
        <p className="mt-1">
          La firma del presente documento implica la recepción conforme de los
          servicios o etapas de obra detalladas. Este certificado habilita el
          proceso de pago administrativo según las condiciones acordadas
          previamente. Cualquier observación deberá ser notificada dentro de las
          48hs de la firma.
        </p>
      </section>

      <div className="mt-10 grid grid-cols-2 gap-8 text-center text-[11px]">
        <div>
          <div className="relative h-16 border-b border-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/firma-ravn.png"
              alt="Firma RAVN"
              className="absolute bottom-1 left-1/2 h-14 w-auto -translate-x-1/2 object-contain"
              style={{ maxWidth: "90%" }}
            />
          </div>
          <p className="mt-2 font-medium">Firma responsable RAVN</p>
        </div>
        <div>
          <div className="h-16 border-b border-black/40" />
          <p className="mt-2 font-medium">
            Conformidad administración / intendencia
          </p>
        </div>
      </div>

      <p className="mt-8 text-center text-[9px] text-black/70">
        RAVN. - Gestión de obra y Estudio de Diseño - Buenos Aires
      </p>
    </div>
  );
});
