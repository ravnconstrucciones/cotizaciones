import { describe, it, expect } from "vitest";
import {
  diasEntre,
  precioVencido,
  avisosVencidos,
  VENCIMIENTO_DIAS,
  VENCIMIENTO_EZE_DIAS,
} from "../vencimiento";
import type { ExtraDesglose, ItemDesglose } from "../tipos";

const HOY = "2026-06-12";

describe("diasEntre", () => {
  it("cuenta días de calendario", () => {
    expect(diasEntre("2026-06-01", HOY)).toBe(11);
    expect(diasEntre(HOY, HOY)).toBe(0);
  });
});

describe("precioVencido", () => {
  it("material vence a los 15 días, MO a los 30", () => {
    const p = (fecha: string) => ({ valor: 100, fuente: "x", fecha });
    expect(precioVencido(p("2026-05-29"), "material", HOY)).toBe(false); // 14 días
    expect(precioVencido(p("2026-05-27"), "material", HOY)).toBe(true); // 16 días
    expect(precioVencido(p("2026-05-27"), "mano_de_obra", HOY)).toBe(false); // 16 < 30
    expect(precioVencido(p("2026-05-01"), "mano_de_obra", HOY)).toBe(true); // 42 días
  });
});

describe("avisosVencidos", () => {
  it("lista cada fuente vencida de items y extras", () => {
    const items = [
      {
        nombre: "Latex",
        tipo: "material",
        precios: {
          sismat: { valor: 90000, fuente: "SISMAT", fecha: "2026-04-01" },
          internet: { valor: 120000, fuente: "easy.com.ar", fecha: "2026-06-11" },
        },
      },
    ] as unknown as ItemDesglose[];
    const extras: ExtraDesglose[] = [
      { nombre: "Flete", monto_min: 1, monto_max: 2, fuente: "viejo.com", fecha: "2026-05-01" },
    ];
    const avisos = avisosVencidos(items, extras, HOY);
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toEqual({
      item: "Latex",
      fuente: "SISMAT",
      fecha: "2026-04-01",
      dias: 72,
      limite: VENCIMIENTO_DIAS.material,
    });
    expect(avisos[1].item).toBe("Flete");
    expect(avisos[1].limite).toBe(15);
  });

  it("el precio eze avisa a los 30 días pero nunca se borra del ítem", () => {
    const item = (fechaEze: string) =>
      [
        {
          nombre: "Porcelanato",
          tipo: "material",
          precios: { eze: { valor: 50000, fuente: "Eze", fecha: fechaEze } },
        },
      ] as unknown as ItemDesglose[];

    expect(avisosVencidos(item("2026-05-14"), [], HOY)).toHaveLength(0); // 29 días
    const avisos = avisosVencidos(item("2026-05-01"), [], HOY); // 42 días
    expect(avisos).toEqual([
      {
        item: "Porcelanato",
        fuente: "Eze",
        fecha: "2026-05-01",
        dias: 42,
        limite: VENCIMIENTO_EZE_DIAS,
      },
    ]);
  });
});
