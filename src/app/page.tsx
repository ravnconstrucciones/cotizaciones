import { CockpitHome } from "@/components/cockpit/cockpit-home";
import { PrefetchDatos } from "@/components/cockpit/prefetch-datos";

export default function Home() {
  return (
    <>
      {/* Los datos del cockpit arrancan a bajar con el HTML, no después
          de hidratar (ronda 6 — perf). Mismos paths que usan los módulos. */}
      <PrefetchDatos
        rutas={[
          "/cashflow/resumen",
          "/api/finanzas",
          "/api/dinero",
          "/api/referencias?limit=20",
          "/api/grafo",
        ]}
      />
      <CockpitHome />
    </>
  );
}
