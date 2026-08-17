"use client";

import { Check, ChevronsRight, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PropuestaItem,
  PropuestaReconocimiento,
} from "../bridge/intake-contract";
import { apiUrl } from "../lib/api-url";
import { despacharOla } from "../lib/intake-client";
import { LiveTerminals, type BridgeConfig, type BridgeHealth, type WaveRequest } from "./live-terminals";

/**
 * El momento RECONOCIMIENTO en tres columnas (spec 2026-08-17
 * reconocimiento-tres-columnas): la conversación solo orquesta; lo que la ola
 * asumió —con origen y precio de referencia— vive en el tablero del MEDIO,
 * siempre vivo (banda de terminales mientras la ola mastica); las preguntas
 * van al rail DERECHO como checklist inline. Antes de la confirmación de Eze
 * NO existe receta ni cotización activa — el pie del tablero es el único
 * camino del borrador al número. Nada se muestra como "desmenuzando" si el
 * bridge está caído (regla anti-slop).
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

export type Reconocimiento = ReturnType<typeof useReconocimiento>;

/**
 * Estado y acciones del reconocimiento, compartidos por el tablero del medio
 * y el checklist del rail. La instancia vive en ControlCenter: las dos
 * columnas ven LA MISMA propuesta y las mismas respuestas.
 */
export function useReconocimiento({
  quoteId,
  bridge,
  activo,
  onConfirmada,
}: {
  quoteId: string;
  bridge: BridgeConfig | null;
  /** Solo en momento reconocimiento se lee y se pollea — en charla/entrada no. */
  activo: boolean;
  /**
   * Recibe cuántos ítems quedaron SIN precio tras la confirmación: si hay,
   * el ControlCenter encadena la ola de precios solo (pedido 1, 17/08).
   */
  onConfirmada: (sinPrecio: number) => void;
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
    hidratadaDe.current = null;
    if (activo) void leer();
  }, [leer, activo]);

  // Mientras la ola trabaja, se espera el resultado persistido.
  useEffect(() => {
    if (!activo || intake?.estado !== "esperando_ola") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void leer();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [activo, intake?.estado, leer]);

  // La propuesta pasa a estado local editable cuando llega — y se REEMPLAZA
  // si una ola relanzada (charlando a la izquierda) persiste una distinta. Se
  // compara contra lo último hidratado, no contra las ediciones locales de
  // Eze: sus cambios a mano nunca se pisan por releer lo mismo.
  const hidratadaDe = useRef<string | null>(null);
  useEffect(() => {
    if (intake?.estado !== "propuesta_lista" || !intake.propuesta) return;
    const cruda = JSON.stringify(intake.propuesta);
    if (hidratadaDe.current === cruda) return;
    hidratadaDe.current = cruda;
    setPropuesta(structuredClone(intake.propuesta) as PropuestaReconocimiento);
    setRespuestas({});
  }, [intake]);

  const relanzar = useCallback(async () => {
    setAviso("Relanzando la ola…");
    const r = await despacharOla(quoteId, bridge);
    setAviso(r.mensaje);
    if (r.ok) {
      setIntake((actual) => (actual ? { ...actual, estado: "esperando_ola", error: null } : actual));
    }
  }, [quoteId, bridge]);

  const mutarPropuesta = useCallback(
    (mutacion: (proxima: PropuestaReconocimiento) => void) => {
      setPropuesta((actual) => {
        if (!actual) return actual;
        const proxima = structuredClone(actual);
        mutacion(proxima);
        return proxima;
      });
    },
    []
  );

  const editarItem = useCallback(
    (r: number, i: number, cambios: Partial<PropuestaItem>) => {
      mutarPropuesta((proxima) => {
        proxima.rubros[r].items[i] = { ...proxima.rubros[r].items[i], ...cambios };
      });
    },
    [mutarPropuesta]
  );

  const responder = useCallback((indice: number, valor: string) => {
    setRespuestas((actual) => ({ ...actual, [indice]: valor }));
  }, []);

  const confirmar = useCallback(async () => {
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
          resumen: resumenExtra
            ? `${propuesta.resumen} · Respuestas de Eze: ${resumenExtra}`
            : propuesta.resumen,
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
        `Confirmada: ${rango}.${sinPrecio.length ? ` ${sinPrecio.length} ítem(s) sin precio: la ola los investiga en internet ahora.` : ""}`
      );
      onConfirmada(sinPrecio.length);
    } catch (error) {
      setAviso(error instanceof Error ? error.message : "La confirmación no entró.");
      setConfirmando(false);
    }
  }, [propuesta, confirmando, respuestas, quoteId, onConfirmada]);

  const preguntas = propuesta?.preguntas_abiertas ?? [];
  const sinResponder = preguntas.filter((_, i) => !respuestas[i]?.trim()).length;

  return {
    intake,
    archivos,
    cargado,
    propuesta,
    respuestas,
    aviso,
    confirmando,
    preguntas,
    sinResponder,
    leer,
    relanzar,
    mutarPropuesta,
    editarItem,
    responder,
    confirmar,
  };
}

/* ------------------------------------------------------- tablero del medio */

/**
 * La mesa de trabajo del reconocimiento: lo que la ola asumió, editable, con
 * la banda de terminales al pie — la ola se VE trabajar acá, no en un cartel.
 */
export function RecoBoard({
  reco,
  bridge,
  health,
  active,
  wave = null,
  onHealth,
  onWaveResult,
  onWaveOutcome,
}: {
  reco: Reconocimiento;
  bridge: BridgeConfig | null;
  health: BridgeHealth;
  active: boolean;
  /**
   * Ola pedida desde el composer (ruteo 17/08): en reconocimiento el mensaje
   * sale como ola de CHARLA con `momento`, y las terminales de este tablero
   * son quienes la despachan al bridge — acá la ola se VE trabajar.
   */
  wave?: WaveRequest | null;
  onHealth: (health: BridgeHealth) => void;
  onWaveResult?: (text: string) => void;
  onWaveOutcome?: (message: string) => void;
}) {
  const { intake, archivos, cargado, propuesta, aviso, leer } = reco;

  // Al terminar la ola de intake, la propuesta ya está persistida: se relee al
  // toque en vez de esperar el próximo poll de 5 segundos.
  const alResultado = useCallback(
    (text: string) => {
      onWaveResult?.(text);
      void leer();
    },
    [onWaveResult, leer]
  );

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

  let cuerpo: React.ReactNode;
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
            <button type="button" className="qz-reco__accion" onClick={() => void reco.relanzar()}>
              <RefreshCw size={14} aria-hidden="true" /> Relanzar la ola
            </button>
          </>
        ) : (
          <p>
            La ola está desmenuzando el trabajo — mirala en la banda de abajo. Cuando termine, acá
            aparece lo que asumió y a la derecha lo que te pregunta.
          </p>
        )}
      </div>
    );
  } else if (intake.estado === "error") {
    cuerpo = (
      <div className="qz-reco__estado" data-tone="alert">
        <p>
          <strong>La ola no pudo desmenuzar:</strong> {intake.error ?? "motivo desconocido"}
        </p>
        <button type="button" className="qz-reco__accion" onClick={() => void reco.relanzar()}>
          <RefreshCw size={14} aria-hidden="true" /> Relanzar la ola
        </button>
      </div>
    );
  } else if (intake.estado === "confirmada") {
    cuerpo = <p className="qz-reco__estado">Reconocimiento confirmado — recargando el tablero…</p>;
  } else if (!propuesta) {
    cuerpo = <p className="qz-reco__estado">La propuesta llegó pero no se pudo leer — recargá.</p>;
  } else {
    const maquinaria = propuesta.rubros.flatMap((rubro) =>
      rubro.items.filter((i) => i.tipo === "maquinaria")
    );
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
                  reco.mutarPropuesta((proxima) => {
                    proxima.rubros[r].nombre = event.target.value;
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
                  reco.mutarPropuesta((proxima) => {
                    proxima.rubros.splice(r, 1);
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
                    onChange={(event) => reco.editarItem(r, i, { nombre: event.target.value })}
                  />
                  <select
                    value={item.tipo}
                    aria-label="Tipo"
                    onChange={(event) => {
                      const tipo = event.target.value as PropuestaItem["tipo"];
                      reco.editarItem(r, i, {
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
                        reco.editarItem(r, i, {
                          modalidad: event.target.value as "alquiler" | "propia",
                        })
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
                      if (Number.isFinite(cantidad)) reco.editarItem(r, i, { cantidad });
                    }}
                  />
                  <select
                    value={UNIDADES.includes(item.unidad) ? item.unidad : "u"}
                    aria-label="Unidad"
                    onChange={(event) => reco.editarItem(r, i, { unidad: event.target.value })}
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
                    <span
                      className="qz-reco__precio-ref"
                      title={`Visto en ${item.precio_referencia.fuente} el ${item.precio_referencia.fecha}`}
                    >
                      ref ${item.precio_referencia.valor.toLocaleString("es-AR")}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Sacar ${item.nombre}`}
                    title="Sacar ítem"
                    onClick={() =>
                      reco.mutarPropuesta((proxima) => {
                        proxima.rubros[r].items.splice(i, 1);
                        if (proxima.rubros[r].items.length === 0) proxima.rubros.splice(r, 1);
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
                reco.mutarPropuesta((proxima) => {
                  proxima.rubros[r].items.push({
                    nombre: "Ítem nuevo",
                    tipo: "material",
                    unidad: "u",
                    cantidad: 1,
                    origen: { fuente: "agregado por Eze", confianza: "verificado" },
                  });
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

        <footer className="qz-reco__pie">
          <p role="status" aria-live="polite">
            {aviso ??
              (reco.sinResponder > 0
                ? `Quedan ${reco.sinResponder} pregunta(s) a la derecha — respondelas o dejalas como dudas y confirmá.`
                : "Revisá cantidades y rubros: al confirmar se crea la receta candidata y el motor pone los precios.")}
          </p>
          <button
            type="button"
            className="qz-send qz-reco__confirmar"
            disabled={reco.confirmando || propuesta.rubros.length === 0}
            onClick={() => void reco.confirmar()}
          >
            <Check size={15} aria-hidden="true" />
            {reco.confirmando ? "Confirmando…" : "Confirmar y cotizar"}
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
      <LiveTerminals
        bridge={bridge}
        request={wave}
        onHealth={onHealth}
        onWaveResult={alResultado}
        onWaveOutcome={onWaveOutcome}
      />
    </section>
  );
}

/* ------------------------------------------------------- checklist del rail */

/**
 * Las preguntas de la ola como checklist del rail derecho: una por fila, campo
 * de respuesta inline, tilde al responder. El orden NO cambia al tipear (nada
 * salta, nada marea); el contador de arriba dice cuántas faltan. Las vacías
 * siguen como dudas de la cotización al confirmar.
 */
export function RecoDecisiones({
  reco,
  active,
  onFold,
}: {
  reco: Reconocimiento;
  active: boolean;
  onFold: () => void;
}) {
  const { intake, preguntas, respuestas, sinResponder } = reco;
  const respondidas = preguntas.length - sinResponder;

  return (
    <section
      className="qz-decisions qz-panel"
      data-mobile-active={active}
      aria-labelledby="decisions-title"
    >
      <header className="qz-decisions__head">
        <button
          type="button"
          className="qz-decisions__fold"
          onClick={onFold}
          aria-label="Plegar lo que falta decidir"
          title="Plegar y dejarle la pantalla al tablero"
        >
          <ChevronsRight size={14} aria-hidden="true" />
        </button>
        <h2 id="decisions-title">Lo que falta decidir</h2>
        <span className="qz-decisions__count" data-alert={sinResponder > 0}>
          {sinResponder}
        </span>
      </header>

      <div className="qz-decisions__scroll">
        {preguntas.length > 0 ? (
          <>
            <p className="qz-check__progreso" role="status" aria-live="polite">
              {respondidas} de {preguntas.length} respondidas
            </p>
            <ol className="qz-check">
              {preguntas.map((pregunta, i) => {
                const hecha = Boolean(respuestas[i]?.trim());
                return (
                  <li key={i} data-done={hecha}>
                    <span className="qz-check__marca" aria-hidden="true">
                      {hecha ? <Check size={12} /> : i + 1}
                    </span>
                    <label>
                      <span>{pregunta}</span>
                      <input
                        type="text"
                        placeholder="Respondé corto acá"
                        value={respuestas[i] ?? ""}
                        onChange={(event) => reco.responder(i, event.target.value)}
                      />
                    </label>
                  </li>
                );
              })}
            </ol>
            <p className="qz-check__nota">
              Las que dejes vacías siguen como dudas de la cotización. También podés contestarlas
              charlando a la izquierda.
            </p>
          </>
        ) : intake?.estado === "esperando_ola" ? (
          <p className="qz-decisions__clear">
            La ola está desmenuzando — cuando termine, sus preguntas aparecen acá.
          </p>
        ) : intake?.estado === "error" ? (
          <p className="qz-decisions__clear">
            La ola falló — relanzala desde el tablero del medio.
          </p>
        ) : (
          <p className="qz-decisions__clear">La ola no dejó preguntas: todo asumido con fuente.</p>
        )}
      </div>
    </section>
  );
}
