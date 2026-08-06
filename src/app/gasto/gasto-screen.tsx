"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CapturaIa, type DatosExtraidos } from "./captura-ia";
import { UltimosGastos } from "./ultimos-gastos";
import { RavnLogo } from "@/components/ravn-logo";
import { useEntradaAnimada } from "@/hooks/use-entrada-animada";
import { fetchCompartido } from "@/lib/fetch-compartido";
import type { SaldosCuentas } from "@/lib/cuentas";
import {
  formatMoney,
  formatMoneyInt,
  formatNumber,
  parseFormattedNumber,
  roundArs2,
} from "@/lib/format-currency";

/**
 * /gasto — UNA pantalla, cero wizard: movimiento (gasto/ingreso) → tipo o
 * obra → monto
 * protagonista → concepto → chips con defaults inteligentes → GUARDAR.
 * Pensada para el atajo del iPhone: el ciclo completo queda en ~5 taps.
 *
 * PROHIBIDO acá: cualquier insert supabase-js client-side. El único write es
 * POST /api/gastos/rapido (server), que asienta el espejo del ledger vía
 * sincronizarEspejo y devuelve el estado REAL — la card de éxito nunca dice
 * "asentado" si no hay patas.
 */

export type ObraRapida = {
  presupuestoId: string;
  etiqueta: string;
  /** obras.id (la libreta de Caja); también matchea cuentas.obra_id (reserva MP). */
  obraId: string | null;
  cotizacionPref: number | null;
  casaDolarLabel: string | null;
};

type Tipo = "obra" | "empresa" | "personal";
type Movimiento = "gasto" | "ingreso";
type SheetId = "fecha" | "obra" | "categoria" | null;

type EstadoLedger = "asentado" | "pendiente_cuenta" | "espejo_pendiente" | "sin_foto";

type Resultado = {
  id: string;
  tabla: "presupuestos_gastos" | "gastos_empresa" | "gastos_personales" | "cashflow_items";
  montoTexto: string;
  estado: EstadoLedger;
};

const EASE = [0.22, 1, 0.36, 1] as const;

const CARD =
  "cdm-card relative overflow-hidden rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 p-5 sm:p-6";
const LABEL =
  "font-mono-hud text-[10px] uppercase tracking-[0.24em] text-cdm-muted";
const CHIP_BASE =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full ring-1 px-4 font-mono-hud text-[10px] uppercase tracking-[0.14em] transition-colors";

const LS_KEY = "ravn.gasto.v1";

type LsShape = {
  tipo?: Tipo;
  obraId?: string;
  cuentaPorTipo?: Partial<Record<Tipo, string>>;
};

function leerLs(): LsShape {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    return o && typeof o === "object" ? (o as LsShape) : {};
  } catch {
    return {};
  }
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

const TIPOS: Array<{ id: Tipo; label: string }> = [
  { id: "obra", label: "Obra" },
  { id: "empresa", label: "Empresa" },
  { id: "personal", label: "Personal" },
];

/** Bottom-sheet mínimo: scrim + panel que sube; tap al scrim o [CERRAR] cierra. */
function Sheet({
  open,
  titulo,
  onClose,
  children,
}: {
  open: boolean;
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const reducir = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            aria-hidden
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-[24px] bg-cdm-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ring-1 ring-cdm-line"
            initial={reducir ? { opacity: 0 } : { y: "100%" }}
            animate={reducir ? { opacity: 1 } : { y: 0 }}
            exit={reducir ? { opacity: 0 } : { y: "100%" }}
            transition={{ duration: 0.26, ease: EASE }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className={LABEL}>{titulo}</span>
              <button
                type="button"
                onClick={onClose}
                className="font-mono-hud min-h-[44px] px-2 text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-fg"
              >
                [CERRAR]
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function GastoScreen({
  obras,
  hoy,
}: {
  obras: ObraRapida[];
  hoy: string;
}) {
  const animar = useEntradaAnimada();
  const reducir = useReducedMotion();

  const [movimiento, setMovimiento] = useState<Movimiento>("gasto");
  const [tipo, setTipo] = useState<Tipo>("obra");
  const [montoStr, setMontoStr] = useState("");
  const [modoUsd, setModoUsd] = useState(false);
  const [usdStr, setUsdStr] = useState("");
  const [cotStr, setCotStr] = useState("");
  const [casaDolar, setCasaDolar] = useState<string | null>(null);
  const [concepto, setConcepto] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [obraId, setObraId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState("");
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(false);
  const [errorRed, setErrorRed] = useState<string | null>(null);
  const [sesionVencida, setSesionVencida] = useState(false);
  const [refreshUltimos, setRefreshUltimos] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [reintentando, setReintentando] = useState(false);
  /** Nota de lo que entendió la IA (transcripción / avisos) + flash visual
   * breve sobre los campos que precargó. */
  const [iaNota, setIaNota] = useState<string | null>(null);
  const [iaFlash, setIaFlash] = useState(false);

  const montoRef = useRef<HTMLInputElement>(null);
  const lsRef = useRef<LsShape>({});
  const cuentaTocada = useRef(false);
  const reservaOfrecida = useRef<string | null>(null);
  /** Hubo un intento de guardado que falló (respuesta perdida incluida):
   * el próximo POST va marcado reintento=true para que el server dedupee
   * una fila idéntica ya comiteada (no restar la plata dos veces). */
  const falloPrevio = useRef(false);

  /** Cuentas activas con saldo derivado de /api/cuentas (fetchCompartido
   * dedupea el request). Acá se usan para conocer la MONEDA de la cuenta
   * elegida (trampa USD) y para pintar las cajas como botones en "Salió de". */
  const [cuentas, setCuentas] = useState<SaldosCuentas["cuentas"] | null>(null);

  /** Trae los saldos frescos. Con reintentos (revisión 31/07): si el fetch
   * inicial muere, la pantalla no conoce la MONEDA de la cuenta hidratada de
   * localStorage y podría mandar un monto en pesos contra una cuenta USD
   * (~1000x en el ledger). Mientras cuentas === null con cuenta elegida,
   * [GUARDAR] queda bloqueado (ver `motivo`) — acá se insiste para
   * destrabarlo. fetchCompartido dedupea llamadas superpuestas en vuelo. */
  const cargarCuentas = useCallback(async (reintentos: number) => {
    for (let i = 0; i < reintentos; i++) {
      try {
        const r = await fetchCompartido("/api/cuentas");
        if (r.ok) {
          setCuentas((r.body as SaldosCuentas).cuentas ?? []);
          return;
        }
      } catch {
        /* red caída: se reintenta abajo */
      }
      await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
    }
  }, []);

  useEffect(() => {
    void cargarCuentas(4);
  }, [cargarCuentas]);

  // Saldos en tiempo real: la PWA de iOS queda viva días en background — al
  // volver al frente se refrescan las cajas (visibilitychange) y también al
  // restaurar desde bfcache (pageshow).
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") void cargarCuentas(1);
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("pageshow", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("pageshow", alVolver);
    };
  }, [cargarCuentas]);

  // Hidratación de defaults desde localStorage (post-mount: nunca en SSR).
  useEffect(() => {
    const ls = leerLs();
    lsRef.current = ls;
    if (ls.tipo && TIPOS.some((t) => t.id === ls.tipo)) setTipo(ls.tipo);
    const t = ls.tipo && TIPOS.some((x) => x.id === ls.tipo) ? ls.tipo : "obra";
    const cta = ls.cuentaPorTipo?.[t];
    if (cta) setCuentaId(cta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default de OBRA: única aprobada → preseleccionada; sino la última usada.
  useEffect(() => {
    if (tipo !== "obra" || obraId) return;
    if (obras.length === 1) {
      setObraId(obras[0].presupuestoId);
      return;
    }
    const ls = lsRef.current;
    if (ls.obraId && obras.some((o) => o.presupuestoId === ls.obraId)) {
      setObraId(ls.obraId);
    }
  }, [tipo, obraId, obras]);

  const obraSel = useMemo(
    () => obras.find((o) => o.presupuestoId === obraId) ?? null,
    [obras, obraId]
  );

  // Cambio de tipo: cargar la última cuenta usada para ESE tipo (si el usuario
  // no eligió una a mano en esta sesión).
  const cambiarTipo = useCallback((t: Tipo) => {
    setTipo(t);
    setIntento(false);
    setModoUsd(false);
    if (!cuentaTocada.current) {
      setCuentaId(lsRef.current.cuentaPorTipo?.[t] ?? null);
    }
    if (t === "personal" && !categoria) setCategoria("Varios");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria]);

  const cuentaSel = useMemo(
    () => (cuentas ?? []).find((c) => c.id === cuentaId) ?? null,
    [cuentas, cuentaId]
  );

  /** Cajas que se muestran como botones en "Salió de" (personal: solo ARS). */
  const cuentasVisibles = useMemo(
    () =>
      (cuentas ?? []).filter(
        (c) => c.activa && (tipo !== "personal" || c.moneda === "ARS")
      ),
    [cuentas, tipo]
  );

  // Personal solo cuentas ARS: si quedó una USD colada (LS viejo), se limpia.
  useEffect(() => {
    if (tipo === "personal" && cuentaSel?.moneda === "USD") setCuentaId(null);
  }, [tipo, cuentaSel]);

  // Cuenta hidratada de LS que ya no existe o quedó inactiva: se limpia (el
  // chip pasa a "Pendiente", visible) en vez de mandarla a ciegas al server.
  useEffect(() => {
    if (!cuentas || !cuentaId) return;
    const c = cuentas.find((x) => x.id === cuentaId);
    if (!c || !c.activa) setCuentaId(null);
  }, [cuentas, cuentaId]);

  // Default de CUENTA para gasto de obra: la reserva MP de la obra con saldo
  // (misma regla que SelectorCuenta/preferirObraId) — una sola vez por obra.
  useEffect(() => {
    if (tipo !== "obra" || cuentaId || cuentaTocada.current) return;
    if (!obraSel?.obraId || !cuentas) return;
    if (reservaOfrecida.current === obraSel.obraId) return;
    const reserva = cuentas.find(
      (c) => c.activa && c.obra_id === obraSel.obraId && c.saldo > 0
    );
    if (reserva) {
      reservaOfrecida.current = obraSel.obraId;
      setCuentaId(reserva.id);
    }
  }, [tipo, cuentaId, obraSel, cuentas]);

  const cuentaUsd = cuentaSel?.moneda === "USD";
  const esIngreso = movimiento === "ingreso";

  // La cuenta dejó de ser USD (se cambió a una en pesos o se sacó): el modo
  // "tipear en US$" no puede sobrevivir — el toggle y el campo de cotización
  // desaparecen del render y montoFinal seguiría convirtiendo usd × cot con
  // una cotización invisible. Espejo del cleanup de personal + USD de arriba.
  useEffect(() => {
    if (!cuentaUsd) setModoUsd(false);
  }, [cuentaUsd]);

  // Cotización pre-cargada (solo obra + cuenta USD): pref del presupuesto o
  // /api/dolar lazy — editable, obligatoria para guardar (trampa 0-patas).
  const cotPedida = useRef(false);
  useEffect(() => {
    if (!(tipo === "obra" && cuentaUsd) || cotStr) return;
    if (obraSel?.cotizacionPref) {
      setCotStr(formatNumber(obraSel.cotizacionPref, 2));
      setCasaDolar(obraSel.casaDolarLabel);
      return;
    }
    if (cotPedida.current) return;
    cotPedida.current = true;
    let cancel = false;
    void (async () => {
      try {
        const r = await fetch("/api/dolar", { cache: "no-store" });
        const b = (await r.json()) as {
          cotizaciones?: Array<{ casa: string; venta: number }>;
        };
        const c = b.cotizaciones?.[0];
        if (!cancel && c && c.venta > 0) {
          setCotStr(formatNumber(c.venta, 2));
          setCasaDolar(c.casa);
        }
      } catch {
        /* editable a mano */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [tipo, cuentaUsd, cotStr, obraSel]);

  const cot = roundArs2(parseFormattedNumber(cotStr));

  /** Monto en la moneda que se persiste: obra siempre ARS (modo US$ convierte);
   * empresa en la moneda de la cuenta; personal siempre ARS. */
  const montoFinal = useMemo(() => {
    if ((tipo === "obra" || esIngreso) && modoUsd) {
      const usd = parseFormattedNumber(usdStr);
      return usd > 0 && cot > 0 ? roundArs2(usd * cot) : 0;
    }
    return roundArs2(parseFormattedNumber(montoStr));
  }, [tipo, esIngreso, modoUsd, usdStr, cot, montoStr]);

  const motivo = useMemo(() => {
    if (!(montoFinal > 0)) return "Ingresá un monto mayor a cero.";
    if ((tipo === "obra" || esIngreso) && !obraSel) return "Elegí la obra.";
    if (esIngreso && !cuentaId) return "Elegí dónde entró el dinero.";
    if (tipo !== "obra" && !concepto.trim()) return "Poné el concepto.";
    // Cuenta elegida (LS) pero /api/cuentas todavía no resolvió: sin conocer
    // la moneda real, guardar sería a ciegas (monto en moneda equivocada).
    if (cuentaId && !cuentaSel) return "Cargando cuentas…";
    if ((tipo === "obra" || esIngreso) && cuentaUsd && !(cot > 0))
      return "La cuenta es en dólares: falta la cotización.";
    return null;
  }, [montoFinal, tipo, esIngreso, obraSel, concepto, cuentaId, cuentaSel, cuentaUsd, cot]);

  const persistirLs = useCallback(() => {
    const prev = lsRef.current;
    const next: LsShape = {
      tipo,
      obraId: tipo === "obra" && obraId ? obraId : prev.obraId,
      cuentaPorTipo: {
        ...prev.cuentaPorTipo,
        ...(cuentaId ? { [tipo]: cuentaId } : {}),
      },
    };
    lsRef.current = next;
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* sin storage no pasa nada */
    }
  }, [tipo, obraId, cuentaId]);

  const guardar = useCallback(async () => {
    setIntento(true);
    if (motivo || guardando) return;
    setGuardando(true);
    setErrorRed(null);
    setSesionVencida(false);
    try {
      const payload: Record<string, unknown> = {
        tipo: esIngreso ? "ingreso" : tipo,
        fecha,
        cuenta_id: cuentaId,
      };
      // Candado server-side: la moneda de cuenta que VIO esta pantalla. Si
      // difiere de la real (desync de /api/cuentas), el route corta con 400.
      if (cuentaId) payload.moneda_cuenta_vista = cuentaUsd ? "USD" : "ARS";
      // Reintento tras fallo: el server dedupea una fila idéntica reciente
      // (el primer POST pudo haber comiteado aunque la respuesta se perdió).
      if (falloPrevio.current) payload.reintento = true;
      if (esIngreso) {
        payload.presupuesto_id = obraId;
        payload.descripcion = concepto.trim();
        payload.monto = montoFinal;
        if (cot > 0 && cuentaUsd) payload.cotizacion_venta_ars_por_usd = cot;
      } else if (tipo === "obra") {
        payload.presupuesto_id = obraId;
        payload.descripcion = concepto.trim();
        // Rubro fuera de /gasto (01/08, pedido de Eze): siempre sin rubro.
        payload.rubro_id = null;
        payload.importe = montoFinal;
        // Solo con cuenta USD real: modoUsd ya no sobrevive sin cuentaUsd.
        if (cot > 0 && cuentaUsd) {
          payload.cotizacion_venta_ars_por_usd = cot;
          if (casaDolar) payload.casa_dolar = casaDolar;
        }
      } else {
        payload.concepto = concepto.trim();
        payload.monto = montoFinal;
        payload.categoria =
          categoria.trim() || (tipo === "personal" ? "Varios" : null);
      }

      const res = await fetch("/api/gastos/rapido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Sesión vencida (PWA cacheada días en iOS): el middleware devuelve 401
      // JSON para /api/*; por si una versión vieja redirige a /login (page),
      // se detecta también el redirect y el HTML. [REINTENTAR] acá no sirve —
      // se muestra la salida real (link a /login).
      const esHtml = (res.headers.get("content-type") ?? "").includes("text/html");
      const fueALogin =
        res.redirected &&
        new URL(res.url, window.location.href).pathname.startsWith("/login");
      if (res.status === 401 || fueALogin || esHtml) {
        setSesionVencida(true);
        throw new Error("Sesión vencida. Entrá de nuevo y volvé a cargar el gasto.");
      }
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        id?: string;
        error?: string;
        espejo?: { ok: boolean; accion?: string; patas?: number };
      } | null;
      if (!res.ok || !body?.ok || !body.id) {
        throw new Error(body?.error ?? "No se pudo guardar. Probá de nuevo.");
      }

      persistirLs();

      const tabla = esIngreso
        ? ("cashflow_items" as const)
        : tipo === "obra"
          ? ("presupuestos_gastos" as const)
          : tipo === "empresa"
            ? ("gastos_empresa" as const)
            : ("gastos_personales" as const);
      const estado: EstadoLedger = !cuentaId
        ? "pendiente_cuenta"
        : body.espejo?.ok && (body.espejo.patas ?? 0) > 0
          ? "asentado"
          : body.espejo?.ok && body.espejo.accion === "sin_foto"
            ? "sin_foto"
            : "espejo_pendiente";
      const montoTexto =
        (esIngreso || tipo === "empresa") && cuentaUsd
          ? `US$ ${formatNumber(montoFinal, 2)}`
          : formatMoney(montoFinal);
      falloPrevio.current = false;
      setResultado({ id: body.id, tabla, montoTexto, estado });
      if (!esIngreso) setRefreshUltimos((actual) => actual + 1);
      // El gasto ya descontó en el ledger (sincronizarEspejo corre en el
      // POST): refrescar los saldos de las cajas para el próximo gasto.
      void cargarCuentas(2);
    } catch (e) {
      falloPrevio.current = true;
      setErrorRed(
        e instanceof Error ? e.message : "Error de red. Probá de nuevo."
      );
    } finally {
      setGuardando(false);
    }
  }, [
    motivo, guardando, tipo, esIngreso, fecha, cuentaId, obraId, concepto,
    montoFinal, cot, cuentaUsd, casaDolar, categoria, persistirLs, cargarCuentas,
  ]);

  /** El espejo falló al guardar: reintento manual contra el endpoint genérico. */
  const reintentarEspejo = useCallback(async () => {
    if (!resultado || reintentando) return;
    setReintentando(true);
    try {
      const res = await fetch("/api/dinero/espejo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabla: resultado.tabla, id: resultado.id }),
      });
      const b = (await res.json().catch(() => null)) as {
        ok?: boolean;
        accion?: string;
        patas?: number;
      } | null;
      if (res.ok && b?.ok && (b.patas ?? 0) > 0) {
        setResultado({ ...resultado, estado: "asentado" });
      } else if (res.ok && b?.ok && b.accion === "sin_foto") {
        setResultado({ ...resultado, estado: "sin_foto" });
      }
    } catch {
      /* sigue en pendiente */
    } finally {
      setReintentando(false);
    }
  }, [resultado, reintentando]);

  /** Contexto para la extracción por audio: el modelo elige de ESTA lista.
   * Sin rubros (rubro fuera de /gasto): el prompt omite esa línea. */
  const contextoIa = useMemo(
    () => ({
      obras: obras.map((o) => ({ id: o.presupuestoId, nombre: o.etiqueta })),
      rubros: [],
    }),
    [obras]
  );

  /** Precarga desde foto/audio. SOLO llena el formulario: guardar sigue
   * siendo un tap explícito de Eze (borrador hasta aprobación). */
  const alExtraer = useCallback(
    (d: DatosExtraidos, origen: "foto" | "audio") => {
      if (d.tipo_gasto && d.tipo_gasto !== tipo) cambiarTipo(d.tipo_gasto);
      if (d.obra_id && obras.some((o) => o.presupuestoId === d.obra_id)) {
        setObraId(d.obra_id);
      }
      if (typeof d.monto_ars === "number" && d.monto_ars > 0) {
        setModoUsd(false);
        setMontoStr(
          formatNumber(d.monto_ars, Number.isInteger(d.monto_ars) ? 0 : 2)
        );
      }
      if (d.concepto) setConcepto(d.concepto);
      if (d.fecha) setFecha(d.fecha <= hoy ? d.fecha : hoy);

      const partes: string[] = [];
      if (origen === "audio") {
        partes.push(d.transcripcion ? `«${d.transcripcion}»` : "Audio leído");
      } else {
        partes.push("Ticket leído");
      }
      if (!(typeof d.monto_ars === "number" && d.monto_ars > 0)) {
        partes.push("no encontré el monto, cargalo a mano");
      }
      if (d.tipo === "ingreso") {
        partes.push("ojo: parece un COBRO, no un gasto");
      }
      setIaNota(partes.join(" — "));
      setIaFlash(true);
      window.setTimeout(() => setIaFlash(false), 1800);
    },
    [tipo, cambiarTipo, obras, hoy]
  );

  const cargarOtro = useCallback(() => {
    setResultado(null);
    setMontoStr("");
    setUsdStr("");
    setConcepto("");
    setIntento(false);
    setErrorRed(null);
    setSesionVencida(false);
    setIaNota(null);
    falloPrevio.current = false;
    // tipo / obra / cuenta / fecha se conservan (los defaults ya persistieron).
    setTimeout(() => montoRef.current?.focus(), 60);
  }, []);

  // ── Chips ──────────────────────────────────────────────────────────────
  const chips: Array<{
    id: Exclude<SheetId, null>;
    etiqueta: string;
    valor: string;
    tono: "neutro" | "alerta" | "pendiente";
  }> = [];
  chips.push({
    id: "fecha",
    etiqueta: "Fecha",
    valor: fecha === hoy ? "Hoy" : fechaCorta(fecha),
    tono: "neutro",
  });
  if (tipo === "obra" || esIngreso) {
    chips.push({
      id: "obra",
      etiqueta: "Obra",
      valor: obraSel ? obraSel.etiqueta : "Elegir",
      tono: obraSel ? "neutro" : "alerta",
    });
  } else {
    chips.push({
      id: "categoria",
      etiqueta: "Categoría",
      valor:
        categoria.trim() || (tipo === "personal" ? "Varios" : "Sin categoría"),
      tono: "neutro",
    });
  }
  const tonoChipCls: Record<string, string> = {
    neutro: "ring-cdm-line text-cdm-muted hover:text-cdm-fg",
    alerta: "ring-amber-400/40 text-amber-300",
  };

  const entrada = (delay: number) => ({
    initial: animar && !reducir ? { opacity: 0, y: 14 } : false,
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: EASE, delay: animar ? delay : 0 },
  });

  const etiquetaMonto =
    (esIngreso || tipo === "empresa") && cuentaUsd
      ? "Monto (US$ — moneda de la cuenta)"
      : tipo === "obra" && modoUsd
        ? "Monto en US$"
        : "Monto";

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="font-geist min-h-[100dvh] bg-cdm-bg text-cdm-fg">
      <div className="mx-auto w-full max-w-md px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-44">
        {/* Mini-header propio: /gasto va SIN carcasa (captura pura). */}
        <header className="mb-6 flex items-center justify-between">
          <RavnLogo align="start" showTagline={false} sizeClassName="text-lg" />
          <Link
            href="/"
            className="font-mono-hud min-h-[44px] inline-flex items-center text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-fg"
          >
            [CENTRO DE MANDO]
          </Link>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          {resultado ? (
            /* ── Card de éxito: estado REAL del ledger, nunca mentir ── */
            <motion.section
              key="exito"
              aria-live="polite"
              className={`${CARD} text-center`}
              initial={reducir ? { opacity: 0 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.18 } }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <motion.svg
                viewBox="0 0 24 24"
                className="mx-auto mb-4 h-12 w-12 text-cdm-fg"
                aria-hidden
              >
                <motion.path
                  d="M4 12.5l5 5L20 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={reducir ? undefined : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3, ease: EASE }}
                />
              </motion.svg>
              <p className="text-4xl font-semibold tabular-nums">
                {resultado.montoTexto}
              </p>
              <p className="mt-4">
                {resultado.estado === "asentado" && (
                  <span className="font-mono-hud inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-400 ring-1 ring-emerald-400/40">
                    Asentado en el ledger
                  </span>
                )}
                {resultado.estado === "pendiente_cuenta" && (
                  <span className="font-mono-hud inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-300 ring-1 ring-amber-400/40">
                    Guardado — sin cuenta, queda pendiente
                  </span>
                )}
                {resultado.estado === "sin_foto" && (
                  <span className="font-mono-hud inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-cdm-muted ring-1 ring-cdm-line">
                    Guardado — ledger sin foto inicial
                  </span>
                )}
                {resultado.estado === "espejo_pendiente" && (
                  <span className="font-mono-hud inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-300 ring-1 ring-amber-400/40">
                    Guardado — espejo pendiente
                  </span>
                )}
              </p>
              {resultado.estado === "espejo_pendiente" && (
                <button
                  type="button"
                  onClick={() => void reintentarEspejo()}
                  disabled={reintentando}
                  className="font-mono-hud mt-3 min-h-[44px] px-3 text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg disabled:opacity-50"
                >
                  {reintentando ? "[REINTENTANDO…]" : "[REINTENTAR ESPEJO]"}
                </button>
              )}
              <div className="mt-6 flex flex-col gap-2">
                <motion.button
                  type="button"
                  onClick={cargarOtro}
                  whileTap={reducir ? undefined : { scale: 0.985 }}
                  className="font-mono-hud min-h-[52px] w-full rounded-full bg-cdm-fg text-[11px] uppercase tracking-[0.2em] text-cdm-bg transition-opacity hover:opacity-90"
                >
                  [CARGAR OTRO]
                </motion.button>
                <Link
                  href="/"
                  className="font-mono-hud inline-flex min-h-[44px] items-center justify-center text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg"
                >
                  [CENTRO DE MANDO]
                </Link>
              </div>
            </motion.section>
          ) : (
            <motion.div
              key="form"
              exit={{ opacity: 0, transition: { duration: 0.18 } }}
              className="flex flex-col gap-5"
            >
              {/* PASO 1 — tipo */}
              <motion.div
                role="radiogroup"
                aria-label="Tipo de movimiento"
                className="relative grid grid-cols-2 rounded-full p-1 ring-1 ring-cdm-line"
                {...entrada(0)}
              >
                {(["gasto", "ingreso"] as const).map((opcion) => {
                  const activo = movimiento === opcion;
                  return (
                    <button
                      key={opcion}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => {
                        setMovimiento(opcion);
                        setIntento(false);
                        setModoUsd(false);
                        if (opcion === "ingreso") {
                          setTipo("obra");
                          // Un cobro nunca hereda silenciosamente la caja del
                          // último gasto: Eze confirma explícitamente dónde
                          // entró la plata.
                          cuentaTocada.current = true;
                          setCuentaId(null);
                        } else {
                          cuentaTocada.current = false;
                          setCuentaId(lsRef.current.cuentaPorTipo?.[tipo] ?? null);
                        }
                      }}
                      className={`relative min-h-[48px] rounded-full font-mono-hud text-[11px] uppercase tracking-[0.16em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-fg ${
                        activo ? "text-cdm-fg" : "text-cdm-muted hover:text-cdm-fg"
                      }`}
                    >
                      {activo && (
                        <motion.span
                          layoutId="movimientoPill"
                          aria-hidden
                          className={`absolute inset-0 rounded-full ring-1 ${
                            opcion === "ingreso"
                              ? "bg-emerald-400/10 ring-emerald-400/40"
                              : "bg-cdm-fg/10 ring-cdm-fg/30"
                          }`}
                        />
                      )}
                      <span className="relative">
                        {opcion === "gasto" ? "Salió dinero" : "Entró dinero"}
                      </span>
                    </button>
                  );
                })}
              </motion.div>

              {!esIngreso && (
              <motion.div
                role="radiogroup"
                aria-label="Tipo de gasto"
                className="relative grid grid-cols-3 rounded-full p-1 ring-1 ring-cdm-line"
                {...entrada(0)}
              >
                {TIPOS.map((t) => {
                  const activo = tipo === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={activo}
                      onClick={() => cambiarTipo(t.id)}
                      className={`relative min-h-[44px] rounded-full font-mono-hud text-[10px] uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-fg ${
                        activo ? "text-cdm-fg" : "text-cdm-muted hover:text-cdm-fg"
                      }`}
                    >
                      {activo && (
                        <motion.span
                          layoutId="tipoPill"
                          aria-hidden
                          className="absolute inset-0 rounded-full bg-cdm-fg/10 ring-1 ring-cdm-fg/30"
                          transition={
                            reducir
                              ? { duration: 0 }
                              : { duration: 0.2, ease: EASE }
                          }
                        />
                      )}
                      <span className="relative">{t.label}</span>
                    </button>
                  );
                })}
              </motion.div>
              )}

              {/* Captura por IA: foto de ticket o dictado — precarga y listo. */}
              {!esIngreso && (
              <motion.div {...entrada(0.025)}>
                <CapturaIa
                  contexto={contextoIa}
                  deshabilitado={guardando}
                  onExtraido={alExtraer}
                />
                {iaNota && (
                  <p className="mt-2 text-xs text-cdm-muted" aria-live="polite">
                    {iaNota}
                  </p>
                )}
              </motion.div>
              )}

              {/* PASO 2 — monto protagonista */}
              <motion.section
                className={`${CARD} transition-shadow duration-500 ${
                  iaFlash ? "!ring-emerald-400/50" : ""
                }`}
                {...entrada(0.045)}
              >
                <div className="flex items-center justify-between">
                  <label htmlFor="monto" className={LABEL}>
                    {etiquetaMonto}
                  </label>
                  {(tipo === "obra" || esIngreso) && cuentaUsd && (
                    <button
                      type="button"
                      onClick={() => setModoUsd((v) => !v)}
                      className="font-mono-hud min-h-[44px] px-2 text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg"
                      aria-pressed={modoUsd}
                    >
                      {modoUsd ? "[TIPEAR EN $]" : "[TIPEAR EN US$]"}
                    </button>
                  )}
                </div>
                <div className="mt-3 flex items-baseline justify-center gap-2">
                  <span className="text-2xl text-cdm-muted" aria-hidden>
                    {(tipo === "obra" || esIngreso) && modoUsd
                      ? "US$"
                      : tipo === "empresa" && cuentaUsd
                        ? "US$"
                        : "$"}
                  </span>
                  <input
                    id="monto"
                    ref={montoRef}
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    autoComplete="off"
                    data-no-spinner
                    placeholder="0"
                    value={(tipo === "obra" || esIngreso) && modoUsd ? usdStr : montoStr}
                    onChange={(e) =>
                      (tipo === "obra" || esIngreso) && modoUsd
                        ? setUsdStr(e.target.value)
                        : setMontoStr(e.target.value)
                    }
                    className="w-full max-w-[260px] bg-transparent text-center text-6xl font-semibold tabular-nums text-cdm-fg placeholder:text-cdm-muted/40 focus-visible:outline-none"
                  />
                </div>
                {intento && !(montoFinal > 0) && (
                  <p role="alert" className="mt-2 text-center text-xs text-red-400">
                    Ingresá un monto mayor a cero.
                  </p>
                )}

                {/* Cotización: solo obra pagada desde cuenta USD (trampa 0-patas). */}
                {(tipo === "obra" || esIngreso) && cuentaUsd && (
                  <div className="mt-4 border-t border-cdm-line pt-4">
                    <label htmlFor="cot" className={LABEL}>
                      Cotización venta ($ por US$ 1)
                    </label>
                    <input
                      id="cot"
                      type="text"
                      inputMode="decimal"
                      data-no-spinner
                      autoComplete="off"
                      value={cotStr}
                      onChange={(e) => setCotStr(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-cdm-line bg-cdm-panel px-3 py-2.5 text-base tabular-nums text-cdm-fg focus-visible:border-cdm-fg/50 focus-visible:outline-none"
                    />
                    {modoUsd && montoFinal > 0 && (
                      <p className="mt-2 text-xs text-cdm-muted tabular-nums">
                        = {formatMoney(montoFinal)} ARS
                      </p>
                    )}
                    {intento && !(cot > 0) && (
                      <p role="alert" className="mt-2 text-xs text-red-400">
                        La cuenta es en dólares: falta la cotización.
                      </p>
                    )}
                  </div>
                )}
              </motion.section>

              {/* PASO 3 — concepto */}
              <motion.section
                className={`${CARD} transition-shadow duration-500 ${
                  iaFlash ? "!ring-emerald-400/50" : ""
                }`}
                {...entrada(0.09)}
              >
                <label htmlFor="concepto" className={LABEL}>
                  {esIngreso ? "Concepto del cobro" : tipo === "obra" ? "Descripción (opcional)" : "Concepto"}
                </label>
                <input
                  id="concepto"
                  type="text"
                  autoComplete="off"
                  placeholder={
                    esIngreso
                      ? "Ej. Pago recibido hoy"
                      : tipo === "obra" ? "Qué se compró / pagó" : "En qué se fue"
                  }
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-cdm-line bg-cdm-panel px-3 py-2.5 text-base text-cdm-fg placeholder:text-cdm-muted focus-visible:border-cdm-fg/50 focus-visible:outline-none"
                />
                {intento && tipo !== "obra" && !concepto.trim() && (
                  <p role="alert" className="mt-2 text-xs text-red-400">
                    Poné el concepto.
                  </p>
                )}
              </motion.section>

              {/* PASO 4 — chips de defaults editables */}
              <motion.div className="flex flex-wrap gap-2" {...entrada(0.135)}>
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSheet(c.id)}
                    className={`${CHIP_BASE} ${tonoChipCls[c.tono]} focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-fg`}
                  >
                    <span className="opacity-60">{c.etiqueta}</span>
                    <span className="max-w-[42vw] truncate normal-case tracking-normal">
                      {c.valor}
                    </span>
                  </button>
                ))}
              </motion.div>
              {intento && (tipo === "obra" || esIngreso) && !obraSel && (
                <p role="alert" className="-mt-3 text-xs text-amber-300">
                  Elegí la obra antes de guardar.
                </p>
              )}

              {/* PASO 4b — Salió de: las cajas a la vista, elegir es UN tap */}
              <motion.section {...entrada(0.16)}>
                <span className={LABEL}>{esIngreso ? "Entró en" : "Salió de"}</span>
                <div
                  role="radiogroup"
                  aria-label={esIngreso ? "Cuenta en la que entró la plata" : "Cuenta de la que salió la plata"}
                  className="mt-2 flex flex-wrap gap-2"
                >
                  {cuentas === null ? (
                    <span className="py-2 text-xs text-cdm-muted">
                      Cargando cuentas…
                    </span>
                  ) : (
                    <>
                      {cuentasVisibles.map((c) => {
                        const activa = c.id === cuentaId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="radio"
                            aria-checked={activa}
                            onClick={() => {
                              cuentaTocada.current = true;
                              setCuentaId(c.id);
                            }}
                            className={`${CHIP_BASE} focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-fg ${
                              activa
                                ? "bg-cdm-fg/10 ring-cdm-fg/30 text-cdm-fg"
                                : "ring-cdm-line text-cdm-muted hover:text-cdm-fg"
                            }`}
                          >
                            <span className="max-w-[38vw] truncate normal-case tracking-normal">
                              {c.nombre}
                            </span>
                            <span className="normal-case tracking-normal tabular-nums opacity-60">
                              {c.moneda === "USD"
                                ? `US$ ${new Intl.NumberFormat("es-AR").format(c.saldo)}`
                                : formatMoneyInt(c.saldo)}
                            </span>
                          </button>
                        );
                      })}
                      {!esIngreso && <button
                        type="button"
                        role="radio"
                        aria-checked={cuentaId === null}
                        onClick={() => {
                          cuentaTocada.current = true;
                          setCuentaId(null);
                        }}
                        className={`${CHIP_BASE} focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-fg ${
                          cuentaId === null
                            ? "ring-red-400/40 text-red-400"
                            : "ring-cdm-line text-cdm-muted hover:text-cdm-fg"
                        }`}
                      >
                        Sin cuenta
                      </button>}
                    </>
                  )}
                </div>
                {cuentas !== null && cuentaId === null && !esIngreso && (
                  <p className="mt-2 text-xs text-cdm-muted">
                    Sin cuenta se guarda igual y queda pendiente en Archivados.
                  </p>
                )}
              </motion.section>

              {errorRed && (
                <div
                  role="alert"
                  className="rounded-[16px] border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-400"
                >
                  <p>{errorRed}</p>
                  {sesionVencida ? (
                    <Link
                      href="/login?next=/gasto"
                      className="font-mono-hud mt-2 inline-flex min-h-[44px] items-center text-[10px] uppercase tracking-[0.14em] underline-offset-4 hover:underline"
                    >
                      [ENTRAR DE NUEVO]
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void guardar()}
                      className="font-mono-hud mt-2 min-h-[44px] text-[10px] uppercase tracking-[0.14em] underline-offset-4 hover:underline"
                    >
                      [REINTENTAR]
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <UltimosGastos
          refreshKey={refreshUltimos}
          onDeshecho={() => void cargarCuentas(2)}
        />
      </div>

      {/* PASO 5 — guardar sticky (solo en modo formulario) */}
      {!resultado && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-cdm-line bg-cdm-bg/90 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-md px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <motion.button
              type="button"
              onClick={() => void guardar()}
              disabled={guardando || Boolean(motivo)}
              whileTap={reducir || guardando ? undefined : { scale: 0.985 }}
              className="font-mono-hud min-h-[56px] w-full rounded-full bg-cdm-fg text-[12px] uppercase tracking-[0.24em] text-cdm-bg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {guardando
                ? "[GUARDANDO…]"
                : esIngreso
                  ? "[REGISTRAR INGRESO]"
                  : "[GUARDAR GASTO]"}
            </motion.button>
            {motivo && (
              <p className="mt-2 text-center text-xs text-cdm-muted">{motivo}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Sheets ── */}
      <Sheet open={sheet === "fecha"} titulo="Fecha" onClose={() => setSheet(null)}>
        <input
          type="date"
          value={fecha}
          max={hoy}
          onChange={(e) => {
            if (e.target.value) setFecha(e.target.value);
          }}
          className="w-full rounded-xl border border-cdm-line bg-cdm-bg px-3 py-3 text-base text-cdm-fg focus-visible:border-cdm-fg/50 focus-visible:outline-none"
          aria-label={esIngreso ? "Fecha del ingreso" : "Fecha del gasto"}
        />
        <button
          type="button"
          onClick={() => {
            setFecha(hoy);
            setSheet(null);
          }}
          className="font-mono-hud mt-3 min-h-[44px] text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg"
        >
          [HOY]
        </button>
      </Sheet>

      <Sheet open={sheet === "obra"} titulo="Obra" onClose={() => setSheet(null)}>
        <div className="max-h-[50dvh] overflow-y-auto">
          {obras.length === 0 && (
            <p className="py-3 text-sm text-cdm-muted">
              No hay obras aprobadas.
            </p>
          )}
          {obras.map((o) => (
            <button
              key={o.presupuestoId}
              type="button"
              onClick={() => {
                setObraId(o.presupuestoId);
                setSheet(null);
              }}
              className={`flex min-h-[48px] w-full items-center justify-between border-b border-cdm-line px-1 text-left text-sm transition-colors last:border-b-0 hover:text-cdm-fg ${
                o.presupuestoId === obraId ? "text-cdm-fg" : "text-cdm-muted"
              }`}
            >
              <span className="truncate">{o.etiqueta}</span>
              {o.presupuestoId === obraId && (
                <span className="font-mono-hud text-[9px] uppercase tracking-[0.14em]">
                  Elegida
                </span>
              )}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={sheet === "categoria"}
        titulo="Categoría"
        onClose={() => setSheet(null)}
      >
        <input
          type="text"
          value={categoria}
          autoComplete="off"
          placeholder={tipo === "personal" ? "Varios" : "Opcional"}
          onChange={(e) => setCategoria(e.target.value)}
          className="w-full rounded-xl border border-cdm-line bg-cdm-bg px-3 py-3 text-base text-cdm-fg placeholder:text-cdm-muted focus-visible:border-cdm-fg/50 focus-visible:outline-none"
          aria-label="Categoría del gasto"
        />
        <button
          type="button"
          onClick={() => setSheet(null)}
          className="font-mono-hud mt-3 min-h-[44px] text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg"
        >
          [LISTO]
        </button>
      </Sheet>

    </main>
  );
}
