import { ObrasScreen } from "./obras-screen";
import { PrefetchDatos } from "@/components/cockpit/prefetch-datos";

/** Galería de proyectos: una sección viva por obra activa. */
export default function ObrasPage() {
  return (
    <>
      {/* El resumen arranca a bajar con el HTML (ronda 6 — perf). */}
      <PrefetchDatos rutas={["/cashflow/resumen"]} />
      <ObrasScreen />
    </>
  );
}
