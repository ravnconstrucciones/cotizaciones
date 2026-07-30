/**
 * Tipos del módulo Diagnósticos (2026-07-28).
 *
 * El diagnóstico es el paso que faltaba entre el relevamiento de campo y la
 * cotización: nace del checklist de visita (o del dictado), se revisa acá y se
 * empuja a la mesa con "Enviar a cotizar".
 */

export const ESTADOS_DIAGNOSTICO = ["borrador", "listo", "enviado", "cotizado"] as const;
export type EstadoDiagnostico = (typeof ESTADOS_DIAGNOSTICO)[number];

export const ESTADO_LABEL: Record<EstadoDiagnostico, string> = {
  borrador: "Borrador",
  listo: "Listo",
  enviado: "Enviado",
  cotizado: "Cotizado",
};

export const ESTADO_COLOR: Record<EstadoDiagnostico, string> = {
  borrador: "text-cdm-muted ring-cdm-line",
  listo: "text-amber-400 ring-amber-400/40",
  enviado: "text-emerald-400 ring-emerald-400/40",
  cotizado: "text-cdm-accent ring-cdm-accent/40",
};

/** Sección del cuerpo del documento. `fotos` son storage_path del bucket privado. */
export type SeccionDiagnostico = {
  titulo: string;
  cuerpo: string;
  fotos?: string[];
};

export type ContenidoDiagnostico = {
  resumen?: string;
  secciones?: SeccionDiagnostico[];
  alcance?: string[];
  recomendaciones?: string[];
  /** Lo que el relevamiento NO trajo: se muestra en pantalla, nunca en el PDF. */
  faltantes?: string[];
};

export type Diagnostico = {
  id: string;
  creado_at: string;
  actualizado_at: string;
  titulo: string;
  direccion: string | null;
  cliente: string | null;
  estado: EstadoDiagnostico;
  presupuesto_id: string | null;
  trabajo_id: string | null;
  cotizacion_id: string | null;
  relevamiento: string;
  contenido: ContenidoDiagnostico;
  foto_portada_path: string | null;
};

export type DiagnosticoListado = Pick<
  Diagnostico,
  | "id"
  | "creado_at"
  | "actualizado_at"
  | "titulo"
  | "direccion"
  | "cliente"
  | "estado"
  | "presupuesto_id"
  | "cotizacion_id"
  | "foto_portada_path"
> & { foto_portada_url: string | null };
