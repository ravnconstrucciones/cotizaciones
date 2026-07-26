import { redirect } from "next/navigation";

/**
 * /cotizar pasa a ser la mesa conversacional (pedido de Eze 26/07): entrar acá
 * ahora manda a la galería de /cotizaciones, que tiene el botón "Nueva
 * cotización" que abre la mesa. El panel exploratorio viejo (Capítulo 1,
 * recetas + take-off) sigue vivo en /cotizar/explorar — no se borró, solo se
 * dejó de ser la puerta de entrada de /cotizar.
 */
export default function CotizarRedirect() {
  redirect("/cotizaciones");
}
