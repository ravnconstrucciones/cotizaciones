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
