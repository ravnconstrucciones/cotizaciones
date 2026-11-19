import type { Metadata } from "next";
import { PinGate } from "@/components/portal/pin-gate";
import { PortalCliente } from "@/components/portal/portal-cliente";
import { Wordmark } from "@/components/portal/portal-ui";
import { accesoCliente } from "@/lib/portal/acceso-cliente";
import { cargarVistaPortal } from "@/lib/portal/datos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal RAVN",
  description: "Avance, agenda y registros de tu obra.",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ slug: string }> };

export default async function PortalPage({ params }: Params) {
  const { slug } = await params;
  const acceso = await accesoCliente(slug);

  if (acceso.estado === "no_existe") return <NoDisponible />;
  if (acceso.estado === "pin") return <PinGate slug={slug} obra={acceso.obra} />;

  const vista = await cargarVistaPortal(acceso.portal);
  return <PortalCliente vista={vista} slug={slug} resumenHref={`/o/${slug}/resumen`} />;
}

function NoDisponible() {
  return (
    <div
      className="flex min-h-dvh flex-col bg-[#070707] px-6 text-[#f2efe8]"
      style={{ fontFamily: '-apple-system, system-ui, "Helvetica Neue", Arial, sans-serif' }}
    >
      <main className="m-auto w-full max-w-sm py-16">
        <Wordmark className="text-[15px]" />
        <h1 className="mt-12 text-[34px] font-semibold leading-[1.05] tracking-[-0.04em]">Este enlace no está disponible.</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-[#f2efe8]/70">
          Revisá que sea el enlace que te enviamos o pedinos uno nuevo.
        </p>
      </main>
    </div>
  );
}
