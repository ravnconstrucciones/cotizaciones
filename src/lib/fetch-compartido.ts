/**
 * Fetch compartido del cockpit (ronda 6 — hallazgo de perf).
 *
 * Dos problemas que resuelve:
 * 1. DUPLICADOS: ModuloObras y ModuloPlata pedían `/cashflow/resumen` cada
 *    uno por su cuenta → dos requests idénticos al endpoint más pesado.
 *    Acá las llamadas simultáneas al mismo path comparten UNA promesa
 *    (dedupe solo mientras el request está en vuelo — un refresh posterior
 *    siempre trae datos frescos).
 * 2. ARRANQUE TARDÍO: los fetch de los módulos disparaban recién al
 *    hidratar (~3 s después del HTML en dev). `<PrefetchDatos>` inyecta un
 *    script inline que arranca los fetch apenas el browser parsea el
 *    documento y deja las promesas en `window.__ravnPre`; acá se consumen
 *    si todavía están frescas (ventana corta — después, fetch normal).
 */

export type RespuestaCompartida = {
  ok: boolean;
  status: number;
  body: unknown;
};

declare global {
  interface Window {
    /** Promesas del prefetch inline del documento (ver PrefetchDatos). */
    __ravnPre?: Record<string, Promise<RespuestaCompartida>>;
    /** Timestamp de creación del prefetch (frescura). */
    __ravnPreT?: number;
  }
}

/** Ventana en la que el prefetch del documento se considera fresco. */
const PREFETCH_FRESCO_MS = 20_000;

const enVuelo = new Map<string, Promise<RespuestaCompartida>>();

/** Mantiene `p` en el mapa de dedupe hasta que se resuelva. */
function compartirEnVuelo(
  path: string,
  p: Promise<RespuestaCompartida>
): Promise<RespuestaCompartida> {
  const compartida = p.finally(() => {
    enVuelo.delete(path);
  });
  enVuelo.set(path, compartida);
  return compartida;
}

export function fetchCompartido(path: string): Promise<RespuestaCompartida> {
  // 1) Dedupe de llamadas simultáneas (solo mientras está en vuelo).
  const vivo = enVuelo.get(path);
  if (vivo) return vivo;

  // 2) Prefetch del documento: se consume UNA sola vez (se borra al usarlo)
  //    para que un refresh posterior a una mutación NUNCA reciba datos
  //    viejos. Mientras la promesa esté en vuelo, las llamadas simultáneas
  //    (los módulos de la home montan en el mismo tick) la comparten por (1).
  if (typeof window !== "undefined" && window.__ravnPre) {
    const pre = window.__ravnPre[path];
    const fresco = Date.now() - (window.__ravnPreT ?? 0) < PREFETCH_FRESCO_MS;
    if (pre) {
      delete window.__ravnPre[path];
      if (fresco) return compartirEnVuelo(path, pre);
    }
  }

  // 3) Fetch normal.
  return compartirEnVuelo(
    path,
    fetch(path, { cache: "no-store" }).then(async (r) => ({
      ok: r.ok,
      status: r.status,
      body: (await r.json().catch(() => ({}))) as unknown,
    }))
  );
}
