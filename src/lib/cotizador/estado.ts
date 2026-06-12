import type { DatosDocumento, EstadoCotizacion, Revision } from "./tipos";

export class TransicionInvalida extends Error {
  constructor(desde: EstadoCotizacion, accion: string) {
    super(`No se puede ${accion} una cotización en estado "${desde}"`);
    this.name = "TransicionInvalida";
  }
}

const REVISION_VACIA: Revision = {
  checklist: [],
  sanidad: [],
  precios_vencidos: [],
  divergencias: [],
  dudas: [],
};

/**
 * Gate del spec §6.4: el OK es explícito y solo desde la mesa (en_revision).
 * Estados: borrador → en_revision → aprobada → documento_emitido | rechazada.
 */
export function aprobar(
  estado: EstadoCotizacion,
  revision: Revision | null,
  importeFinal?: number
): { estado: "aprobada"; revision: Revision } {
  if (estado !== "en_revision") throw new TransicionInvalida(estado, "aprobar");
  const base = revision ?? REVISION_VACIA;
  return {
    estado: "aprobada",
    revision: {
      ...base,
      aprobacion: {
        fecha: new Date().toISOString().slice(0, 10),
        ...(importeFinal != null && Number.isFinite(importeFinal) && importeFinal > 0
          ? { importe_final: importeFinal }
          : {}),
      },
    },
  };
}

export function rechazar(
  estado: EstadoCotizacion,
  motivo: string
): { estado: "rechazada"; motivo_rechazo: string } {
  if (estado !== "en_revision") throw new TransicionInvalida(estado, "rechazar");
  const limpio = motivo.trim();
  if (!limpio) {
    throw new Error("El rechazo necesita motivo: alimenta cotizador_lecciones (spec §6.4).");
  }
  return { estado: "rechazada", motivo_rechazo: limpio };
}

export function emitir(
  estado: EstadoCotizacion,
  revision: Revision | null,
  documento: DatosDocumento
): { estado: "documento_emitido"; revision: Revision } {
  if (estado !== "aprobada") throw new TransicionInvalida(estado, "emitir");
  if (!documento.cliente.trim()) throw new Error("El documento necesita cliente.");
  if (!documento.lugar.trim()) throw new Error("El documento necesita lugar.");
  const base = revision ?? REVISION_VACIA;
  return { estado: "documento_emitido", revision: { ...base, documento } };
}
