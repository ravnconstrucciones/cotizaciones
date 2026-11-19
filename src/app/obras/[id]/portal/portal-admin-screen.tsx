"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, FileDown, Trash2 } from "lucide-react";
import { LoadingCards, PageIntro, control, surface } from "@/components/finanzas/finance-ui";
import { createClient } from "@/lib/supabase/client";
import {
  ESTADOS_RUBRO,
  TIPOS_REGISTRO,
  dinero,
  fechaCorta,
  hoyBuenosAires,
  type EstadoRubro,
  type RubroPortal,
  type TipoRegistro,
  type VistaPortal,
} from "@/lib/portal/tipos";

/**
 * Panel de Eze para el portal del cliente: activar, compartir, y cargar desde
 * el celular lo que el cliente va a ver (avance por rubro, bitácora, agenda).
 * Los pagos no se cargan acá: salen de los cobros registrados en Dinero.
 */

type Config = {
  slug: string;
  activo: boolean;
  tiene_pin: boolean;
  titulo: string | null;
  direccion: string | null;
  fecha_inicio: string | null;
  fecha_entrega: string | null;
  mostrar_pagos: boolean;
};
type Estado = {
  obra: { id: string; nombre_obra: string | null; nombre_cliente: string | null };
  portal: Config | null;
  vista: VistaPortal | null;
};
type Respuesta = Estado & { ok?: boolean; error?: string; firma?: { path: string; token: string } };

const BUCKET = "obra-archivos";
const MAX_MB = 50;
const boton = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-cdm-fg px-4 text-sm font-semibold text-cdm-bg disabled:cursor-default disabled:opacity-50";
const botonSuave = `${control} inline-flex cursor-pointer items-center justify-center gap-2 font-medium`;
const etiqueta = "block text-xs font-medium text-cdm-muted";

export function PortalAdminScreen({ presupuestoId }: { presupuestoId: string }) {
  const [data, setData] = useState<Estado | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [pin, setPin] = useState("");
  const [guardada, setGuardada] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState("");

  const api = `/api/obras/${presupuestoId}/portal`;

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(api, { cache: "no-store" });
      const j = (await r.json()) as Respuesta;
      if (!r.ok) throw new Error(j.error ?? "No se pudo cargar.");
      setData({ obra: j.obra, portal: j.portal, vista: j.vista });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    }
  }, [api]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Toda escritura pasa por acá: manda la acción y refresca con lo que devuelve el server. */
  const accion = useCallback(
    async (cuerpo: Record<string, unknown>, ok?: string): Promise<Respuesta | null> => {
      setOcupado(true);
      setError("");
      setAviso("");
      try {
        const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
        const j = (await r.json()) as Respuesta;
        if (!r.ok) throw new Error(j.error ?? "No se pudo guardar.");
        setData({ obra: j.obra, portal: j.portal, vista: j.vista });
        if (ok) setAviso(ok);
        return j;
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [api]
  );

  async function copiar(texto: string, cual: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      setError("No se pudo copiar. Mantené apretado el texto para copiarlo a mano.");
    }
  }

  const portal = data?.portal ?? null;
  const vista = data?.vista ?? null;
  const link = portal && typeof window !== "undefined" ? `${window.location.origin}/o/${portal.slug}` : "";
  const entrada = typeof window !== "undefined" ? `${window.location.origin}/o` : "/o";
  const nombreEntrada = portal?.titulo?.trim() || data?.obra?.nombre_obra?.trim() || "";
  const borradores = vista?.registros.filter((r) => r.estado === "borrador") ?? [];
  const publicados = vista?.registros.filter((r) => r.estado === "publicado") ?? [];

  return (
    <div className="font-raleway mx-auto max-w-3xl px-4 py-6 pb-24 text-cdm-fg sm:px-8">
      <Link href={`/obras/${presupuestoId}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-cdm-muted">
        <ArrowLeft size={16} />
        Volver a la obra
      </Link>

      {!data ? (
        error ? (
          <p role="alert" className={`${surface} p-4 text-sm`}>
            {error}{" "}
            <button onClick={() => void cargar()} className="underline">
              Reintentar
            </button>
          </p>
        ) : (
          <LoadingCards />
        )
      ) : (
        <>
          <PageIntro
            eyebrow="Portal del cliente"
            title={data.obra.nombre_obra ?? "Obra"}
            description="Lo que cargás acá es lo que ve tu cliente con su enlace y su contraseña."
          />

          <div aria-live="polite" className="mb-4 min-h-6 text-sm">
            {error ? <p role="alert" className="font-medium text-[var(--cdm-negativo)]">{error}</p> : null}
            {!error && aviso ? <p className="text-cdm-muted">{aviso}</p> : null}
          </div>

          {/* 1 · Acceso */}
          <section className={`${surface} mb-4 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Acceso del cliente</h2>
                <p className="mt-1 text-sm text-cdm-muted">
                  {!portal?.tiene_pin
                    ? "Poné la contraseña para poder activar el portal."
                    : portal.activo
                      ? "Activo: el enlace funciona con la contraseña."
                      : "Apagado: el enlace no abre nada."}
                </p>
              </div>
              <button
                type="button"
                disabled={ocupado || !portal?.tiene_pin}
                onClick={() => accion({ accion: "config", activo: !portal?.activo }, portal?.activo ? "Portal apagado." : "Portal activo.")}
                className={portal?.activo ? botonSuave : boton}
              >
                {portal?.activo ? "Apagar portal" : "Activar portal"}
              </button>
            </div>

            {portal ? (
              <div className="mt-5 grid gap-3 border-t border-cdm-line pt-5">
                <div>
                  <span className={etiqueta}>Cómo entra el cliente</span>
                  <p className="mt-1 text-sm">
                    En <code className="break-all">{entrada}</code> escribe el nombre <strong>{nombreEntrada || "—"}</strong> y la contraseña.
                    El nombre es el título visible de abajo (o el de la obra si está vacío); no distingue mayúsculas ni tildes.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 break-all text-xs text-cdm-muted">Enlace directo: {link}</code>
                    <button type="button" onClick={() => copiar(link, "link")} className={botonSuave}>
                      {copiado === "link" ? <Check size={16} /> : <Copy size={16} />}
                      {copiado === "link" ? "Copiado" : "Copiar enlace"}
                    </button>
                  </div>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const clave = pin.trim();
                    const r = await accion({ accion: "pin", clave }, "Contraseña guardada. Los accesos anteriores dejaron de valer.");
                    if (r) {
                      setGuardada(clave);
                      setPin("");
                    }
                  }}
                >
                  <label htmlFor="portal-clave" className={etiqueta}>
                    {portal.tiene_pin ? "Cambiar contraseña" : "Contraseña de la obra"}
                  </label>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <input
                      id="portal-clave"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.slice(0, 40))}
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="Entre 6 y 40 caracteres"
                      className={`${control} min-w-0 flex-1`}
                    />
                    <button type="submit" disabled={ocupado || pin.trim().length < 6} className={boton}>
                      Guardar contraseña
                    </button>
                  </div>
                  {guardada ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <code className="break-all text-lg font-semibold">{guardada}</code>
                      <button
                        type="button"
                        onClick={() => copiar(`Te paso el acceso a tu obra:\n${entrada}\nObra: ${nombreEntrada}\nContraseña: ${guardada}`, "msj")}
                        className={botonSuave}
                      >
                        {copiado === "msj" ? <Check size={16} /> : <Copy size={16} />}
                        {copiado === "msj" ? "Copiado" : "Copiar mensaje"}
                      </button>
                      <p className="w-full text-xs text-cdm-muted">Anotala ahora: se guarda cifrada y no se vuelve a mostrar. Si la perdés, ponés una nueva.</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-cdm-muted">
                      {portal.tiene_pin ? "Ya hay una contraseña vigente. No se puede volver a ver; si hace falta, poné una nueva." : "Todavía no hay contraseña."}
                    </p>
                  )}
                </form>
              </div>
            ) : (
              <button type="button" disabled={ocupado} onClick={() => accion({ accion: "crear" }, "Portal creado. Ahora poné la contraseña.")} className={`${boton} mt-5`}>
                Crear portal
              </button>
            )}

            {portal ? (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-cdm-line pt-5">
                <Link href={`/obras/${presupuestoId}/portal/vista`} className={botonSuave}>
                  <ExternalLink size={16} />
                  Ver como el cliente
                </Link>
                <Link href={`/obras/${presupuestoId}/portal/resumen`} className={botonSuave}>
                  <FileDown size={16} />
                  Resumen PDF
                </Link>
              </div>
            ) : null}
          </section>

          {portal && vista ? (
            <>
              <DatosObra key={JSON.stringify(portal)} portal={portal} vista={vista} ocupado={ocupado} accion={accion} />
              <Rubros rubros={vista.rubros} ocupado={ocupado} accion={accion} />
              <NuevoRegistro presupuestoId={presupuestoId} rubros={vista.rubros} ocupado={ocupado} accion={accion} setError={setError} setAviso={setAviso} />

              {borradores.length ? (
                <section className={`${surface} mb-4 p-5`}>
                  <h2 className="text-lg font-semibold tracking-tight">Para aprobar ({borradores.length})</h2>
                  <p className="mt-1 text-sm text-cdm-muted">Borradores que el cliente todavía no ve.</p>
                  <ul className="mt-4 grid gap-3">
                    {borradores.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-cdm-line pt-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-cdm-muted">
                            {fechaCorta(r.fecha)} · {TIPOS_REGISTRO[r.tipo]}
                            {r.origen === "bot" ? " · cargado por el bot" : ""}
                          </p>
                          <p className="mt-1 font-semibold">{r.titulo}</p>
                          {r.texto ? <p className="mt-1 whitespace-pre-wrap text-sm text-cdm-muted">{r.texto}</p> : null}
                        </div>
                        <div className="flex gap-2">
                          <button type="button" disabled={ocupado} onClick={() => accion({ accion: "registro_publicar", registro_id: r.id }, "Publicado.")} className={boton}>
                            Publicar
                          </button>
                          <Borrar etiqueta="Borrar borrador" ocupado={ocupado} onConfirm={() => accion({ accion: "registro_borrar", registro_id: r.id }, "Borrador eliminado.")} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <Agenda vista={vista} ocupado={ocupado} accion={accion} />

              <section className={`${surface} mb-4 p-5`}>
                <h2 className="text-lg font-semibold tracking-tight">Bitácora publicada ({publicados.length})</h2>
                {publicados.length ? (
                  <ul className="mt-4 grid gap-3">
                    {publicados.map((r) => (
                      <li key={r.id} className="flex items-start justify-between gap-3 border-t border-cdm-line pt-3">
                        <div className="min-w-0">
                          <p className="text-xs text-cdm-muted">
                            {fechaCorta(r.fecha)} · {TIPOS_REGISTRO[r.tipo]}
                            {r.mediaTipo ? ` · con ${r.mediaTipo === "video" ? "video" : "foto"}` : ""}
                          </p>
                          <p className="mt-1 font-medium">{r.titulo}</p>
                        </div>
                        <Borrar etiqueta={`Borrar ${r.titulo}`} ocupado={ocupado} onConfirm={() => accion({ accion: "registro_borrar", registro_id: r.id }, "Registro eliminado.")} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-cdm-muted">Todavía no publicaste nada.</p>
                )}
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

type Accion = (cuerpo: Record<string, unknown>, ok?: string) => Promise<Respuesta | null>;

/** Borrado en dos toques: el primero arma, el segundo confirma. */
function Borrar({ etiqueta: nombre, ocupado, onConfirm }: { etiqueta: string; ocupado: boolean; onConfirm: () => void }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(t);
  }, [armado]);
  return (
    <button
      type="button"
      disabled={ocupado}
      aria-label={armado ? `Confirmar: ${nombre}` : nombre}
      onClick={() => (armado ? onConfirm() : setArmado(true))}
      className={`${botonSuave} shrink-0 ${armado ? "border-[var(--cdm-negativo)] text-[var(--cdm-negativo)]" : "text-cdm-muted"}`}
    >
      <Trash2 size={16} />
      {armado ? "Confirmar" : null}
    </button>
  );
}

function DatosObra({ portal, vista, ocupado, accion }: { portal: Config; vista: VistaPortal; ocupado: boolean; accion: Accion }) {
  const [f, setF] = useState({
    titulo: portal.titulo ?? "",
    direccion: portal.direccion ?? "",
    fecha_inicio: portal.fecha_inicio ?? "",
    fecha_entrega: portal.fecha_entrega ?? "",
  });
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });
  return (
    <section className={`${surface} mb-4 p-5`}>
      <h2 className="text-lg font-semibold tracking-tight">Datos que ve el cliente</h2>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void accion({ accion: "config", ...f }, "Datos guardados.");
        }}
      >
        <label className={`${etiqueta} sm:col-span-2`}>
          Nombre de la obra
          <input {...campo("titulo")} placeholder={vista.obra.nombre} className={`${control} mt-1 w-full`} />
        </label>
        <label className={`${etiqueta} sm:col-span-2`}>
          Dirección
          <input {...campo("direccion")} className={`${control} mt-1 w-full`} autoComplete="off" />
        </label>
        <label className={etiqueta}>
          Inicio
          <input type="date" {...campo("fecha_inicio")} className={`${control} mt-1 w-full`} />
        </label>
        <label className={etiqueta}>
          Entrega estimada
          <input type="date" {...campo("fecha_entrega")} className={`${control} mt-1 w-full`} />
        </label>
        <button type="submit" disabled={ocupado} className={`${boton} sm:col-span-2 sm:justify-self-start`}>
          Guardar datos
        </button>
      </form>

      <div className="mt-5 border-t border-cdm-line pt-5">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={portal.mostrar_pagos}
            disabled={ocupado}
            onChange={(e) => void accion({ accion: "config", mostrar_pagos: e.target.checked }, e.target.checked ? "El cliente ve los pagos." : "Pagos ocultos.")}
            className="h-5 w-5 accent-current"
          />
          Mostrarle los pagos al cliente
        </label>
        <p className="mt-1 text-xs leading-relaxed text-cdm-muted">
          {vista.pagos
            ? `Hoy vería: presupuesto ${dinero(vista.pagos.resumen.total, vista.pagos.resumen.moneda)}, pagado ${dinero(vista.pagos.resumen.pagado, vista.pagos.resumen.moneda)}, saldo ${dinero(vista.pagos.resumen.saldo, vista.pagos.resumen.moneda)}. Sale del contrato y de los cobros registrados en Dinero.`
            : portal.mostrar_pagos
              ? "Está activado, pero la obra no tiene importe de contrato cargado: el cliente no ve la sección hasta que lo tenga."
              : "Sale del contrato de la obra y de los cobros registrados en Dinero. No se carga acá."}
        </p>
      </div>
    </section>
  );
}

function Rubros({ rubros, ocupado, accion }: { rubros: RubroPortal[]; ocupado: boolean; accion: Accion }) {
  const [nuevos, setNuevos] = useState("");
  return (
    <section className={`${surface} mb-4 p-5`}>
      <h2 className="text-lg font-semibold tracking-tight">Rubros</h2>
      <p className="mt-1 text-sm opacity-75">El cliente ve el estado de cada rubro y qué se hace. Sin porcentajes.</p>
      <ul className="mt-4 grid gap-4">
        {rubros.map((r) => (
          <FilaRubro key={`${r.id}-${r.estado}-${r.tareas ?? ""}`} r={r} ocupado={ocupado} accion={accion} />
        ))}
      </ul>
      <form
        className="mt-5 flex flex-wrap items-end gap-2 border-t border-cdm-line pt-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await accion({ accion: "rubros_agregar", nombres: nuevos.split(",") }, "Rubros agregados.");
          if (ok) setNuevos("");
        }}
      >
        <label className={`${etiqueta} min-w-0 flex-1`}>
          Agregar rubros (separados por coma)
          <input
            value={nuevos}
            onChange={(e) => setNuevos(e.target.value)}
            placeholder="Demolición, Instalaciones, Revestimientos"
            className={`${control} mt-1 w-full`}
          />
        </label>
        <button type="submit" disabled={ocupado || !nuevos.trim()} className={boton}>
          Agregar
        </button>
      </form>
    </section>
  );
}

function FilaRubro({ r, ocupado, accion }: { r: RubroPortal; ocupado: boolean; accion: Accion }) {
  const [tareas, setTareas] = useState(r.tareas ?? "");
  const [estado, setEstado] = useState<EstadoRubro>(r.estado);
  const cambio = tareas.trim() !== (r.tareas ?? "") || estado !== r.estado;
  return (
    <li className="border-t border-cdm-line pt-4 first:border-t-0 first:pt-0">
      <span className="font-medium">{r.nombre}</span>
      <label className={`${etiqueta} mt-2 block`}>
        Qué se hace (una tarea por renglón)
        <textarea
          value={tareas}
          onChange={(e) => setTareas(e.target.value)}
          rows={3}
          maxLength={1500}
          placeholder={"Picado del revestimiento viejo\nImpermeabilización\nColocación de porcelanato"}
          className={`${control} mt-1 h-auto w-full py-2 leading-snug`}
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoRubro)} aria-label={`Estado de ${r.nombre}`} className={control}>
          {(Object.keys(ESTADOS_RUBRO) as EstadoRubro[]).map((k) => (
            <option key={k} value={k}>
              {ESTADOS_RUBRO[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={ocupado || !cambio}
          onClick={() => accion({ accion: "rubro_guardar", rubro_id: r.id, tareas, estado }, `${r.nombre}: guardado.`)}
          className={boton}
        >
          Guardar
        </button>
        <span className="ml-auto">
          <Borrar etiqueta={`Borrar el rubro ${r.nombre}`} ocupado={ocupado} onConfirm={() => accion({ accion: "rubro_borrar", rubro_id: r.id }, "Rubro eliminado.")} />
        </span>
      </div>
    </li>
  );
}

function NuevoRegistro({
  presupuestoId,
  rubros,
  ocupado,
  accion,
  setError,
  setAviso,
}: {
  presupuestoId: string;
  rubros: RubroPortal[];
  ocupado: boolean;
  accion: Accion;
  setError: (s: string) => void;
  setAviso: (s: string) => void;
}) {
  const vacio = { tipo: "avance" as TipoRegistro, rubro_id: "", fecha: hoyBuenosAires(), titulo: "", texto: "", link_externo: "", producto: "", marca: "", color: "", estadoMat: "Definido", importe: "", moneda: "ARS" };
  const [f, setF] = useState(vacio);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    if (f.tipo === "ticket" && (!archivo || !archivo.type.startsWith("image/"))) {
      setError("El ticket necesita la foto del comprobante.");
      return;
    }
    let mediaPath = "";
    if (archivo) {
      if (archivo.size > MAX_MB * 1024 * 1024) {
        setError(`El archivo supera los ${MAX_MB} MB. Para videos largos, subilo a YouTube o Drive y pegá el enlace.`);
        return;
      }
      setSubiendo(true);
      setAviso(`Subiendo ${archivo.name}…`);
      try {
        const firma = await accion({ accion: "firmar", filename: archivo.name });
        if (!firma?.firma) return;
        const { error: eUp } = await createClient()
          .storage.from(BUCKET)
          .uploadToSignedUrl(firma.firma.path, firma.firma.token, archivo, { contentType: archivo.type || "application/octet-stream" });
        if (eUp) {
          setError(`No se pudo subir el archivo: ${eUp.message}`);
          return;
        }
        mediaPath = firma.firma.path;
      } finally {
        setSubiendo(false);
      }
    }
    const ok = await accion(
      {
        accion: "registro_crear",
        tipo: f.tipo,
        rubro_id: f.rubro_id,
        fecha: f.fecha,
        titulo: f.titulo,
        texto: f.texto,
        link_externo: f.link_externo,
        media_path: mediaPath,
        material: { producto: f.producto, marca: f.marca, color: f.color, estado: f.estadoMat },
        importe: f.importe,
        moneda: f.moneda,
      },
      f.tipo === "ticket" ? "Ticket publicado." : "Publicado en la bitácora."
    );
    if (ok) {
      setF({ ...vacio, rubro_id: f.rubro_id });
      setArchivo(null);
      setVuelta((v) => v + 1);
    }
  }

  return (
    <section className={`${surface} mb-4 p-5`}>
      <h2 className="text-lg font-semibold tracking-tight">Nuevo registro</h2>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={publicar}>
        <label className={etiqueta}>
          Tipo
          <select value={f.tipo} onChange={set("tipo")} className={`${control} mt-1 w-full`}>
            {(Object.keys(TIPOS_REGISTRO) as TipoRegistro[]).map((k) => (
              <option key={k} value={k}>
                {TIPOS_REGISTRO[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Rubro
          <select value={f.rubro_id} onChange={set("rubro_id")} className={`${control} mt-1 w-full`}>
            <option value="">General</option>
            {rubros.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className={`${etiqueta} sm:col-span-2`}>
          Título
          <input required value={f.titulo} onChange={set("titulo")} placeholder={f.tipo === "ticket" ? "Corralón — cemento y arena" : "Carpeta de nivelación terminada"} className={`${control} mt-1 w-full`} />
        </label>
        <label className={`${etiqueta} sm:col-span-2`}>
          Qué se hizo y qué sigue
          <textarea value={f.texto} onChange={set("texto")} rows={4} className={`${control} mt-1 w-full`} />
        </label>
        {f.tipo === "material" ? (
          <>
            <label className={etiqueta}>
              Producto
              <input value={f.producto} onChange={set("producto")} placeholder="Porcelanato 60×120" className={`${control} mt-1 w-full`} />
            </label>
            <label className={etiqueta}>
              Marca / modelo
              <input value={f.marca} onChange={set("marca")} className={`${control} mt-1 w-full`} />
            </label>
            <label className={etiqueta}>
              Color / terminación
              <input value={f.color} onChange={set("color")} className={`${control} mt-1 w-full`} />
            </label>
            <label className={etiqueta}>
              Estado del material
              <select value={f.estadoMat} onChange={set("estadoMat")} className={`${control} mt-1 w-full`}>
                {["Definido", "Comprado", "En obra", "Colocado"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {f.tipo === "ticket" ? (
          <>
            <label className={etiqueta}>
              Importe del ticket
              <input required inputMode="decimal" value={f.importe} onChange={set("importe")} placeholder="12.500" className={`${control} mt-1 w-full`} />
            </label>
            <label className={etiqueta}>
              Moneda
              <select value={f.moneda} onChange={set("moneda")} className={`${control} mt-1 w-full`}>
                <option value="ARS">Pesos</option>
                <option value="USD">Dólares</option>
              </select>
            </label>
          </>
        ) : null}
        <label className={etiqueta}>
          {f.tipo === "ticket" ? "Foto del ticket" : `Foto o video (hasta ${MAX_MB} MB)`}
          <input
            key={vuelta}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className={`${control} mt-1 w-full`}
          />
        </label>
        <label className={etiqueta}>
          Fecha
          <input type="date" required value={f.fecha} onChange={set("fecha")} className={`${control} mt-1 w-full`} />
        </label>
        <label className={`${etiqueta} sm:col-span-2`}>
          Enlace a video largo (YouTube oculto o Drive)
          <input type="url" inputMode="url" value={f.link_externo} onChange={set("link_externo")} placeholder="https://" className={`${control} mt-1 w-full`} />
        </label>
        <button type="submit" disabled={ocupado || subiendo || !f.titulo.trim()} className={`${boton} sm:col-span-2`}>
          {subiendo ? "Subiendo archivo…" : f.tipo === "ticket" ? "Publicar ticket" : "Publicar en la bitácora"}
        </button>
      </form>
    </section>
  );
}

function Agenda({ vista, ocupado, accion }: { vista: VistaPortal; ocupado: boolean; accion: Accion }) {
  const vacio = { fecha: "", hora: "", titulo: "", quien: "", detalle: "" };
  const [f, setF] = useState(vacio);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const eventos = [...vista.agenda].sort((a, b) => `${a.fecha}${a.hora ?? ""}`.localeCompare(`${b.fecha}${b.hora ?? ""}`));
  return (
    <section className={`${surface} mb-4 p-5`}>
      <h2 className="text-lg font-semibold tracking-tight">Agenda de la obra</h2>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await accion({ accion: "agenda_crear", ...f }, "Agendado.");
          if (ok) setF(vacio);
        }}
      >
        <label className={etiqueta}>
          Día
          <input type="date" required value={f.fecha} onChange={set("fecha")} className={`${control} mt-1 w-full`} />
        </label>
        <label className={etiqueta}>
          Hora (opcional)
          <input type="time" value={f.hora} onChange={set("hora")} className={`${control} mt-1 w-full`} />
        </label>
        <label className={`${etiqueta} sm:col-span-2`}>
          Qué pasa
          <input required value={f.titulo} onChange={set("titulo")} placeholder="Prueba de hermeticidad de gas" className={`${control} mt-1 w-full`} />
        </label>
        <label className={etiqueta}>
          Quién va (opcional)
          <input value={f.quien} onChange={set("quien")} placeholder="Gasista matriculado" className={`${control} mt-1 w-full`} />
        </label>
        <label className={etiqueta}>
          Detalle (opcional)
          <input value={f.detalle} onChange={set("detalle")} placeholder="Necesitamos acceso a la cocina" className={`${control} mt-1 w-full`} />
        </label>
        <button type="submit" disabled={ocupado || !f.fecha || !f.titulo.trim()} className={`${boton} sm:col-span-2 sm:justify-self-start`}>
          Agendar
        </button>
      </form>
      {eventos.length ? (
        <ul className="mt-5 grid gap-3">
          {eventos.map((e) => (
            <li key={e.id} className={`flex items-start justify-between gap-3 border-t border-cdm-line pt-3 ${e.fecha < vista.hoy ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <p className="text-xs tabular-nums text-cdm-muted">
                  {fechaCorta(e.fecha)}
                  {e.hora ? ` · ${e.hora} h` : ""}
                  {e.fecha < vista.hoy ? " · ya pasó" : ""}
                </p>
                <p className="mt-1 font-medium">{e.titulo}</p>
                {e.quien || e.detalle ? <p className="mt-0.5 text-sm text-cdm-muted">{[e.quien, e.detalle].filter(Boolean).join(" — ")}</p> : null}
              </div>
              <Borrar etiqueta={`Borrar ${e.titulo}`} ocupado={ocupado} onConfirm={() => accion({ accion: "agenda_borrar", evento_id: e.id }, "Evento eliminado.")} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
