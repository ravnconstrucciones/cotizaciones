import { describe, expect, it } from "vitest";
import {
  extractBullets,
  extractSiguientePaso,
  extractTopBullets,
  pickLatestOrientacion,
  tituloOrientacion,
} from "../vault-parse";

const ORIENTACION_CON_SECCION = `# Orientación — 2026-06-07 (domingo)

## Qué se construyó hoy

Sistema completo andando.

## Siguiente paso

Conectar el bot al Centro de Mando y matar las piezas locales.

## Otra sección

Texto que no corresponde.
`;

const ORIENTACION_SIN_SECCION = `# Orientación — 2026-05-28

> Cita que no es párrafo.

Primer párrafo real: consolidar el cotizador antes de vender más.

## Detalle

Más texto.
`;

const PATRONES_MD = `# Patrones de comportamiento

## Patrones que me potencian

- Consistencia estética en todo lo que toca
- **Builder mentality**: construye sistemas y procesos
- Disciplina física sostenida

## Patrones que me frenan

- Perfeccionismo estético puede paralizar la ejecución
`;

describe("pickLatestOrientacion", () => {
  it("elige el .md con fecha más nueva (orden lexicográfico del prefijo YYYY-MM-DD)", () => {
    const nombres = [
      "2026-05-28 Síntesis — dónde estamos.md",
      "2026-06-07 - Sistema Tu Día completado.md",
      "2026-06-03 - Sistema deployado 24-7.md",
      "notas.txt",
    ];
    expect(pickLatestOrientacion(nombres)).toBe(
      "2026-06-07 - Sistema Tu Día completado.md"
    );
  });

  it("devuelve null si no hay archivos .md", () => {
    expect(pickLatestOrientacion([])).toBeNull();
    expect(pickLatestOrientacion(["foto.png"])).toBeNull();
  });
});

describe("tituloOrientacion", () => {
  it("saca la extensión .md", () => {
    expect(tituloOrientacion("2026-06-07 - Sistema Tu Día completado.md")).toBe(
      "2026-06-07 - Sistema Tu Día completado"
    );
  });
});

describe("extractSiguientePaso", () => {
  it("devuelve el cuerpo de la sección cuyo heading contiene 'siguiente paso'", () => {
    expect(extractSiguientePaso(ORIENTACION_CON_SECCION)).toBe(
      "Conectar el bot al Centro de Mando y matar las piezas locales."
    );
  });

  it("matchea 'Próximos pasos' con acento y plural", () => {
    const md = "# T\n\n## Próximos pasos\n\nHacer A y B.\n";
    expect(extractSiguientePaso(md)).toBe("Hacer A y B.");
  });

  it("fallback: primer párrafo después del H1 (saltea citas y headings)", () => {
    expect(extractSiguientePaso(ORIENTACION_SIN_SECCION)).toBe(
      "Primer párrafo real: consolidar el cotizador antes de vender más."
    );
  });

  it("devuelve null si no hay nada extraíble", () => {
    expect(extractSiguientePaso("# Solo título\n")).toBeNull();
  });
});

describe("extractBullets", () => {
  it("extrae los bullets de la sección pedida (insensible a acentos/mayúsculas) y limpia ** **", () => {
    expect(extractBullets(PATRONES_MD, "potencian", 5)).toEqual([
      "Consistencia estética en todo lo que toca",
      "Builder mentality: construye sistemas y procesos",
      "Disciplina física sostenida",
    ]);
  });

  it("respeta el máximo y corta en el próximo heading", () => {
    expect(extractBullets(PATRONES_MD, "potencian", 2)).toHaveLength(2);
    expect(extractBullets(PATRONES_MD, "frenan", 5)).toEqual([
      "Perfeccionismo estético puede paralizar la ejecución",
    ]);
  });

  it("devuelve [] si la sección no existe", () => {
    expect(extractBullets(PATRONES_MD, "inexistente", 5)).toEqual([]);
  });
});

describe("extractTopBullets", () => {
  it("toma los primeros bullets de un archivo que es una lista (FODA)", () => {
    const md = "# Fortalezas\n\n- Marca premium\n- Gestión y números\n- Tecnología propia\n- Otra más\n";
    expect(extractTopBullets(md, 3)).toEqual([
      "Marca premium",
      "Gestión y números",
      "Tecnología propia",
    ]);
  });
});
