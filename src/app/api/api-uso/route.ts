import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Gasto de API de Anthropic para el KPI "API bot" de Salud del Negocio.
 *
 * Dos patas, cada una degrada sola sin romper la otra:
 *  - admin: el número POSTA de la organización vía Admin API (cost_report).
 *    Necesita ANTHROPIC_ADMIN_KEY (sk-ant-admin…) en el entorno; sin key
 *    responde { disponible: false } y el chip muestra "—". Cache 1 hora.
 *  - propio: el detalle que registra el bot en la tabla api_uso (tokens y
 *    costo estimado por llamada). Hoy + mes, siempre fresco.
 */

export const dynamic = "force-dynamic";

const ADMIN_BASE = "https://api.anthropic.com/v1/organizations/cost_report";

/** Fecha (YYYY-MM-DD) de hoy en Argentina. */
function hoyAR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

type BucketCosto = { starting_at: string; results?: { amount?: string }[] };

/**
 * Suma el cost_report día por día desde `desdeISO` (UTC). Los montos vienen
 * como strings decimales en CENTAVOS de USD. Pagina con next_page si hace falta.
 */
async function costoAdmin(key: string): Promise<{
  disponible: boolean;
  mes_usd?: number;
  ultimos_30_usd?: number;
}> {
  const ahora = Date.now();
  const hace30 = new Date(ahora - 30 * 24 * 60 * 60 * 1000);
  const mesActual = hoyAR().slice(0, 7); // YYYY-MM
  const inicioMes = new Date(`${mesActual}-01T00:00:00Z`);
  const desde = inicioMes < hace30 ? inicioMes : hace30;

  const buckets: BucketCosto[] = [];
  let page: string | null = null;
  for (let i = 0; i < 5; i++) {
    const url = new URL(ADMIN_BASE);
    url.searchParams.set("starting_at", desde.toISOString());
    url.searchParams.set("ending_at", new Date(ahora).toISOString());
    url.searchParams.append("group_by[]", "description");
    if (page) url.searchParams.set("page", page);
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      next: { revalidate: 3600 }, // 1 hora
    });
    if (!res.ok) throw new Error(`admin api ${res.status}`);
    const d = (await res.json()) as {
      data?: BucketCosto[];
      has_more?: boolean;
      next_page?: string | null;
    };
    buckets.push(...(d.data ?? []));
    if (!d.has_more || !d.next_page) break;
    page = d.next_page;
  }

  let mesCent = 0;
  let treintaCent = 0;
  for (const b of buckets) {
    const cent = (b.results ?? []).reduce(
      (acc, r) => acc + (Number(r.amount) || 0),
      0
    );
    treintaCent += cent;
    if ((b.starting_at ?? "").slice(0, 7) === mesActual) mesCent += cent;
  }
  return {
    disponible: true,
    mes_usd: mesCent / 100,
    ultimos_30_usd: treintaCent / 100,
  };
}

/** Detalle propio desde api_uso (lo que el bot registró llamada a llamada). */
async function costoPropio() {
  const sb = createSupabaseAdminClient();
  const mesActual = hoyAR().slice(0, 7);
  // Inicio del mes en hora AR (UTC−3) para que el corte coincida con el día de Eze.
  const desdeMes = `${mesActual}-01T00:00:00-03:00`;
  const { data, error } = await sb
    .from("api_uso")
    .select("creado_at, servicio, costo_usd")
    .gte("creado_at", desdeMes)
    .limit(20000);
  if (error) throw new Error(error.message);

  const hoy = hoyAR();
  const fmtAR = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  let mesUsd = 0;
  let mesLlamadas = 0;
  let hoyUsd = 0;
  let hoyMensajes = 0;
  for (const f of data ?? []) {
    const costo = Number(f.costo_usd) || 0;
    mesUsd += costo;
    mesLlamadas += 1;
    if (fmtAR.format(new Date(f.creado_at)) === hoy) {
      hoyUsd += costo;
      // 1 mensaje de WhatsApp = 1 pasada del clasificador (las otras llamadas
      // son auxiliares del mismo mensaje).
      if (f.servicio === "clasificador") hoyMensajes += 1;
    }
  }
  return {
    hoy_usd: hoyUsd,
    hoy_mensajes: hoyMensajes,
    mes_usd: mesUsd,
    mes_llamadas: mesLlamadas,
  };
}

export async function GET() {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  const [admin, propio] = await Promise.all([
    key
      ? costoAdmin(key).catch((e) => {
          console.error("[api-uso] admin err:", e instanceof Error ? e.message : e);
          return { disponible: false as const };
        })
      : Promise.resolve({ disponible: false as const }),
    costoPropio().catch((e) => {
      console.error("[api-uso] propio err:", e instanceof Error ? e.message : e);
      return null;
    }),
  ]);
  return NextResponse.json({ admin, propio });
}
