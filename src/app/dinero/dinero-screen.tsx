"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { CargandoCockpit } from "@/components/cockpit/cargando-cockpit";
import { CifraHeroica } from "@/components/cockpit/cifra-heroica";
import { fetchCompartido } from "@/lib/fetch-compartido";
import type { SaldosCuentas } from "@/lib/cuentas";
import {
  borradoresAgrupados,
  bolsillosPorCuenta,
  composicionPorObra,
  deudasConAntiguedad,
  deudasPorDeudor,
  divergenciasContraMotor,
  nombreDueno,
  totalesPorDueno,
  type AcreedorDeGrupo,
  type BolsilloVista,
  type BorradorVista,
  type FinanciamientoVista,
} from "@/lib/dinero-tablero";
import { parseNum } from "@/lib/cashflow-compute";

/**
 * Módulo DINERO — pantalla (Fase 3, spec 2026-07-06; rediseño 07/07).
 * Cashflow es la proyección; esto es la REALIDAD de la plata: de quién es lo
 * que hay en cada cuenta (bolsillos), quién le debe a quién (libro de deudas)
 * y qué operación del bot quedó sin confirmar (borradores). Solo lectura.
 *
 * Rediseño 07/07 (feedback Eze): jerarquía primero — un total heroico, los
 * tres dueños como desglose, cuentas agrupadas en Disponible vs Tarjetas.
 * El desglose por bolsillo solo se dibuja cuando AGREGA información: una
 * cuenta con un único bolsillo igual al saldo lleva chip de dueño inline,
 * jamás el mismo número repetido en dos renglones.
 */

type PayloadDinero = {
  bolsillos: BolsilloVista[];
  financiamientos: FinanciamientoVista[];
  borradores: BorradorVista[];
  obras: Record<string, string>;
  costos_obra: Record<string, number>;
};

const CARD =
  "relative overflow-hidden rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 p-5 sm:p-6";
const LABEL = "font-mono-hud text-[10px] uppercase tracking-[0.24em] text-cdm-muted";
const CHIP =
  "inline-flex items-center gap-1.5 rounded-full ring-1 ring-cdm-line px-2 py-0.5 font-mono-hud text-[9px] uppercase tracking-[0.14em] text-cdm-muted";

const COLOR_DUENO: Record<string, string> = {
  obra: "bg-cdm-accent/70",
  empresa: "bg-emerald-400/80",
  personal: "bg-amber-300/80",
};

/** USD como en el resto del cockpit: "US$ 1.234" es-AR (paridad modulo-plata). */
function formatUsdInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

function fmtMonto(n: number, moneda: "ARS" | "USD"): string {
  return moneda === "USD" ? `US$ ${formatUsdInt(n)}` : formatMoneyInt(n);
}

function fmtFecha(iso: string) {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** Monograma de la cuenta: "Mercado Pago" → MP, "Tarjeta Visa US$" → VI. */
function monograma(nombre: string): string {
  const palabras = nombre
    .replace(/^tarjeta\s+/i, "")
    .split(/\s+/)
    .filter((w) => /[a-záéíóúñ]/i.test(w));
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase();
  return (palabras[0] ?? nombre).slice(0, 2).toUpperCase();
}

/** Total en una o dos monedas: "$1.000", "US$ 200" o "$1.000 · US$ 200". */
function fmtTotales(ars: number, usd: number): string {
  const partes = [
    ars !== 0 ? formatMoneyInt(ars) : null,
    usd !== 0 ? `US$ ${formatUsdInt(usd)}` : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : formatMoneyInt(0);
}

/**
 * Fila "→ a tal acreedor — tanto" del libro de deudas, con desplegable para
 * ver los movimientos individuales que componen ese total.
 */
function AcreedorFila({
  acreedor,
  obras,
  reducir,
}: {
  acreedor: AcreedorDeGrupo;
  obras: Record<string, string>;
  reducir: boolean | null;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <li className="-mx-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="group flex min-h-[44px] w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition-colors duration-200 hover:bg-cdm-fg/[0.04]"
      >
        <motion.svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-3 w-3 shrink-0 text-cdm-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          animate={reducir ? undefined : { rotate: abierto ? 90 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
        <span className="min-w-0 flex-1 truncate text-[13px] text-cdm-fg">
          <span className="text-cdm-muted">a</span>{" "}
          {nombreDueno(acreedor.acreedor_tipo, acreedor.acreedor_obra_id, obras)}
          {acreedor.deudas.length > 1 && (
            <span className="ml-2 font-mono-hud text-[9px] uppercase tracking-[0.14em] text-cdm-muted">
              {acreedor.deudas.length} mov
            </span>
          )}
        </span>
        <span className="shrink-0 tabular-nums text-[14px] font-semibold tracking-tight text-red-400">
          {fmtTotales(acreedor.totalArs, acreedor.totalUsd)}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            key="detalle"
            initial={reducir ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reducir ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <ul className="ml-[17px] space-y-1.5 border-l border-cdm-line py-1.5 pl-4 pr-3">
              {acreedor.deudas.map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className={CHIP}>
                      hace {d.dias} {d.dias === 1 ? "día" : "días"}
                    </span>
                    {d.saldoPendiente !== d.montoOriginal && (
                      <span className={CHIP}>
                        devuelto {fmtMonto(d.montoOriginal - d.saldoPendiente, d.moneda)} de{" "}
                        {fmtMonto(d.montoOriginal, d.moneda)}
                      </span>
                    )}
                    {d.notas && (
                      <span className="min-w-0 truncate text-[10px] text-cdm-muted">
                        {d.notas}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-[11px] text-cdm-fg">
                    {fmtMonto(d.saldoPendiente, d.moneda)}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Entrada escalonada de secciones (respeta prefers-reduced-motion). */
function useSeccion(reducir: boolean | null) {
  return useMemo(
    () => ({
      hidden: reducir ? {} : { opacity: 0, y: 18 },
      visible: (i: number) =>
        reducir
          ? {}
          : {
              opacity: 1,
              y: 0,
              transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay: i * 0.09 },
            },
    }),
    [reducir]
  );
}

export function DineroScreen() {
  const [data, setData] = useState<PayloadDinero | null>(null);
  const [cuentas, setCuentas] = useState<SaldosCuentas | null>(null);
  const [warnCuentas, setWarnCuentas] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reducirMovimiento = useReducedMotion();
  const seccion = useSeccion(reducirMovimiento);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resDinero, resCuentas] = await Promise.all([
        fetchCompartido("/api/dinero"),
        fetchCompartido("/api/cuentas"),
      ]);
      if (!resDinero.ok) {
        setError(
          (resDinero.body as { error?: string })?.error ?? `Error ${resDinero.status}`
        );
        return;
      }
      setData(resDinero.body as PayloadDinero);
      if (resCuentas.ok) {
        setCuentas(resCuentas.body as SaldosCuentas);
        setWarnCuentas(null);
      } else {
        // Sin /api/cuentas no hay saldos del motor: el "a conciliar" y la
        // lista de cuentas quedan ciegos — se dice, no se muestra vacío mudo.
        setWarnCuentas(
          "No se pudieron cargar las cuentas (motor): sin saldos por cuenta ni chequeo a conciliar."
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totales = useMemo(
    () => (data ? totalesPorDueno(data.bolsillos) : null),
    [data]
  );
  const porCuenta = useMemo(
    () => (data ? bolsillosPorCuenta(data.bolsillos) : new Map<string, BolsilloVista[]>()),
    [data]
  );
  const deudas = useMemo(
    () => (data ? deudasConAntiguedad(data.financiamientos, Date.now()) : []),
    [data]
  );
  const grupos = useMemo(
    () => (data ? borradoresAgrupados(data.borradores) : []),
    [data]
  );
  const composicion = useMemo(
    () => (data ? composicionPorObra(data.financiamientos, data.costos_obra) : []),
    [data]
  );
  const divergencias = useMemo(() => {
    if (!data || !cuentas) return [];
    return divergenciasContraMotor(
      data.bolsillos,
      cuentas.cuentas.map((c) => ({ id: c.id, saldo: c.saldo }))
    );
  }, [data, cuentas]);

  if (loading) return <CargandoCockpit label="Dinero" />;

  if (error || !data) {
    return (
      <main className="font-geist relative flex min-h-screen items-center justify-center bg-cdm-bg text-red-400">
        <span className="relative z-10 text-xs uppercase tracking-widest">
          {error ?? "Sin datos"}
        </span>
      </main>
    );
  }

  const obras = data.obras;
  const nombreCuenta = new Map(
    (cuentas?.cuentas ?? []).map((c) => [c.id, c] as const)
  );
  const abiertas = deudas.filter((d) => d.estado === "abierto");
  const historicas = deudas.filter((d) => d.estado !== "abierto");
  const grupos_deudores = deudasPorDeudor(deudas);
  const sinFoto = data.bolsillos.length === 0;

  // Total general (neto, ARS y USD aparte): el número que manda la pantalla.
  const totalArs = totales
    ? totales.obra.ars + totales.empresa.ars + totales.personal.ars
    : 0;
  const totalUsd = totales
    ? totales.obra.usd + totales.empresa.usd + totales.personal.usd
    : 0;

  // Cuentas visibles, partidas en Disponible vs Tarjetas (deuda revolvente).
  const visibles = (cuentas?.cuentas ?? []).filter(
    (c) => porCuenta.has(c.id) || (c.activa && c.saldo !== 0)
  );
  const tarjetas = visibles.filter((c) => /^tarjeta/i.test(c.nombre));
  const disponibles = visibles.filter((c) => !/^tarjeta/i.test(c.nombre));
  const subtotal = (lista: typeof visibles) =>
    lista.reduce(
      (acc, c) => {
        if (c.moneda === "USD") acc.usd += c.saldo;
        else acc.ars += c.saldo;
        return acc;
      },
      { ars: 0, usd: 0 }
    );
  const subDisp = subtotal(disponibles);
  const subTarj = subtotal(tarjetas);

  const fmtSubtotal = (s: { ars: number; usd: number }) =>
    [
      s.ars !== 0 || s.usd === 0 ? formatMoneyInt(s.ars) : null,
      s.usd !== 0 ? `US$ ${formatUsdInt(s.usd)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  /** Fila de cuenta: chip de dueño inline cuando el desglose no agrega nada. */
  const filaCuenta = (c: (typeof visibles)[number]) => {
    const bolsillos = porCuenta.get(c.id) ?? [];
    const unico = bolsillos.length === 1 ? bolsillos[0] : null;
    const unicoCubreTodo =
      unico !== null && Math.abs(parseNum(unico.saldo) - c.saldo) < 0.005;
    const desglosar = bolsillos.length > 1 || (unico !== null && !unicoCubreTodo);
    return (
      <li key={c.id} className="group relative -mx-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 hover:bg-cdm-fg/[0.04]">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-cdm-line bg-cdm-fg/[0.05] font-mono-hud text-[10px] tracking-[0.08em] text-cdm-muted transition-colors duration-200 group-hover:text-cdm-fg">
            {monograma(c.nombre)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-cdm-fg">
              {c.nombre}
              {!c.activa && (
                <span className="ml-2 align-middle font-mono-hud text-[9px] uppercase tracking-[0.14em] text-cdm-muted">
                  inactiva
                </span>
              )}
            </p>
            {unicoCubreTodo && unico && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-cdm-muted">
                <span
                  className={`inline-block h-1.5 w-1.5 shrink-0 ${COLOR_DUENO[unico.dueno_tipo]}`}
                />
                {nombreDueno(unico.dueno_tipo, unico.dueno_obra_id, obras)}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 tabular-nums text-[15px] font-semibold tracking-tight ${
              c.saldo < 0 ? "text-red-400" : "text-cdm-fg"
            }`}
          >
            {fmtMonto(c.saldo, c.moneda)}
          </span>
        </div>
        {desglosar && bolsillos.length > 0 && (
          <ul className="mt-2 space-y-1 border-l border-cdm-line pl-[46px]">
            {bolsillos.map((b) => (
              <li
                key={`${b.dueno_tipo}|${b.dueno_obra_id ?? ""}`}
                className="flex items-baseline justify-between gap-3 text-[11px]"
              >
                <span className="flex min-w-0 items-center gap-1.5 truncate text-cdm-muted">
                  <span
                    className={`inline-block h-1.5 w-1.5 shrink-0 ${COLOR_DUENO[b.dueno_tipo]}`}
                  />
                  {nombreDueno(b.dueno_tipo, b.dueno_obra_id, obras)}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    parseNum(b.saldo) < 0 ? "text-red-400" : "text-cdm-fg"
                  }`}
                >
                  {fmtMonto(parseNum(b.saldo), b.moneda)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <main className="font-geist relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <VolverAlInicio />

        {/* Header */}
        <div className="pt-4 pb-6">
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Dinero
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            La realidad de la plata · bolsillos y libro de deudas
          </p>
        </div>

        <div className="space-y-5">
          {/* Alertas: a conciliar + borradores colgados + fallas de carga.
              SIEMPRE visibles, incluso sin foto inicial (spec decisión 4). */}
          {(divergencias.length > 0 || grupos.length > 0 || warnCuentas) && (
            <motion.section
              className={`${CARD} ring-amber-300/40`}
              variants={seccion}
              initial="hidden"
              animate="visible"
              custom={0}
            >
              <p className={LABEL}>Atención</p>
              <ul className="mt-2 space-y-1.5 text-[13px]">
                {warnCuentas && <li className="text-red-400">{warnCuentas}</li>}
                {divergencias.map((d) => {
                  const c = nombreCuenta.get(d.cuenta_id);
                  return (
                    <li key={d.cuenta_id} className="flex items-baseline justify-between gap-3">
                      <span className="text-amber-300">
                        A conciliar: {c?.nombre ?? d.cuenta_id} — el ledger dice{" "}
                        {fmtMonto(d.saldoLedger, c?.moneda ?? "ARS")} y el motor{" "}
                        {fmtMonto(d.saldoMotor, c?.moneda ?? "ARS")}
                      </span>
                      <span className="shrink-0 tabular-nums text-amber-300">
                        Δ {fmtMonto(d.delta, c?.moneda ?? "ARS")}
                      </span>
                    </li>
                  );
                })}
                {grupos.length > 0 && (
                  <li className="text-cdm-muted">
                    {grupos.length === 1
                      ? "1 operación del bot sin confirmar"
                      : `${grupos.length} operaciones del bot sin confirmar`}{" "}
                    — se confirman por WhatsApp, jamás asientan solas.
                  </li>
                )}
              </ul>
            </motion.section>
          )}

          {sinFoto && (
            <motion.section
              className={CARD}
              variants={seccion}
              initial="hidden"
              animate="visible"
              custom={0}
            >
              <p className="text-sm text-cdm-muted">
                El ledger todavía no tiene movimientos asentados. Después de la
                foto inicial, acá se ve de quién es la plata de cada cuenta.
              </p>
            </motion.section>
          )}

          {/* Hero: total neto + de quién es. UNA cifra que manda y el desglose
              por dueño abajo — jerarquía, no tres números peleándose. */}
          {!sinFoto && totales && (
            <motion.section
              className={CARD}
              variants={seccion}
              initial="hidden"
              animate="visible"
              custom={1}
            >
              {/* Glow de spotlight (decorativo, no interfiere con lectura) */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[130%] -translate-x-1/2 opacity-[0.16]"
                style={{
                  background:
                    "radial-gradient(ellipse at center, var(--cdm-accent) 0%, transparent 65%)",
                }}
              />
              {/* La cifra que manda es la plata que HAY (disponible); las
                  tarjetas son deuda de fin de ciclo y van como dato aparte —
                  un neto negativo arriba asusta y no dice cuánto hay hoy. */}
              <p className={LABEL}>Plata disponible</p>
              <p className="mt-2">
                <CifraHeroica
                  className="text-[clamp(34px,4.4vw,52px)] leading-none"
                  tono={(cuentas ? subDisp.ars : totalArs) < 0 ? "negativo" : "neutro"}
                >
                  {formatMoneyInt(cuentas ? subDisp.ars : totalArs)}
                </CifraHeroica>
                {(cuentas ? subDisp.usd : totalUsd) !== 0 && (
                  <span className="ml-3 align-baseline font-raleway text-[clamp(15px,1.6vw,20px)] font-bold tabular-nums text-cdm-muted">
                    + US$ {formatUsdInt(cuentas ? subDisp.usd : totalUsd)}
                  </span>
                )}
              </p>
              {cuentas && tarjetas.length > 0 && (
                <p className="mt-2 font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                  tarjetas deben{" "}
                  <span className="tabular-nums text-red-400/80">
                    {formatMoneyInt(Math.abs(subTarj.ars))}
                    {subTarj.usd !== 0 && ` · US$ ${formatUsdInt(Math.abs(subTarj.usd))}`}
                  </span>{" "}
                  · neto{" "}
                  <span className={`tabular-nums ${totalArs < 0 ? "text-red-400/80" : "text-cdm-fg"}`}>
                    {formatMoneyInt(totalArs)}
                  </span>
                </p>
              )}

              <div className="mt-5 grid grid-cols-1 gap-4 border-t border-cdm-line pt-4 sm:grid-cols-3">
                {(
                  [
                    ["obra", "Obras", "es de los clientes"],
                    ["empresa", "RAVN", "margen de la empresa"],
                    ["personal", "Eze", "tu bolsillo"],
                  ] as const
                ).map(([tipo, titulo, hint], i) => (
                  <div key={tipo} className="min-w-0">
                    <p className="flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 ${COLOR_DUENO[tipo]}`} />
                      <span className={LABEL}>{titulo}</span>
                    </p>
                    <p className="mt-1.5">
                      <CifraHeroica
                        className="text-[clamp(20px,2.2vw,28px)] leading-none"
                        tono={totales[tipo].ars < 0 ? "negativo" : "neutro"}
                        delay={0.2 + i * 0.12}
                      >
                        {formatMoneyInt(totales[tipo].ars)}
                      </CifraHeroica>
                    </p>
                    <p className="mt-1 text-[10px] tabular-nums text-cdm-muted">
                      {totales[tipo].usd !== 0
                        ? `+ US$ ${formatUsdInt(totales[tipo].usd)}`
                        : hint}
                    </p>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Cuentas: Disponible vs Tarjetas, cada grupo con su subtotal.
              Una cuenta INACTIVA con bolsillos vivos se muestra igual. Sin
              /api/cuentas la sección no se dibuja vacía (warn arriba). */}
          {!sinFoto && cuentas && (
            <motion.section
              className={CARD}
              variants={seccion}
              initial="hidden"
              animate="visible"
              custom={2}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className={LABEL}>Disponible</p>
                <span className="shrink-0 font-mono-hud text-[10px] tabular-nums tracking-[0.08em] text-cdm-muted">
                  {fmtSubtotal(subDisp)}
                </span>
              </div>
              <ul className="mt-2">{disponibles.map(filaCuenta)}</ul>

              {tarjetas.length > 0 && (
                <>
                  <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-cdm-line pt-4">
                    <p className={LABEL}>Tarjetas</p>
                    <span className="shrink-0 font-mono-hud text-[10px] tabular-nums tracking-[0.08em] text-red-400/80">
                      {fmtSubtotal(subTarj)}
                    </span>
                  </div>
                  <ul className="mt-2">{tarjetas.map(filaCuenta)}</ul>
                </>
              )}
            </motion.section>
          )}

          {/* Libro de deudas */}
          <motion.section
            className={CARD}
            variants={seccion}
            initial="hidden"
            animate="visible"
            custom={3}
          >
            <p className={LABEL}>Libro de deudas</p>
            {abiertas.length === 0 ? (
              <p className="mt-2 text-[13px] text-cdm-muted">
                Nadie le debe nada a nadie. Las deudas nacen cuando una obra
                gasta plata de otra (o tuya, o de RAVN).
              </p>
            ) : (
              <ul className="mt-3 space-y-4">
                {grupos_deudores.map((g) => (
                  <li key={`${g.deudor_tipo}|${g.deudor_obra_id ?? ""}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-[13px] text-cdm-fg">
                        <span className="font-medium">
                          {nombreDueno(g.deudor_tipo, g.deudor_obra_id, obras)}
                        </span>{" "}
                        <span className="font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                          le debe
                        </span>
                      </p>
                      <span className="shrink-0 tabular-nums text-[15px] font-semibold tracking-tight text-red-400">
                        {fmtTotales(g.totalArs, g.totalUsd)}
                      </span>
                    </div>
                    <ul className="mt-1">
                      {g.acreedores.map((a) => (
                        <AcreedorFila
                          key={`${a.acreedor_tipo}|${a.acreedor_obra_id ?? ""}`}
                          acreedor={a}
                          obras={obras}
                          reducir={reducirMovimiento}
                        />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {historicas.length > 0 && (
              <details className="mt-3 border-t border-cdm-line pt-2">
                <summary className="cursor-pointer font-mono-hud text-[10px] uppercase tracking-[0.18em] text-cdm-muted">
                  Historial ({historicas.length})
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {historicas.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-baseline justify-between gap-3 text-[11px] text-cdm-muted"
                    >
                      <span className="min-w-0 truncate">
                        {nombreDueno(d.deudor_tipo, d.deudor_obra_id, obras)} →{" "}
                        {nombreDueno(d.acreedor_tipo, d.acreedor_obra_id, obras)} · {d.estado}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {fmtMonto(d.montoOriginal, d.moneda)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </motion.section>

          {/* Borradores del bot */}
          {grupos.length > 0 && (
            <motion.section
              className={CARD}
              variants={seccion}
              initial="hidden"
              animate="visible"
              custom={4}
            >
              <p className={LABEL}>Borradores sin confirmar</p>
              <ul className="mt-3 space-y-2">
                {grupos.map((g) => (
                  <li key={g.grupo_id} className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-cdm-fg">
                        {g.descripcion || g.origen_tipo.replace(/_/g, " ")}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className={CHIP}>{fmtFecha(g.fecha)}</span>
                        <span className={CHIP}>
                          {g.patas} {g.patas === 1 ? "pata" : "patas"}
                        </span>
                        <span className="text-[10px] text-cdm-muted">
                          confirmalo desde WhatsApp
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums text-[13px] font-semibold text-amber-300">
                      {g.totalArs > 0 && formatMoneyInt(g.totalArs)}
                      {g.totalArs > 0 && g.totalUsd > 0 && " + "}
                      {g.totalUsd > 0 && `US$ ${formatUsdInt(g.totalUsd)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* Composición del costo por obra */}
          {composicion.length > 0 && (
            <motion.section
              className={CARD}
              variants={seccion}
              initial="hidden"
              animate="visible"
              custom={5}
            >
              <p className={LABEL}>Quién financia cada obra</p>
              <ul className="mt-3 space-y-4">
                {composicion.map((c) => (
                  <li key={c.obra_id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[13px] font-medium text-cdm-fg">
                        {obras[c.obra_id] ?? "Obra sin nombre"}
                      </span>
                      <span className="shrink-0 font-mono-hud text-[10px] tabular-nums tracking-[0.08em] text-cdm-muted">
                        costo {formatMoneyInt(c.costo)}
                      </span>
                    </div>
                    {c.costo > 0 && (
                      <div className="mt-2 flex h-1.5 w-full overflow-hidden bg-cdm-fg/10">
                        <motion.div
                          className="h-full origin-left bg-cdm-accent/70"
                          style={{ width: `${Math.round(c.pctPropio * 100)}%` }}
                          initial={reducirMovimiento ? false : { scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.7, ease: "easeOut", delay: 0.35 }}
                          title="caja propia"
                        />
                        <motion.div
                          className="h-full origin-left bg-red-400/70"
                          style={{
                            width: `${Math.min(100, Math.round((c.financiadoTotal / c.costo) * 100))}%`,
                          }}
                          initial={reducirMovimiento ? false : { scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.7, ease: "easeOut", delay: 0.5 }}
                          title="financiado"
                        />
                      </div>
                    )}
                    <p className="mt-1.5 text-[10px] tabular-nums text-cdm-muted">
                      {c.costo > 0 && `${Math.round(c.pctPropio * 100)}% caja propia · `}
                      {c.financiado
                        .map(
                          (f) =>
                            `${nombreDueno(f.acreedor_tipo, f.acreedor_obra_id, obras)} puso ${formatMoneyInt(f.monto)}`
                        )
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </div>
      </div>
    </main>
  );
}
