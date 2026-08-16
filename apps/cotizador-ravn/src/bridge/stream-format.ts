/**
 * Formatea las líneas JSONL crudas de los CLIs (claude -p --output-format
 * stream-json / codex exec --json) a líneas legibles para las terminales del
 * visor. Regla del subsistema: lo que no se reconoce se muestra crudo
 * (kind "raw"), nunca se inventa ni se descarta actividad.
 */

export type BridgeAgent = "fable" | "codex";

export type TerminalLineKind = "status" | "text" | "tool" | "result" | "raw";

export type TerminalLine = {
  kind: TerminalLineKind;
  text: string;
};

const MAX_RAW_LENGTH = 400;

function truncate(value: string, max = MAX_RAW_LENGTH): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function rawLine(line: string): TerminalLine[] {
  const flat = truncate(line);
  return flat ? [{ kind: "raw", text: flat }] : [];
}

function describeToolInput(input: unknown): string {
  const record = asRecord(input);
  if (!record) return "";
  const preferred =
    str(record.query) ?? str(record.url) ?? str(record.prompt) ?? str(record.pattern) ?? str(record.file_path) ?? str(record.command);
  if (preferred) return truncate(preferred, 160);
  const serialized = JSON.stringify(record);
  return serialized && serialized !== "{}" ? truncate(serialized, 160) : "";
}

function formatClaudeLine(event: Record<string, unknown>): TerminalLine[] | null {
  const type = str(event.type);
  if (type === "system") {
    const subtype = str(event.subtype);
    if (subtype === "init") {
      const model = str(event.model);
      return [{ kind: "status", text: model ? `Sesión iniciada · ${model}` : "Sesión iniciada" }];
    }
    // Chatter interno (hooks locales, contadores de tokens): real pero sin valor
    // para la terminal; se silencia, no se traduce.
    if (subtype && (subtype.startsWith("hook_") || subtype === "thinking_tokens")) return [];
    return [{ kind: "status", text: subtype ? `Sistema · ${subtype}` : "Sistema" }];
  }

  if (type === "assistant" || type === "user") {
    const message = asRecord(event.message);
    const content = Array.isArray(message?.content) ? message.content : [];
    const lines: TerminalLine[] = [];
    for (const block of content) {
      const record = asRecord(block);
      if (!record) continue;
      const blockType = str(record.type);
      if (blockType === "text") {
        const text = str(record.text);
        if (text) lines.push({ kind: "text", text: text.trim() });
      } else if (blockType === "thinking") {
        const thinking = str(record.thinking);
        if (thinking) lines.push({ kind: "status", text: `Pensando · ${truncate(thinking, 160)}` });
      } else if (blockType === "tool_use") {
        const name = str(record.name) ?? "herramienta";
        const detail = describeToolInput(record.input);
        lines.push({ kind: "tool", text: detail ? `▸ ${name} · ${detail}` : `▸ ${name}` });
      } else if (blockType === "tool_result") {
        const isError = record.is_error === true;
        lines.push({
          kind: isError ? "raw" : "status",
          text: isError ? "✗ La herramienta devolvió error" : "✓ Resultado de herramienta recibido",
        });
      }
    }
    return lines;
  }

  if (type === "result") {
    const subtype = str(event.subtype);
    const turns = typeof event.num_turns === "number" ? ` · ${event.num_turns} turnos` : "";
    const duration =
      typeof event.duration_ms === "number"
        ? ` · ${Math.round(event.duration_ms / 1000)}s`
        : "";
    if (subtype === "success") {
      return [{ kind: "result", text: `Terminó${turns}${duration}` }];
    }
    return [{ kind: "result", text: `Terminó con estado ${subtype ?? "desconocido"}${turns}${duration}` }];
  }

  if (type === "stream_event") return [];

  return null;
}

function describeCodexItem(item: Record<string, unknown>, completed: boolean): TerminalLine[] {
  const itemType = str(item.item_type) ?? str(item.type);
  if (itemType === "assistant_message" || itemType === "agent_message") {
    const text = str(item.text) ?? str(item.message);
    return text && completed ? [{ kind: "text", text: text.trim() }] : [];
  }
  if (itemType === "reasoning") {
    const text = str(item.text);
    return text && completed ? [{ kind: "status", text: `Pensando · ${truncate(text, 160)}` }] : [];
  }
  if (itemType === "command_execution") {
    const command = str(item.command);
    if (!completed) {
      return command ? [{ kind: "tool", text: `▸ shell · ${truncate(command, 160)}` }] : [];
    }
    const exit = typeof item.exit_code === "number" ? item.exit_code : null;
    return [
      {
        kind: exit === 0 || exit === null ? "status" : "raw",
        text: exit === 0 || exit === null ? "✓ Comando terminado" : `✗ Comando salió con código ${exit}`,
      },
    ];
  }
  if (itemType === "web_search") {
    const query = str(item.query);
    return completed
      ? [{ kind: "status", text: "✓ Búsqueda web terminada" }]
      : [{ kind: "tool", text: query ? `▸ búsqueda web · ${truncate(query, 160)}` : "▸ búsqueda web" }];
  }
  return [];
}

function formatCodexLine(event: Record<string, unknown>): TerminalLine[] | null {
  // Forma nueva (item.*, thread.*, turn.*).
  const type = str(event.type);
  if (type) {
    if (type === "thread.started" || type === "session.created") {
      return [{ kind: "status", text: "Sesión iniciada" }];
    }
    if (type === "turn.started") return [{ kind: "status", text: "Turno iniciado" }];
    if (type === "turn.completed" || type === "thread.completed") {
      return [{ kind: "result", text: "Terminó" }];
    }
    if (type === "turn.failed" || type === "error") {
      const message = str(asRecord(event.error)?.message) ?? str(event.message);
      return [{ kind: "raw", text: message ? `✗ ${truncate(message)}` : "✗ El turno falló" }];
    }
    if (type === "item.started" || type === "item.updated" || type === "item.completed") {
      const item = asRecord(event.item);
      return item ? describeCodexItem(item, type === "item.completed") : [];
    }
  }

  // Forma vieja ({id, msg:{type,...}}).
  const msg = asRecord(event.msg);
  if (msg) {
    const msgType = str(msg.type);
    if (msgType === "task_started") return [{ kind: "status", text: "Tarea iniciada" }];
    if (msgType === "task_complete") return [{ kind: "result", text: "Terminó" }];
    if (msgType === "agent_message") {
      const text = str(msg.message);
      return text ? [{ kind: "text", text: text.trim() }] : [];
    }
    if (msgType === "agent_reasoning") {
      const text = str(msg.text);
      return text ? [{ kind: "status", text: `Pensando · ${truncate(text, 160)}` }] : [];
    }
    if (msgType === "exec_command_begin") {
      const command = Array.isArray(msg.command) ? msg.command.join(" ") : str(msg.command);
      return [{ kind: "tool", text: command ? `▸ shell · ${truncate(command, 160)}` : "▸ shell" }];
    }
    if (msgType === "exec_command_end") {
      const exit = typeof msg.exit_code === "number" ? msg.exit_code : null;
      return [
        {
          kind: exit === 0 || exit === null ? "status" : "raw",
          text: exit === 0 || exit === null ? "✓ Comando terminado" : `✗ Comando salió con código ${exit}`,
        },
      ];
    }
    if (msgType === "token_count") return [];
    if (msgType === "error") {
      const message = str(msg.message);
      return [{ kind: "raw", text: message ? `✗ ${truncate(message)}` : "✗ Error" }];
    }
    return null;
  }

  return null;
}

export function formatCliLine(agent: BridgeAgent, line: string): TerminalLine[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return rawLine(trimmed);
  }

  const event = asRecord(parsed);
  if (!event) return rawLine(trimmed);

  const formatted = agent === "fable" ? formatClaudeLine(event) : formatCodexLine(event);
  return formatted ?? rawLine(trimmed);
}
