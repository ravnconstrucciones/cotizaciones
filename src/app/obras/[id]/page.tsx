import { ObraOrbitalScreen } from "./obra-orbital-screen";

/** Vista orbital de la obra — [id] = presupuesto_id (misma convención que ./gastos). */
export default async function ObraOrbitalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ObraOrbitalScreen presupuestoId={id} />;
}
