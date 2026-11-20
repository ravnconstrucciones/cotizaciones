import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResumenDoc } from "@/components/portal/resumen-doc";
import { accesoCliente, rutaObraActual } from "@/lib/portal/acceso-cliente";
import { cargarVistaPortal } from "@/lib/portal/datos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resumen de obra — RAVN",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ slug: string }> };

export default async function ResumenClientePage({ params }: Params) {
  const { slug } = await params;
  const acceso = await accesoCliente(slug);
  const ruta = await rutaObraActual(slug);
  if (acceso.estado !== "ok") redirect(ruta);
  const vista = await cargarVistaPortal(acceso.portal);
  return <ResumenDoc vista={vista} volverHref={ruta} />;
}
