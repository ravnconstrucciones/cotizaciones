"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
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
  { href: "/actividad", label: "Actividad" },
  { href: "/archivados", label: "Archivados" },
  { href: "/adn", label: "ADN" },
  { href: "/cotizaciones", label: "Cotizaciones" },
];

const NAV_OPERACION: NavItem[] = [
  { href: "/nuevo-presupuesto", label: "Nuevo presupuesto" },
  { href: "/historial", label: "Historial" },
  { href: "/control-gastos", label: "Control de gastos" },
  { href: "/cashflow", label: "Cashflow" },
  { href: "/rentabilidad", label: "Rentabilidad" },
];

const NAV_DATOS: NavItem[] = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/maestro-precios", label: "Maestro de precios" },
  { href: "/finanzas", label: "Finanzas personales" },
];

function NavLink({
  item,
  activo,
  badge,
}: {
  item: NavItem;
  activo: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      className={`relative flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-[0.18em] transition-colors ${
        activo ? "text-cdm-fg" : "text-cdm-muted hover:text-cdm-fg"
      }`}
    >
      {activo && (
        <motion.span
          layoutId="nav-activo"
          className="absolute inset-y-0 left-0 w-[2px] bg-cdm-taupe"
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        />
      )}
      <span>{item.label}</span>
      {badge ? (
        <span className="bg-cdm-taupe px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-cdm-bg">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [archivados, setArchivados] = useState(0);

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
    { titulo: "Operación", items: NAV_OPERACION },
    { titulo: "Datos", items: NAV_DATOS },
  ];

  return (
    <div className="min-h-screen bg-cdm-bg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-cdm-line bg-cdm-bg lg:flex print:hidden">
        <div className="px-4 pb-6 pt-8">
          <Link href="/" aria-label="Inicio">
            <RavnLogo align="start" showTagline={false} sizeClassName="text-xl" />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto" aria-label="Navegación principal">
          {grupos.map((g) => (
            <div key={g.titulo} className="mb-6">
              <p className="px-4 pb-2 text-[9px] uppercase tracking-[0.3em] text-cdm-muted/60">
                {g.titulo}
              </p>
              {g.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  activo={
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href)
                  }
                  badge={item.href === "/archivados" ? archivados : undefined}
                />
              ))}
            </div>
          ))}
        </nav>
        <button
          onClick={cerrarSesion}
          className="border-t border-cdm-line px-4 py-4 text-left text-[10px] uppercase tracking-[0.2em] text-cdm-muted transition-colors hover:text-cdm-fg"
        >
          Cerrar sesión
        </button>
      </aside>

      {/* Barra superior compacta < lg (el móvil real es WhatsApp) */}
      <header className="flex items-center justify-between border-b border-cdm-line bg-cdm-bg px-4 py-3 lg:hidden print:hidden">
        <Link href="/" aria-label="Inicio">
          <RavnLogo align="start" showTagline={false} sizeClassName="text-base" />
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
