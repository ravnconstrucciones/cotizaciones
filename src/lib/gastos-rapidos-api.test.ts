import { describe, expect, it } from "vitest";
import { respuestaDeshacerRpc } from "@/lib/gastos-rapidos";

describe("respuestaDeshacerRpc", () => {
  it("devuelve 200 y el id de Papelera para un undo confirmado", () => {
    expect(
      respuestaDeshacerRpc({ estado: "deshecho", papelera_id: "pap-1" })
    ).toEqual({
      status: 200,
      body: { ok: true, estado: "deshecho", papeleraId: "pap-1" },
    });
  });

  it("devuelve 409 para doble undo y fila histórica no habilitada", () => {
    expect(respuestaDeshacerRpc({ estado: "ya_deshacido" }).status).toBe(409);
    expect(respuestaDeshacerRpc({ estado: "no_habilitado" }).status).toBe(409);
  });

  it("devuelve 404 cuando el id nunca existió", () => {
    expect(respuestaDeshacerRpc({ estado: "no_encontrado" })).toEqual({
      status: 404,
      body: { ok: false, estado: "no_encontrado" },
    });
  });
});
