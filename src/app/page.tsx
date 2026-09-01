import { redirect } from "next/navigation";

/**
 * La app abre DIRECTO en /gasto (pedido de Eze, 01/09/2026): el uso diario
 * es cantar gastos; el cockpit completo vive ahora en /panel y se llega con
 * [CENTRO DE MANDO] desde /gasto o con el logo/menú desde cualquier módulo.
 */
export default function Home() {
  redirect("/gasto");
}
