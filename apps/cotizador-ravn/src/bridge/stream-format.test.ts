import { describe, expect, it } from "vitest";
import { formatCliLine } from "./stream-format";

describe("formatCliLine · fable (claude stream-json)", () => {
  it("formatea el init del sistema con el modelo", () => {
    const line = JSON.stringify({ type: "system", subtype: "init", model: "claude-fable-5" });
    expect(formatCliLine("fable", line)).toEqual([
      { kind: "status", text: "Sesión iniciada · claude-fable-5" },
    ]);
  });

  it("desarma los bloques de un mensaje del asistente", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Busco precios de porcelanato." },
          { type: "tool_use", name: "WebSearch", input: { query: "precio porcelanato 60x60" } },
        ],
      },
    });
    expect(formatCliLine("fable", line)).toEqual([
      { kind: "text", text: "Busco precios de porcelanato." },
      { kind: "tool", text: "▸ WebSearch · precio porcelanato 60x60" },
    ]);
  });

  it("resume el resultado final con duración", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      num_turns: 3,
      duration_ms: 12400,
    });
    expect(formatCliLine("fable", line)).toEqual([
      { kind: "result", text: "Terminó · 3 turnos · 12s" },
    ]);
  });

  it("silencia el chatter de hooks y contadores de tokens", () => {
    for (const subtype of ["hook_started", "hook_response", "thinking_tokens"]) {
      expect(formatCliLine("fable", JSON.stringify({ type: "system", subtype }))).toEqual([]);
    }
  });

  it("no se traga un mensaje cuyos bloques no reconoce", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "redacted_thinking", data: "abc" }] },
    });
    const [only] = formatCliLine("fable", line);
    expect(only.kind).toBe("raw");
    expect(only.text).toContain("redacted_thinking");
  });

  it("lee el contenido cuando viene como texto pelado y no como bloques", () => {
    const line = JSON.stringify({ type: "user", message: { content: "seguí con la ronda 4" } });
    expect(formatCliLine("fable", line)).toEqual([
      { kind: "text", text: "seguí con la ronda 4" },
    ]);
  });

  it("muestra crudo un evento no reconocido, truncado", () => {
    const line = JSON.stringify({ type: "algo_nuevo", payload: "x".repeat(600) });
    const [only] = formatCliLine("fable", line);
    expect(only.kind).toBe("raw");
    expect(only.text.length).toBeLessThanOrEqual(400);
  });
});

describe("formatCliLine · codex (codex exec --json)", () => {
  it("formatea eventos item.* de la forma nueva", () => {
    const started = JSON.stringify({
      type: "item.started",
      item: { item_type: "command_execution", command: "rg precios" },
    });
    expect(formatCliLine("codex", started)).toEqual([
      { kind: "tool", text: "▸ shell · rg precios" },
    ]);

    const message = JSON.stringify({
      type: "item.completed",
      item: { item_type: "assistant_message", text: "El m2 ronda $18.000." },
    });
    expect(formatCliLine("codex", message)).toEqual([
      { kind: "text", text: "El m2 ronda $18.000." },
    ]);
  });

  it("no repite la línea del comando en cada item.updated", () => {
    const item = { item_type: "command_execution", command: "rg precios" };
    expect(formatCliLine("codex", JSON.stringify({ type: "item.started", item }))).toEqual([
      { kind: "tool", text: "▸ shell · rg precios" },
    ]);
    expect(formatCliLine("codex", JSON.stringify({ type: "item.updated", item }))).toEqual([]);
    expect(
      formatCliLine("codex", JSON.stringify({ type: "item.updated", item: { ...item, aggregated_output: "x" } }))
    ).toEqual([]);
  });

  it("tampoco repite la búsqueda web mientras corre", () => {
    const item = { item_type: "web_search", query: "precio adoquín" };
    expect(formatCliLine("codex", JSON.stringify({ type: "item.started", item }))).toEqual([
      { kind: "tool", text: "▸ búsqueda web · precio adoquín" },
    ]);
    expect(formatCliLine("codex", JSON.stringify({ type: "item.updated", item }))).toEqual([]);
  });

  it("no canta éxito cuando no vino el código de salida", () => {
    const sinCodigo = JSON.stringify({
      type: "item.completed",
      item: { item_type: "command_execution", command: "rg precios" },
    });
    expect(formatCliLine("codex", sinCodigo)).toEqual([
      { kind: "status", text: "Comando terminado · sin código de salida" },
    ]);

    const conCero = JSON.stringify({
      type: "item.completed",
      item: { item_type: "command_execution", exit_code: 0 },
    });
    expect(formatCliLine("codex", conCero)).toEqual([
      { kind: "status", text: "✓ Comando terminado" },
    ]);

    const conError = JSON.stringify({
      type: "item.completed",
      item: { item_type: "command_execution", exit_code: 2 },
    });
    expect(formatCliLine("codex", conError)).toEqual([
      { kind: "raw", text: "✗ Comando salió con código 2" },
    ]);

    // la forma vieja mide con la misma vara
    expect(
      formatCliLine("codex", JSON.stringify({ id: "9", msg: { type: "exec_command_end" } }))
    ).toEqual([{ kind: "status", text: "Comando terminado · sin código de salida" }]);
  });

  it("formatea la forma vieja basada en msg", () => {
    const line = JSON.stringify({ id: "1", msg: { type: "agent_message", message: "Listo." } });
    expect(formatCliLine("codex", line)).toEqual([{ kind: "text", text: "Listo." }]);
  });

  it("silencia token_count y reporta errores", () => {
    expect(formatCliLine("codex", JSON.stringify({ id: "2", msg: { type: "token_count" } }))).toEqual([]);
    expect(
      formatCliLine("codex", JSON.stringify({ type: "error", message: "sin cuota" }))
    ).toEqual([{ kind: "raw", text: "✗ sin cuota" }]);
  });
});

describe("formatCliLine · entrada no JSON", () => {
  it("pasa texto plano como crudo y descarta vacío", () => {
    expect(formatCliLine("fable", "stderr: warning")).toEqual([
      { kind: "raw", text: "stderr: warning" },
    ]);
    expect(formatCliLine("codex", "   ")).toEqual([]);
  });
});
