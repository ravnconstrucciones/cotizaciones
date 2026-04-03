"use client";

import {
  formatMoney,
  formatMoneyMoneda,
  formatNumber,
  roundArs2,
} from "@/lib/format-currency";

export type BarraConsumoPresupuestoProps = {
  /** Unidad de visualización: ARS (default) o USD (presupuesto en dólares). */
  modoMoneda?: "ARS" | "USD";
  /** Costo directo presupuestado (mat + M.O.). */
  costoDirecto: number;
  /** Margen / contribución esperada sobre ese costo (precio sin IVA redondeado − costo directo). */
  margenEsperado: number;
  /** Suma de gastos registrados. */
  totalGastado: number;
  /** Si hay `propuesta_comercial_pref` válido (precio de obra guardado desde Rentabilidad). */
  hayPrecioObraDesdeRentabilidad?: boolean;
};

/**
 * Barra horizontal: tramo izquierdo = costo directo, derecho = margen esperado;
 * el relleno muestra gastos reales; si superan el costo, invaden el tramo de margen (alerta).
 */
export function BarraConsumoPresupuesto({
  modoMoneda = "ARS",
  costoDirecto,
  margenEsperado,
  totalGastado,
  hayPrecioObraDesdeRentabilidad = false,
}: BarraConsumoPresupuestoProps) {
  const unit = modoMoneda === "USD" ? "USD" : "ARS";
  const fmt = (n: number) =>
    unit === "USD" ? formatMoneyMoneda(n, "USD") : formatMoney(n);

  const C = roundArs2(Math.max(0, costoDirecto));
  const M = roundArs2(Math.max(0, margenEsperado));
  const G = roundArs2(Math.max(0, totalGastado));
  const base = roundArs2(C + M);

  const invadeMargen = G > C && M > 0;
  const excedeTodo = base > 0 && G > base;
  const alerta = G > C;

  const fillPct = base > 0 ? Math.min(100, (G / base) * 100) : G > 0 ? 100 : 0;

  const margenRestante = roundArs2(M - Math.max(0, G - C));

  /** % del precio de referencia (costo + margen previsto). */
  const pctSobrePrecio = (valor: number) =>
    base > 0 ? (valor / base) * 100 : 0;
  const pctMargenPrevisto = pctSobrePrecio(M);
  const pctMargenQueQueda = pctSobrePrecio(margenRestante);
  const margenConsumidoPorGasto =
    M > 0 && roundArs2(M - margenRestante) > 0;

  const costoFlex = base > 0 ? C / base : 1;
  const margenFlex = base > 0 ? M / base : 0;

  const fillBg = alerta
    ? "bg-[#6b1c1c] dark:bg-[#8b2e2e]"
    : "bg-ravn-fg dark:bg-ravn-fg";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-6">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ravn-muted">
            Presupuestado
          </p>
          <p className="mt-1 font-raleway text-lg font-medium tabular-nums text-ravn-fg md:text-xl">
            {fmt(C)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ravn-muted">
            Gastado
          </p>
          <p
            className={`mt-1 font-raleway text-lg font-medium tabular-nums md:text-xl ${
              alerta ? "text-[#6b1c1c] dark:text-[#f87171]" : "text-ravn-fg"
            }`}
          >
            {fmt(G)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ravn-muted">
            Margen restante
          </p>
          <p
            className={`mt-1 font-raleway text-lg font-medium tabular-nums md:text-xl ${
              margenRestante < 0
                ? "text-[#6b1c1c] dark:text-[#f87171]"
                : "text-ravn-fg"
            }`}
          >
            {fmt(margenRestante)}
          </p>
        </div>
      </div>

      {base > 0 ? (
        <div className="rounded-none border border-ravn-line bg-ravn-subtle/40 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ravn-muted">
            Margen sobre precio de referencia
          </p>
          <p className="mt-1 text-xs text-ravn-muted">
            Precio de referencia = costo directo + margen previsto:{" "}
            <span className="tabular-nums text-ravn-fg">{fmt(base)}</span>
          </p>
          {M > 0 ? (
            <div className="mt-3 space-y-2 text-sm text-ravn-fg">
              {margenConsumidoPorGasto ? (
                <>
                  <p>
                    <span className="text-ravn-muted">Margen previsto: </span>
                    <span className="font-semibold tabular-nums">
                      {formatNumber(pctMargenPrevisto, 1)}%
                    </span>
                    <span className="text-ravn-muted"> → </span>
                    <span className="font-medium tabular-nums">{fmt(M)}</span>
                  </p>
                  <p>
                    <span className="text-ravn-muted">
                      Margen que queda ahora:{" "}
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        margenRestante < 0
                          ? "text-[#6b1c1c] dark:text-[#f87171]"
                          : ""
                      }`}
                    >
                      {formatNumber(pctMargenQueQueda, 1)}%
                    </span>
                    <span className="text-ravn-muted"> → </span>
                    <span
                      className={`font-medium tabular-nums ${
                        margenRestante < 0
                          ? "text-[#6b1c1c] dark:text-[#f87171]"
                          : ""
                      }`}
                    >
                      {fmt(margenRestante)}
                    </span>
                  </p>
                </>
              ) : (
                <p>
                  <span className="text-ravn-muted">
                    Margen sobre ese precio:{" "}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatNumber(pctMargenQueQueda, 1)}%
                  </span>
                  <span className="text-ravn-muted"> → </span>
                  <span className="font-medium tabular-nums">
                    {fmt(margenRestante)}
                  </span>
                  {G <= C ? (
                    <span className="text-ravn-muted">
                      {" "}
                      (el gasto aún no consume margen)
                    </span>
                  ) : null}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-ravn-muted">
              Sin margen previsto en la propuesta; el precio de referencia coincide
              con el costo directo.
            </p>
          )}
          {margenRestante === 0 && !excedeTodo && M > 0 ? (
            <p className="mt-2 text-xs font-medium text-ravn-fg">
              Llegaste al límite del precio de referencia: no queda margen
              previsto (0 %).
            </p>
          ) : null}
        </div>
      ) : null}

      {base <= 0 ? (
        <p className="text-sm text-ravn-muted">
          Sin costo directo ni margen de referencia en este presupuesto. Cargá
          ítems y definí rentabilidad para ver la barra.
        </p>
      ) : (
        <>
          <div
            className="relative h-4 w-full overflow-hidden md:h-5"
            role="img"
            aria-label={`Consumo del presupuesto: ${Math.round(fillPct)} por ciento`}
          >
            <div className="absolute inset-0 flex">
              <div
                className="h-full bg-ravn-subtle"
                style={{ flex: costoFlex || 1 }}
              />
              {margenFlex > 0 ? (
                <div
                  className="h-full border-l border-ravn-line bg-[rgba(24,24,23,0.06)] dark:bg-[rgba(254,247,242,0.08)]"
                  style={{ flex: margenFlex }}
                />
              ) : null}
            </div>
            <div
              className={`absolute inset-y-0 left-0 transition-[width] duration-500 ease-out ${fillBg}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] uppercase tracking-[0.12em] text-ravn-muted">
            <span>
              Costo directo{" "}
              <span className="tabular-nums text-ravn-fg">{fmt(C)}</span>
            </span>
            {M > 0 ? (
              <span>
                Margen esperado{" "}
                <span className="tabular-nums text-ravn-fg">{fmt(M)}</span>
              </span>
            ) : hayPrecioObraDesdeRentabilidad ? (
              <span className="text-ravn-muted">
                Margen esperado{" "}
                <span className="tabular-nums text-ravn-fg">{fmt(0)}</span>{" "}
                (precio sin IVA ≤ costo directo)
              </span>
            ) : (
              <span className="text-ravn-muted">
                Sin precio de obra guardado: usá Rentabilidad y guardá en la nube
              </span>
            )}
            {invadeMargen ? (
              <span className="font-medium text-[#6b1c1c] dark:text-[#f87171]">
                Gasto por encima del costo directo
              </span>
            ) : null}
            {excedeTodo ? (
              <span className="font-medium text-[#6b1c1c] dark:text-[#f87171]">
                Desvío sobre precio de referencia
                {base > 0 ? (
                  <>
                    {" "}
                    · excedente:{" "}
                    <span className="tabular-nums">
                      {fmt(roundArs2(G - base))}
                    </span>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
