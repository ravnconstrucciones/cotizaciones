import { describe, expect, it } from "vitest";
import {
  armarSuscripcionesIa,
  arsDeFijo,
  ratioSuscripcionApi,
  resumirApiUso,
  usdDeFijo,
  type FijoIaRow,
  type UsoApiRow,
} from "../ia-costos";

const BLUE = 1570;

function fijo(p: Partial<FijoIaRow> & { id: string; nombre: string }): FijoIaRow {
  return {
    moneda: "USD",
    monto_usd: null,
    monto_ars: 0,
    activo: true,
    categoria: "ia",
    ...p,
  };
}

/** El set real del 29/07: US$140/mes de abono. */
const SUSCRIPCIONES: FijoIaRow[] = [
  fijo({ id: "1", nombre: "Claude (Max 5x)", monto_usd: 100, monto_ars: 157000 }),
  fijo({ id: "2", nombre: "ChatGPT", monto_usd: 20, monto_ars: 31400 }),
  fijo({ id: "3", nombre: "Whisperflow", monto_usd: 15, monto_ars: 23550 }),
  fijo({ id: "4", nombre: "Railway (bot)", monto_usd: 5, monto_ars: 7850 }),
];

describe("arsDeFijo / usdDeFijo", () => {
  it("un fijo en USD flota al blue, no usa el snapshot en pesos", () => {
    const f = fijo({ id: "x", nombre: "Claude", monto_usd: 100, monto_ars: 157000 });
    expect(arsDeFijo(f, 2000)).toBe(200000); // no 157000: el snapshot no manda
    expect(usdDeFijo(f, 2000)).toBe(100);
  });

  it("un fijo en USD sin cotización no inventa pesos", () => {
    const f = fijo({ id: "x", nombre: "Claude", monto_usd: 100, monto_ars: 157000 });
    expect(arsDeFijo(f, null)).toBeNull();
    expect(usdDeFijo(f, null)).toBe(100);
  });

  it("un fijo en ARS conserva sus pesos y se convierte a USD con el blue", () => {
    const f = fijo({ id: "y", nombre: "Baulera", moneda: "ARS", monto_ars: 157000 });
    expect(arsDeFijo(f, BLUE)).toBe(157000);
    expect(usdDeFijo(f, BLUE)).toBeCloseTo(100, 6);
    expect(usdDeFijo(f, null)).toBeNull();
  });
});

describe("armarSuscripcionesIa", () => {
  it("suma los US$140 del mes y los pasa a pesos al blue", () => {
    const r = armarSuscripcionesIa(SUSCRIPCIONES, BLUE);
    expect(r.total_usd).toBe(140);
    expect(r.total_ars).toBe(140 * BLUE);
    expect(r.sin_cotizacion).toBe(0);
  });

  it("ordena por gasto, no por el orden de la tabla", () => {
    const r = armarSuscripcionesIa([...SUSCRIPCIONES].reverse(), BLUE);
    expect(r.items.map((i) => i.nombre)).toEqual([
      "Claude (Max 5x)",
      "ChatGPT",
      "Whisperflow",
      "Railway (bot)",
    ]);
  });

  it("deja afuera lo inactivo y lo que no es IA", () => {
    const r = armarSuscripcionesIa(
      [
        ...SUSCRIPCIONES,
        fijo({ id: "9", nombre: "Baulera", moneda: "ARS", monto_ars: 163000, categoria: null }),
        fijo({ id: "10", nombre: "Nous (dado de baja)", monto_usd: 30, activo: false }),
      ],
      BLUE
    );
    expect(r.items).toHaveLength(4);
    expect(r.total_usd).toBe(140);
  });

  it("sin cotización: los USD siguen, los pesos totales se declaran desconocidos", () => {
    const r = armarSuscripcionesIa(SUSCRIPCIONES, null);
    expect(r.total_usd).toBe(140);
    expect(r.total_ars).toBeNull();
    expect(r.sin_cotizacion).toBe(0); // nacen en USD: no hace falta convertirlos
  });

  it("un fijo en ARS sin cotización queda contado como hueco, no como cero", () => {
    const r = armarSuscripcionesIa(
      [fijo({ id: "z", nombre: "Algo en pesos", moneda: "ARS", monto_ars: 50000 })],
      null
    );
    expect(r.sin_cotizacion).toBe(1);
    expect(r.items[0].usd_mes).toBeNull();
  });

  it("sin suscripciones cargadas no inventa un total en pesos", () => {
    const r = armarSuscripcionesIa([], BLUE);
    expect(r.total_usd).toBe(0);
    expect(r.total_ars).toBeNull();
  });
});

describe("resumirApiUso", () => {
  const fechaAR = (iso: string) => iso.slice(0, 10);
  const filas: UsoApiRow[] = [
    { creado_at: "2026-07-27", servicio: "clasificador", costo_usd: "0.05" },
    { creado_at: "2026-07-29", servicio: "clasificador", costo_usd: 0.1 },
    { creado_at: "2026-07-29", servicio: "asesor", costo_usd: 0.065 },
    { creado_at: "2026-07-29", servicio: null, costo_usd: null },
  ];

  it("separa el mes de hoy y desglosa por servicio", () => {
    const r = resumirApiUso(filas, "2026-07-29", fechaAR);
    expect(r.mes_usd).toBeCloseTo(0.215, 6);
    expect(r.mes_llamadas).toBe(4);
    expect(r.hoy_usd).toBeCloseTo(0.165, 6);
    expect(r.hoy_llamadas).toBe(3);
    expect(r.por_servicio[0].servicio).toBe("clasificador");
    expect(r.por_servicio[0].llamadas).toBe(2);
    expect(r.por_servicio[0].usd).toBeCloseTo(0.15, 6);
    expect(r.por_servicio.map((s) => s.servicio)).toContain("otro");
  });

  it("un mes sin llamadas da cero, no NaN", () => {
    const r = resumirApiUso([], "2026-07-29", fechaAR);
    expect(r).toMatchObject({ mes_usd: 0, mes_llamadas: 0, hoy_usd: 0, hoy_llamadas: 0 });
    expect(r.por_servicio).toEqual([]);
  });
});

describe("ratioSuscripcionApi", () => {
  it("dice cuántas veces el abono pesa lo que el uso real", () => {
    expect(ratioSuscripcionApi(140, 0.215)).toBeCloseTo(651.16, 2);
  });

  it("sin gasto de API devuelve null en vez de dividir por cero", () => {
    expect(ratioSuscripcionApi(140, 0)).toBeNull();
  });
});
