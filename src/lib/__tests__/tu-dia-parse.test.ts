import { describe, expect, it } from "vitest";
import {
  parseAreaNota,
  parseDiaJson,
  AREAS_ORDEN,
  type AreaSlug,
} from "../tu-dia";

/* Fixtures = contenido REAL del vault (repo boveda), Operación/<area>.md. */

const NEGOCIO_MD = `---
tipo: area
fecha: 2026-06-04
---

# 🏗️ Negocio — Ravn

Parte de [[Mapa de Operación]]. El cuello de botella real no es producir, **es vender**.

**Estado:** 2 unidades activas, 0 webs vendidas, 1 deal inmobiliario en curso.
**Próximo 1%:** cerrar el precio fundador de la web (con margen). Un número.
**Brújula:** impecabilidad. El premium paga eso.

## Unidades
- [[Construcción y Reformas]] — core, activo
- [[Agencia de Diseño y Webs]] — validar venta
- [[Modelo inmobiliario]] — 1 deal en curso
- [[Agencia de Contenido]] — congelado

→ [[Sistema RAVN — Arquitectura Maestra]] · [[00 — EMPEZÁ POR ACÁ]] · [[ADN]]
`;

const CUERPO_MD = `---
tipo: area
fecha: 2026-06-04
---

# 💪 Cuerpo

Parte de [[Mapa de Operación]]. Tu base — cuando el cuerpo responde, la cabeza aclara.

**Estado:** fuerte. Entreno 5x/semana, fútbol 2x, moto.
**Próximo 1%:** sostener el entreno de mañana, sin negociar.
**Brújula:** el cuerpo respondiendo = tu señal de claridad mental.

→ [[Mapa de Operación]] · [[Identidad]]
`;

const DIA_JSON = `{
  "fecha": "2026-06-07",
  "maestro": {
    "area": "Negocio",
    "accion": "Decidí el precio fundador de la web + escribilo. Mínimo 15-20% margen.",
    "porque": "Sin número cerrado no contactás con confianza. Es el paso 0 del funnel."
  },
  "areas": {
    "Negocio": "Decidí el precio fundador de la web. Un número claro.",
    "Cuerpo": "Entrená mañana. Es tu señal de claridad."
  }
}`;

describe("AREAS_ORDEN", () => {
  it("enfoca en empresa + base operativa (sin áreas de ocio personal)", () => {
    expect(AREAS_ORDEN).toHaveLength(5);
    expect(AREAS_ORDEN[0].archivo).toBe("Negocio");
    const archivos = AREAS_ORDEN.map((a) => a.archivo);
    expect(archivos).toEqual([
      "Negocio",
      "Construcción y Reformas",
      "Cuerpo",
      "Mente e Identidad",
      "Finanzas personales",
    ]);
    // Las de ocio personal salieron del panel (pedido de Eze).
    expect(archivos).not.toContain("Música y Arte");
    expect(archivos).not.toContain("Vínculos");
    expect(archivos).not.toContain("Disfrute");
  });
});

describe("parseAreaNota", () => {
  it("extrae emoji, título sin emoji, estado, próximo 1% y brújula de un .md de área", () => {
    const r = parseAreaNota(NEGOCIO_MD, "Negocio");
    expect(r.emoji).toBe("🏗️");
    expect(r.titulo).toBe("Negocio — Ravn");
    expect(r.estado).toBe(
      "2 unidades activas, 0 webs vendidas, 1 deal inmobiliario en curso."
    );
    expect(r.proximo1).toBe(
      "cerrar el precio fundador de la web (con margen). Un número."
    );
    expect(r.brujula).toBe("impecabilidad. El premium paga eso.");
  });

  it("extrae los wikilinks del cuerpo (sin duplicados, en orden de aparición)", () => {
    const r = parseAreaNota(NEGOCIO_MD, "Negocio");
    expect(r.links).toContain("Mapa de Operación");
    expect(r.links).toContain("Construcción y Reformas");
    expect(r.links).toContain("ADN");
    // sin duplicados
    expect(new Set(r.links).size).toBe(r.links.length);
  });

  it("usa el nombre de archivo como título si no hay H1", () => {
    const r = parseAreaNota("**Estado:** algo.\n", "Cuerpo");
    expect(r.titulo).toBe("Cuerpo");
    expect(r.emoji).toBeNull();
    expect(r.estado).toBe("algo.");
  });

  it("parsea Cuerpo.md (otra área real) completo", () => {
    const r = parseAreaNota(CUERPO_MD, "Cuerpo");
    expect(r.emoji).toBe("💪");
    expect(r.titulo).toBe("Cuerpo");
    expect(r.estado).toBe("fuerte. Entreno 5x/semana, fútbol 2x, moto.");
    expect(r.proximo1).toBe("sostener el entreno de mañana, sin negociar.");
    expect(r.brujula).toBe("el cuerpo respondiendo = tu señal de claridad mental.");
  });

  it("degrada a null en cada campo ausente sin romper", () => {
    const r = parseAreaNota("# Solo título\n\ntexto suelto\n", "Disfrute");
    expect(r.estado).toBeNull();
    expect(r.proximo1).toBeNull();
    expect(r.brujula).toBeNull();
    expect(r.links).toEqual([]);
  });

  it("tolera 'Proximo 1%' sin acento y variantes de mayúsculas", () => {
    const md = "**estado:** x.\n**proximo 1%:** y.\n**BRÚJULA:** z.";
    const r = parseAreaNota(md, "Vínculos");
    expect(r.estado).toBe("x.");
    expect(r.proximo1).toBe("y.");
    expect(r.brujula).toBe("z.");
  });
});

describe("parseDiaJson", () => {
  it("extrae el maestro y el 1% del día por área", () => {
    const r = parseDiaJson(DIA_JSON);
    expect(r.fecha).toBe("2026-06-07");
    expect(r.maestro?.area).toBe("Negocio");
    expect(r.maestro?.accion).toContain("precio fundador");
    expect(r.maestro?.porque).toContain("funnel");
    expect(r.areas["Negocio"]).toContain("Un número claro");
    expect(r.areas["Cuerpo"]).toContain("señal de claridad");
  });

  it("degrada elegante con JSON inválido (no tira)", () => {
    const r = parseDiaJson("no es json {");
    expect(r.fecha).toBeNull();
    expect(r.maestro).toBeNull();
    expect(r.areas).toEqual({});
  });

  it("degrada elegante con null", () => {
    const r = parseDiaJson(null);
    expect(r.fecha).toBeNull();
    expect(r.maestro).toBeNull();
    expect(r.areas).toEqual({});
  });

  it("acepta dia.json sin maestro completo (campos faltantes → null)", () => {
    const r = parseDiaJson('{"fecha":"2026-06-07","areas":{}}');
    expect(r.fecha).toBe("2026-06-07");
    expect(r.maestro).toBeNull();
  });
});

describe("tipos exportados", () => {
  it("AreaSlug compila para cada archivo de AREAS_ORDEN", () => {
    const s: AreaSlug = AREAS_ORDEN[0].archivo;
    expect(typeof s).toBe("string");
  });
});
