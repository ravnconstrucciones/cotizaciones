import { GastosScreen } from "./gastos-screen";

export default async function ObrasGastosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GastosScreen presupuestoId={id} />;
}
