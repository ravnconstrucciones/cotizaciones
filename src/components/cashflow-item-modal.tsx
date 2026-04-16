"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CashflowTipo } from "@/lib/cashflow-compute";
import {
  deleteCajaAdjuntoStorage,
  uploadCajaAdjunto,
  type CajaAdjuntoKind,
} from "@/lib/caja-adjunto-storage";
import { CashflowMediaCapture } from "@/components/cashflow-media-capture";
import { categoriaValidaParaTipo } from "@/lib/cashflow-validate";
import { estadoDesdeTipo } from "@/lib/cashflow-matching";
import { parseFormattedNumber, roundArs2 } from "@/lib/format-currency";
import { adjuntoKindDesdeFile } from "@/lib/gastos-storage";

const fieldCls =
  "w-full rounded-none border border-ravn-line bg-ravn-surface px-4 py-3 text-sm text-ravn-fg placeholder:text-ravn-muted focus-visible:border-ravn-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ravn-fg";

const labelCls =
  "mb-2 block text-xs font-medium uppercase tracking-wider text-ravn-muted";

export type CashflowObraOption = { id: string; nombre: string };

export type CashflowItemModalInitial = {
  id?: string;
  tipo: CashflowTipo;
  categoria: string;
  descripcion: string;
  monto_proyectado: number;
  fecha_proyectada: string;
  monto_real: number | null;
  fecha_real: string | null;
  estado: string;
  notas: string;
};

type EntradaModo = "manual" | "foto" | "audio";

type Props = {
  open: boolean;
  obraId?: string;
  obraOpciones?: CashflowObraOption[];
  presetTipo?: CashflowTipo | null;
  initial: CashflowItemModalInitial | null;
  onClose: () => void;
  onSaved: () => void;
};

function hoyInput(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = p.find((x) => x.type === "year")?.value;
  const m = p.find((x) => x.type === "month")?.value;
  const d = p.find((x) => x.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

export function CashflowItemModal({
  open,
  obraId,
  obraOpciones,
  presetTipo,
  initial,
  onClose,
  onSaved,
}: Props) {
  const selectorObras = useMemo(
    () => (obraOpciones && obraOpciones.length > 0 ? obraOpciones : null),
    [obraOpciones]
  );

  const [selectedObraId, setSelectedObraId] = useState("");
  const [tipo, setTipo] = useState<CashflowTipo>("ingreso");
  const [categoria, setCategoria] = useState("otro");
  const [descripcion, setDescripcion] = useState("");
  const [montoStr, setMontoStr] = useState("");
  const [fecha, setFecha] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entradaModo, setEntradaModo] = useState<EntradaModo>("manual");
  const [adjuntoFile, setAdjuntoFile] = useState<File | null>(null);
  const [adjuntoKind, setAdjuntoKind] = useState<CajaAdjuntoKind | null>(null);
  /** Foto/audio: datos del formulario solo después de intentar leer el comprobante (o modo manual). */
  const [mediaProcesada, setMediaProcesada] = useState(true);
  const [extrayendo, setExtrayendo] = useState(false);
  const extractReqId = useRef(0);

  const esAlta = !initial?.id;
  const tipoBloqueado = Boolean(!initial?.id && presetTipo);
  const necesitaElegirObra = Boolean(selectorObras);
  const obraFija = obraId?.trim() ?? "";
  const effectiveObraId = selectorObras ? selectedObraId : obraFija;

  const wasModalOpenRef = useRef(false);
  const prevInitialIdRef = useRef<string | undefined>(undefined);

  /** Solo al abrir el modal (no en cada re-render del padre): si no, se borraban foto y datos extraídos. */
  useEffect(() => {
    if (!open) {
      wasModalOpenRef.current = false;
      prevInitialIdRef.current = undefined;
      return;
    }

    const justOpened = !wasModalOpenRef.current;
    wasModalOpenRef.current = true;

    if (!initial) {
      if (justOpened) {
        setTipo(presetTipo ?? "ingreso");
        setCategoria("otro");
        setDescripcion("");
        setMontoStr("");
        setFecha(hoyInput());
        setError(null);
        setEntradaModo("manual");
        setAdjuntoFile(null);
        setAdjuntoKind(null);
        setMediaProcesada(true);
        setExtrayendo(false);
      }
      return;
    }

    const idChanged = prevInitialIdRef.current !== initial.id;
    prevInitialIdRef.current = initial.id;

    if (justOpened || idChanged) {
      setTipo(initial.tipo);
      setCategoria(initial.categoria);
      setDescripcion(initial.descripcion);
      const m = initial.monto_real ?? initial.monto_proyectado;
      setMontoStr(m > 0 ? String(m).replace(".", ",") : "");
      setFecha(
        (initial.fecha_real ?? initial.fecha_proyectada).slice(0, 10) || hoyInput()
      );
      setError(null);
      setMediaProcesada(true);
      setExtrayendo(false);
    }
  }, [open, initial, presetTipo]);

  useEffect(() => {
    if (!open) return;
    if (selectorObras?.length) {
      setSelectedObraId((prev) =>
        prev && selectorObras.some((o) => o.id === prev)
          ? prev
          : selectorObras[0]!.id
      );
    } else {
      setSelectedObraId("");
    }
  }, [open, selectorObras]);

  const datosVisibles =
    !esAlta ||
    Boolean(initial?.id) ||
    entradaModo === "manual" ||
    mediaProcesada;

  useEffect(() => {
    if (!open || !esAlta) return;
    if (entradaModo !== "foto" && entradaModo !== "audio") return;
    if (!adjuntoFile) {
      setMediaProcesada(false);
      return;
    }

    const id = ++extractReqId.current;
    setExtrayendo(true);
    setError(null);

    (async () => {
      try {
        const fd = new FormData();
        fd.append("file", adjuntoFile);
        const res = await fetch("/api/cashflow/extract-comprobante", {
          method: "POST",
          body: fd,
        });
        const j = (await res.json()) as {
          error?: string;
          monto_ars?: number | null;
          fecha?: string | null;
          concepto?: string;
          tipo?: string | null;
        };
        if (extractReqId.current !== id) return;
        if (!res.ok) {
          setError(j.error ?? "No se pudo leer el comprobante.");
          setMediaProcesada(true);
          return;
        }
        if (
          typeof j.monto_ars === "number" &&
          Number.isFinite(j.monto_ars) &&
          j.monto_ars > 0
        ) {
          const m = roundArs2(j.monto_ars);
          setMontoStr(String(m).replace(".", ","));
        }
        if (
          typeof j.fecha === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(j.fecha)
        ) {
          setFecha(j.fecha);
        }
        if (typeof j.concepto === "string" && j.concepto.trim()) {
          setDescripcion(j.concepto.trim());
        }
        if (!tipoBloqueado && (j.tipo === "ingreso" || j.tipo === "egreso")) {
          setTipo(j.tipo);
        }
        setMediaProcesada(true);
      } catch (e) {
        if (extractReqId.current !== id) return;
        setError(e instanceof Error ? e.message : "Error al leer el comprobante.");
        setMediaProcesada(true);
      } finally {
        if (extractReqId.current === id) setExtrayendo(false);
      }
    })();
  }, [adjuntoFile, entradaModo, open, esAlta, tipoBloqueado]);

  if (!open) return null;

  const titulo = initial?.id
    ? "Editar movimiento"
    : presetTipo === "ingreso"
      ? "Nuevo ingreso"
      : presetTipo === "egreso"
        ? "Nuevo egreso"
        : "Nuevo movimiento";

  function asignarAdjunto(file: File | null) {
    if (!file) {
      setAdjuntoFile(null);
      setAdjuntoKind(null);
      return;
    }
    const k = adjuntoKindDesdeFile(file);
    if (!k) {
      setError("Usá una imagen o un audio.");
      return;
    }
    setError(null);
    setAdjuntoFile(file);
    setAdjuntoKind(k as CajaAdjuntoKind);
  }

  function setModo(m: EntradaModo) {
    setEntradaModo(m);
    setError(null);
    if (m === "manual") {
      setAdjuntoFile(null);
      setAdjuntoKind(null);
      setMediaProcesada(true);
    } else {
      setMediaProcesada(false);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const m = roundArs2(parseFormattedNumber(montoStr));
      if (!fecha) {
        setError("Completá la fecha.");
        setSaving(false);
        return;
      }
      if (m <= 0) {
        setError("El monto debe ser mayor a cero.");
        setSaving(false);
        return;
      }
      if (esAlta && (entradaModo === "foto" || entradaModo === "audio") && extrayendo) {
        setError("Esperá a que termine de leerse el comprobante.");
        setSaving(false);
        return;
      }

      if (
        esAlta &&
        (entradaModo === "foto" || entradaModo === "audio") &&
        (!adjuntoFile || !adjuntoKind)
      ) {
        setError(
          entradaModo === "foto"
            ? "Sacá una foto o elegí una imagen."
            : "Grabá un audio."
        );
        setSaving(false);
        return;
      }

      const oid = effectiveObraId?.trim();
      if (!oid) {
        setError(
          necesitaElegirObra
            ? "Elegí obra o libreta empresa."
            : "Falta la obra."
        );
        setSaving(false);
        return;
      }

      const estado = estadoDesdeTipo(tipo);
      let cat = initial?.id ? categoria : "otro";
      if (!categoriaValidaParaTipo(tipo, cat)) cat = "otro";

      const isEdit = Boolean(initial?.id);
      const url = isEdit
        ? `/cashflow/item/${encodeURIComponent(initial!.id!)}`
        : "/cashflow/item";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
                tipo,
                categoria: cat,
                descripcion,
                monto_proyectado: m,
                fecha_proyectada: fecha,
                monto_real: m,
                fecha_real: fecha,
                estado,
              }
            : {
                obra_id: oid,
                tipo,
                categoria: cat,
                descripcion,
                monto: m,
                fecha,
              }
        ),
      });
      const j = (await res.json()) as { error?: string; item?: { id?: string } };
      if (!res.ok) {
        setError(j.error ?? "No se pudo guardar.");
        setSaving(false);
        return;
      }

      if (!isEdit && adjuntoFile && adjuntoKind && j.item?.id) {
        const itemId = String(j.item.id);
        const { path, error: upErr } = await uploadCajaAdjunto(
          oid,
          itemId,
          adjuntoFile,
          adjuntoKind
        );
        if (upErr) {
          await fetch(`/cashflow/item/${encodeURIComponent(itemId)}`, {
            method: "DELETE",
          });
          setError(
            upErr.includes("Bucket not found")
              ? "Falta el bucket de archivos (migración caja)."
              : upErr
          );
          setSaving(false);
          return;
        }
        const putRes = await fetch(
          `/cashflow/item/${encodeURIComponent(itemId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              adjunto_path: path,
              adjunto_kind: adjuntoKind,
            }),
          }
        );
        const putJ = (await putRes.json()) as { error?: string };
        if (!putRes.ok) {
          await deleteCajaAdjuntoStorage(path);
          await fetch(`/cashflow/item/${encodeURIComponent(itemId)}`, {
            method: "DELETE",
          });
          setError(putJ.error ?? "No se pudo vincular el comprobante.");
          setSaving(false);
          return;
        }
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  const modoPill = (m: EntradaModo, label: string) => (
    <button
      key={m}
      type="button"
      onClick={() => setModo(m)}
      className={`flex-1 rounded-none border-2 px-3 py-3 text-[10px] font-semibold uppercase tracking-wider transition-colors sm:py-3.5 ${
        entradaModo === m
          ? "border-ravn-accent bg-ravn-accent/15 text-ravn-fg"
          : "border-ravn-line bg-ravn-surface text-ravn-muted hover:border-ravn-fg/40 hover:text-ravn-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal
      aria-labelledby="cashflow-item-title"
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col border border-ravn-line bg-ravn-surface shadow-lg sm:max-h-[85vh]">
        <div className="border-b border-ravn-line px-5 py-4">
          <h2
            id="cashflow-item-title"
            className="font-raleway text-base font-semibold uppercase tracking-wide text-ravn-accent"
          >
            {titulo}
          </h2>
          <p className="mt-2 text-xs text-ravn-muted">
            {esAlta
              ? "Manual: cargá los datos. Foto o audio: primero el comprobante; intentamos rellenar monto y concepto y después elegís obra o libreta empresa."
              : "Libreta de caja: un solo monto y fecha; impacta el saldo al guardar."}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {initial?.id ? (
            <>
              {selectorObras ? (
                <div>
                  <span className={labelCls}>Obra</span>
                  <select
                    className={fieldCls}
                    value={selectedObraId}
                    onChange={(e) => setSelectedObraId(e.target.value)}
                  >
                    {selectorObras.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className={selectorObras ? "mt-5" : ""}>
                <span className={labelCls}>Tipo</span>
                <select
                  className={fieldCls}
                  value={tipo}
                  disabled={tipoBloqueado}
                  onChange={(e) => {
                    const t = e.target.value === "egreso" ? "egreso" : "ingreso";
                    setTipo(t);
                    if (initial?.id) setCategoria("otro");
                  }}
                >
                  <option value="ingreso">Ingreso</option>
                  <option value="egreso">Egreso</option>
                </select>
              </div>
              <div className="mt-5">
                <span className={labelCls}>Concepto</span>
                <input
                  className={fieldCls}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej. Cobro cuota / Pago proveedor"
                />
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <span className={labelCls}>Monto (ARS)</span>
                  <input
                    className={`${fieldCls} tabular-nums`}
                    inputMode="decimal"
                    value={montoStr}
                    onChange={(e) => setMontoStr(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <span className={labelCls}>Fecha</span>
                  <input
                    type="date"
                    className={fieldCls}
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className={labelCls}>Cómo lo registrás</span>
                <div className="mt-2 flex gap-2">
                  {modoPill("manual", "Manual")}
                  {modoPill("foto", "Foto")}
                  {modoPill("audio", "Audio")}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-ravn-muted">
                  Con foto o audio, el comprobante va primero: leemos monto y texto
                  con IA (podés corregir después) y recién al final elegís obra o
                  libreta empresa.
                </p>
              </div>

              {(entradaModo === "foto" || entradaModo === "audio") && (
                <div className="mt-6 border border-ravn-line border-dashed bg-ravn-subtle/20 px-4 py-4">
                  <CashflowMediaCapture
                    variant={entradaModo === "foto" ? "foto" : "audio"}
                    adjuntoFile={adjuntoFile}
                    adjuntoKind={adjuntoKind}
                    onAdjunto={asignarAdjunto}
                    onClear={() => asignarAdjunto(null)}
                    onError={(msg) => setError(msg)}
                  />
                  {adjuntoFile && extrayendo ? (
                    <p className="mt-3 text-xs text-ravn-accent">
                      Leyendo comprobante…
                    </p>
                  ) : null}
                </div>
              )}

              {datosVisibles ? (
                <>
                  <div className="mt-6">
                    <span className={labelCls}>Tipo</span>
                    <select
                      className={fieldCls}
                      value={tipo}
                      disabled={tipoBloqueado}
                      onChange={(e) => {
                        const t =
                          e.target.value === "egreso" ? "egreso" : "ingreso";
                        setTipo(t);
                      }}
                    >
                      <option value="ingreso">Ingreso</option>
                      <option value="egreso">Egreso</option>
                    </select>
                  </div>
                  <div className="mt-5">
                    <span className={labelCls}>Concepto</span>
                    <input
                      className={fieldCls}
                      value={descripcion}
                      onChange={(e) => setDescripcion(e.target.value)}
                      placeholder="Ej. Cobro cuota / Pago proveedor"
                    />
                  </div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div>
                      <span className={labelCls}>Monto (ARS)</span>
                      <input
                        className={`${fieldCls} tabular-nums`}
                        inputMode="decimal"
                        value={montoStr}
                        onChange={(e) => setMontoStr(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <span className={labelCls}>Fecha</span>
                      <input
                        type="date"
                        className={fieldCls}
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-6 text-xs text-ravn-muted">
                  Subí o grabá el comprobante; cuando termine la lectura vas a
                  poder revisar los datos y elegir obra.
                </p>
              )}

              {datosVisibles &&
              (necesitaElegirObra && selectorObras ? (
                <div className="mt-6 border-t border-ravn-line pt-6">
                  <span className={labelCls}>Obra o libreta empresa</span>
                  <select
                    className={fieldCls}
                    value={selectedObraId}
                    onChange={(e) => setSelectedObraId(e.target.value)}
                  >
                    {selectorObras.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-[10px] text-ravn-muted">
                    Elegí la obra de cliente o &quot;Empresa (gastos
                    generales)&quot; para movimientos de cuenta empresa.
                  </p>
                </div>
              ) : obraFija ? (
                <p className="mt-5 text-xs text-ravn-muted">
                  Se guardará en la obra de esta pantalla.
                </p>
              ) : null)}
            </>
          )}

          {error ? (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 border-t border-ravn-line px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-none border-2 border-ravn-line px-6 py-3 text-xs font-semibold uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-none border-2 border-ravn-accent bg-ravn-accent px-6 py-3 text-xs font-semibold uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={saving || (esAlta && extrayendo && (entradaModo === "foto" || entradaModo === "audio"))}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
