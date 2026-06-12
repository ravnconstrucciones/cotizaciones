/**
 * Evaluador seguro de fórmulas de receta. Soporta: números, + - * / ( ),
 * menos unario, identificadores (parámetros) y funciones ceil/floor/redondear/max/min.
 * SIN eval: tokenizador + parser recursivo descendente.
 */

export class FormulaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "FormulaError";
  }
}

type Token =
  | { tipo: "num"; valor: number }
  | { tipo: "id"; nombre: string }
  | { tipo: "op"; op: "+" | "-" | "*" | "/" | "(" | ")" | "," };

const FUNCIONES: Record<string, (...args: number[]) => number> = {
  ceil: (x) => Math.ceil(x),
  floor: (x) => Math.floor(x),
  redondear: (x) => Math.round(x),
  max: (...xs) => Math.max(...xs),
  min: (...xs) => Math.min(...xs),
};

const RE_NUM = /^\d+(\.\d+)?/;
const RE_ID = /^[a-z_][a-z0-9_]*/i;

function tokenizar(src: string): Token[] {
  const tokens: Token[] = [];
  let resto = src;
  while (resto.length > 0) {
    const ws = resto.match(/^\s+/);
    if (ws) {
      resto = resto.slice(ws[0].length);
      continue;
    }
    const ch = resto[0];
    if ("+-*/(),".includes(ch)) {
      tokens.push({ tipo: "op", op: ch as "+" | "-" | "*" | "/" | "(" | ")" | "," });
      resto = resto.slice(1);
      continue;
    }
    const num = resto.match(RE_NUM);
    if (num) {
      tokens.push({ tipo: "num", valor: Number(num[0]) });
      resto = resto.slice(num[0].length);
      continue;
    }
    const id = resto.match(RE_ID);
    if (id) {
      tokens.push({ tipo: "id", nombre: id[0] });
      resto = resto.slice(id[0].length);
      continue;
    }
    throw new FormulaError(`Carácter inválido en fórmula: "${ch}"`);
  }
  return tokens;
}

export function evaluarFormula(
  formula: string,
  vars: Record<string, number>
): number {
  const tokens = tokenizar(formula);
  let pos = 0;

  const mirar = (): Token | undefined => tokens[pos];
  const consumir = (): Token => {
    const t = tokens[pos];
    if (!t) throw new FormulaError(`Fórmula incompleta: "${formula}"`);
    pos += 1;
    return t;
  };
  const esperarOp = (op: string): void => {
    const t = consumir();
    if (t.tipo !== "op" || t.op !== op) {
      throw new FormulaError(`Se esperaba "${op}" en fórmula: "${formula}"`);
    }
  };

  function expr(): number {
    let v = term();
    let t = mirar();
    while (t && t.tipo === "op" && (t.op === "+" || t.op === "-")) {
      consumir();
      const rhs = term();
      v = t.op === "+" ? v + rhs : v - rhs;
      t = mirar();
    }
    return v;
  }

  function term(): number {
    let v = factor();
    let t = mirar();
    while (t && t.tipo === "op" && (t.op === "*" || t.op === "/")) {
      consumir();
      const rhs = factor();
      if (t.op === "/") {
        if (rhs === 0) throw new FormulaError(`División por cero en: "${formula}"`);
        v = v / rhs;
      } else {
        v = v * rhs;
      }
      t = mirar();
    }
    return v;
  }

  function factor(): number {
    const t = consumir();
    if (t.tipo === "num") return t.valor;
    if (t.tipo === "op" && t.op === "-") return -factor();
    if (t.tipo === "op" && t.op === "(") {
      const v = expr();
      esperarOp(")");
      return v;
    }
    if (t.tipo === "id") {
      const sig = mirar();
      if (sig && sig.tipo === "op" && sig.op === "(") {
        const fn = FUNCIONES[t.nombre];
        if (!fn) throw new FormulaError(`Función desconocida: "${t.nombre}"`);
        esperarOp("(");
        const args: number[] = [expr()];
        let cont = mirar();
        while (cont && cont.tipo === "op" && cont.op === ",") {
          consumir();
          args.push(expr());
          cont = mirar();
        }
        esperarOp(")");
        return fn(...args);
      }
      const valor = vars[t.nombre];
      if (typeof valor !== "number" || !Number.isFinite(valor)) {
        throw new FormulaError(
          `Parámetro faltante o no numérico en fórmula: "${t.nombre}"`
        );
      }
      return valor;
    }
    throw new FormulaError(`Token inesperado en fórmula: "${formula}"`);
  }

  const resultado = expr();
  if (pos !== tokens.length) {
    throw new FormulaError(`Sintaxis inválida en fórmula: "${formula}"`);
  }
  if (!Number.isFinite(resultado)) {
    throw new FormulaError(`Resultado no finito en fórmula: "${formula}"`);
  }
  return resultado;
}
