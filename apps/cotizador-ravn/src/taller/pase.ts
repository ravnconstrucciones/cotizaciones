/**
 * Traducción del TALLER al EXTRACTO que viaja a App RAVN.
 *
 * Función pura: entra lo que hay sobre la mesa (ítems a mano + decisiones) más
 * los rubros del expediente, sale el payload del pase. Sin I/O, así la regla
 * "el taller manda" se verifica sin levantar nada.
 *
 * Lo que NO traduce: una sola línea de texto. El alcance y la redacción son del
 * diagnóstico, no del laboratorio (regla de Eze, 16/08).
 */

import { rubroDeItem } from "../../../../src/lib/cotizador/rubros";
import type { ItemDesglose, OrigenPrecio, Unidad } from "../../../../src/lib/cotizador/tipos";
import type {
  PaseManual,
  PasePayload,
  PasePrecioCerrado,
} from "../adapters/app-ravn-write-adapter";
import type { ManualItem, PostulanteMO, TallerState } from "./types";

const UNIDADES: readonly string[] = [
  "m2", "ml", "u", "kg", "l", "bolsa", "caja", "m3", "rollo", "dia", "global",
];
const ORIGENES: readonly string[] = ["sismat", "internet", "retail", "eze"];

/** Lo mínimo que el pase necesita saber de un rubro del expediente. */
export type RubroDelExpediente = {
  id: string;
  etapa: string;
  /** Nombres que vienen de la receta: los únicos que aceptan un precio cerrado. */
  itemNames: readonly string[];
};

export type ConstruirPaseArgs = {
  rubros: readonly RubroDelExpediente[];
  taller: TallerState;
  precioPropuesta: number | null;
};

export type PaseDescartado = {
  que: string;
  motivo: string;
};

export type PaseConstruido = {
  payload: PasePayload;
  /**
   * Lo que quedó afuera y por qué. Nunca se descarta en silencio: si algo del
   * taller no llega a App RAVN, Eze tiene que poder verlo.
   */
  descartados: PaseDescartado[];
};

/**
 * El rubro de App RAVN para un ítem agregado a mano. Se infiere con la MISMA
 * función que usa la app (`rubroDeItem`), no con una tabla paralela: si mañana
 * cambia la clasificación, cambia en los dos lados a la vez.
 */
function rubroDelManual(manual: ManualItem, etapa: string): string {
  return rubroDeItem({
    nombre: manual.name,
    etapa,
    tipo: manual.tipo,
  } as ItemDesglose);
}

/**
 * De quién es el precio de MO que viaja. `precios_items` guarda una etiqueta de
 * fuente y ésta es la que sirve dentro de tres meses: el nombre del proveedor y
 * de dónde salió el presupuesto.
 */
function fuenteDelPostulante(p: PostulanteMO): string {
  return p.procedencia ? `${p.proveedor} — ${p.procedencia}` : p.proveedor;
}

/**
 * La clave de una decisión es `<idDeRubro>:<nombreDelÍtem>`, y el id del rubro
 * trae dos puntos adentro (`batch:0:Etapa`). Por eso se resuelve por prefijo
 * contra los rubros conocidos y no partiendo la cadena.
 */
function separarClave(
  clave: string,
  rubros: readonly RubroDelExpediente[]
): { rubro: RubroDelExpediente; item: string } | null {
  for (const rubro of rubros) {
    const prefijo = `${rubro.id}:`;
    if (clave.startsWith(prefijo)) {
      const item = clave.slice(prefijo.length);
      if (item) return { rubro, item };
    }
  }
  return null;
}

export function construirPase({
  rubros,
  taller,
  precioPropuesta,
}: ConstruirPaseArgs): PaseConstruido {
  const descartados: PaseDescartado[] = [];
  const etapaPorRubro = new Map(rubros.map((r) => [r.id, r.etapa]));
  const nombresDeReceta = new Set(rubros.flatMap((r) => r.itemNames));

  // ── Ítems a mano ──────────────────────────────────────────────────────────
  const manuales: PaseManual[] = [];
  const nombresManuales = new Set<string>();

  for (const item of taller.manual) {
    const etapa = etapaPorRubro.get(item.batchId);
    if (etapa === undefined) {
      descartados.push({
        que: item.name,
        motivo: "el rubro donde estaba ya no existe en el expediente",
      });
      continue;
    }
    if (!UNIDADES.includes(item.unidad)) {
      descartados.push({ que: item.name, motivo: `App RAVN no conoce la unidad "${item.unidad}"` });
      continue;
    }
    if (nombresDeReceta.has(item.name) || nombresManuales.has(item.name)) {
      descartados.push({ que: item.name, motivo: "ya hay un ítem con ese nombre" });
      continue;
    }
    if (!(item.cantidad > 0)) {
      descartados.push({ que: item.name, motivo: "la cantidad no es un número mayor a cero" });
      continue;
    }

    nombresManuales.add(item.name);
    manuales.push({
      nombre: item.name,
      rubro: rubroDelManual(item, etapa),
      tipo: item.tipo,
      unidad: item.unidad as Unidad,
      cantidad: item.cantidad,
      ...(item.precioUnit > 0 ? { precio: item.precioUnit } : {}),
    });
  }

  // ── Mano de obra: el postulante elegido de cada rubro ─────────────────────
  // Viaja el elegido, nunca los descartados: la competencia es del taller, la
  // oficina sólo necesita saber a quién le va a pagar. El precio va con el
  // NOMBRE del proveedor como fuente, así `precios_items` aprende de quién era.
  const preciosCerrados: PasePrecioCerrado[] = [];
  const cerradoPorMO = new Set<string>();

  for (const elegido of taller.postulantes.filter((p) => p.elegido)) {
    const rubro = rubros.find((r) => r.id === elegido.batchId);
    if (!rubro) {
      descartados.push({
        que: `MO ${elegido.proveedor}`,
        motivo: "el rubro de ese postulante ya no existe en el expediente",
      });
      continue;
    }
    if (!rubro.itemNames.includes(elegido.itemName)) {
      descartados.push({
        que: `MO ${elegido.proveedor}`,
        motivo: `el ítem "${elegido.itemName}" ya no está en el expediente`,
      });
      continue;
    }
    if (!(elegido.precioUnit > 0)) {
      descartados.push({ que: `MO ${elegido.proveedor}`, motivo: "el precio no es mayor a cero" });
      continue;
    }
    if (cerradoPorMO.has(elegido.itemName)) {
      descartados.push({
        que: `MO ${elegido.proveedor}`,
        motivo: "ese ítem de mano de obra ya lo cerró otro postulante",
      });
      continue;
    }

    cerradoPorMO.add(elegido.itemName);
    preciosCerrados.push({
      nombre: elegido.itemName,
      valor: elegido.precioUnit,
      origen: "eze",
      fuente: fuenteDelPostulante(elegido),
    });
  }

  // ── Precios cerrados ──────────────────────────────────────────────────────
  for (const [clave, decision] of Object.entries(taller.decided)) {
    // "Lo dejo cerrado igual": la decisión existe pero no fija un número. Cierra
    // la cola en el laboratorio y no tiene nada que escribir en la cotización.
    if (decision.value == null) continue;

    const partes = separarClave(clave, rubros);
    if (!partes) {
      descartados.push({ que: clave, motivo: "el rubro de esa decisión ya no existe" });
      continue;
    }
    if (nombresManuales.has(partes.item)) continue; // su precio viaja en el ítem a mano
    // Si un postulante ganó ese ítem, manda el postulante: marcar "el que me
    // cobran a mí" es un acto más explícito que haber cerrado la tarjeta antes.
    if (cerradoPorMO.has(partes.item)) continue;
    if (!nombresDeReceta.has(partes.item)) {
      descartados.push({ que: partes.item, motivo: "el ítem ya no está en el expediente" });
      continue;
    }
    if (!ORIGENES.includes(decision.origin)) {
      descartados.push({
        que: partes.item,
        motivo: `origen de precio desconocido: "${decision.origin}"`,
      });
      continue;
    }
    if (!(decision.value > 0)) {
      descartados.push({ que: partes.item, motivo: "el precio cerrado no es mayor a cero" });
      continue;
    }

    preciosCerrados.push({
      nombre: partes.item,
      valor: decision.value,
      origen: decision.origin as OrigenPrecio,
    });
  }

  return {
    payload: { precioPropuesta, manuales, preciosCerrados },
    descartados,
  };
}
