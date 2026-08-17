import { cotizadoMedio, type PlanItemRow } from "./tipos";

export type GastoParaCruce = {
  id: string;
  descripcion: string;
  importe_ars: number;
  plan_item_id: string | null;
  fecha: string;
};

export type FilaCruce = {
  item: PlanItemRow;
  cotizado: number | null;
  plan: number;
  real: number;
  cant_gastos: number;
  desvio_pct: number | null;
};

export type TotalesCruce = {
  cotizado: number;
  plan: number;
  real_asignado: number;
  real_sin_asignar: number;
  real_total: number;
};

export type MargenCruce = {
  cobrado: number | null;
  margen_ars: number | null;
  margen_pct: number | null;
  margen_plan_ars: number | null;
};

export type Cruce = {
  filas: FilaCruce[];
  sin_asignar: GastoParaCruce[];
  totales: TotalesCruce;
  margen: MargenCruce;
};

const ORDEN_TIPO: Record<PlanItemRow["tipo"], number> = { material: 0, maquinaria: 1, extra: 2, mano_de_obra: 3 };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Valor plan de un ítem: excluido = 0; sin precio cargado cae al cotizado medio. */
function valorPlan(item: PlanItemRow): number {
  if (!item.incluido) return 0;
  if (item.cantidad != null && item.precio_unitario != null) {
    return Math.round(item.cantidad * item.precio_unitario);
  }
  return cotizadoMedio(item) ?? 0;
}

/**
 * El cruce cotizado / plan / real (spec 2026-07-03). Puro y determinístico:
 * la IA no suma. Los gastos sin asignar entran SIEMPRE al real_total y al
 * margen — nada queda escondido.
 */
export function calcularCruce(
  items: PlanItemRow[],
  gastos: GastoParaCruce[],
  cobrado: number | null
): Cruce {
  const porItem = new Map<string, GastoParaCruce[]>();
  const sinAsignar: GastoParaCruce[] = [];
  const ids = new Set(items.map((i) => i.id));
  for (const g of gastos) {
    if (g.plan_item_id && ids.has(g.plan_item_id)) {
      const lista = porItem.get(g.plan_item_id) ?? [];
      lista.push(g);
      porItem.set(g.plan_item_id, lista);
    } else {
      sinAsignar.push(g);
    }
  }

  const ordenados = [...items].sort(
    (a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.creado_at.localeCompare(b.creado_at)
  );

  const filas: FilaCruce[] = ordenados.map((item) => {
    const propios = porItem.get(item.id) ?? [];
    const real = Math.round(propios.reduce((acc, g) => acc + g.importe_ars, 0));
    const cotizado = cotizadoMedio(item);
    const desvio =
      cotizado != null && cotizado > 0 && propios.length > 0
        ? round1(((real - cotizado) / cotizado) * 100)
        : null;
    return {
      item,
      cotizado,
      plan: valorPlan(item),
      real,
      cant_gastos: propios.length,
      desvio_pct: desvio,
    };
  });

  const totales: TotalesCruce = {
    cotizado: filas.reduce((a, f) => a + (f.cotizado ?? 0), 0),
    plan: filas.reduce((a, f) => a + f.plan, 0),
    real_asignado: filas.reduce((a, f) => a + f.real, 0),
    real_sin_asignar: Math.round(sinAsignar.reduce((a, g) => a + g.importe_ars, 0)),
    real_total: 0,
  };
  totales.real_total = totales.real_asignado + totales.real_sin_asignar;

  const margen: MargenCruce =
    cobrado == null
      ? { cobrado: null, margen_ars: null, margen_pct: null, margen_plan_ars: null }
      : {
          cobrado,
          margen_ars: cobrado - totales.real_total,
          margen_pct: cobrado > 0 ? round1(((cobrado - totales.real_total) / cobrado) * 100) : null,
          margen_plan_ars: cobrado - totales.plan,
        };

  return { filas, sin_asignar: sinAsignar, totales, margen };
}
