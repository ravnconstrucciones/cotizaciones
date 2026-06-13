"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { RavnLogo } from "@/components/ravn-logo";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";

/** Rutas SIN carcasa (login, vistas de impresión/PDF y landing pública). */
const SIN_CARCASA = ["/login", "/propuesta", "/remito", "/landing"];
/** Sufijos de ruta que también omiten carcasa (documentos A4 de cotizaciones). */
const SIN_CARCASA_SUFIJO = ["/documento"];

type NavItem = { href: string; label: string };

const NAV_COCKPIT: NavItem[] = [
  { href: "/", label: "Inicio" },
  { href: "/dia", label: "Tu Día" },
  { href: "/terminal", label: "Terminal" },
  { href: "/obras", label: "Proyectos" },
  { href: "/cotizaciones", label: "Cotizaciones" },
  { href: "/actividad", label: "Actividad" },
  { href: "/archivados", label: "Archivados" },
  { href: "/adn", label: "ADN" },
];

const NAV_DATOS: NavItem[] = [
  { href: "/cashflow", label: "Cashflow" },
  { href: "/control-gastos", label: "Control de gastos" },
  { href: "/rentabilidad", label: "Rentabilidad" },
  { href: "/finanzas", label: "Finanzas personales" },
];

/**
 * Herramientas de edición manual: el flujo principal del cockpit es el
 * diálogo (los presupuestos se elaboran conversando) — esto queda al fondo,
 * colapsado y visualmente secundario.
 */
const NAV_HERRAMIENTAS: NavItem[] = [
  { href: "/nuevo-presupuesto", label: "Nuevo presupuesto" },
  { href: "/historial", label: "Historial" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/maestro-precios", label: "Maestro de precios" },
];

function NavLink({
  item,
  activo,
  badge,
  secundario,
}: {
  item: NavItem;
  activo: boolean;
  badge?: number;
  secundario?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`relative flex items-center justify-between px-5 transition-colors ${
        secundario
          ? "py-2 text-[10px] uppercase tracking-[0.14em]"
          : "py-2.5 text-[11px] uppercase tracking-[0.14em]"
      } ${
        activo
          ? "text-cdm-fg"
          : secundario
            ? "text-cdm-muted/60 hover:text-cdm-muted"
            : "text-cdm-muted hover:text-cdm-fg"
      }`}
    >
      {activo && (
        <motion.span
          layoutId="nav-activo"
          className="absolute inset-y-0 left-0 w-[2px] bg-cdm-accent shadow-[0_0_10px_rgba(34,211,238,0.7)]"
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        />
      )}
      <span>{item.label}</span>
      {badge ? (
        <span className="cdm-chip border border-cdm-accent/50 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-cdm-accent shadow-[0_0_12px_-2px_rgba(34,211,238,0.45)]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Toggle de tema del cockpit (12/06 — reemplaza al cuadrado flotante que
 * murió): un comando más de la terminal, al fondo del sidebar junto a
 * [CERRAR SESIÓN]. El label nombra el DESTINO ([MODO CLARO] te lleva al
 * claro). Persistencia next-themes estándar; default oscuro. Antes del
 * mount se asume oscuro — mismo markup en SSR y primer render del
 * cliente, sin mismatch de hydration.
 */
function ToggleTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const esClaro = mounted && resolvedTheme === "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(esClaro ? "dark" : "light")}
      className="font-mono-hud border-t border-cdm-line px-5 pb-2 pt-3.5 text-left text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
      aria-label={esClaro ? "Activar modo oscuro" : "Activar modo claro"}
    >
      {esClaro ? "[MODO OSCURO] ↑" : "[MODO CLARO] ↑"}
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [archivados, setArchivados] = useState(0);

  const esActivo = useCallback(
    (href: string) =>
      href === "/" ? pathname === "/" : pathname.startsWith(href),
    [pathname]
  );
  const herramientaActiva = NAV_HERRAMIENTAS.some((i) => esActivo(i.href));
  const [herramientasAbiertas, setHerramientasAbiertas] = useState(false);
  useEffect(() => {
    if (herramientaActiva) setHerramientasAbiertas(true);
  }, [herramientaActiva]);

  const cargarBadge = useCallback(async () => {
    const supabase = createClient();
    const { count } = await supabase
      .from("eventos")
      .select("id", { count: "exact", head: true })
      .eq("estado", "archivado");
    setArchivados(count ?? 0);
  }, []);

  useEffect(() => {
    void cargarBadge();
  }, [cargarBadge, pathname]);
  useRealtimeTable("eventos", cargarBadge);

  if (
    SIN_CARCASA.some((p) => pathname.startsWith(p)) ||
    SIN_CARCASA_SUFIJO.some((s) => pathname.endsWith(s))
  )
    return <>{children}</>;

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const grupos: Array<{ titulo: string; items: NavItem[] }> = [
    { titulo: "Cockpit", items: NAV_COCKPIT },
    { titulo: "Datos", items: NAV_DATOS },
  ];

  return (
    <div className="min-h-screen bg-cdm-bg">
      {/* Sidebar HUD: translúcido + blur sobre el shader del cockpit; marca con glow sutil */}
      <aside className="font-grotesk fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-cdm-line bg-cdm-bg/75 backdrop-blur-xl lg:flex print:hidden">
        <div className="px-5 pb-9 pt-10">
          <Link href="/" aria-label="Inicio">
            <RavnLogo
              align="start"
              showTagline={false}
              shimmer
              sizeClassName="text-xl"
              className="drop-shadow-[0_0_18px_rgba(34,211,238,0.30)]"
            />
          </Link>
        </div>
        <nav
          className="flex flex-1 flex-col overflow-y-auto"
          aria-label="Navegación principal"
        >
          {grupos.map((g) => (
            <div key={g.titulo} className="mb-8">
              <p className="font-mono-hud px-5 pb-2.5 text-[9px] uppercase tracking-[0.24em] text-cdm-accent/60">
                <span aria-hidden className="mr-1.5 text-cdm-accent/35">
                  {"//////"}
                </span>
                {g.titulo}
              </p>
              {g.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  activo={esActivo(item.href)}
                  badge={item.href === "/archivados" ? archivados : undefined}
                />
              ))}
            </div>
          ))}

          {/* Herramientas de edición manual: secundarias, colapsadas al fondo */}
          <div className="mt-auto border-t border-cdm-line/60 pb-3 pt-3">
            <button
              type="button"
              onClick={() => setHerramientasAbiertas((v) => !v)}
              aria-expanded={herramientasAbiertas}
              className="group flex w-full items-baseline justify-between px-5 py-1.5 text-left"
            >
              <span className="font-mono-hud text-[9px] uppercase tracking-[0.24em] text-cdm-muted/50 transition-colors group-hover:text-cdm-muted">
                <span aria-hidden className="mr-1.5 text-cdm-muted/30">
                  {"//////"}
                </span>
                Herramientas
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-mono-hud text-[8px] uppercase tracking-[0.12em] text-cdm-muted/35">
                  edición manual
                </span>
                <motion.span
                  animate={{ rotate: herramientasAbiertas ? 0 : -90 }}
                  transition={{ duration: 0.2 }}
                  className="inline-block text-[8px] text-cdm-muted/40"
                >
                  ▾
                </motion.span>
              </span>
            </button>
            <motion.div
              initial={false}
              animate={{
                height: herramientasAbiertas ? "auto" : 0,
                opacity: herramientasAbiertas ? 1 : 0,
              }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="overflow-hidden"
            >
              {NAV_HERRAMIENTAS.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  activo={esActivo(item.href)}
                  secundario
                />
              ))}
            </motion.div>
          </div>
        </nav>
        <ToggleTema />
        <button
          onClick={cerrarSesion}
          className="font-mono-hud px-5 pb-4 pt-2 text-left text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
        >
          [CERRAR SESIÓN] ↑
        </button>
      </aside>

      {/* Barra superior compacta < lg (el móvil real es WhatsApp) */}
      <header className="font-grotesk flex items-center justify-between border-b border-cdm-line bg-cdm-bg/80 px-4 py-3 backdrop-blur-xl lg:hidden print:hidden">
        <Link href="/" aria-label="Inicio">
          <RavnLogo
            align="start"
            showTagline={false}
            shimmer
            sizeClassName="text-base"
          />
        </Link>
        <Link
          href="/archivados"
          className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted"
        >
          Archivados{archivados > 0 ? ` (${archivados})` : ""}
        </Link>
      </header>

      <main className="min-w-0 lg:pl-60 print:pl-0">{children}</main>
    </div>
  );
}
