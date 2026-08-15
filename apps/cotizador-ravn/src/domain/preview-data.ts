import type { CotizacionRow, ItemDesglose } from "../../../../src/lib/cotizador/tipos";
import {
  projectQuoteSummary,
  projectQuoteWorkspace,
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

const FLOOR_ITEM: ItemDesglose = {
  nombre: "Porcelanato 60 × 60",
  etapa: "Pisos",
  tipo: "material",
  unidad: "m2",
  formula: "superficie_piso * 1.1",
  cantidad_base: 20,
  desperdicio_pct: 10,
  cantidad: 22,
  precios: {
    sismat: {
      valor: 28_000,
      fuente: "FICTICIO · SISMAT preview",
      fecha: "2026-08-14",
    },
    internet: {
      valor: 31_500,
      fuente: "FICTICIO · proveedor preview",
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

const LABOUR_ITEM: ItemDesglose = {
  nombre: "Colocación de revestimiento",
  etapa: "Mano de obra",
  tipo: "mano_de_obra",
  unidad: "m2",
  formula: "superficie_piso",
  cantidad_base: 20,
  desperdicio_pct: 0,
  cantidad: 20,
  precios: {
    eze: {
      valor: 18_000,
      fuente: "FICTICIO · número manual preview",
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

function previewQuote(): CotizacionRow {
  return {
    id: "synthetic-preview-quote",
    creado_at: "2026-08-15T09:30:00.000Z",
    trabajo_id: null,
    titulo: "PREVIEW SINTÉTICO · Reforma de baño",
    zona: "Ubicación ficticia",
    estado: "en_revision",
    receta_id: "synthetic-recipe",
    ficha: {
      trabajo: "Ejemplo sintético para previsualización local",
      parametros: { superficie_piso: 20 },
    },
    desglose: {
      receta_nombre: "synthetic-preview-recipe",
      receta_version: 1,
      parametros: { superficie_piso: 20 },
      items: [FLOOR_ITEM, LABOUR_ITEM],
      extras: [],
      totales: {
        materiales_min: 616_000,
        materiales_max: 693_000,
        mano_de_obra_min: 360_000,
        mano_de_obra_max: 360_000,
        extras_min: 0,
        extras_max: 0,
        subtotal_min: 976_000,
        subtotal_max: 1_053_000,
        imprevistos_pct: 10,
        factor_zona_min: 1,
        factor_zona_max: 1,
        total_min: 1_073_600,
        total_max: 1_158_300,
      },
      tiempo: { dias_min: 4, dias_max: 6, cuadrilla_max: 2 },
      generado_at: "2026-08-15T09:25:00.000Z",
    },
    total_min: 1_073_600,
    total_max: 1_158_300,
    precio_propuesta: null,
    revision: {
      checklist: [],
      sanidad: [],
      precios_vencidos: [],
      divergencias: [],
      dudas: ["PREVIEW SINTÉTICO · confirmar selección final del revestimiento"],
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
    label: "DATOS SINTÉTICOS · PREVIEW LOCAL",
    disclaimer:
      "Vista sintética para desarrollo local. No contiene actividad, mensajes, agentes ni precios reales.",
    quotes: [projectQuoteSummary(quote)],
    snapshot: projectQuoteWorkspace({
      quote,
      messages: [],
      bridgeConnected: null,
      provenance: "synthetic_preview",
    }),
  };
}

export const PREVIEW_DATA: PreviewData = createPreviewData();
