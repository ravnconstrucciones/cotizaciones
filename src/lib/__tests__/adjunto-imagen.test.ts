import { describe, expect, it } from "vitest";
import {
  ADJUNTO_IMAGEN_MAX_BYTES,
  extensionImagen,
  validarImagenAdjunta,
} from "@/lib/adjunto-imagen";

describe("validarImagenAdjunta", () => {
  it("acepta una imagen común", () => {
    expect(
      validarImagenAdjunta({ type: "image/jpeg", size: 1024 })
    ).toBeNull();
  });

  it("rechaza tipos que no son imagen", () => {
    expect(
      validarImagenAdjunta({ type: "application/pdf", size: 1024 })
    ).toMatch(/imágenes/i);
    expect(validarImagenAdjunta({ type: "", size: 10 })).toMatch(/imágenes/i);
  });

  it("rechaza imágenes de más de 10 MB", () => {
    expect(
      validarImagenAdjunta({
        type: "image/png",
        size: ADJUNTO_IMAGEN_MAX_BYTES + 1,
      })
    ).toMatch(/10 MB/);
  });

  it("acepta exactamente 10 MB", () => {
    expect(
      validarImagenAdjunta({
        type: "image/png",
        size: ADJUNTO_IMAGEN_MAX_BYTES,
      })
    ).toBeNull();
  });
});

describe("extensionImagen", () => {
  it("usa la extensión del nombre cuando es válida", () => {
    expect(extensionImagen({ name: "foto.PNG", type: "image/png" })).toBe(
      "png"
    );
    expect(extensionImagen({ name: "a.b.webp", type: "image/webp" })).toBe(
      "webp"
    );
  });

  it("cae al MIME cuando el nombre no tiene extensión", () => {
    expect(extensionImagen({ name: "pegado", type: "image/png" })).toBe("png");
    expect(extensionImagen({ name: "pegado", type: "image/webp" })).toBe(
      "webp"
    );
  });

  it("fallback jpg para tipos desconocidos", () => {
    expect(extensionImagen({ name: "x", type: "image/raro" })).toBe("jpg");
  });
});
