import { ControlFinancieroBlock } from "../finanzas/control-financiero-block";
export default function ComprasPage() {
  return <div className="font-raleway mx-auto max-w-4xl px-4 py-8 text-cdm-fg sm:px-8"><header className="mb-7"><p className="text-xs uppercase tracking-widest text-cdm-muted">Menos vueltas, una lista</p><h1 className="mt-2 text-4xl font-semibold">Compras de la semana</h1><p className="mt-3 text-sm text-cdm-muted">Primero descontá lo que tenés. Después comprá para siete días, según el espacio de tu freezer.</p></header><ControlFinancieroBlock mode="compras" /></div>;
}
