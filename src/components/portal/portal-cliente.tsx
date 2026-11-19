"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ESTADOS_RUBRO,
  TIPOS_REGISTRO,
  dinero,
  fechaCorta,
  fechaRelativa,
  lineasTareas,
  partesFecha,
  partirAgenda,
  resumenRubros,
  semana,
  totalTickets,
  type EventoAgenda,
  type RegistroPortal,
  type TipoRegistro,
  type VistaPortal,
} from "@/lib/portal/tipos";
import { AMBAR_SALDO, Barra, EASE, Etiqueta, Seccion, VERDE_PAGADO, Vacio, Wordmark } from "./portal-ui";

/**
 * Lo que ve el cliente de su obra. Una sola pantalla, en este orden:
 * portada con estado de los rubros → calendario de la semana → rubros (qué se hace) → avances en video →
 * materiales → pagos (con recibos) → tickets → bitácora.
 * Sin porcentajes de avance (pedido de Eze, 15/11/2026): el avance se cuenta en rubros.
 */

type Filtro = { clase: "todo" } | { clase: "tipo"; id: TipoRegistro } | { clase: "rubro"; id: string };

export function PortalCliente({
  vista,
  resumenHref,
  slug,
  aviso,
}: {
  vista: VistaPortal;
  resumenHref: string;
  /** Sólo en el portal real: habilita "Salir". */
  slug?: string;
  /** Franja superior para la vista previa de Eze. */
  aviso?: string;
}) {
  const quieto = useReducedMotion();
  const [filtro, setFiltro] = useState<Filtro>({ clase: "todo" });
  const [verPagos, setVerPagos] = useState(false);

  // Materiales, tickets y videos tienen apartado propio: no se repiten en la bitácora.
  const esVideo = (r: RegistroPortal) => r.tipo === "video" || r.mediaTipo === "video";
  const materiales = vista.registros.filter((r) => r.tipo === "material");
  const tickets = vista.registros.filter((r) => r.tipo === "ticket");
  const videos = vista.registros.filter((r) => r.tipo !== "material" && r.tipo !== "ticket" && esVideo(r));
  const bitacora = vista.registros.filter((r) => r.tipo !== "material" && r.tipo !== "ticket" && !esVideo(r));
  const sumaTickets = totalTickets(tickets);
  const registros = bitacora.filter((r) =>
    filtro.clase === "todo" ? true : filtro.clase === "tipo" ? r.tipo === filtro.id : r.rubroId === filtro.id
  );
  const rubroActivo = filtro.clase === "rubro" ? vista.rubros.find((r) => r.id === filtro.id) : null;
  const tiposUsados = (Object.keys(TIPOS_REGISTRO) as TipoRegistro[]).filter((t) => bitacora.some((r) => r.tipo === t));
  const resumen = resumenRubros(vista.rubros);
  const nombreRubro = (id: string | null) => vista.rubros.find((x) => x.id === id)?.nombre ?? null;

  async function salir() {
    if (!slug) return;
    await fetch(`/api/portal/${slug}/acceso`, { method: "DELETE" }).catch(() => {});
    window.location.reload();
  }

  function elegirRubro(id: string) {
    setFiltro((f) => (f.clase === "rubro" && f.id === id ? { clase: "todo" } : { clase: "rubro", id }));
    document.getElementById("bitacora")?.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
  }

  const meta = [
    vista.obra.direccion,
    vista.obra.inicio && `Inicio ${fechaCorta(vista.obra.inicio)}`,
    vista.obra.entrega && `Entrega estimada ${fechaCorta(vista.obra.entrega)}`,
  ].filter(Boolean) as string[];

  return (
    <div
      className="min-h-dvh bg-[#070707] text-[#f2efe8] antialiased"
      style={{ fontFamily: '-apple-system, system-ui, "Helvetica Neue", Arial, sans-serif' }}
    >
      {aviso ? (
        <p className="border-b border-[#f2efe8]/15 bg-[#f2efe8] px-5 py-2 text-center text-[12px] font-semibold tracking-[-0.01em] text-[#070707]">
          {aviso}
        </p>
      ) : null}

      <div className="mx-auto w-full max-w-3xl px-5 pb-20 sm:px-8">
        <header className="flex min-h-16 items-center justify-between gap-4 py-5">
          <Wordmark className="text-[15px]" />
          <nav className="flex items-center gap-1" aria-label="Acciones">
            <a
              href={resumenHref}
              className="inline-flex min-h-11 items-center gap-2 px-3 text-[14px] font-semibold tracking-[-0.015em] text-[#f2efe8]/80 transition-colors hover:text-[#f2efe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2efe8]"
            >
              <Download size={15} strokeWidth={1.5} aria-hidden />
              Resumen PDF
            </a>
            {slug ? (
              <button
                type="button"
                onClick={salir}
                className="inline-flex min-h-11 cursor-pointer items-center px-3 text-[14px] text-[#f2efe8]/75 transition-colors hover:text-[#f2efe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2efe8]"
              >
                Salir
              </button>
            ) : null}
          </nav>
        </header>

        <main>
          {/* Portada */}
          <motion.section
            className="pb-12 pt-8 sm:pb-16 sm:pt-14"
            initial={quieto ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <Etiqueta>{resumen.obraTerminada ? "Obra terminada" : "Obra en curso"}</Etiqueta>
            <h1 className="mt-3 text-balance text-[clamp(34px,8.5vw,60px)] font-semibold leading-[1.02] tracking-[-0.04em]">
              {vista.obra.nombre}
            </h1>
            {meta.length ? (
              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[16px] text-[#f2efe8]/75">
                {meta.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </p>
            ) : null}

            {resumen.total ? (
              <div className="mt-12">
                <p className="text-[clamp(26px,6.5vw,38px)] font-semibold leading-[1.1] tracking-[-0.035em]">
                  {resumen.terminados} de {resumen.total} {resumen.total === 1 ? "rubro terminado" : "rubros terminados"}
                </p>
                {/* Un tramo por rubro: lleno = terminado, medio = en curso, vacío = pendiente. */}
                <ol className="mt-5 flex gap-1.5" aria-label="Estado de cada rubro">
                  {vista.rubros.map((r) => (
                    <li
                      key={r.id}
                      title={`${r.nombre}: ${ESTADOS_RUBRO[r.estado]}`}
                      className={`h-1.5 flex-1 ${r.estado === "terminado" ? "bg-[#f2efe8]" : r.estado === "en_curso" ? "bg-[#f2efe8]/45" : "bg-[#f2efe8]/15"}`}
                    >
                      <span className="sr-only">
                        {r.nombre}: {ESTADOS_RUBRO[r.estado]}
                      </span>
                    </li>
                  ))}
                </ol>
                {resumen.enCurso || resumen.pendientes ? (
                  <p className="mt-3 text-[14px] text-[#f2efe8]/75">
                    {[resumen.enCurso && `${resumen.enCurso} en curso`, resumen.pendientes && `${resumen.pendientes} ${resumen.pendientes === 1 ? "pendiente" : "pendientes"}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {vista.obra.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vista.obra.fotoUrl}
                alt={`Foto de ${vista.obra.nombre}`}
                className="mt-12 aspect-[16/10] w-full object-cover"
                loading="eager"
              />
            ) : null}
          </motion.section>

          {/* Calendario de la semana */}
          <CalendarioSemana agenda={vista.agenda} hoy={vista.hoy} />

          {/* Rubros */}
          <Seccion
            titulo="Rubros de tu obra"
            lateral={<Etiqueta>{vista.rubros.length} {vista.rubros.length === 1 ? "rubro" : "rubros"}</Etiqueta>}
          >
            {vista.rubros.length ? (
              <ul>
                {vista.rubros.map((r) => {
                  const cantidad = bitacora.filter((x) => x.rubroId === r.id).length;
                  const tareas = lineasTareas(r.tareas);
                  const activo = filtro.clase === "rubro" && filtro.id === r.id;
                  return (
                    <li key={r.id} className="border-b border-[#f2efe8]/15 first:border-t">
                      <button
                        type="button"
                        onClick={() => elegirRubro(r.id)}
                        aria-pressed={activo}
                        className={`group block w-full cursor-pointer px-0 py-5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2efe8] ${activo ? "bg-[#f2efe8]/[0.06] px-4" : "hover:bg-[#f2efe8]/[0.04]"}`}
                      >
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-[19px] font-semibold tracking-[-0.02em]">{r.nombre}</span>
                          <Etiqueta className={`shrink-0 ${r.estado === "pendiente" ? "" : "text-[#f2efe8]"}`}>
                            {r.estado === "terminado" ? "■ " : r.estado === "en_curso" ? "◧ " : "□ "}
                            {ESTADOS_RUBRO[r.estado]}
                          </Etiqueta>
                        </div>
                        {tareas.length ? (
                          <ul className="mt-3 grid gap-1.5 text-[16px] leading-[1.5] text-[#f2efe8]/80">
                            {tareas.map((t, i) => (
                              <li key={i} className="grid grid-cols-[14px_minmax(0,1fr)]">
                                <span aria-hidden className="text-[#f2efe8]/45">–</span>
                                <span>{t}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {cantidad ? (
                          <span className="mt-3 inline-flex items-center gap-1 text-[14px] text-[#f2efe8]/75 group-hover:text-[#f2efe8]">
                            Ver {cantidad} {cantidad === 1 ? "registro" : "registros"} en la bitácora
                            <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden className="rotate-90" />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Vacio>Estamos cargando los rubros de tu obra. Vas a ver acá qué se hace en cada uno y en qué estado está.</Vacio>
            )}
          </Seccion>

          {/* Avances en video */}
          {videos.length ? (
            <Seccion titulo="Avances en video" lateral={<Etiqueta>{videos.length} {videos.length === 1 ? "video" : "videos"}</Etiqueta>}>
              <ol className="grid gap-10">
                {videos.map((r) => (
                  <Entrada key={r.id} r={r} rubro={nombreRubro(r.rubroId)} />
                ))}
              </ol>
            </Seccion>
          ) : null}

          {/* Materiales */}
          {materiales.length ? (
            <Seccion titulo="Materiales" lateral={<Etiqueta>{materiales.length} {materiales.length === 1 ? "material" : "materiales"}</Etiqueta>}>
              <ul>
                {materiales.map((m) => (
                  <Material key={m.id} m={m} rubro={nombreRubro(m.rubroId)} />
                ))}
              </ul>
            </Seccion>
          ) : null}

          {/* Pagos */}
          {vista.pagos ? (
            <Seccion titulo="Pagos" lateral={<Etiqueta className="!text-[#5fd08a]">{vista.pagos.resumen.pct}% abonado</Etiqueta>}>
              <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {(
                  [
                    ["Presupuesto", vista.pagos.resumen.total, undefined],
                    ["Pagado", vista.pagos.resumen.pagado, VERDE_PAGADO],
                    ["Falta pagar", vista.pagos.resumen.saldo, vista.pagos.resumen.saldo > 0 ? AMBAR_SALDO : VERDE_PAGADO],
                  ] as const
                ).map(([nombre, monto, color]) => (
                  <div key={nombre}>
                    <dt>
                      <Etiqueta>{nombre}</Etiqueta>
                    </dt>
                    <dd className="mt-2 text-[clamp(26px,6.5vw,34px)] font-semibold tabular-nums leading-none tracking-[-0.04em]" style={color ? { color } : undefined}>
                      {dinero(monto, vista.pagos!.resumen.moneda)}
                    </dd>
                  </div>
                ))}
              </dl>
              {vista.pagos.presupuestoUrl ? (
                <a
                  href={vista.pagos.presupuestoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex min-h-11 items-center gap-2 border border-[#f2efe8]/30 px-4 text-[14px] font-semibold tracking-[-0.015em] transition-colors hover:border-[#f2efe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2efe8]"
                >
                  <FileText size={16} strokeWidth={1.5} aria-hidden />
                  Ver el presupuesto
                </a>
              ) : null}
              <div className="mt-8">
                <Barra pct={vista.pagos.resumen.pct} alto={10} etiqueta="Porcentaje abonado del presupuesto" color={VERDE_PAGADO} fondo={`${AMBAR_SALDO}59`} />
                <div className="mt-2 flex justify-between text-[14px] tabular-nums text-[#f2efe8]/75">
                  <span>{dinero(0, vista.pagos.resumen.moneda)}</span>
                  <span>{dinero(vista.pagos.resumen.total, vista.pagos.resumen.moneda)}</span>
                </div>
              </div>

              {vista.pagos.detalle.length ? (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setVerPagos((v) => !v)}
                    aria-expanded={verPagos}
                    className="inline-flex min-h-11 cursor-pointer items-center text-[14px] font-semibold tracking-[-0.015em] text-[#f2efe8]/75 underline underline-offset-4 transition-colors hover:text-[#f2efe8]"
                  >
                    {verPagos ? "Ocultar el detalle" : `Ver el detalle de pagos (${vista.pagos.detalle.length})`}
                  </button>
                  <AnimatePresence initial={false}>
                    {verPagos ? (
                      <motion.ul
                        key="pagos"
                        initial={quieto ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-2"
                      >
                        {vista.pagos.detalle.map((p) => (
                          <li key={p.id} className="flex items-baseline justify-between gap-4 border-b border-[#f2efe8]/15 py-3 text-[16px] first:border-t">
                            <span className="text-[#f2efe8]/75 tabular-nums">{fechaCorta(p.fecha)}</span>
                            <span className="flex-1">{p.concepto}</span>
                            <span className="font-semibold tabular-nums">{dinero(p.monto, p.moneda)}</span>
                          </li>
                        ))}
                      </motion.ul>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : null}
              {vista.pagos.resumen.otraMoneda > 0 ? (
                <p className="mt-4 text-[14px] leading-relaxed text-[#f2efe8]/75">
                  Los pagos recibidos en {vista.pagos.resumen.moneda === "USD" ? "pesos" : "dólares"} figuran en el detalle y no están sumados en esta barra.
                </p>
              ) : null}
              {vista.pagos.recibos.length ? (
                <div className="mt-10">
                  <Etiqueta>Recibos</Etiqueta>
                  <ul className="mt-3">
                    {vista.pagos.recibos.map((r) => (
                      <li key={r.id} className="border-b border-[#f2efe8]/15 first:border-t">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-h-14 items-center gap-4 py-3 text-[16px] transition-colors hover:bg-[#f2efe8]/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2efe8]"
                        >
                          <FileText size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-[#f2efe8]/75" />
                          <span className="flex-1 font-semibold tracking-[-0.015em]">{r.titulo}</span>
                          <span className="tabular-nums text-[#f2efe8]/75">{fechaCorta(r.fecha)}</span>
                          <Download size={15} strokeWidth={1.5} aria-hidden className="shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Seccion>
          ) : null}

          {/* Tickets */}
          {tickets.length ? (
            <Seccion titulo="Tickets de compra" lateral={<Etiqueta>{tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}</Etiqueta>}>
              <p className="mb-6 text-[clamp(22px,5.5vw,30px)] font-semibold tabular-nums leading-none tracking-[-0.04em]">
                {[sumaTickets.ARS > 0 && dinero(sumaTickets.ARS, "ARS"), sumaTickets.USD > 0 && dinero(sumaTickets.USD, "USD")].filter(Boolean).join(" · ")}
                <span className="ml-3 align-middle text-[14px] font-normal tracking-normal text-[#f2efe8]/75">en total</span>
              </p>
              <ul>
                {tickets.map((t) => (
                  <Ticket key={t.id} t={t} rubro={nombreRubro(t.rubroId)} />
                ))}
              </ul>
            </Seccion>
          ) : null}

          {/* Bitácora */}
          <Seccion
            id="bitacora"
            titulo={rubroActivo ? rubroActivo.nombre : "Bitácora de obra"}
            lateral={<Etiqueta>{registros.length} {registros.length === 1 ? "registro" : "registros"}</Etiqueta>}
          >
            {bitacora.length ? (
              <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filtrar la bitácora">
                <Chip activo={filtro.clase === "todo"} onClick={() => setFiltro({ clase: "todo" })}>
                  Todo
                </Chip>
                {tiposUsados.map((t) => (
                  <Chip key={t} activo={filtro.clase === "tipo" && filtro.id === t} onClick={() => setFiltro({ clase: "tipo", id: t })}>
                    {TIPOS_REGISTRO[t]}
                  </Chip>
                ))}
                {rubroActivo ? (
                  <Chip activo onClick={() => setFiltro({ clase: "todo" })}>
                    {rubroActivo.nombre} ×
                  </Chip>
                ) : null}
              </div>
            ) : null}

            {registros.length ? (
              <ol className="grid gap-10">
                {registros.map((r) => (
                  <Entrada key={r.id} r={r} rubro={nombreRubro(r.rubroId)} />
                ))}
              </ol>
            ) : (
              <Vacio>
                {bitacora.length
                  ? "No hay registros en esta vista."
                  : "Cada avance y decisión de tu obra queda registrado acá, con fecha."}
              </Vacio>
            )}
          </Seccion>
        </main>

        <footer className="flex flex-wrap items-baseline justify-between gap-3 border-t border-[#f2efe8]/15 pt-8 text-[14px] text-[#f2efe8]/75">
          <span>Nosotros nos encargamos. De todo.</span>
          <a href="https://ravnconstrucciones.com.ar" className="underline underline-offset-4 hover:text-[#f2efe8]">
            ravnconstrucciones.com.ar
          </a>
        </footer>
      </div>
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`inline-flex min-h-11 cursor-pointer items-center border px-4 text-[14px] font-semibold tracking-[-0.015em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2efe8] ${
        activo ? "border-[#f2efe8] bg-[#f2efe8] text-[#070707]" : "border-[#f2efe8]/25 text-[#f2efe8]/80 hover:border-[#f2efe8]/60"
      }`}
    >
      {children}
    </button>
  );
}

function DetalleEvento({ e }: { e: EventoAgenda }) {
  if (!e.quien && !e.detalle) return null;
  return (
    <p className="mt-3 text-[16px] leading-relaxed text-[#f2efe8]/80">
      {e.quien ? <span className="text-[#f2efe8]">{e.quien}</span> : null}
      {e.quien && e.detalle ? " — " : null}
      {e.detalle}
    </p>
  );
}

/** Un material de la obra: qué es, marca, terminación y si ya está definido, comprado o colocado. */
function Material({ m, rubro }: { m: RegistroPortal; rubro: string | null }) {
  const detalle = [m.material?.producto, m.material?.marca, m.material?.color].filter(Boolean).join(" · ");
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 border-b border-[#f2efe8]/15 py-5 first:border-t">
      <div className="min-w-0">
        <p className="text-[18px] font-semibold leading-snug tracking-[-0.02em]">{m.titulo}</p>
        {detalle ? <p className="mt-1 text-[16px] leading-[1.5] text-[#f2efe8]/80">{detalle}</p> : null}
        {m.texto ? <p className="mt-1 whitespace-pre-wrap text-[16px] leading-[1.5] text-[#f2efe8]/80 [overflow-wrap:anywhere]">{m.texto}</p> : null}
        {rubro ? <p className="mt-2 text-[14px] text-[#f2efe8]/75">{rubro}</p> : null}
        {m.mediaUrl && m.mediaTipo === "imagen" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.mediaUrl} alt={m.titulo} loading="lazy" className="mt-4 max-h-[60vh] w-full bg-[#0e0e0d] object-contain" />
        ) : null}
        {m.linkExterno ? (
          <a
            href={m.linkExterno}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold tracking-[-0.015em] underline underline-offset-4"
          >
            Ver el producto
            <ArrowUpRight size={15} strokeWidth={1.5} aria-hidden />
          </a>
        ) : null}
      </div>
      {m.material?.estado ? <Etiqueta className="pt-1 text-right text-[#f2efe8]">{m.material.estado}</Etiqueta> : null}
    </li>
  );
}

function Entrada({ r, rubro }: { r: RegistroPortal; rubro: string | null }) {
  return (
    <li>
      <article>
        {r.mediaUrl ? (
          <div className="mb-4 bg-[#0e0e0d]">
            {r.mediaTipo === "video" ? (
              <video src={r.mediaUrl} controls playsInline preload="metadata" className="max-h-[78vh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.mediaUrl} alt={r.titulo} loading="lazy" className="max-h-[78vh] w-full object-contain" />
            )}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] ${r.tipo === "resuelto" ? "bg-[#f2efe8] text-[#070707]" : "border border-[#f2efe8]/30 text-[#f2efe8]"}`}>
            {TIPOS_REGISTRO[r.tipo]}
          </span>
          {rubro ? <span className="text-[14px] text-[#f2efe8]/75">{rubro}</span> : null}
          <time dateTime={r.fecha} className="text-[14px] tabular-nums text-[#f2efe8]/75">
            {fechaCorta(r.fecha)}
          </time>
        </div>
        <h3 className="mt-3 text-[20px] font-semibold leading-snug tracking-[-0.025em]">{r.titulo}</h3>
        {r.texto ? <p className="mt-2 max-w-[62ch] whitespace-pre-wrap text-[16px] leading-[1.6] text-[#f2efe8]/80 [overflow-wrap:anywhere]">{r.texto}</p> : null}
        {r.linkExterno ? (
          <a
            href={r.linkExterno}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold tracking-[-0.015em] underline underline-offset-4"
          >
            {r.tipo === "video" ? "Ver el video completo" : "Abrir el enlace"}
            <ArrowUpRight size={15} strokeWidth={1.5} aria-hidden />
          </a>
        ) : null}
      </article>
    </li>
  );
}

/** Semana de lunes a domingo con lo agendado cada día; se puede ir a la semana anterior o siguiente. */
function CalendarioSemana({ agenda, hoy }: { agenda: EventoAgenda[]; hoy: string }) {
  const [offset, setOffset] = useState(0);
  const dias = useMemo(() => semana(hoy, offset), [hoy, offset]);
  const porDia = useMemo(() => {
    const m = new Map<string, EventoAgenda[]>();
    for (const e of partirAgenda(agenda, "0000-00-00").proximos) m.set(e.fecha, [...(m.get(e.fecha) ?? []), e]);
    return m;
  }, [agenda]);
  const enLaSemana = dias.reduce((n, d) => n + (porDia.get(d)?.length ?? 0), 0);
  const siguiente = partirAgenda(agenda, hoy).proximos.find((e) => e.fecha > dias[6]);
  const primero = partesFecha(dias[0]);
  const ultimo = partesFecha(dias[6]);
  const nombreSemana = offset === 0 ? "Esta semana" : offset === 1 ? "Semana que viene" : offset === -1 ? "Semana pasada" : null;
  const rango = `${primero.num}${primero.mes === ultimo.mes ? "" : ` ${primero.mes}`} – ${ultimo.num} ${ultimo.mes}`;
  const flecha =
    "inline-flex size-11 cursor-pointer items-center justify-center border border-[#f2efe8]/25 text-[#f2efe8]/80 transition-colors hover:border-[#f2efe8]/60 hover:text-[#f2efe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2efe8]";

  return (
    <Seccion titulo="Calendario de la semana" lateral={<Etiqueta>Agenda</Etiqueta>}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-[16px]">
          {nombreSemana ? <span className="font-semibold tracking-[-0.015em]">{nombreSemana}</span> : null}
          <span className={`tabular-nums text-[#f2efe8]/75 ${nombreSemana ? "ml-2" : ""}`}>{rango}</span>
        </p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label="Semana anterior" className={flecha}>
            <ChevronLeft size={18} strokeWidth={1.5} aria-hidden />
          </button>
          {offset !== 0 ? (
            <button type="button" onClick={() => setOffset(0)} className={`${flecha} w-auto px-3 text-[14px] font-semibold`}>
              Hoy
            </button>
          ) : null}
          <button type="button" onClick={() => setOffset((o) => o + 1)} aria-label="Semana siguiente" className={flecha}>
            <ChevronRight size={18} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>

      <ol aria-live="polite">
        {dias.map((d) => {
          const f = partesFecha(d);
          const eventos = porDia.get(d) ?? [];
          const esHoy = d === hoy;
          const paso = d < hoy;
          return (
            <li
              key={d}
              className={`grid grid-cols-[64px_minmax(0,1fr)] gap-4 border-b border-[#f2efe8]/15 py-4 first:border-t ${esHoy ? "bg-[#f2efe8]/[0.06] px-3" : ""} ${paso && !esHoy ? "text-[#f2efe8]/60" : ""}`}
            >
              <div className="leading-none">
                <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] opacity-80">{esHoy ? "Hoy" : f.dia.slice(0, 3)}</span>
                <span className="mt-1 block text-[26px] font-semibold tabular-nums tracking-[-0.04em]">{f.num}</span>
              </div>
              {eventos.length ? (
                <ul className="grid min-w-0 gap-3">
                  {eventos.map((e) => (
                    <li key={e.id}>
                      <p className="text-[16px] font-semibold leading-snug tracking-[-0.015em]">
                        {e.hora ? <span className="mr-2 font-normal tabular-nums opacity-80">{e.hora} h</span> : null}
                        {e.titulo}
                      </p>
                      <DetalleEvento e={e} />
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="self-center text-[14px] text-[#f2efe8]/40">—</span>
              )}
            </li>
          );
        })}
      </ol>

      {!enLaSemana && siguiente ? (
        <p className="mt-4 text-[16px] text-[#f2efe8]/80">
          Lo próximo: <span className="font-semibold text-[#f2efe8]">{fechaRelativa(siguiente.fecha, hoy)}</span>
          {siguiente.hora ? ` · ${siguiente.hora} h` : ""} — {siguiente.titulo}
        </p>
      ) : null}
      {!agenda.length ? (
        <p className="mt-4 text-[14px] leading-relaxed text-[#f2efe8]/75">
          Cuando coordinemos visitas y trabajos, aparecen acá con día, horario y quién va.
        </p>
      ) : null}
    </Seccion>
  );
}

/** Ticket de compra: qué se compró, cuánto salió y la foto del comprobante. */
function Ticket({ t, rubro }: { t: RegistroPortal; rubro: string | null }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <li className="border-b border-[#f2efe8]/15 py-4 first:border-t">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold leading-snug tracking-[-0.02em]">{t.titulo}</p>
          <p className="mt-1 text-[14px] text-[#f2efe8]/75">
            {[fechaCorta(t.fecha), rubro].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="text-[18px] font-semibold tabular-nums tracking-[-0.02em]">{t.importe != null ? dinero(t.importe, t.moneda) : ""}</span>
      </div>
      {t.texto ? <p className="mt-2 whitespace-pre-wrap text-[16px] leading-[1.5] text-[#f2efe8]/80 [overflow-wrap:anywhere]">{t.texto}</p> : null}
      {t.mediaUrl ? (
        <>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="mt-2 inline-flex min-h-11 cursor-pointer items-center text-[14px] font-semibold tracking-[-0.015em] text-[#f2efe8]/75 underline underline-offset-4 transition-colors hover:text-[#f2efe8]"
          >
            {abierto ? "Ocultar el ticket" : "Ver el ticket"}
          </button>
          {abierto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.mediaUrl} alt={`Ticket: ${t.titulo}`} loading="lazy" className="mt-2 max-h-[80vh] w-full bg-[#0e0e0d] object-contain" />
          ) : null}
        </>
      ) : null}
    </li>
  );
}
