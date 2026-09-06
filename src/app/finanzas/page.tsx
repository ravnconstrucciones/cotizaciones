import Link from "next/link";
import { ControlFinancieroBlock } from "./control-financiero-block";
export default function FinanzasPage() {
  return <div className="font-raleway mx-auto max-w-5xl px-4 py-8 text-cdm-fg sm:px-8">
    <header className="mb-7"><p className="text-xs uppercase tracking-widest text-cdm-muted">Personal y RAVN</p><h1 className="mt-2 text-4xl font-semibold">Economía</h1><p className="mt-3 text-sm text-cdm-muted">Qué tenés, qué debés y qué falta registrar. Cada cifra con su fecha.</p></header>
    <ControlFinancieroBlock />
    <nav aria-label="Administrar economía" className="grid gap-3 sm:grid-cols-2">{[
      ["/dinero","Cuentas y conciliación","Movimientos, saldos y diferencias por resolver."],
      ["/cashflow","Cobros y pagos de proyectos","Compromisos y dinero de cada obra."],
      ["/finanzas/presupuesto","Presupuesto personal y fijos","Límites planificados, consumos y suscripciones."],
      ["/empresa","Gastos de empresa","Depósito, estructura y administración."],
    ].map(([href,title,detail])=><Link key={href} href={href} className="border border-cdm-line p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-cdm-muted">{detail}</p></Link>)}</nav>
  </div>;
}
