import { describe, expect, it } from "vitest";
import { claveDia, hoyAR, itemsDelDia, semanaCorriente } from "@/lib/semana";
import type { CalendarioEvento, Tarea } from "@/types/centro-mando";

describe("hoyAR (anti hydration #418)", () => {
  it("devuelve una fecha válida a medianoche local", () => {
    const h = hoyAR();
    expect(h instanceof Date).toBe(true);
    expect(Number.isNaN(h.getTime())).toBe(false);
    expect(h.getHours()).toBe(0);
    expect(h.getMinutes()).toBe(0);
    expect(h.getSeconds()).toBe(0);
  });

  it("la semana de hoyAR tiene exactamente un día marcado como HOY", () => {
    const dias = semanaCorriente(hoyAR());
    expect(dias).toHaveLength(7);
    expect(dias.filter((d) => d.esHoy)).toHaveLength(1);
  });
});

function evento(parcial: Partial<CalendarioEvento>): CalendarioEvento {
  return {
    id: "e-1",
    titulo: "Evento",
    fecha: "2026-06-15",
    hora: null,
    fuente: "mac",
    uid_externo: "uid-1",
    creado_at: "2026-06-12T10:00:00Z",
    ...parcial,
  };
}

function tarea(parcial: Partial<Tarea>): Tarea {
  return {
    id: "t-1",
    texto: "Tarea",
    categoria: "Obra",
    fecha: "2026-06-15",
    hora: null,
    estado: "pendiente",
    origen: "web",
    nota: null,
    creado_at: "2026-06-12T10:00:00Z",
    presupuesto_id: null,
    ...parcial,
  };
}

describe("semanaCorriente", () => {
  it("un miércoles devuelve lunes a domingo de esa semana, con HOY marcado", () => {
    // 2026-06-17 es miércoles
    const dias = semanaCorriente(new Date(2026, 5, 17, 15, 30));
    expect(dias.map((d) => d.fecha)).toEqual([
      "2026-06-15",
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
    ]);
    expect(dias.map((d) => d.label)).toEqual([
      "LUN",
      "MAR",
      "MIÉ",
      "JUE",
      "VIE",
      "SÁB",
      "DOM",
    ]);
    expect(dias.filter((d) => d.esHoy).map((d) => d.fecha)).toEqual([
      "2026-06-17",
    ]);
  });

  it("el lunes y el domingo caen dentro de la MISMA semana", () => {
    // lunes 2026-06-15 y domingo 2026-06-21
    expect(semanaCorriente(new Date(2026, 5, 15))[0].esHoy).toBe(true);
    const dom = semanaCorriente(new Date(2026, 5, 21));
    expect(dom[0].fecha).toBe("2026-06-15");
    expect(dom[6].esHoy).toBe(true);
  });

  it("cruza el cambio de mes sin pasar por UTC", () => {
    // miércoles 2026-07-01 → la semana arranca el lunes 29/06
    const dias = semanaCorriente(new Date(2026, 6, 1, 23, 50));
    expect(dias[0].fecha).toBe("2026-06-29");
    expect(dias[6].fecha).toBe("2026-07-05");
    expect(dias[2].dia).toBe(1);
  });
});

describe("claveDia", () => {
  it("usa partes locales (23:50 no corre el día)", () => {
    expect(claveDia(new Date(2026, 5, 15, 23, 50))).toBe("2026-06-15");
  });
});

describe("itemsDelDia", () => {
  it("filtra por fecha y pone eventos antes que tareas", () => {
    const items = itemsDelDia(
      "2026-06-15",
      [
        evento({ id: "e-1", titulo: "Visita Saavedra", hora: "09:30" }),
        evento({ id: "e-otro", fecha: "2026-06-16" }),
      ],
      [tarea({ id: "t-1", texto: "Mandar presupuesto" })]
    );
    expect(items.map((i) => i.clase)).toEqual(["evento", "tarea"]);
    expect(items[0].texto).toBe("Visita Saavedra");
  });

  it("ordena eventos por hora (sin hora primero) y recorta HH:MM de tareas", () => {
    const items = itemsDelDia(
      "2026-06-15",
      [
        evento({ id: "e-2", titulo: "Tarde", hora: "16:00" }),
        evento({ id: "e-3", titulo: "Todo el día", hora: null }),
        evento({ id: "e-1", titulo: "Mañana", hora: "09:00" }),
      ],
      [tarea({ id: "t-1", hora: "10:30:00" })]
    );
    expect(items.map((i) => i.texto)).toEqual([
      "Todo el día",
      "Mañana",
      "Tarde",
      "Tarea",
    ]);
    expect(items[3].hora).toBe("10:30");
  });

  it("tareas pendientes van antes que las hechas", () => {
    const items = itemsDelDia(
      "2026-06-15",
      [],
      [
        tarea({ id: "t-1", texto: "Ya está", estado: "hecha", hora: "08:00:00" }),
        tarea({ id: "t-2", texto: "Falta", estado: "pendiente", hora: "18:00:00" }),
      ]
    );
    expect(items.map((i) => i.texto)).toEqual(["Falta", "Ya está"]);
    expect((items[1] as { hecha: boolean }).hecha).toBe(true);
  });
});
