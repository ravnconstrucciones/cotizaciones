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

/** Confianza de un dato de receta candidata (ley 1: todo número con traza). */
export type ConfianzaDato = "verificado" | "estimado";

/**
 * De dónde salió una cantidad/fórmula de una receta candidata y con qué
 * confianza. Obligatorio en candidatas (lo exige validarRecetaCandidata):
 * un ítem sin origen es un número inventado, y eso está prohibido.
 */
export type OrigenDato = {
  fuente: string; // "ficha Superboard (Eternit)", "Seia: revestimientos", "SISMAT 4721"
  confianza: ConfianzaDato;
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
  /** Traza del dato en recetas candidatas: fuente + confianza (ley 1). */
  origen?: OrigenDato;
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
  estado: "candidata" | "investigada" | "confiable";
  parametros: ParametroReceta[];
  etapas: EtapaReceta[];
  checklist: string[]; // anti-olvidos propios del tipo de laburo
  fuentes: FuenteReceta[];
  version: number;
  /** Solo candidatas: lo que el sistema NO pudo determinar y le pregunta a Eze. */
  preguntas_abiertas?: string[];
};

/** Todo precio del desglose lleva valor + fuente + fecha (vencimiento §6.2.4). */
export type PrecioFechado = {
  valor: number;
  fuente: string; // "SISMAT", "easy.com.ar", "ficha Weber", url, etc.
  fecha: string; // YYYY-MM-DD — cuándo se obtuvo
};

/**
 * Doble precio por ítem: SISMAT referencia + internet vivo (el que exista).
 * `retail` es un TERCER precio de REFERENCIA — sale de la cadena grande que es
 * referencia del rubro (Easy/Prestigio/Blaisten, ver retail.ts): NO entra en el
 * total ni dispara alertas — sirve de desempate cuando SISMAT e internet
 * divergen (te dice a cuál le da la razón el mercado).
 * `eze` es el precio corregido por Eze en la mesa (regla de oro Tramo B): si
 * existe, PISA el rango (min = max = eze.valor); sismat/internet quedan como
 * referencia visible. Así la mesa calibra al cotizador.
 */
export type PrecioItem = {
  sismat?: PrecioFechado;
  internet?: PrecioFechado;
  retail?: PrecioFechado;
  eze?: PrecioFechado;
};

export type OrigenPrecio = "sismat" | "internet" | "retail" | "eze";

/** Fila de `precios_items` — cache fechado que alimenta el panel /cotizar. */
export type PrecioItemRow = {
  item: string;
  origen: OrigenPrecio;
  valor: number;
  fuente: string;
  fecha: string; // YYYY-MM-DD
  revisado_at: string; // ISO — cuándo lo escribió el sistema
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
  /** false = Eze lo sacó del alcance en la mesa (no suma al total; queda visible). */
  activo?: boolean;
  /** true = la cantidad la pisó Eze en la mesa (la fórmula queda de traza). */
  cantidad_editada?: boolean;
  /** true = ítem agregado a mano en la mesa (no viene de la receta). */
  manual?: boolean;
  /** Rubro fijado a mano (ítems manuales); si falta se infiere de etapa+nombre (rubros.ts). */
  rubro?: string;
};

/**
 * Ajustes de la mesa (hoja viva, Tramo B) sobre UN ítem de receta, por nombre.
 * Se persisten en desglose.ajustes y se re-aplican en cada corrida del motor,
 * así una edición sobrevive a re-corridas por cambio de parámetros.
 */
export type AjusteItem = {
  nombre: string; // ItemDesglose.nombre al que aplica
  activo?: boolean; // false = fuera del alcance
  cantidad?: number; // pisa la cantidad final (post-desperdicio)
  precio_eze?: PrecioFechado; // pisa el rango (regla de oro)
};

/** Ítem agregado a mano en la mesa — no existe en la receta. */
export type ItemManualMesa = {
  nombre: string;
  rubro: string; // id de rubros.ts, lo elige Eze al agregarlo
  tipo: TipoItem;
  unidad: Unidad;
  cantidad: number;
  precio?: PrecioFechado; // sin precio ⇒ queda como hueco visible (ley 1)
  notas?: string;
};

/** Todo lo editado en la mesa. Vive en desglose.ajustes. */
export type AjustesMesa = {
  items?: AjusteItem[];
  manuales?: ItemManualMesa[];
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
  /** Ediciones de la mesa (hoja viva) — se re-aplican en cada corrida. */
  ajustes?: AjustesMesa;
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
   * Desempate retail (precio de la cadena de referencia del rubro, si se pudo
   * traer): el precio y a cuál de los dos (SISMAT o internet) se acerca más.
   * Ayuda a decidir quién tiene razón en una divergencia crítica. `null` = el
   * retail no concluye.
   */
  retail?: number;
  fuente_retail?: string;
  retail_respalda?: "sismat" | "internet" | null;
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
  foto_portada_path: string | null;
};

/** Fila de cotizacion_archivos — una propuesta adjunta (cara PROPUESTA). */
export type CotizacionArchivo = {
  id: string;
  tipo: string;
  titulo: string | null;
  creado_at: string;
  /** Signed URL del bucket privado (server-side). null si la firma falló. */
  url: string | null;
};
