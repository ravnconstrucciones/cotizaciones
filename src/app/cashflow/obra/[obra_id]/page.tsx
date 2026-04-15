import { CashflowObraScreen } from "../cashflow-obra-screen";

type PageProps = { params: Promise<{ obra_id: string }> };

export default async function CashflowObraPage({ params }: PageProps) {
  const { obra_id } = await params;
  return <CashflowObraScreen obraId={obra_id} />;
}
