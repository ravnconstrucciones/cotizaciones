"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useTheme } from "next-themes";
import { RavnLogo } from "@/components/ravn-logo";
import { NAV_COCKPIT, NAV_DATOS, NAV_HERRAMIENTAS, type NavItem } from "./nav-config";

/**
 * MENÚ OVERLAY (formato B — pedido de Eze).
 *
 * Takeover a pantalla completa: un botón lo dispara y el menú toma toda la
 * pantalla con labels GRANDES (Space Grotesk), una flecha que desliza desde la
 * izquierda y baño de acento cian al hover. Reemplaza la idea de "menú dentro
 * de la sidebar" porque los ~16 ítems no entran legibles en un riel angosto.
 *
 * Convive con la sidebar HUD actual (no la rompe): la sidebar sigue para el
 * salto rápido; el overlay es la experiencia de navegación grande.
 *
 * Movimiento (guía ui-ux-pro-max): entra ease-out ~300ms con stagger 30ms,
 * sale más rápido (~180ms), respeta prefers-reduced-motion. Cierra con ESC,
 * con la X, o clickeando fuera de la columna de ítems. Bloquea el scroll del
 * body mientras está abierto.
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

function esActivo(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function FilaMenu({
  item,
  activo,
  onClose,
}: {
  item: NavItem;
  activo: boolean;
  onClose: () => void;
}) {
  return (
    <motion.li variants={ITEM_V}>
      <Link
        href={item.href}
        onClick={onClose}
        aria-current={activo ? "page" : undefined}
        className="group flex items-center gap-3 rounded-2xl py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-cdm-accent/60"
      >
        {/* Flecha que desliza desde la izquierda (slot de ancho fijo → los
            labels quedan alineados; la flecha lo rellena al hover/activo). */}
        <span
          aria-hidden
          className={`w-[0.9em] shrink-0 font-grotesk text-2xl text-cdm-accent transition-all duration-300 ease-out sm:text-3xl ${
            activo
              ? "translate-x-0 opacity-100"
              : "-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
          }`}
        >
          →
        </span>
        <span
          className={`font-grotesk text-[1.7rem] font-semibold leading-[1.15] tracking-tight transition-colors duration-300 ease-out sm:text-[2.4rem] ${
            activo
              ? "text-cdm-accent"
              : "text-cdm-fg/50 group-hover:text-cdm-fg group-focus-visible:text-cdm-fg"
          }`}
        >
          {item.label}
        </span>
      </Link>
    </motion.li>
  );
}

function Grupo({
  titulo,
  items,
  pathname,
  onClose,
}: {
  titulo: string;
  items: NavItem[];
  pathname: string;
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
  onClose,
  onCerrarSesion,
}: {
  open: boolean;
  onClose: () => void;
  onCerrarSesion: () => void;
}) {
  const pathname = usePathname();
  const reducir = useReducedMotion();

  // ESC para cerrar + bloqueo de scroll del body mientras está abierto.
  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

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
          className="fixed inset-0 z-[100] overflow-y-auto bg-cdm-bg/95 backdrop-blur-2xl print:hidden"
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

          {/* Ítems: dos columnas en desktop (Cockpit | Datos+Herramientas) */}
          <nav
            aria-label="Navegación principal"
            onClick={(e) => e.stopPropagation()}
            className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-16 gap-y-12 px-6 pb-24 pt-6 sm:px-10 lg:grid-cols-2 lg:pt-10"
          >
            <Grupo titulo="Cockpit" items={NAV_COCKPIT} pathname={pathname} onClose={onClose} />
            <div className="space-y-12">
              <Grupo titulo="Datos" items={NAV_DATOS} pathname={pathname} onClose={onClose} />
              <Grupo titulo="Herramientas" items={NAV_HERRAMIENTAS} pathname={pathname} onClose={onClose} />
            </div>
          </nav>

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
