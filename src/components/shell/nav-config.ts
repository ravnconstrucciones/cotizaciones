/** Navegación diaria y herramientas de apoyo. Las rutas históricas se conservan. */
export type NavItem = { href: string; label: string };
export const NAV_COCKPIT: NavItem[] = [
  { href: "/panel", label: "Inicio" },
  { href: "/obras", label: "Proyectos" },
  { href: "/finanzas", label: "Personal" },
  { href: "/mano-obra", label: "Pagos" },
  { href: "/gasto", label: "Registrar movimiento" },
];
export const NAV_DATOS: NavItem[] = [
  { href: "/dinero", label: "Cuentas y conciliación" },
  { href: "/cashflow", label: "Cobros y pagos de obras" },
  { href: "/empresa", label: "Gastos de empresa" },
  { href: "/finanzas/presupuesto", label: "Presupuesto personal y fijos" },
];
export const NAV_HERRAMIENTAS: NavItem[] = [
  { href: "/diagnosticos", label: "Diagnósticos" },
  { href: "/cotizaciones", label: "Cotizaciones" },
  { href: "/proveedores", label: "Proveedores" },
  { href: "/compras", label: "Compras" },
  { href: "/obras/costos", label: "Mis costos reales" },
  { href: "/inventario", label: "Inventario" },
  { href: "/maestro-precios", label: "Maestro de precios" },
  { href: "/catalogo", label: "SISMAT" },
  { href: "/cotizar/explorar", label: "Explorar recetas" },
  { href: "/archivados", label: "Archivo" },
  { href: "/actividad", label: "Actividad del sistema" },
  { href: "/adn", label: "ADN de RAVN" },
];
export const NAV_GRUPOS = [
  { titulo: "Todos los días", items: NAV_COCKPIT },
  { titulo: "Administrar", items: NAV_DATOS },
  { titulo: "Herramientas y archivo", items: NAV_HERRAMIENTAS },
];
