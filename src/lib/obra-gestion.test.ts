import { describe, expect, it } from "vitest";
import {
  clasificarEstadoObra,
  esObraActiva,
  derivarSeguimiento,
  proximaAccion,
  SIN_PROXIMA_ACCION,
  type AvanceLite,
  type PendienteLite,
} from "@/lib/obra-gestion";

describe("clasificarEstadoObra", () => {
  it("en curso por defecto (ni finalizada ni cobranza cerrada)", () => {
    const r = clasificarEstadoObra({ finalizada: false });
    expect(r.estado).toBe("en_curso");
    expect(r.label).toBe("En curso");
    expect(r.cls).toContain("emerald");
  });

  it("finalizada → ámbar", () => {
    const r = clasificarEstadoObra({ finalizada: true });
    expect(r.estado).toBe("finalizada");
    expect(r.label).toBe("Finalizada");
    expect(r.cls).toContain("amber");
  });

  it("cobranza cerrada gana sobre finalizada (estado más terminal)", () => {
    const r = clasificarEstadoObra({ finalizada: true, cobranza_cerrada: true });
    expect(r.estado).toBe("cobranza_cerrada");
    expect(r.label).toBe("Cobranza cerrada");
  });

  it("cobranza cerrada sobre obra no finalizada también gana", () => {
    const r = clasificarEstadoObra({ finalizada: false, cobranza_cerrada: true });
    expect(r.estado).toBe("cobranza_cerrada");
  });
});

describe("esObraActiva", () => {
  it("no finalizada = activa", () => {
    expect(esObraActiva({ finalizada: false })).toBe(true);
  });
  it("finalizada = inactiva (sale de home y del filtro Activas)", () => {
    expect(esObraActiva({ finalizada: true })).toBe(false);
  });
});

describe("derivarSeguimiento", () => {
  const av = (p: Partial<AvanceLite>): AvanceLite => ({
    presupuesto_id: "obra-1",
    texto: "avance",
    instancia: null,
    creado_at: "2026-06-10T10:00:00Z",
    ...p,
  });

  it("sin avances: todo vacío", () => {
    const s = derivarSeguimiento("obra-1", []);
    expect(s.ultimoAvance).toBeNull();
    expect(s.instancia).toBeNull();
    expect(s.cantAvances).toBe(0);
  });

  it("toma el avance más reciente como último, sin importar el orden de entrada", () => {
    const s = derivarSeguimiento("obra-1", [
      av({ texto: "viejo", creado_at: "2026-06-01T10:00:00Z" }),
      av({ texto: "nuevo", creado_at: "2026-06-12T10:00:00Z" }),
      av({ texto: "medio", creado_at: "2026-06-05T10:00:00Z" }),
    ]);
    expect(s.ultimoAvance?.texto).toBe("nuevo");
    expect(s.cantAvances).toBe(3);
  });

  it("instancia = la del avance más reciente que declaró una", () => {
    const s = derivarSeguimiento("obra-1", [
      av({ instancia: "demolición", creado_at: "2026-06-01T10:00:00Z" }),
      av({ instancia: "  colocación  ", creado_at: "2026-06-10T10:00:00Z" }),
      av({ instancia: null, creado_at: "2026-06-12T10:00:00Z" }),
    ]);
    // El último (06-12) no declaró instancia → toma la de 06-10, trimmeada.
    expect(s.instancia).toBe("colocación");
  });

  it("ignora avances de otras obras", () => {
    const s = derivarSeguimiento("obra-1", [
      av({ presupuesto_id: "obra-2", texto: "ajeno", creado_at: "2026-06-20T10:00:00Z" }),
      av({ presupuesto_id: "obra-1", texto: "propio", creado_at: "2026-06-10T10:00:00Z" }),
    ]);
    expect(s.ultimoAvance?.texto).toBe("propio");
    expect(s.cantAvances).toBe(1);
  });
});

describe("proximaAccion", () => {
  const t = (p: Partial<PendienteLite>): PendienteLite => ({
    presupuesto_id: "obra-1",
    texto: "pendiente",
    creado_at: "2026-06-10T10:00:00Z",
    ...p,
  });

  it("sin pendientes: fallback que empuja a cargar uno", () => {
    const r = proximaAccion("obra-1", []);
    expect(r.hay).toBe(false);
    expect(r.texto).toBeNull();
    expect(r.display).toBe(SIN_PROXIMA_ACCION);
  });

  it("el primer pendiente (más viejo) es la próxima acción", () => {
    const r = proximaAccion("obra-1", [
      t({ texto: "comprar cemento", creado_at: "2026-06-05T10:00:00Z" }),
      t({ texto: "llamar al plomero", creado_at: "2026-06-01T10:00:00Z" }),
    ]);
    expect(r.hay).toBe(true);
    expect(r.texto).toBe("llamar al plomero");
    expect(r.display).toBe("llamar al plomero");
  });

  it("ignora pendientes de otras obras y los generales (presupuesto_id null)", () => {
    const r = proximaAccion("obra-1", [
      t({ presupuesto_id: "obra-2", texto: "ajeno", creado_at: "2026-06-01T10:00:00Z" }),
      t({ presupuesto_id: null, texto: "general", creado_at: "2026-06-02T10:00:00Z" }),
      t({ presupuesto_id: "obra-1", texto: "propio", creado_at: "2026-06-03T10:00:00Z" }),
    ]);
    expect(r.texto).toBe("propio");
  });
});
