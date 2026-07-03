"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RavnLogo } from "@/components/ravn-logo";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, parseFormattedNumber } from "@/lib/format-currency";
import { importeGastoObraArs } from "@/lib/cashflow-gastos-obra";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { calcularCruce, type Cruce, type FilaCruce, type GastoParaCruce } from "@/lib/plan-compra/cruce";
import { cotizadoMedio, type PlanItemRow, type PlanTipo } from "@/lib/plan-compra/tipos";

const labelCls =
  "mb-1 block font-mono-hud text-[10px] font-medium uppercase tracking-[0.14em] text-cdm-muted";
const inputCls =
  "w-full rounded-xl border border-cdm-line bg-cdm-panel px-3 py-2.5 text-sm text-cdm-fg placeholder:text-cdm-muted focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cdm-accent";
const sectionCls =
  "rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 p-6 md:p-8";
const thCls =
  "border-b border-cdm-line px-3 py-3 text-left font-mono-hud text-[10px] font-bold uppercase tracking-[0.14em] text-cdm-muted md:px-4";
const tdCls = "border-b border-cdm-line px-3 py-3 align-middle md:px-4";
const btnCls =
  "rounded-xl border border-cdm-line bg-cdm-panel px-4 py-2 text-sm text-cdm-fg hover:border-cdm-accent disabled:opacity-50";

type GastoRow = {
  id: string;
  descripcion: string;
  importe: number | string;
  fecha: string;
  plan_item_id: string | null;
};

export function PlanScreen({ presupuestoId }: { presupuestoId: string }) {
  const [tab, setTab] = useState<"plan" | "cruce">("plan");
  const [items, setItems] = useState<PlanItemRow[]>([]);
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [cobrado, setCobrado] = useState<number | null>(null);
  const [nombreObra, setNombreObra] = useState<string>("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [plan, gas, obra, pres] = await Promise.all([
      supabase
        .from("obra_plan_items")
        .select("*")
        .eq("presupuesto_id", presupuestoId)
        .order("creado_at", { ascending: true }),
      supabase
        .from("presupuestos_gastos")
        .select("id, descripcion, importe, fecha, plan_item_id")
        .eq("presupuesto_id", presupuestoId)
        .order("fecha", { ascending: true }),
      supabase
        .from("obras")
        .select("monto_total_a_cobrar_ars")
        .eq("presupuesto_id", presupuestoId)
        .maybeSingle(),
      supabase
        .from("presupuestos")
        .select("nombre_obra")
        .eq("id", presupuestoId)
        .maybeSingle(),
    ]);
    if (plan.error) setError(plan.error.message);
    setItems((plan.data ?? []) as PlanItemRow[]);
    setGastos((gas.data ?? []) as GastoRow[]);
    const monto = obra.data?.monto_total_a_cobrar_ars;
    setCobrado(monto == null ? null : Number(monto));
    setNombreObra(pres.data?.nombre_obra ?? "");
    setCargando(false);
  }, [presupuestoId]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeTable("obra_plan_items", load);
  useRealtimeTable("presupuestos_gastos", load);

  const gastosCruce: GastoParaCruce[] = useMemo(
    () =>
      gastos.map((g) => ({
        id: g.id,
        descripcion: g.descripcion ?? "",
        importe_ars: importeGastoObraArs(g),
        plan_item_id: g.plan_item_id,
        fecha: String(g.fecha ?? "").slice(0, 10),
      })),
    [gastos]
  );
  const cruce = useMemo(
    () => calcularCruce(items, gastosCruce, cobrado),
    [items, gastosCruce, cobrado]
  );

  const patchItem = useCallback(
    async (id: string, patch: Partial<PlanItemRow>) => {
      const supabase = createClient();
      const { error: e } = await supabase.from("obra_plan_items").update(patch).eq("id", id);
      if (e) setError(e.message);
      else await load();
    },
    [load]
  );

  const agregarItem = useCallback(
    async (tipo: PlanTipo) => {
      const nombre = window.prompt("Nombre del ítem (agregado fuera de cotización):");
      if (!nombre?.trim()) return;
      const supabase = createClient();
      const { error: e } = await supabase.from("obra_plan_items").insert({
        presupuesto_id: presupuestoId,
        origen: "manual",
        tipo,
        nombre: nombre.trim(),
        cantidad: 1,
        incluido: true,
      });
      if (e) setError(e.message);
      else await load();
    },
    [presupuestoId, load]
  );

  const borrarItem = useCallback(
    async (fila: FilaCruce) => {
      if (!esBorrable(fila)) return; // guard: solo manuales sin gastos
      if (!window.confirm(`¿Borrar "${fila.item.nombre}"?`)) return;
      const supabase = createClient();
      const { error: e } = await supabase
        .from("obra_plan_items")
        .delete()
        .eq("id", fila.item.id);
      if (e) setError(e.message);
      else await load();
    },
    [load]
  );

  async function importarDesdeCotizacion() {
    setImportando(true);
    setError(null);
    try {
      const res = await fetch(`/api/obras/${presupuestoId}/plan/importar`, { method: "POST" });
      const json = (await res.json()) as { insertados?: number; motivo?: string; error?: string };
      if (json.error) setError(json.error);
      else if (json.motivo === "sin_cotizacion") setError("Esta obra no tiene cotización vinculada.");
      else if (json.motivo === "ya_importado") setError("El plan ya fue importado de esa cotización.");
      else if (json.motivo === "sin_desglose") setError("La cotización vinculada no tiene desglose.");
      else if (json.motivo === "error")
        setError("No se pudo importar el plan — reintentá o revisá los logs del server.");
      await load();
    } finally {
      setImportando(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href={`/obras/${presupuestoId}`}
            className="font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted hover:text-cdm-fg"
          >
            ← Obra
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-cdm-fg">
            Plan y cruce{nombreObra ? ` — ${nombreObra}` : ""}
          </h1>
        </div>
        <RavnLogo />
      </header>

      <nav className="mb-6 flex gap-2">
        {(["plan", "cruce"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 font-mono-hud text-[11px] uppercase tracking-[0.14em] ring-1 ${
              tab === t
                ? "bg-cdm-fg text-cdm-bg ring-cdm-fg"
                : "text-cdm-muted ring-cdm-line hover:text-cdm-fg"
            }`}
          >
            {t === "plan" ? "Plan de compra" : "Cruce"}
          </button>
        ))}
      </nav>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
      {cargando ? (
        <p className="text-sm text-cdm-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <section className={sectionCls}>
          <p className="text-sm text-cdm-muted">Esta obra todavía no tiene plan de compra.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={importarDesdeCotizacion} disabled={importando} className={btnCls}>
              {importando ? "Importando…" : "Importar desde la cotización"}
            </button>
            <button onClick={() => void agregarItem("material")} className={btnCls}>
              + Ítem manual
            </button>
          </div>
        </section>
      ) : tab === "plan" ? (
        <PlanTab
          filas={cruce.filas}
          onPatch={patchItem}
          onAgregar={agregarItem}
          onBorrar={borrarItem}
        />
      ) : (
        <CruceTab cruce={cruce} onAsignar={load} />
      )}
    </main>
  );
}

function CampoNumero({
  valor,
  onCommit,
  ancho = "w-24",
}: {
  valor: number | null;
  onCommit: (v: number | null) => void;
  ancho?: string;
}) {
  const [texto, setTexto] = useState(valor == null ? "" : String(valor));
  useEffect(() => {
    setTexto(valor == null ? "" : String(valor));
  }, [valor]);
  return (
    <input
      className={`${inputCls} ${ancho}`}
      inputMode="decimal"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto.trim() === "") return onCommit(null);
        // parseFormattedNumber entiende es-AR ("15.000,50"); Number() no.
        const n = parseFormattedNumber(texto);
        if (Number.isFinite(n) && n >= 0) onCommit(n);
        else setTexto(valor == null ? "" : String(valor));
      }}
    />
  );
}

function CampoNota({
  valor,
  onCommit,
}: {
  valor: string | null;
  onCommit: (v: string | null) => void;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  useEffect(() => {
    setTexto(valor ?? "");
  }, [valor]);
  return (
    <input
      className={`${inputCls} min-w-32`}
      placeholder="Marca / proveedor"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => onCommit(texto.trim() || null)}
    />
  );
}

/** Regla única de borrado (misma para el botón y el guard): manual y sin gastos. */
function esBorrable(f: FilaCruce): boolean {
  return f.item.origen === "manual" && f.cant_gastos === 0;
}

function PlanTab({
  filas,
  onPatch,
  onAgregar,
  onBorrar,
}: {
  filas: FilaCruce[];
  onPatch: (id: string, patch: Partial<PlanItemRow>) => Promise<void>;
  onAgregar: (tipo: PlanTipo) => Promise<void>;
  onBorrar: (fila: FilaCruce) => Promise<void>;
}) {
  const bloques: Array<{ titulo: string; tipoAlta: PlanTipo; filas: FilaCruce[] }> = [
    {
      titulo: "Materiales",
      tipoAlta: "material",
      filas: filas.filter((f) => f.item.tipo !== "mano_de_obra"),
    },
    {
      titulo: "Mano de obra",
      tipoAlta: "mano_de_obra",
      filas: filas.filter((f) => f.item.tipo === "mano_de_obra"),
    },
  ];

  return (
    <div className="space-y-6">
      {bloques.map((b) => (
        <section key={b.titulo} className={sectionCls}>
          <div className="mb-4 flex items-center justify-between">
            <p className={labelCls}>{b.titulo}</p>
            <button onClick={() => void onAgregar(b.tipoAlta)} className={btnCls}>
              + Ítem
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={thCls}></th>
                  <th className={thCls}>Ítem</th>
                  <th className={thCls}>Cotizado</th>
                  <th className={thCls}>Cant</th>
                  <th className={thCls}>Precio unit</th>
                  <th className={thCls}>Nota</th>
                  <th className={thCls}></th>
                </tr>
              </thead>
              <tbody>
                {b.filas.map((f) => {
                  const it = f.item;
                  const borrable = esBorrable(f);
                  return (
                    <tr key={it.id} className={!it.incluido ? "opacity-40" : ""}>
                      <td className={tdCls}>
                        <input
                          type="checkbox"
                          checked={it.incluido}
                          title={it.incluido ? "Lo compro" : "No lo compro"}
                          onChange={(e) => void onPatch(it.id, { incluido: e.target.checked })}
                        />
                      </td>
                      <td className={`${tdCls} ${!it.incluido ? "line-through" : ""}`}>
                        {it.nombre}
                        {it.origen === "manual" && (
                          <span className="ml-2 font-mono-hud text-[10px] uppercase text-amber-600">
                            sin cotizar
                          </span>
                        )}
                        {it.etapa && (
                          <span className="ml-2 font-mono-hud text-[10px] uppercase text-cdm-muted">
                            {it.etapa}
                          </span>
                        )}
                      </td>
                      <td className={tdCls}>
                        {cotizadoMedio(it) != null ? formatMoney(cotizadoMedio(it) as number) : "—"}
                      </td>
                      <td className={tdCls}>
                        <CampoNumero
                          valor={it.cantidad}
                          ancho="w-20"
                          onCommit={(v) => void onPatch(it.id, { cantidad: v })}
                        />
                      </td>
                      <td className={tdCls}>
                        <CampoNumero
                          valor={it.precio_unitario}
                          ancho="w-32"
                          onCommit={(v) => void onPatch(it.id, { precio_unitario: v })}
                        />
                      </td>
                      <td className={tdCls}>
                        <CampoNota
                          valor={it.notas}
                          onCommit={(v) => void onPatch(it.id, { notas: v })}
                        />
                      </td>
                      <td className={tdCls}>
                        {borrable && (
                          <button
                            onClick={() => void onBorrar(f)}
                            className="text-cdm-muted hover:text-red-500"
                            title="Borrar ítem manual"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {b.titulo === "Materiales" && (
            <p className="mt-3 font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
              Regla: misma cosa con otra marca → editá la fila · concepto distinto → excluí y agregá
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

function CruceTab({ cruce, onAsignar }: { cruce: Cruce; onAsignar: () => Promise<void> }) {
  const { totales, margen, filas, sin_asignar } = cruce;

  async function asignarGasto(gastoId: string, planItemId: string | null) {
    const supabase = createClient();
    const { error } = await supabase
      .from("presupuestos_gastos")
      .update({ plan_item_id: planItemId })
      .eq("id", gastoId);
    if (!error) await onAsignar();
  }

  const resumen: Array<{ label: string; valor: string; fuerte?: boolean }> = [
    {
      label: "Cobrado al cliente",
      valor: margen.cobrado != null ? formatMoney(margen.cobrado) : "—",
    },
    { label: "Cotizado (costo)", valor: formatMoney(totales.cotizado) },
    { label: "Plan (costo)", valor: formatMoney(totales.plan) },
    { label: "Real (costo)", valor: formatMoney(totales.real_total) },
    {
      label: "Margen real",
      valor:
        margen.margen_ars != null
          ? `${formatMoney(margen.margen_ars)} · ${margen.margen_pct ?? "—"}%`
          : "—",
      fuerte: true,
    },
  ];

  return (
    <div className="space-y-6">
      <section className={sectionCls}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {resumen.map((r) => (
            <div key={r.label}>
              <p className={labelCls}>{r.label}</p>
              <p
                className={`text-lg tracking-tight ${
                  r.fuerte ? "font-semibold text-cdm-fg" : "text-cdm-fg"
                }`}
              >
                {r.valor}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className={sectionCls}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>Ítem</th>
                <th className={thCls}>Cotizado</th>
                <th className={thCls}>Plan</th>
                <th className={thCls}>Real</th>
                <th className={thCls}>Desvío</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.item.id} className={!f.item.incluido ? "opacity-40" : ""}>
                  <td className={tdCls}>
                    {f.item.nombre}
                    {!f.item.incluido && (
                      <span className="ml-2 font-mono-hud text-[10px] uppercase text-cdm-muted">
                        excluido
                      </span>
                    )}
                    {f.cotizado == null && (
                      <span className="ml-2 font-mono-hud text-[10px] uppercase text-amber-600">
                        sin cotizar
                      </span>
                    )}
                  </td>
                  <td className={tdCls}>{f.cotizado != null ? formatMoney(f.cotizado) : "—"}</td>
                  <td className={tdCls}>{f.item.incluido ? formatMoney(f.plan) : "—"}</td>
                  <td className={tdCls}>{f.cant_gastos > 0 ? formatMoney(f.real) : "—"}</td>
                  <td className={tdCls}>
                    {f.desvio_pct != null ? (
                      <span className={f.desvio_pct <= 0 ? "text-emerald-600" : "text-red-500"}>
                        {f.desvio_pct > 0 ? "+" : ""}
                        {f.desvio_pct}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {sin_asignar.length > 0 && (
        <section className={sectionCls}>
          <p className={labelCls}>
            Gastos sin asignar — {formatMoney(totales.real_sin_asignar)}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {sin_asignar.map((g) => (
                  <tr key={g.id}>
                    <td className={tdCls}>{g.fecha}</td>
                    <td className={tdCls}>{g.descripcion || "Gasto"}</td>
                    <td className={tdCls}>{formatMoney(g.importe_ars)}</td>
                    <td className={tdCls}>
                      <select
                        className={inputCls}
                        defaultValue=""
                        onChange={(e) => void asignarGasto(g.id, e.target.value || null)}
                      >
                        <option value="">Asignar a ítem…</option>
                        {filas.map((f) => (
                          <option key={f.item.id} value={f.item.id}>
                            {f.item.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
