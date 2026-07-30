"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useTheme } from "next-themes";
import { RavnLogo } from "@/components/ravn-logo";
import {
  NAV_COCKPIT,
  NAV_DATOS,
  NAV_HERRAMIENTAS,
  type NavItem,
} from "./nav-config";

/**
 * MENÚ OVERLAY (formato B + Spotlight).
 *
 * Única navegación del cockpit ahora que la sidebar murió. Takeover a pantalla
 * completa con labels GRANDES en GEIST (limpia, no la Space Grotesk "muy
 * futurista"), flecha que desliza + acento cian al hover.
 *
 * Doble modo:
 *   - BROWSE (botón "Menú"): la grilla agrupada Cockpit / Datos / Herramientas.
 *   - SPOTLIGHT (⌘K): el input arriba viene enfocado; escribís y filtra todos
 *     los destinos a una lista plana; ↑/↓ mueven la selección, Enter salta.
 *
 * Movimiento (guía ui-ux-pro-max): entra ease-out ~300ms con stagger 30ms,
 * sale más rápido, respeta prefers-reduced-motion. Cierra con ESC / la X /
 * click afuera. Bloquea el scroll del body mientras está abierto.
 */

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const SURFACE_V: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3, ease: EASE_OUT, when: "beforeChildren", staggerChildren: 0.03 },
  },
  exit: { opacity: 0, transition: { duration: 0.18, ease: "easeIn", when: "afterChildren", staggerChildren: 0.012, staggerDirection: -1 } },
};

const ITEM_V: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
  exit: { opacity: 0, y: 6, transition: { duration: 0.12 } },
};

type ItemConGrupo = NavItem & { grupo: string };
const TODOS: ItemConGrupo[] = [
  ...NAV_COCKPIT.map((i) => ({ ...i, grupo: "Cockpit" })),
  ...NAV_DATOS.map((i) => ({ ...i, grupo: "Datos" })),
  ...NAV_HERRAMIENTAS.map((i) => ({ ...i, grupo: "Herramientas" })),
];

function esActivo(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Normaliza para buscar sin acentos ni mayúsculas. */
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function FilaMenu({
  item,
  activo,
  seleccionado,
  badge,
  subtitulo,
  onClose,
}: {
  item: NavItem;
  activo: boolean;
  seleccionado?: boolean;
  badge?: number;
  subtitulo?: string;
  onClose: () => void;
}) {
  const resaltado = activo || seleccionado;
  return (
    <motion.li variants={ITEM_V}>
      <Link
        href={item.href}
        onClick={onClose}
        aria-current={activo ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-2xl py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-cdm-accent/60 ${
          seleccionado ? "is-sel" : ""
        }`}
      >
        {/* Flecha que desliza desde la izquierda (slot de ancho fijo). */}
        <span
          aria-hidden
          className={`w-[0.9em] shrink-0 font-geist text-2xl text-cdm-accent transition-all duration-300 ease-out sm:text-3xl ${
            resaltado
              ? "translate-x-0 opacity-100"
              : "-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
          }`}
        >
          →
        </span>
        <span className="min-w-0">
          <span
            className={`block font-geist text-[1.6rem] font-semibold leading-[1.15] tracking-tight transition-colors duration-300 ease-out sm:text-[2.3rem] ${
              resaltado
                ? "text-cdm-accent"
                : "text-cdm-fg/50 group-hover:text-cdm-fg group-focus-visible:text-cdm-fg"
            }`}
          >
            {item.label}
            {badge ? (
              <span className="ml-3 inline-flex translate-y-[-2px] items-center rounded-full border border-cdm-accent/50 px-2 py-0.5 align-middle text-[11px] font-bold tabular-nums text-cdm-accent">
                {badge}
              </span>
            ) : null}
          </span>
          {subtitulo && (
            <span className="font-mono-hud mt-0.5 block text-[10px] uppercase tracking-[0.18em] text-cdm-muted/60">
              {subtitulo}
            </span>
          )}
        </span>
      </Link>
    </motion.li>
  );
}

function Grupo({
  titulo,
  items,
  pathname,
  archivados,
  onClose,
}: {
  titulo: string;
  items: NavItem[];
  pathname: string;
  archivados: number;
  onClose: () => void;
}) {
  return (
    <div>
      <motion.p
        variants={ITEM_V}
        className="font-mono-hud mb-3.5 text-[11px] uppercase tracking-[0.28em] text-cdm-accent/55"
      >
        <span aria-hidden className="mr-2 text-cdm-accent/35">
          {"//////"}
        </span>
        {titulo}
      </motion.p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <FilaMenu
            key={item.href}
            item={item}
            activo={esActivo(item.href, pathname)}
            badge={item.href === "/archivados" && archivados > 0 ? archivados : undefined}
            onClose={onClose}
          />
        ))}
      </ul>
    </div>
  );
}

function ToggleTemaMenu() {
  const { resolvedTheme, setTheme } = useTheme();
  const esClaro = resolvedTheme === "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(esClaro ? "dark" : "light")}
      className="font-mono-hud text-left text-[11px] uppercase tracking-[0.12em] text-cdm-muted transition-colors hover:text-cdm-accent"
      aria-label={esClaro ? "Activar modo oscuro" : "Activar modo claro"}
    >
      {esClaro ? "[MODO OSCURO] ↑" : "[MODO CLARO] ↑"}
    </button>
  );
}

export function MenuOverlay({
  open,
  modoBuscar = false,
  archivados = 0,
  onClose,
  onCerrarSesion,
}: {
  open: boolean;
  modoBuscar?: boolean;
  archivados?: number;
  onClose: () => void;
  onCerrarSesion: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reducir = useReducedMotion();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resultados filtrados (modo Spotlight). Vacío de query → browse agrupado.
  const resultados = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return [];
    return TODOS.filter((i) => norm(i.label).includes(q));
  }, [query]);

  // ESC para cerrar + bloqueo de scroll + reset al abrir.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSel(0);
    if (modoBuscar) {
      // microtarea: el input ya está montado por AnimatePresence
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, modoBuscar, onClose]);

  // Mantener la selección dentro de rango al cambiar resultados.
  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, resultados.length - 1)));
  }, [resultados.length]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!resultados.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (s + 1) % resultados.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (s - 1 + resultados.length) % resultados.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const destino = resultados[sel];
      if (destino) {
        onClose();
        router.push(destino.href);
      }
    }
  }

  const surfaceVariants: Variants = reducir
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }
    : SURFACE_V;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="menu-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          variants={surfaceVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
          className="font-geist fixed inset-0 z-[100] overflow-y-auto bg-cdm-bg/95 backdrop-blur-2xl print:hidden"
        >
          {/* Glow atmosférico sutil arriba (lenguaje igloo) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(60%_70%_at_50%_-10%,var(--cdm-glow),transparent_70%)] opacity-60"
          />

          {/* Cabecera: marca + cerrar */}
          <div className="relative flex items-center justify-between px-6 py-6 sm:px-10 sm:py-8">
            <Link href="/" onClick={onClose} aria-label="Inicio">
              <RavnLogo align="start" showTagline={false} shimmer sizeClassName="text-xl" />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="font-mono-hud flex items-center gap-2.5 text-[11px] uppercase tracking-[0.16em] text-cdm-muted transition-colors hover:text-cdm-accent"
              aria-label="Cerrar menú"
            >
              <span className="hidden sm:inline">Cerrar</span>
              <kbd className="rounded border border-cdm-line px-1.5 py-0.5 text-[10px] not-italic">ESC</kbd>
              <span className="text-base leading-none">✕</span>
            </button>
          </div>

          {/* Buscador Spotlight */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative mx-auto w-full max-w-6xl px-6 sm:px-10"
          >
            <div className="flex items-center gap-3 border-b border-cdm-line/70 pb-3">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5 shrink-0 text-cdm-muted"
              >
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Saltar a… (escribí para filtrar)"
                aria-label="Buscar en el menú"
                className="font-geist w-full bg-transparent text-lg text-cdm-fg placeholder:text-cdm-muted/50 focus:outline-none sm:text-xl"
              />
              <kbd className="font-mono-hud hidden shrink-0 rounded border border-cdm-line px-1.5 py-0.5 text-[10px] not-italic text-cdm-muted/70 sm:inline">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* RESULTADOS (Spotlight) o GRILLA agrupada (browse) */}
          {query.trim() ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-8 sm:px-10"
            >
              {resultados.length === 0 ? (
                <p className="font-mono-hud text-[12px] uppercase tracking-[0.18em] text-cdm-muted">
                  Sin resultados para “{query.trim()}”.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {resultados.map((item, i) => (
                    <FilaMenu
                      key={item.href}
                      item={item}
                      activo={esActivo(item.href, pathname)}
                      seleccionado={i === sel}
                      subtitulo={item.grupo}
                      onClose={onClose}
                    />
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <nav
              aria-label="Navegación principal"
              onClick={(e) => e.stopPropagation()}
              className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-16 gap-y-12 px-6 pb-24 pt-8 sm:px-10 lg:grid-cols-2"
            >
              <Grupo titulo="Cockpit" items={NAV_COCKPIT} pathname={pathname} archivados={archivados} onClose={onClose} />
              <div className="space-y-12">
                <Grupo titulo="Datos" items={NAV_DATOS} pathname={pathname} archivados={archivados} onClose={onClose} />
                <Grupo titulo="Herramientas" items={NAV_HERRAMIENTAS} pathname={pathname} archivados={archivados} onClose={onClose} />
              </div>
            </nav>
          )}

          {/* Pie: tema + cerrar sesión */}
          <motion.div
            variants={ITEM_V}
            onClick={(e) => e.stopPropagation()}
            className="relative mx-auto flex w-full max-w-6xl items-center gap-6 border-t border-cdm-line px-6 py-5 sm:px-10"
          >
            <ToggleTemaMenu />
            <span aria-hidden className="text-cdm-line">
              |
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onCerrarSesion();
              }}
              className="font-mono-hud text-left text-[11px] uppercase tracking-[0.12em] text-cdm-muted transition-colors hover:text-cdm-accent"
            >
              [CERRAR SESIÓN] ↑
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
