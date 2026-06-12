"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { CargandoCockpit } from "@/components/cockpit/cargando-cockpit";
import { CifraHeroica } from "@/components/cockpit/cifra-heroica";

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
    <div className="h-1 w-full bg-cdm-fg/10">
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
    return <CargandoCockpit label="Finanzas" />;
  }

  if (error || !data) {
    return (
      <main className="font-grotesk relative flex min-h-screen items-center justify-center bg-cdm-bg text-red-400">
        <WavesBackdrop />
        <span className="relative z-10 text-xs uppercase tracking-widest">{error ?? "Sin datos"}</span>
      </main>
    );
  }

  const pctMes = data.presupuesto_mensual > 0 ? data.total_mes / data.presupuesto_mensual : 0;
  const pctDia = data.presupuesto_diario > 0 ? data.gastado_hoy / data.presupuesto_diario : 0;
  const presupuestoEsperado = data.presupuesto_diario * data.dias_transcurridos;

  return (
    <main className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <WavesBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-lg">
        <VolverAlInicio />

        {/* Header con horizonte */}
        <div className="relative pb-3">
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <h1 className="font-mono-hud flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
            Finanzas personales
          </h1>
        </div>

        {/* Semáforo del día */}
        <div className="cdm-glass mt-6 p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-widest text-cdm-muted">
              Hoy
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${SEMAFORO_COLOR[data.semaforo_dia]}`}>
              {SEMAFORO_LABEL[data.semaforo_dia]}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <CifraHeroica
              className="text-[clamp(28px,2.2vw,40px)] leading-none"
              colorBase={data.semaforo_dia === "rojo" ? "#f87171" : "var(--cdm-fg)"}
            >
              {formatMoneyInt(data.gastado_hoy)}
            </CifraHeroica>
            <span className="text-xs text-cdm-muted">
              / {formatMoneyInt(data.presupuesto_diario)} diario
            </span>
          </div>
          <div className="mt-3">
            <BarraProgreso pct={pctDia} semaforo={data.semaforo_dia} />
          </div>
        </div>

        {/* Resumen del mes */}
        <div className="cdm-glass mt-3 p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-widest text-cdm-muted">
              Junio — {data.dias_transcurridos}/{data.dias_en_mes} días
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${SEMAFORO_COLOR[data.semaforo_mes]}`}>
              {SEMAFORO_LABEL[data.semaforo_mes]}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <CifraHeroica
              className="text-[clamp(28px,2.2vw,40px)] leading-none"
              colorBase={data.semaforo_mes === "rojo" ? "#f87171" : "var(--cdm-fg)"}
              delay={0.25}
            >
              {formatMoneyInt(data.total_mes)}
            </CifraHeroica>
            <span className="text-xs text-cdm-muted">
              / {formatMoneyInt(data.presupuesto_mensual)}
            </span>
          </div>
          <div className="mt-3">
            <BarraProgreso pct={pctMes} semaforo={data.semaforo_mes} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <div>
              <dt className="text-cdm-muted">Disponible</dt>
              <dd className={`tabular-nums font-medium ${data.disponible >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatMoneyInt(data.disponible)}
              </dd>
            </div>
            <div>
              <dt className="text-cdm-muted">Proyección fin de mes</dt>
              <dd className={`tabular-nums font-medium ${data.proyeccion <= data.presupuesto_mensual ? "text-emerald-400" : "text-amber-300"}`}>
                {formatMoneyInt(data.proyeccion)}
              </dd>
            </div>
            <div>
              <dt className="text-cdm-muted">Presupuesto esperado a hoy</dt>
              <dd className="tabular-nums font-medium text-cdm-fg">
                {formatMoneyInt(presupuestoEsperado)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Por categoría */}
        <div className="cdm-glass mt-3 p-5">
          <h2 className="text-[10px] uppercase tracking-widest text-cdm-muted">
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
                    <span className="text-cdm-fg">{cat}</span>
                    <span className="tabular-nums">
                      <span className={SEMAFORO_COLOR[sem]}>{formatMoneyInt(monto)}</span>
                      <span className="text-cdm-muted"> / {formatMoneyInt(limite)}</span>
                    </span>
                  </div>
                  <div className="mt-1">
                    <BarraProgreso pct={pct} semaforo={sem} />
                  </div>
                </li>
              );
            })}
            {Object.keys(data.por_categoria).length === 0 && (
              <li className="text-[11px] text-cdm-muted">Sin gastos cargados este mes.</li>
            )}
          </ul>
        </div>

        {/* Cargar gasto manual */}
        <div className="cdm-glass mt-3 p-5">
          <h2 className="text-[10px] uppercase tracking-widest text-cdm-muted">
            Cargar gasto
          </h2>
          <form onSubmit={guardarGasto} className="mt-4 space-y-3">
            <input
              type="text"
              placeholder="Concepto"
              value={form.concepto}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              className="w-full border-0 border-b border-cdm-line bg-transparent px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]"
            />
            <input
              type="number"
              placeholder="Monto"
              value={form.monto}
              onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
              className="w-full border-0 border-b border-cdm-line bg-transparent px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]"
            />
            <select
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              className="w-full border border-cdm-line bg-cdm-panel/60 px-4 py-3 text-sm text-cdm-fg focus:border-cdm-accent focus:outline-none"
            >
              {CATEGORIAS_ORDEN.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={guardando || !form.concepto || !form.monto}
              className="cdm-chip w-full cursor-pointer border border-cdm-accent/60 bg-cdm-accent/15 px-8 py-3 text-sm uppercase tracking-wider text-cdm-accent shadow-[0_0_18px_-6px_rgba(34,211,238,0.55)] transition-colors hover:bg-cdm-accent/25 disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {guardadoOk && (
              <p className="text-center text-xs uppercase tracking-widest text-emerald-400">
                Guardado ✓
              </p>
            )}
            {errorGuardar && (
              <p className="text-center text-xs uppercase tracking-widest text-red-400">
                Error: {errorGuardar}
              </p>
            )}
          </form>
        </div>

        {/* Últimos gastos */}
        {data.ultimos_gastos.length > 0 && (
          <div className="cdm-glass mt-3 p-5">
            <h2 className="text-[10px] uppercase tracking-widest text-cdm-muted">
              Últimos gastos
            </h2>
            <ul className="mt-4 divide-y divide-cdm-line">
              {data.ultimos_gastos.map((g) => (
                <li key={g.id} className="flex items-center justify-between py-2 text-[11px]">
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums text-cdm-muted">{fmtFecha(g.fecha)}</span>
                    <div>
                      <div className="text-cdm-fg">{g.concepto}</div>
                      <div className="text-cdm-muted">{g.categoria}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium text-cdm-fg">
                      {formatMoneyInt(g.monto)}
                    </span>
                    <button
                      onClick={() => eliminarGasto(g.id)}
                      disabled={eliminando === g.id}
                      className="cursor-pointer text-cdm-muted transition-colors hover:text-red-400 disabled:opacity-40"
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
    </main>
  );
}
