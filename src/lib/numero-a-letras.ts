/**
 * Convierte un importe numérico a leyenda en español para el PDF (ARS / USD).
 */

const UNIDADES = [
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

const DECENAS = [
  "",
  "diez",
  "veinte",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
];

const CENTENAS = [
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

function especiales11a19(n: number): string | null {
  const m: Record<number, string> = {
    10: "diez",
    11: "once",
    12: "doce",
    13: "trece",
    14: "catorce",
    15: "quince",
    16: "dieciséis",
    17: "diecisiete",
    18: "dieciocho",
    19: "diecinueve",
  };
  return m[n] ?? null;
}

/** 0–99 (sin "y" entre decenas y unidad salvo 21–29 típico AR: veintiuno) */
function decenasYUnidades(n: number): string {
  if (n < 10) return UNIDADES[n] ?? "";
  const esp = especiales11a19(n);
  if (esp) return esp;
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 2 && u > 0) {
    return `veinti${UNIDADES[u]}`;
  }
  const dec = DECENAS[d] ?? "";
  if (u === 0) return dec;
  return `${dec} y ${UNIDADES[u]}`;
}

/** 0–999 */
function hasta999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) {
    partes.push(CENTENAS[c] ?? "");
  }
  if (resto > 0) {
    partes.push(decenasYUnidades(resto));
  }
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

/** Entero positivo a palabras (hasta miles de millones, suficiente para presupuestos). */
function enteroALetras(n: number): string {
  const num = Math.floor(Math.abs(n));
  if (num === 0) return "cero";

  const millones = Math.floor(num / 1_000_000);
  const milesResto = num % 1_000_000;
  const miles = Math.floor(milesResto / 1000);
  const resto = milesResto % 1000;

  const partes: string[] = [];

  if (millones > 0) {
    if (millones === 1) {
      partes.push("un millón");
    } else {
      partes.push(`${hasta999(millones)} millones`.trim());
    }
  }

  if (miles > 0) {
    if (millones > 0 && miles === 1 && resto === 0) {
      partes.push("mil");
    } else if (miles === 1) {
      partes.push("mil");
    } else {
      partes.push(`${hasta999(miles)} mil`.trim());
    }
  }

  if (resto > 0) {
    partes.push(hasta999(resto));
  } else if (miles > 0 && millones === 0 && miles === 1) {
    /* ya "mil" */
  }

  return partes.join(" ").replace(/\s+/g, " ").trim();
}

function leyendaMonedaEntera(moneda: "ARS" | "USD", entero: number): string {
  if (moneda === "USD") {
    return entero === 1
      ? "un dólar estadounidense"
      : `${enteroALetras(entero)} dólares estadounidenses`;
  }
  return entero === 1
    ? "un peso argentino"
    : `${enteroALetras(entero)} pesos argentinos`;
}

function leyendaCentavos(c: number): string {
  if (c === 1) return "un centavo";
  return `${enteroALetras(c)} centavos`;
}

/**
 * Ej.: "Son quince mil doscientos pesos argentinos con cincuenta centavos."
 */
export function numeroALetrasImporte(
  valor: number,
  moneda: "ARS" | "USD"
): string {
  if (!Number.isFinite(valor)) {
    return moneda === "USD"
      ? "Son cero dólares estadounidenses."
      : "Son cero pesos argentinos.";
  }

  const signo = valor < 0;
  const totalCentavos = Math.round(Math.abs(valor) * 100);
  const entero = Math.floor(totalCentavos / 100);
  const centavos = totalCentavos % 100;

  let cuerpo = "Son ";
  if (signo) cuerpo += "menos ";

  if (centavos === 0) {
    cuerpo += leyendaMonedaEntera(moneda, entero);
  } else {
    cuerpo += leyendaMonedaEntera(moneda, entero);
    cuerpo += ` con ${leyendaCentavos(centavos)}`;
  }

  return `${cuerpo}.`;
}
