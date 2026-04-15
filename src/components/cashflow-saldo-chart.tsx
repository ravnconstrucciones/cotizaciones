"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type SerieLibretaPunto = { fecha: string; saldo: number };

function formatTick(iso: string) {
  const d = iso.slice(5);
  return d.replace("-", "/");
}

export function CashflowSaldoChart({ data }: { data: SerieLibretaPunto[] }) {
  if (data.length === 0) return null;
  const thin = data.length > 45;
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
            tick={{ fill: "var(--ravn-muted)", fontSize: 10 }}
            tickFormatter={(v) =>
              new Intl.NumberFormat("es-AR", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(Number(v))
            }
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "var(--ravn-surface)",
              border: "1px solid var(--ravn-line)",
              borderRadius: 0,
              color: "var(--ravn-fg)",
            }}
            formatter={(value) => {
              const n = typeof value === "number" ? value : Number(value);
              return [
                new Intl.NumberFormat("es-AR", {
                  style: "currency",
                  currency: "ARS",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }).format(Number.isFinite(n) ? n : 0),
                "Saldo",
              ];
            }}
            labelFormatter={(iso) => String(iso)}
          />
          <Line
            type="monotone"
            dataKey="saldo"
            stroke="var(--ravn-accent)"
            strokeWidth={2}
            dot={false}
            name="saldo"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
