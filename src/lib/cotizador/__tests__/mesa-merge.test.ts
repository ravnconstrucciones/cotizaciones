import { describe, expect, it } from "vitest";
import {
  ajustesDelPase,
  fechadoDePrecioCerrado,
  fusionarAjusteItem,
  hoyIso,
  validarManual,
  esError,
  FUENTE_EZE,
  type ManualEntrante,
  type PrecioCerrado,
} from "../mesa-merge";
import type { AjusteItem, Desglose, ItemDesglose, ItemManualMesa } from "../tipos";

function item(nombre: string, precios: ItemDesglose["precios"] = {}): ItemDesglose {
  return {
    nombre,
    etapa: "Preparación",
    tipo: "material",
    unidad: "u",
    formula: "1",
    cantidad_base: 1,
    desperdicio_pct: 0,
    cantidad: 1,
    precios,
    precio_min: null,
    precio_max: null,
    subtotal_min: 0,
    subtotal_max: 0,
    divergencia_pct: null,
    sin_precio: true,
  };
}

function desgloseCon(items: ItemDesglose[], ajustes?: Desglose["ajustes"]): Desglose {
  return {
    receta_nombre: "prueba",
    receta_version: 1,
    parametros: {},
    items,
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
      imprevistos_pct: 10,
      factor_zona_min: 1,
      factor_zona_max: 1,
      total_min: 0,
      total_max: 0,
    },
    tiempo: { dias_min: 1, dias_max: 2, cuadrilla_max: 2 },
    generado_at: "2026-08-16T00:00:00.000Z",
    ...(ajustes ? { ajustes } : {}),
  };
}

const MANUAL_OK: ManualEntrante = {
  nombre: "Volquete extra",
  rubro: "extras",
  tipo: "material",
  unidad: "u",
  cantidad: 2,
  precio: 90_000,
};

describe("validarManual", () => {
  it("normaliza el nombre y fecha el precio como número propio de Eze", () => {
    const r = validarManual({ ...MANUAL_OK, nombre: "  Volquete extra  " }, () => false);
    if (esError(r)) throw new Error(r.error);
    expect(r.nombre).toBe("Volquete extra");
    expect(r.precio).toEqual({ valor: 90_000, fuente: FUENTE_EZE, fecha: hoyIso() });
  });

  it("acepta un ítem sin precio (queda como hueco visible, ley 1)", () => {
    const { precio, ...sinPrecio } = MANUAL_OK;
    void precio;
    const r = validarManual(sinPrecio, () => false);
    if (esError(r)) throw new Error(r.error);
    expect(r.precio).toBeUndefined();
  });

  it("rechaza rubro, tipo, unidad y cantidad inválidos, nombrando el ítem", () => {
    expect(esError(validarManual({ ...MANUAL_OK, rubro: "inexistente" }, () => false))).toBe(true);
    const tipoMalo = validarManual(
      { ...MANUAL_OK, tipo: "otro" as ManualEntrante["tipo"] },
      () => false
    );
    expect(esError(tipoMalo) && tipoMalo.error).toContain("Volquete extra");
    expect(
      esError(validarManual({ ...MANUAL_OK, unidad: "docena" as ManualEntrante["unidad"] }, () => false))
    ).toBe(true);
    expect(esError(validarManual({ ...MANUAL_OK, cantidad: 0 }, () => false))).toBe(true);
    expect(esError(validarManual({ ...MANUAL_OK, precio: -5 }, () => false))).toBe(true);
  });

  it("rechaza un nombre ya usado", () => {
    expect(esError(validarManual(MANUAL_OK, () => true))).toBe(true);
  });
});

describe("fechadoDePrecioCerrado", () => {
  it("el número propio de Eze se fecha hoy y se atribuye a la mesa", () => {
    const r = fechadoDePrecioCerrado({ nombre: "Pintura", valor: 50_000, origen: "eze" }, undefined);
    expect(r).toEqual({ valor: 50_000, fuente: FUENTE_EZE, fecha: hoyIso() });
  });

  it("un precio de fuente CONSERVA su fuente y su fecha — el vencimiento sigue midiendo la antigüedad real", () => {
    const persistido = item("Pintura", {
      sismat: { valor: 48_000, fuente: "SISMAT", fecha: "2026-07-02" },
    });
    const r = fechadoDePrecioCerrado(
      { nombre: "Pintura", valor: 48_000, origen: "sismat" },
      persistido
    );
    expect(r).toEqual({ valor: 48_000, fuente: "SISMAT", fecha: "2026-07-02" });
  });

  it("sin fuente persistida cae a una etiqueta del origen, nunca a FUENTE_EZE", () => {
    const r = fechadoDePrecioCerrado(
      { nombre: "Pintura", valor: 48_000, origen: "internet" },
      undefined
    );
    expect(r.fuente).toBe("INTERNET");
    expect(r.fuente).not.toBe(FUENTE_EZE);
  });
});

describe("fusionarAjusteItem (hoja viva, incremental)", () => {
  const base: AjusteItem[] = [{ nombre: "Pintura", cantidad: 3 }];

  it("suma el precio sin perder la cantidad previa", () => {
    const r = fusionarAjusteItem(base, { nombre: "Pintura", precio: 51_000 });
    expect(r).toHaveLength(1);
    expect(r[0].cantidad).toBe(3);
    expect(r[0].precio_eze?.valor).toBe(51_000);
  });

  it("null limpia el override y saca el ajuste cuando queda vacío", () => {
    const conPrecio = fusionarAjusteItem([{ nombre: "Pintura" }], {
      nombre: "Pintura",
      precio: 51_000,
    });
    expect(fusionarAjusteItem(conPrecio, { nombre: "Pintura", precio: null })).toEqual([]);
  });

  it("activo:false se conserva; activo:true lo limpia", () => {
    const fuera = fusionarAjusteItem([], { nombre: "Pintura", activo: false });
    expect(fuera[0].activo).toBe(false);
    expect(fusionarAjusteItem(fuera, { nombre: "Pintura", activo: true })).toEqual([]);
  });
});

describe("ajustesDelPase (el taller manda)", () => {
  const desglose = desgloseCon([
    item("Pintura", { sismat: { valor: 48_000, fuente: "SISMAT", fecha: "2026-07-02" } }),
    item("Fijador"),
  ]);

  const cerrados: PrecioCerrado[] = [
    { nombre: "Pintura", valor: 48_000, origen: "sismat" },
    { nombre: "Fijador", valor: 12_000, origen: "eze" },
  ];

  const manual: ItemManualMesa = {
    nombre: "Volquete extra",
    rubro: "extras",
    tipo: "material",
    unidad: "u",
    cantidad: 2,
  };

  it("reemplaza manuales y precios con lo que trae el taller", () => {
    const r = ajustesDelPase(desglose, undefined, [manual], cerrados);
    expect(r.manuales).toEqual([manual]);
    expect(r.items).toHaveLength(2);
    expect(r.items?.find((i) => i.nombre === "Pintura")?.precio_eze?.fuente).toBe("SISMAT");
    expect(r.items?.find((i) => i.nombre === "Fijador")?.precio_eze?.fuente).toBe(FUENTE_EZE);
  });

  it("es idempotente: pasar dos veces lo mismo da lo mismo", () => {
    const primero = ajustesDelPase(desglose, undefined, [manual], cerrados);
    const segundo = ajustesDelPase(desglose, primero, [manual], cerrados);
    expect(segundo).toEqual(primero);
  });

  it("lo que se sacó del taller desaparece de la cotización", () => {
    const previos = ajustesDelPase(desglose, undefined, [manual], cerrados);
    const vaciado = ajustesDelPase(desglose, previos, [], []);
    expect(vaciado.manuales).toEqual([]);
    expect(vaciado.items).toEqual([]);
  });

  it("NO pisa cantidad ni activo — eso es de la mesa de revisión, no del laboratorio", () => {
    const previos = {
      items: [
        { nombre: "Pintura", cantidad: 7 },
        { nombre: "Fijador", activo: false },
      ],
      manuales: [],
    };
    const r = ajustesDelPase(desglose, previos, [], []);
    expect(r.items).toEqual(
      expect.arrayContaining([
        { nombre: "Pintura", cantidad: 7 },
        { nombre: "Fijador", activo: false },
      ])
    );
  });

  it("un precio cerrado convive con la cantidad que ya había en la mesa", () => {
    const previos = { items: [{ nombre: "Pintura", cantidad: 7 }], manuales: [] };
    const r = ajustesDelPase(desglose, previos, [], [cerrados[0]]);
    const pintura = r.items?.find((i) => i.nombre === "Pintura");
    expect(pintura?.cantidad).toBe(7);
    expect(pintura?.precio_eze?.valor).toBe(48_000);
  });
});
