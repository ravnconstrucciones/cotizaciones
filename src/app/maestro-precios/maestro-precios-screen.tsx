"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RavnLogo } from "@/components/ravn-logo";
import { createClient } from "@/lib/supabase/client";
import {
  formatArsEnteroDesdeDigitos,
  formatMoneyInt,
  formatNumber,
  parseFormattedNumber,
  roundArs2,
} from "@/lib/format-currency";

type MaestroItemRow = {
  id: string;
  nombre_trabajo: string;
  costo_mo_m2: number;
  costo_materiales_m2: number;
  ganancia_monto_m2: number;
  sort_order: number;
};

function baseCostoM2(mo: number, mat: number): number {
  return roundArs2(
    (Number.isFinite(mo) ? mo : 0) + (Number.isFinite(mat) ? mat : 0)
  );
}

/** % equivalente a partir del monto de ganancia y el costo base. */
function pctDesdeMontoM2(
  mo: number,
  mat: number,
  gananciaMonto: number
): number {
  const base = baseCostoM2(mo, mat);
  if (base <= 0) return 0;
  const m = Math.max(0, Number.isFinite(gananciaMonto) ? gananciaMonto : 0);
  return roundArs2((m / base) * 100);
}

function precioFinalM2(mo: number, mat: number, gananciaMonto: number): number {
  const base = baseCostoM2(mo, mat);
  const m = Math.max(0, Math.round(Number.isFinite(gananciaMonto) ? gananciaMonto : 0));
  return Math.round(base + m);
}

function valorDiaGestion(gananciaMensual: number, dias: number): number {
  if (!Number.isFinite(dias) || dias <= 0) return 0;
  const g = Number.isFinite(gananciaMensual) ? gananciaMensual : 0;
  return Math.round(g / dias);
}

/** Celda $/m² editable: enteros ARS con separadores de miles (sin centavos). */
function MoneyM2Cell({
  value,
  onSave,
  disabled,
}: {
  value: number;
  onSave: (n: number) => Promise<void>;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [edit, setEdit] = useState("");
  const entero = Math.round(Number.isFinite(value) ? value : 0);
  const display = focused ? edit : formatNumber(entero, 0);

  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      className="w-full min-w-[5.5rem] rounded-none border border-ravn-line bg-ravn-surface px-3 py-2 text-right text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg disabled:opacity-50"
      value={display}
      onFocus={() => {
        setFocused(true);
        setEdit(formatNumber(entero, 0));
      }}
      onChange={(e) => setEdit(e.target.value)}
      onBlur={() => {
        const n = Math.max(0, Math.round(parseFormattedNumber(edit)));
        setFocused(false);
        setEdit("");
        if (Number.isFinite(n)) void onSave(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function MaestroPreciosScreen() {
  const [items, setItems] = useState<MaestroItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [gananciaMensualStr, setGananciaMensualStr] = useState("");
  const [diasLaborablesStr, setDiasLaborablesStr] = useState("22");
  const [gestionLoaded, setGestionLoaded] = useState(false);
  const [savingGestion, setSavingGestion] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const [itemsRes, gestRes] = await Promise.all([
        supabase
          .from("maestro_precios_items")
          .select(
            "id, nombre_trabajo, costo_mo_m2, costo_materiales_m2, ganancia_monto_m2, sort_order"
          )
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("maestro_precios_gestion")
          .select("ganancia_mensual_estimada_ars, dias_laborables_mes")
          .eq("id", 1)
          .maybeSingle(),
      ]);

      if (itemsRes.error) {
        setError(itemsRes.error.message);
        setItems([]);
      } else {
        const rows = (itemsRes.data ?? []) as Record<string, unknown>[];
        setItems(
          rows.map((r) => ({
            id: String(r.id),
            nombre_trabajo: String(r.nombre_trabajo ?? ""),
            costo_mo_m2: Math.round(Number(r.costo_mo_m2) || 0),
            costo_materiales_m2: Math.round(Number(r.costo_materiales_m2) || 0),
            ganancia_monto_m2: Math.round(Number(r.ganancia_monto_m2) || 0),
            sort_order: Number(r.sort_order) || 0,
          }))
        );
      }

      if (!gestRes.error) {
        if (gestRes.data) {
          const g = gestRes.data as {
            ganancia_mensual_estimada_ars?: unknown;
            dias_laborables_mes?: unknown;
          };
          setGananciaMensualStr(
            formatNumber(
              Math.round(Number(g.ganancia_mensual_estimada_ars) || 0),
              0
            )
          );
          setDiasLaborablesStr(
            String(Math.max(1, Math.round(Number(g.dias_laborables_mes) || 22)))
          );
        } else {
          setGananciaMensualStr(formatNumber(0, 0));
          setDiasLaborablesStr("22");
        }
        setGestionLoaded(true);
      } else {
        setGestionLoaded(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchItem(
    id: string,
    patch: Partial<
      Pick<
        MaestroItemRow,
        | "nombre_trabajo"
        | "costo_mo_m2"
        | "costo_materiales_m2"
        | "ganancia_monto_m2"
      >
    >
  ) {
    setSavingId(id);
    setError(null);
    try {
      const supabase = createClient();
      const prev = items.find((i) => i.id === id);
      if (!prev) {
        setSavingId(null);
        return;
      }
      const merged = { ...prev, ...patch };
      const { error: err } = await supabase
        .from("maestro_precios_items")
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (err) {
        setError(err.message);
        await load();
        return;
      }
      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...merged } : r))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function agregarTrabajo() {
    setAdding(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: last } = await supabase
        .from("maestro_precios_items")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrder =
        last && typeof (last as { sort_order?: unknown }).sort_order === "number"
          ? Number((last as { sort_order: number }).sort_order) + 1
          : 0;

      const { data, error: err } = await supabase
        .from("maestro_precios_items")
        .insert({
          nombre_trabajo: "Nuevo trabajo",
          costo_mo_m2: 0,
          costo_materiales_m2: 0,
          ganancia_monto_m2: 0,
          sort_order: nextOrder,
        })
        .select(
          "id, nombre_trabajo, costo_mo_m2, costo_materiales_m2, ganancia_monto_m2, sort_order"
        )
        .single();

      if (err) {
        setError(err.message);
        return;
      }
      if (data) {
        const r = data as Record<string, unknown>;
        setItems((prev) => [
          ...prev,
          {
            id: String(r.id),
            nombre_trabajo: String(r.nombre_trabajo ?? ""),
            costo_mo_m2: Math.round(Number(r.costo_mo_m2) || 0),
            costo_materiales_m2: Math.round(Number(r.costo_materiales_m2) || 0),
            ganancia_monto_m2: Math.round(Number(r.ganancia_monto_m2) || 0),
            sort_order: Number(r.sort_order) || 0,
          },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear.");
    } finally {
      setAdding(false);
    }
  }

  async function eliminarItem(id: string) {
    if (!window.confirm("¿Eliminar este trabajo del maestro?")) return;
    setDeletingId(id);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("maestro_precios_items")
        .delete()
        .eq("id", id);
      if (err) {
        setError(err.message);
        return;
      }
      setItems((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar.");
    } finally {
      setDeletingId(null);
    }
  }

  const gananciaMensualNum = useMemo(
    () => Math.round(parseFormattedNumber(gananciaMensualStr)),
    [gananciaMensualStr]
  );
  const diasLaborablesNum = useMemo(() => {
    const n = Math.round(parseFormattedNumber(diasLaborablesStr));
    return Number.isFinite(n) && n > 0 ? Math.min(31, n) : 0;
  }, [diasLaborablesStr]);

  const valorDiaCalculado = useMemo(
    () => valorDiaGestion(gananciaMensualNum, diasLaborablesNum),
    [gananciaMensualNum, diasLaborablesNum]
  );

  async function guardarGestion() {
    const dias = Math.round(parseFormattedNumber(diasLaborablesStr));
    if (!Number.isFinite(dias) || dias < 1 || dias > 31) {
      setError("Indicá días laborables entre 1 y 31.");
      return;
    }
    const gm = Math.round(parseFormattedNumber(gananciaMensualStr));
    if (gm < 0) {
      setError("La ganancia mensual no puede ser negativa.");
      return;
    }

    setSavingGestion(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.from("maestro_precios_gestion").upsert(
        {
          id: 1,
          ganancia_mensual_estimada_ars: gm,
          dias_laborables_mes: dias,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      if (err) {
        setError(err.message);
        return;
      }
      setGananciaMensualStr(formatNumber(gm, 0));
      setDiasLaborablesStr(String(dias));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar gestión.");
    } finally {
      setSavingGestion(false);
    }
  }

  return (
    <div className="min-h-screen bg-ravn-surface px-8 pb-16 pr-20 pt-16 text-ravn-fg">
      <header className="mb-10 flex flex-col gap-4 border-b border-ravn-line pb-8 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="inline-block w-fit" aria-label="Inicio">
          <RavnLogo sizeClassName="text-2xl sm:text-3xl" showTagline={false} />
        </Link>
        <Link
          href="/"
          className="text-sm font-light text-ravn-muted underline-offset-4 hover:text-ravn-fg hover:underline"
        >
          Volver al inicio
        </Link>
      </header>

      <h1 className="font-raleway text-2xl font-medium uppercase tracking-tight">
        Maestro de precios
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-ravn-muted">
        M.O. y materiales en $/m²; ganancia en $/m² (al lado, % equivalente).
        Precio final = suma de los tres.
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-none border border-ravn-accent bg-ravn-accent px-4 py-3 text-sm text-ravn-accent-contrast"
        >
          {error}
        </div>
      ) : null}

      <section className="mt-10 rounded-none border border-ravn-line bg-ravn-surface p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className="font-raleway text-lg font-medium uppercase tracking-wide text-ravn-fg">
              Trabajos por m²
            </h2>
            <p className="mt-1 text-xs text-ravn-muted">
              Pintura, contrapisos, tabiques, etc.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void agregarTrabajo()}
            disabled={adding || loading}
            className="rounded-none border-2 border-ravn-accent bg-ravn-accent px-5 py-3 text-sm font-medium uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg disabled:opacity-50"
          >
            {adding ? "Agregando…" : "Agregar trabajo"}
          </button>
        </div>

        <div className="mt-8 overflow-x-auto rounded-none border border-ravn-line border-b-0">
          {loading ? (
            <p className="p-8 font-light text-ravn-muted">Cargando…</p>
          ) : (
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-t border-ravn-line bg-ravn-surface text-xs font-medium uppercase tracking-wider text-ravn-muted">
                  <th className="border-r border-ravn-line px-4 py-3">
                    Nombre del trabajo
                  </th>
                  <th className="border-r border-ravn-line px-4 py-3 text-right">
                    M.O. ($/m²)
                  </th>
                  <th className="border-r border-ravn-line px-4 py-3 text-right">
                    Materiales ($/m²)
                  </th>
                  <th className="border-r border-ravn-line px-3 py-3 text-right min-w-[11rem]">
                    <span className="block">Ganancia ($/m²)</span>
                    <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-ravn-muted">
                      Equiv. %
                    </span>
                  </th>
                  <th className="w-[7rem] min-w-[6.5rem] max-w-[8rem] border-r border-ravn-line px-2 py-3 text-right">
                    Precio final ($/m²)
                  </th>
                  <th className="w-14 px-2 py-3 text-center"> </th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="border-b border-ravn-line px-4 py-10 text-center font-light text-ravn-muted"
                    >
                      No hay trabajos cargados. Usá{" "}
                      <span className="text-ravn-fg">Agregar trabajo</span> para
                      comenzar.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => {
                    const busy = savingId === row.id || deletingId === row.id;
                    const finalM2 = precioFinalM2(
                      row.costo_mo_m2,
                      row.costo_materiales_m2,
                      row.ganancia_monto_m2
                    );
                    const baseRow = baseCostoM2(
                      row.costo_mo_m2,
                      row.costo_materiales_m2
                    );
                    const pctEquiv = pctDesdeMontoM2(
                      row.costo_mo_m2,
                      row.costo_materiales_m2,
                      row.ganancia_monto_m2
                    );
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-ravn-line last:border-b"
                      >
                        <td className="border-r border-ravn-line px-4 py-3 align-middle">
                          <input
                            type="text"
                            value={row.nombre_trabajo}
                            disabled={busy}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x) =>
                                  x.id === row.id
                                    ? { ...x, nombre_trabajo: e.target.value }
                                    : x
                                )
                              )
                            }
                            onBlur={() => {
                              const v = row.nombre_trabajo.trim();
                              if (!v) {
                                void load();
                                return;
                              }
                              void patchItem(row.id, { nombre_trabajo: v });
                            }}
                            className="w-full min-w-[12rem] rounded-none border border-ravn-line bg-ravn-surface px-3 py-2 text-sm font-light text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg disabled:opacity-50"
                          />
                        </td>
                        <td className="border-r border-ravn-line px-4 py-3 align-middle">
                          <MoneyM2Cell
                            value={row.costo_mo_m2}
                            disabled={busy}
                            onSave={async (n) => {
                              await patchItem(row.id, { costo_mo_m2: n });
                            }}
                          />
                        </td>
                        <td className="border-r border-ravn-line px-4 py-3 align-middle">
                          <MoneyM2Cell
                            value={row.costo_materiales_m2}
                            disabled={busy}
                            onSave={async (n) => {
                              await patchItem(row.id, {
                                costo_materiales_m2: n,
                              });
                            }}
                          />
                        </td>
                        <td className="border-r border-ravn-line px-3 py-3 align-middle">
                          <div className="flex flex-row flex-wrap items-center justify-end gap-2">
                            <div className="min-w-[4.5rem] max-w-[6.5rem] shrink">
                              <MoneyM2Cell
                                value={row.ganancia_monto_m2}
                                disabled={busy}
                                onSave={async (n) => {
                                  await patchItem(row.id, {
                                    ganancia_monto_m2: n,
                                  });
                                }}
                              />
                            </div>
                            <div
                              className="flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-right"
                              title="Ganancia $ ÷ (M.O. + materiales)"
                            >
                              <span className="text-sm font-medium tabular-nums text-ravn-fg">
                                {baseRow > 0
                                  ? formatNumber(pctEquiv, 2)
                                  : "—"}
                              </span>
                              {baseRow > 0 ? (
                                <span className="text-xs text-ravn-muted">
                                  %
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="w-[7rem] min-w-[6.5rem] max-w-[8rem] border-r border-ravn-line px-2 py-3 text-right text-sm font-medium tabular-nums text-ravn-fg">
                          {formatMoneyInt(finalM2)}
                        </td>
                        <td className="px-2 py-3 text-center align-middle">
                          <button
                            type="button"
                            aria-label="Eliminar trabajo"
                            disabled={busy}
                            onClick={() => void eliminarItem(row.id)}
                            className="rounded-none border border-transparent p-2 text-ravn-muted transition-colors hover:border-ravn-line hover:text-ravn-fg disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mt-10 rounded-none border border-ravn-line bg-ravn-surface p-6 md:p-8">
        <h2 className="font-raleway text-lg font-medium uppercase tracking-wide text-ravn-fg">
          Mi valor de gestión
        </h2>
        <p className="mt-2 max-w-2xl text-xs text-ravn-muted">
          Referencia aparte: no modifica los precios por m² de la tabla anterior.
        </p>

        <div className="mt-8 grid max-w-2xl gap-6 md:grid-cols-2">
          <div>
            <label
              htmlFor="gestion-ganancia-mensual"
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
            >
              Ganancia mensual estimada ($)
            </label>
            <input
              id="gestion-ganancia-mensual"
              type="text"
              inputMode="numeric"
              disabled={!gestionLoaded && loading}
              value={gananciaMensualStr}
              onChange={(e) =>
                setGananciaMensualStr(
                  formatArsEnteroDesdeDigitos(e.target.value)
                )
              }
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
              placeholder="Ej. 3.000.000"
            />
          </div>
          <div>
            <label
              htmlFor="gestion-dias"
              className="mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted"
            >
              Días laborables del mes
            </label>
            <input
              id="gestion-dias"
              type="text"
              inputMode="numeric"
              disabled={!gestionLoaded && loading}
              value={diasLaborablesStr}
              onChange={(e) => setDiasLaborablesStr(e.target.value)}
              className="w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg"
              placeholder="22"
            />
          </div>
        </div>

        <div className="mt-8 rounded-none border border-ravn-line bg-ravn-subtle/30 px-4 py-4 md:px-6">
          <p className="text-xs font-medium uppercase tracking-wider text-ravn-muted">
            Valor de mi día de gestión
          </p>
          <p className="mt-2 font-raleway text-xl font-medium tabular-nums text-ravn-fg">
            {diasLaborablesNum > 0 ? formatMoneyInt(valorDiaCalculado) : "—"}
          </p>
          <p className="mt-1 text-xs text-ravn-muted">
            Ganancia mensual ÷ días laborables
          </p>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => void guardarGestion()}
            disabled={savingGestion || loading}
            className="rounded-none border-2 border-ravn-line bg-ravn-surface px-6 py-3 text-sm font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-accent hover:text-ravn-accent-contrast disabled:opacity-50"
          >
            {savingGestion ? "Guardando…" : "Guardar valor de gestión"}
          </button>
        </div>
      </section>
    </div>
  );
}
