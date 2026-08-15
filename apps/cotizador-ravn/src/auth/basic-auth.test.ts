import { describe, expect, it } from "vitest";
import {
  parseBasicAuthorization,
  safeTextEqual,
  verifyBasicAuthorization,
} from "./basic-auth";

function encoded(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("basic auth", () => {
  it("parses a valid header and preserves colons in the password", () => {
    expect(parseBasicAuthorization(`Basic ${encoded("eze:clave:con:dos:puntos")}`)).toEqual({
      username: "eze",
      password: "clave:con:dos:puntos",
    });
  });

  it("accepts the case-insensitive Basic scheme and UTF-8 credentials", () => {
    expect(parseBasicAuthorization(`basic ${encoded("ezequiel:contraseña")}`)).toEqual({
      username: "ezequiel",
      password: "contraseña",
    });
  });

  it.each([
    null,
    undefined,
    "",
    "Bearer abc",
    "Basic",
    "Basic ###",
    `Basic ${encoded("sin-separador")}`,
    `Basic ${encoded(":password")}`,
    `Basic ${encoded("user:")}`,
    `Basic ${encoded("user:pass")} extra`,
  ])("fails closed for malformed input %#", (header) => {
    expect(parseBasicAuthorization(header)).toBeNull();
  });

  it("fails closed when expected credentials are absent or empty", () => {
    const header = `Basic ${encoded("eze:secret")}`;

    expect(verifyBasicAuthorization(header, undefined, "secret")).toBe(false);
    expect(verifyBasicAuthorization(header, "eze", undefined)).toBe(false);
    expect(verifyBasicAuthorization(header, "", "secret")).toBe(false);
    expect(verifyBasicAuthorization(header, "eze", "")).toBe(false);
    expect(verifyBasicAuthorization(header, "eze", "wrong")).toBe(false);
    expect(verifyBasicAuthorization(header, "eze", "secret")).toBe(true);
  });

  it("compares text without returning true for different lengths or content", () => {
    expect(safeTextEqual("same", "same")).toBe(true);
    expect(safeTextEqual("same", "same-longer")).toBe(false);
    expect(safeTextEqual("same", "samo")).toBe(false);
  });
});
