import { getTuDia } from "@/lib/tu-dia";
import { getNoticiasDelDia } from "@/lib/noticias";
import { todayBuenosAires } from "@/lib/cashflow-compute";
import { DiaScreen } from "./dia-screen";

/**
 * TU DÍA — el panel de las 8 ÁREAS DE VIDA. Server component: la lectura del
 * vault (GitHub API) viaja con el HTML, no después de hidratar.
 *
 * ISR 5 min: el vault se relee como mucho cada 300 s (mismo criterio que la
 * home). El 1% diario lo regenera el cerebro nocturno del daemon (hoy pausado);
 * esta vista SOLO lee lo que hay y avisa la frescura — ver TODO(daemon) en
 * src/lib/tu-dia.ts.
 */
export const revalidate = 300;

export default async function DiaPage() {
  const [data, noticias] = await Promise.all([getTuDia(), getNoticiasDelDia()]);
  return <DiaScreen data={data} hoy={todayBuenosAires()} noticias={noticias} />;
}
