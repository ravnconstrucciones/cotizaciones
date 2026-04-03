import { formatRubroName } from "@/lib/format-rubro-name";

/**
 * Líneas mínimas del presupuesto para armar el texto comercial (por rubro / unidad).
 */
export type LineaPresupuestoComercial = {
  rubroNombre: string | null;
  cantidad: number;
  unidad: string | null;
};

function formatCantidadComercial(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

/**
 * Agrupa por rubro + unidad, suma cantidades y arma el párrafo comercial para el textarea.
 */
export function generarTextoComercial(
  lineasPresupuesto: LineaPresupuestoComercial[]
): string {
  const map = new Map<string, number>();

  for (const l of lineasPresupuesto) {
    const rubro = formatRubroName(
      (l.rubroNombre?.trim() || "Sin rubro").trim()
    );
    const unidad = (l.unidad?.trim() || "ud.").trim();
    const key = `${rubro}\u0000${unidad}`;
    const q = Number(l.cantidad);
    const add = Number.isFinite(q) ? q : 0;
    map.set(key, (map.get(key) ?? 0) + add);
  }

  const entries = [...map.entries()].sort(([a], [b]) => {
    const [ar, au] = a.split("\u0000");
    const [br, bu] = b.split("\u0000");
    const c = ar.localeCompare(br, "es", { sensitivity: "base" });
    return c !== 0 ? c : au.localeCompare(bu, "es", { sensitivity: "base" });
  });

  const intro =
    "Se detalla a continuación la propuesta técnico-comercial para la ejecución de las siguientes tareas:";
  const outro = "\n\nQuedamos a entera disposición para cualquier consulta.";

  if (entries.length === 0) {
    return `${intro}\n\n- (Sin rubros ni cantidades cargadas en el presupuesto.)${outro}`;
  }

  const bullets = entries
    .map(([k, sum]) => {
      const [rubro, unidad] = k.split("\u0000");
      return `- ${rubro}: ${formatCantidadComercial(sum)} ${unidad}`;
    })
    .join("\n");

  return `${intro}\n${bullets}${outro}`;
}
