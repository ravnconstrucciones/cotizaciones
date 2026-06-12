import { normalizar } from "./texto";
import { esZonaPremium } from "./totales";
import type { ExtraDesglose, ItemDesglose, ResultadoChecklist } from "./tipos";

/** Ítems anti-olvidos globales (spec §6.2.3). Los dos últimos se chequean por config. */
export const CHECKLIST_GLOBAL = [
  "flete",
  "volquete",
  "consumibles",
  "andamios",
  "limpieza final",
  "retiro de escombros",
  "imprevistos",
  "factor zona",
] as const;

export type EntradaChecklist = {
  items: ItemDesglose[];
  extras: ExtraDesglose[];
  checklist_receta: string[];
  imprevistos_pct: number;
  zona?: string;
};

function buscarCobertura(
  termino: string,
  nombres: Array<{ nombre: string; normalizado: string }>
): string | null {
  const t = normalizar(termino);
  const hit = nombres.find((n) => n.normalizado.includes(t));
  return hit ? hit.nombre : null;
}

export function evaluarChecklist(entrada: EntradaChecklist): ResultadoChecklist[] {
  const nombres = [
    ...entrada.items.map((i) => i.nombre),
    ...entrada.extras.map((e) => e.nombre),
  ].map((nombre) => ({ nombre, normalizado: normalizar(nombre) }));

  const resultados: ResultadoChecklist[] = [];

  for (const termino of [...CHECKLIST_GLOBAL, ...entrada.checklist_receta]) {
    if (termino === "imprevistos") {
      resultados.push(
        entrada.imprevistos_pct > 0
          ? {
              item: termino,
              estado: "cubierto",
              detalle: `${entrada.imprevistos_pct}% aplicado sobre el subtotal`,
            }
          : {
              item: termino,
              estado: "faltante",
              detalle: "imprevistos_pct = 0 — confirmar si es a propósito",
            }
      );
      continue;
    }
    if (termino === "factor zona") {
      if (!esZonaPremium(entrada.zona)) {
        resultados.push({
          item: termino,
          estado: "no_aplica",
          detalle: `zona "${entrada.zona ?? "sin zona"}" no es country/barrio privado`,
        });
      } else {
        resultados.push({
          item: termino,
          estado: "cubierto",
          detalle: `zona premium "${entrada.zona}" — factor 1.15–1.20 aplicado`,
        });
      }
      continue;
    }
    const cobertura = buscarCobertura(termino, nombres);
    resultados.push(
      cobertura
        ? { item: termino, estado: "cubierto", detalle: `cubierto por: ${cobertura}` }
        : {
            item: termino,
            estado: "faltante",
            detalle: "no aparece en el desglose — confirmar si aplica o agregar como extra",
          }
    );
  }
  return resultados;
}
