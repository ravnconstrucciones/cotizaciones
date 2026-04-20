"use client";

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
          <CartesianGrid stroke="var(--ravn-line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="fecha"
            tick={{ fill: "var(--ravn-muted)", fontSize: 10 }}
            tickFormatter={formatTick}
            interval={thin ? "preserveStartEnd" : 0}
            angle={thin ? -35 : 0}
            textAnchor={thin ? "end" : "middle"}
            height={thin ? 50 : 30}
          />
          <YAxis
            yAxisId="izq"
            tick={{ fill: "var(--ravn-muted)", fontSize: 10 }}
            tickFormatter={(v) =>
              new Intl.NumberFormat("es-AR", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(Number(v))
            }
            width={48}
            label={{
              value: "Saldo caja",
              angle: -90,
              position: "insideLeft",
              fill: "var(--ravn-muted)",
              fontSize: 10,
            }}
          />
          <YAxis
            yAxisId="der"
            orientation="right"
            domain={[0, Math.ceil(maxDer * 1.08)]}
            tick={{ fill: "var(--ravn-muted)", fontSize: 10 }}
            tickFormatter={(v) =>
              new Intl.NumberFormat("es-AR", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(Number(v))
            }
            width={52}
            label={{
              value: "Cobranzas acum.",
              angle: 90,
              position: "insideRight",
              fill: "var(--ravn-muted)",
              fontSize: 10,
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--ravn-surface)",
              border: "1px solid var(--ravn-line)",
              borderRadius: 0,
              color: "var(--ravn-fg)",
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
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
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
              stroke="rgba(251, 191, 36, 0.85)"
              strokeDasharray="5 5"
              label={{
                value: "Total propuesta (ref.)",
                fill: "var(--ravn-muted)",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
          ) : null}
          <Line
            yAxisId="izq"
            type="monotone"
            dataKey="saldo"
            stroke="var(--ravn-accent)"
            strokeWidth={2}
            dot={false}
            name="saldo"
          />
          <Line
            yAxisId="der"
            type="monotone"
            dataKey="ingresos_acum"
            stroke="rgba(52, 211, 153, 0.95)"
            strokeWidth={2}
            dot={false}
            name="ingresos_acum"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
