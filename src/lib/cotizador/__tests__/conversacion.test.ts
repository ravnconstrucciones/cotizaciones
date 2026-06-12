import { describe, expect, it } from "vitest";
import {
  construirHilo,
  type EventoHilo,
  type TrabajoHilo,
} from "../conversacion";

function trabajo(parcial: Partial<TrabajoHilo>): TrabajoHilo {
  return {
    id: "t1",
    creado_at: "2026-06-12T10:00:00Z",
    actualizado_at: "2026-06-12T10:05:00Z",
    tipo: "cotizar",
    origen: "whatsapp",
    estado: "en_revision",
    prompt: "Cotizame pintura interior 80 m2",
    contexto: {},
    resultado: null,
    ...parcial,
  };
}

function evento(parcial: Partial<EventoHilo>): EventoHilo {
  return {
    id: "e1",
    creado_at: "2026-06-12T10:01:00Z",
    origen: "bot",
    tipo: "cotizacion_creada",
    titulo: "cotización en revisión",
    contenido: {},
    destino_id: null,
    ...parcial,
  };
}

describe("construirHilo", () => {
  it("arma el hilo del trabajo de origen: prompt, pregunta, respuestas y resumen", () => {
    const t = trabajo({
      contexto: {
        pregunta: "¿Las paredes están empapeladas?",
        respuestas: [{ texto: "No, revoque a la vista", ts: "2026-06-12T10:03:00Z" }],
      },
      resultado: { resumen: "Total en rango $X–$Y. Mesa lista." },
    });
    const hilo = construirHilo({ trabajoOrigenId: "t1", trabajos: [t], eventos: [] });

    expect(hilo.map((m) => [m.autor, m.etiqueta])).toEqual([
      ["eze", "WhatsApp"],
      ["eze", "respuesta"],
      ["sistema", "pregunta del sistema"],
      ["sistema", "resumen de mesa"],
    ]);
    expect(hilo[0].texto).toBe("Cotizame pintura interior 80 m2");
  });

  it("ordena cronológicamente mezclando trabajos y eventos", () => {
    const t = trabajo({});
    const ev = evento({ creado_at: "2026-06-12T09:00:00Z", titulo: "captura previa" });
    const hilo = construirHilo({ trabajoOrigenId: "t1", trabajos: [t], eventos: [ev] });
    expect(hilo[0].texto).toBe("captura previa");
    expect(hilo[1].autor).toBe("eze");
  });

  it("trabajo derivado por corrección: muestra la corrección literal como mensaje de Eze, no el prompt armado", () => {
    const derivado = trabajo({
      id: "t2",
      origen: "tablero",
      prompt: 'Re-cotizar "Pintura" aplicando esta corrección de Eze: sumá el cielorraso',
      contexto: { correccion: "sumá el cielorraso", cotizacion_anterior: "c1" },
    });
    const hilo = construirHilo({ trabajoOrigenId: null, trabajos: [derivado], eventos: [] });
    expect(hilo).toHaveLength(1);
    expect(hilo[0]).toMatchObject({ autor: "eze", etiqueta: "corrección", texto: "sumá el cielorraso" });
  });

  it("trabajo consulta: usa contexto.mensaje como texto de Eze", () => {
    const consulta = trabajo({
      id: "t3",
      tipo: "consulta",
      origen: "tablero",
      prompt: 'Consulta sobre la cotización "Pintura" (id c1, estado aprobada): ¿incluye andamios?',
      contexto: { cotizacion_id: "c1", mensaje: "¿incluye andamios?" },
      resultado: { resumen: "Sí, en extras." },
    });
    const hilo = construirHilo({ trabajoOrigenId: null, trabajos: [consulta], eventos: [] });
    expect(hilo.map((m) => [m.autor, m.texto])).toEqual([
      ["eze", "¿incluye andamios?"],
      ["sistema", "Sí, en extras."],
    ]);
    expect(hilo[1].etiqueta).toBe("respuesta del sistema");
  });

  it("dedupe: los eventos espejo de trabajos renderizados no se repiten", () => {
    const t = trabajo({});
    const espejo = evento({
      id: "e2",
      origen: "tablero",
      tipo: "trabajo_creado",
      titulo: "[cotizar] Cotizame pintura interior 80 m2",
      contenido: { trabajo_id: "t1" },
    });
    const espejoDestino = evento({
      id: "e3",
      origen: "daemon",
      tipo: "trabajo_completado",
      titulo: "trabajo completado",
      destino_id: "t1",
    });
    const hilo = construirHilo({
      trabajoOrigenId: "t1",
      trabajos: [t],
      eventos: [espejo, espejoDestino],
    });
    expect(hilo).toHaveLength(1);
  });

  it("evento con motivo: lo agrega entre comillas y marca autor por origen", () => {
    const rechazo = evento({
      id: "e4",
      origen: "bot",
      tipo: "cotizacion_rechazada",
      titulo: "cotización a corregir: Pintura",
      contenido: { cotizacion_id: "c1", motivo: "faltó el zócalo" },
    });
    const hilo = construirHilo({ trabajoOrigenId: null, trabajos: [], eventos: [rechazo] });
    expect(hilo[0].autor).toBe("sistema");
    expect(hilo[0].texto).toContain('"faltó el zócalo"');
    expect(hilo[0].etiqueta).toBe("cotizacion rechazada");
  });
});
