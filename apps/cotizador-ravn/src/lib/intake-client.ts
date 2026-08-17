import { apiUrl } from "./api-url";
import type { BridgeConfig } from "../components/live-terminals";

/**
 * Cliente de la puerta de entrada (spec 2026-08-17): subida de archivos del
 * intake y despacho de la ola de reconocimiento. Vivía en el formulario gate;
 * ahora lo usan el composer conversacional y el panel de reconocimiento.
 */

const MULTIPART_MAX = 4 * 1024 * 1024;

async function jsonDe(res: Response): Promise<Record<string, unknown>> {
  const cuerpo = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const motivo = cuerpo && typeof cuerpo.error === "string" ? cuerpo.error : `HTTP ${res.status}`;
    throw new Error(motivo);
  }
  return cuerpo ?? {};
}

/** Sube un archivo: corto (multipart) o directo a Storage según el tamaño. */
export async function subirUno(cotizacionId: string, file: File): Promise<void> {
  if (file.size <= MULTIPART_MAX) {
    const form = new FormData();
    form.set("file", file);
    await jsonDe(
      await fetch(apiUrl(`/api/intake/archivos?quote=${encodeURIComponent(cotizacionId)}`), {
        method: "POST",
        body: form,
      })
    );
    return;
  }
  const firma = await jsonDe(
    await fetch(apiUrl(`/api/intake/archivos/firmar?quote=${encodeURIComponent(cotizacionId)}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: file.name, size: file.size, contentType: file.type }),
    })
  );
  const uploadUrl = String(firma.upload_url ?? "");
  const path = String(firma.path ?? "");
  if (!uploadUrl || !path) throw new Error("La firma de subida vino incompleta.");
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "x-upsert": "false", "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error(`Storage rechazó la subida de "${file.name}" (${put.status}).`);
  await jsonDe(
    await fetch(apiUrl(`/api/intake/archivos/confirmar?quote=${encodeURIComponent(cotizacionId)}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, titulo: file.name }),
    })
  );
}

/** Pide el payload de la ola al server y se lo entrega al bridge local. */
export async function despacharOla(
  cotizacionId: string,
  bridge: BridgeConfig | null
): Promise<{ ok: boolean; mensaje: string }> {
  const payload = await jsonDe(
    await fetch(apiUrl(`/api/intake/ola?quote=${encodeURIComponent(cotizacionId)}`), {
      method: "POST",
    })
  );
  if (!bridge) {
    return {
      ok: false,
      mensaje:
        "Bridge apagado: el borrador y los archivos quedaron guardados. Levantá el bridge (npm run bridge) y relanzá la ola.",
    };
  }
  try {
    const res = await fetch(`${bridge.url}/waves`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-token": bridge.token },
      body: JSON.stringify(payload.wave),
    });
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(cuerpo?.error ?? "El bridge rechazó la ola.");
    return { ok: true, mensaje: "Ola de intake despachada: Fable está desmenuzando." };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "No se pudo hablar con el bridge.";
    return {
      ok: false,
      mensaje: `La ola no salió (${motivo}). Todo quedó persistido: relanzala cuando el bridge esté vivo.`,
    };
  }
}
