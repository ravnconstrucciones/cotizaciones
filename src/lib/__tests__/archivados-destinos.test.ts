import { describe, expect, it } from "vitest";
import {
  bucketDeImagen,
  imagenDeEvento,
  resolverDestino,
  textoDeEvento,
} from "../archivados-destinos";

const EVENTO = {
  id: "11111111-1111-1111-1111-111111111111",
  titulo: "Mensaje sin clasificar",
  contenido: { texto: "acordate de pasar por lo de Oribe" },
};

const EVENTO_SIN_TEXTO = {
  id: "22222222-2222-2222-2222-222222222222",
  titulo: "Título pelado",
  contenido: {},
};

const EVENTO_CON_IMAGEN = {
  id: "33333333-3333-3333-3333-333333333333",
  titulo: "Foto sin clasificar",
  contenido: { texto: "fachada de hormigón visto", imagen_path: "whatsapp/abc123.jpg" },
};

describe("textoDeEvento", () => {
  it("usa contenido.texto si existe, si no el título", () => {
    expect(textoDeEvento(EVENTO)).toBe("acordate de pasar por lo de Oribe");
    expect(textoDeEvento(EVENTO_SIN_TEXTO)).toBe("Título pelado");
  });
});

describe("imagenDeEvento", () => {
  it("devuelve contenido.imagen_path si existe, si no null", () => {
    expect(imagenDeEvento(EVENTO_CON_IMAGEN)).toBe("whatsapp/abc123.jpg");
    expect(imagenDeEvento(EVENTO)).toBeNull();
  });
});

describe("resolverDestino", () => {
  it("tarea: insert en tareas con origen web", () => {
    const r = resolverDestino(EVENTO, "tarea");
    expect(r).toEqual({
      ok: true,
      resolucion: {
        accion: "insert",
        tabla: "tareas",
        payload: {
          texto: "acordate de pasar por lo de Oribe",
          categoria: "Personal",
          origen: "web",
        },
      },
    });
  });

  it("gasto_personal: exige monto > 0", () => {
    expect(resolverDestino(EVENTO, "gasto_personal").ok).toBe(false);
    expect(resolverDestino(EVENTO, "gasto_personal", { monto: 0 }).ok).toBe(false);
    const r = resolverDestino(EVENTO, "gasto_personal", { monto: 12500, categoria: "Combustible" });
    expect(r.ok).toBe(true);
    if (r.ok && r.resolucion.accion === "insert") {
      expect(r.resolucion.tabla).toBe("gastos_personales");
      expect(r.resolucion.payload).toMatchObject({
        concepto: "acordate de pasar por lo de Oribe",
        monto: 12500,
        categoria: "Combustible",
        origen: "app",
      });
      expect(r.resolucion.payload.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("gasto_personal sin categoría usa Varios", () => {
    const r = resolverDestino(EVENTO, "gasto_personal", { monto: 100 });
    if (r.ok && r.resolucion.accion === "insert") {
      expect(r.resolucion.payload.categoria).toBe("Varios");
    } else {
      throw new Error("debería resolver");
    }
  });

  it("gasto_obra: exige monto > 0 y presupuesto_id", () => {
    expect(resolverDestino(EVENTO, "gasto_obra").ok).toBe(false);
    expect(resolverDestino(EVENTO, "gasto_obra", { monto: 100 }).ok).toBe(false);
    expect(resolverDestino(EVENTO, "gasto_obra", { presupuesto_id: "p-1" }).ok).toBe(false);
  });

  it("gasto_obra: insert en presupuestos_gastos", () => {
    const r = resolverDestino(EVENTO, "gasto_obra", { monto: 50000, presupuesto_id: "p-1" });
    expect(r.ok).toBe(true);
    if (r.ok && r.resolucion.accion === "insert") {
      expect(r.resolucion.tabla).toBe("presupuestos_gastos");
      expect(r.resolucion.payload).toMatchObject({
        presupuesto_id: "p-1",
        descripcion: "acordate de pasar por lo de Oribe",
        importe: 50000,
        rubro_id: null,
      });
      expect(r.resolucion.payload.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("filosofia: insert en referencias con evento_id", () => {
    const r = resolverDestino(EVENTO, "filosofia");
    expect(r).toEqual({
      ok: true,
      resolucion: {
        accion: "insert",
        tabla: "referencias",
        payload: {
          tipo: "filosofia",
          texto: "acordate de pasar por lo de Oribe",
          etiquetas: [],
          fuente: "archivados",
          evento_id: EVENTO.id,
        },
      },
    });
  });

  it("referencia_estetica: insert en referencias con etiquetas e imagen del evento", () => {
    const r = resolverDestino(EVENTO_CON_IMAGEN, "referencia_estetica", {
      etiquetas: ["tipografia", "material"],
    });
    expect(r).toEqual({
      ok: true,
      resolucion: {
        accion: "insert",
        tabla: "referencias",
        payload: {
          tipo: "estetica",
          texto: "fachada de hormigón visto",
          etiquetas: ["tipografia", "material"],
          fuente: "archivados",
          imagen_path: "whatsapp/abc123.jpg",
          evento_id: EVENTO_CON_IMAGEN.id,
        },
      },
    });
  });

  it("referencia_estetica sin etiquetas usa []", () => {
    const r = resolverDestino(EVENTO, "referencia_estetica");
    if (r.ok && r.resolucion.accion === "insert") {
      expect(r.resolucion.payload.etiquetas).toEqual([]);
      expect(r.resolucion.payload.imagen_path).toBeNull();
    } else {
      throw new Error("debería resolver");
    }
  });

  it("foto_obra: exige presupuesto_id e imagen guardada", () => {
    expect(resolverDestino(EVENTO_CON_IMAGEN, "foto_obra").ok).toBe(false);
    // sin imagen en Storage no hay nada que encarpetar (el media de WhatsApp expira)
    expect(
      resolverDestino(EVENTO, "foto_obra", { presupuesto_id: "p-1" }).ok
    ).toBe(false);
  });

  it("foto_obra con imagen en referencias: insert + copia al bucket obra-archivos", () => {
    const r = resolverDestino(EVENTO_CON_IMAGEN, "foto_obra", {
      presupuesto_id: "p-1",
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.resolucion.accion === "insert") {
      expect(r.resolucion.tabla).toBe("obra_archivos");
      expect(r.resolucion.payload).toEqual({
        presupuesto_id: "p-1",
        tipo: "foto",
        titulo: "fachada de hormigón visto",
        storage_path: `archivados/${EVENTO_CON_IMAGEN.id}.jpg`,
        evento_id: EVENTO_CON_IMAGEN.id,
      });
      expect(r.resolucion.copiarImagen).toEqual({
        desdeBucket: "referencias",
        desdePath: "whatsapp/abc123.jpg",
        haciaBucket: "obra-archivos",
        haciaPath: `archivados/${EVENTO_CON_IMAGEN.id}.jpg`,
      });
    }
  });

  it("foto_obra ya subida a obra-archivos por el bot: insert directo, sin copia", () => {
    const evento = {
      id: "44444444-4444-4444-4444-444444444444",
      titulo: "Foto de obra",
      contenido: {
        texto: "avance contrapiso",
        imagen_path: "whatsapp/obra-9.jpg",
        imagen_bucket: "obra-archivos",
      },
    };
    expect(bucketDeImagen(evento)).toBe("obra-archivos");
    const r = resolverDestino(evento, "foto_obra", { presupuesto_id: "p-2" });
    expect(r.ok).toBe(true);
    if (r.ok && r.resolucion.accion === "insert") {
      expect(r.resolucion.payload.storage_path).toBe("whatsapp/obra-9.jpg");
      expect(r.resolucion.copiarImagen).toBeUndefined();
    }
  });

  it("bucketDeImagen sin anotación cae a referencias (flujo histórico)", () => {
    expect(bucketDeImagen(EVENTO_CON_IMAGEN)).toBe("referencias");
  });

  it("descartar: sin insert", () => {
    expect(resolverDestino(EVENTO, "descartar")).toEqual({
      ok: true,
      resolucion: { accion: "descartar" },
    });
  });

  it("destino inválido: error", () => {
    // @ts-expect-error — caso de runtime con destino fuera del union
    expect(resolverDestino(EVENTO, "otro").ok).toBe(false);
  });
});
