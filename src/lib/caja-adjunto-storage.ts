import { createClient } from "@/lib/supabase/client";

/** Mismo bucket que gastos de obra; rutas bajo `cashflow/`. */
export const CAJA_ADJUNTO_BUCKET = "gastos-obra";

export type CajaAdjuntoKind = "foto" | "audio";

// `publicUrlCajaAdjunto` se borró el 2026-07-28 junto con su gemela de
// gastos-storage: sin usar, y el bucket pasó a privado. Para mostrar el
// adjunto: signed URL desde una API route.

function extensionForKind(kind: CajaAdjuntoKind, file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,10}$/.test(fromName)) return fromName;
  if (kind === "foto") return "jpg";
  const t = file.type.toLowerCase();
  if (t.includes("mpeg")) return "mp3";
  if (t.includes("wav")) return "wav";
  if (t.includes("ogg")) return "ogg";
  return "webm";
}

export async function uploadCajaAdjunto(
  obraId: string,
  itemId: string,
  file: File,
  kind: CajaAdjuntoKind
): Promise<{ path: string; error: string | null }> {
  const ext = extensionForKind(kind, file);
  const path = `cashflow/${obraId}/${itemId}/${crypto.randomUUID()}.${ext}`;
  const sb = createClient();
  const { error } = await sb.storage.from(CAJA_ADJUNTO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  return { path, error: error?.message ?? null };
}

export async function deleteCajaAdjuntoStorage(
  path: string | null | undefined
): Promise<void> {
  const p = path?.trim();
  if (!p) return;
  const sb = createClient();
  await sb.storage.from(CAJA_ADJUNTO_BUCKET).remove([p]);
}
