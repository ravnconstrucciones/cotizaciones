import { describe, expect, it } from "vitest";
import {
  accessCookieIsValid,
  accessKeyMatches,
  deriveAccessCookie,
} from "./access-link";

const LLAVE = "llave-de-prueba-larga-0123456789";

describe("acceso por enlace", () => {
  it("deriva siempre la misma cookie para la misma llave", async () => {
    expect(await deriveAccessCookie(LLAVE)).toBe(await deriveAccessCookie(LLAVE));
  });

  it("no expone la llave: la cookie es otra cosa", async () => {
    const cookie = await deriveAccessCookie(LLAVE);
    expect(cookie).not.toContain(LLAVE);
    expect(cookie).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("cambiar la llave invalida las cookies vivas", async () => {
    const cookie = await deriveAccessCookie(LLAVE);
    expect(await accessCookieIsValid(cookie, LLAVE)).toBe(true);
    expect(await accessCookieIsValid(cookie, `${LLAVE}-rotada`)).toBe(false);
  });

  it("falla cerrada sin llave configurada, aunque la cookie parezca válida", async () => {
    const cookie = await deriveAccessCookie(LLAVE);
    expect(await accessCookieIsValid(cookie, undefined)).toBe(false);
    expect(await accessCookieIsValid(cookie, "")).toBe(false);
    expect(await accessCookieIsValid(undefined, LLAVE)).toBe(false);
    expect(await accessCookieIsValid("", LLAVE)).toBe(false);
  });

  it("la llave del enlace se compara entera", () => {
    expect(accessKeyMatches(LLAVE, LLAVE)).toBe(true);
    expect(accessKeyMatches(LLAVE.slice(0, -1), LLAVE)).toBe(false);
    expect(accessKeyMatches(`${LLAVE}x`, LLAVE)).toBe(false);
    expect(accessKeyMatches(LLAVE, undefined)).toBe(false);
    expect(accessKeyMatches(LLAVE, "")).toBe(false);
    expect(accessKeyMatches("", LLAVE)).toBe(false);
    expect(accessKeyMatches(null, LLAVE)).toBe(false);
  });
});
