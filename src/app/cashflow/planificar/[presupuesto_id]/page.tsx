import { PlanificarCashflowScreen } from "./planificar-cashflow-screen";

type PageProps = { params: Promise<{ presupuesto_id: string }> };

export default async function PlanificarCashflowPage({ params }: PageProps) {
  const { presupuesto_id } = await params;
  return <PlanificarCashflowScreen presupuestoId={presupuesto_id} />;
}
