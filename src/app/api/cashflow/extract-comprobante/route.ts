import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

function hoyArgentinaIso(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = p.find((x) => x.type === "year")?.value;
  const m = p.find((x) => x.type === "month")?.value;
  const d = p.find((x) => x.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

function promptImagen(hoyAr: string): string {
  return `Sos un asistente para comprobantes y tickets en Argentina (español).
Analizá la imagen y devolvé SOLO un JSON con estas claves (sin texto fuera del JSON):
{
  "monto_ars": number | null,
  "fecha": string | null,
  "concepto": string,
  "tipo": "ingreso" | "egreso" | null
}
Reglas:
- monto_ars: total en pesos argentinos (un solo número, sin símbolo). Si hay varios importes, elegí el TOTAL A PAGAR o el más relevante al comprobante.
- fecha: "YYYY-MM-DD" **solo** si se lee una fecha en el comprobante (calendario Argentina, no inventes). Si no hay fecha legible, null. Referencia: hoy en Argentina es ${hoyAr}.
- concepto: una línea breve (quién/qué/compra o cobro).
- tipo: "ingreso" si es cobro, transferencia entrante, depósito; "egreso" si es compra, pago, tarjeta, transferencia saliente; null si no se deduce.`;
}

function promptAudio(hoyAr: string): string {
  return `Escuchá el audio. Es un gasto o cobro relatado en Argentina (español).
Devolvé SOLO un JSON con estas claves:
{
  "monto_ars": number | null,
  "fecha": string | null,
  "concepto": string,
  "tipo": "ingreso" | "egreso" | null,
  "transcripcion": string
}
- transcripcion: breve resumen de lo dicho (si no hay habla clara, cadena vacía).
- monto_ars: número si se menciona en pesos; si no, null.
- fecha: "YYYY-MM-DD" en **calendario Argentina (Buenos Aires)**. Si dice "hoy" o **no indica ninguna fecha del gasto**, usá exactamente esta fecha: ${hoyAr}. Si menciona un día concreto (ej. "ayer", "el 3 de abril"), interpretalo en Argentina y devolvé esa fecha. No uses fechas sacadas del nombre del archivo ni números al azar.
- tipo y concepto como en un comprobante.`;
}

function geminiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim()
  );
}

function anthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim();
}

/** Imagen: gemini | claude. Audio: solo Gemini (multimodal). */
function imageProvider(): "gemini" | "claude" {
  const pref = (process.env.CASHFLOW_EXTRACT_PROVIDER ?? "auto").trim().toLowerCase();
  const g = geminiKey();
  const a = anthropicKey();

  if (pref === "gemini") {
    if (!g) throw new Error("CASHFLOW_EXTRACT_PROVIDER=gemini pero falta GEMINI_API_KEY (o GOOGLE_API_KEY).");
    return "gemini";
  }
  if (pref === "claude") {
    if (!a) throw new Error("CASHFLOW_EXTRACT_PROVIDER=claude pero falta ANTHROPIC_API_KEY.");
    return "claude";
  }
  if (pref !== "auto") {
    throw new Error(
      "CASHFLOW_EXTRACT_PROVIDER inválido. Usá auto, gemini o claude."
    );
  }
  if (g) return "gemini";
  if (a) return "claude";
  throw new Error(
    "Falta GEMINI_API_KEY o ANTHROPIC_API_KEY en el servidor (.env.local)."
  );
}

function parseJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const raw = fence ? fence[1]!.trim() : trimmed;
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return parsed;
}

function parseMontoFlexible(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw * 100) / 100;
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  // "1234.56" o "1234,56" o "1.234,56" (AR)
  const normalized = s.includes(",")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Fecha calendario YYYY-MM-DD; ISO con hora se convierte a día en Argentina. */
function normalizarFecha(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) {
    const day = dmy[1]!.padStart(2, "0");
    const month = dmy[2]!.padStart(2, "0");
    const year = dmy[3]!;
    return `${year}-${month}-${day}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  }
  return null;
}

function normalizarRespuesta(
  raw: Record<string, unknown>
): {
  monto_ars: number | null;
  fecha: string | null;
  concepto: string;
  tipo: "ingreso" | "egreso" | null;
} {
  let monto_ars: number | null = parseMontoFlexible(raw.monto_ars);
  let fecha: string | null = normalizarFecha(raw.fecha);
  const concepto =
    typeof raw.concepto === "string" ? raw.concepto.trim().slice(0, 500) : "";
  let tipo: "ingreso" | "egreso" | null = null;
  if (raw.tipo === "ingreso" || raw.tipo === "egreso") {
    tipo = raw.tipo;
  }
  return { monto_ars, fecha, concepto, tipo };
}

/**
 * Modelo por defecto en Google AI Studio.
 * `gemini-2.0-flash` dejó de estar disponible para cuentas nuevas; usar 2.5 o el que liste tu proyecto.
 */
function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-20241022";
}

/** Mensaje corto en español cuando Gemini responde 429 / cuota / facturación. */
function friendlyGeminiError(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("no longer available") ||
    lower.includes("deprecated") ||
    lower.includes("has been retired")
  ) {
    return (
      "Ese modelo de Gemini ya no está disponible para tu cuenta. " +
      "En .env.local poné GEMINI_MODEL=gemini-2.5-flash (o el que figure en AI Studio → Modelos) y reiniciá el servidor."
    );
  }
  if (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("resource exhausted") ||
    lower.includes("exceeded your current quota") ||
    (lower.includes("billing") && lower.includes("limit"))
  ) {
    return (
      "Límite de uso de Gemini (cuota del plan gratuito agotada o sin cupo para este modelo). " +
      "Revisá Uso y facturación en Google AI Studio, esperá unos minutos y reintentá, o probá otro modelo con GEMINI_MODEL en .env.local según lo que tengas habilitado. " +
      "https://ai.google.dev/gemini-api/docs/rate-limits"
    );
  }
  return raw;
}

/** La API REST de Google usa camelCase en el JSON (inlineData, mimeType). */
async function geminiGenerateJson(
  parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  >
): Promise<Record<string, unknown>> {
  const key = geminiKey();
  if (!key) throw new Error("Falta GEMINI_API_KEY.");

  const model = geminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const j = (await res.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  if (!res.ok) {
    throw new Error(
      friendlyGeminiError(j.error?.message ?? "Error de la API de Gemini.")
    );
  }

  const finish = j.candidates?.[0]?.finishReason;
  if (finish === "SAFETY" || finish === "BLOCKLIST") {
    throw new Error("Gemini bloqueó el contenido (políticas). Probá otra imagen o modo manual.");
  }

  const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text.trim()) {
    throw new Error(
      "Gemini no devolvió texto. Probá otro GEMINI_MODEL en .env.local (ej. gemini-2.5-flash) o modo manual."
    );
  }
  try {
    return parseJsonObject(text);
  } catch {
    throw new Error(
      "No se pudo interpretar la respuesta del modelo. Revisá GEMINI_MODEL o completá a mano."
    );
  }
}

async function extractFromImageGemini(
  mime: string,
  base64: string
): Promise<ReturnType<typeof normalizarRespuesta>> {
  const hoy = hoyArgentinaIso();
  const raw = await geminiGenerateJson([
    { text: promptImagen(hoy) },
    { inlineData: { mimeType: mime, data: base64 } },
  ]);
  return normalizarRespuesta(raw);
}

async function extractFromAudioGemini(
  mime: string,
  base64: string
): Promise<ReturnType<typeof normalizarRespuesta> & { transcripcion?: string }> {
  const hoy = hoyArgentinaIso();
  const raw = await geminiGenerateJson([
    { text: promptAudio(hoy) },
    { inlineData: { mimeType: mime, data: base64 } },
  ]);
  const base = normalizarRespuesta(raw);
  const fecha = base.fecha ?? hoy;
  const withFecha = { ...base, fecha };
  const tr =
    typeof raw.transcripcion === "string" ? raw.transcripcion.trim() : undefined;
  return tr ? { ...withFecha, transcripcion: tr } : withFecha;
}

async function extractFromImageClaude(
  mime: string,
  base64: string
): Promise<ReturnType<typeof normalizarRespuesta>> {
  const key = anthropicKey();
  if (!key) throw new Error("Falta ANTHROPIC_API_KEY.");
  const hoy = hoyArgentinaIso();

  const mediaType =
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/gif" ||
    mime === "image/webp"
      ? mime
      : "image/jpeg";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: claudeModel(),
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text:
                promptImagen(hoy) + "\n\nRespondé solo JSON válido, sin markdown.",
            },
          ],
        },
      ],
    }),
  });

  const j = (await res.json()) as {
    error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
  };

  if (!res.ok) {
    throw new Error(j.error?.message ?? "Error de la API de Claude.");
  }

  const text = j.content?.find((c) => c.type === "text")?.text ?? "";
  const raw = parseJsonObject(text);
  return normalizarRespuesta(raw);
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido (campo file)." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo es demasiado grande (máx. 15 MB)." },
      { status: 400 }
    );
  }

  const mime = file.type || "application/octet-stream";

  try {
    if (mime.startsWith("image/")) {
      const buf = Buffer.from(await file.arrayBuffer());
      const base64 = buf.toString("base64");
      const heic =
        mime === "image/heic" ||
        mime === "image/heif" ||
        file.name.toLowerCase().endsWith(".heic");
      if (heic) {
        const g = geminiKey();
        if (g) {
          const mimeUse = mime.startsWith("image/") ? mime : "image/heic";
          const out = await extractFromImageGemini(mimeUse, base64);
          return NextResponse.json(out);
        }
        return NextResponse.json(
          {
            error:
              "Las fotos HEIC no las procesa Claude. Agregá GEMINI_API_KEY (Google AI Studio) o exportá la foto como JPEG desde el teléfono.",
          },
          { status: 422 }
        );
      }
      const which = imageProvider();
      const out =
        which === "gemini"
          ? await extractFromImageGemini(mime, base64)
          : await extractFromImageClaude(mime, base64);
      return NextResponse.json(out);
    }

    if (mime.startsWith("audio/")) {
      const g = geminiKey();
      if (!g) {
        return NextResponse.json(
          {
            error:
              "El audio solo se analiza con Gemini (Claude no alcanza para esto). En la raíz del proyecto, en .env.local, poné GEMINI_API_KEY=tu_clave de Google AI Studio, guardá y reiniciá npm run dev. Si ya está, revisá que no haya comillas ni espacios alrededor del valor.",
          },
          { status: 501 }
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const base64 = buf.toString("base64");
      const out = await extractFromAudioGemini(mime, base64);
      const { transcripcion, ...rest } = out as typeof out & {
        transcripcion?: string;
      };
      if (transcripcion) {
        return NextResponse.json({ ...rest, transcripcion });
      }
      return NextResponse.json(rest);
    }

    return NextResponse.json(
      { error: "Tipo de archivo no soportado. Usá imagen o audio." },
      { status: 400 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al procesar el archivo.";
    const status = msg.includes("Falta ") || msg.includes("CASHFLOW_EXTRACT_PROVIDER") ? 501 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
