import { redirect } from "next/navigation";
// El inicio presenta el día; el atajo instalado de carga conserva /gasto.
export default function Home() { redirect("/panel"); }
