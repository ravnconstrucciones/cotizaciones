import { roundArs2 } from "@/lib/format-currency";

/**
 * Sistema de plata RAVN — cálculo puro de la salud del negocio.
 *
 * Toma las obras del /cashflow/resumen (que ya trae cerrado, cobrado, gastado,
 * por cobrar y margen por obra) + la config (patrimonio, sueldo, alícuota) y
 * deriva: salud global, números obra-por-obra y el reparto de la plata
 * (qué es de la empresa y qué es de Eze). El código suma; la IA no.
 */

export type ObraResumen = {
  obra_id: string;
  presupuesto_id: string;
  nombre_obra: string;
  nombre_cliente?: string | null;
  ingresos_caja: number;
  egresos_caja: number;
  referencia_propuesta_ars: number | null;
  saldo_por_cobrar_ars: number | null;
  monto_total_a_cobrar_ars?: number | null;
  margen_al_dia_ars: number | null;
  // Costo total estimado del presupuesto (costo directo + costos internos +
  // cargos adicionales), en ARS y ya valuado al blue del día si la obra es USD.
  // null = sin rentabilidad cargada (no se inventa un costo).
  costo_total_estimado_ars: number | null;
  cobranza_cerrada?: boolean;
  finalizada: boolean;
};

export type ObraCalc = {
  obraId: string;
  presupuestoId: string;
  nombre: string;
  cliente: string | null;
  cerrado: number | null; // lo que cerré (contrato)
  cobrado: number; // lo que cobré hasta ahora
  gastado: number; // lo que llevo gastado (libreta + gastos obra)
  porCobrar: number | null; // lo que queda por cobrar
  costoEstimado: number | null; // costo total estimado del presupuesto (ARS); null = sin rentabilidad cargada
  redito: number | null; // cerrado − costoEstimado (rédito proyectado); null si falta costo o cerrado
  reditoPct: number | null; // redito / cerrado
  finalizada: boolean;
};

export type ConfigNegocio = {
  patrimonio_neto_inicial_ars: number;
  patrimonio_neto_inicial_usd: number; // caja en dólares, NO se convierte a pesos
  fecha_patrimonio: string | null;
  sueldo_mensual_objetivo_ars: number;
  costos_fijos_mensuales_ars: number; // monotributo + contador, salen sí o sí
  comprometido_obras_ars: number; // lo que falta gastar para terminar obras en curso
  colchon_meses_sueldo: number;
  configurado: boolean;
};

export type RetirosResumen = {
  mes: string;
  retirado_mes: number;
  aportado_mes: number;
  neto_mes: number;
  retirado_total: number;
  aportado_total: number;
  neto_total: number;
};

export type Semaforo = "verde" | "amarillo" | "rojo";

/** Lo que cerré: propuesta comercial, o el snapshot de cobranza como fallback. */
export function cerradoDe(o: ObraResumen): number | null {
  if (o.referencia_propuesta_ars != null && o.referencia_propuesta_ars > 0) {
    return roundArs2(o.referencia_propuesta_ars);
  }
  if (o.monto_total_a_cobrar_ars != null && o.monto_total_a_cobrar_ars > 0) {
    return roundArs2(o.monto_total_a_cobrar_ars);
  }
  return null;
}

/**
 * Obra cerrada en DÓLARES: valúa contrato y cobrado al blue venta del día.
 *
 * Eze cobra adelantos en USD billete; esa plata vive en la caja en dólares y
 * FLOTA con la cotización — no se congela en pesos. El tablero la muestra
 * valuada al blue del día. `cobradoArs` cubre el caso mixto (parte en pesos).
 */
export function valuarObraUsd(args: {
  contratoUsd: number;
  cobradoUsd: number;
  cobradoArs: number;
  blue: number;
}): { cerradoArs: number; cobradoArs: number; porCobrarArs: number } {
  const cerradoArs = roundArs2(args.contratoUsd * args.blue);
  const cobradoArs = roundArs2(args.cobradoUsd * args.blue + args.cobradoArs);
  const porCobrarArs =
    cerradoArs > 0 ? roundArs2(Math.max(0, cerradoArs - cobradoArs)) : 0;
  return { cerradoArs, cobradoArs, porCobrarArs };
}

/**
 * Costo total estimado de una obra, en ARS, coherente con cómo se valúa el
 * contrato ("cerrado").
 *
 * El costo del presupuesto (costo directo + costos internos + cargos
 * adicionales) se carga SIEMPRE en pesos nominales: así lo guarda Rentabilidad,
 * `monedaPresentacion` solo cambia cómo se MUESTRA el precio al cliente, no la
 * moneda de los costos.
 *
 *  - Obra en pesos: el costo nominal ya está en la misma moneda que el cerrado.
 *  - Obra en dólares: el cerrado FLOTA al blue del día (`valuarObraUsd`). Para
 *    que el margen proyectado sea el que Eze fijó al vender en dólares (y no se
 *    infle solo porque subió el blue), el costo se pasa a USD a la cotización a
 *    la que se dolarizó la obra y se re-valúa al MISMO blue que el contrato.
 *    Así numerador y denominador del margen flotan juntos → margen estable.
 *
 * Devuelve null cuando no hay un costo usable (sin costo cargado, o obra USD sin
 * cotización/blue para floatear): "sin costo estimado", nunca un número inventado.
 */
export function costoEstimadoArs(args: {
  costoNominalArs: number;
  esUsd: boolean;
  cotizacionPricingArsPorUsd: number | null;
  blue: number | null;
}): number | null {
  if (!(args.costoNominalArs > 0)) return null;
  if (!args.esUsd) return roundArs2(args.costoNominalArs);
  if (
    !(args.cotizacionPricingArsPorUsd && args.cotizacionPricingArsPorUsd > 0)
  ) {
    return null;
  }
  if (!(args.blue && args.blue > 0)) return null;
  const costoUsd = args.costoNominalArs / args.cotizacionPricingArsPorUsd;
  return roundArs2(costoUsd * args.blue);
}

export function calcularObra(o: ObraResumen): ObraCalc {
  const cerrado = cerradoDe(o);
  const cobrado = roundArs2(o.ingresos_caja);
  const gastado = roundArs2(o.egresos_caja);
  let porCobrar = o.saldo_por_cobrar_ars;
  if (porCobrar == null && cerrado != null) {
    porCobrar = roundArs2(Math.max(0, cerrado - cobrado));
  }
  // Rédito PROYECTADO real = lo cerrado − el costo total estimado del
  // presupuesto (no el gastado corriente, que arranca inflado y miente). Sin
  // costo estimado cargado no hay rédito que medir → null = "sin costo estimado".
  const costoEstimado = o.costo_total_estimado_ars ?? null;
  const redito =
    cerrado != null && costoEstimado != null
      ? roundArs2(cerrado - costoEstimado)
      : null;
  const reditoPct =
    cerrado != null && cerrado > 0 && redito != null ? redito / cerrado : null;
  return {
    obraId: o.obra_id,
    presupuestoId: o.presupuesto_id,
    nombre: o.nombre_obra,
    cliente: o.nombre_cliente ?? null,
    cerrado,
    cobrado,
    gastado,
    porCobrar: porCobrar ?? null,
    costoEstimado,
    redito,
    reditoPct,
    finalizada: o.finalizada,
  };
}

export type SaludNegocio = {
  activas: ObraCalc[];
  finalizadas: ObraCalc[];
  // Totales obras activas
  carteraActiva: number; // suma de lo cerrado en obras activas
  cobradoActivas: number;
  gastadoActivas: number;
  porCobrarTotal: number; // toda la plata por cobrar (activas + finalizadas)
  reditoProyectado: number; // rédito proyectado de obras activas (cerrado − costo estimado)
  margenPromedio: number | null; // reditoProyectado / cartera de las obras con costo estimado
  // Realizado
  reditoRealizado: number; // rédito de obras finalizadas
  // Salud
  semaforo: Semaforo;
  motivo: string;
};

export function calcularSalud(obras: ObraResumen[]): SaludNegocio {
  const calc = obras.map(calcularObra);
  const activas = calc.filter((o) => !o.finalizada);
  const finalizadas = calc.filter((o) => o.finalizada);

  const sum = (arr: number[]) => roundArs2(arr.reduce((a, b) => a + b, 0));

  const carteraActiva = sum(
    activas.map((o) => o.cerrado ?? 0)
  );
  const cobradoActivas = sum(activas.map((o) => o.cobrado));
  const gastadoActivas = sum(activas.map((o) => o.gastado));
  const porCobrarTotal = sum(calc.map((o) => o.porCobrar ?? 0));
  const reditoProyectado = sum(activas.map((o) => o.redito ?? 0));
  const reditoRealizado = sum(finalizadas.map((o) => o.redito ?? 0));
  // Margen agregado SOLO sobre las obras con costo estimado cargado (las que
  // tienen rédito medible). Si numerador y denominador no salen del mismo set,
  // el margen se diluye y vuelve a mentir. Sin ninguna obra con costo → null.
  const carteraConRedito = sum(
    activas.filter((o) => o.redito != null).map((o) => o.cerrado ?? 0)
  );
  const margenPromedio =
    carteraConRedito > 0 ? reditoProyectado / carteraConRedito : null;

  // Sobregiro real: lo gastado supera el costo total estimado de la obra (no se
  // compara contra el contrato, sino contra lo que la obra debería costar).
  const hayObraEnRojo = activas.some(
    (o) => o.costoEstimado != null && o.gastado > o.costoEstimado
  );
  let semaforo: Semaforo = "verde";
  let motivo = "Cartera sana: margen y cobranza en orden.";
  if (hayObraEnRojo) {
    semaforo = "rojo";
    motivo = "Hay una obra gastando más que su costo estimado — revisá.";
  } else if (margenPromedio == null) {
    semaforo = "amarillo";
    motivo = "Cargá la rentabilidad de las obras para medir el rédito proyectado.";
  } else if (margenPromedio < 0.1) {
    semaforo = "rojo";
    motivo = "Margen de la cartera por debajo del 10%.";
  } else if (margenPromedio < 0.2) {
    semaforo = "amarillo";
    motivo = "Margen ajustado (10–20%) — cuidá los costos.";
  }

  return {
    activas,
    finalizadas,
    carteraActiva,
    cobradoActivas,
    gastadoActivas,
    porCobrarTotal,
    reditoProyectado,
    margenPromedio,
    reditoRealizado,
    semaforo,
    motivo,
  };
}

export type CajaLibre = {
  patrimonioPesos: number; // liquidez personal en pesos (efectivo + Balanz)
  cajaObras: number; // plata de obra ya cobrada que todavía no retiraste
  cajaReal: number; // patrimonio + caja de obras = lo que tenés a mano hoy
  comprometidoObras: number; // plata de obra que falta gastar (NO es de Eze)
  costosFijosMes: number; // monotributo + contador del mes
  cajaLibre: number; // lo que Eze puede mover sin quedar corto — el freno
  proyectadoCobrar: number; // plata por cobrar de clientes (viene, NO disponible)
};

/**
 * El freno del "no me paso": qué plata REAL de Eze es libre para mover.
 *
 * La liquidez real de Eze NO es el saldo de obras suelto: es su patrimonio
 * líquido en pesos (efectivo + Balanz) MÁS lo que ya cobró de obras y todavía
 * no se retiró (el saldo de caja de obras). Sobre esa caja real se descuenta
 * lo que falta gastar para terminar las obras en curso (comprometido — es plata
 * del cliente, no ganancia) y los costos fijos del mes (monotributo + contador).
 * Lo que queda es lo que Eze puede mover sin dejar una obra sin terminar.
 *
 * NO se reserva colchón de sueldo: el sueldo ya se trackea aparte por los
 * retiros del mes, reservarlo de nuevo lo contaría doble.
 *
 * El "proyectado a cobrar" (por cobrar de clientes) se devuelve aparte: es
 * plata que viene, pero todavía no está, así que NO entra en la caja libre.
 *
 * `cajaObras` = saldo de caja de obras (ingresos cobrados − egresos pagados;
 * puede ser negativo si una obra se ejecutó sobre un adelanto ya gastado).
 */
export function calcularCajaLibre(
  cfg: ConfigNegocio,
  cajaObras: number,
  proyectadoCobrar: number
): CajaLibre {
  const patrimonioPesos = roundArs2(Math.max(0, cfg.patrimonio_neto_inicial_ars));
  const cajaObrasR = roundArs2(cajaObras);
  const cajaReal = roundArs2(patrimonioPesos + cajaObrasR);
  const comprometidoObras = roundArs2(Math.max(0, cfg.comprometido_obras_ars));
  const costosFijosMes = roundArs2(Math.max(0, cfg.costos_fijos_mensuales_ars));
  const cajaLibre = roundArs2(cajaReal - comprometidoObras - costosFijosMes);
  return {
    patrimonioPesos,
    cajaObras: cajaObrasR,
    cajaReal,
    comprometidoObras,
    costosFijosMes,
    cajaLibre,
    proyectadoCobrar: roundArs2(Math.max(0, proyectadoCobrar)),
  };
}
