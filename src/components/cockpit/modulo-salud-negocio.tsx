"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Panel } from "./panel";
import { SkeletonGlass } from "./skeleton-glass";
import { SelectorCuenta } from "@/components/selector-cuenta";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { useRefrescoAlVolver } from "@/hooks/use-refresco-al-volver";
import {
  formatMoneyInt,
  formatArsEnteroDesdeDigitos,
  parseFormattedNumber,
} from "@/lib/format-currency";
import {
  calcularSalud,
  type ObraResumen,
  type ConfigNegocio,
  type RetirosResumen,
  type Semaforo,
  type ObraCalc,
} from "@/lib/salud-negocio";
import { totalesPorDueno, type BolsilloVista } from "@/lib/dinero-tablero";

/**
 * MÓDULO SALUD DEL NEGOCIO — lo primero que ve Eze al entrar (pedido 25/06).
 *
 * Tres preguntas, una pantalla:
 *  1. ¿Cómo está el negocio? → semáforo + KPIs (cartera, por cobrar, rédito, caja).
 *  2. ¿Cómo va cada obra? → cerrado / cobrado / gastado / por cobrar / rédito.
 *  3. ¿Qué plata es mía y qué de la empresa? → cashflow del mes + retiros de Eze
 *     + sistema de plata (patrimonio pesos/USD + caja libre real: el freno del "no me paso").
 *
 * Datos: /cashflow/resumen (compartido con Obras/Plata) + /api/negocio/config.
 */

type ResumenCashflow = {
  obras_activas: ObraResumen[];
  saldo_caja_total?: number;
  caja_obras_usd?: number;
  blue_venta?: number | null;
  total_por_cobrar_clientes_ars?: number;
  movimientos_recientes?: {
    id: string;
    nombre_obra: string;
    tipo: "ingreso" | "egreso";
    descripcion: string;
    monto_real: number;
    fecha_real: string;
  }[];
  error?: string;
};

/** Lo mínimo de /api/dinero para la caja RAVN posta (ledger, tarjetas afuera). */
type PayloadDinero = {
  bolsillos: BolsilloVista[];
  tarjetas?: string[];
};

/** Gasto de API del bot (/api/api-uso): Admin API (posta) + detalle propio. */
type PayloadApiUso = {
  admin: { disponible: boolean; mes_usd?: number; ultimos_30_usd?: number };
  propio: {
    hoy_usd: number;
    hoy_mensajes: number;
    mes_usd: number;
    mes_llamadas: number;
  } | null;
};

type ConfigPayload = {
  config: ConfigNegocio & { notas: string | null; updated_at: string | null };
  retiros: RetirosResumen & {
    ultimos: {
      id: string;
      fecha: string;
      monto_ars: number;
      moneda?: string;
      tipo: string;
      concepto: string;
    }[];
  };
  error?: string;
};

const DOT: Record<Semaforo, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-400",
  rojo: "bg-red-500",
};
const SEM_LABEL: Record<Semaforo, string> = {
  verde: "Sano",
  amarillo: "Atención",
  rojo: "Alerta",
};
const SEM_TEXT: Record<Semaforo, string> = {
  verde: "text-emerald-600 dark:text-emerald-400",
  amarillo: "text-amber-600 dark:text-amber-400",
  rojo: "text-red-600 dark:text-red-400",
};

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function formatUsdInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

/** USD chicos (gasto de API): con centavos, porque el mes puede ser US$ 3,47. */
function formatUsdApi(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function colorRedito(n: number | null): string {
  if (n == null) return "text-zinc-400 dark:text-zinc-500";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "text-emerald-600 dark:text-emerald-400";
}

/** KPI grande de la franja de salud. */
function Kpi({
  label,
  valor,
  sub,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  sub?: string;
  tono?: "neutro" | "positivo" | "negativo" | "acento";
}) {
  const tonoCls =
    tono === "positivo"
      ? "text-emerald-600 dark:text-emerald-400"
      : tono === "negativo"
        ? "text-red-600 dark:text-red-400"
        : tono === "acento"
          ? "text-cyan-700 dark:text-cyan-300"
          : "text-zinc-900 dark:text-zinc-50";
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className={`mt-1 truncate text-[clamp(18px,1.7vw,26px)] font-semibold tabular-nums tracking-tight ${tonoCls}`}>
        {valor}
      </p>
      {sub && (
        <p className="mt-0.5 truncate text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
          {sub}
        </p>
      )}
    </div>
  );
}

/** Fila de obra con sus 5 números. */
function FilaObra({ o }: { o: ObraCalc }) {
  return (
    <div className="grid grid-cols-12 items-center gap-2 border-b border-zinc-950/[0.05] py-2.5 text-[12px] last:border-0 dark:border-white/[0.05]">
      <Link
        href={`/obras/${o.presupuestoId}`}
        className="col-span-12 min-w-0 truncate font-medium text-zinc-800 transition-colors hover:text-cyan-700 sm:col-span-3 dark:text-zinc-100 dark:hover:text-cyan-300"
        title={o.nombre}
      >
        {o.nombre}
      </Link>
      <NumCell label="Cerrado" valor={o.cerrado == null ? "—" : formatMoneyInt(o.cerrado)} />
      <NumCell label="Cobrado" valor={formatMoneyInt(o.cobrado)} />
      <NumCell label="Gastado" valor={formatMoneyInt(o.gastado)} />
      <NumCell
        label="Por cobrar"
        valor={o.porCobrar == null ? "—" : formatMoneyInt(o.porCobrar)}
        cls={o.porCobrar && o.porCobrar > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
      />
      <div className="col-span-6 text-right sm:col-span-2">
        <p className="text-[9px] uppercase tracking-wider text-zinc-400 sm:hidden">
          Rédito
        </p>
        <p className={`text-[13px] font-semibold tabular-nums ${colorRedito(o.redito)}`}>
          {o.redito == null ? "—" : formatMoneyInt(o.redito)}
        </p>
        <p className={`text-[10px] tabular-nums ${colorRedito(o.redito)}`}>
          {pct(o.reditoPct)}
        </p>
      </div>
    </div>
  );
}

function NumCell({
  label,
  valor,
  cls,
}: {
  label: string;
  valor: string;
  cls?: string;
}) {
  return (
    <div className="col-span-6 text-right tabular-nums sm:col-span-2">
      <p className="text-[9px] uppercase tracking-wider text-zinc-400 sm:hidden">
        {label}
      </p>
      <p className={`text-[12px] ${cls ?? "text-zinc-700 dark:text-zinc-200"}`}>
        {valor}
      </p>
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 focus-within:border-cyan-500 dark:border-white/15 dark:bg-white/[0.04]">
      <span className="mr-1 text-[12px] text-zinc-400">$</span>
      <input
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(formatArsEnteroDesdeDigitos(e.target.value))}
        className="w-full bg-transparent text-[13px] tabular-nums text-zinc-900 outline-none dark:text-zinc-50"
      />
    </div>
  );
}

export function ModuloSaludNegocio({ className }: { className?: string }) {
  const [resumen, setResumen] = useState<ResumenCashflow | null>(null);
  const [cfgPayload, setCfgPayload] = useState<ConfigPayload | null>(null);
  const [dinero, setDinero] = useState<PayloadDinero | null>(null);
  const [apiUso, setApiUso] = useState<PayloadApiUso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verFinalizadas, setVerFinalizadas] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Form de retiro rápido
  const [retiroOpen, setRetiroOpen] = useState(false);
  const [rMonto, setRMonto] = useState("");
  const [rConcepto, setRConcepto] = useState("");
  const [rTipo, setRTipo] = useState<"retiro" | "aporte">("retiro");
  const [rCuenta, setRCuenta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [resCaja, resCfg, resDinero, resApi] = await Promise.all([
        fetchCompartido("/cashflow/resumen"),
        fetchCompartido("/api/negocio/config"),
        fetchCompartido("/api/dinero"),
        fetchCompartido("/api/api-uso"),
      ]);
      if (resCaja.ok) setResumen(resCaja.body as ResumenCashflow);
      if (resCfg.ok) setCfgPayload(resCfg.body as ConfigPayload);
      if (resDinero.ok) setDinero(resDinero.body as PayloadDinero);
      if (resApi.ok) setApiUso(resApi.body as PayloadApiUso);
      if (!resCaja.ok && !resCfg.ok) setError("No se pudo cargar la salud del negocio.");
      else setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRefrescoAlVolver(cargar);

  const salud = useMemo(
    () => (resumen ? calcularSalud(resumen.obras_activas ?? []) : null),
    [resumen]
  );

  const cfg = cfgPayload?.config ?? null;
  const retiros = cfgPayload?.retiros ?? null;

  async function guardarRetiro() {
    const monto = parseFormattedNumber(rMonto);
    if (monto <= 0) return;
    setGuardando(true);
    try {
      await fetch("/api/negocio/retiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto_ars: monto,
          tipo: rTipo,
          concepto: rConcepto,
          cuenta_id: rCuenta,
        }),
      });
      setRMonto("");
      setRConcepto("");
      setRCuenta(null);
      setRetiroOpen(false);
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  // Caja empresa = bolsillo RAVN del ledger Dinero (la posta que carga Eze,
  // pedido 08/07) — no más "obras − retiros" derivado. Tarjetas afuera:
  // son personales, su deuda nunca resta acá.
  const cajaRavn = useMemo(
    () =>
      dinero && dinero.bolsillos.length > 0
        ? totalesPorDueno(dinero.bolsillos, new Set(dinero.tarjetas ?? [])).empresa
        : null,
    [dinero]
  );
  const sueldoObjetivo = cfg?.sueldo_mensual_objetivo_ars ?? 0;
  // Retiro es SOLO lo declarado por Eze (retiros_socio) — sus gastos
  // personales los analiza el módulo Finanzas Personales, no esta card.
  const retiradoMes = retiros?.retirado_mes ?? 0;
  const sueldoExcedido = sueldoObjetivo > 0 && retiradoMes > sueldoObjetivo;
  const sueldoRestante = Math.max(0, sueldoObjetivo - retiradoMes);

  return (
    <Panel
      titulo="Salud del negocio"
      className={className}
      accion={
        <Link
          href="/cashflow"
          className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-cyan-700 dark:text-zinc-400 dark:hover:text-cyan-300"
        >
          Cashflow →
        </Link>
      }
    >
      {error && <p className="text-[12px] text-red-500">{error}</p>}
      {!error && !salud && (
        <SkeletonGlass filas={4} anchos={["w-full", "w-3/4", "w-full", "w-2/3"]} />
      )}

      {salud && (
        <div className="space-y-7">
          {/* ── 1. FRANJA DE SALUD ── */}
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-2">
                <motion.span
                  animate={salud.semaforo === "rojo" ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
                  transition={{ repeat: Infinity, duration: 1.3 }}
                  className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[salud.semaforo]}`}
                />
                <span className={`text-[15px] font-semibold ${SEM_TEXT[salud.semaforo]}`}>
                  {SEM_LABEL[salud.semaforo]}
                </span>
              </span>
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                {salud.motivo}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-5">
              <Kpi
                label="Cartera activa"
                valor={formatMoneyInt(salud.carteraActiva)}
                sub={`${salud.activas.length} obra${salud.activas.length === 1 ? "" : "s"} abierta${salud.activas.length === 1 ? "" : "s"}`}
              />
              <Kpi
                label="Por cobrar"
                valor={formatMoneyInt(salud.porCobrarTotal)}
                tono={salud.porCobrarTotal > 0 ? "acento" : "neutro"}
                sub="clientes"
              />
              <Kpi
                label="Rédito proyectado"
                valor={
                  salud.margenPromedio == null
                    ? "—"
                    : formatMoneyInt(salud.reditoProyectado)
                }
                tono={
                  salud.margenPromedio == null
                    ? "neutro"
                    : salud.reditoProyectado >= 0
                      ? "positivo"
                      : "negativo"
                }
                sub={
                  salud.margenPromedio == null
                    ? "cargá la rentabilidad"
                    : `margen ${pct(salud.margenPromedio)}`
                }
              />
              <Kpi
                label="Caja RAVN"
                valor={cajaRavn == null ? "—" : formatMoneyInt(cajaRavn.ars)}
                tono={cajaRavn != null && cajaRavn.ars < 0 ? "negativo" : "neutro"}
                sub={
                  cajaRavn && cajaRavn.usd !== 0
                    ? `+ US$ ${formatUsdInt(cajaRavn.usd)} · bolsillo RAVN (Dinero)`
                    : "bolsillo RAVN (Dinero) · de acá salen los retiros"
                }
              />
              {/* Cuenta Anthropic individual (sin Admin API, 24/07): el mes
                  sale del registro propio del bot; si algún día hay org y
                  ANTHROPIC_ADMIN_KEY, el número posta pisa al estimado solo. */}
              <Kpi
                label="API bot"
                valor={
                  apiUso?.admin.disponible && apiUso.admin.mes_usd != null
                    ? `US$ ${formatUsdApi(apiUso.admin.mes_usd)}`
                    : apiUso?.propio
                      ? `US$ ${formatUsdApi(apiUso.propio.mes_usd)}`
                      : "—"
                }
                sub={
                  apiUso?.propio
                    ? `hoy US$ ${formatUsdApi(apiUso.propio.hoy_usd)} · ${apiUso.propio.hoy_mensajes} mensaje${apiUso.propio.hoy_mensajes === 1 ? "" : "s"}`
                    : "gasto del mes (Anthropic)"
                }
              />
            </div>
          </div>

          {/* ── 2. OBRAS ACTIVAS, una por una ── */}
          <div>
            <div className="mb-1 hidden grid-cols-12 gap-2 px-0 text-[9px] uppercase tracking-wider text-zinc-400 sm:grid">
              <span className="col-span-3">Obra</span>
              <span className="col-span-2 text-right">Cerrado</span>
              <span className="col-span-2 text-right">Cobrado</span>
              <span className="col-span-2 text-right">Gastado</span>
              <span className="col-span-2 text-right">Por cobrar</span>
              <span className="col-span-1 text-right">Rédito</span>
            </div>
            {salud.activas.length === 0 ? (
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                No hay obras activas abiertas.
              </p>
            ) : (
              salud.activas.map((o) => <FilaObra key={o.obraId} o={o} />)
            )}

            {salud.finalizadas.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setVerFinalizadas((v) => !v)}
                  className="text-[11px] text-zinc-500 transition-colors hover:text-cyan-700 dark:text-zinc-400 dark:hover:text-cyan-300"
                >
                  {verFinalizadas ? "▾" : "▸"} {salud.finalizadas.length} finalizada
                  {salud.finalizadas.length === 1 ? "" : "s"} · rédito realizado{" "}
                  <span className={colorRedito(salud.reditoRealizado)}>
                    {formatMoneyInt(salud.reditoRealizado)}
                  </span>
                </button>
                {verFinalizadas && (
                  <div className="mt-1">
                    {salud.finalizadas.map((o) => (
                      <FilaObra key={o.obraId} o={o} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 3. CASHFLOW DEL MES + SISTEMA DE PLATA ── */}
          <div className="grid grid-cols-1 gap-6 border-t border-zinc-950/[0.06] pt-6 dark:border-white/[0.06]">
            {/* 3a. Movimientos del mes + retiros de Eze */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
                  Movimientos del mes
                </h3>
                <button
                  type="button"
                  onClick={() => setRetiroOpen((v) => !v)}
                  className="text-[11px] font-medium text-cyan-700 transition-colors hover:text-cyan-800 dark:text-cyan-400"
                >
                  + Retiro
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-zinc-100/70 px-3 py-2.5 dark:bg-white/[0.04]">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Retirado por vos (mes)
                  </p>
                  <p className={`mt-0.5 text-[18px] font-semibold tabular-nums ${sueldoExcedido ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-50"}`}>
                    {formatMoneyInt(retiradoMes)}
                  </p>
                  <p className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    {sueldoObjetivo > 0
                      ? sueldoExcedido
                        ? `excede el sueldo en ${formatMoneyInt(retiradoMes - sueldoObjetivo)}`
                        : `quedan ${formatMoneyInt(sueldoRestante)} del sueldo`
                      : "sueldo objetivo sin fijar"}
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-100/70 px-3 py-2.5 dark:bg-white/[0.04]">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Sueldo objetivo
                  </p>
                  <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {sueldoObjetivo > 0 ? formatMoneyInt(sueldoObjetivo) : "—"}
                  </p>
                  <p className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    por mes
                  </p>
                </div>
              </div>

              {retiroOpen && (
                <div className="mt-3 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-white/10">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRTipo("retiro")}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${rTipo === "retiro" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300"}`}
                    >
                      Retiro (saco)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRTipo("aporte")}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${rTipo === "aporte" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300"}`}
                    >
                      Aporte (pongo)
                    </button>
                  </div>
                  <MoneyInput value={rMonto} onChange={setRMonto} placeholder="Monto" />
                  <SelectorCuenta
                    value={rCuenta}
                    onChange={setRCuenta}
                    monedas={["ARS"]}
                  />
                  <input
                    value={rConcepto}
                    onChange={(e) => setRConcepto(e.target.value)}
                    placeholder="Concepto (opcional)"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 outline-none focus:border-cyan-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-zinc-50"
                  />
                  <button
                    type="button"
                    disabled={guardando || parseFormattedNumber(rMonto) <= 0}
                    onClick={guardarRetiro}
                    className="w-full rounded-lg bg-cyan-600 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-cyan-700 disabled:opacity-40"
                  >
                    {guardando ? "Guardando…" : "Registrar"}
                  </button>
                </div>
              )}

              <ul className="mt-3 space-y-1.5">
                {(retiros?.ultimos ?? []).slice(0, 4).map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">
                      <span className="font-mono text-[10px] text-zinc-400">{r.fecha.slice(5)}</span>{" "}
                      {r.tipo === "aporte" ? "Aporte" : "Retiro"}
                      {r.concepto ? ` · ${r.concepto}` : ""}
                    </span>
                    <span className={`shrink-0 tabular-nums ${r.tipo === "aporte" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-200"}`}>
                      {r.tipo === "aporte" ? "+" : "−"}
                      {r.moneda === "USD" ? `US$ ${formatUsdInt(r.monto_ars)}` : formatMoneyInt(r.monto_ars)}
                    </span>
                  </li>
                ))}
                {(retiros?.ultimos ?? []).length === 0 && (
                  <li className="text-[11px] text-zinc-400">Sin retiros registrados todavía.</li>
                )}
              </ul>
            </div>

            {/* "Mi plata vs. la empresa" (patrimonio config + caja libre)
                BORRADO 08/07 noche: dato erróneo — la posta vive en Dinero. */}
          </div>
        </div>
      )}
    </Panel>
  );
}

