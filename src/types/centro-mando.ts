/**
 * Tipos del Centro de Mando — espejo EXACTO del contrato de datos
 * (migraciones de Frente A). No renombrar campos ni estados.
 */

export const TIPOS_TRABAJO = ["cotizar", "redactar", "consulta", "orden"] as const;
export type TipoTrabajo = (typeof TIPOS_TRABAJO)[number];

export type EstadoTrabajo =
  | "pendiente"
  | "esperando_datos"
  | "procesando"
  | "en_revision"
  | "completado"
  | "error"
  | "cancelado";

export type TrabajoCola = {
  id: string;
  creado_at: string;
  actualizado_at: string;
  tipo: TipoTrabajo;
  origen: "whatsapp" | "tablero";
  estado: EstadoTrabajo;
  prompt: string;
  contexto: Record<string, unknown>;
  resultado: Record<string, unknown> | null;
  error: string | null;
};

export type OrigenEvento = "whatsapp" | "tablero" | "daemon" | "bot" | "sistema";
export type EstadoEvento = "procesado" | "pendiente_pregunta" | "archivado" | "resuelto";

export type Evento = {
  id: string;
  creado_at: string;
  origen: OrigenEvento;
  tipo: string;
  estado: EstadoEvento;
  titulo: string;
  contenido: Record<string, unknown>;
  destino_tabla: string | null;
  destino_id: string | null;
  /** Dedupe de webhooks de WhatsApp (lo escribe el bot, Frente C). Null para el resto. */
  wa_message_id: string | null;
};

export type EstadoCotizacion =
  | "borrador"
  | "en_revision"
  | "aprobada"
  | "rechazada"
  | "documento_emitido";

/** Subset de columnas de `cotizaciones` que lista el módulo de la home. */
export type CotizacionResumen = {
  id: string;
  creado_at: string;
  titulo: string;
  zona: string | null;
  estado: EstadoCotizacion;
  total_min: number | null;
  total_max: number | null;
};

export type Referencia = {
  id: string;
  creado_at: string;
  tipo: "filosofia" | "estetica";
  texto: string | null;
  etiquetas: string[];
  fuente: string | null;
  imagen_path: string | null;
  /** Evento de origen (captura por WhatsApp/bot) — null si nació en la app. */
  evento_id?: string | null;
  /** Generada server-side por /api/referencias (no existe en la tabla). */
  imagen_url?: string | null;
};

/** Evento archivado con media, pendiente de clasificar (vista ADN). */
export type SinClasificar = {
  id: string;
  creado_at: string;
  titulo: string;
  texto: string | null;
  imagen_path: string | null;
  imagen_url: string | null;
  tipo_media: string | null;
};

/** Tabla `tareas` existente (Tu Día) — fuente única de pendientes. */
export type Tarea = {
  id: string;
  texto: string;
  categoria: string;
  fecha: string | null;
  hora: string | null;
  estado: "pendiente" | "hecha";
  origen: string;
  nota: string | null;
  creado_at: string;
  /** Obra a la que pertenece (Ola B) — null = pendiente general de la home. */
  presupuesto_id: string | null;
};

/** Tabla `calendario_eventos` (Ola B): agenda del módulo SEMANA de la home. */
export type CalendarioEvento = {
  id: string;
  titulo: string;
  fecha: string;
  hora: string | null;
  fuente: "mac" | "manual";
  uid_externo: string | null;
  creado_at: string;
};

/** Tabla `obra_avances` (Ola B): bitácora de seguimiento de cada obra. */
export type ObraAvance = {
  id: string;
  presupuesto_id: string;
  texto: string;
  instancia: string | null;
  creado_at: string;
};

/** Lectura del vault para el módulo "El cerebro" (lib server-side src/lib/vault.ts). */
export type CerebroData = {
  orientacion: { titulo: string; siguientePaso: string | null } | null;
  patrones: { potencian: string[]; frenan: string[] };
  foda: {
    fortalezas: string[];
    oportunidades: string[];
    debilidades: string[];
    amenazas: string[];
  };
  error: string | null;
};
