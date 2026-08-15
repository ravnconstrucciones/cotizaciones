import type { CotizacionRow, ItemDesglose } from "../../../../src/lib/cotizador/tipos";
import {
  projectQuoteSummary,
  projectQuoteWorkspace,
  type MensajeHilo,
  type QuoteSummary,
  type QuoteWorkspaceSnapshot,
} from "./quote-workspace";

export type PreviewData = {
  synthetic: true;
  source: "local_fixture";
  label: string;
  disclaimer: string;
  quotes: QuoteSummary[];
  snapshot: QuoteWorkspaceSnapshot;
};

const DEMOLITION_LABOUR: ItemDesglose = {
  nombre: "Retiro de revestimientos existentes",
  etapa: "Demolición y preparación",
  tipo: "mano_de_obra",
  unidad: "m2",
  formula: "superficie_revestida",
  cantidad_base: 20,
  desperdicio_pct: 0,
  cantidad: 20,
  precios: {
    eze: {
      valor: 12_000,
      fuente: "Eze · costo de cuadrilla acordado",
      fecha: "2026-08-15",
    },
  },
  precio_min: 12_000,
  precio_max: 12_000,
  subtotal_min: 240_000,
  subtotal_max: 240_000,
  divergencia_pct: null,
  sin_precio: false,
};

const WATERPROOFING_MATERIAL: ItemDesglose = {
  nombre: "Membrana cementicia flexible",
  etapa: "Impermeabilización",
  tipo: "material",
  unidad: "caja",
  formula: "ceil(superficie_piso / 12)",
  cantidad_base: 1.67,
  desperdicio_pct: 0,
  cantidad: 2,
  precios: {
    sismat: {
      valor: 92_000,
      fuente: "SISMAT · membrana cementicia bicomponente",
      fecha: "2026-08-14",
    },
    internet: {
      valor: 98_000,
      fuente: "Proveedor local · kit impermeabilizante",
      fecha: "2026-08-15",
    },
  },
  precio_min: 92_000,
  precio_max: 98_000,
  subtotal_min: 184_000,
  subtotal_max: 196_000,
  divergencia_pct: 6.52,
  sin_precio: false,
};

const WATERPROOFING_LABOUR: ItemDesglose = {
  nombre: "Aplicación de impermeabilización",
  etapa: "Impermeabilización",
  tipo: "mano_de_obra",
  unidad: "m2",
  formula: "superficie_piso",
  cantidad_base: 20,
  desperdicio_pct: 0,
  cantidad: 20,
  precios: {
    eze: {
      valor: 11_000,
      fuente: "Eze · costo de aplicación acordado",
      fecha: "2026-08-15",
    },
  },
  precio_min: 11_000,
  precio_max: 11_000,
  subtotal_min: 220_000,
  subtotal_max: 220_000,
  divergencia_pct: null,
  sin_precio: false,
};

const PORCELAIN_TILE: ItemDesglose = {
  nombre: "Porcelanato rectificado 60 × 60",
  etapa: "Pisos y revestimientos",
  tipo: "material",
  unidad: "m2",
  formula: "superficie_revestida * 1.1",
  cantidad_base: 20,
  desperdicio_pct: 10,
  cantidad: 22,
  precios: {
    sismat: {
      valor: 28_000,
      fuente: "SISMAT · porcelanato rectificado",
      fecha: "2026-08-14",
    },
    internet: {
      valor: 31_500,
      fuente: "Proveedor local · porcelanato rectificado",
      fecha: "2026-08-15",
    },
  },
  precio_min: 28_000,
  precio_max: 31_500,
  subtotal_min: 616_000,
  subtotal_max: 693_000,
  divergencia_pct: 12.5,
  sin_precio: false,
};

const TILE_ADHESIVE: ItemDesglose = {
  nombre: "Adhesivo flexible para porcelanato",
  etapa: "Pisos y revestimientos",
  tipo: "material",
  unidad: "bolsa",
  formula: "ceil(superficie_revestida / 4.5)",
  cantidad_base: 4.45,
  desperdicio_pct: 0,
  cantidad: 5,
  precios: {
    sismat: {
      valor: 20_500,
      fuente: "SISMAT · adhesivo flexible 25 kg",
      fecha: "2026-08-14",
    },
  },
  precio_min: 20_500,
  precio_max: 20_500,
  subtotal_min: 102_500,
  subtotal_max: 102_500,
  divergencia_pct: null,
  sin_precio: false,
};

const TILE_LABOUR: ItemDesglose = {
  nombre: "Colocación de pisos y revestimientos",
  etapa: "Pisos y revestimientos",
  tipo: "mano_de_obra",
  unidad: "m2",
  formula: "superficie_revestida",
  cantidad_base: 20,
  desperdicio_pct: 0,
  cantidad: 20,
  precios: {
    eze: {
      valor: 18_000,
      fuente: "Eze · costo de colocación acordado",
      fecha: "2026-08-15",
    },
  },
  precio_min: 18_000,
  precio_max: 18_000,
  subtotal_min: 360_000,
  subtotal_max: 360_000,
  divergencia_pct: null,
  sin_precio: false,
};

const FAUCET: ItemDesglose = {
  nombre: "Grifería monocomando",
  etapa: "Artefactos y griferías",
  tipo: "material",
  unidad: "u",
  formula: "1",
  cantidad_base: 1,
  desperdicio_pct: 0,
  cantidad: 1,
  precios: {},
  precio_min: null,
  precio_max: null,
  subtotal_min: 0,
  subtotal_max: 0,
  divergencia_pct: null,
  sin_precio: true,
};

const FIXTURE_INSTALLATION: ItemDesglose = {
  nombre: "Instalación de artefactos y griferías",
  etapa: "Artefactos y griferías",
  tipo: "mano_de_obra",
  unidad: "global",
  formula: "1",
  cantidad_base: 1,
  desperdicio_pct: 0,
  cantidad: 1,
  precios: {
    eze: {
      valor: 150_000,
      fuente: "Eze · costo de instalación acordado",
      fecha: "2026-08-15",
    },
  },
  precio_min: 150_000,
  precio_max: 150_000,
  subtotal_min: 150_000,
  subtotal_max: 150_000,
  divergencia_pct: null,
  sin_precio: false,
};

const ITEMS = [
  DEMOLITION_LABOUR,
  WATERPROOFING_MATERIAL,
  WATERPROOFING_LABOUR,
  PORCELAIN_TILE,
  TILE_ADHESIVE,
  TILE_LABOUR,
  FAUCET,
  FIXTURE_INSTALLATION,
] as const;

const PREVIEW_MESSAGES: readonly MensajeHilo[] = [
  {
    id: "synthetic-message-eze",
    fecha: "2026-08-15T09:31:00.000Z",
    autor: "eze",
    etiqueta: "Solicitud",
    texto:
      "Quiero cotizar la reforma completa de un baño de 20 m², con porcelanato e impermeabilización nueva.",
  },
  {
    id: "synthetic-message-system",
    fecha: "2026-08-15T09:32:00.000Z",
    autor: "sistema",
    etiqueta: "Pregunta abierta",
    texto:
      "Organicé el alcance en cuatro rubros. Necesito la línea y terminación de la grifería para cerrar ese costo.",
  },
  {
    id: "synthetic-message-codex-pisos",
    fecha: "2026-08-15T09:35:00.000Z",
    autor: "codex",
    etiqueta: "Pisos y revestimientos",
    texto:
      "El cómputo deja 22 m² de porcelanato con desperdicio y cinco bolsas de adhesivo para cubrir el alcance.",
  },
  {
    id: "synthetic-message-fable",
    fecha: "2026-08-15T09:36:00.000Z",
    autor: "fable",
    etiqueta: "Pisos y revestimientos",
    texto:
      "Encontré precios comparables para porcelanato y adhesivo; la diferencia entre fuentes se mantiene debajo del 13%.",
  },
  {
    id: "synthetic-message-fable-impermeabilizacion",
    fecha: "2026-08-15T09:38:00.000Z",
    autor: "fable",
    etiqueta: "Impermeabilización",
    texto:
      "Contrasté dos fuentes para la membrana; ambas sostienen el uso de dos kits para la superficie informada.",
  },
  {
    id: "synthetic-message-codex",
    fecha: "2026-08-15T09:39:00.000Z",
    autor: "codex",
    etiqueta: "Impermeabilización",
    texto:
      "Revisé el alcance: la membrana cubre los 20 m² en dos kits y la aplicación está incluida como mano de obra.",
  },
];

function previewQuote(): CotizacionRow {
  return {
    id: "synthetic-preview-quote",
    creado_at: "2026-08-15T09:30:00.000Z",
    trabajo_id: null,
    titulo: "Reforma integral de baño",
    zona: "Nordelta",
    estado: "en_revision",
    receta_id: "synthetic-recipe",
    ficha: {
      trabajo: "Reforma integral de baño",
      zona: "Nordelta",
      estado_actual: "Baño existente a renovar",
      calidad: "Terminación estándar superior",
      parametros: { superficie_piso: 20, superficie_revestida: 20 },
    },
    desglose: {
      receta_nombre: "reforma-integral-bano",
      receta_version: 1,
      parametros: { superficie_piso: 20, superficie_revestida: 20 },
      items: [...ITEMS],
      extras: [],
      totales: {
        materiales_min: 902_500,
        materiales_max: 991_500,
        mano_de_obra_min: 970_000,
        mano_de_obra_max: 970_000,
        extras_min: 0,
        extras_max: 0,
        subtotal_min: 1_872_500,
        subtotal_max: 1_961_500,
        imprevistos_pct: 10,
        factor_zona_min: 1,
        factor_zona_max: 1,
        total_min: 2_059_750,
        total_max: 2_157_650,
      },
      tiempo: { dias_min: 8, dias_max: 11, cuadrilla_max: 2 },
      generado_at: "2026-08-15T09:40:00.000Z",
    },
    total_min: 2_059_750,
    total_max: 2_157_650,
    precio_propuesta: null,
    revision: {
      checklist: [
        {
          item: "Retiro de revestimientos existentes",
          estado: "cubierto",
          detalle: "Incluye retiro y preparación inicial del soporte.",
        },
        {
          item: "Membrana cementicia flexible",
          estado: "cubierto",
          detalle: "Incluye material y aplicación en piso y encuentros.",
        },
        {
          item: "Porcelanato rectificado 60 × 60",
          estado: "cubierto",
          detalle: "Cantidad calculada con 10% de desperdicio.",
        },
        {
          item: "Grifería monocomando",
          estado: "faltante",
          detalle: "Falta definir marca, línea y terminación para buscar un precio comparable.",
        },
      ],
      sanidad: [
        {
          chequeo: "rendimiento: Membrana cementicia flexible",
          estado: "ok",
          detalle: "Dos kits cubren la superficie declarada.",
        },
        {
          chequeo: "precio: Porcelanato rectificado 60 × 60",
          estado: "ok",
          detalle: "Las dos fuentes se encuentran dentro del rango de contraste.",
        },
        {
          chequeo: "precio: Grifería monocomando",
          estado: "sin_datos",
          detalle: "No se puede contrastar el precio hasta definir la línea.",
        },
      ],
      precios_vencidos: [],
      divergencias: [],
      dudas: ["¿Qué marca, línea y terminación de grifería querés presupuestar?"],
    },
    motivo_rechazo: null,
    presupuesto_id: null,
    foto_portada_path: null,
  };
}

/** Fixture local explícito. No representa una cotización, evento ni agente reales. */
export function createPreviewData(): PreviewData {
  const quote = previewQuote();
  return {
    synthetic: true,
    source: "local_fixture",
    label: "PREVIEW CONTROLADO",
    disclaimer:
      "Demostración local con datos sintéticos; no representa una ejecución ni precios reales.",
    quotes: [projectQuoteSummary(quote)],
    snapshot: projectQuoteWorkspace({
      quote,
      messages: PREVIEW_MESSAGES,
      bridgeConnected: null,
      provenance: "synthetic_preview",
    }),
  };
}

export const PREVIEW_DATA: PreviewData = createPreviewData();
