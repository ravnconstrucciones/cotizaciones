export const ORIGEN_GASTO_RAPIDO = "gasto_rapido_v2" as const;

export type TipoGastoRapido = "obra" | "empresa" | "personal";

export type GastoRapidoReciente = {
  id: string;
  tipo: TipoGastoRapido;
  concepto: string;
  importe: number;
  moneda: "ARS" | "USD";
  fecha: string;
  createdAt: string;
  cuenta: string | null;
  detalle: string | null;
};

/** Fila ya proyectada por las consultas de las tres tablas. */
export type FuenteGastoRapido = GastoRapidoReciente;

const TIPOS = new Set<TipoGastoRapido>(["obra", "empresa", "personal"]);

function esFuenteValida(fuente: FuenteGastoRapido): boolean {
  return (
    typeof fuente.id === "string" &&
    fuente.id.length > 0 &&
    TIPOS.has(fuente.tipo) &&
    typeof fuente.createdAt === "string" &&
    fuente.createdAt.length > 0 &&
    Number.isFinite(Date.parse(fuente.createdAt)) &&
    Number.isFinite(fuente.importe) &&
    fuente.importe >= 0 &&
    (fuente.moneda === "ARS" || fuente.moneda === "USD")
  );
}

export function normalizarGastosRecientes(
  fuentes: FuenteGastoRapido[]
): GastoRapidoReciente[] {
  return fuentes
    .filter(esFuenteValida)
    .sort((a, b) => {
      const porCreacion = b.createdAt.localeCompare(a.createdAt);
      return porCreacion || b.id.localeCompare(a.id);
    })
    .slice(0, 10);
}

export type EstadoUltimosGastos = {
  items: GastoRapidoReciente[];
  cargando: boolean;
  error: string | null;
  expandidoId: string | null;
  confirmandoId: string | null;
  deshaciendo: boolean;
  errorDeshacer: string | null;
  anuncio: string;
};

export const estadoInicialUltimosGastos: EstadoUltimosGastos = {
  items: [],
  cargando: true,
  error: null,
  expandidoId: null,
  confirmandoId: null,
  deshaciendo: false,
  errorDeshacer: null,
  anuncio: "",
};

export type EventoUltimosGastos =
  | { tipo: "carga_inicio" }
  | { tipo: "carga_ok"; items: GastoRapidoReciente[] }
  | { tipo: "carga_error"; mensaje: string }
  | { tipo: "alternar"; id: string }
  | { tipo: "confirmar_abrir"; id: string }
  | { tipo: "confirmar_cerrar" }
  | { tipo: "deshacer_inicio" }
  | { tipo: "deshacer_error"; mensaje: string }
  | { tipo: "deshacer_ok"; id: string }
  | { tipo: "deshacer_ya_hecho"; id: string };

export function reducirUltimosGastos(
  estado: EstadoUltimosGastos,
  evento: EventoUltimosGastos
): EstadoUltimosGastos {
  switch (evento.tipo) {
    case "carga_inicio":
      return { ...estado, cargando: true, error: null };
    case "carga_ok":
      return {
        ...estado,
        items: evento.items,
        cargando: false,
        error: null,
        expandidoId:
          estado.expandidoId && evento.items.some((g) => g.id === estado.expandidoId)
            ? estado.expandidoId
            : null,
      };
    case "carga_error":
      return { ...estado, cargando: false, error: evento.mensaje };
    case "alternar":
      return {
        ...estado,
        expandidoId: estado.expandidoId === evento.id ? null : evento.id,
        errorDeshacer: null,
      };
    case "confirmar_abrir":
      return { ...estado, confirmandoId: evento.id, errorDeshacer: null };
    case "confirmar_cerrar":
      return {
        ...estado,
        confirmandoId: null,
        deshaciendo: false,
        errorDeshacer: null,
      };
    case "deshacer_inicio":
      return { ...estado, deshaciendo: true, errorDeshacer: null };
    case "deshacer_error":
      return { ...estado, deshaciendo: false, errorDeshacer: evento.mensaje };
    case "deshacer_ok":
      return {
        ...estado,
        items: estado.items.filter((g) => g.id !== evento.id),
        expandidoId: estado.expandidoId === evento.id ? null : estado.expandidoId,
        confirmandoId: null,
        deshaciendo: false,
        errorDeshacer: null,
        anuncio: "Gasto deshecho. Quedó en Papelera.",
      };
    case "deshacer_ya_hecho":
      return {
        ...estado,
        items: estado.items.filter((g) => g.id !== evento.id),
        expandidoId: estado.expandidoId === evento.id ? null : estado.expandidoId,
        confirmandoId: null,
        deshaciendo: false,
        errorDeshacer: null,
        anuncio: "Ese gasto ya había sido deshecho.",
      };
  }
}

export type ResultadoDeshacerRpc = {
  estado?: "deshecho" | "ya_deshacido" | "no_habilitado" | "no_encontrado";
  papelera_id?: string | null;
};

export function respuestaDeshacerRpc(resultado: ResultadoDeshacerRpc): {
  status: number;
  body: { ok: boolean; estado: string; papeleraId?: string };
} {
  if (resultado.estado === "deshecho") {
    return {
      status: 200,
      body: {
        ok: true,
        estado: "deshecho",
        ...(resultado.papelera_id ? { papeleraId: resultado.papelera_id } : {}),
      },
    };
  }
  if (resultado.estado === "ya_deshacido") {
    return { status: 409, body: { ok: false, estado: "ya_deshacido" } };
  }
  if (resultado.estado === "no_habilitado") {
    return { status: 409, body: { ok: false, estado: "no_habilitado" } };
  }
  return { status: 404, body: { ok: false, estado: "no_encontrado" } };
}
