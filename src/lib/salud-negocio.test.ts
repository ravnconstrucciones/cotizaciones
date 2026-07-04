import { describe, it, expect } from "vitest";
import {
  calcularObra,
  calcularSalud,
  calcularCajaLibre,
  cajaEmpresaPesos,
  comprometidoDerivado,
  guitaTotal,
  costoEstimadoArs,
  valuarObraUsd,
  saldoPorCobrarUsd,
  type ObraResumen,
  type ConfigNegocio,
} from "./salud-negocio";

/**
 * Datos REALES tomados de la base (App RAVN, 25/06/2026) para validar que la
 * matemática de plata del tablero da lo que tiene que dar.
 */

// Baño Correa: cerrada en 2.9M, costo estimado del presupuesto 2.03M (margen
// proyectado 30%), cobró 1.2M, gastó 1.395.054,20. Activa.
const banoCorrea: ObraResumen = {
  obra_id: "correa",
  presupuesto_id: "p-correa",
  nombre_obra: "Baño Correa",
  ingresos_caja: 1_200_000,
  egresos_caja: 1_395_054.2,
  referencia_propuesta_ars: 2_900_000,
  saldo_por_cobrar_ars: 1_700_000, // resumen: 2.9M − 1.2M
  monto_total_a_cobrar_ars: null,
  margen_al_dia_ars: 1_504_945.8,
  costo_total_estimado_ars: 2_030_000,
  finalizada: false,
};

// Siding: cerrada 2.17M pero SIN rentabilidad cargada → costo estimado null
// ("sin costo estimado"). Sin arrancar. Activa.
const siding: ObraResumen = {
  obra_id: "siding",
  presupuesto_id: "p-siding",
  nombre_obra: "Siding de fibrocemento",
  ingresos_caja: 0,
  egresos_caja: 0,
  referencia_propuesta_ars: null,
  saldo_por_cobrar_ars: null,
  monto_total_a_cobrar_ars: 2_170_000,
  margen_al_dia_ars: null,
  costo_total_estimado_ars: null,
  finalizada: false,
};

// Daromy: cerrada 500k, costo estimado 350k (margen 30%), gastó 40.5k. Finalizada.
const daromy: ObraResumen = {
  obra_id: "daromy",
  presupuesto_id: "p-daromy",
  nombre_obra: "Diseño Daromy 172",
  ingresos_caja: 500_000,
  egresos_caja: 40_500,
  referencia_propuesta_ars: 500_000,
  saldo_por_cobrar_ars: 0,
  monto_total_a_cobrar_ars: null,
  margen_al_dia_ars: 459_500,
  costo_total_estimado_ars: 350_000,
  finalizada: true,
};

describe("calcularObra", () => {
  it("Baño Correa: rédito proyectado = cerrado − costo estimado (no el gastado)", () => {
    const c = calcularObra(banoCorrea);
    expect(c.cerrado).toBe(2_900_000);
    expect(c.cobrado).toBe(1_200_000);
    expect(c.gastado).toBe(1_395_054.2);
    expect(c.porCobrar).toBe(1_700_000);
    expect(c.costoEstimado).toBe(2_030_000);
    // 2.9M − 2.03M = 870k, NO 1.5M (que era el viejo "rédito al día" inflado).
    expect(c.redito).toBe(870_000);
    expect(c.reditoPct).toBeCloseTo(0.3, 5); // 30%, el margen real de obra
  });

  it("Siding: sin rentabilidad cargada → rédito null (sin costo estimado), no un margen inventado", () => {
    const c = calcularObra(siding);
    expect(c.cerrado).toBe(2_170_000);
    expect(c.porCobrar).toBe(2_170_000); // 2.17M − 0 cobrado
    expect(c.costoEstimado).toBeNull();
    expect(c.redito).toBeNull(); // antes daba 2.17M (100% fantasma)
    expect(c.reditoPct).toBeNull();
  });
});

describe("calcularSalud", () => {
  it("agrega cartera, por cobrar, rédito proyectado y realizado", () => {
    const s = calcularSalud([banoCorrea, siding, daromy]);
    expect(s.activas).toHaveLength(2);
    expect(s.finalizadas).toHaveLength(1);
    // Cartera activa = 2.9M + 2.17M
    expect(s.carteraActiva).toBe(5_070_000);
    // Por cobrar total = 1.7M (Correa) + 2.17M (Siding) + 0 (Daromy)
    expect(s.porCobrarTotal).toBe(3_870_000);
    // Rédito proyectado activas = 870k (Correa) + 0 (Siding sin costo)
    expect(s.reditoProyectado).toBe(870_000);
    // Margen agregado SOLO sobre la obra con costo estimado (Correa): 870k / 2.9M
    expect(s.margenPromedio).toBeCloseTo(0.3, 5);
    // Rédito realizado (Daromy): 500k − 350k
    expect(s.reditoRealizado).toBe(150_000);
    // Margen sano (30%) → verde
    expect(s.semaforo).toBe("verde");
  });

  it("amarillo cuando ninguna obra activa tiene costo estimado cargado", () => {
    const s = calcularSalud([siding]);
    expect(s.margenPromedio).toBeNull();
    expect(s.reditoProyectado).toBe(0);
    expect(s.semaforo).toBe("amarillo");
  });

  it("marca rojo por sobregiro real: gastado supera el costo estimado", () => {
    const enRojo: ObraResumen = {
      ...daromy,
      obra_id: "rojo",
      finalizada: false,
      costo_total_estimado_ars: 500_000,
      egresos_caja: 700_000, // gastó 700k contra un costo estimado de 500k
      referencia_propuesta_ars: 900_000,
    };
    const s = calcularSalud([enRojo]);
    expect(s.semaforo).toBe("rojo");
  });
});

describe("costoEstimadoArs (moneda)", () => {
  it("obra en pesos: el costo nominal es el costo estimado, sin tocar", () => {
    expect(
      costoEstimadoArs({
        costoNominalArs: 2_030_000,
        esUsd: false,
        cotizacionPricingArsPorUsd: null,
        blue: 1520,
      })
    ).toBe(2_030_000);
  });

  it("costo no usable (≤ 0) → null, nunca margen 100%", () => {
    expect(
      costoEstimadoArs({
        costoNominalArs: 0,
        esUsd: false,
        cotizacionPricingArsPorUsd: null,
        blue: 1520,
      })
    ).toBeNull();
  });

  it("obra USD: floatea el costo al MISMO blue → margen razonable (~30%) y NO 91%", () => {
    // Obra dolarizada a 1400: costo nominal 7.84M = US$5.600. Contrato US$8.050.
    const costoNominalArs = 7_840_000;
    const cotiz = 1400;
    const contratoUsd = 8050;
    const blue = 1520;

    const cerradoArs = valuarObraUsd({
      contratoUsd,
      cobradoUsd: 0,
      cobradoArs: 0,
      blue,
    }).cerradoArs; // 8050 × 1520 = 12.236.000

    const costoArs = costoEstimadoArs({
      costoNominalArs,
      esUsd: true,
      cotizacionPricingArsPorUsd: cotiz,
      blue,
    });
    expect(costoArs).toBe(8_512_000); // 5.600 × 1520

    const redito = cerradoArs - costoArs!;
    const margen = redito / cerradoArs;
    expect(margen).toBeGreaterThan(0.25);
    expect(margen).toBeLessThan(0.35);
    expect(margen).toBeLessThan(0.5); // jamás el 91% viejo
  });

  it("obra USD: el margen es estable, no se infla cuando sube el blue", () => {
    const costoNominalArs = 7_840_000;
    const cotiz = 1400;
    const contratoUsd = 8050;

    const margenA = (() => {
      const cerrado = valuarObraUsd({ contratoUsd, cobradoUsd: 0, cobradoArs: 0, blue: 1520 }).cerradoArs;
      const costo = costoEstimadoArs({ costoNominalArs, esUsd: true, cotizacionPricingArsPorUsd: cotiz, blue: 1520 })!;
      return (cerrado - costo) / cerrado;
    })();
    const margenB = (() => {
      const cerrado = valuarObraUsd({ contratoUsd, cobradoUsd: 0, cobradoArs: 0, blue: 1800 }).cerradoArs;
      const costo = costoEstimadoArs({ costoNominalArs, esUsd: true, cotizacionPricingArsPorUsd: cotiz, blue: 1800 })!;
      return (cerrado - costo) / cerrado;
    })();
    // El blue saltó de 1520 a 1800 pero el margen proyectado no se mueve.
    expect(margenA).toBeCloseTo(margenB, 6);
  });

  it("obra USD sin cotización de dolarización → null (no se puede floatear)", () => {
    expect(
      costoEstimadoArs({
        costoNominalArs: 7_840_000,
        esUsd: true,
        cotizacionPricingArsPorUsd: null,
        blue: 1520,
      })
    ).toBeNull();
  });
});

describe("valuarObraUsd", () => {
  it("Pueyrredón: contrato USD 8.050, cobrado USD 3.220 @ blue 1520", () => {
    const v = valuarObraUsd({
      contratoUsd: 8050,
      cobradoUsd: 3220,
      cobradoArs: 0,
      blue: 1520,
    });
    expect(v.cerradoArs).toBe(12_236_000); // 8050 × 1520
    expect(v.cobradoArs).toBe(4_894_400); // 3220 × 1520
    expect(v.porCobrarArs).toBe(7_341_600); // (8050 − 3220) × 1520
  });

  it("flota con la cotización: el mismo contrato vale más si sube el blue", () => {
    const v = valuarObraUsd({
      contratoUsd: 8050,
      cobradoUsd: 3220,
      cobradoArs: 0,
      blue: 1600,
    });
    expect(v.cerradoArs).toBe(12_880_000); // 8050 × 1600
    expect(v.cobradoArs).toBe(5_152_000); // 3220 × 1600
    expect(v.porCobrarArs).toBe(7_728_000); // 4830 × 1600
  });
});

describe("saldoPorCobrarUsd", () => {
  // Caso real Pueyrredón (26/06/2026): anticipo 40% = USD 3.220, pero 1.000 se
  // cambiaron a pesos @ 1520 y entraron a caja como $1.520.000 (moneda ARS,
  // monto_usd = 1000). La deuda del cliente es en USD: quedan 4.830, no 5.830.
  it("descuenta el equivalente USD pactado de los cobros hechos en pesos", () => {
    expect(
      saldoPorCobrarUsd({
        contratoUsd: 8050,
        cobradoUsdBillete: 2220,
        equivUsdDeArs: 1000,
        arsSinEquiv: 0,
        blue: 1510,
      })
    ).toBe(4830);
  });

  it("pesos cobrados SIN equivalente pactado se pasan a USD al blue del día", () => {
    expect(
      saldoPorCobrarUsd({
        contratoUsd: 8050,
        cobradoUsdBillete: 2220,
        equivUsdDeArs: 0,
        arsSinEquiv: 1_510_000, // 1.000 USD al blue 1510
        blue: 1510,
      })
    ).toBe(4830);
  });

  it("no queda negativo si se cobró de más", () => {
    expect(
      saldoPorCobrarUsd({
        contratoUsd: 8050,
        cobradoUsdBillete: 9000,
        equivUsdDeArs: 0,
        arsSinEquiv: 0,
        blue: 1510,
      })
    ).toBe(0);
  });
});

describe("calcularCajaLibre", () => {
  // Config real de Eze (25/06/2026): sueldo 2.8M, fijos 103k (monotributo
  // 43k + contador 60k), comprometido 350k (lo que falta para terminar Correa).
  const cfg: ConfigNegocio = {
    patrimonio_neto_inicial_ars: 2_942_650,
    patrimonio_neto_inicial_usd: 140,
    fecha_patrimonio: "2026-06-25",
    sueldo_mensual_objetivo_ars: 2_800_000,
    costos_fijos_mensuales_ars: 103_000,
    comprometido_obras_ars: 350_000,
    colchon_meses_sueldo: 1,
    configurado: true,
  };

  it("caja real = patrimonio + caja de obras; libre = real − comprometido − fijos (sin colchón)", () => {
    // saldo de caja de obras 1.727.600, por cobrar 3.870.000
    const r = calcularCajaLibre(cfg, 1_727_600, 3_870_000);
    expect(r.patrimonioPesos).toBe(2_942_650);
    expect(r.cajaObras).toBe(1_727_600);
    // caja real = 2.942.650 + 1.727.600
    expect(r.cajaReal).toBe(4_670_250);
    expect(r.comprometidoObras).toBe(350_000);
    expect(r.costosFijosMes).toBe(103_000);
    // libre = 4.670.250 − 350k − 103k = 4.217.250
    expect(r.cajaLibre).toBe(4_217_250);
    // el proyectado a cobrar se reporta aparte, NO entra en la caja libre
    expect(r.proyectadoCobrar).toBe(3_870_000);
  });

  it("la caja de obras negativa (obra ejecutada sobre adelanto gastado) baja la caja real", () => {
    // gastó más de lo cobrado en obras: saldo de obras −500.000
    const r = calcularCajaLibre(cfg, -500_000, 0);
    // caja real = 2.942.650 − 500.000 = 2.442.650
    expect(r.cajaReal).toBe(2_442_650);
    // libre = 2.442.650 − 350k − 103k = 1.989.650
    expect(r.cajaLibre).toBe(1_989_650);
  });
});

describe("cajaEmpresaPesos", () => {
  it("descuenta los retiros netos del saldo de obras (la libreta no los ve)", () => {
    // cobró 10M, gastó 4M (saldo obras 6M), se retiró 3M → quedan 3M reales
    expect(cajaEmpresaPesos(6_000_000, 3_000_000)).toBe(3_000_000);
  });

  it("un aporte vuelve a entrar: neto negativo suma a la caja", () => {
    // retiró 1M pero aportó 1.5M → neto −500k → la caja crece 500k
    expect(cajaEmpresaPesos(2_000_000, -500_000)).toBe(2_500_000);
  });

  it("sin retiros registrados la caja es el saldo de obras crudo", () => {
    expect(cajaEmpresaPesos(1_727_600, 0)).toBe(1_727_600);
  });
});

describe("comprometidoDerivado", () => {
  it("suma costo estimado − gastado por obra activa, con piso en 0", () => {
    // Correa: 2.03M − 1.395.054,20 = 634.945,80 falta gastar.
    // Daromy finalizada: no compromete. Siding sin costo: no suma, se avisa.
    const r = comprometidoDerivado([banoCorrea, siding, daromy]);
    expect(r.total).toBe(634_945.8);
    expect(r.obrasSinCosto).toBe(1);
  });

  it("una obra sobregirada no 'libera' plata de las demás (piso 0 por obra)", () => {
    const sobregirada: ObraResumen = {
      ...banoCorrea,
      obra_id: "x",
      egresos_caja: 2_500_000, // gastó 470k más que su costo estimado de 2.03M
    };
    const sana: ObraResumen = { ...daromy, obra_id: "y", finalizada: false };
    // sana compromete 350k − 40.5k = 309.5k; la sobregirada aporta 0, no −470k
    const r = comprometidoDerivado([sobregirada, sana]);
    expect(r.total).toBe(309_500);
    expect(r.obrasSinCosto).toBe(0);
  });

  it("sin obras activas → 0 comprometido y 0 sin costo", () => {
    const r = comprometidoDerivado([daromy]);
    expect(r.total).toBe(0);
    expect(r.obrasSinCosto).toBe(0);
  });
});

describe("guitaTotal", () => {
  it("suma patrimonio pesos + caja empresa (obras − retiros) + USD al blue", () => {
    // personal 2.942.650 + (obras 1.727.600 − retiro 500k) + US$ 3.220 @ 1520
    const r = guitaTotal({
      patrimonioArs: 2_942_650,
      saldoCajaObras: 1_727_600,
      retirosNetoTotal: 500_000,
      usd: 3_220,
      blue: 1_520,
    });
    expect(r.cajaEmpresaArs).toBe(1_227_600);
    expect(r.usdEnArs).toBe(4_894_400);
    expect(r.totalArs).toBe(9_064_650);
  });

  it("hay dólares pero no hay blue → total null, los USD nunca se congelan", () => {
    const r = guitaTotal({
      patrimonioArs: 1_000_000,
      saldoCajaObras: 0,
      retirosNetoTotal: 0,
      usd: 100,
      blue: null,
    });
    expect(r.usdEnArs).toBeNull();
    expect(r.totalArs).toBeNull();
  });

  it("sin dólares no hace falta blue: el total es solo pesos", () => {
    const r = guitaTotal({
      patrimonioArs: 1_000_000,
      saldoCajaObras: 250_000,
      retirosNetoTotal: 0,
      usd: 0,
      blue: null,
    });
    expect(r.usdEnArs).toBe(0);
    expect(r.totalArs).toBe(1_250_000);
  });
});
