import { NextResponse } from "next/server";
import { CRONISTA_DOLAR_URL } from "@/lib/cotizacion-labels";

export const dynamic = "force-dynamic";

const DOLARAPI = "https://dolarapi.com/v1/dolares";
const BLUELYTICS = "https://api.bluelytics.app.ar/v2/latest";
const CRIPTOYA_DOLAR = "https://criptoya.com/api/dolar";

const FETCH_MS = 18_000;

const JSON_HEADERS = {
  Accept: "application/json",
  "User-Agent": "RAVN/1.0 (cotizaciones; referencia presupuestos)",
} as const;

type CotizacionRow = {
  moneda?: string;
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion?: string;
};

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return {
    signal: c.signal,
    cancel: () => clearTimeout(t),
  };
}

async function fetchJson(url: string): Promise<unknown | null> {
  const { signal, cancel } = withTimeout(FETCH_MS);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: JSON_HEADERS,
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    cancel();
  }
}

function mapBluelytics(data: unknown): CotizacionRow[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const oficial = o.oficial as Record<string, number> | undefined;
  const blue = o.blue as Record<string, number> | undefined;
  const out: CotizacionRow[] = [];
  if (oficial && typeof oficial.value_sell === "number") {
    out.push({
      moneda: "USD",
      casa: "oficial",
      nombre: "Oficial",
      compra: Number(oficial.value_buy) || 0,
      venta: Number(oficial.value_sell) || 0,
    });
  }
  if (blue && typeof blue.value_sell === "number") {
    out.push({
      moneda: "USD",
      casa: "blue",
      nombre: "Blue",
      compra: Number(blue.value_buy) || 0,
      venta: Number(blue.value_sell) || 0,
    });
  }
  return out;
}

function num(x: unknown): number {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function mepVentaFrom(obj: Record<string, unknown> | undefined): number {
  if (!obj) return 0;
  const al30 = obj.al30 as Record<string, unknown> | undefined;
  if (!al30) return 0;
  const h24 = al30["24hs"] as Record<string, unknown> | undefined;
  const ci = al30.ci as Record<string, unknown> | undefined;
  return num(h24?.price) || num(ci?.price);
}

/** Mapea la respuesta de CriptoYa al mismo esquema de casas que DolarAPI / etiquetas Cronista. */
function mapCriptoYa(data: unknown): CotizacionRow[] {
  if (!data || typeof data !== "object") return [];
  const j = data as Record<string, unknown>;
  const out: CotizacionRow[] = [];

  const push = (
    casa: string,
    nombre: string,
    compra: number,
    venta: number
  ) => {
    const v = venta > 0 ? venta : compra;
    const c = compra > 0 ? compra : v;
    if (v <= 0 && c <= 0) return;
    out.push({ moneda: "USD", casa, nombre, compra: c, venta: v > 0 ? v : c });
  };

  const oficial = j.oficial as Record<string, unknown> | undefined;
  if (oficial) {
    const ask = num(oficial.ask) || num(oficial.price);
    const bid = num(oficial.bid) || num(oficial.price);
    push("oficial", "Oficial", bid || ask, ask || bid);
  }

  const blue = j.blue as Record<string, unknown> | undefined;
  if (blue) {
    push("blue", "Blue", num(blue.bid), num(blue.ask));
  }

  const tarjeta = j.tarjeta as Record<string, unknown> | undefined;
  if (tarjeta) {
    const p = num(tarjeta.price);
    if (p > 0) push("tarjeta", "Tarjeta", p, p);
  }

  const mayorista = j.mayorista as Record<string, unknown> | undefined;
  if (mayorista) {
    const p = num(mayorista.price);
    if (p > 0) push("mayorista", "Mayorista", p, p);
  }

  const mep = j.mep as Record<string, unknown> | undefined;
  const mepV = mepVentaFrom(mep);
  if (mepV > 0) push("bolsa", "MEP (Bolsa)", mepV, mepV);

  const ccl = j.ccl as Record<string, unknown> | undefined;
  const cclV = mepVentaFrom(ccl);
  if (cclV > 0) push("contadoconliqui", "CCL", cclV, cclV);

  const cripto = j.cripto as Record<string, unknown> | undefined;
  const usdt = cripto?.usdt as Record<string, unknown> | undefined;
  if (usdt) {
    const ask = num(usdt.ask);
    const bid = num(usdt.bid);
    if (ask > 0 || bid > 0) push("cripto", "Cripto (USDT)", bid, ask);
  }

  return out;
}

function normalizeDolarApiRows(data: unknown): CotizacionRow[] {
  if (!Array.isArray(data)) return [];
  const rows = data as CotizacionRow[];
  return rows.filter(
    (r) =>
      r &&
      typeof r.casa === "string" &&
      typeof r.venta === "number" &&
      r.venta > 0
  );
}

async function fetchDolarApi(): Promise<CotizacionRow[] | null> {
  const data = await fetchJson(DOLARAPI);
  const rows = normalizeDolarApiRows(data);
  return rows.length > 0 ? rows : null;
}

async function fetchBluelyticsRows(): Promise<CotizacionRow[] | null> {
  const data = await fetchJson(BLUELYTICS);
  const rows = mapBluelytics(data);
  return rows.length > 0 ? rows : null;
}

async function fetchCriptoYaRows(): Promise<CotizacionRow[] | null> {
  const data = await fetchJson(CRIPTOYA_DOLAR);
  const rows = mapCriptoYa(data);
  return rows.length > 0 ? rows : null;
}

export async function GET() {
  try {
    let cotizaciones = await fetchDolarApi();
    let fuente = "DolarAPI";

    if (!cotizaciones || cotizaciones.length === 0) {
      cotizaciones = await fetchBluelyticsRows();
      fuente = "Bluelytics";
    }

    if (!cotizaciones || cotizaciones.length === 0) {
      cotizaciones = await fetchCriptoYaRows();
      fuente = "CriptoYa";
    }

    if (!cotizaciones || cotizaciones.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se pudieron obtener cotizaciones automáticas. Ingresá la cotización venta manualmente en la pantalla.",
          cronistaUrl: CRONISTA_DOLAR_URL,
          cotizaciones: [],
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      cronistaUrl: CRONISTA_DOLAR_URL,
      referencia: `Valores vía ${fuente}; contrastar con El Cronista antes de cerrar.`,
      fuente,
      cotizaciones,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "No hubo conexión con los proveedores de cotización. Ingresá la cotización venta manualmente o reintentá.",
        cronistaUrl: CRONISTA_DOLAR_URL,
        cotizaciones: [],
      },
      { status: 200 }
    );
  }
}
