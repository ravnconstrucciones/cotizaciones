/**
 * Rubros de la hoja viva (Tramo B) — la botonera de la mesa de revisión.
 *
 * Lista canónica definida por Eze (11/07/2026): 9 rubros + pestaña propia de
 * mano de obra (los cierres por gremio no se mezclan con materiales). Un ítem
 * de desglose se mapea a rubro por: (1) `rubro` fijado a mano (ítems manuales),
 * (2) tipo mano_de_obra → pestaña MO, (3) keywords sobre nombre y etapa.
 * El mapeo es un MAPA APARTE, no un campo de la receta: recetas viejas y nuevas
 * caen solas en la botonera sin migrar nada.
 */
import { normalizar } from "./texto";
import type { ItemDesglose } from "./tipos";

export type RubroId =
  | "obra"
  | "humedad"
  | "revestimientos"
  | "plomeria"
  | "electricidad"
  | "sanitarios"
  | "griferias"
  | "mobiliario"
  | "extras"
  | "mano_de_obra";

export type RubroDef = {
  id: RubroId;
  label: string;
  /** Acento FINO por rubro (chip/borde/número) — no rompe la estética de la mesa. */
  acento: {
    texto: string; // clase de color del número/label activo
    borde: string; // clase de borde del tab activo / chip
    punto: string; // clase del punto indicador
  };
};

/** Orden canónico de la botonera. `mano_de_obra` y `extras` van al final. */
export const RUBROS: RubroDef[] = [
  {
    id: "obra",
    label: "Obra",
    acento: { texto: "text-stone-300", borde: "border-stone-300/60", punto: "bg-stone-300" },
  },
  {
    id: "humedad",
    label: "Humedad",
    acento: { texto: "text-sky-300", borde: "border-sky-300/60", punto: "bg-sky-300" },
  },
  {
    id: "revestimientos",
    label: "Revestimientos",
    acento: { texto: "text-rose-300", borde: "border-rose-300/60", punto: "bg-rose-300" },
  },
  {
    id: "plomeria",
    label: "Plomería",
    acento: { texto: "text-cyan-300", borde: "border-cyan-300/60", punto: "bg-cyan-300" },
  },
  {
    id: "electricidad",
    label: "Electricidad e iluminación",
    acento: { texto: "text-amber-300", borde: "border-amber-300/60", punto: "bg-amber-300" },
  },
  {
    id: "sanitarios",
    label: "Sanitarios",
    acento: { texto: "text-teal-300", borde: "border-teal-300/60", punto: "bg-teal-300" },
  },
  {
    id: "griferias",
    label: "Griferías",
    acento: { texto: "text-indigo-300", borde: "border-indigo-300/60", punto: "bg-indigo-300" },
  },
  {
    id: "mobiliario",
    label: "Mobiliario y accesorios",
    acento: { texto: "text-orange-300", borde: "border-orange-300/60", punto: "bg-orange-300" },
  },
  {
    id: "extras",
    label: "Extras",
    acento: { texto: "text-fuchsia-300", borde: "border-fuchsia-300/60", punto: "bg-fuchsia-300" },
  },
  {
    id: "mano_de_obra",
    label: "Mano de obra",
    acento: { texto: "text-emerald-300", borde: "border-emerald-300/60", punto: "bg-emerald-300" },
  },
];

export const RUBRO_POR_ID: Record<string, RubroDef> = Object.fromEntries(
  RUBROS.map((r) => [r.id, r])
);

/**
 * Reglas por keyword, EN ORDEN (la primera que matchea gana). Se chequea
 * primero el NOMBRE del ítem (más específico) y después la ETAPA.
 * Calibradas contra el desglose real de reforma-bano-completo v2 (test del ojo).
 */
const REGLAS: Array<{ rubro: RubroId; claves: string[] }> = [
  // Nombre manda: dentro de una etapa mixta, el ítem se reparte fino.
  { rubro: "griferias", claves: ["griferia", "monocomando", "duchador", "canilla"] },
  {
    rubro: "sanitarios",
    claves: ["inodoro", "bacha", "bidet", "mampara", "bañera", "banera", "receptaculo", "mochila"],
  },
  {
    rubro: "mobiliario",
    claves: [
      "vanitory",
      "mueble",
      "mesada",
      "espejo",
      "accesorio",
      "portarrollo",
      "toallero",
      "percha",
      "estante",
    ],
  },
  {
    rubro: "humedad",
    claves: [
      "hidrofug",
      "impermeabiliz",
      "membrana",
      "carpeta",
      "azotado",
      "albañileria humeda",
      "albanileria humeda",
      "sikatop",
      "cementicio",
    ],
  },
  {
    rubro: "electricidad",
    claves: [
      "electric",
      "iluminacion",
      "led",
      "spot",
      "aplique",
      "cablead",
      "tablero",
      "disyuntor",
      "termica",
      "luminaria",
    ],
  },
  {
    rubro: "plomeria",
    claves: [
      "plomeria",
      "termofusion",
      "ppr",
      "desague",
      "pvc",
      "agua fria",
      "agua caliente",
      "cloaca",
      "rejilla",
      "sifon",
    ],
  },
  {
    rubro: "revestimientos",
    claves: [
      "revestimiento",
      "porcelanato",
      "ceramic",
      "liston",
      "pegamento",
      "klaukol",
      "pastina",
      "azulejo",
      "guardacanto",
      "varilla",
      "zocalo",
    ],
  },
  // Obra = gruesa + terminaciones generales (demolición, albañilería, pintura, durlock).
  {
    rubro: "obra",
    claves: [
      "demolicion",
      "demoler",
      "albañileria",
      "albanileria",
      "mamposteria",
      "revoque",
      "durlock",
      "cielorraso",
      "pintura",
      "latex",
      "fijador",
      "enduido",
      "volquete",
      "flete",
      "cemento",
      "arena",
      "ladrillo",
    ],
  },
];

function matchear(texto: string): RubroId | null {
  for (const regla of REGLAS) {
    if (regla.claves.some((c) => texto.includes(c))) return regla.rubro;
  }
  return null;
}

/**
 * Rubro de un ítem del desglose. Nunca devuelve null: lo que no matchea nada
 * cae en "obra" (visible, no desaparece de la botonera).
 */
export function rubroDeItem(item: ItemDesglose): RubroId {
  if (item.rubro && item.rubro in RUBRO_POR_ID) return item.rubro as RubroId;
  if (item.tipo === "mano_de_obra") return "mano_de_obra";
  const porNombre = matchear(normalizar(item.nombre));
  if (porNombre) return porNombre;
  const porEtapa = matchear(normalizar(item.etapa));
  return porEtapa ?? "obra";
}
