import type { Metadata } from "next";
import { GrafoScreen } from "./grafo-screen";

export const metadata: Metadata = { title: "El grafo — RAVN" };

export default function GrafoPage() {
  return <GrafoScreen />;
}
