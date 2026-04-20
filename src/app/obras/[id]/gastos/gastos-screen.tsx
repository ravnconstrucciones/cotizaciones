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
import { estadoDesdeTipo } from "@/lib/cashflow-matching";
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
  /** Egreso en `cashflow_items` creado al guardar (mismo movimiento en Caja). */
  cashflow_item_id?: string | null;
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

/** Movimiento de Caja con monto/fecha real, misma obra. */
type MovimientoCajaObra = {
  id: string;
  tipo: "ingreso" | "egreso";
  categoria: string;
  descripcion: string;
  monto_real: number;
  fecha_real: string;
};

type FilaRegistroObra =
  | { kind: "gasto"; fecha: string; gasto: GastoDbRow }
  | { kind: "caja"; fecha: string; mov: MovimientoCajaObra };

function etiquetaCategoriaCashflow(cat: string): string {
  const m: Record<string, string> = {
    anticipo: "Anticipo",
    cuota_avance: "Cuota / avance",
    material: "Material",
    mano_de_obra: "Mano de obra",
    subcontrato: "Subcontrato",
    gasto_fijo: "Gasto fijo",
    otro: "Otro",
  };
  return m[cat] ?? cat;
}

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
  nombre_obra: string | null;
  nombre_cliente: string | null;
  fecha: string | null;
};

function etiquetaObraVisible(
  nombreObra: string | null | undefined,
  nombreCliente: string | null | undefined
): string {
  const t = nombreObra?.trim();
  if (t) return t;
  return nombreCliente?.trim() || "Sin nombre";
}

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
  const [nombreObra, setNombreObra] = useState<string | null>(null);
  const [pdfGenerado, setPdfGenerado] = useState<boolean | null>(null);
  const [correlativo, setCorrelativo] = useState<number>(0);
  const [costoDirecto, setCostoDirecto] = useState(0);
  const [margenEsperado, setMargenEsperado] = useState(0);
  const [gastos, setGastos] = useState<GastoDbRow[]>([]);
  const [rubros, setRubros] = useState<RubroRow[]>([]);
  const [draft, setDraft] = useState<DraftGasto | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Soft-delete de `cashflow_items` desde fila solo-Caja del registro. */
  const [deletingCashflowId, setDeletingCashflowId] = useState<string | null>(
    null
  );
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
  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCajaObra[]>(
    []
  );

  /** IDs de Caja ya representados por una fila de esta tabla (no duplicar fila ni suma). */
  const cashflowIdsVinculadosGastoTabla = useMemo(() => {
    const s = new Set<string>();
    for (const g of gastos) {
      const cid = g.cashflow_item_id;
      if (cid) s.add(String(cid));
    }
    return s;
  }, [gastos]);

  /** Movimientos de Caja cargados solo en libreta (no generados desde + Nuevo gasto). */
  const movimientosCajaSoloLibreta = useMemo(
    () =>
      movimientosCaja.filter((m) => !cashflowIdsVinculadosGastoTabla.has(m.id)),
    [movimientosCaja, cashflowIdsVinculadosGastoTabla]
  );

  const egresosCajaArs = useMemo(() => {
    let s = 0;
    for (const m of movimientosCajaSoloLibreta) {
      if (m.tipo === "egreso") s += m.monto_real;
    }
    return roundArs2(s);
  }, [movimientosCajaSoloLibreta]);

  const ingresosCajaArs = useMemo(() => {
    let s = 0;
    for (const m of movimientosCaja) {
      if (m.tipo === "ingreso") s += m.monto_real;
    }
    return roundArs2(s);
  }, [movimientosCaja]);

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

  const totalTablaGastosArs = useMemo(
    () =>
      roundArs2(
        gastos.reduce(
          (acc, g) => acc + (Number(g.importe) || 0),
          0
        )
      ),
    [gastos]
  );

  const totalGastado = useMemo(
    () => roundArs2(totalTablaGastosArs + egresosCajaArs),
    [totalTablaGastosArs, egresosCajaArs]
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

  const filasRegistroObra = useMemo((): FilaRegistroObra[] => {
    const out: FilaRegistroObra[] = [];
    for (const g of gastos) {
      out.push({
        kind: "gasto",
        fecha: String(g.fecha).trim().slice(0, 10),
        gasto: g,
      });
    }
    for (const m of movimientosCajaSoloLibreta) {
      out.push({
        kind: "caja",
        fecha: String(m.fecha_real).trim().slice(0, 10),
        mov: m,
      });
    }
    out.sort((a, b) => {
      const cmp = b.fecha.localeCompare(a.fecha);
      if (cmp !== 0) return cmp;
      return 0;
    });
    return out;
  }, [gastos, movimientosCajaSoloLibreta]);

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
    const cotCaja =
      cotProp > 0 ? cotProp : ventaEfectivaParaGastos > 0 ? ventaEfectivaParaGastos : 0;
    if (cotCaja > 0 && egresosCajaArs > 0) {
      s += egresosCajaArs / cotCaja;
    }
    return roundArs2(s);
  }, [
    esPresupuestoUsd,
    gastos,
    cotProp,
    ventaEfectivaParaGastos,
    egresosCajaArs,
  ]);

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
            "nombre_obra, nombre_cliente, pdf_generado, propuesta_comercial_pref, presupuesto_aprobado"
          )
          .eq("id", pid)
          .single(),
        resolveNumeroComercial(supabase, pid),
      ]);

      const { data: pres, error: errP } = presRes;
      setCorrelativo(num);

      if (errP || !pres) {
        setError(errP?.message ?? "Presupuesto no encontrado.");
        setNombreCliente("");
        setNombreObra(null);
        setLoading(false);
        return;
      }

      setNombreCliente(String(pres.nombre_cliente ?? ""));
      const no = (pres as { nombre_obra?: string | null }).nombre_obra;
      setNombreObra(
        no != null && String(no).trim() !== "" ? String(no).trim() : null
      );
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
        setMovimientosCaja([]);
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
      const oid =
        !errObra && obraData && (obraData as { id?: string }).id
          ? String((obraData as { id: string }).id)
          : null;
      if (oid) {
        setObraCashflowId(oid);
        const { data: cfRows, error: errCf } = await supabase
          .from("cashflow_items")
          .select("id, tipo, categoria, descripcion, monto_real, fecha_real")
          .eq("obra_id", oid)
          .is("deleted_at", null)
          .not("monto_real", "is", null)
          .not("fecha_real", "is", null);
        const movs: MovimientoCajaObra[] = [];
        if (!errCf && cfRows) {
          for (const raw of cfRows as Record<string, unknown>[]) {
            const tipo = raw.tipo === "ingreso" ? "ingreso" : "egreso";
            const m = roundArs2(Number(raw.monto_real) || 0);
            const id = String(raw.id ?? "");
            const fechaReal = String(raw.fecha_real ?? "").slice(0, 10);
            const cat = String(raw.categoria ?? "otro");
            const desc = String(raw.descripcion ?? "");
            movs.push({
              id,
              tipo,
              categoria: cat,
              descripcion: desc,
              monto_real: m,
              fecha_real: fechaReal,
            });
          }
          movs.sort((a, b) => b.fecha_real.localeCompare(a.fecha_real));
        }
        setMovimientosCaja(movs);
      } else {
        setObraCashflowId(null);
        setMovimientosCaja([]);
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
          .select("id, nombre_obra, nombre_cliente, fecha")
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
              nombre_obra:
                (r as { nombre_obra?: string | null }).nombre_obra ?? null,
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
      const descripcion = draft.descripcion.trim();
      let cashflowItemId: string | null = null;

      if (obraCashflowId) {
        const { data: cfIns, error: errCf } = await supabase
          .from("cashflow_items")
          .insert({
            obra_id: obraCashflowId,
            tipo: "egreso",
            categoria: "otro",
            descripcion: descripcion || "Gasto de obra",
            monto_proyectado: importe,
            fecha_proyectada: draft.fecha,
            monto_real: importe,
            fecha_real: draft.fecha,
            estado: estadoDesdeTipo("egreso"),
            notas: "RAVN_GASTO_OBRA",
          })
          .select("id")
          .single();

        if (errCf) {
          setError(errCf.message);
          setSavingDraft(false);
          return;
        }
        if (cfIns && typeof (cfIns as { id?: unknown }).id !== "undefined") {
          cashflowItemId = String((cfIns as { id: string }).id);
        }
      }

      const insertPayload: Record<string, unknown> = {
        presupuesto_id: pid,
        fecha: draft.fecha,
        rubro_id: draft.rubro_id.trim() || null,
        descripcion,
        importe,
      };
      if (esPresupuestoUsd) {
        insertPayload.cotizacion_venta_ars_por_usd = ventaEfectivaParaGastos;
        insertPayload.casa_dolar = casaDolar;
      }
      if (cashflowItemId) {
        insertPayload.cashflow_item_id = cashflowItemId;
      }

      const { error: err } = await supabase
        .from("presupuestos_gastos")
        .insert(insertPayload);

      if (err) {
        if (cashflowItemId) {
          await supabase.from("cashflow_items").delete().eq("id", cashflowItemId);
        }
        setError(
          err.message.includes("cashflow_item_id")
            ? `${err.message} Ejecutá en Supabase la migración que agrega presupuestos_gastos.cashflow_item_id.`
            : err.message
        );
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
    if (
      !window.confirm(
        "¿Eliminar este gasto? Si tiene egreso vinculado en Caja, también se anulará allí."
      )
    )
      return;
    setDeletingId(id);
    setError(null);
    try {
      const supabase = createClient();
      const { data: rowAdj, error: errSel } = await supabase
        .from("presupuestos_gastos")
        .select("adjunto_path, cashflow_item_id")
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
      const cfId =
        rowAdj &&
        typeof (rowAdj as { cashflow_item_id?: unknown }).cashflow_item_id ===
          "string" &&
        String((rowAdj as { cashflow_item_id: string }).cashflow_item_id).trim() !== ""
          ? String((rowAdj as { cashflow_item_id: string }).cashflow_item_id)
          : null;

      if (cfId) {
        const { error: errAn } = await supabase
          .from("cashflow_items")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", cfId)
          .is("deleted_at", null);
        if (errAn) {
          setError(errAn.message);
          setDeletingId(null);
          return;
        }
      }

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

  async function eliminarMovimientoCajaSoloLibreta(cashflowItemId: string) {
    if (
      !window.confirm(
        "¿Anular este movimiento en Caja? Se quitará de este registro y quedará anulado en Caja (mismo efecto que anular en el módulo de Caja)."
      )
    )
      return;
    setDeletingCashflowId(cashflowItemId);
    setError(null);
    try {
      const res = await fetch(
        `/cashflow/item/${encodeURIComponent(cashflowItemId)}`,
        { method: "DELETE" }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "No se pudo anular el movimiento.");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setDeletingCashflowId(null);
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
                      {etiquetaObraVisible(o.nombre_obra, o.nombre_cliente) +
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
              {nombreCliente || nombreObra ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-ravn-fg">
                    {etiquetaObraVisible(nombreObra, nombreCliente)}
                  </span>
                </>
              ) : null}
            </p>
            {nombreObra ? (
              <p className="mt-1 max-w-3xl text-xs text-ravn-muted">
                Cliente: {nombreCliente || "—"}
              </p>
            ) : null}
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
              {nombreCliente || nombreObra ? (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-ravn-fg">
                    {etiquetaObraVisible(nombreObra, nombreCliente)}
                  </span>
                </>
              ) : null}
            </p>
            {nombreObra ? (
              <p className="mt-1 max-w-3xl text-xs text-ravn-muted">
                Cliente: {nombreCliente || "—"}
              </p>
            ) : null}
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
                    En{" "}
                    <Link
                      href="/cashflow"
                      className="text-ravn-fg underline underline-offset-2"
                    >
                      Caja / tesorería
                    </Link>{" "}
                    cargá ingresos o egresos de esta obra (manual, foto o audio).
                    Con monto y fecha reales aparecen acá; los{" "}
                    <span className="text-ravn-fg">egresos</span> suman al total
                    ejecutado de arriba. Los{" "}
                    <span className="text-ravn-fg">ingresos</span> se listan pero
                    no son gasto.
                  </p>
                  <p className="mt-2 max-w-2xl text-[10px] leading-relaxed text-ravn-muted">
                    Cada gasto que guardás con{" "}
                    <span className="text-ravn-fg">+ NUEVO GASTO</span> genera
                    también un egreso en Caja para esta obra (mismo importe y
                    fecha). Los ingresos y egresos cargados solo en Caja aparecen
                    como filas &quot;Caja&quot;. Para editar esos movimientos usá
                    el enlace de la última columna.
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
                    {gastos.length === 0 &&
                    movimientosCajaSoloLibreta.length === 0 &&
                    !draft ? (
                      <tr>
                        <td
                          colSpan={esPresupuestoUsd ? 7 : 5}
                          className="px-4 py-10 text-center text-sm text-ravn-muted"
                        >
                          No hay filas todavía. Cargá un gasto con{" "}
                          <span className="text-ravn-fg">+ NUEVO GASTO</span> o
                          registrá movimientos en{" "}
                          <Link
                            href="/cashflow"
                            className="text-ravn-fg underline underline-offset-2"
                          >
                            Caja
                          </Link>{" "}
                          para esta obra.
                        </td>
                      </tr>
                    ) : null}
                    {filasRegistroObra.map((fila) => {
                      if (fila.kind === "gasto") {
                        const g = fila.gasto;
                        const rid =
                          g.rubro_id != null ? String(g.rubro_id) : "";
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
                          <tr key={`gasto-${g.id}`}>
                            <td
                              className={`${tdCls} tabular-nums text-ravn-fg`}
                            >
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
                                <Trash2
                                  className="h-4 w-4"
                                  strokeWidth={1.5}
                                />
                              </button>
                            </td>
                          </tr>
                        );
                      }
                      const m = fila.mov;
                      const cotCaja =
                        cotProp > 0
                          ? cotProp
                          : ventaEfectivaParaGastos > 0
                            ? ventaEfectivaParaGastos
                            : 0;
                      const usdMov =
                        cotCaja > 0
                          ? roundArs2(m.monto_real / cotCaja)
                          : 0;
                      const busyCaja = deletingCashflowId === m.id;
                      const rubCaja = `Caja · ${
                        m.tipo === "ingreso" ? "Ingreso" : "Egreso"
                      } · ${etiquetaCategoriaCashflow(m.categoria)}`;
                      return (
                        <tr
                          key={`caja-${m.id}`}
                          className="bg-ravn-subtle/25 dark:bg-ravn-subtle/15"
                        >
                          <td
                            className={`${tdCls} tabular-nums text-ravn-fg`}
                          >
                            {fechaIsoToDisplay(m.fecha_real)}
                          </td>
                          <td className={`${tdCls} text-ravn-fg`}>
                            {rubCaja}
                          </td>
                          <td className={`${tdCls} text-ravn-fg`}>
                            {m.descripcion?.trim() || "—"}
                          </td>
                          <td
                            className={`${tdCls} text-right font-medium tabular-nums ${
                              m.tipo === "ingreso"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-ravn-fg"
                            }`}
                          >
                            {m.tipo === "ingreso" ? "+" : ""}
                            {formatMoney(m.monto_real)}
                          </td>
                          {esPresupuestoUsd ? (
                            <>
                              <td
                                className={`${tdCls} text-right tabular-nums text-ravn-muted`}
                              >
                                {cotCaja > 0 ? formatNumber(cotCaja, 2) : "—"}
                              </td>
                              <td
                                className={`${tdCls} text-right font-medium tabular-nums ${
                                  m.tipo === "ingreso"
                                    ? "text-emerald-700 dark:text-emerald-300"
                                    : "text-ravn-fg"
                                }`}
                              >
                                {m.tipo === "ingreso" ? "+" : ""}
                                {formatMoneyMoneda(usdMov, "USD")}
                              </td>
                            </>
                          ) : null}
                          <td className={tdCls}>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                aria-label="Anular movimiento en Caja"
                                disabled={busyCaja}
                                onClick={() =>
                                  void eliminarMovimientoCajaSoloLibreta(m.id)
                                }
                                className="rounded-none border border-transparent p-2 text-ravn-muted transition-colors hover:border-ravn-line hover:text-ravn-fg disabled:opacity-40"
                              >
                                <Trash2
                                  className="h-4 w-4"
                                  strokeWidth={1.5}
                                />
                              </button>
                              {obraCashflowId ? (
                                <Link
                                  href={`/cashflow/obra/${encodeURIComponent(obraCashflowId)}`}
                                  className="text-[10px] font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 hover:text-ravn-fg hover:underline"
                                >
                                  Caja
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {gastos.length > 0 ||
              egresosCajaArs > 0 ||
              ingresosCajaArs > 0 ? (
                <div className="mt-6 space-y-1 text-right text-sm text-ravn-muted">
                  {gastos.length > 0 ? (
                    <p>
                      Suma tabla (ARS):{" "}
                      <span className="font-medium tabular-nums text-ravn-fg">
                        {formatMoney(totalTablaGastosArs)}
                      </span>
                    </p>
                  ) : null}
                  {egresosCajaArs > 0 ? (
                    <p>
                      Egresos Caja ya registrados (ARS):{" "}
                      <span className="font-medium tabular-nums text-ravn-fg">
                        {formatMoney(egresosCajaArs)}
                      </span>
                    </p>
                  ) : null}
                  {ingresosCajaArs > 0 ? (
                    <p>
                      Ingresos Caja registrados (ARS):{" "}
                      <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                        +{formatMoney(ingresosCajaArs)}
                      </span>
                    </p>
                  ) : null}
                  <p>
                    Total ejecutado (ARS):{" "}
                    <span className="font-medium tabular-nums text-ravn-fg">
                      {formatMoney(totalGastado)}
                    </span>
                  </p>
                  {esPresupuestoUsd ? (
                    <p>
                      Total ejecutado (USD):{" "}
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

