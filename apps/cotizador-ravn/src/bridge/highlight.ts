/**
 * Resaltado de sintaxis de la ola (pedido 2 de Eze: "que sea de todos colores,
 * tipo cuando codeás").
 *
 * NO es una librería de highlighting: es un tokenizador por línea, de una sola
 * pasada, sobre texto que ya viene formateado por `stream-format.ts`. La vara
 * de performance manda — nada de Prism ni Shiki en el bundle.
 *
 * El `kind` de la línea (status / tool / result…) sigue mandando el color de
 * base; esto pinta ADENTRO: rutas, comandos, flags, strings, números y links.
 * Lo que no cae en ninguna clase queda como texto plano, nunca se inventa.
 */

export type Token =
  | "url"
  | "string"
  | "flag"
  | "path"
  | "file"
  | "number"
  | "command"
  | "plain";

export type Piece = {
  text: string;
  token: Token;
};

/** Un solo recorrido: el orden de las alternativas es el orden de prioridad. */
const PATTERN = new RegExp(
  [
    "(https?://[^\\s'\"<>]+)", // url
    "(\"[^\"\\n]*\"|'[^'\\n]*'|`[^`\\n]*`)", // string entre comillas
    "(\\s--?[A-Za-z][\\w-]*)", // flag: --json, -p
    "((?:\\.{0,2}/)?[\\w.@-]+(?:/[\\w.@-]+)+/?)", // ruta con barras
    "(\\b[\\w-]+\\.(?:tsx?|jsx?|json|md|mjs|cjs|css|py|sql|ya?ml|txt|csv|sh|toml)\\b)", // archivo
    "(\\b\\d[\\d.,]*%?)", // número o porcentaje
  ].join("|"),
  "g"
);

const GROUP_TOKENS: Token[] = ["url", "string", "flag", "path", "file", "number"];

/** El primer verbo de una línea de herramienta es el comando que corrió. */
const COMMAND_HEAD = /^([A-Za-z][\w-]*)(?=\s|$)/;

export function highlight(text: string, isCommandLine = false): Piece[] {
  const pieces: Piece[] = [];
  let rest = text;
  let offset = 0;

  if (isCommandLine) {
    const head = COMMAND_HEAD.exec(text);
    if (head) {
      pieces.push({ text: head[1], token: "command" });
      offset = head[1].length;
      rest = text.slice(offset);
    }
  }

  let cursor = 0;
  PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PATTERN.exec(rest)) !== null) {
    if (match.index > cursor) {
      pieces.push({ text: rest.slice(cursor, match.index), token: "plain" });
    }
    const groupIndex = match.slice(1).findIndex((value) => value !== undefined);
    pieces.push({
      text: match[0],
      token: groupIndex >= 0 ? GROUP_TOKENS[groupIndex] : "plain",
    });
    cursor = match.index + match[0].length;
    // una alternativa que matchea vacío colgaría el recorrido
    if (match[0].length === 0) PATTERN.lastIndex += 1;
  }

  if (cursor < rest.length) {
    pieces.push({ text: rest.slice(cursor), token: "plain" });
  }

  return pieces.filter((piece) => piece.text.length > 0);
}
