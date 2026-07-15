import { ManoObraScreen } from "./mano-obra-screen";

export default async function ObrasManoObraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ManoObraScreen presupuestoId={id} />;
}
