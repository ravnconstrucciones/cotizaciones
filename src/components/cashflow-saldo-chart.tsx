"use client";

import { useTheme } from "next-themes";
import type { PuntoSaldoObraChart } from "@/lib/cashflow-compute";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** @deprecated Usar PuntoSaldoObraChart */
export type SerieLibretaPunto = PuntoSaldoObraChart;

export type { PuntoSaldoObraChart };

function formatTick(iso: string) {
  const d = iso.slice(5);
  return d.replace("-", "/");
}

const fmtArs = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

export function CashflowSaldoChart({
  data,
  referenciaPropuestaArs,
}: {
  data: PuntoSaldoObraChart[];
  /** Total propuesta (Rentabilidad): línea horizontal de referencia en el eje de cobranzas. */
  referenciaPropuestaArs?: number | null;
}) {
  /**
   * Recharts pinta fills/strokes como attributes SVG (no resuelven
   * var()), así que la tinta se decide acá por tema. Antes de montar,
   * resolvedTheme es undefined → cae al set oscuro (igual en SSR y
   * primer render: sin mismatch de hydration).
   */
  const { resolvedTheme } = useTheme();
  const claro = resolvedTheme === "light";
  const ink = claro ? "rgba(15,23,42,0.55)" : "rgba(234,246,251,0.45)";
  const eje = claro ? "rgba(15,23,42,0.16)" : "rgba(234,246,251,0.14)";
  const grid = claro ? "rgba(15,23,42,0.07)" : "rgba(234,246,251,0.07)";
  const cian = claro ? "#0891b2" : "#22d3ee";
  const verde = claro ? "#047857" : "rgba(52, 211, 153, 0.95)";

  if (data.length === 0) return null;
  const thin = data.length > 45;

  const maxDer = Math.max(
    ...data.map((d) => d.ingresos_acum),
    referenciaPropuestaArs != null && referenciaPropuestaArs > 0
      ? referenciaPropuestaArs
      : 0,
    1
  );

  const tieneRef =
    referenciaPropuestaArs != null &&
    Number.isFinite(referenciaPropuestaArs) &&
    referenciaPropuestaArs > 0;

  return (
    <div className="h-64 w-full min-w-0 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="fecha"
            tick={{ fill: ink, fontSize: 10 }}
            tickFormatter={formatTick}
            interval={thin ? "preserveStartEnd" : 0}
            angle={thin ? -35 : 0}
            textAnchor={thin ? "end" : "middle"}
            height={thin ? 50 : 30}
            stroke={eje}
          />
          <YAxis
            yAxisId="izq"
            tick={{ fill: ink, fontSize: 10 }}
            tickFormatter={(v) =>
              new Intl.NumberFormat("es-AR", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(Number(v))
            }
            width={48}
            stroke={eje}
            label={{
              value: "Saldo caja",
              angle: -90,
              position: "insideLeft",
              fill: ink,
              fontSize: 10,
            }}
          />
          <YAxis
            yAxisId="der"
            orientation="right"
            domain={[0, Math.ceil(maxDer * 1.08)]}
            tick={{ fill: ink, fontSize: 10 }}
            tickFormatter={(v) =>
              new Intl.NumberFormat("es-AR", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(Number(v))
            }
            width={52}
            stroke={eje}
            label={{
              value: "Cobranzas acum.",
              angle: 90,
              position: "insideRight",
              fill: ink,
              fontSize: 10,
            }}
          />
          <Tooltip
            contentStyle={{
              background: claro ? "rgba(255,255,255,0.92)" : "rgba(10,16,20,0.85)",
              border: claro
                ? "1px solid rgba(8,145,178,0.35)"
                : "1px solid rgba(34,211,238,0.3)",
              backdropFilter: "blur(8px)",
              borderRadius: 0,
              color: claro ? "#0f172a" : "#eaf6fb",
              fontSize: 11,
            }}
            cursor={{
              stroke: claro ? "rgba(8,145,178,0.4)" : "rgba(34,211,238,0.35)",
            }}
            formatter={(value, name) => {
              const n = typeof value === "number" ? value : Number(value);
              const label =
                name === "saldo"
                  ? "Saldo caja"
                  : name === "ingresos_acum"
                    ? "Ingresos acumulados"
                    : String(name);
              return [fmtArs(Number.isFinite(n) ? n : 0), label];
            }}
            labelFormatter={(iso) => String(iso)}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8, color: ink }}
            formatter={(value) =>
              value === "saldo"
                ? "Saldo caja (neto)"
                : value === "ingresos_acum"
                  ? "Ingresos acumulados"
                  : String(value)
            }
          />
          {tieneRef ? (
            <ReferenceLine
              yAxisId="der"
              y={referenciaPropuestaArs!}
              stroke={claro ? "rgba(15,23,42,0.25)" : "rgba(234,246,251,0.25)"}
              strokeDasharray="4 4"
              label={{
                value: "Total propuesta (ref.)",
                fill: ink,
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
          ) : null}
          <Line
            yAxisId="izq"
            type="monotone"
            dataKey="saldo"
            stroke={cian}
            strokeWidth={1.5}
            dot={false}
            name="saldo"
          />
          <Line
            yAxisId="der"
            type="monotone"
            dataKey="ingresos_acum"
            stroke={verde}
            strokeWidth={1.5}
            dot={false}
            name="ingresos_acum"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
