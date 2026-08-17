/**
 * Fusión de la mesa — la parte PURA que comparten la hoja viva (PATCH
 * .../desglose, que edita de a UNA operación) y el pase del expediente
 * (POST .../pase, que reemplaza el estado COMPLETO de una vez).
 *
 * Acá no hay I/O: entra estado, sale estado. Todo lo que toca Supabase vive en
 * las rutas. Así la aritmética de la mesa se testea sola y las dos puertas de
 * escritura no pueden divergir en las reglas.
 */

import { IMPREVISTOS_DEFAULT_PCT } from "./cotizar";
import { RUBRO_POR_ID } from "./rubros";
import type {
  AjusteItem,
  AjustesMesa,
  Desglose,
  ItemDesglose,
  ItemManualMesa,
  OrigenPrecio,
  PrecioFechado,
  PrecioItem,
  Receta,
  TipoItem,
  Unidad,
} from "./tipos";

export const UNIDADES: Unidad[] = [
  "m2", "ml", "u", "kg", "l", "bolsa", "caja", "m3", "rollo", "dia", "global",
];
export const TIPOS: TipoItem[] = ["material", "mano_de_obra"];
export const ORIGENES: OrigenPrecio[] = ["sismat", "internet", "retail", "eze"];

/** Etiqueta de `precios_items.fuente` cuando el número lo puso Eze a mano. */
export const FUENTE_EZE = "Eze — mesa de revisión";

export function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function esNumeroPositivo(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Desglose SINTÉTICO en memoria: "Nueva cotización" nace con `desglose: {}`
 * (el POST solo manda `titulo`). Sin este fallback la primera escritura cortaba
 * con 409 antes de llegar al chequeo de receta. Nunca se persiste tal cual:
 * cotizar() lo recalcula con los ítems reales.
 */
export const DESGLOSE_VACIO: Desglose = {
  receta_nombre: "",
  receta_version: 0,
  parametros: {},
  items: [],
  extras: [],
  totales: {
    materiales_min: 0,
    materiales_max: 0,
    mano_de_obra_min: 0,
    mano_de_obra_max: 0,
    extras_min: 0,
    extras_max: 0,
    subtotal_min: 0,
    subtotal_max: 0,
    imprevistos_pct: IMPREVISTOS_DEFAULT_PCT,
    factor_zona_min: 1,
    factor_zona_max: 1,
    total_min: 0,
    total_max: 0,
  },
  tiempo: { dias_min: 0, dias_max: 0, cuadrilla_max: 0 },
  generado_at: new Date(0).toISOString(),
};

/**
 * Receta SINTÉTICA vacía: sin receta_id el motor corre igual con cero etapas y
 * el desglose lo arman los ítems manuales. Ley 2 intacta (el código suma, no la
 * IA): NUNCA se escribe una fila a `recetas` para esto.
 */
export const RECETA_VACIA: Receta = {
  nombre: "sin-receta",
  titulo: "Sin receta vinculada — solo ítems manuales",
  estado: "candidata",
  parametros: [],
  etapas: [],
  checklist: [],
  fuentes: [],
  version: 0,
};

/** El desglose vigente, o el scaffold vacío si la cotización todavía no tiene. */
export function desgloseVigente(desglose: unknown): Desglose {
  return desglose && typeof desglose === "object" && "items" in desglose
    ? (desglose as Desglose)
    : DESGLOSE_VACIO;
}

/**
 * Precios de fuente reconstruidos del desglose vigente **sin el slot eze**: el
 * precio de Eze lo re-inyectan los ajustes, así que si se limpió no debe
 * resucitar desde acá.
 */
export function preciosDeFuente(desglose: Desglose): Record<string, PrecioItem> {
  const precios: Record<string, PrecioItem> = {};
  for (const item of desglose.items) {
    if (item.manual) continue;
    const { sismat, internet, retail } = item.precios;
    precios[item.nombre] = {
      ...(sismat ? { sismat } : {}),
      ...(internet ? { internet } : {}),
      ...(retail ? { retail } : {}),
    };
  }
  return precios;
}

/** Nombres de ítems que vienen de la receta (los manuales no cuentan). */
export function nombresDeReceta(desglose: Desglose): Set<string> {
  return new Set(desglose.items.filter((i) => !i.manual).map((i) => i.nombre));
}

export type ErrorValidacion = { error: string };

export function esError<T>(v: T | ErrorValidacion): v is ErrorValidacion {
  return typeof v === "object" && v !== null && "error" in v;
}

/** Alta de ítem manual tal como la manda una puerta de escritura. */
export type ManualEntrante = {
  nombre: string;
  rubro: string;
  tipo: TipoItem;
  unidad: Unidad;
  cantidad: number;
  precio?: number;
  notas?: string;
};

/**
 * Valida y normaliza un ítem manual. Devuelve el ítem listo para `ajustes` o el
 * motivo del rechazo — nunca tira.
 */
export function validarManual(
  m: ManualEntrante,
  yaUsado: (nombre: string) => boolean
): ItemManualMesa | ErrorValidacion {
  const nombre = typeof m?.nombre === "string" ? m.nombre.trim() : "";
  if (!nombre) return { error: "nombre requerido" };
  if (!(m.rubro in RUBRO_POR_ID)) return { error: `rubro inválido: ${m.rubro}` };
  if (!TIPOS.includes(m.tipo)) return { error: `tipo inválido en "${nombre}"` };
  if (!UNIDADES.includes(m.unidad)) return { error: `unidad inválida en "${nombre}"` };
  if (!esNumeroPositivo(m.cantidad)) {
    return { error: `cantidad debe ser un número > 0 en "${nombre}"` };
  }
  if (m.precio != null && !esNumeroPositivo(m.precio)) {
    return { error: `precio debe ser un número > 0 en "${nombre}"` };
  }
  if (yaUsado(nombre)) return { error: `Ya hay un ítem "${nombre}"` };

  return {
    nombre,
    rubro: m.rubro,
    tipo: m.tipo,
    unidad: m.unidad,
    cantidad: m.cantidad,
    ...(m.precio != null
      ? { precio: { valor: m.precio, fuente: FUENTE_EZE, fecha: hoyIso() } }
      : {}),
    ...(m.notas ? { notas: m.notas } : {}),
  };
}

/**
 * Precio que Eze CERRÓ en el laboratorio, con el origen del que salió.
 *
 * El origen importa y no es cosmético (decisión de Eze, 16/08): el ítem queda
 * cerrado en ese número igual —el rango colapsa— pero **sólo `eze` califica para
 * calibrar `precios_items`**. Cerrar un ítem con el número de SISMAT no lo
 * inscribe en la base como precio propio.
 */
export type PrecioCerrado = {
  nombre: string;
  valor: number;
  origen: OrigenPrecio;
  /**
   * Quién puso ese número, cuando no fue Eze de la nada: el proveedor que pasó
   * el presupuesto de mano de obra ("Fran — presupuesto por WhatsApp"). Sólo
   * aplica con origen `eze`, que es el único que califica para calibrar.
   * Sin esto `precios_items` aprendería "Eze — mesa de revisión" y se perdería
   * de quién era el precio, que es justamente el dato que sirve la próxima vez.
   */
  fuente?: string;
};

/** Etiqueta de fuente para un precio cerrado, ya recortada para la base. */
export function fuenteDePrecioCerrado(cerrado: PrecioCerrado): string {
  const propia = typeof cerrado.fuente === "string" ? cerrado.fuente.trim() : "";
  return propia ? propia.slice(0, 120) : FUENTE_EZE;
}

/**
 * Traza del precio cerrado: cuando el origen es una fuente ya persistida, se
 * conserva SU fuente y SU fecha (la antigüedad del precio es real y el
 * vencimiento tiene que seguir midiéndola). Sólo el número propio de Eze se
 * fecha hoy.
 */
export function fechadoDePrecioCerrado(
  cerrado: PrecioCerrado,
  itemPersistido: ItemDesglose | undefined
): PrecioFechado {
  if (cerrado.origen === "eze") {
    return { valor: cerrado.valor, fuente: fuenteDePrecioCerrado(cerrado), fecha: hoyIso() };
  }
  const persistido = itemPersistido?.precios?.[cerrado.origen];
  return {
    valor: cerrado.valor,
    fuente: persistido?.fuente ?? cerrado.origen.toUpperCase(),
    fecha: persistido?.fecha ?? hoyIso(),
  };
}

/**
 * Merge INCREMENTAL de un ajuste sobre un ítem de receta (lo que usa la hoja
 * viva). Semántica: campo presente pisa, `null` explícito limpia el override.
 * Devuelve la lista completa de ajustes de ítems ya fusionada.
 */
export function fusionarAjusteItem(
  items: readonly AjusteItem[],
  ajuste: { nombre: string; precio?: number | null; cantidad?: number | null; activo?: boolean }
): AjusteItem[] {
  const previo = items.find((x) => x.nombre === ajuste.nombre);
  const nuevo: AjusteItem = { nombre: ajuste.nombre, ...previo };

  if ("precio" in ajuste) {
    if (ajuste.precio == null) delete nuevo.precio_eze;
    else nuevo.precio_eze = { valor: ajuste.precio, fuente: FUENTE_EZE, fecha: hoyIso() };
  }
  if ("cantidad" in ajuste) {
    if (ajuste.cantidad == null) delete nuevo.cantidad;
    else nuevo.cantidad = ajuste.cantidad;
  }
  if ("activo" in ajuste && typeof ajuste.activo === "boolean") {
    if (ajuste.activo) delete nuevo.activo;
    else nuevo.activo = false;
  }

  const otros = items.filter((x) => x.nombre !== ajuste.nombre);
  const vacio = nuevo.precio_eze == null && nuevo.cantidad == null && nuevo.activo !== false;
  return vacio ? otros : [...otros, nuevo];
}

/**
 * Merge WHOLESALE del pase: reconstruye `ajustes` desde el estado completo del
 * taller. Es lo que hace que el pase sea idempotente y que "el taller manda":
 * lo que no viene en el pase deja de existir en la cotización.
 *
 * Lo que NO toca: `cantidad` y `activo` de ajustes previos. Esos salen de la
 * mesa de revisión de App RAVN, no del laboratorio, y el pase no tiene por qué
 * pisarlos — sólo reemplaza lo que el taller sí gobierna (manuales y precios).
 */
export function ajustesDelPase(
  desglose: Desglose,
  ajustesPrevios: AjustesMesa | undefined,
  manuales: readonly ItemManualMesa[],
  cerrados: readonly PrecioCerrado[]
): AjustesMesa {
  const porNombre = new Map(desglose.items.map((i) => [i.nombre, i]));

  const conservados: AjusteItem[] = (ajustesPrevios?.items ?? [])
    .map(({ nombre, cantidad, activo }) => {
      const base: AjusteItem = { nombre };
      if (cantidad != null) base.cantidad = cantidad;
      if (activo === false) base.activo = false;
      return base;
    })
    .filter((a) => a.cantidad != null || a.activo === false);

  const items = cerrados.reduce<AjusteItem[]>((acc, cerrado) => {
    const previo = acc.find((x) => x.nombre === cerrado.nombre);
    const otros = acc.filter((x) => x.nombre !== cerrado.nombre);
    return [
      ...otros,
      {
        ...(previo ?? { nombre: cerrado.nombre }),
        precio_eze: fechadoDePrecioCerrado(cerrado, porNombre.get(cerrado.nombre)),
      },
    ];
  }, conservados);

  return { items, manuales: [...manuales] };
}
