import { RemitoScreen } from "./remito-screen";

export default async function RemitoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RemitoScreen presupuestoId={id} />;
}
