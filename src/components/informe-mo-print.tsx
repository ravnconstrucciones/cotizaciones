"use client";

import { forwardRef } from "react";
import type { InformeMO } from "@/lib/mano-obra";

/**
 * Informe de pagos de mano de obra — A4 formato oficial RAVN (negro acero,
 * Raleway, cero color). Es el "estado de cuenta del gremio": por obra, cada
 * acuerdo con sus pagos (fecha + medio + detalle + importe) y saldos.
 * Puede pasar de una página; el footer va al final del contenido.
 */

const FG = "#f2efe8";
const BG = "#1c1c1a";
const MUTED = "rgba(242,239,232,0.62)";
const LINE = "rgba(242,239,232,0.18)";

const printExact = {
  WebkitPrintColorAdjust: "exact" as const,
  printColorAdjust: "exact" as const,
};

const fmtImporte = (n: number, moneda = "ARS") =>
  `${moneda === "USD" ? "US$" : "$"}${Math.round(n).toLocaleString("es-AR")}`;

const fmtFecha = (iso: string) => {
  const d = iso.trim().slice(0, 10);
  if (d.length !== 10) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export type InformeMOPrintProps = {
  informe: InformeMO;
  /** presupuesto_id → nombre de obra. */
  nombresObras: Map<string, string>;
  /** cuenta_id → nombre de cuenta (medio de pago). */
  cuentas: Map<string, string>;
  /** "YYYY-MM-DD" del día de emisión (viene de afuera para ser testeable). */
  fechaEmision: string;
};

export const InformeMOPrint = forwardRef<HTMLDivElement, InformeMOPrintProps>(
  function InformeMOPrint({ informe, nombresObras, cuentas, fechaEmision }, ref) {
    const periodo =
      informe.desde || informe.hasta
        ? `${informe.desde ? fmtFecha(informe.desde) : "inicio"} — ${informe.hasta ? fmtFecha(informe.hasta) : "hoy"}`
        : "Historial completo";

    return (
      <div
        ref={ref}
        data-ravn-print-sheet
        className="box-border flex w-[210mm] min-h-[297mm] flex-col p-[16mm] antialiased"
        style={{
          background: BG,
          color: FG,
          fontFamily: "var(--font-raleway), Raleway, ui-sans-serif, system-ui, sans-serif",
          ...printExact,
        }}
      >
        {/* Logo arriba a la derecha (estructura aprobada del recibo) */}
        <header className="flex justify-end">
          <p
            className="m-0 text-[13pt] font-extralight uppercase"
            style={{ letterSpacing: "0.32em", paddingLeft: "0.32em" }}
          >
            R&nbsp;A&nbsp;V&nbsp;N&nbsp;.
          </p>
        </header>

        <h1 className="mt-10 text-[20pt] font-extralight uppercase" style={{ letterSpacing: "0.12em" }}>
          Informe de pagos
        </h1>
        <p
          className="mt-1 text-[8pt] font-normal uppercase"
          style={{ letterSpacing: "0.28em", color: MUTED }}
        >
          Mano de obra · Registro de pagos realizados
        </p>

        <div
          className="mt-8 grid grid-cols-3 gap-4 border-y py-4 text-[9pt]"
          style={{ borderColor: LINE }}
        >
          <div>
            <p className="m-0 text-[7pt] uppercase" style={{ letterSpacing: "0.22em", color: MUTED }}>
              Emitido a
            </p>
            <p className="m-0 mt-1.5 font-light">{informe.persona}</p>
          </div>
          <div>
            <p className="m-0 text-[7pt] uppercase" style={{ letterSpacing: "0.22em", color: MUTED }}>
              Período
            </p>
            <p className="m-0 mt-1.5 font-light">{periodo}</p>
          </div>
          <div>
            <p className="m-0 text-[7pt] uppercase" style={{ letterSpacing: "0.22em", color: MUTED }}>
              Fecha de emisión
            </p>
            <p className="m-0 mt-1.5 font-light">{fmtFecha(fechaEmision)}</p>
          </div>
        </div>

        {/* Total del período PRIMERO (como el importe del recibo): número grande y fino */}
        <div className="mt-9">
          <p className="m-0 text-[7pt] uppercase" style={{ letterSpacing: "0.28em", color: MUTED }}>
            Total pagado en el período · {informe.cantidadPagos}{" "}
            {informe.cantidadPagos === 1 ? "pago" : "pagos"}
          </p>
          <p
            className="m-0 mt-2 text-[30pt]"
            style={{ fontWeight: 200, letterSpacing: "-0.02em", lineHeight: 1.1 }}
          >
            <span className="align-super text-[13pt]" style={{ color: MUTED }}>
              $
            </span>
            {Math.round(informe.totalPagadoPeriodo).toLocaleString("es-AR")}
          </p>
        </div>

        {/* Detalle por obra y acuerdo */}
        <div className="mt-9 flex flex-col gap-7">
          {informe.grupos.map((grupo) => (
            <section key={grupo.presupuestoId} style={{ breakInside: "avoid" }}>
              <h2
                className="m-0 border-b pb-2 text-[9pt] font-medium uppercase"
                style={{ letterSpacing: "0.22em", borderColor: LINE }}
              >
                {nombresObras.get(grupo.presupuestoId) ?? "Obra"}
              </h2>
              {grupo.acuerdos.map((item) => (
                <div key={item.acuerdo.id} className="mt-4">
                  <div className="flex items-baseline justify-between text-[9.5pt]">
                    <p className="m-0 font-light">{item.acuerdo.trabajo}</p>
                    <p className="m-0 text-[8pt]" style={{ color: MUTED }}>
                      arreglado {fmtImporte(Number(item.acuerdo.monto_arreglado), item.acuerdo.moneda)}
                    </p>
                  </div>
                  {item.pagosPeriodo.length > 0 ? (
                    <table className="mt-2 w-full border-collapse text-[8.5pt] font-light">
                      <tbody>
                        {item.pagosPeriodo.map((p) => (
                          <tr key={p.id} style={{ borderBottom: `0.3pt solid ${LINE}` }}>
                            <td className="w-[22mm] py-1.5 pr-2 align-top tabular-nums">
                              {fmtFecha(p.fecha)}
                            </td>
                            <td className="w-[34mm] py-1.5 pr-2 align-top" style={{ color: MUTED }}>
                              {p.cuenta_id ? (cuentas.get(p.cuenta_id) ?? "medio s/d") : "medio s/d"}
                            </td>
                            <td className="py-1.5 pr-2 align-top" style={{ color: MUTED }}>
                              {p.descripcion ?? ""}
                            </td>
                            <td className="w-[28mm] py-1.5 text-right align-top tabular-nums">
                              {fmtImporte(Number(p.importe))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="m-0 mt-2 text-[8.5pt] font-light" style={{ color: MUTED }}>
                      Sin pagos en el período.
                    </p>
                  )}
                  <div className="mt-2 flex justify-end gap-6 text-[8pt]" style={{ color: MUTED }}>
                    <span>
                      pagado total {fmtImporte(item.pagadoTotal, item.acuerdo.moneda)} (
                      {item.porcentajePagado}%)
                    </span>
                    <span style={item.saldo <= 0 ? undefined : { color: FG }}>
                      {item.saldo <= 0 ? "saldado" : `saldo pendiente ${fmtImporte(item.saldo, item.acuerdo.moneda)}`}
                    </span>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>

        {/* Estado de cuenta global */}
        <div
          className="mt-9 flex justify-end border-t pt-4 text-[9.5pt]"
          style={{ borderColor: LINE, breakInside: "avoid" }}
        >
          <div className="flex flex-col items-end gap-1.5">
            <p className="m-0 font-light" style={{ color: MUTED }}>
              Pagado en el período&nbsp;&nbsp;{fmtImporte(informe.totalPagadoPeriodo)}
            </p>
            <p className="m-0 font-normal">
              Saldo pendiente&nbsp;&nbsp;{fmtImporte(informe.totalSaldo)}
            </p>
          </div>
        </div>

        {/* Firmas */}
        <div
          className="mt-14 grid grid-cols-2 gap-16 text-[8pt]"
          style={{ color: MUTED, breakInside: "avoid" }}
        >
          <div>
            <div className="h-12 border-b" style={{ borderColor: LINE }} />
            <p className="m-0 mt-2 uppercase" style={{ letterSpacing: "0.18em" }}>
              RAVN Construcciones
            </p>
          </div>
          <div>
            <div className="h-12 border-b" style={{ borderColor: LINE }} />
            <p className="m-0 mt-2 uppercase" style={{ letterSpacing: "0.18em" }}>
              Recibí conforme · {informe.persona}
            </p>
          </div>
        </div>

        {/* Footer contactos + brand (igual que recibo/presupuesto) */}
        <footer
          className="mt-auto flex items-end justify-between border-t pt-6"
          style={{ borderColor: LINE, breakInside: "avoid" }}
        >
          <div className="flex flex-col gap-2 text-[7.5pt] font-light" style={{ color: MUTED }}>
            <span>ravnconstrucciones.com.ar</span>
            <span>11 7385-6263</span>
            <span>contacto@ravnconstrucciones.com.ar</span>
          </div>
          <div className="flex flex-col items-center">
            <p
              className="m-0 text-[10pt] font-extralight uppercase"
              style={{ letterSpacing: "0.30em", paddingLeft: "0.30em" }}
            >
              R&nbsp;A&nbsp;V&nbsp;N&nbsp;.
            </p>
            <p
              className="m-0 mt-1 text-[5.5pt] uppercase"
              style={{ letterSpacing: "0.30em", paddingLeft: "0.30em", color: MUTED }}
            >
              Obra · Diseño
            </p>
          </div>
        </footer>
      </div>
    );
  },
);
