import { PropuestaScreen } from "./propuesta-screen";

export default async function PropuestaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PropuestaScreen presupuestoId={id} />;
}
