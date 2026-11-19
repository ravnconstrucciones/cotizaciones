import { describe, expect, it } from "vitest";
import { fechaRelativa, importeArgentino, normalizarNombreObra, lineasTareas, resumenRubros, partirAgenda, resumenPagos, semana, slugObra, totalTickets, type EventoAgenda } from "../tipos";
import { claveValida, crearSesion, hashPin, sesionValida, verificarPin } from "../sesion";

describe("portal del cliente", () => {
  it("arma la semana de lunes a domingo y se corre de a semanas", () => {
    // 19/11/2026 es jueves.
    expect(semana("2026-11-19")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(semana("2026-11-22")[0]).toBe("2026-11-16"); // domingo cae en la misma semana
    expect(semana("2026-11-16")[0]).toBe("2026-11-16");
    expect(semana("2026-11-19", 1)[0]).toBe("2026-11-23");
    expect(semana("2026-11-19", -1)[6]).toBe("2026-11-15");
    expect(semana("2026-12-30")).toContain("2027-01-03");
  });

  it("compara el nombre de obra sin tildes, mayúsculas ni signos", () => {
    expect(normalizarNombreObra("  Obra  Forná! ")).toBe("obra forna");
    expect(normalizarNombreObra("FORNA")).toBe(normalizarNombreObra("forna"));
    expect(normalizarNombreObra("Pueyrredón 1100")).toBe("pueyrredon 1100");
    expect(normalizarNombreObra("Forna")).not.toBe(normalizarNombreObra("Forna 2"));
  });

  it("lee importes escritos a la argentina", () => {
    expect(importeArgentino("12.500")).toBe(12500);
    expect(importeArgentino("12.500,50")).toBe(12500.5);
    expect(importeArgentino("1.234.567")).toBe(1234567);
    expect(importeArgentino("$ 8.900")).toBe(8900);
    expect(importeArgentino("12500.5")).toBe(12500.5);
    expect(importeArgentino(3000)).toBe(3000);
    expect(importeArgentino("")).toBeNaN();
    expect(importeArgentino("abc")).toBeNaN();
  });

  it("suma los tickets por moneda sin mezclar", () => {
    expect(totalTickets([
      { importe: 1000, moneda: "ARS" },
      { importe: 2500.5, moneda: "ARS" },
      { importe: 40, moneda: "USD" },
      { importe: null, moneda: "ARS" },
    ])).toEqual({ ARS: 3500.5, USD: 40 });
  });

  it("cuenta los rubros por estado y da la obra por terminada sólo si lo están todos", () => {
    expect(resumenRubros([])).toEqual({ total: 0, terminados: 0, enCurso: 0, pendientes: 0, obraTerminada: false });
    expect(resumenRubros([{ estado: "terminado" }, { estado: "en_curso" }, { estado: "pendiente" }])).toEqual({
      total: 3, terminados: 1, enCurso: 1, pendientes: 1, obraTerminada: false,
    });
    expect(resumenRubros([{ estado: "terminado" }, { estado: "terminado" }]).obraTerminada).toBe(true);
  });

  it("parte las tareas de un rubro en renglones limpios", () => {
    expect(lineasTareas(null)).toEqual([]);
    expect(lineasTareas("- Picado de revoque\n\n• Carpeta nueva \r\nColocación")).toEqual(["Picado de revoque", "Carpeta nueva", "Colocación"]);
  });

  it("compara contrato y cobrado en la moneda de la obra, sin mezclar", () => {
    const pesos = resumenPagos({ esUsd: false, contratoArs: 3_530_000, contratoUsd: null, cobradoArs: 2_900_000, cobradoUsd: 500 });
    expect(pesos).toEqual({ moneda: "ARS", total: 3_530_000, pagado: 2_900_000, saldo: 630_000, pct: 82, otraMoneda: 500 });

    const dolares = resumenPagos({ esUsd: true, contratoArs: 9_000_000, contratoUsd: 6000, cobradoArs: 100_000, cobradoUsd: 3000 });
    expect(dolares).toMatchObject({ moneda: "USD", total: 6000, pagado: 3000, saldo: 3000, pct: 50, otraMoneda: 100_000 });
  });

  it("sin contrato no hay barra, y el saldo nunca es negativo", () => {
    expect(resumenPagos({ esUsd: false, contratoArs: null, contratoUsd: null, cobradoArs: 10, cobradoUsd: 0 })).toBeNull();
    expect(resumenPagos({ esUsd: false, contratoArs: 100, contratoUsd: null, cobradoArs: 150, cobradoUsd: 0 })).toMatchObject({ saldo: 0, pct: 100 });
  });

  it("parte la agenda en lo que viene y lo que pasó", () => {
    const ev = (id: string, fecha: string, hora: string | null): EventoAgenda => ({ id, fecha, hora, titulo: id, quien: null, detalle: null });
    const { proximos, pasados } = partirAgenda(
      [ev("c", "2026-11-17", "15:00"), ev("a", "2026-11-10", null), ev("b", "2026-11-17", "10:00"), ev("hoy", "2026-11-15", null)],
      "2026-11-15"
    );
    expect(proximos.map((e) => e.id)).toEqual(["hoy", "b", "c"]);
    expect(pasados.map((e) => e.id)).toEqual(["a"]);
  });

  it("nombra las fechas cercanas", () => {
    expect(fechaRelativa("2026-11-15", "2026-11-15")).toBe("Hoy");
    expect(fechaRelativa("2026-11-16", "2026-11-15")).toBe("Mañana");
    expect(fechaRelativa("2026-11-17", "2026-11-15")).toBe("Martes 17 nov");
    expect(fechaRelativa("2026-12-01", "2026-11-30")).toBe("Mañana");
  });

  it("arma un slug válido para el link", () => {
    expect(slugObra("Baño principal — Caballito", "k3f9")).toBe("bano-principal-caballito-k3f9");
    expect(slugObra("  ", "ab12")).toBe("obra-ab12");
  });
});

describe("acceso al portal", () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "clave-de-prueba";

  it("verifica el PIN contra su hash", () => {
    const hash = hashPin("482913");
    expect(hash).not.toContain("482913");
    expect(verificarPin("482913", hash)).toBe(true);
    expect(verificarPin("482914", hash)).toBe(false);
    expect(verificarPin("482913", null)).toBe(false);
  });

  it("acepta contraseñas de 6 a 40 caracteres, con letras, y sin espacios en las puntas", () => {
    expect(claveValida("Pueyrredon2026")).toBe(true);
    expect(claveValida("baño 3")).toBe(true);
    expect(claveValida("corta")).toBe(false);
    expect(claveValida(" conespacio")).toBe(false);
    expect(claveValida("x".repeat(41))).toBe(false);
    const hash = hashPin("Pueyrredon2026");
    expect(verificarPin("Pueyrredon2026", hash)).toBe(true);
    expect(verificarPin("pueyrredon2026", hash)).toBe(false);
  });

  it("la sesión vale sólo para su obra, su versión y hasta que vence", () => {
    const ahora = 1_800_000_000_000;
    const { valor } = crearSesion("obra-a", 1, ahora);
    expect(sesionValida(valor, "obra-a", 1, ahora)).toBe(true);
    expect(sesionValida(valor, "obra-b", 1, ahora)).toBe(false);
    expect(sesionValida(valor, "obra-a", 2, ahora)).toBe(false);
    expect(sesionValida(valor, "obra-a", 1, ahora + 31 * 24 * 3600 * 1000)).toBe(false);
    expect(sesionValida(valor.replace(/.$/, (c) => (c === "0" ? "1" : "0")), "obra-a", 1, ahora)).toBe(false);
    expect(sesionValida(undefined, "obra-a", 1, ahora)).toBe(false);
  });
});
