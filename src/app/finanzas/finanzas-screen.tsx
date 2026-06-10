"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";

type Semaforo = "verde" | "amarillo" | "rojo";

type ResumenFinanzas = {
  presupuesto_mensual: number;
  presupuesto_diario: number;
  limites_semanales: Record<string, number>;
  total_mes: number;
  gastado_hoy: number;
  disponible: number;
  proyeccion: number;
  dias_transcurridos: number;
  dias_en_mes: number;
  semaforo_dia: Semaforo;
  semaforo_mes: Semaforo;
  por_categoria: Record<string, number>;
  ultimos_gastos: Array<{
    id: string;
    fecha: string;
    concepto: string;
    monto: number;
    categoria: string;
  }>;
};

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  verde: "text-emerald-400",
  amarillo: "text-amber-300",
  rojo: "text-red-400",
};

const SEMAFORO_BG: Record<Semaforo, string> = {
  verde: "bg-emerald-400",
  amarillo: "bg-amber-300",
  rojo: "bg-red-400",
};

const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde: "OK",
  amarillo: "ATENCIÓN",
  rojo: "EXCEDIDO",
};

const CATEGORIAS_ORDEN = [
  "Supermercado",
  "Delivery",
  "Salidas",
  "Combustible",
  "Farmacia",
  "Ropa",
  "Varios",
];

function BarraProgreso({ pct, semaforo }: { pct: number; semaforo: Semaforo }) {
  const width = Math.min(pct * 100, 100);
  return (
    <div className="h-1 w-full bg-ravn-subtle">
      <div
        className={`h-1 transition-all ${SEMAFORO_BG[semaforo]}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

const CATEGORIAS_LIMITE: Record<string, number> = {
  Supermercado: 50000,
  Delivery: 8000,
  Salidas: 30000,
  Combustible: 120000,
  Farmacia: 20000,
  Ropa: 20000,
  Varios: 15000,
};

function categorySemaforo(cat: string, monto: number): Semaforo {
  const limite = CATEGORIAS_LIMITE[cat] ?? 20000;
  const pct = monto / limite;
  if (pct < 0.7) return "verde";
  if (pct < 1) return "amarillo";
  return "rojo";
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

type NuevoGasto = { concepto: string; monto: string; categoria: string };

export function FinanzasScreen() {
  const [data, setData] = useState<ResumenFinanzas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NuevoGasto>({ concepto: "", monto: "", categoria: "Varios" });
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/finanzas", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Error al cargar"); setData(null); return; }
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function eliminarGasto(id: string) {
    setEliminando(id);
    try {
      await fetch("/api/finanzas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load(true);
    } finally {
      setEliminando(null);
    }
  }

  async function guardarGasto(e: React.FormEvent) {
    e.preventDefault();
    if (!form.concepto || !form.monto) return;
    setGuardando(true);
    setErrorGuardar(null);
    setGuardadoOk(false);
    try {
      const res = await fetch("/api/finanzas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, monto: Number(form.monto) }),
      });
      const j = await res.json();
      if (res.ok) {
        setForm({ concepto: "", monto: "", categoria: "Varios" });
        setGuardadoOk(true);
        setTimeout(() => setGuardadoOk(false), 3000);
        await load(true); // silent refresh — no loading screen
      } else {
        setErrorGuardar(j.error ?? `Error ${res.status}`);
      }
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : "Error de red");
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ravn-surface text-ravn-muted">
        <span className="font-raleway text-xs uppercase tracking-widest">Cargando…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ravn-surface text-red-400">
        <span className="font-raleway text-xs uppercase tracking-widest">{error ?? "Sin datos"}</span>
      </div>
    );
  }

  const pctMes = data.presupuesto_mensual > 0 ? data.total_mes / data.presupuesto_mensual : 0;
  const pctDia = data.presupuesto_diario > 0 ? data.gastado_hoy / data.presupuesto_diario : 0;
  const presupuestoEsperado = data.presupuesto_diario * data.dias_transcurridos;

  return (
    <div className="min-h-screen bg-ravn-surface text-ravn-fg">
      <div className="mx-auto max-w-lg px-4 py-8">
        <VolverAlInicio />

        <h1 className="font-raleway mt-6 text-xs uppercase tracking-widest text-ravn-muted">
          Finanzas personales
        </h1>

        {/* Semáforo del día */}
        <div className="mt-6 border border-ravn-line p-5">
          <div className="flex items-baseline justify-between">
            <span className="font-raleway text-[10px] uppercase tracking-widest text-ravn-muted">
              Hoy
            </span>
            <span className={`font-raleway text-[10px] font-semibold uppercase tracking-widest ${SEMAFORO_COLOR[data.semaforo_dia]}`}>
              {SEMAFORO_LABEL[data.semaforo_dia]}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="tabular-nums text-2xl font-light">
              {formatMoneyInt(data.gastado_hoy)}
            </span>
            <span className="text-xs text-ravn-muted">
              / {formatMoneyInt(data.presupuesto_diario)} diario
            </span>
          </div>
          <div className="mt-3">
            <BarraProgreso pct={pctDia} semaforo={data.semaforo_dia} />
          </div>
        </div>

        {/* Resumen del mes */}
        <div className="mt-3 border border-ravn-line p-5">
          <div className="flex items-baseline justify-between">
            <span className="font-raleway text-[10px] uppercase tracking-widest text-ravn-muted">
              Junio — {data.dias_transcurridos}/{data.dias_en_mes} días
            </span>
            <span className={`font-raleway text-[10px] font-semibold uppercase tracking-widest ${SEMAFORO_COLOR[data.semaforo_mes]}`}>
              {SEMAFORO_LABEL[data.semaforo_mes]}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="tabular-nums text-2xl font-light">
              {formatMoneyInt(data.total_mes)}
            </span>
            <span className="text-xs text-ravn-muted">
              / {formatMoneyInt(data.presupuesto_mensual)}
            </span>
          </div>
          <div className="mt-3">
            <BarraProgreso pct={pctMes} semaforo={data.semaforo_mes} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <div>
              <dt className="text-ravn-muted">Disponible</dt>
              <dd className={`tabular-nums font-medium ${data.disponible >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatMoneyInt(data.disponible)}
              </dd>
            </div>
            <div>
              <dt className="text-ravn-muted">Proyección fin de mes</dt>
              <dd className={`tabular-nums font-medium ${data.proyeccion <= data.presupuesto_mensual ? "text-emerald-400" : "text-amber-300"}`}>
                {formatMoneyInt(data.proyeccion)}
              </dd>
            </div>
            <div>
              <dt className="text-ravn-muted">Presupuesto esperado a hoy</dt>
              <dd className="tabular-nums font-medium text-ravn-fg">
                {formatMoneyInt(presupuestoEsperado)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Por categoría */}
        <div className="mt-3 border border-ravn-line p-5">
          <h2 className="font-raleway text-[10px] uppercase tracking-widest text-ravn-muted">
            Por categoría — semana
          </h2>
          <ul className="mt-4 space-y-3">
            {CATEGORIAS_ORDEN.map((cat) => {
              const monto = data.por_categoria[cat] ?? 0;
              const limite = CATEGORIAS_LIMITE[cat] ?? 20000;
              const sem = categorySemaforo(cat, monto);
              const pct = monto / limite;
              if (monto === 0) return null;
              return (
                <li key={cat}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-ravn-fg">{cat}</span>
                    <span className="tabular-nums">
                      <span className={SEMAFORO_COLOR[sem]}>{formatMoneyInt(monto)}</span>
                      <span className="text-ravn-muted"> / {formatMoneyInt(limite)}</span>
                    </span>
                  </div>
                  <div className="mt-1">
                    <BarraProgreso pct={pct} semaforo={sem} />
                  </div>
                </li>
              );
            })}
            {Object.keys(data.por_categoria).length === 0 && (
              <li className="text-[11px] text-ravn-muted">Sin gastos cargados este mes.</li>
            )}
          </ul>
        </div>

        {/* Cargar gasto manual */}
        <div className="mt-3 border border-ravn-line p-5">
          <h2 className="font-raleway text-[10px] uppercase tracking-widest text-ravn-muted">
            Cargar gasto
          </h2>
          <form onSubmit={guardarGasto} className="mt-4 space-y-3">
            <input
              type="text"
              placeholder="Concepto"
              value={form.concepto}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              className="font-raleway w-full border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg placeholder:text-ravn-muted/50 focus:border-ravn-fg focus:outline-none"
            />
            <input
              type="number"
              placeholder="Monto"
              value={form.monto}
              onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
              className="font-raleway w-full border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg placeholder:text-ravn-muted/50 focus:border-ravn-fg focus:outline-none"
            />
            <select
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              className="font-raleway w-full border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg focus:border-ravn-fg focus:outline-none"
            >
              {CATEGORIAS_ORDEN.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={guardando || !form.concepto || !form.monto}
              className="font-raleway w-full border-2 border-ravn-accent bg-ravn-accent px-8 py-3 text-sm uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {guardadoOk && (
              <p className="font-raleway text-center text-xs uppercase tracking-widest text-emerald-400">
                Guardado ✓
              </p>
            )}
            {errorGuardar && (
              <p className="font-raleway text-center text-xs uppercase tracking-widest text-red-400">
                Error: {errorGuardar}
              </p>
            )}
          </form>
        </div>

        {/* Últimos gastos */}
        {data.ultimos_gastos.length > 0 && (
          <div className="mt-3 border border-ravn-line p-5">
            <h2 className="font-raleway text-[10px] uppercase tracking-widest text-ravn-muted">
              Últimos gastos
            </h2>
            <ul className="mt-4 divide-y divide-ravn-line">
              {data.ultimos_gastos.map((g) => (
                <li key={g.id} className="flex items-center justify-between py-2 text-[11px]">
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-ravn-muted">{fmtFecha(g.fecha)}</span>
                    <div>
                      <div className="text-ravn-fg">{g.concepto}</div>
                      <div className="text-ravn-muted">{g.categoria}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium text-ravn-fg">
                      {formatMoneyInt(g.monto)}
                    </span>
                    <button
                      onClick={() => eliminarGasto(g.id)}
                      disabled={eliminando === g.id}
                      className="text-ravn-muted transition-colors hover:text-red-400 disabled:opacity-40"
                      aria-label="Eliminar"
                    >
                      {eliminando === g.id ? "…" : "×"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
