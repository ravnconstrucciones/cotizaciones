import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { DOC_A4_CSS } from "@/lib/doc-a4-css";
import type { ContenidoDiagnostico, Diagnostico } from "../../tipos";

export const dynamic = "force-dynamic";

// Mismo bucket privado que el resto de los documentos.
const BUCKET = "obra-archivos";
const EXPIRA_S = 3600;
const FOTOS_POR_PAGINA = 6;

type Params = { params: Promise<{ id: string }> };

/**
 * Documento de diagnóstico de cara al cliente — A4 dark premium, molde oficial
 * (`ravn-diagnostico-formato`, base Diagnostico_Perazzo.html).
 *
 * La plantilla dibuja; el contenido viene de `diagnosticos.contenido`. Nadie
 * re-genera este HTML: mismo principio que el cotizador, el código arma el
 * documento y el modelo sólo aporta el texto.
 *
 * PDF: Cmd+P → Guardar como PDF (A4, sin márgenes).
 */
export default async function DiagnosticoDocumentoPage({ params }: Params) {
  const { id } = await params;
  const sb = createSupabaseAdminClient();
  const { data } = await sb.from("diagnosticos").select("*").eq("id", id).maybeSingle();

  if (!data) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-sm text-ravn-muted">
        Diagnóstico no encontrado.{" "}
        <Link href="/diagnosticos" className="underline">
          Volver
        </Link>
      </main>
    );
  }

  const diag = data as unknown as Diagnostico;
  const contenido: ContenidoDiagnostico = diag.contenido ?? {};
  const secciones = (contenido.secciones ?? []).filter(
    (s) => (s.titulo ?? "").trim() || (s.cuerpo ?? "").trim()
  );
  const alcance = (contenido.alcance ?? []).filter((t) => t.trim());
  const recomendaciones = (contenido.recomendaciones ?? []).filter((t) => t.trim());

  const fecha = new Date(diag.creado_at).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Fotos de las secciones: se firman en batch, igual que el documento de
  // cotización. Van al final, en páginas de registro.
  const paths = secciones.flatMap((s) => (s.fotos ?? []).filter((p) => p?.trim()));
  const urlPorPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: firmadas } = await sb.storage.from(BUCKET).createSignedUrls(paths, EXPIRA_S);
    for (const f of firmadas ?? []) {
      if (f.signedUrl && f.path) urlPorPath.set(f.path, f.signedUrl);
    }
  }
  const fotos = paths
    .map((p) => urlPorPath.get(p))
    .filter((u): u is string => typeof u === "string");
  const paginasFotos: string[][] = [];
  for (let i = 0; i < fotos.length; i += FOTOS_POR_PAGINA) {
    paginasFotos.push(fotos.slice(i, i + FOTOS_POR_PAGINA));
  }

  return (
    <div className="doc-root">
      <style dangerouslySetInnerHTML={{ __html: DOC_A4_CSS }} />
      <p className="doc-aviso">
        Para el PDF: Cmd+P → Guardar como PDF (A4, sin márgenes). ·{" "}
        <Link href={`/diagnosticos/${id}`} style={{ textDecoration: "underline" }}>
          volver al diagnóstico
        </Link>
      </p>

      {/* ── PÁGINA 1: qué se encontró ── */}
      <section className="doc-page">
        <div className="doc-header">
          <span className="doc-brand">RAVN</span>
        </div>

        <h1 className="doc-title">Diagnóstico</h1>

        <div className="doc-meta">
          <span className="doc-meta-label">Obra</span>
          <span className="doc-meta-value">{diag.titulo}</span>
          {diag.cliente && (
            <>
              <span className="doc-meta-label">Cliente</span>
              <span className="doc-meta-value">{diag.cliente}</span>
            </>
          )}
          {diag.direccion && (
            <>
              <span className="doc-meta-label">Dirección</span>
              <span className="doc-meta-value">{diag.direccion}</span>
            </>
          )}
          <span className="doc-meta-label">Fecha</span>
          <span className="doc-meta-value">{fecha}</span>
        </div>

        {contenido.resumen?.trim() && (
          <>
            <h2 className="doc-section-title">Situación</h2>
            <div className="doc-rule" />
            <div className="doc-body">
              {contenido.resumen
                .split("\n")
                .filter((p) => p.trim())
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          </>
        )}

        <div className="doc-footer">
          <span>RAVN Construcciones</span>
          <span>{fecha}</span>
        </div>
      </section>

      {/* ── PÁGINA 2: el detalle técnico ── */}
      {secciones.length > 0 && (
        <section className="doc-page">
          <div className="doc-header">
            <span className="doc-brand">RAVN</span>
          </div>

          <h2 className="doc-section-title">Detalle técnico</h2>
          <div className="doc-rule" />

          <div className="doc-body">
            {secciones.map((s, i) => (
              <div key={i} className="doc-p2-section">
                {s.titulo?.trim() && <p className="doc-etapa">{s.titulo}</p>}
                {(s.cuerpo ?? "")
                  .split("\n")
                  .filter((p) => p.trim())
                  .map((p, j) => (
                    <p key={j}>{p}</p>
                  ))}
              </div>
            ))}
          </div>

          <div className="doc-footer">
            <span>RAVN Construcciones</span>
            <span>{diag.titulo}</span>
          </div>
        </section>
      )}

      {/* ── PÁGINA 3: alcance y recomendaciones ── */}
      {(alcance.length > 0 || recomendaciones.length > 0) && (
        <section className="doc-page">
          <div className="doc-header">
            <span className="doc-brand">RAVN</span>
          </div>

          {alcance.length > 0 && (
            <div className="doc-p2-section">
              <h2 className="doc-section-title">Alcance propuesto</h2>
              <div className="doc-rule" />
              <ul className="doc-lista">
                {alcance.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {recomendaciones.length > 0 && (
            <div className="doc-p2-section">
              <h2 className="doc-section-title">Recomendaciones</h2>
              <div className="doc-rule" />
              <ul className="doc-lista">
                {recomendaciones.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="doc-footer">
            <span>RAVN Construcciones</span>
            <span>{diag.titulo}</span>
          </div>
        </section>
      )}

      {/* ── Registro fotográfico ── */}
      {paginasFotos.map((pagina, i) => (
        <section key={i} className="doc-page">
          <div className="doc-header">
            <span className="doc-brand">RAVN</span>
          </div>
          <h2 className="doc-section-title">Registro</h2>
          <div className="doc-rule" />
          <div className="doc-fotos-grid">
            {pagina.map((url, j) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={j} src={url} alt="" />
            ))}
          </div>
          <div className="doc-footer">
            <span>RAVN Construcciones</span>
            <span>{diag.titulo}</span>
          </div>
        </section>
      ))}
    </div>
  );
}
