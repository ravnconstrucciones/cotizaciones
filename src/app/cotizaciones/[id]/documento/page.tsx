import Link from "next/link";
import type { CotizacionRow, Desglose, ItemDesglose, Revision } from "@/lib/cotizador/tipos";
import { importeALetrasEs } from "@/lib/numero-a-letras-importe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { DOC_A4_CSS } from "@/lib/doc-a4-css";

export const dynamic = "force-dynamic";

// Mismo bucket privado que /api/cotizaciones/[id]/archivos.
const BUCKET = "obra-archivos";
const EXPIRA_S = 3600;

type Params = { params: Promise<{ id: string }> };

export default async function DocumentoPage({ params }: Params) {
  const { id } = await params;
  const sb = createSupabaseAdminClient();
  const { data } = await sb.from("cotizaciones").select("*").eq("id", id).maybeSingle();

  if (!data) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-sm text-ravn-muted">
        Cotización no encontrada. <Link href="/cotizaciones" className="underline">Volver</Link>
      </main>
    );
  }

  const cot = data as unknown as CotizacionRow;
  const revision = (cot.revision ?? null) as Revision | null;

  if (cot.estado !== "documento_emitido" || !revision?.documento) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-sm text-ravn-muted">
        El documento se genera después de aprobar y emitir desde la{" "}
        <Link href={`/cotizaciones/${id}/revision`} className="underline">
          mesa de revisión
        </Link>
        . Estado actual: {cot.estado}.
      </main>
    );
  }

  const desglose =
    cot.desglose && "items" in cot.desglose ? (cot.desglose as Desglose) : null;
  const doc = revision.documento;
  const importe = revision.aprobacion?.importe_final ?? cot.total_max ?? cot.total_min ?? 0;
  const fecha = new Date(
    revision.aprobacion?.fecha ? `${revision.aprobacion.fecha}T12:00:00` : cot.creado_at
  ).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

  // Fotos marcadas "en propuesta" (spec 2026-07-25): mismo patrón de firma
  // batch que /api/cotizaciones/[id]/archivos. Si no hay ninguna, el
  // documento queda idéntico al de antes de esta feature.
  const { data: filasFotos } = await sb
    .from("cotizacion_archivos")
    .select("id, storage_path")
    .eq("cotizacion_id", id)
    .eq("en_propuesta", true)
    .order("creado_at", { ascending: true });
  const filasFotosConPath = (filasFotos ?? []) as Array<{ id: string; storage_path: string | null }>;
  const pathsFotos = filasFotosConPath
    .map((f) => f.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const urlPorPathFoto = new Map<string, string>();
  if (pathsFotos.length > 0) {
    const { data: firmadas } = await sb.storage.from(BUCKET).createSignedUrls(pathsFotos, EXPIRA_S);
    if (firmadas) {
      for (const f of firmadas) {
        if (f.signedUrl && f.path) urlPorPathFoto.set(f.path, f.signedUrl);
      }
    }
  }
  const fotos = filasFotosConPath
    .map((f) => ({ id: f.id, url: f.storage_path ? urlPorPathFoto.get(f.storage_path) ?? null : null }))
    .filter((f): f is { id: string; url: string } => f.url != null);

  // Agrupar ítems por etapa, preservando el orden del desglose.
  const etapas: Array<{ nombre: string; items: ItemDesglose[] }> = [];
  for (const it of desglose?.items ?? []) {
    const ultima = etapas[etapas.length - 1];
    if (ultima && ultima.nombre === it.etapa) ultima.items.push(it);
    else etapas.push({ nombre: it.etapa, items: [it] });
  }

  return (
    <div className="doc-root">
      <style dangerouslySetInnerHTML={{ __html: DOC_A4_CSS }} />
      <p className="doc-aviso">
        Para el PDF: Cmd+P → Guardar como PDF (A4, sin márgenes). ·{" "}
        <Link href={`/cotizaciones/${id}/revision`} style={{ textDecoration: "underline" }}>
          volver a la mesa
        </Link>
      </p>

      {/* ── PÁGINA 1: servicios ── */}
      <div className="doc-page">
        <div className="doc-header">
          <span className="doc-brand">R&nbsp;A&nbsp;V&nbsp;N&nbsp;.</span>
        </div>
        <div className="doc-title">Propuesta</div>
        <div className="doc-meta">
          <span className="doc-meta-label">Cliente</span>
          <span className="doc-meta-value">{doc.cliente}</span>
          <span className="doc-meta-label">Fecha</span>
          <span className="doc-meta-value">{fecha}</span>
          <span className="doc-meta-label">Lugar</span>
          <span className="doc-meta-value">{doc.lugar}</span>
        </div>
        <div className="doc-section-title">Servicios Presupuestados</div>
        <div className="doc-rule" />
        <div className="doc-body">
          <p className="doc-item-title">{cot.titulo}</p>
          {etapas.map((etapa, i) => (
            <div key={i}>
              <div className="doc-etapa">
                Etapa {i + 1} — {etapa.nombre}
              </div>
              <p>
                {etapa.items
                  .map((it) =>
                    it.tipo === "mano_de_obra"
                      ? it.nombre
                      : `${it.nombre} (${it.cantidad} ${it.unidad})`
                  )
                  .join(". ")}
                .
              </p>
            </div>
          ))}
        </div>
        <div className="doc-footer">
          <span>ravnconstrucciones.com.ar · 11 7385-6263</span>
          <span className="doc-brand" style={{ fontSize: "11pt" }}>
            R&nbsp;A&nbsp;V&nbsp;N&nbsp;.
          </span>
        </div>
      </div>

      {/* ── PÁGINA 2: importe, pago, plazo, notas ── */}
      <div className="doc-page">
        <div className="doc-header">
          <span className="doc-brand">R&nbsp;A&nbsp;V&nbsp;N&nbsp;.</span>
        </div>
        <div className="doc-p2-section">
          <div className="doc-section-title">Importe</div>
          <div className="doc-rule" />
          <div className="doc-importe-number">
            ${Math.round(importe).toLocaleString("es-AR")}
          </div>
          <div className="doc-importe-letras">{importeALetrasEs(importe, "ARS")}</div>
          <div className="doc-importe-nota">
            Incluye materiales y mano de obra. El presupuesto no contempla el Impuesto al
            Valor Agregado (IVA).
          </div>
        </div>
        {doc.forma_pago.length > 0 && (
          <div className="doc-p2-section">
            <div className="doc-section-title">Forma de Pago</div>
            <div className="doc-rule" />
            <div className="doc-p2-text">
              {doc.forma_pago.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
        )}
        {doc.plazo.length > 0 && (
          <div className="doc-p2-section">
            <div className="doc-section-title">Plazo</div>
            <div className="doc-rule" />
            <div className="doc-p2-text">
              {doc.plazo.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
        )}
        {doc.notas.length > 0 && (
          <div className="doc-p2-section">
            <div className="doc-section-title">Notas</div>
            <div className="doc-rule" />
            <div className="doc-p2-text">
              {doc.notas.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
        )}
        <div className="doc-footer">
          <span>contacto@ravnconstrucciones.com.ar</span>
          <span className="doc-brand" style={{ fontSize: "11pt" }}>
            R&nbsp;A&nbsp;V&nbsp;N&nbsp;.
          </span>
        </div>
      </div>

      {/* ── PÁGINA 3 (solo si hay fotos marcadas "en propuesta") ── */}
      {fotos.length > 0 && (
        <div className="doc-page">
          <div className="doc-header">
            <span className="doc-brand">R&nbsp;A&nbsp;V&nbsp;N&nbsp;.</span>
          </div>
          <div className="doc-section-title">Fotos</div>
          <div className="doc-rule" />
          <div className="doc-fotos-grid">
            {fotos.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.id} src={f.url} alt="" />
            ))}
          </div>
          <div className="doc-footer">
            <span>contacto@ravnconstrucciones.com.ar</span>
            <span className="doc-brand" style={{ fontSize: "11pt" }}>
              R&nbsp;A&nbsp;V&nbsp;N&nbsp;.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
