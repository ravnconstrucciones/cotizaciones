import { describe, expect, it } from "vitest";
import { highlight } from "./highlight";

const tokensOf = (text: string, cmd = false) =>
  highlight(text, cmd).map((piece) => [piece.token, piece.text.trim()]);

describe("highlight", () => {
  it("reconstruye el texto original sin perder ni agregar nada", () => {
    const line = 'Leyendo src/domain/margin.ts --json "precio final" 31,7% https://sismat.com.ar/x';
    expect(highlight(line).map((piece) => piece.text).join("")).toBe(line);
  });

  it("marca url, string, flag, archivo y número", () => {
    const tokens = tokensOf('grep --json "porcelanato" src/app/page.tsx 25% https://a.com/b');
    expect(tokens).toContainEqual(["flag", "--json"]);
    expect(tokens).toContainEqual(["string", '"porcelanato"']);
    expect(tokens).toContainEqual(["path", "src/app/page.tsx"]);
    expect(tokens).toContainEqual(["number", "25%"]);
    expect(tokens).toContainEqual(["url", "https://a.com/b"]);
  });

  it("marca el comando sólo cuando la línea es de herramienta", () => {
    expect(tokensOf("codex exec --json", true)[0]).toEqual(["command", "codex"]);
    expect(tokensOf("codex exec --json", false)[0][0]).toBe("plain");
  });

  it("deja el texto común como plano", () => {
    expect(tokensOf("Buscando precios de mercado")).toEqual([
      ["plain", "Buscando precios de mercado"],
    ]);
  });
});
