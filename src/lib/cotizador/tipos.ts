/**
 * Tipos del Cotizador 2.0 — espejo EXACTO de los jsonb del contrato de datos
 * (tablas `recetas` y `cotizaciones`, migraciones del Frente A).
 * Regla madre (spec §6.2.1): la IA elige receta y precios; este código hace
 * TODA la aritmética. La IA NUNCA suma.
 */

export type Unidad =
  | "m2"
  | "ml"
  | "u"
  | "kg"
  | "l"
  | "bolsa"
  | "caja"
  | "m3"
  | "rollo"
  | "dia"
  | "global";

export type TipoItem = "material" | "mano_de_obra";

/** recetas.parametros — qué datos pide la receta para instanciarse. */
export type ParametroReceta = {
  nombre: string; // identificador usable en fórmulas: "superficie_m2"
  etiqueta: string; // "Superficie a pintar (m²)"
  tipo: "numero" | "texto" | "opcion";
  requerido: boolean;
  opciones?: string[]; // solo tipo "opcion"
};

/** Rango físico admisible de cantidad relativa a un parámetro (sanidad física §6.2.7). */
export type RangoFisico = {
  parametro: string; // ej. "superficie_m2"
  min: number; // cantidad mínima admisible por unidad del parámetro
  max: number; // cantidad máxima admisible por unidad del parámetro
};

/** Ítem de una etapa de la receta. La fórmula se evalúa con los parámetros numéricos. */
export type ItemReceta = {
  nombre: string; // "Látex interior 20L"
  tipo: TipoItem;
  unidad: Unidad;
  formula: string; // "ceil(superficie_m2 / 10)" — ver formula.ts
  desperdicio_pct?: number; // 0–100; default 0
  redondeo?: "arriba" | "ninguno"; // default: "arriba" material, "ninguno" MO
  rango_fisico?: RangoFisico;
  notas?: string;
};

export type EtapaReceta = {
  nombre: string; // "Preparación de superficie"
  orden: number;
  items: ItemReceta[];
  dias_min?: number;
  dias_max?: number;
  cuadrilla?: number; // personas
};

export type FuenteReceta = {
  titulo: string; // "Ficha técnica Weber Superflex"
  tipo: "fabricante" | "seia" | "internet" | "tarifario" | "obra";
  url?: string;
  fecha: string; // YYYY-MM-DD
};

/** Fila completa de `recetas` (espejo de la tabla del contrato). */
export type Receta = {
  id?: string;
  nombre: string; // slug único: "pintura-interior"
  titulo: string; // "Pintura interior completa"
  estado: "investigada" | "confiable";
  parametros: ParametroReceta[];
  etapas: EtapaReceta[];
  checklist: string[]; // anti-olvidos propios del tipo de laburo
  fuentes: FuenteReceta[];
  version: number;
};

/** Todo precio del desglose lleva valor + fuente + fecha (vencimiento §6.2.4). */
export type PrecioFechado = {
  valor: number;
  fuente: string; // "SISMAT", "easy.com.ar", "ficha Weber", url, etc.
  fecha: string; // YYYY-MM-DD — cuándo se obtuvo
};

/**
 * Doble precio por ítem: SISMAT referencia + internet vivo (el que exista).
 * `mercadolibre` es un TERCER precio de REFERENCIA (retail, API pública de ML):
 * NO entra en el total ni dispara alertas — sirve de desempate cuando SISMAT e
 * internet divergen (te dice a cuál le da la razón el mercado).
 */
export type PrecioItem = {
  sismat?: PrecioFechado;
  internet?: PrecioFechado;
  mercadolibre?: PrecioFechado;
};

export type ItemDesglose = {
  nombre: string;
  etapa: string;
  tipo: TipoItem;
  unidad: Unidad;
  formula: string;
  cantidad_base: number; // resultado crudo de la fórmula
  desperdicio_pct: number;
  cantidad: number; // con desperdicio y redondeo aplicados
  precios: PrecioItem;
  precio_min: number | null; // min entre fuentes disponibles (null = sin precio)
  precio_max: number | null;
  subtotal_min: number;
  subtotal_max: number;
  divergencia_pct: number | null; // |a-b|/menor*100 si hay ambos precios
  sin_precio: boolean;
  rango_fisico?: RangoFisico;
  notas?: string;
};

/** Extra fuera de receta (flete, volquete, …): monto directo con fuente fechada. */
export type ExtraDesglose = {
  nombre: string;
  monto_min: number;
  monto_max: number;
  fuente: string;
  fecha: string; // YYYY-MM-DD
};

export type TotalesDesglose = {
  materiales_min: number;
  materiales_max: number;
  mano_de_obra_min: number;
  mano_de_obra_max: number;
  extras_min: number;
  extras_max: number;
  subtotal_min: number;
  subtotal_max: number; // antes de imprevistos y zona
  imprevistos_pct: number;
  factor_zona_min: number; // 1 si no aplica
  factor_zona_max: number;
  total_min: number; // enteros, redondeados
  total_max: number;
};

/** cotizaciones.desglose — lo que la mesa de revisión muestra ítem por ítem. */
export type Desglose = {
  receta_nombre: string;
  receta_version: number;
  parametros: Record<string, number | string>;
  items: ItemDesglose[];
  extras: ExtraDesglose[];
  totales: TotalesDesglose;
  tiempo: { dias_min: number; dias_max: number; cuadrilla_max: number };
  generado_at: string; // ISO
};

export type ResultadoChecklist = {
  item: string;
  estado: "cubierto" | "faltante" | "no_aplica";
  detalle: string;
};

export type ResultadoSanidad = {
  chequeo: string;
  estado: "ok" | "fuera_de_rango" | "sin_datos";
  detalle: string;
};

export type AvisoVencido = {
  item: string;
  fuente: string;
  fecha: string;
  dias: number; // antigüedad del precio
  limite: number; // 15 (material) o 30 (MO)
};

export type Divergencia = {
  item: string;
  sismat: number;
  internet: number;
  divergencia_pct: number;
  /**
   * "marca" (>25%): revisar. "critica" (>=100%, uno es ≥2x el otro): hace
   * RUIDO — casi siempre es un ítem SISMAT equivocado para el laburo (el caso
   * pileta: "excavación de sótano a máquina" usada para excavar una pileta).
   */
  nivel: "marca" | "critica";
  /** De dónde salió cada precio — para cazar el ítem equivocado de un vistazo. */
  fuente_sismat: string;
  fuente_internet: string;
  /**
   * Desempate de MercadoLibre (referencia retail, si se pudo traer): el precio
   * y a cuál de los dos (SISMAT o internet) se acerca más. Ayuda a decidir
   * quién tiene razón en una divergencia crítica. `null` = ML no concluye.
   */
  mercadolibre?: number;
  fuente_mercadolibre?: string;
  ml_respalda?: "sismat" | "internet" | null;
};

/** Datos del documento final (los carga Eze al emitir desde la mesa). */
export type DatosDocumento = {
  cliente: string;
  lugar: string;
  forma_pago: string[];
  plazo: string[];
  notas: string[];
};

/** cotizaciones.revision — resultado del revisor para la mesa (§6.4). */
export type Revision = {
  checklist: ResultadoChecklist[];
  sanidad: ResultadoSanidad[];
  precios_vencidos: AvisoVencido[];
  divergencias: Divergencia[]; // solo >25%
  dudas: string[]; // preguntas abiertas de la IA para Eze
  aprobacion?: { fecha: string; importe_final?: number };
  documento?: DatosDocumento;
};

/** cotizaciones.ficha — los datos que mueven el precio (§6.2.6). */
export type Ficha = {
  trabajo: string;
  zona?: string;
  estado_actual?: string;
  calidad?: string;
  acceso?: string;
  parametros: Record<string, number | string>; // valores de receta.parametros
};

/** Estados de cotizaciones (contrato). */
export type EstadoCotizacion =
  | "borrador"
  | "en_revision"
  | "aprobada"
  | "rechazada"
  | "documento_emitido";

/** Fila de la tabla cotizaciones tal como la consume la app. */
export type CotizacionRow = {
  id: string;
  creado_at: string;
  trabajo_id: string | null;
  titulo: string;
  zona: string | null;
  estado: EstadoCotizacion;
  receta_id: string | null;
  ficha: Ficha;
  desglose: Desglose | Record<string, never>;
  total_min: number | null;
  total_max: number | null;
  revision: Revision | null;
  motivo_rechazo: string | null;
  presupuesto_id: string | null;
};
