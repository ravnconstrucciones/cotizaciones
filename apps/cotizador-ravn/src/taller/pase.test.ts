import { describe, expect, it } from "vitest";
import { construirPase, type RubroDelExpediente } from "./pase";
import type { ManualItem, PostulanteMO, TallerState } from "./types";

const RUBROS: RubroDelExpediente[] = [
  { id: "batch:0:Preparaci%C3%B3n", etapa: "Preparación", itemNames: ["Pintura látex", "Fijador"] },
  { id: "batch:1:Instalaci%C3%B3n", etapa: "Instalación sanitaria", itemNames: ["Caño PPR"] },
];

function manual(over: Partial<ManualItem> = {}): ManualItem {
  return {
    id: "m1",
    batchId: "batch:0:Preparaci%C3%B3n",
    name: "Volquete extra",
    tipo: "material",
    cantidad: 2,
    unidad: "u",
    precioUnit: 90_000,
    ...over,
  };
}

function taller(over: Partial<TallerState> = {}): TallerState {
  return { manual: [], decided: {}, postulantes: [], ...over };
}

function postulante(over: Partial<PostulanteMO> = {}): PostulanteMO {
  return {
    id: "p1",
    batchId: "batch:0:Preparaci%C3%B3n",
    itemName: "Fijador",
    proveedor: "Fran",
    precioUnit: 44_000,
    fecha: "2026-08-14",
    procedencia: "presupuesto por WhatsApp",
    elegido: true,
    ...over,
  };
}

describe("construirPase — mano de obra con postulantes", () => {
  it("el elegido viaja como precio cerrado del ítem, con el nombre del proveedor", () => {
    const { payload, descartados } = construirPase({
      rubros: RUBROS,
      taller: taller({ postulantes: [postulante()] }),
      precioPropuesta: null,
    });

    expect(descartados).toEqual([]);
    expect(payload.preciosCerrados).toEqual([
      {
        nombre: "Fijador",
        valor: 44_000,
        origen: "eze",
        fuente: "Fran — presupuesto por WhatsApp",
      },
    ]);
  });

  it("sin procedencia viaja sólo el nombre del proveedor", () => {
    const { payload } = construirPase({
      rubros: RUBROS,
      taller: taller({ postulantes: [postulante({ procedencia: null })] }),
      precioPropuesta: null,
    });
    expect(payload.preciosCerrados[0].fuente).toBe("Fran");
  });

  it("los descartados se quedan en el taller: sólo viaja el elegido", () => {
    const { payload } = construirPase({
      rubros: RUBROS,
      taller: taller({
        postulantes: [
          postulante({ id: "p2", proveedor: "Pacheco", precioUnit: 38_000, elegido: false }),
          postulante(),
        ],
      }),
      precioPropuesta: null,
    });
    expect(payload.preciosCerrados).toHaveLength(1);
    expect(payload.preciosCerrados[0].fuente).toContain("Fran");
  });

  it("el postulante elegido le gana a una decisión previa sobre el mismo ítem", () => {
    const { payload, descartados } = construirPase({
      rubros: RUBROS,
      taller: taller({
        postulantes: [postulante()],
        decided: {
          "batch:0:Preparaci%C3%B3n:Fijador": { origin: "sismat", value: 30_000, at: "2026-08-15" },
        },
      }),
      precioPropuesta: null,
    });

    expect(descartados).toEqual([]);
    expect(payload.preciosCerrados).toEqual([
      { nombre: "Fijador", valor: 44_000, origen: "eze", fuente: "Fran — presupuesto por WhatsApp" },
    ]);
  });

  it("descarta con motivo el elegido cuyo ítem ya no está en el expediente", () => {
    const { payload, descartados } = construirPase({
      rubros: RUBROS,
      taller: taller({ postulantes: [postulante({ itemName: "MO que se borró" })] }),
      precioPropuesta: null,
    });

    expect(payload.preciosCerrados).toEqual([]);
    expect(descartados).toEqual([
      { que: "MO Fran", motivo: 'el ítem "MO que se borró" ya no está en el expediente' },
    ]);
  });

  it("descarta con motivo el elegido cuyo rubro ya no existe", () => {
    const { descartados } = construirPase({
      rubros: RUBROS,
      taller: taller({ postulantes: [postulante({ batchId: "batch:9:Borrado" })] }),
      precioPropuesta: null,
    });
    expect(descartados).toEqual([
      { que: "MO Fran", motivo: "el rubro de ese postulante ya no existe en el expediente" },
    ]);
  });
});

describe("construirPase", () => {
  it("traduce el ítem a mano y le infiere el rubro con la función de App RAVN", () => {
    const { payload, descartados } = construirPase({
      rubros: RUBROS,
      taller: taller({ manual: [manual()] }),
      precioPropuesta: 3_150_000,
    });

    expect(descartados).toEqual([]);
    expect(payload.precioPropuesta).toBe(3_150_000);
    expect(payload.manuales).toEqual([
      { nombre: "Volquete extra", rubro: "obra", tipo: "material", unidad: "u", cantidad: 2, precio: 90_000 },
    ]);
  });

  it("un ítem a mano de mano de obra cae en el rubro mano_de_obra", () => {
    const { payload } = construirPase({
      rubros: RUBROS,
      taller: taller({ manual: [manual({ name: "Ayudante extra", tipo: "mano_de_obra" })] }),
      precioPropuesta: null,
    });
    expect(payload.manuales[0].rubro).toBe("mano_de_obra");
  });

  it("sin precio unitario el ítem viaja igual, como hueco visible", () => {
    const { payload } = construirPase({
      rubros: RUBROS,
      taller: taller({ manual: [manual({ precioUnit: 0 })] }),
      precioPropuesta: null,
    });
    expect(payload.manuales[0].precio).toBeUndefined();
  });

  it("traduce la decisión conservando el ORIGEN — sólo el número propio calibra", () => {
    const { payload } = construirPase({
      rubros: RUBROS,
      taller: taller({
        decided: {
          "batch:0:Preparaci%C3%B3n:Pintura látex": { origin: "sismat", value: 48_000, at: "2026-08-16" },
          "batch:1:Instalaci%C3%B3n:Caño PPR": { origin: "eze", value: 12_000, at: "2026-08-16" },
        },
      }),
      precioPropuesta: null,
    });

    expect(payload.preciosCerrados).toEqual(
      expect.arrayContaining([
        { nombre: "Pintura látex", valor: 48_000, origen: "sismat" },
        { nombre: "Caño PPR", valor: 12_000, origen: "eze" },
      ])
    );
  });

  it('"lo dejo cerrado igual" (sin número) no escribe nada y no se reporta como descarte', () => {
    const { payload, descartados } = construirPase({
      rubros: RUBROS,
      taller: taller({
        decided: { "batch:0:Preparaci%C3%B3n:Fijador": { origin: "eze", value: null, at: "2026-08-16" } },
      }),
      precioPropuesta: null,
    });
    expect(payload.preciosCerrados).toEqual([]);
    expect(descartados).toEqual([]);
  });

  it("descarta con motivo lo que ya no existe en el expediente — nunca en silencio", () => {
    const { payload, descartados } = construirPase({
      rubros: RUBROS,
      taller: taller({
        manual: [manual({ batchId: "batch:9:Rubro%20borrado" })],
        decided: {
          "batch:0:Preparaci%C3%B3n:Ítem borrado": { origin: "sismat", value: 1_000, at: "2026-08-16" },
        },
      }),
      precioPropuesta: null,
    });

    expect(payload.manuales).toEqual([]);
    expect(payload.preciosCerrados).toEqual([]);
    expect(descartados).toHaveLength(2);
    expect(descartados[0].motivo).toContain("rubro");
    expect(descartados[1].que).toBe("Ítem borrado");
  });

  it("descarta unidades y orígenes que App RAVN no conoce", () => {
    const { payload, descartados } = construirPase({
      rubros: RUBROS,
      taller: taller({
        manual: [manual({ unidad: "docena" })],
        decided: {
          "batch:0:Preparaci%C3%B3n:Fijador": { origin: "inventado", value: 900, at: "2026-08-16" },
        },
      }),
      precioPropuesta: null,
    });

    expect(payload.manuales).toEqual([]);
    expect(payload.preciosCerrados).toEqual([]);
    expect(descartados.map((d) => d.motivo).join(" ")).toContain("docena");
    expect(descartados.map((d) => d.motivo).join(" ")).toContain("inventado");
  });

  it("un ítem a mano no puede pisar el nombre de un ítem de receta", () => {
    const { payload, descartados } = construirPase({
      rubros: RUBROS,
      taller: taller({ manual: [manual({ name: "Fijador" })] }),
      precioPropuesta: null,
    });
    expect(payload.manuales).toEqual([]);
    expect(descartados[0].motivo).toContain("ya hay un ítem");
  });

  it("el nombre del ítem sobrevive aunque tenga dos puntos adentro", () => {
    const rubros: RubroDelExpediente[] = [
      { id: "batch:0:Obra", etapa: "Obra", itemNames: ["Perfil C: 70mm"] },
    ];
    const { payload } = construirPase({
      rubros,
      taller: taller({
        decided: { "batch:0:Obra:Perfil C: 70mm": { origin: "internet", value: 8_400, at: "2026-08-16" } },
      }),
      precioPropuesta: null,
    });
    expect(payload.preciosCerrados[0].nombre).toBe("Perfil C: 70mm");
  });
});
