import { createClient } from "@/lib/supabase/client";
import { extensionImagen } from "@/lib/adjunto-imagen";

/**
 * Subida de la imagen adjunta del prompt box al bucket privado `referencias`
 * (mismo bucket del ADN; política storage_insert_auth permite al usuario
 * logueado). El path resultante viaja en `contexto.media` del trabajo
 * encolado — el daemon lo firma/lee del lado servidor.
 */
export const REFERENCIAS_BUCKET = "referencias";

export async function uploadImagenTablero(
  file: File
): Promise<{ path: string; error: string | null }> {
  const path = `tablero/${crypto.randomUUID()}.${extensionImagen(file)}`;
  const sb = createClient();
  const { error } = await sb.storage.from(REFERENCIAS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  return { path, error: error?.message ?? null };
}
