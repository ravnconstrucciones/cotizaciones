"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import {
  DESTINOS_ARCHIVADO,
  textoDeEvento,
  type DestinoArchivado,
} from "@/lib/archivados-destinos";
import type { Evento } from "@/types/centro-mando";
import type {
  OrigenPendiente,
  PendienteCuenta,
} from "@/app/api/pendientes-cuenta/route";
import type { SaldosCuentas } from "@/lib/cuentas";
import { formatMoneyInt, parseFormattedNumber, roundArs2 } from "@/lib/format-currency";

type ObraOpcion = {
  id: string;
  nombre_obra: string | null;
  nombre_cliente: string | null;
};

const DESTINO_LABEL: Record<DestinoArchivado, string> = {
  tarea: "Tarea",
  gasto_obra: "Gasto de obra",
  foto_obra: "Foto de obra",
  gasto_personal: "Gasto personal",
  filosofia: "Filosofía",
  referencia_estetica: "Ref. estética",
  dato: "Dato",
  descartar: "Descartar",
};

const CATEGORIAS_GASTO = [
  "Supermercado",
  "Delivery",
  "Salidas",
  "Combustible",
  "Farmacia",
  "Ropa",
  "Varios",
];

const INPUT_CLS =
  "font-geist w-full rounded-lg border border-cdm-line bg-white/40 dark:bg-zinc-900/30 px-3 py-2 text-xs text-cdm-fg placeholder:text-cdm-muted/50 focus:border-cdm-accent focus:outline-none";

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FormResolver({
  evento,
  obras,
  onResuelto,
}: {
  evento: Evento;
  obras: ObraOpcion[];
  onResuelto: (id: string) => void;
}) {
  const [destino, setDestino] = useState<DestinoArchivado>("tarea");
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [presupuestoId, setPresupuestoId] = useState("");
  const [etiquetas, setEtiquetas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolver(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/archivados/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento_id: evento.id,
          destino,
          monto: monto ? Number(monto) : undefined,
          categoria: categoria || undefined,
          presupuesto_id: presupuestoId || undefined,
          etiquetas: etiquetas
            ? etiquetas.split(",").map((t) => t.trim()).filter(Boolean)
            : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      onResuelto(evento.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setEnviando(false);
    }
  }

  const pideMonto = destino === "gasto_obra" || destino === "gasto_personal";

  return (
    <form onSubmit={resolver} className="space-y-2 border-t border-cdm-line px-4 py-3">
      <div className="flex flex-wrap gap-1.5">
        {DESTINOS_ARCHIVADO.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDestino(d)}
            className={`font-mono-hud rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] ring-1 transition-colors ${
              destino === d
                ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
                : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
            }`}
          >
            {DESTINO_LABEL[d]}
          </button>
        ))}
      </div>

      {pideMonto && (
        <input
          type="number"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="Monto"
          data-no-spinner
          className={INPUT_CLS}
        />
      )}
      {(destino === "gasto_obra" || destino === "foto_obra") && (
        <select
          value={presupuestoId}
          onChange={(e) => setPresupuestoId(e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">Elegí la obra…</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre_obra || o.nombre_cliente || o.id.slice(0, 8)}
            </option>
          ))}
        </select>
      )}
      {destino === "gasto_personal" && (
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">Categoría (Varios)</option>
          {CATEGORIAS_GASTO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      {(destino === "referencia_estetica" || destino === "dato") && (
        <input
          type="text"
          value={etiquetas}
          onChange={(e) => setEtiquetas(e.target.value)}
          placeholder={
            destino === "dato"
              ? "Etiquetas separadas por coma (container, medidas…)"
              : "Etiquetas separadas por coma (tipografia, material…)"
          }
          className={INPUT_CLS}
        />
      )}

      {error && (
        <p className="text-[10px] uppercase tracking-widest text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="font-mono-hud w-full rounded-full ring-1 ring-cdm-accent/50 bg-cdm-accent/10 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-cdm-accent transition-colors hover:bg-cdm-accent/20 disabled:opacity-40"
      >
        {enviando ? "Resolviendo…" : destino === "descartar" ? "Descartar" : "Resolver"}
      </button>
    </form>
  );
}

const ORIGEN_LABEL: Record<OrigenPendiente, string> = {
  gasto_obra: "Gasto de obra",
  cashflow: "Caja",
  gasto_personal: "Gasto personal",
  gasto_empresa: "Gasto de empresa",
  retiro: "Retiro/Aporte",
};

function fmtMonto(p: PendienteCuenta): string {
  return p.moneda === "USD"
    ? `US$ ${new Intl.NumberFormat("es-AR").format(p.monto)}`
    : formatMoneyInt(p.monto);
}

/**
 * Pendientes de cuenta (04/07): movimientos registrados sin decir de qué
 * cuenta salió/entró la plata. Se registran igual (nada se pierde en obra)
 * pero quedan acá en rojo hasta asignarles cuenta con un toque.
 */
function PendientesCuenta() {
  const [pendientes, setPendientes] = useState<PendienteCuenta[] | null>(null);
  const [cuentas, setCuentas] = useState<SaldosCuentas["cuentas"]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [asignando, setAsignando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Oferta de reserva MP (04/07): cuando un INGRESO de obra se asigna a
  // Mercado Pago, se ofrece espejar la reserva que Eze hace adentro de MP.
  const [ofertaReserva, setOfertaReserva] = useState<{
    obraId: string;
    obraNombre: string;
    montoStr: string;
  } | null>(null);
  const [reservando, setReservando] = useState(false);
  const [reservaMsg, setReservaMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [p, c] = await Promise.all([
      fetch("/api/pendientes-cuenta").then((r) => r.json()),
      fetch("/api/cuentas").then((r) => r.json()),
    ]);
    setPendientes((p.pendientes as PendienteCuenta[]) ?? []);
    setCuentas((c.cuentas as SaldosCuentas["cuentas"]) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function asignar(p: PendienteCuenta, cuentaId: string) {
    setAsignando(true);
    setError(null);
    try {
      const res = await fetch("/api/pendientes-cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origen: p.origen, id: p.id, cuenta_id: cuentaId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      setPendientes((ps) => (ps ?? []).filter((x) => x.id !== p.id));
      setAbierto(null);
      // Ingreso de obra que entró a Mercado Pago → ofrecer espejar la
      // reserva de esa obra (Eze la hace real adentro de MP).
      const cuenta = cuentas.find((c) => c.id === cuentaId);
      const esMp =
        cuenta && !cuenta.obra_id && /mercado\s*pago/i.test(cuenta.nombre);
      if (esMp && p.origen === "cashflow" && p.tipo === "ingreso" && p.obra_id) {
        setReservaMsg(null);
        setOfertaReserva({
          obraId: p.obra_id,
          obraNombre: p.detalle ?? "la obra",
          montoStr: String(Math.round(p.monto)),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setAsignando(false);
    }
  }

  async function reservar() {
    if (!ofertaReserva) return;
    const monto = roundArs2(parseFormattedNumber(ofertaReserva.montoStr));
    if (!Number.isFinite(monto) || monto <= 0) {
      setReservaMsg("Indicá un monto válido.");
      return;
    }
    setReservando(true);
    setReservaMsg(null);
    try {
      const res = await fetch("/api/cuentas/reserva-obra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obra_id: ofertaReserva.obraId, monto }),
      });
      const j = (await res.json()) as { error?: string; cuenta?: { nombre: string } };
      if (!res.ok) {
        setReservaMsg(j.error ?? `Error ${res.status}`);
        return;
      }
      setOfertaReserva(null);
      setReservaMsg(
        `Reserva espejada en ${j.cuenta?.nombre ?? "la cuenta de la obra"} — acordate de hacer la reserva real adentro de Mercado Pago.`
      );
      void cargar();
    } catch (err) {
      setReservaMsg(err instanceof Error ? err.message : "Error de red");
    } finally {
      setReservando(false);
    }
  }

  if (pendientes === null) return null;

  return (
    <section className="mb-10">
      <h2 className="font-mono-hud text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
        Pendientes de cuenta{" "}
        {pendientes.length > 0 && (
          <span className="text-red-400">· {pendientes.length}</span>
        )}
      </h2>
      <p className="font-geist mt-1 text-xs text-cdm-muted">
        Movimientos sin decir de dónde salió (o a dónde entró) la plata. Tocá
        uno y asignale la cuenta.
      </p>

      {ofertaReserva && (
        <div className="mt-4 space-y-3 rounded-[24px] px-4 py-4 ring-1 ring-cdm-accent/40 bg-white/60 dark:bg-zinc-900/40">
          <p className="font-geist text-[13px] text-cdm-fg">
            Entró plata de <span className="font-medium">{ofertaReserva.obraNombre}</span> a
            Mercado Pago. ¿Reservás una parte adentro de MP para esa obra? El
            sistema la espeja como cuenta de la obra.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              inputMode="decimal"
              value={ofertaReserva.montoStr}
              onChange={(e) =>
                setOfertaReserva((o) =>
                  o ? { ...o, montoStr: e.target.value } : o
                )
              }
              className="font-mono-hud w-32 rounded-full bg-transparent px-3 py-1.5 text-[12px] tabular-nums text-cdm-fg ring-1 ring-cdm-line focus:ring-cdm-accent/60 focus:outline-none"
            />
            <button
              type="button"
              disabled={reservando}
              onClick={() => void reservar()}
              className="font-mono-hud rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-cdm-accent ring-1 ring-cdm-accent/50 transition-colors hover:bg-cdm-accent/10 disabled:opacity-40"
            >
              {reservando ? "Reservando…" : "Reservar"}
            </button>
            <button
              type="button"
              disabled={reservando}
              onClick={() => setOfertaReserva(null)}
              className="font-mono-hud rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-cdm-muted ring-1 ring-cdm-line transition-colors hover:text-cdm-fg disabled:opacity-40"
            >
              Ahora no
            </button>
          </div>
          {reservaMsg && (
            <p className="text-[10px] uppercase tracking-widest text-red-400">
              {reservaMsg}
            </p>
          )}
        </div>
      )}
      {!ofertaReserva && reservaMsg && (
        <p className="font-geist mt-3 text-xs text-emerald-400">{reservaMsg}</p>
      )}

      {pendientes.length === 0 && (
        <div className="mt-4 flex h-16 items-center justify-center rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40">
          <span className="font-mono-hud text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
            Toda la plata tiene cuenta.
          </span>
        </div>
      )}

      <AnimatePresence initial={false}>
        {pendientes.map((p) => {
          // Solo cuentas de la misma moneda: asignar un gasto en pesos a una
          // cuenta USD no ajustaría el saldo (nunca se inventa cotización).
          const opciones = cuentas.filter(
            (c) => c.activa && c.moneda === p.moneda
          );
          return (
            <motion.div
              key={`${p.origen}-${p.id}`}
              layout
              exit={{ opacity: 0, x: 24 }}
              className="mt-4 overflow-hidden rounded-[24px] ring-1 ring-red-400/30 bg-white/60 dark:bg-zinc-900/40"
            >
              <button
                onClick={() => setAbierto((a) => (a === p.id ? null : p.id))}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                <span className="font-geist min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-cdm-fg">
                  {p.descripcion}
                  <span className="ml-2 font-normal text-cdm-muted">
                    {ORIGEN_LABEL[p.origen]}
                    {p.detalle ? ` · ${p.detalle}` : ""}
                  </span>
                </span>
                <span
                  className={`font-mono-hud shrink-0 text-[12px] tabular-nums ${
                    p.tipo === "ingreso" ? "text-emerald-400" : "text-cdm-fg"
                  }`}
                >
                  {p.tipo === "ingreso" ? "+" : "−"}
                  {fmtMonto(p)}
                </span>
                <span className="font-mono-hud shrink-0 text-[10px] tabular-nums text-cdm-muted">
                  {new Date(`${p.fecha}T12:00:00`).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              </button>
              {abierto === p.id && (
                <div className="space-y-2 border-t border-cdm-line px-4 py-3">
                  <p className="font-mono-hud text-[9px] uppercase tracking-[0.2em] text-cdm-muted">
                    {p.tipo === "ingreso" ? "¿A qué cuenta entró?" : "¿De qué cuenta salió?"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {opciones.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={asignando}
                        onClick={() => void asignar(p, c.id)}
                        className="font-mono-hud rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] ring-1 text-cdm-muted ring-cdm-line transition-colors hover:text-cdm-accent hover:ring-cdm-accent/50 disabled:opacity-40"
                      >
                        {c.nombre}
                      </button>
                    ))}
                    {opciones.length === 0 && (
                      <span className="font-geist text-[11px] text-cdm-muted">
                        No hay cuentas activas en {p.moneda}.
                      </span>
                    )}
                  </div>
                  {error && (
                    <p className="text-[10px] uppercase tracking-widest text-red-400">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}

/** UI Archivados (spec §4.7): nada se pierde — todo lo sin clasificar espera acá. */
export function ArchivadosScreen() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [obras, setObras] = useState<ObraOpcion[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [ev, ob] = await Promise.all([
      supabase
        .from("eventos")
        .select("*")
        .eq("estado", "archivado")
        .order("creado_at", { ascending: false }),
      supabase
        .from("presupuestos")
        .select("id, nombre_obra, nombre_cliente")
        .eq("presupuesto_aprobado", true)
        .order("created_at", { ascending: false }),
    ]);
    setEventos((ev.data as Evento[]) ?? []);
    setObras((ob.data as ObraOpcion[]) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("eventos", cargar);

  function quitarResuelto(id: string) {
    setEventos((es) => es.filter((e) => e.id !== id));
    setAbierto(null);
  }

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg px-4 pb-24 pt-8 text-cdm-fg sm:px-8">
      <div className="relative z-10 mx-auto max-w-3xl">
        {/* Header — mismo lenguaje que ObrasScreen */}
        <header className="mb-6">
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Archivados y pendientes
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Bandeja de pérdida cero · nada queda sin cuenta ni sin clasificar
          </p>
        </header>

        <PendientesCuenta />

        <h2 className="font-mono-hud text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
          Sin clasificar
        </h2>

        {cargando && (
          <p className="font-mono-hud text-[11px] uppercase tracking-[0.14em] text-cdm-muted">
            Cargando…
          </p>
        )}
        {!cargando && eventos.length === 0 && (
          <div className="mt-4 flex h-24 items-center justify-center rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40">
            <span className="font-mono-hud text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
              Nada sin clasificar. Pérdida: cero.
            </span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {eventos.map((e) => (
            <motion.div
              key={e.id}
              layout
              exit={{ opacity: 0, x: 24 }}
              className="mt-4 overflow-hidden rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40"
            >
              <button
                onClick={() => setAbierto((a) => (a === e.id ? null : e.id))}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                <span className="font-geist min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-cdm-fg">
                  {e.titulo}
                </span>
                <span className="font-mono-hud shrink-0 text-[10px] tabular-nums text-cdm-muted">
                  {fmtFechaHora(e.creado_at)}
                </span>
              </button>
              {abierto === e.id && (
                <>
                  <p className="border-t border-cdm-line px-4 py-2.5 font-geist text-[11px] italic text-cdm-muted">
                    &ldquo;{textoDeEvento(e)}&rdquo;
                  </p>
                  <FormResolver evento={e} obras={obras} onResuelto={quitarResuelto} />
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
