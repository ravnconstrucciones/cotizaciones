"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarraConsumoPresupuesto } from "@/components/barra-consumo-presupuesto";
import { RavnLogo } from "@/components/ravn-logo";
import { createClient } from "@/lib/supabase/client";
import {
  formatMoney,
  formatMoneyMoneda,
  formatNumber,
  parseFormattedNumber,
  roundArs2,
} from "@/lib/format-currency";
import {
  CRONISTA_DOLAR_URL,
  etiquetaCasaDolar,
} from "@/lib/cotizacion-labels";
import { formatRubroName } from "@/lib/format-rubro-name";
import { fetchCostoDirectoPresupuesto } from "@/lib/presupuesto-costos-directos";
import {
  formatNumeroComercialHumano,
  prefijoPlantillaComercial,
  resolveNumeroComercial,
} from "@/lib/presupuesto-numero-comercial";
import { deleteGastoAdjuntoStorage } from "@/lib/gastos-storage";
import {
  parsePropuestaPrefJsonDesdeMismaFila,
  type PropuestaPrefV1,
} from "@/lib/ravn-propuesta-pref";
import type { RubroRow } from "@/types/ravn";

const labelCls =
  "mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-ravn-muted";
const inputCls =
  "w-full rounded-none border border-ravn-line bg-ravn-surface px-3 py-2.5 text-sm text-ravn-fg placeholder:text-ravn-muted focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg";
const sectionCls =
  "rounded-none border border-ravn-line bg-ravn-surface p-6 md:p-8";
const thCls =
  "border-b border-ravn-line px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ravn-muted md:px-4";
const tdCls = "border-b border-ravn-line px-3 py-3 align-middle md:px-4";

type GastoDbRow = {
  id: string;
  presupuesto_id: string;
  fecha: string;
  rubro_id: string | null;
  descripcion: string;
  importe: number | string;
  cotizacion_venta_ars_por_usd?: number | string | null;
  casa_dolar?: string | null;
  created_at?: string;
  adjunto_path?: string | null;
  adjunto_kind?: string | null;
};

type CotizacionItem = {
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion?: string;
};

type DraftGasto = {
  fecha: string;
  rubro_id: string;
  descripcion: string;
  importeStr: string;
};

function sortRubrosRowsByNumericId(rubros: RubroRow[]): RubroRow[] {
  return [...rubros].sort((a, b) => {
    const na = Number(String(a.id).replace(/\D/g, "")) || 0;
    const nb = Number(String(b.id).replace(/\D/g, "")) || 0;
    if (na !== nb) return na - nb;
    return String(a.id).localeCompare(String(b.id));
  });
}

function fechaIsoToDisplay(iso: string): string {
  const d = iso.trim().slice(0, 10);
  if (d.length === 10 && d[4] === "-" && d[7] === "-") {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  return iso;
}

type ObraOpcion = {
  id: string;
  nombre_cliente: string | null;
  fecha: string | null;
};

export function GastosScreen({
  presupuestoId: presupuestoIdProp,
}: {
  /** Si es `null`, se muestra selector de obra (p. ej. `/gastos/nuevo`). */
  presupuestoId: string | null;
}) {
  const presupuestoFijo =
    presupuestoIdProp != null && String(presupuestoIdProp).trim() !== ""
      ? String(presupuestoIdProp).trim()
      : null;
  const [obraElegida, setObraElegida] = useState<string | null>(presupuestoFijo);
  const [obrasOpciones, setObrasOpciones] = useState<ObraOpcion[]>([]);
  const [obrasListaLoading, setObrasListaLoading] = useState(
    presupuestoFijo == null
  );

  const effectivePresupuestoId = presupuestoFijo ?? obraElegida;

  const [loading, setLoading] = useState(presupuestoFijo != null);
  const [error, setError] = useState<string | null>(null);
  const [nombreCliente, setNombreCliente] = useState("");
  const [pdfGenerado, setPdfGenerado] = useState<boolean | null>(null);
  const [correlativo, setCorrelativo] = useState<number>(0);
  const [costoDirecto, setCostoDirecto] = useState(0);
  const [margenEsperado, setMargenEsperado] = useState(0);
  const [gastos, setGastos] = useState<GastoDbRow[]>([]);
  const [rubros, setRubros] = useState<RubroRow[]>([]);
  const [draft, setDraft] = useState<DraftGasto | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [presupuestoAprobado, setPresupuestoAprobado] = useState(false);
  /** `propuesta_comercial_pref` válido: permite mostrar margen desde precio sin IVA guardado. */
  const [hayPrecioObraRentabilidad, setHayPrecioObraRentabilidad] =
    useState(false);
  const [propuestaPref, setPropuestaPref] = useState<PropuestaPrefV1 | null>(
    null
  );
  const [cotizaciones, setCotizaciones] = useState<CotizacionItem[]>([]);
  const [cotizLoading, setCotizLoading] = useState(false);
  const [cotizError, setCotizError] = useState<string | null>(null);
  const [casaDolar, setCasaDolar] = useState<string>("oficial");
  const [cotizacionManualStr, setCotizacionManualStr] = useState("");
  const [obraCashflowId, setObraCashflowId] = useState<string | null>(null);

  const rubrosOrdenados = useMemo(
    () => sortRubrosRowsByNumericId(rubros),
    [rubros]
  );

  const nombrePorRubroId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rubros) {
      m.set(String(r.id), formatRubroName(r.nombre));
    }
    return m;
  }, [rubros]);

  const totalGastado = useMemo(
    () =>
      roundArs2(
        gastos.reduce(
          (acc, g) => acc + (Number(g.importe) || 0),
          0
        )
      ),
    [gastos]
  );

  const cotProp = propuestaPref?.cotizacionVentaArsPorUsd ?? 0;
  const esPresupuestoUsd =
    propuestaPref?.moneda === "USD" && cotProp > 0;

  const cotizacionSeleccionada = useMemo(
    () => cotizaciones.find((c) => c.casa === casaDolar) ?? null,
    [cotizaciones, casaDolar]
  );

  const ventaEfectivaParaGastos = useMemo(() => {
    const manual = roundArs2(parseFormattedNumber(cotizacionManualStr));
    if (manual > 0) return manual;
    const v = Number(cotizacionSeleccionada?.venta);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [cotizacionManualStr, cotizacionSeleccionada]);

  const costoDirectoUsd = useMemo(() => {
    if (!esPresupuestoUsd) return 0;
    return roundArs2(costoDirecto / cotProp);
  }, [esPresupuestoUsd, costoDirecto, cotProp]);

  const margenEsperadoUsd = useMemo(() => {
    if (!esPresupuestoUsd || !propuestaPref) return 0;
    const m = roundArs2(
      Math.max(0, propuestaPref.precioSinIvaArsRedondeado - costoDirecto)
    );
    return roundArs2(m / cotProp);
  }, [esPresupuestoUsd, propuestaPref, costoDirecto, cotProp]);

  const totalGastadoUsd = useMemo(() => {
    if (!esPresupuestoUsd) return 0;
    let s = 0;
    for (const g of gastos) {
      const ars = Number(g.importe) || 0;
      const cotRow = Number(g.cotizacion_venta_ars_por_usd) || 0;
      const cot =
        cotRow > 0 ? cotRow : cotProp > 0 ? cotProp : ventaEfectivaParaGastos;
      if (cot <= 0) continue;
      s += ars / cot;
    }
    return roundArs2(s);
  }, [esPresupuestoUsd, gastos, cotProp, ventaEfectivaParaGastos]);

  const loadCotizaciones = useCallback(async () => {
    setCotizLoading(true);
    setCotizError(null);
    try {
      const base =
        typeof window !== "undefined" ? window.location.origin : "";
      const url = base ? `${base}/api/cotizaciones` : "/api/cotizaciones";
      const res = await fetch(url, { cache: "no-store" });
      const body = (await res.json()) as {
        cotizaciones?: CotizacionItem[];
        error?: string;
      };
      const list = body.cotizaciones ?? [];
      if (list.length > 0) {
        setCotizaciones(list);
        setCasaDolar((prev) => {
          const casas = new Set(list.map((c) => c.casa));
          if (casas.has(prev)) return prev;
          return list[0]?.casa ?? prev;
        });
        setCotizError(body.error ?? null);
      } else {
        setCotizaciones([]);
        setCotizError(
          body.error ??
            "Sin cotizaciones automáticas. Ingresá cotización venta a mano."
        );
      }
    } catch {
      setCotizaciones([]);
      setCotizError("No se pudo cargar cotizaciones.");
    } finally {
      setCotizLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!presupuestoAprobado || propuestaPref?.moneda !== "USD") return;
    void loadCotizaciones();
  }, [presupuestoAprobado, propuestaPref?.moneda, loadCotizaciones]);

  const load = useCallback(async () => {
    const pid = effectivePresupuestoId;
    if (!pid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      const [presRes, num] = await Promise.all([
        supabase
          .from("presupuestos")
          .select(
            "nombre_cliente, pdf_generado, propuesta_comercial_pref, presupuesto_aprobado"
          )
          .eq("id", pid)
          .single(),
        resolveNumeroComercial(supabase, pid),
      ]);

      const { data: pres, error: errP } = presRes;
      setCorrelativo(num);

      if (errP || !pres) {
        setError(errP?.message ?? "Presupuesto no encontrado.");
        setLoading(false);
        return;
      }

      setNombreCliente(String(pres.nombre_cliente ?? ""));
      const pg = (pres as { pdf_generado?: boolean }).pdf_generado;
      setPdfGenerado(Boolean(pg));
      const aprobado = Boolean(
        (pres as { presupuesto_aprobado?: boolean }).presupuesto_aprobado
      );
      setPresupuestoAprobado(aprobado);

      if (!aprobado) {
        setCostoDirecto(0);
        setMargenEsperado(0);
        setHayPrecioObraRentabilidad(false);
        setPropuestaPref(null);
        setCotizacionManualStr("");
        setGastos([]);
        setRubros([]);
        setObraCashflowId(null);
        setLoading(false);
        return;
      }

      const prefRaw = (pres as { propuesta_comercial_pref?: unknown })
        .propuesta_comercial_pref;

      const [costos, rubRes, gastRes, obraRes] = await Promise.all([
        fetchCostoDirectoPresupuesto(supabase, pid),
        supabase.from("rubros").select("id, nombre").order("id", { ascending: true }),
        supabase
          .from("presupuestos_gastos")
          .select("*")
          .eq("presupuesto_id", pid)
          .order("fecha", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("obras").select("id").eq("presupuesto_id", pid).maybeSingle(),
      ]);

      const { total } = costos;
      setCostoDirecto(total);
      const pref = parsePropuestaPrefJsonDesdeMismaFila(prefRaw, pid);
      setPropuestaPref(pref);
      setHayPrecioObraRentabilidad(pref != null);
      const precioSinIva = pref?.precioSinIvaArsRedondeado ?? 0;
      setMargenEsperado(roundArs2(Math.max(0, precioSinIva - total)));
      if (pref?.moneda === "USD" && pref.cotizacionVentaArsPorUsd > 0) {
        setCotizacionManualStr(
          formatNumber(pref.cotizacionVentaArsPorUsd, 2)
        );
      } else {
        setCotizacionManualStr("");
      }

      const { data: rubData, error: errRub } = rubRes;
      if (errRub) {
        setError(errRub.message);
        setLoading(false);
        return;
      }
      setRubros((rubData ?? []) as RubroRow[]);

      const { data: gastData, error: errG } = gastRes;
      if (errG) {
        setError(
          errG.message.includes("presupuestos_gastos")
            ? "Falta la tabla de gastos en Supabase. Ejecutá la migración `20260327120000_presupuestos_gastos.sql`."
            : errG.message
        );
        setLoading(false);
        return;
      }

      setGastos((gastData ?? []) as GastoDbRow[]);

      const { data: obraData, error: errObra } = obraRes;
      if (!errObra && obraData && (obraData as { id?: string }).id) {
        setObraCashflowId(String((obraData as { id: string }).id));
      } else {
        setObraCashflowId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, [effectivePresupuestoId]);

  useEffect(() => {
    if (presupuestoFijo != null) {
      setObrasListaLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setObrasListaLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data, error: errO } = await supabase
          .from("presupuestos")
          .select("id, nombre_cliente, fecha")
          .eq("presupuesto_aprobado", true)
          .order("fecha", { ascending: false });
        if (cancelled) return;
        if (errO) {
          setError(errO.message);
          setObrasOpciones([]);
        } else {
          setObrasOpciones(
            (data ?? []).map((r) => ({
              id: String((r as { id: unknown }).id),
              nombre_cliente:
                (r as { nombre_cliente?: string | null }).nombre_cliente ??
                null,
              fecha: (r as { fecha?: string | null }).fecha ?? null,
            }))
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar obras.");
        }
      } finally {
        if (!cancelled) setObrasListaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presupuestoFijo]);

  useEffect(() => {
    if (!effectivePresupuestoId) {
      setLoading(false);
      return;
    }
    void load();
  }, [effectivePresupuestoId, load]);

  function abrirNuevoGasto() {
    const hoy = new Date().toISOString().slice(0, 10);
    setDraft({
      fecha: hoy,
      rubro_id: "",
      descripcion: "",
      importeStr: "",
    });
  }

  async function guardarDraft() {
    if (!draft) return;
    const importe = roundArs2(parseFormattedNumber(draft.importeStr));
    if (!draft.fecha) {
      setError("Indicá la fecha del gasto.");
      return;
    }
    if (importe <= 0) {
      setError("El importe debe ser mayor a cero.");
      return;
    }

    if (esPresupuestoUsd && ventaEfectivaParaGastos <= 0) {
      setError(
        "Definí cotización venta (ARS por US$ 1), manual o desde el listado, para registrar el gasto en dólares."
      );
      return;
    }

    const pid = effectivePresupuestoId;
    if (!pid) {
      setError("Elegí una obra antes de guardar.");
      return;
    }

    setSavingDraft(true);
    setError(null);
    try {
      const supabase = createClient();
      const insertPayload: Record<string, unknown> = {
        presupuesto_id: pid,
        fecha: draft.fecha,
        rubro_id: draft.rubro_id.trim() || null,
        descripcion: draft.descripcion.trim(),
        importe,
      };
      if (esPresupuestoUsd) {
        insertPayload.cotizacion_venta_ars_por_usd = ventaEfectivaParaGastos;
        insertPayload.casa_dolar = casaDolar;
      }
      const { error: err } = await supabase
        .from("presupuestos_gastos")
        .insert(insertPayload);

      if (err) {
        setError(err.message);
        setSavingDraft(false);
        return;
      }

      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function eliminarGasto(id: string) {
    if (!window.confirm("¿Eliminar este gasto?")) return;
    setDeletingId(id);
    setError(null);
    try {
      const supabase = createClient();
      const { data: rowAdj, error: errSel } = await supabase
        .from("presupuestos_gastos")
        .select("adjunto_path")
        .eq("id", id)
        .maybeSingle();
      if (errSel) {
        setError(errSel.message);
        setDeletingId(null);
        return;
      }
      const pathAdj =
        rowAdj && typeof (rowAdj as { adjunto_path?: unknown }).adjunto_path === "string"
          ? String((rowAdj as { adjunto_path: string }).adjunto_path)
          : null;

      const { error: err } = await supabase
        .from("presupuestos_gastos")
        .delete()
        .eq("id", id);
      if (err) {
        setError(err.message);
        setDeletingId(null);
        return;
      }
      await deleteGastoAdjuntoStorage(pathAdj);
      setGastos((prev) => prev.filter((g) => g.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setDeletingId(null);
    }
  }

  const numeroLabel = formatNumeroComercialHumano(
    prefijoPlantillaComercial("negro"),
    correlativo
  );

  const headerNav = (
    <header className="border-b border-ravn-line px-6 py-5 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="inline-block w-fit" aria-label="Inicio">
          <RavnLogo sizeClassName="text-xl sm:text-2xl" showTagline={false} />
        </Link>
        <nav className="flex flex-wrap gap-3 font-raleway text-xs font-medium uppercase tracking-wider">
          {effectivePresupuestoId ? (
            <>
              <Link
                href={`/propuesta/${encodeURIComponent(effectivePresupuestoId)}`}
                className="text-ravn-muted underline-offset-4 transition-colors hover:text-ravn-fg hover:underline"
              >
                Propuesta
              </Link>
              <span className="text-ravn-line" aria-hidden>
                /
              </span>
              <Link
                href={`/rentabilidad?id=${encodeURIComponent(effectivePresupuestoId)}`}
                className="text-ravn-muted underline-offset-4 transition-colors hover:text-ravn-fg hover:underline"
              >
                Rentabilidad
              </Link>
              {obraCashflowId ? (
                <>
                  <span className="text-ravn-line" aria-hidden>
                    /
                  </span>
                  <Link
                    href={`/cashflow/obra/${encodeURIComponent(obraCashflowId)}`}
                    className="text-ravn-muted underline-offset-4 transition-colors hover:text-ravn-fg hover:underline"
                  >
                    Cashflow
                  </Link>
                </>
              ) : null}
              <span className="text-ravn-line" aria-hidden>
                /
              </span>
            </>
          ) : null}
          <span className="text-ravn-fg">Gastos de obra</span>
        </nav>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-ravn-surface text-ravn-fg">
      {headerNav}

      <main className="mx-auto max-w-5xl px-6 py-10 pb-24 sm:px-10">
        {presupuestoFijo == null && !obraElegida ? (
          obrasListaLoading ? (
            <p className="text-sm text-ravn-muted">
              Cargando obras aprobadas…
            </p>
          ) : (
            <section className={sectionCls}>
              <h1 className="font-raleway text-xl font-medium uppercase tracking-tight md:text-2xl">
                Registrar gasto de obra
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-ravn-muted">
                Elegí la obra (presupuesto aprobado) y después podés cargar el
                importe, descripción y una foto o audio como comprobante.
              </p>
              <div className="mt-8 max-w-xl">
                <label htmlFor="gastos-obra" className={labelCls}>
                  Obra
                </label>
                <select
                  id="gastos-obra"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (v) {
                      setObraElegida(v);
                      setDraft(null);
                      setError(null);
                    }
                  }}
                  className={inputCls}
                >
                  <option value="">Seleccioná obra…</option>
                  {obrasOpciones.map((o) => (
                    <option key={o.id} value={o.id}>
                      {(o.nombre_cliente?.trim() || "Sin nombre") +
                        (o.fecha
                          ? ` · ${fechaIsoToDisplay(String(o.fecha))}`
                          : "")}
                    </option>
                  ))}
                </select>
              </div>
              {obrasOpciones.length === 0 && !obrasListaLoading ? (
                <p className="mt-6 text-sm text-ravn-muted">
                  No hay presupuestos aprobados. Marcá uno en el{" "}
                  <Link href="/historial" className="underline underline-offset-2">
                    historial
                  </Link>
                  .
                </p>
              ) : null}
            </section>
          )
        ) : loading ? (
          <p className="text-sm text-ravn-muted">Cargando panel de gastos…</p>
        ) : !presupuestoAprobado ? (
          <>
            <h1 className="font-raleway text-2xl font-medium uppercase tracking-tight md:text-3xl">
              Ejecución y control de gastos
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ravn-muted">
              <span className="font-medium text-ravn-fg">{numeroLabel}</span>
              {nombreCliente ? (
                <>
                  {" "}
                  · <span className="text-ravn-fg">{nombreCliente}</span>
                </>
              ) : null}
            </p>
            <div
              className={`${sectionCls} mt-10 max-w-2xl border-ravn-line bg-ravn-subtle/30`}
            >
              <p className="text-sm leading-relaxed text-ravn-fg">
                Para cargar gastos de obra tenés que marcar este presupuesto
                como <strong className="font-medium">aprobado</strong> en el{" "}
                <Link
                  href="/historial"
                  className="underline underline-offset-2"
                >
                  historial de presupuestos
                </Link>{" "}
                (casilla &quot;Presupuesto aprobado&quot;). Después lo vas a ver
                en{" "}
                <Link
                  href="/control-gastos"
                  className="underline underline-offset-2"
                >
                  Control de gastos
                </Link>
                .
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="font-raleway text-2xl font-medium uppercase tracking-tight md:text-3xl">
              Ejecución y control de gastos
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ravn-muted">
              <span className="font-medium text-ravn-fg">{numeroLabel}</span>
              {nombreCliente ? (
                <>
                  {" "}
                  · <span className="text-ravn-fg">{nombreCliente}</span>
                </>
              ) : null}
            </p>
            {presupuestoFijo == null && effectivePresupuestoId ? (
              <p className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setObraElegida(null);
                    setDraft(null);
                    setGastos([]);
                    setError(null);
                  }}
                  className="text-xs font-medium uppercase tracking-wider text-ravn-muted underline-offset-4 hover:text-ravn-fg hover:underline"
                >
                  Elegir otra obra
                </button>
              </p>
            ) : null}
            {pdfGenerado === false ? (
              <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ravn-muted">
                Este presupuesto aún no tiene PDF generado. El panel de gastos
                está pensado sobre todo para obras con propuesta cerrada; podés
                registrar gastos igualmente.
              </p>
            ) : null}

            {error ? (
              <p className="mt-6 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <section className={`${sectionCls} mt-10`}>
              <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                Consumo del presupuesto
              </h2>
              {esPresupuestoUsd ? (
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-ravn-muted">
                  Presupuesto en{" "}
                  <span className="text-ravn-fg">dólares</span>: costo y margen
                  se convierten con el tipo de cambio guardado en Rentabilidad (
                  {formatNumber(cotProp, 2)} ARS/US$). Los gastos se cargan en
                  pesos y cada uno usa la cotización venta que elijas al cargarlo.
                </p>
              ) : null}
              {propuestaPref?.moneda === "USD" && cotProp <= 0 ? (
                <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                  Este presupuesto está en USD pero falta la cotización guardada en
                  Rentabilidad. Abrí Rentabilidad, confirmá el tipo y guardá en la
                  nube.
                </p>
              ) : null}
              <div className="mt-8">
                <BarraConsumoPresupuesto
                  modoMoneda={esPresupuestoUsd ? "USD" : "ARS"}
                  costoDirecto={
                    esPresupuestoUsd ? costoDirectoUsd : costoDirecto
                  }
                  margenEsperado={
                    esPresupuestoUsd ? margenEsperadoUsd : margenEsperado
                  }
                  totalGastado={
                    esPresupuestoUsd ? totalGastadoUsd : totalGastado
                  }
                  hayPrecioObraDesdeRentabilidad={hayPrecioObraRentabilidad}
                />
              </div>
            </section>

            {esPresupuestoUsd ? (
              <section className={`${sectionCls} mt-10`}>
                <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                  Tipo de cambio (nuevos gastos)
                </h2>
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-ravn-muted">
                  Al guardar un gasto, el importe en pesos se divide por la
                  cotización <span className="text-ravn-fg">venta</span> (ARS por
                  US$ 1). Elegí la misma referencia que en Rentabilidad; contrastá
                  con{" "}
                  <a
                    href={CRONISTA_DOLAR_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ravn-fg underline underline-offset-2"
                  >
                    El Cronista — Dólar
                  </a>
                  .
                </p>
                {cotizLoading ? (
                  <p className="mt-4 text-sm text-ravn-muted">
                    Cotizaciones…
                  </p>
                ) : null}
                {cotizError ? (
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                    {cotizError}
                  </p>
                ) : null}
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="gastos-casa-dolar" className={labelCls}>
                      Referencia
                    </label>
                    <select
                      id="gastos-casa-dolar"
                      value={casaDolar}
                      onChange={(e) => setCasaDolar(e.target.value)}
                      className={inputCls}
                    >
                      {cotizaciones.map((c) => (
                        <option key={c.casa} value={c.casa}>
                          {etiquetaCasaDolar(c.casa, c.nombre)} — venta{" "}
                          {formatNumber(c.venta, 2)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="gastos-cot-manual" className={labelCls}>
                      Cotización venta manual (ARS / US$ 1)
                    </label>
                    <input
                      id="gastos-cot-manual"
                      type="text"
                      inputMode="decimal"
                      data-no-spinner
                      value={cotizacionManualStr}
                      onChange={(e) =>
                        setCotizacionManualStr(e.target.value)
                      }
                      placeholder="Prioridad sobre el listado si completás"
                      className={`${inputCls} tabular-nums`}
                    />
                  </div>
                </div>
                <p className="mt-3 text-[10px] text-ravn-muted">
                  Vigente para el próximo gasto:{" "}
                  <span className="tabular-nums text-ravn-fg">
                    {ventaEfectivaParaGastos > 0
                      ? `${formatNumber(ventaEfectivaParaGastos, 2)} ARS / US$ 1`
                      : "—"}
                  </span>
                </p>
              </section>
            ) : null}

            <section className={`${sectionCls} mt-10`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2">
                  <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                    Registro de gastos
                  </h2>
                  <p className="max-w-2xl text-[10px] leading-relaxed text-ravn-muted">
                    Comprobantes con foto o audio: usá{" "}
                    <Link
                      href="/cashflow"
                      className="text-ravn-fg underline underline-offset-2"
                    >
                      Caja / tesorería
                    </Link>{" "}
                    (ingreso o egreso → manual, foto o audio).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={abrirNuevoGasto}
                  disabled={draft != null}
                  className="inline-flex w-full items-center justify-center rounded-none bg-ravn-accent px-6 py-3.5 font-raleway text-xs font-semibold uppercase tracking-[0.14em] text-ravn-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  + NUEVO GASTO
                </button>
              </div>

              <div className="mt-8 overflow-x-auto">
                <table
                  className={`w-full border-collapse font-raleway text-sm ${esPresupuestoUsd ? "min-w-[920px]" : "min-w-[640px]"}`}
                >
                  <thead>
                    <tr>
                      <th className={thCls}>FECHA</th>
                      <th className={thCls}>RUBRO</th>
                      <th className={thCls}>DESCRIPCIÓN DEL GASTO</th>
                      <th className={`${thCls} text-right`}>IMPORTE (ARS)</th>
                      {esPresupuestoUsd ? (
                        <>
                          <th className={`${thCls} text-right`}>
                            COTIZ. VENTA
                          </th>
                          <th className={`${thCls} text-right`}>USD</th>
                        </>
                      ) : null}
                      <th className={`${thCls} w-12`} aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {draft ? (
                      <tr className="bg-ravn-subtle/40">
                        <td className={tdCls}>
                          <label className={labelCls}>Fecha</label>
                          <input
                            type="date"
                            value={draft.fecha}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, fecha: e.target.value } : d
                              )
                            }
                            className={inputCls}
                          />
                        </td>
                        <td className={tdCls}>
                          <label className={labelCls}>Rubro</label>
                          <select
                            value={draft.rubro_id}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, rubro_id: e.target.value } : d
                              )
                            }
                            className={inputCls}
                          >
                            <option value="">—</option>
                            {rubrosOrdenados.map((r) => (
                              <option key={String(r.id)} value={String(r.id)}>
                                {formatRubroName(r.nombre)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={tdCls}>
                          <label className={labelCls}>
                            Descripción del gasto
                          </label>
                          <input
                            type="text"
                            value={draft.descripcion}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, descripcion: e.target.value } : d
                              )
                            }
                            placeholder="Ej. Ticket Corralón San Martín"
                            className={inputCls}
                          />
                        </td>
                        <td className={tdCls}>
                          <label className={labelCls}>Importe (ARS)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            data-no-spinner
                            value={draft.importeStr}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, importeStr: e.target.value } : d
                              )
                            }
                            placeholder="0,00"
                            className={`${inputCls} text-right tabular-nums`}
                          />
                        </td>
                        {esPresupuestoUsd ? (
                          <>
                            <td
                              className={`${tdCls} text-right text-xs tabular-nums text-ravn-muted`}
                            >
                              {ventaEfectivaParaGastos > 0
                                ? formatNumber(ventaEfectivaParaGastos, 2)
                                : "—"}
                            </td>
                            <td
                              className={`${tdCls} text-right text-xs tabular-nums text-ravn-fg`}
                            >
                              {ventaEfectivaParaGastos > 0 &&
                              parseFormattedNumber(draft.importeStr) > 0
                                ? formatMoneyMoneda(
                                    roundArs2(
                                      parseFormattedNumber(draft.importeStr) /
                                        ventaEfectivaParaGastos
                                    ),
                                    "USD"
                                  )
                                : "—"}
                            </td>
                          </>
                        ) : null}
                        <td className={tdCls}>
                          <div className="flex flex-col gap-2 pt-5">
                            <button
                              type="button"
                              onClick={() => void guardarDraft()}
                              disabled={savingDraft}
                              className="rounded-none bg-ravn-accent px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ravn-accent-contrast hover:opacity-90 disabled:opacity-40"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDraft(null);
                                setError(null);
                              }}
                              className="text-[10px] font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 hover:underline"
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {gastos.length === 0 && !draft ? (
                      <tr>
                        <td
                          colSpan={esPresupuestoUsd ? 7 : 5}
                          className="px-4 py-10 text-center text-sm text-ravn-muted"
                        >
                          No hay gastos cargados. Usá{" "}
                          <span className="text-ravn-fg">+ NUEVO GASTO</span>.
                        </td>
                      </tr>
                    ) : null}
                    {gastos.map((g) => {
                      const rid = g.rubro_id != null ? String(g.rubro_id) : "";
                      const rubLabel =
                        rid && nombrePorRubroId.has(rid)
                          ? nombrePorRubroId.get(rid)!
                          : "—";
                      const imp = Number(g.importe) || 0;
                      const cotG =
                        Number(g.cotizacion_venta_ars_por_usd) ||
                        cotProp ||
                        ventaEfectivaParaGastos;
                      const usdG =
                        cotG > 0 ? roundArs2(imp / cotG) : 0;
                      const busy = deletingId === g.id;
                      return (
                        <tr key={g.id}>
                          <td className={`${tdCls} tabular-nums text-ravn-fg`}>
                            {fechaIsoToDisplay(String(g.fecha))}
                          </td>
                          <td className={`${tdCls} text-ravn-fg`}>
                            {rubLabel}
                          </td>
                          <td className={`${tdCls} text-ravn-fg`}>
                            {g.descripcion?.trim() || "—"}
                          </td>
                          <td
                            className={`${tdCls} text-right font-medium tabular-nums text-ravn-fg`}
                          >
                            {formatMoney(imp)}
                          </td>
                          {esPresupuestoUsd ? (
                            <>
                              <td
                                className={`${tdCls} text-right tabular-nums text-ravn-muted`}
                              >
                                {cotG > 0 ? formatNumber(cotG, 2) : "—"}
                              </td>
                              <td
                                className={`${tdCls} text-right font-medium tabular-nums text-ravn-fg`}
                              >
                                {formatMoneyMoneda(usdG, "USD")}
                              </td>
                            </>
                          ) : null}
                          <td className={tdCls}>
                            <button
                              type="button"
                              aria-label="Eliminar gasto"
                              disabled={busy}
                              onClick={() => void eliminarGasto(g.id)}
                              className="rounded-none border border-transparent p-2 text-ravn-muted transition-colors hover:border-ravn-line hover:text-ravn-fg disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {gastos.length > 0 ? (
                <div className="mt-6 space-y-1 text-right text-sm text-ravn-muted">
                  <p>
                    Total gastos (ARS):{" "}
                    <span className="font-medium tabular-nums text-ravn-fg">
                      {formatMoney(totalGastado)}
                    </span>
                  </p>
                  {esPresupuestoUsd ? (
                    <p>
                      Total gastos (USD):{" "}
                      <span className="font-medium tabular-nums text-ravn-fg">
                        {formatMoneyMoneda(totalGastadoUsd, "USD")}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

