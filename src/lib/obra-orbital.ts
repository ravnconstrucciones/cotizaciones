/**
 * Lógica PURA del orbital de obra v2 (/obras/[id]) — testeable sin DB.
 *
 * Reconversión 2026-06: los nodos YA NO son rubros del presupuesto (Eze no
 * los entendía) — son los ARTEFACTOS de la carpeta de la obra:
 * Presupuesto · Diagnóstico · Fotos · Resumen $ · Gastos.
 *
 * "Vivo" (glow) = el nodo tiene contenido real; vacío = orbita tenue.
 * Fuentes: DOCUMENTOS_OBRA (mapeo estático de /docs), obra_archivos
 * (fotos del bot + documentos), /cashflow/resumen (ingresos/egresos/saldo)
 * y presupuestos_gastos (total ejecutado).
 */

export type TipoArtefacto =
  | "presupuesto"
  | "diagnostico"
  | "fotos"
  | "resumen"
  | "gastos";

export type DocNodo = { label: string; url: string };

export type FotoNodo = {
  id: string;
  titulo: string | null;
  /** original firmado (lightbox). */
  url: string | null;
  /** miniatura (grilla); si la transformación no está disponible cae al original. */
  thumbUrl: string | null;
  creadoAt: string;
};

export type ResumenNodo = { ingresos: number; egresos: number; saldo: number };

export type NodoArtefacto = {
  tipo: TipoArtefacto;
  nombre: string;
  /** Tiene contenido real → glow. Vacío → tenue. */
  vivo: boolean;
  /** Subtítulo corto bajo el nombre ("2 docs", "5 fotos") — null si vacío. */
  detalle: string | null;
  /** Documentos abribles (presupuesto / diagnóstico). */
  docs: DocNodo[];
  /** Solo nodo fotos. */
  fotos: FotoNodo[];
  /** Solo nodo resumen. */
  resumen: ResumenNodo | null;
  /** Solo nodo gastos. */
  gastado: number | null;
  cantGastos: number;
  /** Link al detalle (gastos → /obras/[id]/gastos). */
  href: string | null;
};

/** Fila de obra_archivos ya firmada por /api/obra-archivos. */
export type ArchivoObraRow = {
  id: string;
  tipo: string;
  titulo: string | null;
  url: string | null;
  thumb_url: string | null;
  url_externa: string | null;
  creado_at: string;
};

/** Doc del mapeo estático DOCUMENTOS_OBRA (documentos-obra.ts). */
export type DocMapeado = { tipo: string; label: string; url: string };

function plural(n: number, unidad: string): string {
  return `${n} ${unidad}${n === 1 ? "" : "s"}`;
}

function urlDeArchivo(a: ArchivoObraRow): string | null {
  return a.url ?? a.url_externa ?? null;
}

/** Docs de un nodo: mapeo estático + filas de obra_archivos de esos tipos. */
function docsDeTipos(
  docsMapeados: DocMapeado[],
  archivos: ArchivoObraRow[],
  tiposMapeo: string[],
  tiposArchivo: string[],
  labelFallback: string
): DocNodo[] {
  const docs: DocNodo[] = docsMapeados
    .filter((d) => tiposMapeo.includes(d.tipo))
    .map((d) => ({ label: d.label, url: d.url }));
  for (const a of archivos) {
    if (!tiposArchivo.includes(a.tipo)) continue;
    const url = urlDeArchivo(a);
    if (!url) continue;
    docs.push({ label: a.titulo?.trim() || labelFallback, url });
  }
  return docs;
}

export function derivarArtefactosObra(input: {
  presupuestoId: string;
  docsMapeados: DocMapeado[];
  archivos: ArchivoObraRow[];
  resumen: ResumenNodo | null;
  gastado: number;
  cantGastos: number;
}): NodoArtefacto[] {
  const { presupuestoId, docsMapeados, archivos, resumen } = input;
  const gastado = Number(input.gastado) || 0;
  const cantGastos = Number(input.cantGastos) || 0;

  const base = {
    docs: [] as DocNodo[],
    fotos: [] as FotoNodo[],
    resumen: null as ResumenNodo | null,
    gastado: null as number | null,
    cantGastos: 0,
    href: null as string | null,
  };

  // La "lista de materiales" del mapeo y los `documento` sueltos de la carpeta
  // viajan con el presupuesto: son parte del paquete comercial de la obra.
  const docsPresupuesto = docsDeTipos(
    docsMapeados,
    archivos,
    ["presupuesto", "materiales"],
    ["presupuesto", "documento"],
    "Documento"
  );
  const docsDiagnostico = docsDeTipos(
    docsMapeados,
    archivos,
    ["diagnostico"],
    ["diagnostico"],
    "Diagnóstico"
  );

  const fotos: FotoNodo[] = archivos
    .filter((a) => a.tipo === "foto")
    .map((a) => ({
      id: a.id,
      titulo: a.titulo?.trim() || null,
      url: urlDeArchivo(a),
      thumbUrl: a.thumb_url ?? a.url ?? null,
      creadoAt: a.creado_at,
    }));

  return [
    {
      ...base,
      tipo: "presupuesto",
      nombre: "Presupuesto",
      vivo: docsPresupuesto.length > 0,
      detalle:
        docsPresupuesto.length > 0 ? plural(docsPresupuesto.length, "doc") : null,
      docs: docsPresupuesto,
    },
    {
      ...base,
      tipo: "diagnostico",
      nombre: "Diagnóstico",
      vivo: docsDiagnostico.length > 0,
      detalle:
        docsDiagnostico.length > 0 ? plural(docsDiagnostico.length, "doc") : null,
      docs: docsDiagnostico,
    },
    {
      ...base,
      tipo: "fotos",
      nombre: "Fotos",
      vivo: fotos.length > 0,
      detalle: fotos.length > 0 ? plural(fotos.length, "foto") : null,
      fotos,
    },
    {
      ...base,
      tipo: "resumen",
      nombre: "Resumen $",
      vivo: resumen != null,
      detalle: null,
      resumen,
    },
    {
      ...base,
      tipo: "gastos",
      nombre: "Gastos",
      vivo: cantGastos > 0,
      detalle: cantGastos > 0 ? plural(cantGastos, "gasto") : null,
      gastado,
      cantGastos,
      href: `/obras/${presupuestoId}/gastos`,
    },
  ];
}
