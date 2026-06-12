import { CockpitHome } from "@/components/cockpit/cockpit-home";
import { getCerebro } from "@/lib/vault";

/** Home = cockpit. ISR 5 min: el vault (GitHub) se relee como mucho cada 300 s. */
export const revalidate = 300;

export default async function Home() {
  const cerebro = await getCerebro();
  return <CockpitHome cerebro={cerebro} />;
}
