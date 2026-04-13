import { Suspense } from "react";
import { NuevoPresupuestoScreen } from "./nuevo-presupuesto";

export default function NuevoPresupuestoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center bg-ravn-surface px-6 text-sm text-ravn-muted">
          Cargando…
        </div>
      }
    >
      <NuevoPresupuestoScreen />
    </Suspense>
  );
}
