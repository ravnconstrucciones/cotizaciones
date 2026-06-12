import { describe, expect, it } from "vitest";
import {
  derivarArtefactosObra,
  type ArchivoObraRow,
  type NodoArtefacto,
} from "@/lib/obra-orbital";

const PID = "ad00bfc9-7a28-4fc5-9005-3e51e36a4065";

function archivo(parcial: Partial<ArchivoObraRow>): ArchivoObraRow {
  return {
    id: "a-1",
    tipo: "foto",
    titulo: null,
    url: "https://signed/full.jpg",
    thumb_url: "https://signed/thumb.jpg",
    url_externa: null,
    creado_at: "2026-06-12T10:00:00Z",
    ...parcial,
  };
}

function derivar(
  parcial: Partial<Parameters<typeof derivarArtefactosObra>[0]> = {}
): NodoArtefacto[] {
  return derivarArtefactosObra({
    presupuestoId: PID,
    docsMapeados: [],
    archivos: [],
    resumen: null,
    gastado: 0,
    cantGastos: 0,
    ...parcial,
  });
}

function nodo(nodos: NodoArtefacto[], tipo: string): NodoArtefacto {
  const n = nodos.find((x) => x.tipo === tipo);
  if (!n) throw new Error(`falta el nodo ${tipo}`);
  return n;
}

describe("derivarArtefactosObra", () => {
  it("siempre devuelve los 5 artefactos fijos (sin rubros por ningún lado)", () => {
    const nodos = derivar();
    expect(nodos.map((n) => n.tipo)).toEqual([
      "presupuesto",
      "diagnostico",
      "fotos",
      "resumen",
      "gastos",
    ]);
  });

  it("obra sin nada: todos los nodos vacíos (tenues), sin detalle", () => {
    const nodos = derivar();
    for (const n of nodos) {
      expect(n.vivo).toBe(false);
      expect(n.detalle).toBeNull();
    }
  });

  it("presupuesto vivo con el mapeo de documentos (incluye lista de materiales)", () => {
    const nodos = derivar({
      docsMapeados: [
        { tipo: "presupuesto", label: "Presupuesto", url: "/docs/P.html" },
        { tipo: "materiales", label: "Lista de materiales", url: "/docs/M.html" },
        { tipo: "diagnostico", label: "Diagnóstico técnico", url: "/docs/D.html" },
      ],
    });
    const pres = nodo(nodos, "presupuesto");
    expect(pres.vivo).toBe(true);
    expect(pres.detalle).toBe("2 docs");
    expect(pres.docs.map((d) => d.url)).toEqual(["/docs/P.html", "/docs/M.html"]);

    const diag = nodo(nodos, "diagnostico");
    expect(diag.vivo).toBe(true);
    expect(diag.detalle).toBe("1 doc");
    expect(diag.docs).toEqual([
      { label: "Diagnóstico técnico", url: "/docs/D.html" },
    ]);
  });

  it("suma archivos de obra_archivos a los docs (titulo → label, url firmada o externa)", () => {
    const nodos = derivar({
      archivos: [
        archivo({ id: "d-1", tipo: "diagnostico", titulo: "Diagnóstico baño", url: "https://signed/d.pdf", thumb_url: null }),
        archivo({ id: "p-1", tipo: "presupuesto", titulo: null, url: null, thumb_url: null, url_externa: "/docs/Presupuesto_X.html" }),
        archivo({ id: "doc-1", tipo: "documento", titulo: "Plano sanitario", url: "https://signed/plano.pdf", thumb_url: null }),
      ],
    });
    expect(nodo(nodos, "diagnostico").docs).toEqual([
      { label: "Diagnóstico baño", url: "https://signed/d.pdf" },
    ]);
    // presupuesto + documento suelto viajan juntos en el nodo Presupuesto
    expect(nodo(nodos, "presupuesto").docs).toEqual([
      { label: "Documento", url: "/docs/Presupuesto_X.html" },
      { label: "Plano sanitario", url: "https://signed/plano.pdf" },
    ]);
  });

  it("un archivo sin url firmada ni externa NO genera doc (nodo queda vacío)", () => {
    const nodos = derivar({
      archivos: [
        archivo({ tipo: "presupuesto", url: null, thumb_url: null, url_externa: null }),
      ],
    });
    expect(nodo(nodos, "presupuesto").vivo).toBe(false);
    expect(nodo(nodos, "presupuesto").docs).toEqual([]);
  });

  it("fotos: vivo con conteo, thumb cae al original si no hay miniatura", () => {
    const nodos = derivar({
      archivos: [
        archivo({ id: "f-1", titulo: "Avance baño" }),
        archivo({ id: "f-2", thumb_url: null }),
      ],
    });
    const fotos = nodo(nodos, "fotos");
    expect(fotos.vivo).toBe(true);
    expect(fotos.detalle).toBe("2 fotos");
    expect(fotos.fotos[0]).toMatchObject({
      id: "f-1",
      titulo: "Avance baño",
      url: "https://signed/full.jpg",
      thumbUrl: "https://signed/thumb.jpg",
    });
    expect(fotos.fotos[1].thumbUrl).toBe("https://signed/full.jpg");
  });

  it("una sola foto: detalle en singular", () => {
    const nodos = derivar({ archivos: [archivo({})] });
    expect(nodo(nodos, "fotos").detalle).toBe("1 foto");
  });

  it("resumen $: vivo cuando la obra está en el resumen de cashflow", () => {
    const nodos = derivar({
      resumen: { ingresos: 1000000, egresos: 350000, saldo: 650000 },
    });
    const r = nodo(nodos, "resumen");
    expect(r.vivo).toBe(true);
    expect(r.resumen).toEqual({ ingresos: 1000000, egresos: 350000, saldo: 650000 });
  });

  it("gastos: vivo con total ejecutado y link al detalle existente", () => {
    const nodos = derivar({ gastado: 482000.5, cantGastos: 7 });
    const g = nodo(nodos, "gastos");
    expect(g.vivo).toBe(true);
    expect(g.detalle).toBe("7 gastos");
    expect(g.gastado).toBe(482000.5);
    expect(g.href).toBe(`/obras/${PID}/gastos`);
  });

  it("gastos en cero: nodo tenue pero el link al detalle sigue", () => {
    const nodos = derivar();
    const g = nodo(nodos, "gastos");
    expect(g.vivo).toBe(false);
    expect(g.href).toBe(`/obras/${PID}/gastos`);
  });
});
