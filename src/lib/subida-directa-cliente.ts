import { createClient } from "@/lib/supabase/client";
import { BUCKET_ARCHIVOS, maxBytesDeTipo } from "@/lib/cotizador/subida-directa";

/**
 * Subida directa a Supabase Storage desde el navegador (paso 1-2-3 completo):
 * firmar → uploadToSignedUrl (directo al bucket, sin pisar el límite de
 * ~4,5 MB de Vercel) → confirmar. Devuelve la misma forma que devolvían los
 * POST multipart históricos, así los llamadores casi no cambian.
 */

export type ArchivoSubido = {
  id: string;
  tipo: string;
  titulo: string | null;
  creado_at: string;
  storage_path: string;
  url: string | null;
};

export type ResultadoSubida =
  | { ok: true; archivo?: ArchivoSubido; path?: string; url?: string | null }
  | { ok: false; error: string };

export async function subirDirecto(opts: {
  cotizacionId: string;
  file: File;
  tipo: string;
  titulo?: string;
}): Promise<ResultadoSubida> {
  const { cotizacionId, file, tipo, titulo } = opts;

  const maxBytes = maxBytesDeTipo(tipo);
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `Máximo ${Math.round(maxBytes / 1024 / 1024)} MB por archivo.`,
    };
  }

  // Paso 1: el server arma el path y firma la subida.
  let path = "";
  let token = "";
  try {
    const res = await fetch(`/api/cotizaciones/${cotizacionId}/archivos/firmar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: file.name, tipo, size: file.size, contentType: file.type }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      path?: string;
      token?: string;
      error?: string;
    };
    if (!res.ok || !j.path || !j.token) {
      return { ok: false, error: j.error ?? "No se pudo firmar la subida." };
    }
    path = j.path;
    token = j.token;
  } catch {
    return { ok: false, error: "Error de red al firmar la subida." };
  }

  // Paso 2: directo al bucket. El token vale solo para ese path.
  const { error: eUp } = await createClient()
    .storage.from(BUCKET_ARCHIVOS)
    .uploadToSignedUrl(path, token, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (eUp) {
    return { ok: false, error: `La subida al bucket falló: ${eUp.message}` };
  }

  // Paso 3: el server verifica el objeto y persiste fila/portada.
  try {
    const res = await fetch(`/api/cotizaciones/${cotizacionId}/archivos/confirmar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, tipo, ...(titulo ? { titulo } : {}) }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      archivo?: ArchivoSubido;
      path?: string;
      url?: string | null;
      error?: string;
    };
    if (!res.ok || !j.ok) {
      return { ok: false, error: j.error ?? "No se pudo confirmar la subida." };
    }
    return { ok: true, archivo: j.archivo, path: j.path, url: j.url ?? null };
  } catch {
    return { ok: false, error: "Error de red al confirmar la subida." };
  }
}
