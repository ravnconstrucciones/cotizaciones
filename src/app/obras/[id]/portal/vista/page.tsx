import { redirect } from "next/navigation";
import { PortalCliente } from "@/components/portal/portal-cliente";
import { cargarVistaPortal, portalPorObra } from "@/lib/portal/datos";

export const dynamic = "force-dynamic";

/** Vista previa para Eze: exactamente lo que ve el cliente (sólo lo publicado). */
export default async function VistaPreviaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const portal = await portalPorObra(id);
  if (!portal) redirect(`/obras/${id}/portal`);
  const vista = await cargarVistaPortal(portal);
  return (
    <PortalCliente
      vista={vista}
      resumenHref={`/obras/${id}/portal/resumen`}
      aviso={`Vista previa · así lo ve tu cliente${portal.activo ? "" : " (el portal está apagado)"}`}
    />
  );
}
