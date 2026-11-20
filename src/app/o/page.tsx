import type { Metadata } from "next";
import { PuertaObra } from "@/components/portal/puerta-obra";

export const metadata: Metadata = {
  title: "Portal RAVN",
  // Favicon del portal = isotipo R sobre negro (pedido de Eze, 20/11/2026).
  icons: {
    icon: [{ url: "/portal-icon.svg", type: "image/svg+xml" }, { url: "/portal-icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: "/portal-icon-180.png",
  },
  description: "Avance, agenda y pagos de tu obra.",
  robots: { index: false, follow: false },
};

export default function PuertaPortalPage() {
  return <PuertaObra />;
}
