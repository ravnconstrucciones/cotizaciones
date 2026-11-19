import { PortalAdminScreen } from "./portal-admin-screen";

export default async function PortalAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PortalAdminScreen presupuestoId={id} />;
}
