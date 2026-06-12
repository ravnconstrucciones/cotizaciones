import Link from "next/link";
import type { CotizacionRow, Desglose, ItemDesglose, Revision } from "@/lib/cotizador/tipos";
import { importeALetrasEs } from "@/lib/numero-a-letras-importe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// CSS del formato Presupuesto oficial (base: diagnosticos/Presupuesto_Lagomarsino.html).
const CSS = `
.doc-root { --bg:#1c1c1a; --fg:#f2efe8; --muted:rgba(242,239,232,0.48); --line:rgba(242,239,232,0.18); background:#111; font-family:'Raleway',sans-serif; -webkit-font-smoothing:antialiased; color:var(--fg); min-height:100vh; padding:8mm 0; }
.doc-root * { box-sizing:border-box; margin:0; padding:0; }
.doc-page { background:var(--bg); width:210mm; min-height:297mm; padding:14mm 16mm; margin:0 auto 4mm; display:flex; flex-direction:column; position:relative; overflow:hidden; }
.doc-header { display:flex; justify-content:flex-end; margin-bottom:10mm; }
.doc-brand { font-weight:300; font-size:15pt; letter-spacing:0.28em; padding-right:0.28em; text-transform:uppercase; }
.doc-title { font-weight:300; font-size:48pt; line-height:1.05; margin-bottom:9mm; }
.doc-meta { display:grid; grid-template-columns:20mm 1fr; gap:1.5mm 0; margin-bottom:9mm; }
.doc-meta-label { font-size:8.5pt; font-weight:400; color:var(--muted); letter-spacing:0.04em; padding-top:0.5mm; }
.doc-meta-value { font-size:9.5pt; font-weight:400; letter-spacing:0.01em; }
.doc-section-title { font-size:13pt; font-weight:300; margin-bottom:2mm; }
.doc-rule { height:0.3pt; background:var(--line); margin-bottom:7mm; }
.doc-body { font-size:9pt; font-weight:300; line-height:1.72; color:rgba(242,239,232,0.82); flex:1; }
.doc-body p { margin-bottom:4.5mm; }
.doc-etapa { font-size:8pt; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; color:var(--muted); margin:5mm 0 3mm; }
.doc-item-title { font-size:9pt; font-weight:600; margin-bottom:1.5mm; }
.doc-importe-number { font-size:48pt; font-weight:200; letter-spacing:-0.02em; line-height:1; margin:3mm 0 2mm; font-variant-numeric:tabular-nums; }
.doc-importe-letras { font-size:7.5pt; font-weight:400; letter-spacing:0.2em; text-transform:uppercase; color:var(--muted); margin-bottom:4mm; }
.doc-importe-nota { font-size:8pt; font-weight:300; color:rgba(242,239,232,0.55); line-height:1.6; }
.doc-p2-section { margin-bottom:7mm; }
.doc-p2-text { font-size:8.5pt; font-weight:300; color:rgba(242,239,232,0.75); line-height:1.68; }
.doc-p2-text p { margin-bottom:2mm; }
.doc-footer { margin-top:auto; padding-top:6mm; border-top:0.3pt solid var(--line); display:flex; justify-content:space-between; align-items:flex-end; font-size:8pt; font-weight:300; color:rgba(242,239,232,0.7); }
.doc-aviso { max-width:210mm; margin:0 auto 4mm; font-size:11px; color:rgba(242,239,232,0.6); text-align:center; }
@media print {
  @page { size: A4; margin: 0; }
  .doc-root { background:var(--bg); padding:0; }
  .doc-page { margin:0; page-break-after:always; }
  .doc-page:last-child { page-break-after:avoid; }
  .doc-aviso { display:none; }
}
`;

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

  // Agrupar ítems por etapa, preservando el orden del desglose.
  const etapas: Array<{ nombre: string; items: ItemDesglose[] }> = [];
  for (const it of desglose?.items ?? []) {
    const ultima = etapas[etapas.length - 1];
    if (ultima && ultima.nombre === it.etapa) ultima.items.push(it);
    else etapas.push({ nombre: it.etapa, items: [it] });
  }

  return (
    <div className="doc-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
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
    </div>
  );
}
