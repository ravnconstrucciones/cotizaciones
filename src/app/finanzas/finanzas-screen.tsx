"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { CargandoCockpit } from "@/components/cockpit/cargando-cockpit";
import { CifraHeroica } from "@/components/cockpit/cifra-heroica";
import { CashflowEmpresaBlock } from "./cashflow-empresa-block";
import { FotoTarjetaBlock } from "./foto-tarjeta-block";

type Semaforo = "verde" | "amarillo" | "rojo";

type Ciclo = {
  inicio: string;
  fin: string;
  dia_actual: number;
  dias_total: number;
  label: string;
};

type FijoPersonal = { id: string; nombre: string; monto_ars: number; orden: number };
type SoftwareItem = { id: string; nombre: string; monto_ars: number };

type ResumenFinanzas = {
  ciclo: Ciclo;
  tope_personal_mensual: number;
  fijos_personal_total: number;
  discrecional_mes: number;
  asignacion_diaria: number;
  gastado_variable: number;
  dias_restantes: number;
  disponible_ciclo: number;
  disponible_hoy: number;
  ritmo_semanal: number;
  proyeccion_fin_ciclo: number;
  semaforo: Semaforo;
  fijos_personal: FijoPersonal[];
  software_empresa: { total: number; items: SoftwareItem[] };
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
  verde: "HOLGADO",
  amarillo: "JUSTO",
  rojo: "EN ROJO",
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

const CARD = "rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 p-5";

function BarraProgreso({ pct, semaforo }: { pct: number; semaforo: Semaforo }) {
  const width = Math.min(Math.max(pct, 0) * 100, 100);
  return (
    <div className="h-1 w-full bg-cdm-fg/10">
      <div
        className={`h-1 transition-all ${SEMAFORO_BG[semaforo]}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function fmtFecha(iso: string) {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

type NuevoGasto = { concepto: string; monto: string; categoria: string };
type NuevoFijo = { nombre: string; monto: string };

export function FinanzasScreen() {
  const [data, setData] = useState<ResumenFinanzas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<NuevoGasto>({ concepto: "", monto: "", categoria: "Varios" });
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  // Edición de fijos
  const [editandoFijos, setEditandoFijos] = useState(false);
  const [nuevoFijo, setNuevoFijo] = useState<NuevoFijo>({ nombre: "", monto: "" });

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

  // ── Fijos: agregar / editar monto / borrar (vía /api/finanzas/fijos) ──
  async function agregarFijo() {
    const monto = Number(nuevoFijo.monto);
    if (!nuevoFijo.nombre.trim() || !(monto >= 0)) return;
    setGuardando(true);
    try {
      await fetch("/api/finanzas/fijos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nuevoFijo.nombre.trim(),
          monto_ars: monto,
          dueno: "personal",
          orden: (data?.fijos_personal.length ?? 0) + 1,
        }),
      });
      setNuevoFijo({ nombre: "", monto: "" });
      await load(true);
    } finally {
      setGuardando(false);
    }
  }

  async function actualizarMontoFijo(id: string, monto: number) {
    if (!(monto >= 0)) return;
    await fetch("/api/finanzas/fijos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, monto_ars: monto }),
    });
    await load(true);
  }

  async function borrarFijo(id: string) {
    setGuardando(true);
    try {
      await fetch("/api/finanzas/fijos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load(true);
    } finally {
      setGuardando(false);
    }
  }

  if (loading) {
    return <CargandoCockpit label="Finanzas" />;
  }

  if (error || !data) {
    return (
      <main className="font-geist relative flex min-h-screen items-center justify-center bg-cdm-bg text-red-400">
        <span className="relative z-10 text-xs uppercase tracking-widest">{error ?? "Sin datos"}</span>
      </main>
    );
  }

  const sem = data.semaforo;
  // Las dos barras miden lo mismo: cuánto del discrecional del mes ya gastaste.
  const pctCiclo = data.discrecional_mes > 0 ? data.gastado_variable / data.discrecional_mes : 0;
  const pctHero = pctCiclo;

  return (
    <main className="font-geist relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <div className="mx-auto w-full max-w-lg">
        <VolverAlInicio />

        {/* Header */}
        <div className="pt-4 pb-6">
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Finanzas personales
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Tu libreta · ciclo de la tarjeta
          </p>
        </div>

        {/* 1 ── HERO: Hoy podés gastar ── */}
        <div className={CARD}>
          <div className="flex items-baseline justify-between">
            <span className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
              Hoy podés gastar
            </span>
            <span className={`font-mono-hud text-[10px] font-semibold uppercase tracking-widest ${SEMAFORO_COLOR[sem]}`}>
              {SEMAFORO_LABEL[sem]}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <CifraHeroica
              className="text-[clamp(36px,6vw,52px)] leading-none font-geist tabular-nums"
              tono={sem === "rojo" ? "negativo" : sem === "verde" ? "positivo" : "neutro"}
            >
              {formatMoneyInt(data.disponible_hoy)}
            </CifraHeroica>
            <span className="font-mono-hud text-xs text-cdm-muted">/ día</span>
          </div>
          <p className="font-mono-hud mt-2 text-[11px] text-cdm-muted">
            Te quedan{" "}
            <span className={data.disponible_ciclo >= 0 ? "text-emerald-400" : "text-red-400"}>
              {formatMoneyInt(data.disponible_ciclo)}
            </span>{" "}
            hasta el cierre · {data.dias_restantes} día{data.dias_restantes === 1 ? "" : "s"}
          </p>
          <div className="mt-3">
            <BarraProgreso pct={pctHero} semaforo={sem} />
          </div>
          <p className="font-mono-hud mt-3 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
            Ciclo {data.ciclo.label} · día {data.ciclo.dia_actual}/{data.ciclo.dias_total}
          </p>
        </div>

        {/* 2 ── Presupuesto del ciclo ── */}
        <div className={`${CARD} mt-3`}>
          <h2 className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
            Presupuesto del ciclo
          </h2>
          <div className="mt-3 space-y-2 text-[12px]">
            <Linea label="Tope personal mensual" valor={formatMoneyInt(data.tope_personal_mensual)} />
            <Linea label="− Fijos personales" valor={formatMoneyInt(data.fijos_personal_total)} signo="resta" />
            <div className="border-t border-cdm-line pt-2">
              <Linea label="= Discrecional del ciclo" valor={formatMoneyInt(data.discrecional_mes)} fuerte />
            </div>
            <Linea label="Gastado variable" valor={formatMoneyInt(data.gastado_variable)} signo="resta" />
            <div className="mt-1">
              <BarraProgreso pct={pctCiclo} semaforo={sem} />
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
            <div>
              <dt className="font-mono-hud uppercase tracking-[0.12em] text-cdm-muted">Disponible del ciclo</dt>
              <dd className={`font-geist tabular-nums font-medium ${data.disponible_ciclo >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatMoneyInt(data.disponible_ciclo)}
              </dd>
            </div>
            <div>
              <dt className="font-mono-hud uppercase tracking-[0.12em] text-cdm-muted">Por día al cierre</dt>
              <dd className={`font-geist tabular-nums font-medium ${data.disponible_hoy >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatMoneyInt(data.disponible_hoy)}
              </dd>
            </div>
          </dl>
        </div>

        {/* 3 ── Fijos personales ── */}
        <div className={`${CARD} mt-3`}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
              Fijos personales
            </h2>
            <button
              type="button"
              onClick={() => setEditandoFijos((v) => !v)}
              className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-accent transition-colors hover:text-cdm-fg"
            >
              {editandoFijos ? "Listo" : "Editar"}
            </button>
          </div>
          <ul className="mt-4 space-y-2.5">
            {data.fijos_personal.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="font-geist text-cdm-fg">{f.nombre}</span>
                {editandoFijos ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      defaultValue={f.monto_ars}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== f.monto_ars) void actualizarMontoFijo(f.id, v);
                      }}
                      className="font-geist tabular-nums w-28 rounded-[10px] border border-cdm-line bg-white/40 dark:bg-zinc-900/60 px-2 py-1 text-right text-cdm-fg focus:border-cdm-accent focus:outline-none"
                    />
                    <button
                      onClick={() => borrarFijo(f.id)}
                      disabled={guardando}
                      className="cursor-pointer text-cdm-muted transition-colors hover:text-red-400 disabled:opacity-40"
                      aria-label="Eliminar fijo"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <span className="font-geist tabular-nums font-medium text-cdm-fg">
                    {formatMoneyInt(f.monto_ars)}
                  </span>
                )}
              </li>
            ))}
            {data.fijos_personal.length === 0 && (
              <li className="font-mono-hud text-[11px] text-cdm-muted">Sin fijos cargados.</li>
            )}
          </ul>

          {editandoFijos && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-cdm-line pt-4">
              <input
                type="text"
                placeholder="Nombre"
                value={nuevoFijo.nombre}
                onChange={(e) => setNuevoFijo((f) => ({ ...f, nombre: e.target.value }))}
                className="font-geist flex-1 rounded-[10px] border border-cdm-line bg-white/40 dark:bg-zinc-900/60 px-3 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 focus:border-cdm-accent focus:outline-none"
              />
              <input
                type="number"
                placeholder="Monto"
                value={nuevoFijo.monto}
                onChange={(e) => setNuevoFijo((f) => ({ ...f, monto: e.target.value }))}
                className="font-geist tabular-nums w-28 rounded-[10px] border border-cdm-line bg-white/40 dark:bg-zinc-900/60 px-3 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 focus:border-cdm-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={agregarFijo}
                disabled={guardando || !nuevoFijo.nombre.trim() || nuevoFijo.monto === ""}
                className="font-mono-hud cursor-pointer rounded-full border border-cdm-accent/60 bg-cdm-accent/10 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent/20 disabled:opacity-40"
              >
                + Agregar
              </button>
            </div>
          )}

          <div className="mt-4 flex items-baseline justify-between border-t border-cdm-line pt-3 text-[12px]">
            <span className="font-mono-hud uppercase tracking-[0.12em] text-cdm-muted">Total fijos</span>
            <span className="font-geist tabular-nums font-semibold text-cdm-fg">
              {formatMoneyInt(data.fijos_personal_total)}
            </span>
          </div>
        </div>

        {/* 4 ── Software RAVN (de la empresa) ── */}
        {data.software_empresa.items.length > 0 && (
          <div className={`${CARD} mt-3 border-dashed`}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
                Software RAVN — de la empresa
              </h2>
            </div>
            <p className="font-mono-hud mt-1 text-[10px] text-cdm-muted/80">
              Cae en tu tarjeta pero es de la empresa — no suma a tu gasto personal.
            </p>
            <ul className="mt-4 space-y-2.5">
              {data.software_empresa.items.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="font-geist text-cdm-muted">{s.nombre}</span>
                  <span className="font-geist tabular-nums text-cdm-muted">
                    {formatMoneyInt(s.monto_ars)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-baseline justify-between border-t border-cdm-line pt-3 text-[12px]">
              <span className="font-mono-hud uppercase tracking-[0.12em] text-cdm-muted">Total software</span>
              <span className="font-geist tabular-nums font-semibold text-cdm-muted">
                {formatMoneyInt(data.software_empresa.total)}
              </span>
            </div>
          </div>
        )}

        {/* 4b ── El negocio: cashflow compacto (mundos separados) ── */}
        <CashflowEmpresaBlock />

        {/* 5 ── Variable por categoría ── */}
        <div className={`${CARD} mt-3`}>
          <h2 className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
            Variable por categoría — ciclo
          </h2>
          <ul className="mt-4 space-y-3">
            {CATEGORIAS_ORDEN.map((cat) => {
              const monto = data.por_categoria[cat] ?? 0;
              if (monto === 0) return null;
              const pct = data.gastado_variable > 0 ? monto / data.gastado_variable : 0;
              return (
                <li key={cat}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="font-geist text-cdm-fg">{cat}</span>
                    <span className="font-geist tabular-nums text-cdm-fg">{formatMoneyInt(monto)}</span>
                  </div>
                  <div className="mt-1">
                    <BarraProgreso pct={pct} semaforo="verde" />
                  </div>
                </li>
              );
            })}
            {Object.keys(data.por_categoria).length === 0 && (
              <li className="font-mono-hud text-[11px] text-cdm-muted">Sin gastos cargados este ciclo.</li>
            )}
          </ul>
        </div>

        {/* 6 ── Foto de la tarjeta: rubro por rubro (retrospectiva del cierre) ── */}
        <FotoTarjetaBlock />

        {/* Cargar gasto manual */}
        <div className={`${CARD} mt-3`}>
          <h2 className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
            Cargar gasto
          </h2>
          <form onSubmit={guardarGasto} className="mt-4 space-y-3">
            <input
              type="text"
              placeholder="Concepto"
              value={form.concepto}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              className="font-geist w-full border-0 border-b border-cdm-line bg-transparent px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]"
            />
            <input
              type="number"
              placeholder="Monto"
              value={form.monto}
              onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
              className="font-geist tabular-nums w-full border-0 border-b border-cdm-line bg-transparent px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]"
            />
            <select
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              className="font-geist w-full rounded-[12px] border border-cdm-line bg-white/40 dark:bg-zinc-900/60 px-4 py-3 text-sm text-cdm-fg focus:border-cdm-accent focus:outline-none"
            >
              {CATEGORIAS_ORDEN.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={guardando || !form.concepto || !form.monto}
              className="font-mono-hud w-full cursor-pointer rounded-full border border-cdm-accent/60 bg-cdm-accent/10 px-8 py-3 text-[11px] uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent/20 disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {guardadoOk && (
              <p className="font-mono-hud text-center text-xs uppercase tracking-widest text-emerald-400">
                Guardado ✓
              </p>
            )}
            {errorGuardar && (
              <p className="font-mono-hud text-center text-xs uppercase tracking-widest text-red-400">
                Error: {errorGuardar}
              </p>
            )}
          </form>
        </div>

        {/* Últimos gastos */}
        {data.ultimos_gastos.length > 0 && (
          <div className={`${CARD} mt-3`}>
            <h2 className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
              Últimos gastos
            </h2>
            <ul className="mt-4 divide-y divide-cdm-line">
              {data.ultimos_gastos.map((g) => (
                <li key={g.id} className="flex items-center justify-between py-2.5 text-[11px]">
                  <div className="flex items-center gap-3">
                    <span className="font-mono-hud tabular-nums text-cdm-muted">{fmtFecha(g.fecha)}</span>
                    <div>
                      <div className="font-geist text-cdm-fg">{g.concepto}</div>
                      <div className="font-mono-hud text-[10px] uppercase tracking-[0.1em] text-cdm-muted">{g.categoria}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-geist tabular-nums font-medium text-cdm-fg">
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

function Linea({
  label,
  valor,
  signo,
  fuerte,
}: {
  label: string;
  valor: string;
  signo?: "resta";
  fuerte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`font-geist ${fuerte ? "text-cdm-fg" : "text-cdm-muted"}`}>{label}</span>
      <span
        className={`font-geist tabular-nums ${fuerte ? "font-semibold text-cdm-fg" : signo === "resta" ? "text-cdm-muted" : "text-cdm-fg"}`}
      >
        {valor}
      </span>
    </div>
  );
}
