import { DiagnosticoScreen } from "./diagnostico-screen";

export default async function DiagnosticoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DiagnosticoScreen id={id} />;
}
