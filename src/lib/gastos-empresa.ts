/**
 * GASTOS DE EMPRESA — motor puro del calendario de /empresa.
 *
 * Los gastos del NEGOCIO que no son de una obra de cliente (tabla
 * gastos_empresa): costo fijo, variable, herramientas, indumentaria.
 * Acá se agrupa por día del mes y por categoría canónica; la página solo
 * dibuja. El USD se cuenta aparte y nunca ensucia el total en pesos
 * (misma regla que el resto del sistema: dos cajas).
 *
 * El bot espeja normalizarCategoriaEmpresa en ravn-bots/src/categoriasEmpresa.js
 * — si cambia acá, cambiarlo allá.
 */

export const CATEGORIAS_EMPRESA = [
  "Fijo",
  "Variable",
  "Herramientas",
  "Indumentaria",
] as const;

export type CategoriaEmpresa = (typeof CATEGORIAS_EMPRESA)[number];

export type GastoEmpresaRow = {
  id: string;
  fecha: string; // YYYY-MM-DD
  concepto: string;
  monto: number | string;
  moneda: string | null;
  categoria: string | null;
};

export type GastoDia = {
  id: string;
  concepto: string;
  monto: number;
  moneda: "ARS" | "USD";
  categoria: CategoriaEmpresa;
};

export type DiaEmpresa = {
  fecha: string;
  total_ars: number;
  total_usd: number;
  gastos: GastoDia[];
};

export type CategoriaResumen = {
  categoria: CategoriaEmpresa;
  total_ars: number;
  total_usd: number;
  cantidad: number;
};

export type MesEmpresa = {
  mes: string; // YYYY-MM
  dias: DiaEmpresa[];
  total_ars: number;
  total_usd: number;
  cantidad: number;
  por_categoria: CategoriaResumen[];
};

const sinTildes = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Lleva cualquier categoría cruda (las 4 canónicas, las viejas del bot como
 * "Software"/"Publicidad"/"Varios", o texto libre) a uno de los 4 buckets.
 * Lo que no se reconoce cae en Variable: el bucket de los gastos sueltos.
 */
export function normalizarCategoriaEmpresa(raw: string | null | undefined): CategoriaEmpresa {
  const t = sinTildes(String(raw ?? ""));
  if (/herramient/.test(t)) return "Herramientas";
  if (/indument|ropa|uniforme|calzado/.test(t)) return "Indumentaria";
  if (/fijo|software|suscri|abono|alquiler|seguro|contador|impuesto|monotribut|servicio/.test(t))
    return "Fijo";
  return "Variable";
}

function num(v: number | string): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Todos los días YYYY-MM-DD de un mes YYYY-MM (bisiestos incluidos). */
function diasDelMes(mes: string): string[] {
  const [anio, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio!, m!, 0)).getUTCDate();
  return Array.from({ length: ultimo }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
}

export function armarMesEmpresa(mes: string, rows: GastoEmpresaRow[]): MesEmpresa {
  const porDia = new Map<string, GastoDia[]>(diasDelMes(mes).map((f) => [f, []]));
  for (const r of rows) {
    const lista = porDia.get(r.fecha);
    if (!lista) continue; // otro mes
    lista.push({
      id: r.id,
      concepto: r.concepto,
      monto: num(r.monto),
      moneda: r.moneda === "USD" ? "USD" : "ARS",
      categoria: normalizarCategoriaEmpresa(r.categoria),
    });
  }

  const dias: DiaEmpresa[] = [...porDia.entries()].map(([fecha, gastos]) => ({
    fecha,
    total_ars: gastos.filter((g) => g.moneda === "ARS").reduce((s, g) => s + g.monto, 0),
    total_usd: gastos.filter((g) => g.moneda === "USD").reduce((s, g) => s + g.monto, 0),
    gastos,
  }));

  const todos = dias.flatMap((d) => d.gastos);
  const por_categoria: CategoriaResumen[] = CATEGORIAS_EMPRESA.map((categoria) => {
    const propios = todos.filter((g) => g.categoria === categoria);
    return {
      categoria,
      total_ars: propios.filter((g) => g.moneda === "ARS").reduce((s, g) => s + g.monto, 0),
      total_usd: propios.filter((g) => g.moneda === "USD").reduce((s, g) => s + g.monto, 0),
      cantidad: propios.length,
    };
  });

  return {
    mes,
    dias,
    total_ars: dias.reduce((s, d) => s + d.total_ars, 0),
    total_usd: dias.reduce((s, d) => s + d.total_usd, 0),
    cantidad: todos.length,
    por_categoria,
  };
}
