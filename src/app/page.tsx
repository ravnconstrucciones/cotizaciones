import { CockpitHome } from "@/components/cockpit/cockpit-home";
import { PrefetchDatos } from "@/components/cockpit/prefetch-datos";
import { getCerebro } from "@/lib/vault";

/** Home = cockpit. ISR 5 min: el vault (GitHub) se relee como mucho cada 300 s. */
export const revalidate = 300;

export default async function Home() {
  const cerebro = await getCerebro();
  return (
    <>
      {/* Los datos del cockpit arrancan a bajar con el HTML, no después
          de hidratar (ronda 6 — perf). Mismos paths que usan los módulos. */}
      <PrefetchDatos
        rutas={[
          "/cashflow/resumen",
          "/api/finanzas",
          "/api/referencias?limit=20",
        ]}
      />
      <CockpitHome cerebro={cerebro} />
    </>
  );
}
