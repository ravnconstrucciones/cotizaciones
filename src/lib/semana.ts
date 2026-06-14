/**
 * Lógica PURA del módulo SEMANA de la home (Ola B) — testeable sin DB.
 *
 * La semana corriente va de lunes a domingo (convención AR). Cada día junta
 * los eventos de calendario_eventos y las tareas con fecha de ese día.
 * Todo se calcula con partes de fecha LOCALES (nunca toISOString, que corre
 * el día en GMT-3 después de las 21hs).
 */
import type { CalendarioEvento, Tarea } from "@/types/centro-mando";

export type DiaSemana = {
  /** YYYY-MM-DD local. */
  fecha: string;
  /** LUN · MAR · MIÉ… */
  label: string;
  /** Día del mes (15). */
  dia: number;
  esHoy: boolean;
};

export type ItemDia =
  | { clase: "evento"; id: string; texto: string; hora: string | null }
  | {
      clase: "tarea";
      id: string;
      texto: string;
      hora: string | null;
      hecha: boolean;
    };

const LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

/** YYYY-MM-DD con partes locales (sin pasar por UTC). */
export function claveDia(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}

/**
 * "Hoy" en zona Argentina, como Date a medianoche local de ESA fecha.
 * Determinístico entre servidor (UTC) y cliente: ambos formatean el instante
 * actual en America/Argentina/Buenos_Aires → mismo Y/M/D. Sin esto, después
 * de las 21hs el SSR (UTC) calcula otro día que el cliente → error de
 * hidratación (#418) en la home.
 */
export function hoyAR(): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(partes[0], partes[1] - 1, partes[2]);
}

/** Los 7 días (lunes → domingo) de la semana de `hoy`. */
export function semanaCorriente(hoy: Date): DiaSemana[] {
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  // getDay(): 0=domingo … 6=sábado → offset al lunes de ESTA semana.
  const offset = (base.getDay() + 6) % 7;
  const lunes = new Date(base);
  lunes.setDate(base.getDate() - offset);

  const hoyClave = claveDia(base);
  return LABELS.map((label, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    const fecha = claveDia(d);
    return { fecha, label, dia: d.getDate(), esHoy: fecha === hoyClave };
  });
}

/** "HH:MM:SS" de la columna time de tareas → "HH:MM" (los eventos ya vienen así). */
function horaCorta(hora: string | null): string | null {
  return hora ? hora.slice(0, 5) : null;
}

/**
 * Items de UN día: primero los eventos de calendario (por hora, sin hora al
 * frente), después las tareas (pendientes antes que hechas, por hora).
 */
export function itemsDelDia(
  fecha: string,
  eventos: CalendarioEvento[],
  tareas: Tarea[]
): ItemDia[] {
  const porHora = (a: { hora: string | null }, b: { hora: string | null }) =>
    (a.hora ?? "").localeCompare(b.hora ?? "");

  const evs: ItemDia[] = eventos
    .filter((e) => e.fecha === fecha)
    .map((e) => ({
      clase: "evento" as const,
      id: e.id,
      texto: e.titulo,
      hora: horaCorta(e.hora),
    }))
    .sort(porHora);

  const ts: ItemDia[] = tareas
    .filter((t) => t.fecha === fecha)
    .map((t) => ({
      clase: "tarea" as const,
      id: t.id,
      texto: t.texto,
      hora: horaCorta(t.hora),
      hecha: t.estado === "hecha",
    }))
    .sort(
      (a, b) =>
        Number((a as { hecha: boolean }).hecha) -
          Number((b as { hecha: boolean }).hecha) || porHora(a, b)
    );

  return [...evs, ...ts];
}
