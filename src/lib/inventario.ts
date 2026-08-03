export type InventarioTipo = "herramienta" | "material";

export type InventarioUbicacion = {
  id: string;
  clave: string;
  nombre: string;
  tipo: "deposito" | "casa" | "obra" | "otro";
  obra_id: string | null;
};

export type InventarioItem = {
  id: string;
  nombre: string;
  tipo: InventarioTipo;
  rubro: string;
  cantidad: number | null;
  unidad: string | null;
  cantidad_texto: string | null;
  ubicacion_id: string;
  estado_revision: string;
  nota_revision: string | null;
};

export type BorradorMovimiento = {
  item_id: string;
  origen_id: string;
  destino_id: string;
  texto_original: string;
};

export function normalizarBusqueda(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function puntaje(nombre: string, texto: string): number {
  const n = normalizarBusqueda(nombre);
  if (texto.includes(n)) return n.length + 100;
  return n.split(/\s+/).filter((p) => p.length > 2 && texto.includes(p)).join("").length;
}

/** Interpreta el borrador solamente. Nunca persiste: la UI exige confirmación. */
export function interpretarMovimiento(
  textoOriginal: string,
  items: InventarioItem[],
  ubicaciones: InventarioUbicacion[]
): { borrador: BorradorMovimiento | null; faltantes: string[] } {
  const texto = normalizarBusqueda(textoOriginal);
  const item = items
    .map((x) => ({ x, p: puntaje(x.nombre, texto) }))
    .filter((x) => x.p > 2)
    .sort((a, b) => b.p - a.p)[0]?.x;
  const destinos = ubicaciones
    .map((x) => ({ x, p: puntaje(x.nombre, texto) }))
    .filter((x) => x.p > 2 && x.x.id !== item?.ubicacion_id)
    .sort((a, b) => b.p - a.p);
  const destino = destinos[0]?.x;
  const faltantes: string[] = [];
  if (!item) faltantes.push("ítem");
  if (!destino) faltantes.push("destino");
  if (!item || !destino) return { borrador: null, faltantes };
  return {
    borrador: {
      item_id: item.id,
      origen_id: item.ubicacion_id,
      destino_id: destino.id,
      texto_original: textoOriginal.trim(),
    },
    faltantes: [],
  };
}

export function cantidadItem(item: InventarioItem): string {
  if (item.cantidad_texto) return item.cantidad_texto;
  if (item.cantidad === null) return "Sin cantidad";
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(item.cantidad)}${item.unidad ? ` ${item.unidad}` : ""}`;
}

export const RUBRO_LABELS: Record<string, string> = {
  iluminacion: "Iluminación",
  pintura: "Pintura",
  revestimientos: "Revestimientos",
  electricidad: "Electricidad",
  "plomeria-sanitaria": "Plomería / sanitaria",
  "albanileria-construccion-seco": "Albañilería / construcción en seco",
  "herramientas-mantenimiento": "Herramientas / mantenimiento",
  seguridad: "Seguridad",
  "pendiente-revision": "Pendiente de revisión",
};
