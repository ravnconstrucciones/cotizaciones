import { PlanScreen } from "./plan-screen";

export default async function ObrasPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanScreen presupuestoId={id} />;
}
