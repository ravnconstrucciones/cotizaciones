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
