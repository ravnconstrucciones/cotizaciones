/**
 * Compat de desgloses viejos — la mesa de revisión asume el Desglose del
 * motor, pero las cotizaciones cargadas por consola (p. ej. Húsares 25/07)
 * guardaron ítems `{item, costo}` y totales de venta. Ese shape pasaba el
 * chequeo `"items" in desglose` de la pantalla y reventaba en
 * `rubroDeItem(normalizar(undefined))`. Acá se detecta y se convierte a un
 * Desglose válido de SOLO LECTURA: editarlo dispararía el PATCH del motor,
 * que pisaría el desglose real de un presupuesto ya enviado.
 */
import { normalizar } from "./texto";
import type { Desglose, ItemDesglose } from "./tipos";

export type CompatDesglose = { desglose: Desglose; legacy: boolean };

/** El motor SIEMPRE emite totales con materiales_min; el legacy nunca. */
function esMotor(d: Record<string, unknown>): boolean {
  const t = d.totales as Record<string, unknown> | undefined;
  return t != null && typeof t === "object" && typeof t.materiales_min === "number";
}

function itemLegacy(crudo: Record<string, unknown>, i: number): ItemDesglose {
  const nombre = String(crudo.item ?? `Ítem ${i + 1}`).trim() || `Ítem ${i + 1}`;
  const costo = typeof crudo.costo === "number" && Number.isFinite(crudo.costo) ? crudo.costo : null;
  return {
    nombre,
    etapa: "",
    tipo: normalizar(nombre).includes("mano de obra") ? "mano_de_obra" : "material",
    unidad: "global",
    formula: "cargado por consola",
    cantidad_base: 1,
    desperdicio_pct: 0,
    cantidad: 1,
    precios: {},
    precio_min: costo,
    precio_max: costo,
    subtotal_min: costo ?? 0,
    subtotal_max: costo ?? 0,
    divergencia_pct: null,
    sin_precio: costo == null,
  };
}

/**
 * null → no hay desglose usable (la pantalla cae a su DESGLOSE_VACIO).
 * legacy=false → es el Desglose del motor, va tal cual.
 * legacy=true → convertido desde el shape de consola; mostrar SOLO LECTURA.
 */
export function compatDesglose(crudo: unknown): CompatDesglose | null {
  if (crudo == null || typeof crudo !== "object" || Array.isArray(crudo)) return null;
  const d = crudo as Record<string, unknown>;
  if (!Array.isArray(d.items)) return null;
  if (esMotor(d)) return { desglose: crudo as Desglose, legacy: false };

  const items = (d.items as unknown[])
    .filter((it): it is Record<string, unknown> => it != null && typeof it === "object")
    .map(itemLegacy);

  let mo = 0;
  let materiales = 0;
  for (const it of items) {
    if (it.tipo === "mano_de_obra") mo += it.subtotal_min;
    else materiales += it.subtotal_min;
  }
  const totalesCrudos = (d.totales ?? {}) as Record<string, unknown>;
  const total = typeof totalesCrudos.costo_total === "number" ? totalesCrudos.costo_total : mo + materiales;

  return {
    legacy: true,
    desglose: {
      receta_nombre: String(d.receta_nombre ?? "cargado por consola"),
      receta_version: 0,
      parametros: {},
      items,
      extras: [],
      totales: {
        materiales_min: materiales,
        materiales_max: materiales,
        mano_de_obra_min: mo,
        mano_de_obra_max: mo,
        extras_min: 0,
        extras_max: 0,
        subtotal_min: mo + materiales,
        subtotal_max: mo + materiales,
        imprevistos_pct: 0,
        factor_zona_min: 1,
        factor_zona_max: 1,
        total_min: total,
        total_max: total,
      },
      tiempo: { dias_min: 0, dias_max: 0, cuadrilla_max: 0 },
      generado_at: String(d.generado_at ?? ""),
    },
  };
}
