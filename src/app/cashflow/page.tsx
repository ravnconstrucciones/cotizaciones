import { CashflowDashboardScreen } from "./cashflow-dashboard-screen";
import { PrefetchDatos } from "@/components/cockpit/prefetch-datos";

export default function CashflowPage() {
  return (
    <>
      {/* El resumen arranca a bajar con el HTML (ronda 6 — perf). */}
      <PrefetchDatos rutas={["/cashflow/resumen"]} />
      <CashflowDashboardScreen />
    </>
  );
}
