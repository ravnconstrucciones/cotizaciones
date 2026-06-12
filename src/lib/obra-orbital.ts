/**
 * Lógica PURA de la vista orbital de obra (/obras/[id]) — testeable sin DB.
 *
 * Nodos = rubros del presupuesto (presupuestos_items × catalogo_recetas).
 * "Energy" del nodo = % ejecutado: gastado real (presupuestos_gastos) vs
 * presupuestado del rubro. Convención de monto presupuestado: misma que
 * control-gastos / presupuesto-costos-directos → cantidad × (mat + M.O.)
 * congelados, sin descuento.
 */

export type ItemOrbitalInput = {
  cantidad: number;
  precioMaterial: number;
  precioMo: number;
  /** rubro de la receta del ítem; null → bucket "otros". */
  rubroId: string | null;
};

export type GastoOrbitalInput = {
  /** presupuestos_gastos.rubro_id (texto, nullable). */
  rubroId: string | null;
  /** importe ya normalizado a ARS (importeGastoObraArs). */
  importeArs: number;
};

export type EstadoNodo = "completed" | "in-progress" | "pending";

export type NodoRubro = {
  rubroId: string;
  nombre: string;
  presupuestado: number;
  gastado: number;
  /** presupuestado − gastado (negativo = rubro pasado de presupuesto). */
  desvio: number;
  /** % ejecutado real, sin tope (para el card). */
  pctEjecutado: number;
  /** % ejecutado 0–100 (para glow y barra). */
  energy: number;
  status: EstadoNodo;
};

export type OrbitalObra = {
  nodos: NodoRubro[];
  /** Gastos con rubro_id null: plata ejecutada fuera de los rubros. */
  gastoSinRubro: number;
  presupuestadoTotal: number;
  gastadoTotal: number;
};

const RUBRO_OTROS = "otros";

/** Status derivado del % ejecutado: ≥95 completo, >0 en curso, 0 pendiente. */
export function estadoPorPct(pct: number): EstadoNodo {
  if (pct >= 95) return "completed";
  if (pct > 0) return "in-progress";
  return "pending";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Orden por prefijo numérico del id de rubro (convención de la app). */
function ordenRubro(a: NodoRubro, b: NodoRubro): number {
  const na = Number(String(a.rubroId).replace(/\D/g, "")) || 0;
  const nb = Number(String(b.rubroId).replace(/\D/g, "")) || 0;
  if (na !== nb) return na - nb;
  return String(a.rubroId).localeCompare(String(b.rubroId));
}

export function derivarOrbitalObra(
  items: ItemOrbitalInput[],
  gastos: GastoOrbitalInput[],
  nombresRubros: Record<string, string>
): OrbitalObra {
  const presupuestadoPorRubro = new Map<string, number>();
  for (const it of items) {
    const rubro = it.rubroId ?? RUBRO_OTROS;
    const monto =
      (Number(it.cantidad) || 0) *
      ((Number(it.precioMaterial) || 0) + (Number(it.precioMo) || 0));
    presupuestadoPorRubro.set(
      rubro,
      (presupuestadoPorRubro.get(rubro) ?? 0) + monto
    );
  }

  const gastadoPorRubro = new Map<string, number>();
  let gastoSinRubro = 0;
  for (const g of gastos) {
    const importe = Number(g.importeArs) || 0;
    if (g.rubroId == null || g.rubroId === "") {
      gastoSinRubro += importe;
      continue;
    }
    gastadoPorRubro.set(g.rubroId, (gastadoPorRubro.get(g.rubroId) ?? 0) + importe);
  }

  // Un nodo por rubro presupuestado Y por rubro con gasto (aunque no esté
  // presupuestado: plata real ejecutada en un rubro sin partida también orbita).
  const rubroIds = new Set<string>([
    ...presupuestadoPorRubro.keys(),
    ...gastadoPorRubro.keys(),
  ]);

  const nodos: NodoRubro[] = [];
  let presupuestadoTotal = 0;
  let gastadoTotal = 0;

  for (const rubroId of rubroIds) {
    const presupuestado = round2(presupuestadoPorRubro.get(rubroId) ?? 0);
    const gastado = round2(gastadoPorRubro.get(rubroId) ?? 0);
    presupuestadoTotal += presupuestado;
    gastadoTotal += gastado;
    const pct =
      presupuestado > 0
        ? (gastado / presupuestado) * 100
        : gastado > 0
          ? 100
          : 0;
    nodos.push({
      rubroId,
      nombre:
        nombresRubros[rubroId] ??
        (rubroId === RUBRO_OTROS ? "Otros" : rubroId),
      presupuestado,
      gastado,
      desvio: round2(presupuestado - gastado),
      pctEjecutado: round2(pct),
      energy: Math.max(0, Math.min(100, Math.round(pct))),
      status: estadoPorPct(pct),
    });
  }

  nodos.sort(ordenRubro);

  return {
    nodos,
    gastoSinRubro: round2(gastoSinRubro),
    presupuestadoTotal: round2(presupuestadoTotal),
    gastadoTotal: round2(gastadoTotal + gastoSinRubro),
  };
}
