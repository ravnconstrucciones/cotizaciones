/** Convierte entero 0..999999999 a palabras en español (masculino, sin "mil millones"). */
function enteroALetras(n: number): string {
  const x = Math.floor(Math.abs(n));
  if (x === 0) return "cero";

  const unidades = [
    "",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
  ];
  const diez19 = [
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
    "dieciséis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
  ];
  const decenas = [
    "",
    "",
    "veinte",
    "treinta",
    "cuarenta",
    "cincuenta",
    "sesenta",
    "setenta",
    "ochenta",
    "noventa",
  ];
  const centenas = [
    "",
    "ciento",
    "doscientos",
    "trescientos",
    "cuatrocientos",
    "quinientos",
    "seiscientos",
    "setecientos",
    "ochocientos",
    "novecientos",
  ];

  function bajo100(num: number): string {
    if (num < 10) return unidades[num] ?? "";
    if (num < 20) return diez19[num - 10] ?? "";
    const d = Math.floor(num / 10);
    const u = num % 10;
    const base = decenas[d] ?? "";
    if (u === 0) return base;
    if (d === 2) return `veinti${unidades[u]}`;
    return `${base} y ${unidades[u]}`;
  }

  function bajo1000(num: number): string {
    if (num === 0) return "";
    if (num === 100) return "cien";
    const c = Math.floor(num / 100);
    const rest = num % 100;
    const cStr = c > 0 ? (centenas[c] ?? "") : "";
    const rStr = rest > 0 ? bajo100(rest) : "";
    if (c > 0 && rest > 0) {
      if (num < 200) return `ciento ${rStr}`;
      return `${cStr} ${rStr}`.trim();
    }
    return (cStr + rStr).trim();
  }

  let resto = x;
  const partes: string[] = [];

  const millones = Math.floor(resto / 1_000_000);
  resto %= 1_000_000;
  if (millones === 1) partes.push("un millón");
  else if (millones > 1)
    partes.push(`${bajo1000(millones).replace(/^uno$/, "un")} millones`);

  const miles = Math.floor(resto / 1000);
  resto %= 1000;
  if (miles === 1) partes.push("mil");
  else if (miles > 1)
    partes.push(`${bajo1000(miles).replace(/^uno$/, "un")} mil`);

  if (resto > 0) partes.push(bajo1000(resto));

  return partes.join(" ").replace(/\s+/g, " ").trim();
}

function capitalizar(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Importe en letras para propuesta comercial (ARS o USD).
 */
export function importeALetrasEs(
  value: number,
  moneda: "ARS" | "USD"
): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const ent = Math.floor(abs + 1e-9);
  const cents = Math.round((abs - ent) * 100);

  if (moneda === "USD") {
    const entPal =
      ent === 1 ? "un" : enteroALetras(ent);
    let s = capitalizar(entPal);
    s += ent === 1 ? " dólar estadounidense" : " dólares estadounidenses";
    if (cents > 0) {
      s += ` con ${enteroALetras(cents)} centavo${cents === 1 ? "" : "s"}`;
    }
    return s + ".";
  }

  const entPal = ent === 1 ? "un" : enteroALetras(ent);
  let s = capitalizar(entPal);
  s += ent === 1 ? " peso" : " pesos";
  if (cents > 0) {
    s += ` con ${enteroALetras(cents)} centavo${cents === 1 ? "" : "s"}`;
  }
  return s + ".";
}
