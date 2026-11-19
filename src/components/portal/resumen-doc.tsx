import { ImprimirDocumento } from "@/components/imprimir-documento";
import { DOC_A4_CSS } from "@/lib/doc-a4-css";
import {
  ESTADOS_RUBRO,
  TIPOS_REGISTRO,
  dinero,
  fechaCorta,
  fechaRelativa,
  lineasTareas,
  partirAgenda,
  resumenRubros,
  type RegistroPortal,
  type VistaPortal,
} from "@/lib/portal/tipos";

/**
 * Resumen de obra en el formato oficial A4 de RAVN (mismo molde que
 * presupuesto y diagnóstico: src/lib/doc-a4-css.ts). Se guarda como PDF con el
 * botón de impresión del navegador. Lo ven el cliente (/o/<slug>/resumen) y
 * Eze (/obras/<id>/portal/resumen).
 */

const EXTRA_CSS = `
.rs-avance { display:flex; align-items:flex-end; justify-content:space-between; gap:8mm; margin-bottom:3mm; }
.rs-barra { height:1.2mm; background:rgba(242,239,232,0.16); margin-bottom:9mm; }
.rs-barra i { display:block; height:100%; background:var(--fg); }
.rs-fila { display:grid; grid-template-columns:1fr 26mm; align-items:baseline; gap:4mm; font-size:9.5pt; padding:2.2mm 0 1.6mm; border-bottom:0.2mm solid rgba(242,239,232,0.16); break-inside:avoid; }
.rs-fila small { text-align:right; }
.rs-fila p { grid-column:1 / -1; margin:0.8mm 0 0; font-size:8.5pt; font-weight:300; line-height:1.5; color:rgba(242,239,232,0.72); }
.rs-mat { display:grid; grid-template-columns:1fr 30mm; gap:1mm 4mm; align-items:baseline; padding:2.4mm 0; border-bottom:0.2mm solid rgba(242,239,232,0.16); font-size:9.5pt; break-inside:avoid; }
.rs-mat small { text-align:right; font-size:7.5pt; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); }
.rs-mat p { grid-column:1 / -1; margin:0; font-size:8.5pt; font-weight:300; line-height:1.5; color:rgba(242,239,232,0.72); }
.rs-fila small { font-size:7.5pt; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); }
.rs-fila b { font-weight:600; text-align:right; font-variant-numeric:tabular-nums; }
.rs-agenda { display:grid; grid-template-columns:34mm 1fr; gap:1.5mm 4mm; font-size:9pt; font-weight:300; line-height:1.6; }
.rs-agenda dt { color:var(--muted); }
.rs-pagos { display:grid; grid-template-columns:repeat(3,1fr); gap:6mm; margin-bottom:4mm; }
.rs-pagos span { display:block; font-size:7.5pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); margin-bottom:1.5mm; }
.rs-pagos b { font-size:17pt; font-weight:300; font-variant-numeric:tabular-nums; }
.rs-entrada { break-inside:avoid; margin-bottom:8mm; }
.rs-entrada img { width:100%; max-height:92mm; object-fit:cover; margin-bottom:3mm; }
.rs-entrada-meta { font-size:7.5pt; font-weight:600; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); margin-bottom:1.5mm; }
.rs-botonera { max-width:210mm; margin:0 auto 4mm; display:flex; gap:12px; align-items:center; justify-content:space-between; padding:0 4mm; color:var(--fg); font-size:13px; }
.rs-botonera a { color:inherit; }
@media print { .rs-botonera { display:none; } }
@media screen and (max-width:820px) { .rs-pagos { grid-template-columns:1fr; gap:14px; } .rs-agenda { grid-template-columns:1fr; } .rs-agenda dd { margin-bottom:8px; } }
`;

function trocear<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

function Pie({ pagina, total }: { pagina: number; total: number }) {
  return (
    <div className="doc-footer">
      <span>RAVN Construcciones · ravnconstrucciones.com.ar</span>
      <span>
        {pagina} / {total}
      </span>
    </div>
  );
}

export function ResumenDoc({ vista, volverHref }: { vista: VistaPortal; volverHref: string }) {
  const { proximos } = partirAgenda(vista.agenda, vista.hoy);
  // Orden cronológico (lo más viejo primero) y hasta 4 registros por hoja.
  // Los materiales van en hoja propia, igual que en el portal.
  const cronologico = [...vista.registros].filter((r) => r.tipo !== "material" && r.tipo !== "ticket").reverse();
  const materiales = [...vista.registros].filter((r) => r.tipo === "material").reverse();
  const hojas = trocear(cronologico, 4);
  const hojasMat = trocear(materiales, 14);
  const total = 1 + hojasMat.length + hojas.length;
  const resumen = resumenRubros(vista.rubros);
  const nombreRubro = (r: RegistroPortal) => vista.rubros.find((x) => x.id === r.rubroId)?.nombre ?? "General";

  return (
    <div className="doc-root">
      <style dangerouslySetInnerHTML={{ __html: DOC_A4_CSS + EXTRA_CSS }} />
      <div className="rs-botonera">
        <a href={volverHref}>← Volver</a>
        <ImprimirDocumento />
      </div>
      <p className="doc-aviso">Para guardarlo como PDF: Imprimir → Guardar como PDF. En el iPhone: Compartir → Imprimir → pellizcar la vista previa.</p>

      <section className="doc-page">
        <div className="doc-header">
          <span className="doc-brand">RAVN.</span>
        </div>
        <h1 className="doc-title">Resumen de obra</h1>
        <div className="doc-meta">
          <span className="doc-meta-label">Obra</span>
          <span className="doc-meta-value">{vista.obra.nombre}</span>
          {vista.obra.cliente ? (
            <>
              <span className="doc-meta-label">Cliente</span>
              <span className="doc-meta-value">{vista.obra.cliente}</span>
            </>
          ) : null}
          {vista.obra.direccion ? (
            <>
              <span className="doc-meta-label">Dirección</span>
              <span className="doc-meta-value">{vista.obra.direccion}</span>
            </>
          ) : null}
          {vista.obra.inicio || vista.obra.entrega ? (
            <>
              <span className="doc-meta-label">Plazo</span>
              <span className="doc-meta-value">
                {[vista.obra.inicio && `Inicio ${fechaCorta(vista.obra.inicio)}`, vista.obra.entrega && `Entrega estimada ${fechaCorta(vista.obra.entrega)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </>
          ) : null}
          <span className="doc-meta-label">Fecha</span>
          <span className="doc-meta-value">{fechaCorta(vista.hoy)}</span>
        </div>

        {resumen.total ? (
          <div className="rs-avance">
            <div>
              <div className="doc-importe-number">
                {resumen.terminados} de {resumen.total}
              </div>
              <div className="doc-importe-letras">{resumen.total === 1 ? "Rubro terminado" : "Rubros terminados"}</div>
            </div>
          </div>
        ) : null}

        {vista.rubros.length ? (
          <div className="doc-p2-section">
            <h2 className="doc-section-title">Rubros</h2>
            <div className="doc-rule" style={{ marginBottom: "2mm" }} />
            {vista.rubros.map((r) => (
              <div className="rs-fila" key={r.id}>
                <span>{r.nombre}</span>
                <small>{ESTADOS_RUBRO[r.estado]}</small>
                {lineasTareas(r.tareas).length ? <p>{lineasTareas(r.tareas).join(" · ")}</p> : null}
              </div>
            ))}
          </div>
        ) : null}

        {proximos.length ? (
          <div className="doc-p2-section">
            <h2 className="doc-section-title">Lo próximo</h2>
            <div className="doc-rule" style={{ marginBottom: "3mm" }} />
            <dl className="rs-agenda">
              {proximos.slice(0, 6).map((e) => (
                <div key={e.id} style={{ display: "contents" }}>
                  <dt>
                    {fechaRelativa(e.fecha, vista.hoy)}
                    {e.hora ? ` · ${e.hora} h` : ""}
                  </dt>
                  <dd>
                    {e.titulo}
                    {e.quien ? ` — ${e.quien}` : ""}
                    {e.detalle ? `. ${e.detalle}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {vista.pagos ? (
          <div className="doc-p2-section">
            <h2 className="doc-section-title">Pagos</h2>
            <div className="doc-rule" style={{ marginBottom: "4mm" }} />
            <div className="rs-pagos">
              <div>
                <span>Presupuesto</span>
                <b>{dinero(vista.pagos.resumen.total, vista.pagos.resumen.moneda)}</b>
              </div>
              <div>
                <span>Pagado</span>
                <b>{dinero(vista.pagos.resumen.pagado, vista.pagos.resumen.moneda)}</b>
              </div>
              <div>
                <span>Saldo</span>
                <b>{dinero(vista.pagos.resumen.saldo, vista.pagos.resumen.moneda)}</b>
              </div>
            </div>
            <div className="rs-barra" style={{ marginBottom: "3mm" }}>
              <i style={{ width: `${vista.pagos.resumen.pct}%` }} />
            </div>
            {vista.pagos.detalle.length ? (
              <ul className="doc-lista">
                {[...vista.pagos.detalle].reverse().map((p) => (
                  <li key={p.id}>
                    {fechaCorta(p.fecha)} · {p.concepto} · {dinero(p.monto, p.moneda)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <Pie pagina={1} total={total} />
      </section>

      {hojasMat.map((hoja, i) => (
        <section className="doc-page" key={`m${i}`}>
          <div className="doc-header">
            <span className="doc-brand">RAVN.</span>
          </div>
          <h2 className="doc-section-title">Materiales{hojasMat.length > 1 ? ` · ${i + 1} de ${hojasMat.length}` : ""}</h2>
          <div className="doc-rule" />
          <div className="doc-body">
            {hoja.map((m) => (
              <div className="rs-mat" key={m.id}>
                <span>{m.titulo}</span>
                <small>{m.material?.estado ?? ""}</small>
                <p>
                  {[[m.material?.producto, m.material?.marca, m.material?.color].filter(Boolean).join(" · "), nombreRubro(m)]
                    .filter(Boolean)
                    .join(" — ")}
                </p>
              </div>
            ))}
          </div>
          <Pie pagina={i + 2} total={total} />
        </section>
      ))}

      {hojas.map((hoja, i) => (
        <section className="doc-page" key={i}>
          <div className="doc-header">
            <span className="doc-brand">RAVN.</span>
          </div>
          <h2 className="doc-section-title">Bitácora de obra{hojas.length > 1 ? ` · ${i + 1} de ${hojas.length}` : ""}</h2>
          <div className="doc-rule" />
          <div className="doc-body">
            {hoja.map((r) => (
              <div className="rs-entrada" key={r.id}>
                {r.mediaUrl && r.mediaTipo !== "video" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.mediaUrl} alt={r.titulo} />
                ) : null}
                <div className="rs-entrada-meta">
                  {fechaCorta(r.fecha)} · {TIPOS_REGISTRO[r.tipo]} · {nombreRubro(r)}
                </div>
                <div className="doc-item-title">{r.titulo}</div>
                {r.texto ? <p style={{ whiteSpace: "pre-wrap" }}>{r.texto}</p> : null}
                {r.mediaTipo === "video" || r.linkExterno ? (
                  <p style={{ color: "rgba(242,239,232,0.55)" }}>
                    {r.linkExterno ? `Video: ${r.linkExterno}` : "Video disponible en el portal de la obra."}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <Pie pagina={i + 2 + hojasMat.length} total={total} />
        </section>
      ))}
    </div>
  );
}
