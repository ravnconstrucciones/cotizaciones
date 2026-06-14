/**
 * Configuración de navegación del cockpit — fuente única de verdad.
 *
 * La consumen DOS superficies:
 *   - app-shell.tsx  → la sidebar HUD clásica (riel lateral fijo).
 *   - menu-overlay.tsx → el menú overlay grande (takeover a pantalla completa).
 *
 * Antes vivía inline en app-shell; se extrajo acá para que el overlay y el
 * riel no se desincronicen (un solo lugar para agregar/sacar ítems).
 */

export type NavItem = { href: string; label: string };

export const NAV_COCKPIT: NavItem[] = [
  { href: "/", label: "Inicio" },
  { href: "/dia", label: "Tu Día" },
  { href: "/terminal", label: "Terminal" },
  { href: "/obras", label: "Proyectos" },
  { href: "/cotizaciones", label: "Cotizaciones" },
  { href: "/actividad", label: "Actividad" },
  { href: "/archivados", label: "Archivados" },
  { href: "/adn", label: "ADN" },
];

export const NAV_DATOS: NavItem[] = [
  { href: "/cashflow", label: "Cashflow" },
  { href: "/control-gastos", label: "Control de gastos" },
  { href: "/rentabilidad", label: "Rentabilidad" },
  { href: "/finanzas", label: "Finanzas personales" },
];

/**
 * Herramientas de edición manual: el flujo principal del cockpit es el
 * diálogo (los presupuestos se elaboran conversando) — esto queda secundario.
 */
export const NAV_HERRAMIENTAS: NavItem[] = [
  { href: "/nuevo-presupuesto", label: "Nuevo presupuesto" },
  { href: "/historial", label: "Historial" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/maestro-precios", label: "Maestro de precios" },
];

export const NAV_GRUPOS: Array<{ titulo: string; items: NavItem[] }> = [
  { titulo: "Cockpit", items: NAV_COCKPIT },
  { titulo: "Datos", items: NAV_DATOS },
  { titulo: "Herramientas", items: NAV_HERRAMIENTAS },
];
