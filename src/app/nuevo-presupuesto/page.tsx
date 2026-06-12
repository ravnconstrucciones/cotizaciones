import { Suspense } from "react";
import { NuevoPresupuestoScreen } from "./nuevo-presupuesto";

export default function NuevoPresupuestoPage() {
  return (
    <Suspense
      fallback={
        <div className="font-inter flex min-h-[40vh] items-center justify-center bg-cdm-bg px-6 text-sm text-cdm-muted">
          Cargando…
        </div>
      }
    >
      <NuevoPresupuestoScreen />
    </Suspense>
  );
}
