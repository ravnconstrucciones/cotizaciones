/**
 * Foto mensual de la tarjeta — rubro por rubro, empresa vs mío.
 *
 * El retrato del último resumen cerrado: cada consumo puesto debajo de su
 * rubro, para ver "en qué se me va cada cosa". Es la versión en la app del
 * `Desglose_Tarjetas_*.html` del vault.
 *
 * Decisiones de modelado (pedido de Eze, 29-jun):
 *  - SIN histórico ni DB: es la foto del mes vigente, baked en el build. Cada
 *    cierre se reemplaza `FOTO_ACTUAL` con los consumos del nuevo resumen.
 *  - Software / IA SEPARADO: es inversión del negocio, NO gasto personal puro.
 *    Va en `software`, fuera de `rubros`, y NO suma al total personal.
 *  - Totales DERIVADOS de los consumos (no hardcodeados) → el total siempre
 *    cuadra con el detalle. Los impuestos reintegrados (paga en USD) van con
 *    monto neto = 0; el bruto debitado queda en `detalle`.
 */

export type ConsumoFoto = {
  nombre: string;
  fecha?: string; // "07-jun" — como viene en el resumen
  monto: number; // ARS, neto (lo que realmente costó)
  detalle?: string;
  usd?: number; // si el consumo vino en dólares
  tag?: string; // etiqueta corta: "expensas", "cancelar", "negocio", "¿qué es?"
  pendiente?: boolean; // sin identificar / a rastrear
};

export type RubroFoto = {
  id: string; // "01"…"08"
  nombre: string;
  items: ConsumoFoto[];
  nota?: string;
};

export type FotoTarjeta = {
  cicloLabel: string; // "21 may → 24 jun 2026"
  cierre: string; // "25-jun-26"
  tarjetas: string; // "Visa Platinum + Mastercard Platinum (BBVA)"
  blue: number; // dólar usado para valuar (oficial)
  rubros: RubroFoto[]; // SOLO los personales (sin software)
  software: RubroFoto; // bloque empresa, aparte
};

/** Suma los consumos de un rubro (neto). */
export function totalRubro(r: RubroFoto): number {
  return r.items.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
}

/** Total personal puro = suma de los rubros, SIN el software de la empresa. */
export function totalPersonalPuro(foto: FotoTarjeta): number {
  return foto.rubros.reduce((acc, r) => acc + totalRubro(r), 0);
}

export function totalSoftwareEmpresa(foto: FotoTarjeta): number {
  return totalRubro(foto.software);
}

/** Total de toda la actividad identificada del ciclo (personal + software). */
export function totalActividad(foto: FotoTarjeta): number {
  return totalPersonalPuro(foto) + totalSoftwareEmpresa(foto);
}

/** Rubros ordenados de mayor a menor gasto, con su total y % sobre el personal puro. */
export function rubrosOrdenados(
  foto: FotoTarjeta
): Array<{ rubro: RubroFoto; total: number; pct: number }> {
  const base = totalPersonalPuro(foto);
  return foto.rubros
    .map((rubro) => {
      const total = totalRubro(rubro);
      return { rubro, total, pct: base > 0 ? total / base : 0 };
    })
    .sort((a, b) => b.total - a.total);
}

// ─────────────────────────────────────────────────────────────────────────────
// FOTO DEL MES VIGENTE — Ciclo Mayo·Junio 2026 (cierre 25-jun-26).
// Fuente: resúmenes BBVA Visa Platinum + Mastercard Platinum. Dólar oficial $1.500.
// Reemplazar todo este bloque cuando llegue el cierre de Julio.
// ─────────────────────────────────────────────────────────────────────────────

export const FOTO_ACTUAL: FotoTarjeta = {
  cicloLabel: "21 may → 24 jun 2026",
  cierre: "25-jun-26",
  tarjetas: "Visa Platinum + Mastercard Platinum · BBVA",
  blue: 1500,
  rubros: [
    {
      id: "01",
      nombre: "Fijos / estructura",
      nota: "Lo que se paga sí o sí. HOME III (expensas del barrio) es la línea más grande de todo el resumen.",
      items: [
        { nombre: "HOME III LP VS", fecha: "07-jun", monto: 594694, tag: "expensas", detalle: "Expensas del barrio (confirmado)" },
        { nombre: "Swiss Medical", fecha: "19-jun", monto: 266258, tag: "prepaga" },
        { nombre: "Personal", fecha: "08-jun", monto: 187627, tag: "roaming", detalle: "Inflado por roaming del viaje — el mes normal ≈ $50k" },
        { nombre: "SportClub", fecha: "25-may", monto: 92000, tag: "gym", detalle: "Lo usás — fijo" },
        { nombre: "Seguros Sudamericana", fecha: "22-may", monto: 70771, tag: "seguro" },
        { nombre: "BBVA Seguros", fecha: "05-jun", monto: 14364, tag: "seguro" },
      ],
    },
    {
      id: "03",
      nombre: "Supermercado",
      nota: "No comés caro: comprás por delivery. El súper por PedidosYa mete recargo de ~15–25% sobre ir presencial.",
      items: [
        { nombre: "PedidosYa Market", fecha: "varios", monto: 187956, detalle: "12 pedidos chicos (con recargo)" },
        { nombre: "PedidosYa Carrefour", fecha: "31may–06jun", monto: 75294, detalle: "×3 (con recargo)" },
        { nombre: "PedidosYa Extra", fecha: "varios", monto: 8480, detalle: "×5 (con recargo)" },
        { nombre: "Coto", fecha: "varios", monto: 306190, detalle: "7 compras presenciales (una de $98k, otra $79k)" },
        { nombre: "El Gran Almacén", fecha: "01-jun", monto: 16573 },
        { nombre: "Carrefour (presencial)", fecha: "25-may", monto: 6830 },
      ],
    },
    {
      id: "04",
      nombre: "Ropa / retail / cuotas",
      nota: "Mayormente cuotas de compras viejas que siguen cayendo (MercadoPago). Se apagan solas mes a mes.",
      items: [
        { nombre: "MERPAGO* EP", fecha: "20-jun", monto: 64589, tag: "¿qué es?", detalle: "Consumo grande sin identificar — rastrear en MercadoPago", pendiente: true },
        { nombre: "SisComputo y Pr", fecha: "20-jun", monto: 35997, detalle: "Computación / tecno" },
        { nombre: "PayU* Adidas", fecha: "08-jun", monto: 30500, detalle: "cuota 1/6" },
        { nombre: "Sporting", fecha: "20-abr", monto: 29999, detalle: "cuota 3/3 · deporte" },
        { nombre: "Zona Vital Delta", fecha: "28-abr", monto: 18530, detalle: "cuota 2/3 · farmacia/dietética" },
        { nombre: "MERPAGO* Schockba", fecha: "21-jun", monto: 17200, tag: "hormiga", pendiente: true },
        { nombre: "Griflor", fecha: "21-ene", monto: 16361, detalle: "cuota 5/6" },
        { nombre: "MERPAGO* MBR", fecha: "15-jun", monto: 16000, tag: "hormiga", pendiente: true },
        { nombre: "Tecnosim", fecha: "04-nov", monto: 15352, detalle: "cuota 8/18 · tecno" },
        { nombre: "Perfumerías Ruiz", fecha: "18-sep", monto: 13742, detalle: "cuota 9/12" },
        { nombre: "Zara", fecha: "20-mar", monto: 13330, detalle: "cuota 3/3 · ropa" },
        { nombre: "OhMyShop", fecha: "24-ene", monto: 7078, detalle: "cuota 5/6" },
        { nombre: "La Parfumerie", fecha: "20-abr", monto: 6845, detalle: "cuota 3/6" },
        { nombre: "MercadoLibre", fecha: "varios", monto: 25757, detalle: "6 cuotas varias + MELI" },
        { nombre: "Bidcom", fecha: "27-abr", monto: 5303, detalle: "cuota 2/9 · tecno" },
        { nombre: "Oestemusic", fecha: "08-ene", monto: 3917, detalle: "cuota 6/6 · música" },
        { nombre: "Diluce", fecha: "06-ene", monto: 2651, detalle: "cuota 6/6" },
        { nombre: "María Verónica Costa", fecha: "02-jun", monto: 5900, tag: "hormiga", pendiente: true },
        { nombre: "Titual Cuatro Uno SA", fecha: "06-jun", monto: 4000, tag: "hormiga", pendiente: true },
      ],
    },
    {
      id: "05",
      nombre: "Salidas / cafés / heladerías",
      nota: "No es no salir, es la frecuencia. El helado por delivery es el antojo más caro que hay (~$42k/mes).",
      items: [
        { nombre: "Rapanui (PedidosYa)", fecha: "21may–10jun", monto: 34110, detalle: "×3 · heladería a domicilio" },
        { nombre: "Franui (PedidosYa)", fecha: "09-jun", monto: 7790, detalle: "heladería a domicilio" },
        { nombre: "Puerta Uno", fecha: "21-jun", monto: 33000 },
        { nombre: "HoyoUno", fecha: "30-may", monto: 28000, detalle: "×2" },
        { nombre: "Ronda-Nacha", fecha: "16-jun", monto: 22800 },
        { nombre: "Makena", fecha: "31-may", monto: 22000 },
        { nombre: "Equus", fecha: "24-jun", monto: 21633, detalle: "cuota 1/3" },
        { nombre: "Acacia Pastelería", fecha: "29-may", monto: 16800, detalle: "×2" },
        { nombre: "Cerini", fecha: "18-jun", monto: 15000, detalle: "cuota 1/3" },
        { nombre: "Luccianos", fecha: "09–23 jun", monto: 14100, detalle: "×2" },
        { nombre: "Tienda de Café", fecha: "10-jun", monto: 12300 },
        { nombre: "InfinitCafe", fecha: "27-abr", monto: 11661, detalle: "cuota 2/18" },
        { nombre: "Tostado Café + Tostado Tom", fecha: "17–24 jun", monto: 9840 },
        { nombre: "El Club", fecha: "30-may", monto: 9500 },
        { nombre: "PedidosYa Plus + propinas", fecha: "varios", monto: 9490, detalle: "suscripción delivery $6.390 + propinas $3.100" },
        { nombre: "Siankansa", fecha: "06-jun", monto: 9000, tag: "hormiga", pendiente: true },
        { nombre: "Pasión Eventos", fecha: "30-may", monto: 5000 },
        { nombre: "Antonio Helados y Café", fecha: "03-jun", monto: 3500 },
        { nombre: "Tompa", fecha: "08-jun", monto: 3300, tag: "hormiga", pendiente: true },
      ],
    },
    {
      id: "06",
      nombre: "Combustible",
      nota: "Costo de laburo (vas a obras), no es fuga. Pero cargás siempre $40k, no tanque lleno.",
      items: [
        { nombre: "YPF", fecha: "28may–15jun", monto: 160000, detalle: "×4 cargas de $40.000" },
        { nombre: "Puma Energy", fecha: "23-jun", monto: 40000 },
        { nombre: "Axion", fecha: "09-jun", monto: 6800, detalle: "×2 chicas" },
      ],
    },
    {
      id: "07",
      nombre: "Impuestos / costo financiero",
      nota: "Plata que no compra nada. Acá hay recorte gratis: débito automático del total y no financiar el Plan V (TNA 58–69%). El impuesto PAÍS se recupera pagando en dólares.",
      items: [
        { nombre: "Plan V — interés cuota financiada", monto: 60267, tag: "TNA 58–69%", detalle: "El crédito más caro que existe — evitable con débito automático" },
        { nombre: "Impuesto de sellos (Visa + Master)", monto: 44235, detalle: "12‰ provincial sobre el resumen" },
        { nombre: "DB IVA 21% (s/ comisión + Plan V)", monto: 15944 },
        { nombre: "IIBB + IVA percepciones", monto: 13403, detalle: "se computan/recuperan si corresponde" },
        { nombre: "Impuesto PAÍS 30% s/ dólares", monto: 0, tag: "reintegrado", detalle: "Debitado $195.862 → reintegrado (pagás en USD) = $0 neto" },
        { nombre: "Comisión Cta Premium", monto: 0, tag: "reintegrado", detalle: "$55.289 cobrada → reintegrada (DEV) = $0 neto · sube a $51k en agosto" },
      ],
    },
    {
      id: "08",
      nombre: "Garaje / varios",
      items: [
        { nombre: "Garaje Ugarte", fecha: "11-jun", monto: 22000, tag: "¿mensual?" },
      ],
    },
  ],
  software: {
    id: "02",
    nombre: "Software / IA — inversión RAVN",
    nota: "Todo lo que es dólares es software. El núcleo (Claude, Hostinger, Canva, Rendair) es motor del negocio. Cuttable sin tocar el motor: Nous + Kling + 1 streaming + auditar Apple/Wispr/GoogleOne/Railway/TiendaNube ≈ $200–250k.",
    items: [
      { nombre: "Anthropic* CLAUD", fecha: "12-jun", monto: 249615, usd: 166.41, tag: "Max 20x → 5x", detalle: "Suscripción, NO API — ya bajado a Max 5x" },
      { nombre: "Claude.ai SUBSCR", fecha: "22-may", monto: 142905, usd: 95.27, tag: "el motor", detalle: "Plan Max 5x — Claude Code" },
      { nombre: "KlingAI", fecha: "26–28 may", monto: 71970, usd: 47.98, tag: "cancelar", detalle: "Video IA — ×4 créditos sueltos" },
      { nombre: "Nous Research", fecha: "02–03 jun", monto: 52500, usd: 35.0, tag: "cancelar", detalle: "×2 cargos, ya lo dabas de baja" },
      { nombre: "Apple.com/bill", fecha: "29may–11jun", monto: 50895, usd: 33.93, tag: "auditar", detalle: "×4 cargos (uno reintegrado)" },
      { nombre: "Rendair", fecha: "29-may", monto: 28500, usd: 19.0, tag: "negocio", detalle: "Render de obras" },
      { nombre: "TiendaNube", fecha: "31-may", monto: 25412, tag: "auditar" },
      { nombre: "Wispr", fecha: "20-jun", monto: 22500, usd: 15.0, tag: "auditar", detalle: "Dictado por voz" },
      { nombre: "Netflix", fecha: "09-jun", monto: 20760, usd: 13.84, tag: "elegir uno", detalle: "Tenés Netflix Y Prime" },
      { nombre: "Hostinger", fecha: "02-jun", monto: 20599, tag: "negocio", detalle: "Hosting webs" },
      { nombre: "Prime Video", fecha: "may/jun", monto: 14616, tag: "elegir uno", detalle: "×2 (30-may + 13-jun)" },
      { nombre: "Canva", fecha: "13-jun", monto: 9742, tag: "negocio" },
      { nombre: "Anthropic (extra)", fecha: "22-may", monto: 7500, usd: 5.0, tag: "¿qué es?", detalle: "Recarga de crédito API" },
      { nombre: "Railway", fecha: "19-jun", monto: 7500, usd: 5.0, tag: "negocio", detalle: "Hosting del bot" },
      { nombre: "Google One", fecha: "23-jun", monto: 7485, usd: 4.99, tag: "auditar", detalle: "¿sobre iCloud?" },
      { nombre: "Microsoft 365 / Google Cloud", fecha: "jun", monto: 945, usd: 0.63 },
    ],
  },
};
