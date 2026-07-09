import { describe, expect, it } from "vitest";
import {
  combinarPrecios,
  elegirPrecioRetail,
  revisadoPorItem,
} from "../precios-cache";
import type { PrecioCadena } from "../retail";
import type { PrecioItemRow } from "../tipos";

const fila = (over: Partial<PrecioItemRow>): PrecioItemRow => ({
  item: "Látex interior 20L",
  origen: "internet",
  valor: 50000,
  fuente: "easy.com.ar",
  fecha: "2026-07-09",
  revisado_at: "2026-07-09T12:00:00Z",
  ...over,
});

describe("combinarPrecios", () => {
  it("arma los tres slots de PrecioItem desde filas del cache", () => {
    const out = combinarPrecios([
      fila({ origen: "sismat", valor: 48000, fuente: "SISMAT 1203" }),
      fila({ origen: "internet" }),
      fila({ origen: "retail", valor: 51000, fuente: "Prestigio (ref. retail)" }),
    ]);
    const p = out["Látex interior 20L"];
    expect(p.sismat).toEqual({ valor: 48000, fuente: "SISMAT 1203", fecha: "2026-07-09" });
    expect(p.internet?.valor).toBe(50000);
    expect(p.retail?.valor).toBe(51000);
  });

  it("ítem con SOLO retail: copia retail al slot internet (con su fuente intacta) para que entre al rango", () => {
    // El panel exploratorio muestra totales con el precio vivo que HAY. El slot
    // retail no entra a precio_min/max (instanciar.ts) — si es lo único que
    // existe, se duplica en internet SIN disfrazar la fuente (sigue diciendo
    // "(ref. retail)"). Ley 1 intacta: no se inventa, se usa un precio real.
    const out = combinarPrecios([
      fila({ origen: "retail", valor: 51000, fuente: "Prestigio (ref. retail)" }),
    ]);
    const p = out["Látex interior 20L"];
    expect(p.internet).toEqual({
      valor: 51000,
      fuente: "Prestigio (ref. retail)",
      fecha: "2026-07-09",
    });
    expect(p.retail?.valor).toBe(51000);
  });

  it("ítem sin filas: no aparece (el motor lo marca sin_precio)", () => {
    expect(combinarPrecios([])).toEqual({});
  });
});

describe("elegirPrecioRetail", () => {
  const cadena = (over: Partial<PrecioCadena>): PrecioCadena => ({
    cadena: "prestigio",
    nombre: "Prestigio",
    fuente: "Prestigio (ref. retail)",
    precio: { valor: 51000, fuente: "Prestigio (ref. retail)", fecha: "2026-07-09" },
    ...over,
  });

  it("toma la primera cadena con precio (la principal viene primera)", () => {
    const out = elegirPrecioRetail([
      cadena({ precio: null }),
      cadena({ cadena: "colorshop", nombre: "Colorshop", fuente: "Colorshop (ref. retail)", precio: { valor: 49000, fuente: "Colorshop (ref. retail)", fecha: "2026-07-09" } }),
    ]);
    expect(out?.fuente).toBe("Colorshop (ref. retail)");
  });

  it("todas sin precio → null (nunca se inventa)", () => {
    expect(elegirPrecioRetail([cadena({ precio: null })])).toBeNull();
  });
});

describe("revisadoPorItem", () => {
  it("devuelve el revisado_at más reciente por ítem", () => {
    const out = revisadoPorItem([
      fila({ revisado_at: "2026-07-09T08:00:00Z" }),
      fila({ origen: "retail", revisado_at: "2026-07-09T12:00:00Z" }),
    ]);
    expect(out["Látex interior 20L"]).toBe("2026-07-09T12:00:00Z");
  });
});
