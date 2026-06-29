import type { Region, TipoProp } from "@/lib/inmobiliario/tipos";

export interface ZonaSeed {
  nombre: string;
  tipo: "barrio_caba" | "partido_gba" | "barrio_privado";
  region: Region;
  ml_match: string[];
  lat?: number;
  lng?: number;
}

export const ZONAS_SEED: ZonaSeed[] = [
  { nombre: "Palermo", tipo: "barrio_caba", region: "CABA", ml_match: ["Palermo", "Palermo Soho", "Palermo Hollywood", "Las Cañitas"] },
  { nombre: "Belgrano", tipo: "barrio_caba", region: "CABA", ml_match: ["Belgrano", "Belgrano R", "Belgrano C"] },
  { nombre: "Núñez", tipo: "barrio_caba", region: "CABA", ml_match: ["Nuñez", "Núñez"] },
  { nombre: "Recoleta", tipo: "barrio_caba", region: "CABA", ml_match: ["Recoleta"] },
  { nombre: "Puerto Madero", tipo: "barrio_caba", region: "CABA", ml_match: ["Puerto Madero"] },
  { nombre: "Caballito", tipo: "barrio_caba", region: "CABA", ml_match: ["Caballito"] },
  { nombre: "Villa Urquiza", tipo: "barrio_caba", region: "CABA", ml_match: ["Villa Urquiza"] },
  { nombre: "Saavedra", tipo: "barrio_caba", region: "CABA", ml_match: ["Saavedra"] },
  { nombre: "Colegiales", tipo: "barrio_caba", region: "CABA", ml_match: ["Colegiales"] },
  { nombre: "Vicente López", tipo: "partido_gba", region: "GBA_NORTE", ml_match: ["Vicente Lopez", "Olivos", "Florida", "La Lucila"] },
  { nombre: "San Isidro", tipo: "partido_gba", region: "GBA_NORTE", ml_match: ["San Isidro", "Acassuso", "Beccar", "Martinez"] },
  { nombre: "Tigre", tipo: "partido_gba", region: "GBA_NORTE", ml_match: ["Tigre", "Nordelta", "Rincón de Milberg"] },
  { nombre: "Nordelta", tipo: "barrio_privado", region: "GBA_NORTE", ml_match: ["Nordelta"] },
  { nombre: "Pilar", tipo: "partido_gba", region: "GBA_NORTE", ml_match: ["Pilar", "Del Viso", "Manuel Alberti"] },
  { nombre: "San Fernando", tipo: "partido_gba", region: "GBA_NORTE", ml_match: ["San Fernando", "Victoria"] },
];

export const TIPOS_PROP: TipoProp[] = ["departamento", "casa", "ph"];
