import { CargandoCockpit } from "@/components/cockpit/cargando-cockpit";

/**
 * Loading raíz del App Router (ronda 6 — muerte del loader feo).
 *
 * Antes no existía: al navegar con el server lento (compile en dev,
 * RSC en frío) el contenido era un VACÍO negro con el theme-toggle como
 * única señal. Ahora toda espera de ruta muestra la marca RAVN. con
 * pulso de bloom sobre la atmósfera — el lenguaje del cockpit.
 */
export default function Loading() {
  return <CargandoCockpit />;
}
