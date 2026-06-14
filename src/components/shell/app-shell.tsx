"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { RavnLogo } from "@/components/ravn-logo";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { MenuOverlay } from "./menu-overlay";

/** Rutas SIN carcasa (login, vistas de impresión/PDF y landing pública). */
const SIN_CARCASA = ["/login", "/propuesta", "/remito", "/landing"];
/** Sufijos de ruta que también omiten carcasa (documentos A4 de cotizaciones). */
const SIN_CARCASA_SUFIJO = ["/documento"];

/** Toggle de tema compacto para la barra superior (el destino nombra el modo). */
function ToggleTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const esClaro = mounted && resolvedTheme === "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(esClaro ? "dark" : "light")}
      className="font-mono-hud hidden text-[10px] uppercase tracking-[0.1em] text-cdm-muted transition-colors hover:text-cdm-accent sm:block"
      aria-label={esClaro ? "Activar modo oscuro" : "Activar modo claro"}
    >
      {esClaro ? "[MODO OSCURO]" : "[MODO CLARO]"}
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [archivados, setArchivados] = useState(0);
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Cmd+K abre el menú directo en modo búsqueda (Spotlight); el botón lo abre
  // para navegar. Distinguimos con esta bandera.
  const [menuBuscar, setMenuBuscar] = useState(false);

  // Cierra el overlay al cambiar de ruta (navegaste → fuera el menú).
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  const abrirMenu = useCallback((buscar: boolean) => {
    setMenuBuscar(buscar);
    setMenuAbierto(true);
  }, []);

  // Atajo global tipo Spotlight: ⌘K / Ctrl+K abre el menú-buscador.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMenuBuscar(true);
        setMenuAbierto((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  return (
    <div className="min-h-screen bg-cdm-bg">
      {/* Barra superior slim — única navegación persistente ahora que la sidebar
          murió. Logo + tema + disparador del menú overlay (con hint ⌘K). */}
      <header className="font-geist sticky top-0 z-40 flex items-center justify-between border-b border-cdm-line bg-cdm-bg/80 px-5 py-3 backdrop-blur-xl print:hidden">
        <Link href="/" aria-label="Inicio">
          <RavnLogo
            align="start"
            showTagline={false}
            shimmer
            sizeClassName="text-lg"
            className="drop-shadow-[0_0_18px_rgba(34,211,238,0.30)]"
          />
        </Link>

        <div className="flex items-center gap-5">
          <ToggleTema />
          <button
            type="button"
            onClick={() => abrirMenu(false)}
            aria-haspopup="dialog"
            aria-expanded={menuAbierto}
            className="font-mono-hud group flex items-center gap-2.5 text-[11px] uppercase tracking-[0.18em] text-cdm-muted transition-colors hover:text-cdm-fg"
          >
            <span aria-hidden className="flex flex-col gap-[3px]">
              <span className="block h-px w-4 bg-current transition-all duration-300 group-hover:w-5" />
              <span className="block h-px w-3 bg-current transition-all duration-300 group-hover:w-5" />
              <span className="block h-px w-4 bg-current transition-all duration-300 group-hover:w-5" />
            </span>
            <span>Menú</span>
            {archivados > 0 && (
              <span className="cdm-chip border border-cdm-accent/50 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-cdm-accent shadow-[0_0_12px_-2px_rgba(34,211,238,0.45)]">
                {archivados}
              </span>
            )}
            <kbd className="hidden rounded border border-cdm-line px-1.5 py-0.5 text-[9px] not-italic text-cdm-muted/70 sm:inline">
              ⌘K
            </kbd>
          </button>
        </div>
      </header>

      <main className="min-w-0 print:pl-0">{children}</main>

      <MenuOverlay
        open={menuAbierto}
        modoBuscar={menuBuscar}
        archivados={archivados}
        onClose={() => setMenuAbierto(false)}
        onCerrarSesion={cerrarSesion}
      />
    </div>
  );
}
