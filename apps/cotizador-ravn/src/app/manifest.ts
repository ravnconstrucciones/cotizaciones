import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cotizador RAVN",
    short_name: "Cotizador",
    description: "Laboratorio de diagnóstico, evidencia y costo de RAVN.",
    start_url: "/",
    display: "standalone",
    background_color: "#070707",
    theme_color: "#070707",
  };
}
