import { formatMoney } from "@/lib/format-currency";

export type PropuestaTotales = {
  material: number;
  mo: number;
  total: number;
};

export function buildPropuestaComercialText(params: {
  fecha: string;
  nombreCliente: string;
  domicilio: string;
  totales: PropuestaTotales;
}): string {
  const { fecha, nombreCliente, domicilio, totales } = params;
  const totalStr = formatMoney(totales.total);
  const matStr = formatMoney(totales.material);
  const moStr = formatMoney(totales.mo);
  return `Presupuesto de Obra - RAVN
Fecha: ${fecha}
Cliente: ${nombreCliente}
Ubicación: ${domicilio}

Adjunto el desglose correspondiente a las tareas de diseño y ejecución de obra solicitadas. 
El costo total estimado para los rubros detallados es de ${totalStr}, divididos en ${matStr} de materiales y ${moStr} de mano de obra.

Este presupuesto tiene una validez de 7 días corridos. Quedo a disposición para revisar los detalles o ajustar especificaciones.
Atentamente, Ezequiel.`;
}
