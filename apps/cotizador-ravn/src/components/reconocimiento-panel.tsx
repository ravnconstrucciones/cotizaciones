"use client";

import { Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type {
  PropuestaItem,
  PropuestaReconocimiento,
} from "../bridge/intake-contract";
import { apiUrl } from "../lib/api-url";
import { despacharOla } from "../lib/intake-client";
import type { BridgeConfig, BridgeHealth } from "./live-terminals";

/**
 * El PANEL DE RECONOCIMIENTO (spec 2026-08-17): lo que la ola desmenuzó,
 * editable por Eze. Antes de su confirmación NO existe receta ni cotización
 * activa — este panel es el único camino del borrador al número. Cada dato
 * muestra su origen; lo ambiguo está en preguntas; nada se muestra como
 * "desmenuzando" si el bridge está caído (regla anti-slop).
 */

type FilaIntake = {
  estado: "esperando_ola" | "propuesta_lista" | "confirmada" | "error";
  texto: string | null;
  propuesta: unknown;
  error: string | null;
};

type ArchivoIntake = { id: string; titulo: string | null; url: string | null };

const UNIDADES = ["m2", "ml", "u", "kg", "l", "bolsa", "caja", "m3", "rollo", "dia", "global"];
const POLL_MS = 5_000;

export function ReconocimientoPanel({
  quoteId,
  bridge,
  health,
  active,
  onConfirmada,
}: {
  quoteId: string;
  bridge: BridgeConfig | null;
  health: BridgeHealth;
  active: boolean;
  onConfirmada: () => void;
}) {
  const [intake, setIntake] = useState<FilaIntake | null>(null);
  const [archivos, setArchivos] = useState<ArchivoIntake[]>([]);
  const [cargado, setCargado] = useState(false);
  const [propuesta, setPropuesta] = useState<PropuestaReconocimiento | null>(null);
  const [respuestas, setRespuestas] = useState<Record<number, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const leer = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/intake?quote=${encodeURIComponent(quoteId)}`), {
        cache: "no-store",
      });
      const cuerpo = (await res.json().catch(() => null)) as {
        intake?: FilaIntake | null;
        archivos?: ArchivoIntake[];
        error?: string;
      } | null;
      if (!res.ok) throw new Error(cuerpo?.error ?? `HTTP ${res.status}`);
      setIntake(cuerpo?.intake ?? null);
      setArchivos(cuerpo?.archivos ?? []);
      setCargado(true);
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "No se pudo leer el estado del intake.");
      setCargado(true);
    }
  }, [quoteId]);

  useEffect(() => {
    setIntake(null);
    setPropuesta(null);
    setRespuestas({});
    setAviso(null);
    setCargado(false);
    void leer();
  }, [leer]);

  // Mientras la ola trabaja, el panel espera el resultado persistido.
  useEffect(() => {
    if (intake?.estado !== "esperando_ola") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void leer();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [intake?.estado, leer]);

  // La propuesta pasa a estado local editable UNA vez, cuando llega.
  useEffect(() => {
    if (propuesta || intake?.estado !== "propuesta_lista" || !intake.propuesta) return;
    setPropuesta(structuredClone(intake.propuesta) as PropuestaReconocimiento);
  }, [intake, propuesta]);

  const relanzar = async () => {
    setAviso("Relanzando la ola…");
    const r = await despacharOla(quoteId, bridge);
    setAviso(r.mensaje);
    if (r.ok) {
      setIntake((actual) => (actual ? { ...actual, estado: "esperando_ola", error: null } : actual));
    }
  };

  const editarItem = (r: number, i: number, cambios: Partial<PropuestaItem>) => {
    setPropuesta((actual) => {
      if (!actual) return actual;
      const proxima = structuredClone(actual);
      proxima.rubros[r].items[i] = { ...proxima.rubros[r].items[i], ...cambios };
      return proxima;
    });
  };

  const confirmar = async () => {
    if (!propuesta || confirmando) return;
    setConfirmando(true);
    setAviso("Confirmando: receta candidata + precios del motor…");
    try {
      // Las preguntas respondidas salen de la lista y su respuesta queda como
      // contexto en el resumen (v1: la respuesta es contexto, no re-desmenuzado).
      const contestadas = propuesta.preguntas_abiertas
        .map((pregunta, i) => ({ pregunta, respuesta: respuestas[i]?.trim() ?? "" }))
        .filter((par) => par.respuesta);
      const finales = propuesta.preguntas_abiertas.filter((_, i) => !respuestas[i]?.trim());
      const resumenExtra = contestadas
        .map((par) => `${par.pregunta} → ${par.respuesta}`)
        .join(" · ");
      const cuerpo = {
        propuesta: {
          ...propuesta,
          resumen: resumenExtra ? `${propuesta.resumen} · Respuestas de Eze: ${resumenExtra}` : propuesta.resumen,
          preguntas_abiertas: finales,
        },
      };
      const res = await fetch(apiUrl(`/api/intake/confirmar?quote=${encodeURIComponent(quoteId)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const dato = (await res.json().catch(() => null)) as {
        ok?: boolean;
        total_min?: number | null;
        total_max?: number | null;
        sin_precio?: string[];
        error?: string;
      } | null;
      if (!res.ok || dato?.ok !== true) throw new Error(dato?.error ?? `HTTP ${res.status}`);
      const sinPrecio = dato.sin_precio ?? [];
      const rango =
        dato.total_min != null && dato.total_max != null
          ? `$${dato.total_min.toLocaleString("es-AR")}–$${dato.total_max.toLocaleString("es-AR")}`
          : "sin rango todavía";
      setAviso(
        `Confirmada: ${rango}.${sinPrecio.length ? ` ${sinPrecio.length} ítem(s) sin precio van a la cola de decisiones.` : ""}`
      );
      onConfirmada();
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "La confirmación no entró.");
      setConfirmando(false);
    }
  };

  const cabecera = (
    <header className="qz-reco__head">
      <h2>Reconocimiento del trabajo</h2>
      {archivos.length > 0 ? (
        <ul className="qz-reco__archivos">
          {archivos.map((archivo) => (
            <li key={archivo.id}>
              {archivo.url ? (
                <a href={archivo.url} target="_blank" rel="noreferrer">
                  {archivo.titulo ?? "archivo"}
                </a>
              ) : (
                <span>{archivo.titulo ?? "archivo"}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {intake?.texto ? <p className="qz-reco__texto">{intake.texto}</p> : null}
    </header>
  );

  let cuerpo: ReactNode;
  if (!cargado) {
    cuerpo = <p className="qz-reco__estado">Leyendo el estado de la puerta…</p>;
  } else if (!intake) {
    cuerpo = (
      <p className="qz-reco__estado">
        Este borrador no tiene intake registrado. Creá la cotización desde “+ Nueva cotización”
        para que la puerta lo desmenuce.
      </p>
    );
  } else if (intake.estado === "esperando_ola") {
    cuerpo = (
      <div className="qz-reco__estado">
        {health === "off" ? (
          <>
            <p>
              <strong>Bridge apagado: la ola NO está corriendo.</strong> El borrador y los archivos
              persisten — levantá el bridge (<code>npm run bridge</code>) y relanzá.
            </p>
            <button type="button" className="qz-reco__accion" onClick={() => void relanzar()}>
              <RefreshCw size={14} aria-hidden="true" /> Relanzar la ola
            </button>
          </>
        ) : (
          <p>La ola está desmenuzando — mirala trabajar en la banda de abajo. Esto se actualiza solo.</p>
        )}
      </div>
    );
  } else if (intake.estado === "error") {
    cuerpo = (
      <div className="qz-reco__estado" data-tone="alert">
        <p>
          <strong>La ola no pudo desmenuzar:</strong> {intake.error ?? "motivo desconocido"}
        </p>
        <button type="button" className="qz-reco__accion" onClick={() => void relanzar()}>
          <RefreshCw size={14} aria-hidden="true" /> Relanzar la ola
        </button>
      </div>
    );
  } else if (intake.estado === "confirmada") {
    cuerpo = <p className="qz-reco__estado">Reconocimiento confirmado — recargando el tablero…</p>;
  } else if (!propuesta) {
    cuerpo = <p className="qz-reco__estado">La propuesta llegó pero no se pudo leer — recargá.</p>;
  } else {
    const maquinaria = propuesta.rubros.flatMap((rubro) => rubro.items.filter((i) => i.tipo === "maquinaria"));
    const artefactos = propuesta.rubros.flatMap((rubro) => rubro.items.filter((i) => i.artefacto));
    cuerpo = (
      <div className="qz-reco__cuerpo">
        <p className="qz-reco__resumen">{propuesta.resumen}</p>

        {propuesta.rubros.map((rubro, r) => (
          <section key={r} className="qz-reco__rubro">
            <header>
              <input
                className="qz-reco__rubro-nombre"
                value={rubro.nombre}
                aria-label={`Nombre del rubro ${r + 1}`}
                onChange={(event) =>
                  setPropuesta((actual) => {
                    if (!actual) return actual;
                    const proxima = structuredClone(actual);
                    proxima.rubros[r].nombre = event.target.value;
                    return proxima;
                  })
                }
              />
              <span className="qz-reco__mo">
                {rubro.dias_min != null || rubro.dias_max != null
                  ? `${rubro.dias_min ?? "?"}–${rubro.dias_max ?? "?"} días`
                  : "sin días estimados"}
                {rubro.cuadrilla != null ? ` · cuadrilla ${rubro.cuadrilla}` : ""}
              </span>
              <button
                type="button"
                aria-label={`Sacar el rubro ${rubro.nombre}`}
                title="Sacar rubro"
                onClick={() =>
                  setPropuesta((actual) => {
                    if (!actual) return actual;
                    const proxima = structuredClone(actual);
                    proxima.rubros.splice(r, 1);
                    return proxima;
                  })
                }
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </header>

            <ul className="qz-reco__items">
              {rubro.items.map((item, i) => (
                <li key={i}>
                  <input
                    className="qz-reco__item-nombre"
                    value={item.nombre}
                    aria-label="Nombre del ítem"
                    onChange={(event) => editarItem(r, i, { nombre: event.target.value })}
                  />
                  <select
                    value={item.tipo}
                    aria-label="Tipo"
                    onChange={(event) => {
                      const tipo = event.target.value as PropuestaItem["tipo"];
                      editarItem(r, i, {
                        tipo,
                        modalidad: tipo === "maquinaria" ? (item.modalidad ?? "alquiler") : undefined,
                        artefacto: tipo === "material" ? item.artefacto : undefined,
                      });
                    }}
                  >
                    <option value="material">material</option>
                    <option value="mano_de_obra">mano de obra</option>
                    <option value="maquinaria">maquinaria</option>
                  </select>
                  {item.tipo === "maquinaria" ? (
                    <select
                      value={item.modalidad ?? "alquiler"}
                      aria-label="Modalidad de maquinaria"
                      onChange={(event) =>
                        editarItem(r, i, { modalidad: event.target.value as "alquiler" | "propia" })
                      }
                    >
                      <option value="alquiler">alquiler (suma)</option>
                      <option value="propia">propia (no suma)</option>
                    </select>
                  ) : null}
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={item.cantidad}
                    aria-label="Cantidad"
                    onChange={(event) => {
                      const cantidad = Number(event.target.value);
                      if (Number.isFinite(cantidad)) editarItem(r, i, { cantidad });
                    }}
                  />
                  <select
                    value={UNIDADES.includes(item.unidad) ? item.unidad : "u"}
                    aria-label="Unidad"
                    onChange={(event) => editarItem(r, i, { unidad: event.target.value })}
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <span
                    className="qz-reco__origen"
                    data-confianza={item.origen.confianza}
                    title={`Confianza: ${item.origen.confianza}`}
                  >
                    {item.origen.fuente}
                  </span>
                  {item.precio_referencia ? (
                    <span className="qz-reco__precio-ref" title={`Visto en ${item.precio_referencia.fuente} el ${item.precio_referencia.fecha}`}>
                      ref ${item.precio_referencia.valor.toLocaleString("es-AR")}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Sacar ${item.nombre}`}
                    title="Sacar ítem"
                    onClick={() =>
                      setPropuesta((actual) => {
                        if (!actual) return actual;
                        const proxima = structuredClone(actual);
                        proxima.rubros[r].items.splice(i, 1);
                        if (proxima.rubros[r].items.length === 0) proxima.rubros.splice(r, 1);
                        return proxima;
                      })
                    }
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="qz-reco__agregar"
              onClick={() =>
                setPropuesta((actual) => {
                  if (!actual) return actual;
                  const proxima = structuredClone(actual);
                  proxima.rubros[r].items.push({
                    nombre: "Ítem nuevo",
                    tipo: "material",
                    unidad: "u",
                    cantidad: 1,
                    origen: { fuente: "agregado por Eze", confianza: "verificado" },
                  });
                  return proxima;
                })
              }
            >
              <Plus size={13} aria-hidden="true" /> Ítem
            </button>
          </section>
        ))}

        {maquinaria.length > 0 ? (
          <aside className="qz-reco__grupo">
            <h3>Maquinaria</h3>
            <p>La propia se lista para logística y NO suma al costo; la alquilada se precia como un material.</p>
            <ul>
              {maquinaria.map((item, i) => (
                <li key={i}>
                  {item.nombre} — {item.modalidad === "propia" ? "propia (no suma)" : "alquiler (suma)"}
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        {artefactos.length > 0 ? (
          <aside className="qz-reco__grupo">
            <h3>Se compran e instalan</h3>
            <ul>
              {artefactos.map((item, i) => (
                <li key={i}>
                  {item.nombre} · {item.cantidad} {item.unidad}
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        {propuesta.preguntas_abiertas.length > 0 ? (
          <section className="qz-reco__preguntas">
            <h3>Lo que la ola no pudo determinar</h3>
            {propuesta.preguntas_abiertas.map((pregunta, i) => (
              <label key={i}>
                <span>{pregunta}</span>
                <input
                  type="text"
                  placeholder="Respondé acá (o dejala abierta: sigue como duda de la cotización)"
                  value={respuestas[i] ?? ""}
                  onChange={(event) =>
                    setRespuestas((actual) => ({ ...actual, [i]: event.target.value }))
                  }
                />
              </label>
            ))}
          </section>
        ) : null}

        <footer className="qz-reco__pie">
          <p role="status" aria-live="polite">
            {aviso ??
              "Revisá cantidades y rubros: al confirmar se crea la receta candidata y el motor pone los precios."}
          </p>
          <button
            type="button"
            className="qz-send qz-reco__confirmar"
            disabled={confirmando || propuesta.rubros.length === 0}
            onClick={() => void confirmar()}
          >
            <Check size={15} aria-hidden="true" />
            {confirmando ? "Confirmando…" : "Confirmar y cotizar"}
          </button>
        </footer>
      </div>
    );
  }

  return (
    <section className="qz-board" data-mobile-active={active} aria-label="Reconocimiento del trabajo">
      <div className="qz-reco qz-panel">
        {cabecera}
        {intake?.estado !== "propuesta_lista" && aviso ? (
          <p className="qz-reco__aviso" role="status" aria-live="polite">
            {aviso}
          </p>
        ) : null}
        {cuerpo}
      </div>
    </section>
  );
}
