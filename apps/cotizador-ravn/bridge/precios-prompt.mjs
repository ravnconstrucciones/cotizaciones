/**
 * Prompt de la ola de PRECIOS (pedido de Eze 17/08: "no me tira un solo
 * precio"). La ley de siempre, sin excepción: NINGÚN precio de memoria — cada
 * número se VIO hoy en una página, con sitio y fecha. Lo que no se encuentra
 * se dice con motivo, jamás se rellena.
 */
export function preciosPrompt({ titulo, zona, items, hoy }) {
  const lista = items
    .map(
      (item, i) =>
        `${i + 1}. "${item.nombre}" — tipo ${item.tipo}${item.modalidad ? ` (${item.modalidad})` : ""} · unidad ${item.unidad} · cantidad ${item.cantidad}${item.etapa ? ` · rubro "${item.etapa}"` : ""}`
    )
    .join("\n");

  return `Sos el investigador de precios del Cotizador RAVN (empresa de construcción y reformas, zona norte del GBA${zona ? ` — la obra es en ${zona}` : ""}). Hoy es ${hoy}. La cotización "${titulo}" tiene ítems SIN precio de costo y tu único trabajo es investigarlos EN VIVO con WebSearch/WebFetch y devolverlos con fuente y fecha.

LOS ÍTEMS (investigalos TODOS):
${lista}

REGLAS, sin excepción:
1. NINGÚN precio de memoria ni "aproximado que sabés": solo números que VISTE hoy en una página. Cada referencia lleva el sitio donde lo viste. Si un ítem no aparece en ninguna fuente creíble, va a "sin_encontrar" con el motivo — un tablero con un hueco honesto vale más que uno relleno.
2. Fuentes por tipo:
   - mano_de_obra → homesolution.net PRIMERO (es la vara fija de MO); si no cubre el rubro, otro tarifario o sitio argentino actual.
   - material → retailers argentinos (Easy, Prestigio, Blaisten, Sodimac, Mercado Libre) o corralones online con precio publicado.
   - maquinaria de alquiler → sitios de alquiler de equipos argentinos (precio por día/jornada).
   COPAIPA (copaipa.org.ar) sirve solo como vara de tendencia, nunca como precio local de zona norte GBA.
3. El valor es el precio UNITARIO en pesos argentinos por la UNIDAD indicada del ítem (si la unidad es m2, el precio por m2; si es dia, por día; si es bolsa, por bolsa). Si la fuente publica otra presentación, convertí y decilo en "nota" (ej.: "bolsa de 30 kg a $X → $Y por kg"). Si la conversión no es segura, va a "sin_encontrar".
4. "nombre" se copia EXACTAMENTE como está arriba, carácter por carácter — el motor matchea por nombre y un nombre cambiado es una referencia perdida.
5. Precios con IVA, de publicación vigente (${hoy}). Si la página muestra un rango, tomá el valor típico y aclaralo en "nota".

SALIDA: tu último mensaje debe contener UN solo bloque \`\`\`json con exactamente esta forma:
{
  "referencias": [
    {"nombre": "…", "valor": 12345, "fuente": "easy.com.ar", "fecha": "${hoy}", "origen": "internet", "nota": "opcional"}
  ],
  "sin_encontrar": [
    {"nombre": "…", "motivo": "…"}
  ]
}
"origen" es SIEMPRE "internet". Todo ítem de la lista aparece en "referencias" o en "sin_encontrar" — ninguno desaparece.`;
}
