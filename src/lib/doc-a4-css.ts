/**
 * CSS del formato de documento oficial RAVN — A4 dark premium.
 * Base: `diagnosticos/Presupuesto_Lagomarsino.html` / `Diagnostico_Perazzo.html`.
 *
 * UN SOLO MOLDE para todo lo que va al cliente (presupuesto, diagnóstico): el
 * modelo aporta el CONTENIDO, la plantilla dibuja. Si cada documento re-genera
 * su HTML, driftea — y eso sale de la empresa con la marca puesta.
 *
 * Vivía inline en `/cotizaciones/[id]/documento`; se extrajo el 2026-07-28 al
 * nacer el módulo Diagnósticos, que necesita exactamente el mismo formato.
 */
export const DOC_A4_CSS = `
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
.doc-fotos-grid { flex:1; display:grid; grid-template-columns:1fr 1fr; gap:4mm; align-content:start; }
.doc-fotos-grid img { width:100%; aspect-ratio:4/3; object-fit:cover; }
.doc-aviso { max-width:210mm; margin:0 auto 4mm; font-size:11px; color:rgba(242,239,232,0.6); text-align:center; }
.doc-lista { list-style:none; }
.doc-lista li { font-size:9pt; font-weight:300; line-height:1.72; color:rgba(242,239,232,0.82); padding-left:4mm; position:relative; margin-bottom:1.5mm; }
.doc-lista li::before { content:"—"; position:absolute; left:0; color:var(--muted); }
@media print {
  @page { size: A4; margin: 0; }
  .doc-root { background:var(--bg); padding:0; }
  .doc-page { margin:0; page-break-after:always; }
  .doc-page:last-child { page-break-after:avoid; }
  .doc-aviso { display:none; }
}
`;
