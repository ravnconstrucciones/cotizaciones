import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("cockpit RAVN brand treatment", () => {
  it("uses the brand black and warm white as cockpit neutrals", () => {
    const css = readSource("src/app/globals.css");

    expect(css).toContain("--cdm-bg: #070707;");
    expect(css).toContain("--cdm-accent: #f2efe8;");
  });

  // La barra de comando se borró el 29/07; queda la card como guardián del
  // cero border-radius de la marca.
  it("keeps the shared home cards square", () => {
    const card = readSource("src/components/ui/heroui-card.tsx");

    expect(card).toContain('"rounded-none border border-zinc-900/[0.14]');
  });
});
