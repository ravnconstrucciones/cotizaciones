import type { Metadata } from "next";
import { RentabilidadScreen } from "./rentabilidad-screen";

export const metadata: Metadata = {
  title: "RAVN — Rentabilidad y costos",
  description:
    "Márgenes sobre materiales y mano de obra, cotización en USD y precio al cliente.",
};

export default async function RentabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const trimmed = id?.trim();
  return (
    <RentabilidadScreen
      presupuestoIdInicial={trimmed && trimmed.length > 0 ? trimmed : null}
    />
  );
}
