import type { Metadata } from "next";
import { PuertaObra } from "@/components/portal/puerta-obra";

export const metadata: Metadata = {
  title: "Portal RAVN",
  description: "Avance, agenda y pagos de tu obra.",
  robots: { index: false, follow: false },
};

export default function PuertaPortalPage() {
  return <PuertaObra />;
}
