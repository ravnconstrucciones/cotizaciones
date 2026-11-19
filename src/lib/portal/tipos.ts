/**
 * Portal del cliente — tipos y cálculo puro (sin Supabase ni React).
 * Lo que ve el cliente sale de acá: estado de los rubros, resumen de pagos, agenda.
 */

export type EstadoRubro = "pendiente" | "en_curso" | "terminado";
export type TipoRegistro = "avance" | "video" | "resuelto" | "material" | "ticket";

export const ESTADOS_RUBRO: Record<EstadoRubro, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  terminado: "Terminado",
};

export const TIPOS_REGISTRO: Record<TipoRegistro, string> = {
  avance: "Avance",
  video: "Video",
  resuelto: "Resuelto",
  material: "Se coloca",
  ticket: "Ticket",
};

export type RubroPortal = {
  id: string;
  nombre: string;
  /** Qué se hace en el rubro, una tarea por renglón. */
  tareas: string | null;
  estado: EstadoRubro;
  orden: number;
};

export type MaterialRegistro = {
  producto?: string;
  marca?: string;
  color?: string;
  estado?: string;
};

export type RegistroPortal = {
  id: string;
  rubroId: string | null;
  tipo: TipoRegistro;
  titulo: string;
  texto: string | null;
  fecha: string;
  mediaUrl: string | null;
  mediaTipo: "imagen" | "video" | null;
  linkExterno: string | null;
  material: MaterialRegistro | null;
  estado: "borrador" | "publicado";
  origen: "app" | "bot";
  /** Sólo tickets: importe del comprobante. */
  importe: number | null;
  moneda: "ARS" | "USD";
};

/** Recibo emitido por RAVN (PDF en los archivos de la obra). */
export type ReciboPortal = {
  id: string;
  titulo: string;
  fecha: string;
  url: string;
};

export type EventoAgenda = {
  id: string;
  fecha: string;
  hora: string | null;
  titulo: string;
  quien: string | null;
  detalle: string | null;
};

export type PagoPortal = {
  id: string;
  fecha: string;
  monto: number;
  moneda: "ARS" | "USD";
  concepto: string;
};

export type ResumenPagos = {
  moneda: "ARS" | "USD";
  total: number;
  pagado: number;
  saldo: number;
  pct: number;
  /** Cobros en la otra moneda: se listan pero no entran en la barra. */
  otraMoneda: number;
};

export type VistaPortal = {
  obra: {
    nombre: string;
    cliente: string | null;
    direccion: string | null;
    inicio: string | null;
    entrega: string | null;
    fotoUrl: string | null;
  };
  rubros: RubroPortal[];
  registros: RegistroPortal[];
  agenda: EventoAgenda[];
  pagos: { resumen: ResumenPagos; detalle: PagoPortal[]; recibos: ReciboPortal[]; presupuestoUrl: string | null } | null;
  hoy: string;
};

/**
 * El avance se cuenta en rubros, no en porcentajes: cuántos están terminados,
 * en curso y pendientes. La obra está terminada cuando lo están todos.
 */
export function resumenRubros(rubros: Pick<RubroPortal, "estado">[]) {
  const cuenta = (e: EstadoRubro) => rubros.filter((r) => r.estado === e).length;
  const terminados = cuenta("terminado");
  return {
    total: rubros.length,
    terminados,
    enCurso: cuenta("en_curso"),
    pendientes: cuenta("pendiente"),
    obraTerminada: rubros.length > 0 && terminados === rubros.length,
  };
}

/** Texto de tareas → renglones limpios (sin viñetas ni vacíos). */
export function lineasTareas(tareas: string | null | undefined): string[] {
  return (tareas ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*·]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Contrato vs cobrado, sin mezclar monedas: la obra en USD compara dólares con
 * dólares; la obra en pesos, pesos con pesos. Lo cobrado en la otra moneda se
 * informa aparte. Sin contrato cargado no hay barra (null).
 */
export function resumenPagos(e: {
  esUsd: boolean;
  contratoArs: number | null;
  contratoUsd: number | null;
  cobradoArs: number;
  cobradoUsd: number;
}): ResumenPagos | null {
  const enUsd = e.esUsd && (e.contratoUsd ?? 0) > 0;
  const total = enUsd ? (e.contratoUsd as number) : e.contratoArs ?? 0;
  if (!(total > 0)) return null;
  const pagado = enUsd ? e.cobradoUsd : e.cobradoArs;
  const saldo = Math.max(0, Math.round((total - pagado) * 100) / 100);
  return {
    moneda: enUsd ? "USD" : "ARS",
    total,
    pagado,
    saldo,
    pct: Math.max(0, Math.min(100, Math.round((pagado / total) * 100))),
    otraMoneda: enUsd ? e.cobradoArs : e.cobradoUsd,
  };
}

/** Agenda partida en lo que viene (de hoy en adelante, ascendente) y lo que pasó. */
export function partirAgenda(eventos: EventoAgenda[], hoy: string) {
  const clave = (e: EventoAgenda) => `${e.fecha} ${e.hora ?? "99:99"}`;
  const orden = [...eventos].sort((a, b) => clave(a).localeCompare(clave(b)));
  return {
    proximos: orden.filter((e) => e.fecha >= hoy),
    pasados: orden.filter((e) => e.fecha < hoy).reverse(),
  };
}

/** Suma de tickets por moneda (nunca mezcla pesos con dólares). */
export function totalTickets(tickets: Pick<RegistroPortal, "importe" | "moneda">[]) {
  const t = { ARS: 0, USD: 0 };
  for (const x of tickets) if (x.importe != null) t[x.moneda] += x.importe;
  return t;
}

/** "12.500,50" / "12.500" / "12500.5" / 12500 → número; cualquier otra cosa → NaN. */
export function importeArgentino(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$\s]|US/gi, "");
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return s ? Number(s) : NaN;
}

/** ISO + n días, sin zona horaria. */
export function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Los 7 días (lunes a domingo) de la semana que contiene `iso`, corrida `offset` semanas. */
export function semana(iso: string, offset = 0): string[] {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const lunes = sumarDias(iso, -((dow + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-11-17" → { dia: "martes", num: "17", mes: "nov" } sin pasar por zona horaria. */
export function partesFecha(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return { dia: DIAS[dow] ?? "", num: String(d ?? ""), mes: MESES[(m ?? 1) - 1] ?? "" };
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** "hoy", "mañana" o "martes 17 nov". */
export function fechaRelativa(iso: string, hoy: string): string {
  if (iso === hoy) return "Hoy";
  const [y, m, d] = hoy.split("-").map(Number);
  const manana = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  if (iso === manana) return "Mañana";
  const p = partesFecha(iso);
  return `${p.dia.charAt(0).toUpperCase()}${p.dia.slice(1)} ${p.num} ${p.mes}`;
}

export function dinero(n: number, moneda: "ARS" | "USD"): string {
  const cifra = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n));
  return moneda === "USD" ? `US$ ${cifra}` : `$ ${cifra}`;
}

export function hoyBuenosAires(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora);
}

/** Nombre de obra para comparar lo que escribe el cliente: sin tildes, mayúsculas ni signos. "Obra  Forná!" → "obra forna". */
export function normalizarNombreObra(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugObra(nombre: string, sufijo: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${base || "obra"}-${sufijo}`;
}
