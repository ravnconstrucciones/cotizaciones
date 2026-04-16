import { createClient } from "@/lib/supabase/client";

export const GASTOS_OBRA_BUCKET = "gastos-obra";

export type GastoAdjuntoKind = "foto" | "audio";

export function publicUrlGastoAdjunto(path: string): string {
  const sb = createClient();
  const { data } = sb.storage.from(GASTOS_OBRA_BUCKET).getPublicUrl(path.trim());
  return data.publicUrl;
}

function extensionForKind(kind: GastoAdjuntoKind, file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,10}$/.test(fromName)) return fromName;
  if (kind === "foto") return "jpg";
  const t = file.type.toLowerCase();
  if (t.includes("mpeg")) return "mp3";
  if (t.includes("wav")) return "wav";
  if (t.includes("ogg")) return "ogg";
  return "webm";
}

export async function uploadGastoAdjunto(
  presupuestoId: string,
  gastoId: string,
  file: File,
  kind: GastoAdjuntoKind
): Promise<{ path: string; error: string | null }> {
  const ext = extensionForKind(kind, file);
  const path = `${presupuestoId}/${gastoId}/${crypto.randomUUID()}.${ext}`;
  const sb = createClient();
  const { error } = await sb.storage.from(GASTOS_OBRA_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  return { path, error: error?.message ?? null };
}

export async function deleteGastoAdjuntoStorage(path: string | null | undefined): Promise<void> {
  const p = path?.trim();
  if (!p) return;
  const sb = createClient();
  await sb.storage.from(GASTOS_OBRA_BUCKET).remove([p]);
}

export function adjuntoKindDesdeFile(file: File): GastoAdjuntoKind | null {
  if (file.type.startsWith("image/")) return "foto";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}
