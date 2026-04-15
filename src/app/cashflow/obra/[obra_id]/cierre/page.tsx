import { CashflowCierreScreen } from "./cashflow-cierre-screen";

type PageProps = { params: Promise<{ obra_id: string }> };

export default async function CashflowCierrePage({ params }: PageProps) {
  const { obra_id } = await params;
  return <CashflowCierreScreen obraId={obra_id} />;
}
