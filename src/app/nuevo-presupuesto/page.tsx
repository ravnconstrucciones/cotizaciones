import { Suspense } from "react";
import { NuevoPresupuestoScreen } from "./nuevo-presupuesto";
import { CargandoCockpit } from "@/components/cockpit/cargando-cockpit";

export default function NuevoPresupuestoPage() {
  return (
    <Suspense fallback={<CargandoCockpit variante="bloque" />}>
      <NuevoPresupuestoScreen />
    </Suspense>
  );
}
