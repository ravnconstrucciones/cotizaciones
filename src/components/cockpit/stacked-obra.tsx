"use client";

import Link from "next/link";
import {
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  Camera,
  CircleDollarSign,
  ExternalLink,
  FileSearch,
  FileText,
  ImagePlus,
  NotebookPen,
  Receipt,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { formatMoneyInt } from "@/lib/format-currency";
import type { FotoNodo, NodoArtefacto, TipoArtefacto } from "@/lib/obra-orbital";

/**
 * Carpeta de obra v3: stacked glass cards (reemplaza al orbital v2 — Eze
 * quería acceso directo a cada sección y poder cargar fotos/docs desde el
 * celu). Cada artefacto es una card apilada (sticky + scale al scrollear,
 * ref. stacking glass cards de 21st.dev pero con framer-motion — sin GSAP,
 * regla de no sumar dependencias) con su contenido completo adentro:
 * Fotos sube desde cámara/galería, Bitácora carga avances, Diagnóstico
 * pide el doc a la Mac. ADN RAVN: radius 0, tokens cdm, cero color.
 */

const ICONO: Record<TipoArtefacto, React.ElementType> = {
  presupuesto: FileText,
  diagnostico: FileSearch,
  fotos: Camera,
  bitacora: NotebookPen,
  resumen: CircleDollarSign,
  gastos: Receipt,
};

/** Orden de uso en obra: lo que se toca parado en la obra va arriba. */
const ORDEN: TipoArtefacto[] = [
  "fotos",
  "bitacora",
  "presupuesto",
  "diagnostico",
  "gastos",
  "resumen",
];

/** Alto de la fila de chips sticky — las cards se apilan debajo de ella. */
const TOPE_CHIPS = 44;
const PASO_APILADO = 14;

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type StackedObraProps = {
  nodos: NodoArtefacto[];
  /** Margen al día (propuesta − gastado), null si la obra no tiene propuesta. */
  margenAlDia: number | null;
  onBorrarFoto: (id: string) => Promise<boolean>;
  /** Sube un archivo al bucket + fila. Devuelve mensaje de error o null. */
  onSubirArchivo: (
    file: File,
    tipo: "foto" | "documento"
  ) => Promise<string | null>;
  /** Inserta un avance en la bitácora. Devuelve true si salió bien. */
  onAgregarAvance: (texto: string) => Promise<boolean>;
  /** Encola el diagnóstico en la Mac. Devuelve el mensaje a mostrar. */
  onPedirDiagnostico: (detalle: string) => Promise<string>;
};

/** Miniatura lazy: intenta la transformación de Storage y cae al original. */
function Miniatura({ foto, onClick }: { foto: FotoNodo; onClick: () => void }) {
  const [src, setSrc] = useState(foto.thumbUrl ?? foto.url);
  if (!src) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={foto.titulo ?? "Foto de obra"}
      className="block aspect-square w-full overflow-hidden border border-cdm-line bg-cdm-fg/5 transition-opacity hover:opacity-80"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL efímera, fuera del optimizador */}
      <img
        src={src}
        alt={foto.titulo ?? "Foto de obra"}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => {
          if (foto.url && src !== foto.url) setSrc(foto.url);
        }}
      />
    </button>
  );
}

function Lightbox({
  foto,
  borrando,
  onBorrar,
  onCerrar,
}: {
  foto: FotoNodo;
  borrando: boolean;
  onBorrar: () => void;
  onCerrar: () => void;
}) {
  const [armado, setArmado] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-cdm-bg/95 backdrop-blur-md"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={foto.titulo ?? "Foto de obra"}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono-hud min-w-0 truncate text-[10px] uppercase tracking-[0.18em] text-cdm-muted">
          {foto.titulo ?? "Foto de obra"}
          {foto.creadoAt && (
            <span className="ml-3 text-cdm-muted/60">
              {new Date(foto.creadoAt).toLocaleDateString("es-AR")}
            </span>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={borrando}
            onClick={() => (armado ? onBorrar() : setArmado(true))}
            className={`font-mono-hud flex items-center gap-1.5 border px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] transition-colors disabled:opacity-40 ${
              armado
                ? "border-red-400 bg-red-400/10 text-red-400"
                : "border-cdm-line text-cdm-muted hover:border-red-400/60 hover:text-red-400"
            }`}
          >
            <Trash2 size={12} />
            {borrando ? "Borrando…" : armado ? "Confirmar borrado" : "Borrar"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="border border-cdm-line p-1.5 text-cdm-muted transition-colors hover:border-cdm-accent hover:text-cdm-accent"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {foto.url && (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL efímera
          <img
            src={foto.url}
            alt={foto.titulo ?? "Foto de obra"}
            className="max-h-full max-w-full border border-cdm-line object-contain shadow-[0_0_80px_var(--cdm-glow)]"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
}

/** Card glass apilada: sticky bajo los chips + scale sutil al ser tapada. */
function CardApilada({
  nodo,
  index,
  total,
  progreso,
  animar,
  children,
  accion,
}: {
  nodo: NodoArtefacto;
  index: number;
  total: number;
  progreso: MotionValue<number>;
  /** false con prefers-reduced-motion: la card apila sin scale. */
  animar: boolean;
  children: ReactNode;
  /** Acción propia de la card, a la derecha del título (ej. subir foto). */
  accion?: ReactNode;
}) {
  const Icono = ICONO[nodo.tipo];
  // Al avanzar el scroll de la lista, la card ya apilada se achica apenas
  // (mismo gesto que las stacking cards de referencia, sin GSAP).
  const scale = useTransform(
    progreso,
    [index / total, 1],
    [1, 1 - (total - index) * 0.015]
  );
  return (
    <motion.section
      id={`card-${nodo.tipo}`}
      style={{
        top: TOPE_CHIPS + index * PASO_APILADO,
        ...(animar ? { scale } : null),
        transformOrigin: "center top",
        background:
          "linear-gradient(150deg, var(--cdm-lg-hi-1), var(--cdm-lg-hi-2) 55%, transparent)",
      }}
      className="sticky isolate mb-4 border border-cdm-line bg-cdm-bg/85 shadow-[0_18px_50px_-16px_rgba(0,0,0,0.65)] backdrop-blur-xl backdrop-saturate-150"
    >
      {/* Brillo de vidrio: línea superior + reflejo lateral, tokens cdm. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-2 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--cdm-gleam), transparent)",
          opacity: 0.35,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-2/3 w-px"
        style={{
          background: "linear-gradient(180deg, var(--cdm-glow), transparent)",
        }}
      />
      <header className="flex items-center justify-between gap-3 border-b border-cdm-line/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icono
            size={15}
            className={nodo.vivo ? "text-cdm-fg" : "text-cdm-fg/35"}
          />
          <h2 className="font-mono-hud truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-cdm-fg">
            {nodo.nombre}
          </h2>
          <span className="font-mono-hud shrink-0 text-[9px] uppercase tracking-[0.18em] text-cdm-muted">
            {nodo.vivo ? nodo.detalle ?? "" : "vacío"}
          </span>
        </div>
        {accion}
      </header>
      <div className="max-h-[52dvh] overflow-y-auto overscroll-contain px-4 py-3 text-[11px] text-cdm-fg/80">
        {children}
      </div>
    </motion.section>
  );
}

/** Botón que abre un input de archivo oculto. */
function BotonSubir({
  icono: Icono,
  label,
  accept,
  capture,
  multiple,
  disabled,
  onFiles,
}: {
  icono: React.ElementType;
  label: string;
  accept: string;
  capture?: "environment";
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const alCambiar = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) onFiles(files);
  };
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="font-mono-hud flex items-center gap-1.5 border border-cdm-line px-2.5 py-1.5 text-[9px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:border-cdm-accent/60 hover:text-cdm-accent disabled:opacity-40"
      >
        <Icono size={12} />
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        onChange={alCambiar}
        className="hidden"
      />
    </>
  );
}

export function StackedObra({
  nodos,
  margenAlDia,
  onBorrarFoto,
  onSubirArchivo,
  onAgregarAvance,
  onPedirDiagnostico,
}: StackedObraProps) {
  const reducirMovimiento = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    container: scrollRef,
    target: listaRef,
    offset: ["start start", "end end"],
  });

  const [lightbox, setLightbox] = useState<FotoNodo | null>(null);
  const [borrando, setBorrando] = useState(false);
  // Subidas: contador por tipo para el estado "Subiendo…" + último error.
  const [subiendo, setSubiendo] = useState(0);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  // Bitácora
  const [avanceTexto, setAvanceTexto] = useState("");
  const [enviandoAvance, setEnviandoAvance] = useState(false);
  // Diagnóstico
  const [diagTexto, setDiagTexto] = useState("");
  const [pidiendoDiag, setPidiendoDiag] = useState(false);
  const [diagMsg, setDiagMsg] = useState<string | null>(null);

  const ordenados = ORDEN.map((t) => nodos.find((n) => n.tipo === t)).filter(
    (n): n is NodoArtefacto => Boolean(n)
  );
  const total = ordenados.length;

  const subir = async (files: File[], tipo: "foto" | "documento") => {
    setErrorSubida(null);
    setSubiendo((s) => s + files.length);
    try {
      for (const file of files) {
        const err = await onSubirArchivo(file, tipo);
        if (err) setErrorSubida(err);
        setSubiendo((s) => Math.max(0, s - 1));
      }
    } catch {
      setErrorSubida("Error de red al subir.");
      setSubiendo(0);
    }
  };

  const agregarAvance = async () => {
    const texto = avanceTexto.trim();
    if (!texto || enviandoAvance) return;
    setEnviandoAvance(true);
    try {
      const ok = await onAgregarAvance(texto);
      if (ok) setAvanceTexto("");
    } finally {
      setEnviandoAvance(false);
    }
  };

  const pedirDiagnostico = async () => {
    if (pidiendoDiag) return;
    setPidiendoDiag(true);
    setDiagMsg(null);
    try {
      const msg = await onPedirDiagnostico(diagTexto.trim());
      setDiagMsg(msg);
      if (!msg.startsWith("⚠")) setDiagTexto("");
    } finally {
      setPidiendoDiag(false);
    }
  };

  const borrarFoto = async (id: string) => {
    setBorrando(true);
    try {
      const ok = await onBorrarFoto(id);
      if (ok) setLightbox(null);
    } finally {
      setBorrando(false);
    }
  };

  const irA = (tipo: TipoArtefacto) => {
    document
      .getElementById(`card-${tipo}`)
      ?.scrollIntoView({ behavior: reducirMovimiento ? "auto" : "smooth" });
  };

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto overscroll-contain px-1 pb-6"
    >
      {/* Chips de acceso directo — siempre a mano arriba del apilado. */}
      <nav
        className="sticky top-0 z-[250] -mx-1 flex items-center gap-1.5 overflow-x-auto bg-cdm-bg/85 px-1 py-2 backdrop-blur-md [scrollbar-width:none]"
        style={{ height: TOPE_CHIPS }}
        aria-label="Secciones de la obra"
      >
        {ordenados.map((n) => {
          const Icono = ICONO[n.tipo];
          return (
            <button
              key={n.tipo}
              type="button"
              onClick={() => irA(n.tipo)}
              className={`font-mono-hud flex shrink-0 items-center gap-1.5 border px-2.5 py-1.5 text-[9px] uppercase tracking-[0.14em] transition-colors ${
                n.vivo
                  ? "border-cdm-line text-cdm-fg/80 hover:border-cdm-accent/60 hover:text-cdm-accent"
                  : "border-cdm-line/60 text-cdm-fg/35"
              }`}
            >
              <Icono size={11} />
              {n.nombre}
            </button>
          );
        })}
      </nav>

      {/* Margen al día — lo que antes vivía en el centro del orbital. */}
      <div className="flex items-baseline justify-between gap-3 px-1 pb-3 pt-1">
        <span className="font-mono-hud text-[9px] uppercase tracking-[0.25em] text-cdm-muted">
          Margen al día
        </span>
        <span
          className={`text-base font-semibold tabular-nums ${
            margenAlDia == null
              ? "text-cdm-muted"
              : margenAlDia >= 0
                ? "text-cdm-fg"
                : "text-red-400"
          }`}
        >
          {margenAlDia == null ? "sin propuesta" : formatMoneyInt(margenAlDia)}
        </span>
      </div>

      <div ref={listaRef}>
        {ordenados.map((nodo, index) => (
          <CardApilada
            key={nodo.tipo}
            nodo={nodo}
            index={index}
            total={total}
            progreso={scrollYProgress}
            animar={!reducirMovimiento}
            accion={
              nodo.tipo === "fotos" ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <BotonSubir
                    icono={Camera}
                    label="Sacar"
                    accept="image/*"
                    capture="environment"
                    disabled={subiendo > 0}
                    onFiles={(f) => void subir(f, "foto")}
                  />
                  <BotonSubir
                    icono={ImagePlus}
                    label="Galería"
                    accept="image/*"
                    multiple
                    disabled={subiendo > 0}
                    onFiles={(f) => void subir(f, "foto")}
                  />
                </div>
              ) : nodo.tipo === "presupuesto" ? (
                <BotonSubir
                  icono={Upload}
                  label="Subir doc"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.html,image/*"
                  multiple
                  disabled={subiendo > 0}
                  onFiles={(f) => void subir(f, "documento")}
                />
              ) : undefined
            }
          >
            {/* ── Fotos: subida + grilla + lightbox ── */}
            {nodo.tipo === "fotos" && (
              <>
                {subiendo > 0 && (
                  <p className="font-mono-hud pb-2 text-[10px] uppercase tracking-[0.15em] text-cdm-accent-2">
                    Subiendo {subiendo === 1 ? "archivo" : `${subiendo} archivos`}…
                  </p>
                )}
                {errorSubida && (
                  <p className="pb-2 text-[10px] text-red-400">⚠ {errorSubida}</p>
                )}
                {nodo.fotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {nodo.fotos.map((f) => (
                      <Miniatura
                        key={f.id}
                        foto={f}
                        onClick={() => setLightbox(f)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="py-2 text-[10px] uppercase tracking-[0.15em] text-cdm-muted">
                    Sin fotos todavía — sacá una acá arriba o mandalas por
                    WhatsApp.
                  </p>
                )}
              </>
            )}

            {/* ── Bitácora: carga de avance + historial ── */}
            {nodo.tipo === "bitacora" && (
              <>
                <div className="flex items-stretch pb-3">
                  <input
                    value={avanceTexto}
                    onChange={(e) => setAvanceTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void agregarAvance();
                    }}
                    placeholder="+ avance…"
                    className="font-grotesk w-full border border-cdm-line bg-transparent px-3 py-2 text-[12px] text-cdm-fg placeholder:text-cdm-muted/50 focus:border-emerald-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void agregarAvance()}
                    disabled={enviandoAvance || !avanceTexto.trim()}
                    className="font-mono-hud shrink-0 border border-l-0 border-cdm-line px-3.5 text-[11px] uppercase tracking-widest text-emerald-400 transition-colors hover:bg-emerald-400 hover:text-cdm-bg disabled:opacity-30"
                  >
                    {enviandoAvance ? "…" : "+"}
                  </button>
                </div>
                {nodo.avances.length > 0 ? (
                  <ul className="font-mono-hud space-y-2">
                    {nodo.avances.map((a, i) => (
                      <li
                        key={a.id}
                        className={`border-l-2 pl-2.5 ${
                          i === 0 ? "border-emerald-400" : "border-cdm-line"
                        }`}
                      >
                        <p className="text-[9px] uppercase tracking-[0.18em] text-cdm-muted">
                          <span className="tabular-nums">
                            {fechaCorta(a.creadoAt)}
                          </span>
                          {a.instancia && (
                            <span className="ml-2 text-cdm-accent/80">
                              {a.instancia}
                            </span>
                          )}
                        </p>
                        <p
                          className={`mt-0.5 text-[11px] leading-snug ${
                            i === 0
                              ? "text-emerald-400 light:text-emerald-600"
                              : "text-cdm-fg/80"
                          }`}
                        >
                          {a.texto}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-1 text-[10px] uppercase tracking-[0.15em] text-cdm-muted">
                    Sin avances todavía — cargá el primero acá arriba o por
                    WhatsApp.
                  </p>
                )}
              </>
            )}

            {/* ── Presupuesto: documentos abribles (+ subida en el header) ── */}
            {nodo.tipo === "presupuesto" &&
              (nodo.docs.length > 0 ? (
                <ul className="space-y-1.5">
                  {nodo.docs.map((d) => (
                    <li key={d.url}>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center justify-between gap-2 border border-cdm-line px-3 py-2.5 transition-colors hover:border-cdm-accent/60 hover:text-cdm-accent"
                      >
                        <span className="min-w-0 truncate">{d.label}</span>
                        <ExternalLink
                          size={11}
                          className="shrink-0 text-cdm-muted group-hover:text-cdm-accent"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-[10px] uppercase tracking-[0.15em] text-cdm-muted">
                  Sin presupuesto cargado — subí un doc acá arriba.
                </p>
              ))}

            {/* ── Diagnóstico: docs + pedir a la Mac ── */}
            {nodo.tipo === "diagnostico" && (
              <>
                {nodo.docs.length > 0 && (
                  <ul className="space-y-1.5 pb-3">
                    {nodo.docs.map((d) => (
                      <li key={d.url}>
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex items-center justify-between gap-2 border border-cdm-line px-3 py-2.5 transition-colors hover:border-cdm-accent/60 hover:text-cdm-accent"
                        >
                          <span className="min-w-0 truncate">{d.label}</span>
                          <ExternalLink
                            size={11}
                            className="shrink-0 text-cdm-muted group-hover:text-cdm-accent"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <textarea
                  value={diagTexto}
                  onChange={(e) => setDiagTexto(e.target.value)}
                  rows={2}
                  placeholder="¿Qué hay que diagnosticar? Vacío = uno general."
                  className="font-grotesk w-full resize-y border border-cdm-line bg-transparent px-3 py-2 text-[12px] text-cdm-fg placeholder:text-cdm-muted/50 focus:border-cdm-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void pedirDiagnostico()}
                  disabled={pidiendoDiag}
                  className="font-mono-hud mt-2 border border-cdm-accent/60 bg-cdm-accent/10 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent hover:text-cdm-bg disabled:opacity-40"
                >
                  {pidiendoDiag ? "Pidiendo…" : "🩺 Pedir diagnóstico a la Mac"}
                </button>
                {diagMsg && (
                  <p className="mt-2 text-[11px] text-cdm-accent-2">{diagMsg}</p>
                )}
              </>
            )}

            {/* ── Gastos: ejecutado + link al detalle ── */}
            {nodo.tipo === "gastos" && (
              <>
                <dl className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-cdm-muted">Ejecutado</dt>
                    <dd className="tabular-nums">
                      {formatMoneyInt(nodo.gastado ?? 0)}
                    </dd>
                  </div>
                </dl>
                {nodo.href && (
                  <Link
                    href={nodo.href}
                    className="font-mono-hud mt-3 flex items-center justify-center gap-2 border border-cdm-accent/50 px-3 py-2.5 text-[10px] uppercase tracking-[0.2em] text-cdm-accent transition-colors hover:bg-cdm-accent hover:text-cdm-bg"
                  >
                    Ver gastos →
                  </Link>
                )}
              </>
            )}

            {/* ── Resumen $: caja de la obra ── */}
            {nodo.tipo === "resumen" &&
              (nodo.resumen ? (
                <dl className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-cdm-muted">Ingresos</dt>
                    <dd className="tabular-nums text-cdm-fg">
                      {formatMoneyInt(nodo.resumen.ingresos)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-cdm-muted">Egresos</dt>
                    <dd className="tabular-nums">
                      {formatMoneyInt(nodo.resumen.egresos)}
                    </dd>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-cdm-line pt-2">
                    <dt className="text-cdm-muted">Saldo</dt>
                    <dd
                      className={`font-semibold tabular-nums ${
                        nodo.resumen.saldo >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {formatMoneyInt(nodo.resumen.saldo)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="py-2 text-[10px] uppercase tracking-[0.15em] text-cdm-muted">
                  La obra todavía no está en el resumen de caja.
                </p>
              ))}
          </CardApilada>
        ))}
      </div>

      {lightbox && (
        <Lightbox
          foto={lightbox}
          borrando={borrando}
          onBorrar={() => void borrarFoto(lightbox.id)}
          onCerrar={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
