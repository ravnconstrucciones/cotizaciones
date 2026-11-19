import { redirect } from "next/navigation";
import { ResumenDoc } from "@/components/portal/resumen-doc";
import { cargarVistaPortal, portalPorObra } from "@/lib/portal/datos";

export const dynamic = "force-dynamic";

/** Resumen A4 para que Eze lo guarde como PDF y se lo mande al cliente. */
export default async function ResumenAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const portal = await portalPorObra(id);
  if (!portal) redirect(`/obras/${id}/portal`);
  const vista = await cargarVistaPortal(portal);
  return <ResumenDoc vista={vista} volverHref={`/obras/${id}/portal`} />;
}
