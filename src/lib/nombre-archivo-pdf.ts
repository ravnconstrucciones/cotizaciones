/** Nombre de archivo seguro para descarga del presupuesto PDF. */
export function nombreArchivoPresupuestoPdf(
  numeroHumano: string,
  nombreCliente: string
): string {
  const safeNum = numeroHumano.replace(/[^a-zA-Z0-9_-]/g, "_");
  const base = nombreCliente
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  const safeCliente = base || "Cliente";
  return `RAVN_Presupuesto_${safeNum}_${safeCliente}.pdf`;
}

/** Nombre de archivo para certificado de conformidad / remito. */
export function nombreArchivoCertificadoConformidadPdf(
  numeroLinea: string,
  etiquetaCliente: string
): string {
  const safeNum = numeroLinea
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  const base = etiquetaCliente
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 50);
  const safeCliente = base || "Obra";
  return `RAVN_Certificado_${safeNum || "num"}_${safeCliente}.pdf`;
}

export function colorFondoPlantillaPdf(
  plantilla: "negro" | "beige" | "verde"
): string {
  switch (plantilla) {
    case "beige":
      return "#fef7f2";
    case "verde":
      return "#3F4E3E";
    default:
      return "#181817";
  }
}
