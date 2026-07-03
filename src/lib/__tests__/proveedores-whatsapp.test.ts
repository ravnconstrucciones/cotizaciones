import { describe, expect, it } from "vitest";
import {
  digitosNacionales,
  formatoTelefono,
  linkWhatsapp,
} from "@/lib/proveedores-whatsapp";

describe("digitosNacionales", () => {
  it("deja pasar el formato del bot (10 dígitos pelados)", () => {
    expect(digitosNacionales("1156698192")).toBe("1156698192");
  });

  it("saca separadores y prefijo país", () => {
    expect(digitosNacionales("+54 9 11 5555-4444")).toBe("1155554444");
    expect(digitosNacionales("(011) 4444-5555")).toBe("1144445555");
  });

  it("convierte el 15 local a característica 11", () => {
    expect(digitosNacionales("15 5669-8192")).toBe("1156698192");
  });

  it("rechaza lo que no es teléfono", () => {
    expect(digitosNacionales("6000")).toBeNull();
    expect(digitosNacionales("")).toBeNull();
  });
});

describe("linkWhatsapp", () => {
  it("arma el deep link 549 + nacional", () => {
    expect(linkWhatsapp("1156698192")).toBe("https://wa.me/5491156698192");
  });

  it("null si el número no da", () => {
    expect(linkWhatsapp("123")).toBeNull();
  });
});

describe("formatoTelefono", () => {
  it("formatea el caso AMBA de 10 dígitos", () => {
    expect(formatoTelefono("1156698192")).toBe("11 5669-8192");
  });

  it("si no normaliza, muestra tal cual vino", () => {
    expect(formatoTelefono(" 0800-BENYA ")).toBe("0800-BENYA");
  });
});
