/**
 * Configuración de navegación del cockpit — fuente única de verdad.
 *
 * Hoy la consume SOLO el menú overlay (la sidebar murió: navegación 100% por
 * el overlay grande + ⌘K). Un solo lugar para agregar/sacar/reordenar ítems.
 *
 * Reorganización (pedido de Eze, 14/06):
 *   - Actividad pasó a DATOS (es control de que todo funcione, no operación).
 *   - Maestro de precios subió a DATOS como acceso rápido para corroborar
 *     precios; las herramientas de edición manual quedan abajo y secundarias.
 *     (OJO: "Maestro de precios" es la tabla propia de la app — NO es SISMAT.
 *     SISMAT es el servicio externo suscripto, sismat.com.ar, otra cosa.)
 */

export type NavItem = { href: string; label: string };

export const NAV_COCKPIT: NavItem[] = [
  { href: "/", label: "Inicio" },
  { href: "/terminal", label: "Terminal" },
  { href: "/obras", label: "Proyectos" },
  { href: "/cotizaciones", label: "Cotizaciones" },
  { href: "/archivados", label: "Archivados" },
  { href: "/adn", label: "ADN" },
];

export const NAV_DATOS: NavItem[] = [
  { href: "/cashflow", label: "Cashflow" },
  { href: "/control-gastos", label: "Control de gastos" },
  { href: "/rentabilidad", label: "Rentabilidad" },
  { href: "/finanzas", label: "Finanzas personales" },
  { href: "/actividad", label: "Actividad" },
  { href: "/maestro-precios", label: "Maestro de precios" },
];

/**
 * Herramientas secundarias. "SISMAT" es la pantalla /catalogo (recetas + rubros
 * = la data del tarifario SISMAT, como la piensa Eze). Historial salió: era
 * redundante con Proyectos (los documentos ya viven en el orbital de cada obra).
 */
export const NAV_HERRAMIENTAS: NavItem[] = [
  { href: "/catalogo", label: "SISMAT" },
];

export const NAV_GRUPOS: Array<{ titulo: string; items: NavItem[] }> = [
  { titulo: "Cockpit", items: NAV_COCKPIT },
  { titulo: "Datos", items: NAV_DATOS },
  { titulo: "Herramientas", items: NAV_HERRAMIENTAS },
];
