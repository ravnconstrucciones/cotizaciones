import { roundArs2 } from "@/lib/format-currency";
import type { CashflowItemRow, CashflowTipo } from "@/lib/cashflow-compute";

export type QuickTipoRegistro =
  | "cobre_cliente"
  | "pago_proveedor"
  | "compra_material"
  | "pago_mano_obra"
  | "otro";

function diffDias(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  const ta = Date.UTC(ya, ma - 1, da);
  const tb = Date.UTC(yb, mb - 1, db);
  return Math.abs(Math.round((ta - tb) / 86400000));
}

/** Ítem proyectado sin real, más cercano en fecha; opcional categoría preferida. */
export function encontrarProyectadoMasCercano(
  items: CashflowItemRow[],
  tipo: CashflowTipo,
  fechaRef: string,
  categoriasPreferidas: string[]
): CashflowItemRow | null {
  const pend = items.filter(
    (it) =>
      it.tipo === tipo &&
      (it.monto_real == null || it.fecha_real == null)
  );
  if (pend.length === 0) return null;

  for (const cat of categoriasPreferidas) {
    const sub = pend.filter((it) => it.categoria === cat);
    const pick = pickClosest(sub, fechaRef);
    if (pick) return pick;
  }
  return pickClosest(pend, fechaRef);
}

function pickClosest(
  candidatos: CashflowItemRow[],
  fechaRef: string
): CashflowItemRow | null {
  if (candidatos.length === 0) return null;
  return [...candidatos].sort(
    (a, b) =>
      diffDias(a.fecha_proyectada, fechaRef) -
      diffDias(b.fecha_proyectada, fechaRef)
  )[0]!;
}

export function quickTipoAParametros(quick: QuickTipoRegistro): {
  tipo: CashflowTipo;
  categoriasMatch: string[];
  categoriaNueva: string;
} {
  switch (quick) {
    case "cobre_cliente":
      return {
        tipo: "ingreso",
        categoriasMatch: [
          "anticipo",
          "cuota_avance",
          "cuota_final",
          "otro",
        ],
        categoriaNueva: "otro",
      };
    case "compra_material":
      return {
        tipo: "egreso",
        categoriasMatch: ["material", "subcontrato", "otro"],
        categoriaNueva: "material",
      };
    case "pago_proveedor":
      return {
        tipo: "egreso",
        categoriasMatch: ["subcontrato", "material", "otro"],
        categoriaNueva: "subcontrato",
      };
    case "pago_mano_obra":
      return {
        tipo: "egreso",
        categoriasMatch: ["mano_de_obra", "otro"],
        categoriaNueva: "mano_de_obra",
      };
    case "otro":
    default:
      return {
        tipo: "egreso",
        categoriasMatch: ["otro", "material", "mano_de_obra", "subcontrato"],
        categoriaNueva: "otro",
      };
  }
}

export function estadoDesdeTipo(tipo: CashflowTipo): "cobrado" | "pagado" {
  return tipo === "ingreso" ? "cobrado" : "pagado";
}

export function montoLineaPresupuesto(
  cantidad: number,
  precioMaterial: number,
  precioMo: number,
  descuentoMaterialPct: number
): number {
  const q = Number(cantidad) || 0;
  const pm = Number(precioMaterial) || 0;
  const pmo = Number(precioMo) || 0;
  const rawDisc = Number(descuentoMaterialPct);
  const disc = Number.isFinite(rawDisc)
    ? Math.min(100, Math.max(0, rawDisc))
    : 0;
  const facMat = Math.max(0, 1 - disc / 100);
  return roundArs2(q * pm * facMat + q * pmo);
}
