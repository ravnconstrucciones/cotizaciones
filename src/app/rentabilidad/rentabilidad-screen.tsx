"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RavnLogo } from "@/components/ravn-logo";
import { createClient } from "@/lib/supabase/client";
import {
  CRONISTA_DOLAR_URL,
  etiquetaCasaDolar,
} from "@/lib/cotizacion-labels";
import {
  formatArsEnteroDesdeDigitos,
  formatMoney,
  formatMoneyInt,
  formatMoneyMoneda,
  formatMoneyUsdInt,
  formatNumber,
  parseFormattedNumber,
  roundArs2,
} from "@/lib/format-currency";
import {
  aplicarBonificacionSobrePrecio,
  margenSobreVentaPct,
  precioObjetivoPorRemarqueSobreCosto,
} from "@/lib/precio-por-margen-neto";
import { redondearArsAlMilSuperior } from "@/lib/round-precio-comercial";
import { fetchCostoDirectoPresupuesto } from "@/lib/presupuesto-costos-directos";
import {
  buildRentabilidadInputsPayload,
  parseRentabilidadInputsJson,
  saveRentabilidadInputsToDb,
} from "@/lib/ravn-rentabilidad-inputs";
import {
  ajustarPropuestaPrefAlImporteMostradoArs,
  construirPrefTemporalParaAjusteImporte,
  savePropuestaPrefToDb,
  type PropuestaPrefV1,
} from "@/lib/ravn-propuesta-pref";

type CotizacionItem = {
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion?: string;
};

type CotizacionesResponse = {
  cronistaUrl: string;
  referencia?: string;
  cotizaciones: CotizacionItem[];
};

const labelCls =
  "mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted";
const inputCls =
  "w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg placeholder:text-ravn-muted focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg";
const sectionCls =
  "rounded-none border border-ravn-line bg-ravn-surface p-6 md:p-8";

function formatFechaCotizacion(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Misma tabla y columnas que `nuevo-presupuesto` / `propuesta`. */
async function fetchTotalesDesdePresupuesto(presupuestoId: string): Promise<{
  material: number;
  mo: number;
}> {
  const supabase = createClient();
  const { material, mo } = await fetchCostoDirectoPresupuesto(
    supabase,
    presupuestoId
  );
  return { material, mo };
}

export function RentabilidadScreen({
  presupuestoIdInicial,
}: {
  presupuestoIdInicial: string | null;
}) {
  const router = useRouter();
  const [guardandoPrefEnNube, setGuardandoPrefEnNube] = useState(false);
  const [errorGuardarPref, setErrorGuardarPref] = useState<string | null>(null);

  const [cargandoPresupuesto, setCargandoPresupuesto] = useState(
    !!presupuestoIdInicial
  );
  const [errorPresupuesto, setErrorPresupuesto] = useState<string | null>(null);

  const [costoMaterialStr, setCostoMaterialStr] = useState("");
  const [costoMoStr, setCostoMoStr] = useState("");
  const [remarqueMaterialPctStr, setRemarqueMaterialPctStr] = useState("0");
  const [remarqueMoPctStr, setRemarqueMoPctStr] = useState("0");
  const [cargosAdicionalesStr, setCargosAdicionalesStr] = useState("");
  const [costosInternosStr, setCostosInternosStr] = useState("");
  const [contingenciaPctStr, setContingenciaPctStr] = useState("0");
  const [bonificacionComercialPctStr, setBonificacionComercialPctStr] =
    useState("0");
  const [mostrarIva, setMostrarIva] = useState(true);
  /** Precio obra sin IVA distinto al redondeo automático desde ítems (cierre manual del importe). */
  const [precioObraManual, setPrecioObraManual] = useState<number | null>(null);
  const [importePropuestaDraft, setImportePropuestaDraft] = useState("");
  const importeDraftSincronizadoManualRef = useRef(false);

  const [cotizaciones, setCotizaciones] = useState<CotizacionItem[]>([]);
  const [casaDolar, setCasaDolar] = useState<string>("oficial");
  const [cotizError, setCotizError] = useState<string | null>(null);
  const [cotizLoading, setCotizLoading] = useState(true);
  const [cotizacionManualStr, setCotizacionManualStr] = useState("");
  const [monedaPresentacion, setMonedaPresentacion] = useState<"ARS" | "USD">(
    "ARS"
  );
  const [presupuestoAprobadoParaGastos, setPresupuestoAprobadoParaGastos] =
    useState(false);
  const [rentabilidadInputsCargados, setRentabilidadInputsCargados] =
    useState(false);
  const [errorPersistirInputs, setErrorPersistirInputs] = useState<string | null>(
    null
  );

  const loadCotizaciones = useCallback(async () => {
    setCotizLoading(true);
    setCotizError(null);
    try {
      const base =
        typeof window !== "undefined"
          ? window.location.origin
          : "";
      const url = base ? `${base}/api/cotizaciones` : "/api/cotizaciones";
      const res = await fetch(url, { cache: "no-store" });
      let body: CotizacionesResponse & { error?: string; fuente?: string };
      try {
        body = (await res.json()) as CotizacionesResponse & {
          error?: string;
          fuente?: string;
        };
      } catch {
        setCotizError("No se pudo leer la respuesta del servidor.");
        setCotizaciones([]);
        return;
      }
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
            "Sin cotizaciones automáticas. Ingresá la cotización venta (ARS por US$ 1) a mano."
        );
      }
    } catch {
      setCotizError(
        "No se pudo conectar con el servidor. Revisá tu conexión o cargá la cotización a mano."
      );
      setCotizaciones([]);
    } finally {
      setCotizLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCotizaciones();
  }, [loadCotizaciones]);

  useEffect(() => {
    if (!presupuestoIdInicial) {
      setCargandoPresupuesto(false);
      setRentabilidadInputsCargados(true);
      return;
    }
    let cancelled = false;
    setRentabilidadInputsCargados(false);
    (async () => {
      try {
        const supabase = createClient();
        const [totales, presRes] = await Promise.all([
          fetchTotalesDesdePresupuesto(presupuestoIdInicial),
          supabase
            .from("presupuestos")
            .select("presupuesto_aprobado, rentabilidad_inputs")
            .eq("id", presupuestoIdInicial)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        const { material, mo } = totales;
        const matDesdeItems = formatNumber(material, 2);
        const moDesdeItems = formatNumber(mo, 2);
        setErrorPresupuesto(null);

        function aplicarCostosBase(
          ri: ReturnType<typeof parseRentabilidadInputsJson>
        ) {
          if (ri && ri.costoMaterialStr.trim() !== "") {
            setCostoMaterialStr(ri.costoMaterialStr);
          } else {
            setCostoMaterialStr(matDesdeItems);
          }
          if (ri && ri.costoMoStr.trim() !== "") {
            setCostoMoStr(ri.costoMoStr);
          } else {
            setCostoMoStr(moDesdeItems);
          }
        }

        if (presRes.error) {
          const msg = presRes.error.message ?? "";
          if (msg.includes("rentabilidad_inputs")) {
            setErrorPresupuesto(
              "Falta la columna rentabilidad_inputs en Supabase. Ejecutá la migración `20260403010000_presupuestos_rentabilidad_inputs.sql`."
            );
          } else {
            setErrorPresupuesto(msg);
          }
          setPresupuestoAprobadoParaGastos(false);
          aplicarCostosBase(null);
        } else if (presRes.data) {
          const row = presRes.data as {
            presupuesto_aprobado?: boolean;
            rentabilidad_inputs?: unknown;
          };
          setPresupuestoAprobadoParaGastos(
            Boolean(row.presupuesto_aprobado)
          );
          const ri = parseRentabilidadInputsJson(
            row.rentabilidad_inputs,
            presupuestoIdInicial
          );
          aplicarCostosBase(ri);
          if (ri) {
            setRemarqueMaterialPctStr(ri.remarqueMaterialPctStr);
            setRemarqueMoPctStr(ri.remarqueMoPctStr);
            setCargosAdicionalesStr(ri.cargosAdicionalesStr);
            setCostosInternosStr(ri.costosInternosStr);
            setContingenciaPctStr(ri.contingenciaPctStr);
            setBonificacionComercialPctStr(ri.bonificacionComercialPctStr);
            setMostrarIva(ri.mostrarIva);
            setMonedaPresentacion(ri.monedaPresentacion);
            setCotizacionManualStr(ri.cotizacionManualStr);
            setCasaDolar(ri.casaDolar);
            setPrecioObraManual(ri.precioObraManual);
          }
        } else {
          setPresupuestoAprobadoParaGastos(false);
          aplicarCostosBase(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErrorPresupuesto(
            e instanceof Error ? e.message : "No se pudo leer el presupuesto."
          );
        }
      } finally {
        if (!cancelled) {
          setCargandoPresupuesto(false);
          setRentabilidadInputsCargados(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presupuestoIdInicial]);

  useEffect(() => {
    if (!presupuestoIdInicial || !rentabilidadInputsCargados) return;
    if (cargandoPresupuesto) return;

    const t = window.setTimeout(() => {
      void (async () => {
        const payload = buildRentabilidadInputsPayload({
          presupuestoId: presupuestoIdInicial,
          costoMaterialStr,
          costoMoStr,
          remarqueMaterialPctStr,
          remarqueMoPctStr,
          cargosAdicionalesStr,
          costosInternosStr,
          contingenciaPctStr,
          bonificacionComercialPctStr,
          mostrarIva,
          monedaPresentacion,
          cotizacionManualStr,
          casaDolar,
          precioObraManual,
        });
        const supabase = createClient();
        const err = await saveRentabilidadInputsToDb(supabase, payload);
        if (err) {
          if (err.includes("rentabilidad_inputs")) {
            setErrorPersistirInputs(
              "No se pudo guardar el formulario: falta la columna rentabilidad_inputs en Supabase."
            );
          } else {
            setErrorPersistirInputs(err);
          }
        } else {
          setErrorPersistirInputs(null);
        }
      })();
    }, 700);

    return () => window.clearTimeout(t);
  }, [
    presupuestoIdInicial,
    rentabilidadInputsCargados,
    cargandoPresupuesto,
    costoMaterialStr,
    costoMoStr,
    remarqueMaterialPctStr,
    remarqueMoPctStr,
    cargosAdicionalesStr,
    costosInternosStr,
    contingenciaPctStr,
    bonificacionComercialPctStr,
    mostrarIva,
    monedaPresentacion,
    cotizacionManualStr,
    casaDolar,
    precioObraManual,
  ]);

  const costoMaterial = useMemo(
    () => roundArs2(parseFormattedNumber(costoMaterialStr)),
    [costoMaterialStr]
  );
  const costoMo = useMemo(
    () => roundArs2(parseFormattedNumber(costoMoStr)),
    [costoMoStr]
  );
  const remarqueMaterialPct = useMemo(() => {
    const n = parseFormattedNumber(remarqueMaterialPctStr.replace("%", ""));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [remarqueMaterialPctStr]);
  const remarqueMoPct = useMemo(() => {
    const n = parseFormattedNumber(remarqueMoPctStr.replace("%", ""));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [remarqueMoPctStr]);
  const cargosAdicionales = useMemo(
    () => roundArs2(parseFormattedNumber(cargosAdicionalesStr)),
    [cargosAdicionalesStr]
  );
  const costosInternos = useMemo(
    () => roundArs2(parseFormattedNumber(costosInternosStr)),
    [costosInternosStr]
  );
  const contingenciaPct = useMemo(() => {
    const n = parseFormattedNumber(contingenciaPctStr.replace("%", ""));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [contingenciaPctStr]);
  const bonificacionComercialPct = useMemo(() => {
    const n = parseFormattedNumber(
      bonificacionComercialPctStr.replace("%", "")
    );
    if (!Number.isFinite(n)) return 0;
    return Math.min(Math.max(n, 0), 100);
  }, [bonificacionComercialPctStr]);

  const costoDirecto = useMemo(
    () => roundArs2(costoMaterial + costoMo),
    [costoMaterial, costoMo]
  );

  const precioObjetivoMaterial = useMemo(
    () =>
      precioObjetivoPorRemarqueSobreCosto(costoMaterial, remarqueMaterialPct),
    [costoMaterial, remarqueMaterialPct]
  );
  const precioObjetivoMo = useMemo(
    () => precioObjetivoPorRemarqueSobreCosto(costoMo, remarqueMoPct),
    [costoMo, remarqueMoPct]
  );

  const margenSobreVentaMaterialSinBonif = useMemo(
    () => margenSobreVentaPct(costoMaterial, precioObjetivoMaterial),
    [costoMaterial, precioObjetivoMaterial]
  );
  const margenSobreVentaMoSinBonif = useMemo(
    () => margenSobreVentaPct(costoMo, precioObjetivoMo),
    [costoMo, precioObjetivoMo]
  );
  const ventaMaterial = useMemo(
    () =>
      aplicarBonificacionSobrePrecio(
        precioObjetivoMaterial,
        bonificacionComercialPct
      ),
    [precioObjetivoMaterial, bonificacionComercialPct]
  );
  const ventaMo = useMemo(
    () =>
      aplicarBonificacionSobrePrecio(precioObjetivoMo, bonificacionComercialPct),
    [precioObjetivoMo, bonificacionComercialPct]
  );

  const ventaFinalTotalMatMo = useMemo(
    () => roundArs2(ventaMaterial + ventaMo),
    [ventaMaterial, ventaMo]
  );
  const gananciaNetaSobreMatMo = useMemo(
    () => roundArs2(ventaFinalTotalMatMo - costoDirecto),
    [ventaFinalTotalMatMo, costoDirecto]
  );
  const margenNetoRealPct = useMemo(() => {
    if (ventaFinalTotalMatMo <= 0) return 0;
    return roundArs2((gananciaNetaSobreMatMo / ventaFinalTotalMatMo) * 100);
  }, [ventaFinalTotalMatMo, gananciaNetaSobreMatMo]);

  const margenSobreVentaMaterialFinal = useMemo(
    () => margenSobreVentaPct(costoMaterial, ventaMaterial),
    [costoMaterial, ventaMaterial]
  );
  const margenSobreVentaMoFinal = useMemo(
    () => margenSobreVentaPct(costoMo, ventaMo),
    [costoMo, ventaMo]
  );

  const contingenciaMonto = useMemo(
    () => roundArs2(costoDirecto * (contingenciaPct / 100)),
    [costoDirecto, contingenciaPct]
  );

  const precioObraSinIva = useMemo(
    () =>
      roundArs2(
        ventaMaterial + ventaMo + cargosAdicionales + contingenciaMonto
      ),
    [ventaMaterial, ventaMo, cargosAdicionales, contingenciaMonto]
  );

  /** Precio sin IVA según solo ítems, cargos y contingencia (sin cierre manual). */
  const precioSinIvaCalculado = useMemo(
    () => redondearArsAlMilSuperior(precioObraSinIva),
    [precioObraSinIva]
  );

  const precioSinIvaRedondeado = useMemo(
    () =>
      precioObraManual != null
        ? roundArs2(precioObraManual)
        : precioSinIvaCalculado,
    [precioObraManual, precioSinIvaCalculado]
  );

  /** IVA 21% exacto sobre el precio sin IVA ya redondeado (sin redondeo “comercial”). */
  const ivaSobreRedondeado = useMemo(
    () =>
      mostrarIva ? roundArs2(precioSinIvaRedondeado * 0.21) : 0,
    [mostrarIva, precioSinIvaRedondeado]
  );

  const precioConIvaFinal = useMemo(
    () => roundArs2(precioSinIvaRedondeado + ivaSobreRedondeado),
    [precioSinIvaRedondeado, ivaSobreRedondeado]
  );

  const margenMaterialesArs = useMemo(
    () => roundArs2(ventaMaterial - costoMaterial),
    [ventaMaterial, costoMaterial]
  );
  const margenMoArs = useMemo(
    () => roundArs2(ventaMo - costoMo),
    [ventaMo, costoMo]
  );

  /** Precio de venta (redondeado) menos costo directo. */
  const contribucionSobreCostoDirecto = useMemo(
    () => roundArs2(precioSinIvaRedondeado - costoDirecto),
    [precioSinIvaRedondeado, costoDirecto]
  );

  const utilidadNetaEstimada = useMemo(
    () => roundArs2(contribucionSobreCostoDirecto - costosInternos),
    [contribucionSobreCostoDirecto, costosInternos]
  );

  const margenSobrePrecioObraCompletoPct = useMemo(() => {
    if (precioSinIvaRedondeado <= 0) return 0;
    return roundArs2((utilidadNetaEstimada / precioSinIvaRedondeado) * 100);
  }, [precioSinIvaRedondeado, utilidadNetaEstimada]);

  const cotizacionSeleccionada = useMemo(
    () => cotizaciones.find((c) => c.casa === casaDolar) ?? null,
    [cotizaciones, casaDolar]
  );

  const ventaDolarEfectiva = useMemo(() => {
    const manual = roundArs2(parseFormattedNumber(cotizacionManualStr));
    if (manual > 0) return manual;
    const v = Number(cotizacionSeleccionada?.venta);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [cotizacionManualStr, cotizacionSeleccionada]);

  const etiquetaTipoCambio = useMemo(() => {
    const manual = roundArs2(parseFormattedNumber(cotizacionManualStr));
    if (manual > 0) return "Cotización manual";
    if (cotizacionSeleccionada) {
      return etiquetaCasaDolar(
        cotizacionSeleccionada.casa,
        cotizacionSeleccionada.nombre
      );
    }
    return "—";
  }, [cotizacionManualStr, cotizacionSeleccionada]);

  const toUsd = useCallback(
    (ars: number) => {
      if (ventaDolarEfectiva <= 0) return 0;
      return roundArs2(ars / ventaDolarEfectiva);
    },
    [ventaDolarEfectiva]
  );

  const importeArsParaPropuesta = useMemo(() => {
    if (!mostrarIva) return precioSinIvaRedondeado;
    return precioConIvaFinal;
  }, [mostrarIva, precioSinIvaRedondeado, precioConIvaFinal]);

  const importeArsRedondeadoMostrado = useMemo(
    () => Math.round(importeArsParaPropuesta),
    [importeArsParaPropuesta]
  );

  /** Importe entero ARS que muestra la vista previa = lo del campo (si es válido) o el importe cerrado. */
  const importeVistaPreviaArsEntero = useMemo(() => {
    const trimmed = importePropuestaDraft.trim();
    if (trimmed !== "") {
      const n = Math.round(Math.max(0, parseFormattedNumber(trimmed)));
      if (Number.isFinite(n)) return n;
    }
    return importeArsRedondeadoMostrado;
  }, [importePropuestaDraft, importeArsRedondeadoMostrado]);

  useEffect(() => {
    importeDraftSincronizadoManualRef.current = false;
  }, [presupuestoIdInicial]);

  useEffect(() => {
    if (cargandoPresupuesto) return;
    if (precioObraManual == null) {
      importeDraftSincronizadoManualRef.current = false;
      setImportePropuestaDraft(
        formatNumber(importeArsRedondeadoMostrado, 0)
      );
      return;
    }
    if (!importeDraftSincronizadoManualRef.current) {
      setImportePropuestaDraft(
        formatNumber(importeArsRedondeadoMostrado, 0)
      );
      importeDraftSincronizadoManualRef.current = true;
    }
  }, [
    cargandoPresupuesto,
    precioObraManual,
    importeArsRedondeadoMostrado,
  ]);

  const previewCierreDesdeImporteDraft = useMemo(() => {
    if (!presupuestoIdInicial) return null;
    const trimmed = importePropuestaDraft.trim();
    if (trimmed === "") return null;
    const raw = parseFormattedNumber(trimmed);
    if (!Number.isFinite(raw)) return null;
    const T = Math.round(Math.max(0, raw));
    const seedP = precioObraManual ?? precioSinIvaCalculado;
    const basePref = construirPrefTemporalParaAjusteImporte({
      presupuestoId: presupuestoIdInicial,
      moneda: monedaPresentacion,
      cotizacionVentaArsPorUsd: ventaDolarEfectiva,
      precioSinIvaArsRedondeado: seedP,
      incluyeIvaEnImporte: mostrarIva,
    });
    const adj = ajustarPropuestaPrefAlImporteMostradoArs(basePref, T);
    const pSin = adj.precioSinIvaArsRedondeado;
    const contr = roundArs2(pSin - costoDirecto);
    const util = roundArs2(contr - costosInternos);
    const pct = pSin > 0 ? roundArs2((util / pSin) * 100) : 0;
    return { pSin, contr, util, pct };
  }, [
    presupuestoIdInicial,
    importePropuestaDraft,
    precioObraManual,
    precioSinIvaCalculado,
    monedaPresentacion,
    ventaDolarEfectiva,
    mostrarIva,
    costoDirecto,
    costosInternos,
  ]);

  function handleImportePropuestaBlur() {
    if (!presupuestoIdInicial) return;
    const trimmed = importePropuestaDraft.trim();
    if (trimmed === "") {
      setImportePropuestaDraft(
        formatNumber(importeArsRedondeadoMostrado, 0)
      );
      importeDraftSincronizadoManualRef.current = precioObraManual != null;
      return;
    }
    const raw = parseFormattedNumber(trimmed);
    if (!Number.isFinite(raw)) {
      setImportePropuestaDraft(
        formatNumber(importeArsRedondeadoMostrado, 0)
      );
      importeDraftSincronizadoManualRef.current = precioObraManual != null;
      return;
    }
    const T = Math.round(Math.max(0, raw));
    const committedEntero = Math.round(importeArsParaPropuesta);
    if (T === committedEntero) {
      setImportePropuestaDraft(formatNumber(T, 0));
      importeDraftSincronizadoManualRef.current = precioObraManual != null;
      return;
    }
    const seedP = precioObraManual ?? precioSinIvaCalculado;
    const basePref = construirPrefTemporalParaAjusteImporte({
      presupuestoId: presupuestoIdInicial,
      moneda: monedaPresentacion,
      cotizacionVentaArsPorUsd: ventaDolarEfectiva,
      precioSinIvaArsRedondeado: seedP,
      incluyeIvaEnImporte: mostrarIva,
    });
    const adj = ajustarPropuestaPrefAlImporteMostradoArs(basePref, T);
    setPrecioObraManual(adj.precioSinIvaArsRedondeado);
    setImportePropuestaDraft(formatNumber(T, 0));
    importeDraftSincronizadoManualRef.current = true;
  }

  const puedeIrAPropuestaUsd =
    monedaPresentacion === "ARS" || ventaDolarEfectiva > 0;

  function construirPropuestaPref(): PropuestaPrefV1 | null {
    if (!presupuestoIdInicial) return null;
    const cotGuardada =
      monedaPresentacion === "USD"
        ? ventaDolarEfectiva
        : ventaDolarEfectiva > 0
          ? ventaDolarEfectiva
          : 0;
    return {
      v: 1,
      presupuestoId: presupuestoIdInicial,
      moneda: monedaPresentacion,
      cotizacionVentaArsPorUsd: cotGuardada,
      precioSinIvaArsRedondeado: precioSinIvaRedondeado,
      ivaArs: ivaSobreRedondeado,
      incluyeIvaEnImporte: mostrarIva,
      casaDolarLabel: etiquetaTipoCambio,
      conversionDisclaimerSugerido:
        monedaPresentacion === "USD"
          ? `Importe en dólares al tipo ${etiquetaTipoCambio}, venta ${formatMoney(
              ventaDolarEfectiva
            )} ARS por US$ 1 (referencia desde Rentabilidad).`
          : undefined,
    };
  }

  async function guardarPrefYAbrirPropuesta() {
    if (!presupuestoIdInicial || !puedeIrAPropuestaUsd) return;
    const pref = construirPropuestaPref();
    if (!pref) return;
    setGuardandoPrefEnNube(true);
    setErrorGuardarPref(null);
    const supabase = createClient();
    const inputsPayload = buildRentabilidadInputsPayload({
      presupuestoId: presupuestoIdInicial,
      costoMaterialStr,
      costoMoStr,
      remarqueMaterialPctStr,
      remarqueMoPctStr,
      cargosAdicionalesStr,
      costosInternosStr,
      contingenciaPctStr,
      bonificacionComercialPctStr,
      mostrarIva,
      monedaPresentacion,
      cotizacionManualStr,
      casaDolar,
      precioObraManual,
    });
    const errInputs = await saveRentabilidadInputsToDb(supabase, inputsPayload);
    if (errInputs) {
      setGuardandoPrefEnNube(false);
      setErrorGuardarPref(
        errInputs.includes("rentabilidad_inputs")
          ? "Falta la columna rentabilidad_inputs en Supabase (migración)."
          : errInputs
      );
      return;
    }
    const err = await savePropuestaPrefToDb(supabase, pref);
    setGuardandoPrefEnNube(false);
    if (err) {
      setErrorGuardarPref(err);
      return;
    }
    router.push(`/propuesta?id=${encodeURIComponent(presupuestoIdInicial)}`);
  }

  const headerNav = (
    <header className="border-b border-ravn-line px-6 py-5 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="inline-block w-fit" aria-label="Inicio">
          <RavnLogo sizeClassName="text-xl sm:text-2xl" showTagline={false} />
        </Link>
        <nav className="flex flex-wrap gap-3 font-raleway text-xs font-medium uppercase tracking-wider">
          <Link
            href={
              presupuestoIdInicial
                ? `/nuevo-presupuesto?id=${encodeURIComponent(presupuestoIdInicial)}`
                : "/nuevo-presupuesto"
            }
            className="text-ravn-muted underline-offset-4 transition-colors hover:text-ravn-fg hover:underline"
          >
            Nuevo presupuesto
          </Link>
          <span className="text-ravn-line" aria-hidden>
            /
          </span>
          <span className="text-ravn-fg">Rentabilidad</span>
          <span className="text-ravn-line" aria-hidden>
            /
          </span>
          <Link
            href={
              presupuestoIdInicial
                ? `/propuesta?id=${encodeURIComponent(presupuestoIdInicial)}`
                : "/historial"
            }
            className="text-ravn-muted underline-offset-4 transition-colors hover:text-ravn-fg hover:underline"
          >
            Propuesta comercial
          </Link>
          {presupuestoIdInicial && presupuestoAprobadoParaGastos ? (
            <>
              <span className="text-ravn-line" aria-hidden>
                /
              </span>
              <Link
                href={`/obras/${encodeURIComponent(presupuestoIdInicial)}/gastos`}
                className="text-ravn-muted underline-offset-4 transition-colors hover:text-ravn-fg hover:underline"
              >
                Gastos de obra
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );

  if (!presupuestoIdInicial) {
    return (
      <div className="min-h-screen bg-ravn-surface text-ravn-fg">
        {headerNav}
        <main className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
          <h1 className="font-raleway text-2xl font-medium uppercase tracking-tight md:text-3xl">
            Rentabilidad y costos
          </h1>
          <p className="mt-6 text-sm leading-relaxed text-ravn-muted">
            Esta pantalla toma los mismos subtotales de{" "}
            <strong className="font-medium text-ravn-fg">
              materiales y mano de obra
            </strong>{" "}
            que calculás en <strong className="font-medium text-ravn-fg">Nuevo presupuesto</strong>{" "}
            (suma de todas las líneas del presupuesto activo). No está pensada como
            entrada desde el inicio: abrila desde el pie de esa pantalla o desde el
            historial.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
            <Link
              href="/nuevo-presupuesto"
              className="inline-flex w-fit items-center justify-center rounded-none border-2 border-ravn-accent bg-ravn-accent px-8 py-4 text-sm font-medium uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-90"
            >
              Ir a nuevo presupuesto
            </Link>
            <Link
              href="/historial"
              className="inline-flex w-fit items-center justify-center rounded-none border-2 border-ravn-line bg-ravn-surface px-8 py-4 text-sm font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle"
            >
              Historial de presupuestos
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ravn-surface text-ravn-fg">
      {headerNav}

      <main className="mx-auto max-w-5xl px-6 py-10 pb-24 sm:px-10">
        <h1 className="font-raleway text-2xl font-medium uppercase tracking-tight md:text-3xl">
          Rentabilidad y costos de obra
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ravn-muted">
          <strong className="font-medium text-ravn-fg">
            Remarque vs margen (no es lo mismo):
          </strong>{" "}
          <strong className="font-medium text-ravn-fg">Remarque</strong> (recargo) es
          el porcentaje que aplicás{" "}
          <em className="not-italic text-ravn-fg">sobre el costo</em>: precio ={" "}
          <span className="tabular-nums text-ravn-fg">
            costo × (1 + remarque%)
          </span>
          . Ej.: costo 100 y remarque 40% → vendés 140.{" "}
          <strong className="font-medium text-ravn-fg">Margen</strong> es la ganancia
          respecto del{" "}
          <em className="not-italic text-ravn-fg">precio de venta</em>:{" "}
          <span className="tabular-nums text-ravn-fg">
            (precio − costo) ÷ precio
          </span>
          . Con ese mismo ejemplo, el margen sobre la venta es 40 ÷ 140 ≈{" "}
          <span className="tabular-nums text-ravn-fg">28,57%</span>, no 40%. Los
          subtotales de materiales y M.O. coinciden con{" "}
          <strong className="font-medium text-ravn-fg">Nuevo presupuesto</strong>.
          Cotizaciones dólar (DolarAPI, Bluelytics o CriptoYa); contrastá con{" "}
          <a
            href={CRONISTA_DOLAR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ravn-fg underline underline-offset-2"
          >
            El Cronista — Mercados Online / Dólar
          </a>{" "}
          antes de cerrar números con el cliente.
        </p>

        <p className="mt-4 rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-xs text-ravn-muted">
          {cargandoPresupuesto
            ? "Cargando totales del presupuesto…"
            : errorPresupuesto
              ? `No se pudieron leer las líneas: ${errorPresupuesto}`
              : `Subtotales alineados con «Total materiales» y «Total mano de obra» del presupuesto (id ${presupuestoIdInicial}). Podés editarlos si querés partir de otra base.`}
        </p>
        {errorPersistirInputs ? (
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
            {errorPersistirInputs}
          </p>
        ) : null}
        {!errorPresupuesto && !cargandoPresupuesto && presupuestoIdInicial ? (
          <p className="mt-2 text-xs text-ravn-muted">
            Toda la hoja (costo directo material y M.O., remarques, bonificación,
            cargos, contingencia, costos internos, IVA, moneda, cotización, cierre
            manual del importe) se guarda sola en la nube unos segundos después de
            editar. Si más tarde cambiás líneas en Nuevo presupuesto, la suma de
            ítems puede no coincidir con estos totales hasta que los corrijas acá.
          </p>
        ) : null}

        <div className="mt-10 flex flex-col gap-10">
          <section className={sectionCls}>
            <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
              Costo directo (base)
            </h2>
            <p className="mt-2 text-xs text-ravn-muted">
              Pesos argentinos. Por defecto coinciden con la suma de cantidad ×
              precio unitario de cada línea en Nuevo presupuesto (materiales y M.O.
              por separado).
            </p>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="costo-mat" className={labelCls}>
                  Total materiales (ARS)
                </label>
                <input
                  id="costo-mat"
                  type="text"
                  inputMode="decimal"
                  value={costoMaterialStr}
                  onChange={(e) => setCostoMaterialStr(e.target.value)}
                  className={inputCls}
                  placeholder="0"
                  data-no-spinner
                />
              </div>
              <div>
                <label htmlFor="costo-mo" className={labelCls}>
                  Total mano de obra (ARS)
                </label>
                <input
                  id="costo-mo"
                  type="text"
                  inputMode="decimal"
                  value={costoMoStr}
                  onChange={(e) => setCostoMoStr(e.target.value)}
                  className={inputCls}
                  placeholder="0"
                  data-no-spinner
                />
              </div>
            </div>
            <p className="mt-4 text-sm font-medium tabular-nums text-ravn-fg">
              Costo directo total: {formatMoney(costoDirecto)}
            </p>
          </section>

          <section className={sectionCls}>
            <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
              Remarque sobre costo (recargo)
            </h2>
            <p className="mt-2 text-xs text-ravn-muted">
              Acá cargás el <strong className="font-medium text-ravn-fg">remarque</strong>{" "}
              por rubro: cuánto sumás encima del costo. La pantalla te muestra el{" "}
              <strong className="font-medium text-ravn-fg">margen real sobre la venta</strong>{" "}
              que equivale a ese remarque (siempre menor en puntos porcentuales, salvo 0%).
            </p>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="remarque-mat" className={labelCls}>
                  Remarque materiales (% sobre costo)
                </label>
                <input
                  id="remarque-mat"
                  type="text"
                  inputMode="decimal"
                  value={remarqueMaterialPctStr}
                  onChange={(e) => setRemarqueMaterialPctStr(e.target.value)}
                  className={inputCls}
                  placeholder="Ej. 40"
                  data-no-spinner
                />
                <p className="mt-2 text-xs tabular-nums text-ravn-muted">
                  Precio objetivo (sin bonificación):{" "}
                  <span className="font-medium text-ravn-fg">
                    {formatMoney(precioObjetivoMaterial)}
                  </span>
                </p>
                <p className="mt-1 text-xs tabular-nums text-ravn-muted">
                  Margen sobre esa venta (equiv. al remarque):{" "}
                  <span className="font-medium text-ravn-fg">
                    {formatNumber(margenSobreVentaMaterialSinBonif, 2)}%
                  </span>
                </p>
              </div>
              <div>
                <label htmlFor="remarque-mo" className={labelCls}>
                  Remarque M.O. (% sobre costo)
                </label>
                <input
                  id="remarque-mo"
                  type="text"
                  inputMode="decimal"
                  value={remarqueMoPctStr}
                  onChange={(e) => setRemarqueMoPctStr(e.target.value)}
                  className={inputCls}
                  placeholder="Ej. 40"
                  data-no-spinner
                />
                <p className="mt-2 text-xs tabular-nums text-ravn-muted">
                  Precio objetivo (sin bonificación):{" "}
                  <span className="font-medium text-ravn-fg">
                    {formatMoney(precioObjetivoMo)}
                  </span>
                </p>
                <p className="mt-1 text-xs tabular-nums text-ravn-muted">
                  Margen sobre esa venta (equiv. al remarque):{" "}
                  <span className="font-medium text-ravn-fg">
                    {formatNumber(margenSobreVentaMoSinBonif, 2)}%
                  </span>
                </p>
              </div>
            </div>
          </section>

          <section className={sectionCls}>
            <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
              Cargos al cliente e imprevistos
            </h2>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="cargos-adic" className={labelCls}>
                  Cargos adicionales facturables (ARS)
                </label>
                <input
                  id="cargos-adic"
                  type="text"
                  inputMode="decimal"
                  value={cargosAdicionalesStr}
                  onChange={(e) => setCargosAdicionalesStr(e.target.value)}
                  className={inputCls}
                  placeholder="Permisos, traslados, equipos…"
                  data-no-spinner
                />
              </div>
              <div>
                <label htmlFor="contingencia" className={labelCls}>
                  Contingencia sobre costo directo (%)
                </label>
                <input
                  id="contingencia"
                  type="text"
                  inputMode="decimal"
                  value={contingenciaPctStr}
                  onChange={(e) => setContingenciaPctStr(e.target.value)}
                  className={inputCls}
                  placeholder="0"
                  data-no-spinner
                />
                <p className="mt-2 text-xs tabular-nums text-ravn-muted">
                  Monto agregado al precio: {formatMoney(contingenciaMonto)}
                </p>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="costos-int" className={labelCls}>
                  Costos internos no facturados (ARS)
                </label>
                <input
                  id="costos-int"
                  type="text"
                  inputMode="decimal"
                  value={costosInternosStr}
                  onChange={(e) => setCostosInternosStr(e.target.value)}
                  className={inputCls}
                  placeholder="Gestión, comisiones, seguros… (restan de la utilidad)"
                  data-no-spinner
                />
              </div>
            </div>
          </section>

          <section className={sectionCls}>
            <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
              Cotización en dólares
            </h2>
            <p className="mt-2 text-xs text-ravn-muted">
              Tipo de cambio de referencia (punta venta). Equivalente en USD: ARS
              ÷ cotización venta. Si falla la API, ingresá el valor de venta que
              ves en El Cronista u otro medio.
            </p>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="cotiz-manual" className={labelCls}>
                  Cotización venta manual (ARS por US$ 1)
                </label>
                <input
                  id="cotiz-manual"
                  type="text"
                  inputMode="decimal"
                  value={cotizacionManualStr}
                  onChange={(e) => setCotizacionManualStr(e.target.value)}
                  className={inputCls}
                  placeholder="Ej. 1400 (prioridad sobre el listado)"
                  data-no-spinner
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[14rem] flex-1">
                <label htmlFor="tipo-dolar" className={labelCls}>
                  Variante de dólar
                </label>
                <select
                  id="tipo-dolar"
                  value={casaDolar}
                  onChange={(e) => setCasaDolar(e.target.value)}
                  disabled={cotizaciones.length === 0}
                  className={inputCls}
                >
                  {cotizaciones.length === 0 ? (
                    <option value="">—</option>
                  ) : null}
                  {cotizaciones.map((c) => (
                    <option key={c.casa} value={c.casa}>
                      {etiquetaCasaDolar(c.casa, c.nombre)} — venta{" "}
                      {formatMoney(c.venta)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void loadCotizaciones()}
                disabled={cotizLoading}
                className="rounded-none border-2 border-ravn-line bg-ravn-surface px-5 py-3 text-xs font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle disabled:opacity-50"
              >
                {cotizLoading ? "Actualizando…" : "Actualizar cotizaciones"}
              </button>
              <a
                href={CRONISTA_DOLAR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-none border-2 border-ravn-accent bg-ravn-accent px-5 py-3 text-xs font-medium uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-90"
              >
                Abrir El Cronista
              </a>
            </div>
            {cotizError ? (
              <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
                {cotizError}
              </p>
            ) : null}
            {cotizacionSeleccionada ? (
              <p className="mt-3 text-xs text-ravn-muted">
                {etiquetaCasaDolar(
                  cotizacionSeleccionada.casa,
                  cotizacionSeleccionada.nombre
                )}
                : compra {formatMoney(cotizacionSeleccionada.compra)} · venta{" "}
                {formatMoney(cotizacionSeleccionada.venta)} · actualizado{" "}
                {formatFechaCotizacion(cotizacionSeleccionada.fechaActualizacion)}
              </p>
            ) : null}
          </section>

          <section
            className={`${sectionCls} border-2 border-ravn-accent bg-ravn-subtle`}
          >
            <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-fg">
              Bonificación comercial
            </h2>
            <p className="mt-2 text-xs text-ravn-muted">
              Descuento sobre los precios ya remarcados (materiales y M.O.) antes de
              sumar cargos adicionales y contingencia. Aumentá el porcentaje para ver
              cómo baja el margen neto real sobre esas ventas.
            </p>
            <div className="mt-6 max-w-md">
              <label htmlFor="bonif-comercial" className={labelCls}>
                Bonificación comercial (%)
              </label>
              <input
                id="bonif-comercial"
                type="text"
                inputMode="decimal"
                value={bonificacionComercialPctStr}
                onChange={(e) => setBonificacionComercialPctStr(e.target.value)}
                className={inputCls}
                placeholder="0"
                data-no-spinner
              />
            </div>
          </section>

          <section className={sectionCls}>
            <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
              Precio al cliente y rentabilidad
            </h2>
            <div className="mt-6 space-y-4 text-sm">
              <div className="space-y-3 border-2 border-ravn-line bg-ravn-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-ravn-muted">
                  Resultado materiales y M.O. (bonificación aplicada)
                </p>
                <div className="border-b border-ravn-line py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs uppercase tracking-wider text-ravn-muted">
                      Venta final materiales
                    </span>
                    <span className="font-raleway text-lg font-semibold tabular-nums text-ravn-fg sm:text-xl">
                      {formatMoney(ventaMaterial)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-ravn-muted">
                    Margen sobre esa venta:{" "}
                    <span className="font-medium text-ravn-fg">
                      {formatNumber(margenSobreVentaMaterialFinal, 2)}%
                    </span>
                  </p>
                </div>
                <div className="border-b border-ravn-line py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs uppercase tracking-wider text-ravn-muted">
                      Venta final M.O.
                    </span>
                    <span className="font-raleway text-lg font-semibold tabular-nums text-ravn-fg sm:text-xl">
                      {formatMoney(ventaMo)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-ravn-muted">
                    Margen sobre esa venta:{" "}
                    <span className="font-medium text-ravn-fg">
                      {formatNumber(margenSobreVentaMoFinal, 2)}%
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ravn-line py-2">
                  <span className="text-xs uppercase tracking-wider text-ravn-muted">
                    Margen bruto mat. + M.O.
                  </span>
                  <span className="font-raleway text-lg font-semibold tabular-nums text-ravn-fg sm:text-xl">
                    {formatMoney(gananciaNetaSobreMatMo)}
                  </span>
                </div>
                <p className="text-[11px] text-ravn-muted">
                  Venta final materiales + venta final M.O. menos solo el costo
                  directo de materiales y M.O.{" "}
                  <span className="font-medium text-ravn-fg">
                    No incluye costos internos
                  </span>{" "}
                  ni el efecto de cargos adicionales y contingencia sobre el
                  precio de obra (eso va en el total de abajo).
                </p>
                <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="text-xs uppercase tracking-wider text-ravn-muted">
                    Margen neto real (%)
                  </span>
                  <span className="font-raleway text-xl font-semibold tabular-nums text-ravn-fg sm:text-2xl">
                    {formatNumber(margenNetoRealPct, 2)}%
                  </span>
                </div>
                <p className="text-[11px] text-ravn-muted">
                  Sobre la suma venta final materiales + venta final M.O. (ponderado;
                  si los remarques difieren por rubro, no coincide con el margen de una
                  sola columna).
                </p>
                {precioObraManual != null ? (
                  <div className="mt-4 border-t border-ravn-accent/50 pt-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-ravn-accent">
                      Con precio de obra cerrado a mano (importe final)
                    </p>
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-ravn-line py-2">
                      <span className="text-xs uppercase tracking-wider text-ravn-muted">
                        Utilidad neta (obra)
                      </span>
                      <span className="font-raleway text-lg font-semibold tabular-nums text-ravn-fg sm:text-xl">
                        {formatMoney(utilidadNetaEstimada)}
                      </span>
                    </div>
                    <p className="mt-2 space-y-1 text-[11px] leading-relaxed text-ravn-muted">
                      <span className="block">
                        No es el importe final al cliente: el precio obra sin IVA
                        es{" "}
                        <span className="tabular-nums font-medium text-ravn-fg">
                          {formatMoney(precioSinIvaRedondeado)}
                        </span>
                        . La utilidad neta es lo que queda después de descontar
                        costo directo y costos internos:
                      </span>
                      <span className="block tabular-nums">
                        {formatMoney(precioSinIvaRedondeado)} −{" "}
                        {formatMoney(costoDirecto)} (costo directo mat. + M.O.) −{" "}
                        {formatMoney(costosInternos)} (costos internos) ={" "}
                        <span className="font-medium text-ravn-fg">
                          {formatMoney(utilidadNetaEstimada)}
                        </span>
                        .
                      </span>
                    </p>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <span className="text-xs uppercase tracking-wider text-ravn-muted">
                        Margen sobre precio obra sin IVA
                      </span>
                      <span className="font-raleway text-xl font-semibold tabular-nums text-ravn-fg sm:text-2xl">
                        {formatNumber(margenSobrePrecioObraCompletoPct, 2)}%
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <p className="text-xs text-ravn-muted">
                Cálculo previo (sin redondeo comercial):{" "}
                <span className="tabular-nums text-ravn-fg">
                  {formatMoney(precioObraSinIva)}
                </span>
              </p>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ravn-line py-2">
                <span className="text-ravn-muted">
                  Precio obra sin IVA (redondeado al siguiente $1.000)
                </span>
                <span className="font-raleway text-xl font-semibold tabular-nums sm:text-2xl">
                  {formatMoney(precioSinIvaRedondeado)}
                </span>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={mostrarIva}
                  onChange={(e) => setMostrarIva(e.target.checked)}
                  className="h-4 w-4 rounded-none border-ravn-line"
                />
                <span className="text-xs uppercase tracking-wider text-ravn-muted">
                  Incluir IVA 21% en el importe final (21% exacto sobre el precio
                  redondeado)
                </span>
              </label>
              {mostrarIva ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ravn-line py-2">
                    <span className="text-ravn-muted">IVA 21% (exacto)</span>
                    <span className="tabular-nums text-ravn-fg">
                      {formatMoney(ivaSobreRedondeado)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span className="text-ravn-muted">Precio con IVA</span>
                    <span className="font-raleway text-xl font-semibold tabular-nums sm:text-2xl">
                      {formatMoney(precioConIvaFinal)}
                    </span>
                  </div>
                </>
              ) : null}

              <div className="border-t border-ravn-line pt-4">
                <label
                  htmlFor="importe-propuesta-ars"
                  className="text-xs font-medium uppercase tracking-wider text-ravn-muted"
                >
                  Importe que pasará a la propuesta (ARS)
                </label>
                {presupuestoIdInicial ? (
                  <>
                    <input
                      id="importe-propuesta-ars"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={importePropuestaDraft}
                      onChange={(e) =>
                        setImportePropuestaDraft(
                          formatArsEnteroDesdeDigitos(e.target.value)
                        )
                      }
                      onBlur={() => handleImportePropuestaBlur()}
                      className={`${inputCls} mt-2 font-raleway text-lg font-semibold tabular-nums`}
                    />
                    <p className="mt-2 text-xs leading-relaxed text-ravn-muted">
                      Editá el total en pesos (con o sin IVA según el casillero de
                      arriba). Al salir del campo se ajusta el precio de obra y se
                      actualizan utilidad y margen obra. Aumentar el importe
                      manual sube la utilidad tras costos internos y el margen
                      (el costo directo y los costos internos no cambian). Si
                      cambiás remarques o cargos, el cierre manual se descarta y
                      vuelve el cálculo automático.
                    </p>
                    {precioObraManual != null ? (
                      <button
                        type="button"
                        onClick={() => {
                          importeDraftSincronizadoManualRef.current = false;
                          setPrecioObraManual(null);
                        }}
                        className="mt-3 rounded-none border border-ravn-line bg-ravn-surface px-4 py-2 text-xs font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle"
                      >
                        Volver al precio calculado desde ítems
                      </button>
                    ) : null}
                    {previewCierreDesdeImporteDraft ? (
                      <div className="mt-4 rounded-none border border-ravn-accent/40 bg-ravn-subtle/40 p-4 text-xs">
                        <p className="font-medium uppercase tracking-wider text-ravn-muted">
                          Con el importe que estás editando
                        </p>
                        <p className="mt-2 tabular-nums text-ravn-fg">
                          Precio obra sin IVA (impl.):{" "}
                          <span className="font-semibold">
                            {formatMoneyInt(
                              Math.round(previewCierreDesdeImporteDraft.pSin)
                            )}
                          </span>
                        </p>
                        <p className="mt-1 tabular-nums text-ravn-fg">
                          Contribución (precio obra − costo directo):{" "}
                          <span className="font-semibold">
                            {formatMoneyInt(
                              Math.round(previewCierreDesdeImporteDraft.contr)
                            )}
                          </span>
                        </p>
                        <p className="mt-1 tabular-nums text-ravn-fg">
                          Utilidad neta estimada (tras costos internos):{" "}
                          <span className="font-semibold">
                            {formatMoneyInt(
                              Math.round(previewCierreDesdeImporteDraft.util)
                            )}
                          </span>
                        </p>
                        <p className="mt-1 tabular-nums text-ravn-fg">
                          Margen sobre precio obra sin IVA:{" "}
                          <span className="font-semibold">
                            {formatNumber(previewCierreDesdeImporteDraft.pct, 2)}%
                          </span>
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 font-raleway text-lg font-semibold tabular-nums text-ravn-fg">
                    {formatMoneyInt(importeArsRedondeadoMostrado)}
                  </p>
                )}
                {ventaDolarEfectiva > 0 ? (
                  <p className="mt-2 text-xs text-ravn-muted">
                    Equivalente aprox. en USD ({etiquetaTipoCambio}):{" "}
                    <span className="tabular-nums text-ravn-fg">
                      {formatMoneyUsdInt(
                        toUsd(importeArsRedondeadoMostrado)
                      )}
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-ravn-muted">
                    Cotizá el dólar (automático o manual) para ver el equivalente
                    en USD.
                  </p>
                )}
              </div>

              <div className="mt-6 grid gap-3 border-t border-ravn-line pt-6 text-xs sm:grid-cols-2">
                <div>
                  <p className="font-medium uppercase tracking-wider text-ravn-muted">
                    Margen en materiales (venta final − costo)
                  </p>
                  <p className="mt-1 tabular-nums text-ravn-fg">
                    {formatMoney(margenMaterialesArs)}
                  </p>
                </div>
                <div>
                  <p className="font-medium uppercase tracking-wider text-ravn-muted">
                    Margen en M.O. (venta final − costo)
                  </p>
                  <p className="mt-1 tabular-nums text-ravn-fg">
                    {formatMoney(margenMoArs)}
                  </p>
                </div>
                <div>
                  <p className="font-medium uppercase tracking-wider text-ravn-muted">
                    Contribución obra (precio redondeado − costo directo)
                  </p>
                  <p className="mt-1 tabular-nums text-ravn-fg">
                    {formatMoney(contribucionSobreCostoDirecto)}
                  </p>
                </div>
                <div>
                  <p className="font-medium uppercase tracking-wider text-ravn-muted">
                    Utilidad tras costos internos
                  </p>
                  <p className="mt-1 tabular-nums text-ravn-fg">
                    {formatMoney(utilidadNetaEstimada)}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="font-medium uppercase tracking-wider text-ravn-muted">
                    Margen sobre precio obra sin IVA (tras costos internos)
                  </p>
                  <p className="mt-1 tabular-nums text-ravn-fg">
                    {formatNumber(margenSobrePrecioObraCompletoPct, 2)}%
                  </p>
                </div>
              </div>

              {ventaDolarEfectiva > 0 ? (
                <div className="mt-8 border-t border-ravn-line pt-6">
                  <h3 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
                    Equivalente en USD ({etiquetaTipoCambio}, venta{" "}
                    {formatMoney(ventaDolarEfectiva)})
                  </h3>
                  <ul className="mt-4 space-y-2 text-xs tabular-nums">
                    <li className="flex justify-between gap-4">
                      <span className="text-ravn-muted">Costo directo</span>
                      <span>{formatMoneyMoneda(toUsd(costoDirecto), "USD")}</span>
                    </li>
                    <li className="flex justify-between gap-4">
                      <span className="text-ravn-muted">
                        Precio sin IVA (redondeado)
                      </span>
                      <span>
                        {formatMoneyMoneda(
                          toUsd(precioSinIvaRedondeado),
                          "USD"
                        )}
                      </span>
                    </li>
                    <li className="flex justify-between gap-4">
                      <span className="text-ravn-muted">Importe propuesta</span>
                      <span>
                        {formatMoneyMoneda(
                          toUsd(importeArsParaPropuesta),
                          "USD"
                        )}
                      </span>
                    </li>
                    <li className="flex justify-between gap-4">
                      <span className="text-ravn-muted">Utilidad neta est.</span>
                      <span>
                        {formatMoneyMoneda(toUsd(utilidadNetaEstimada), "USD")}
                      </span>
                    </li>
                  </ul>
                </div>
              ) : (
                <p className="mt-6 text-xs text-ravn-muted">
                  Cargá la cotización automática o el valor manual (ARS por US$ 1)
                  para ver equivalentes en dólares.
                </p>
              )}
            </div>
          </section>

          <section className={sectionCls}>
            <h2 className="font-raleway text-xs font-medium uppercase tracking-wider text-ravn-muted">
              Moneda en propuesta comercial
            </h2>
            <p className="mt-2 text-xs text-ravn-muted">
              Elegí si el PDF y el constructor muestran el importe en pesos o en
              dólares. Al continuar se guarda en el presupuesto (Supabase) y se
              aplica en cualquier dispositivo donde abras la app.
            </p>
            <div className="mt-6 flex flex-wrap gap-6">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="moneda-propuesta"
                  checked={monedaPresentacion === "ARS"}
                  onChange={() => setMonedaPresentacion("ARS")}
                  className="h-4 w-4 border-ravn-line"
                />
                <span className="text-sm text-ravn-fg">Pesos (ARS)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="moneda-propuesta"
                  checked={monedaPresentacion === "USD"}
                  onChange={() => setMonedaPresentacion("USD")}
                  className="h-4 w-4 border-ravn-line"
                />
                <span className="text-sm text-ravn-fg">Dólares (USD)</span>
              </label>
            </div>
            <p className="mt-4 rounded-none border border-ravn-line bg-ravn-subtle px-4 py-3 text-sm tabular-nums text-ravn-fg">
              Vista previa:{" "}
              {monedaPresentacion === "ARS"
                ? formatMoneyInt(importeVistaPreviaArsEntero)
                : ventaDolarEfectiva > 0
                  ? formatMoneyUsdInt(
                      toUsd(importeVistaPreviaArsEntero)
                    )
                  : "Ingresá cotización venta para ver USD"}
            </p>
            {!puedeIrAPropuestaUsd ? (
              <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">
                Para exportar en dólares necesitás una cotización venta (lista o
                manual).
              </p>
            ) : null}
          </section>

          <div className="flex flex-col gap-4 border-t border-ravn-line pt-8 sm:flex-row sm:flex-wrap">
            <Link
              href={
                presupuestoIdInicial
                  ? `/nuevo-presupuesto?id=${encodeURIComponent(presupuestoIdInicial)}`
                  : "/nuevo-presupuesto"
              }
              className="inline-flex w-fit items-center justify-center rounded-none border-2 border-ravn-line bg-ravn-surface px-6 py-3 text-sm font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle"
            >
              Volver al presupuesto
            </Link>
            {errorGuardarPref ? (
              <p className="w-full text-sm text-red-600 dark:text-red-400 sm:w-auto">
                {errorGuardarPref}
              </p>
            ) : null}
            {puedeIrAPropuestaUsd ? (
              <button
                type="button"
                disabled={guardandoPrefEnNube}
                onClick={() => void guardarPrefYAbrirPropuesta()}
                className="inline-flex w-fit items-center justify-center rounded-none border-2 border-ravn-accent bg-ravn-accent px-6 py-3 text-sm font-medium uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guardandoPrefEnNube
                  ? "Guardando en la nube…"
                  : "Continuar a propuesta comercial"}
              </button>
            ) : (
              <span className="inline-flex w-fit cursor-not-allowed items-center justify-center rounded-none border-2 border-ravn-line px-6 py-3 text-sm font-medium uppercase tracking-wider text-ravn-muted opacity-60">
                Continuar a propuesta (falta cotización USD)
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
