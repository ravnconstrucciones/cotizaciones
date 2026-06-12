/**
 * Mapeo PURO evento archivado → acción de resolución (testeado con Vitest).
 * La ruta /api/archivados/resolver ejecuta la resolución contra Supabase.
 */

export const DESTINOS_ARCHIVADO = [
  "tarea",
  "gasto_obra",
  "foto_obra",
  "gasto_personal",
  "filosofia",
  "referencia_estetica",
  "descartar",
] as const;
export type DestinoArchivado = (typeof DESTINOS_ARCHIVADO)[number];

export type EventoArchivado = {
  id: string;
  titulo: string;
  contenido: Record<string, unknown>;
};

export type OpcionesResolver = {
  monto?: number;
  categoria?: string;
  presupuesto_id?: string;
  etiquetas?: string[];
};

export type ResolucionArchivado =
  | {
      accion: "insert";
      tabla:
        | "tareas"
        | "gastos_personales"
        | "presupuestos_gastos"
        | "referencias"
        | "obra_archivos";
      payload: Record<string, unknown>;
      /**
       * foto_obra: la imagen del evento vive en otro bucket (p.ej.
       * `referencias`) — la ruta la copia a `obra-archivos` ANTES del insert.
       */
      copiarImagen?: {
        desdeBucket: string;
        desdePath: string;
        haciaBucket: string;
        haciaPath: string;
      };
    }
  | { accion: "descartar" };

/** Texto fuente del evento: `contenido.texto` (lo escribe el bot) o el título. */
export function textoDeEvento(e: EventoArchivado): string {
  const t = e.contenido?.texto;
  return typeof t === "string" && t.trim() ? t.trim() : e.titulo;
}

/** Imagen adjunta del evento (la sube el bot al bucket `referencias`), o null. */
export function imagenDeEvento(e: EventoArchivado): string | null {
  const p = e.contenido?.imagen_path;
  return typeof p === "string" && p.trim() ? p.trim() : null;
}

/**
 * Bucket donde el bot dejó la imagen del evento. Las fotos de obra ambiguas
 * ya suben a `obra-archivos` (el bot lo anota en contenido.imagen_bucket);
 * el resto del flujo histórico sube a `referencias`.
 */
export function bucketDeImagen(e: EventoArchivado): string {
  const b = e.contenido?.imagen_bucket;
  return typeof b === "string" && b.trim() ? b.trim() : "referencias";
}

export function resolverDestino(
  evento: EventoArchivado,
  destino: DestinoArchivado,
  opciones: OpcionesResolver = {}
): { ok: true; resolucion: ResolucionArchivado } | { ok: false; error: string } {
  const texto = textoDeEvento(evento);
  switch (destino) {
    case "tarea":
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "tareas",
          payload: { texto, categoria: "Personal", origen: "web" },
        },
      };
    case "gasto_obra": {
      const monto = Number(opciones.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        return { ok: false, error: "monto requerido (> 0) para gasto de obra." };
      }
      if (!opciones.presupuesto_id) {
        return { ok: false, error: "presupuesto_id requerido para gasto de obra." };
      }
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "presupuestos_gastos",
          payload: {
            presupuesto_id: opciones.presupuesto_id,
            fecha: new Date().toISOString().slice(0, 10),
            descripcion: texto,
            importe: monto,
            rubro_id: null,
          },
        },
      };
    }
    case "gasto_personal": {
      const monto = Number(opciones.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        return { ok: false, error: "monto requerido (> 0) para gasto personal." };
      }
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "gastos_personales",
          payload: {
            concepto: texto,
            monto,
            categoria: opciones.categoria || "Varios",
            fecha: new Date().toISOString().slice(0, 10),
            origen: "app",
          },
        },
      };
    }
    case "foto_obra": {
      if (!opciones.presupuesto_id) {
        return { ok: false, error: "presupuesto_id requerido para foto de obra." };
      }
      const imagen = imagenDeEvento(evento);
      if (!imagen) {
        return {
          ok: false,
          error:
            "el evento no tiene imagen guardada en Storage (la foto original de WhatsApp ya no es accesible desde acá).",
        };
      }
      const bucket = bucketDeImagen(evento);
      const yaEnCarpeta = bucket === "obra-archivos";
      const ext = imagen.includes(".")
        ? imagen.slice(imagen.lastIndexOf(".") + 1).toLowerCase()
        : "jpg";
      const storagePath = yaEnCarpeta ? imagen : `archivados/${evento.id}.${ext}`;
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "obra_archivos",
          payload: {
            presupuesto_id: opciones.presupuesto_id,
            tipo: "foto",
            titulo: texto,
            storage_path: storagePath,
            evento_id: evento.id,
          },
          ...(yaEnCarpeta
            ? {}
            : {
                copiarImagen: {
                  desdeBucket: bucket,
                  desdePath: imagen,
                  haciaBucket: "obra-archivos",
                  haciaPath: storagePath,
                },
              }),
        },
      };
    }
    case "referencia_estetica":
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "referencias",
          payload: {
            tipo: "estetica",
            texto,
            etiquetas: opciones.etiquetas ?? [],
            fuente: "archivados",
            imagen_path: imagenDeEvento(evento),
            evento_id: evento.id,
          },
        },
      };
    case "filosofia":
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "referencias",
          payload: {
            tipo: "filosofia",
            texto,
            etiquetas: [],
            fuente: "archivados",
            evento_id: evento.id,
          },
        },
      };
    case "descartar":
      return { ok: true, resolucion: { accion: "descartar" } };
    default:
      return { ok: false, error: `destino inválido: ${String(destino)}.` };
  }
}
