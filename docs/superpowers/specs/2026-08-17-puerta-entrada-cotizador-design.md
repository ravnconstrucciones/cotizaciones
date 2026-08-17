# Puerta de entrada del cotizador — diseño (17/08/2026)

**Brief de Eze, textual (17/08 madrugada):** *"yo no quería eso!!! justamente lo
que quería no era algo de lectura, era algo que le tire la OT y cotice!!! o sea
tiene que reconocer rubros, artefactos a utilizar, maquinaria, si no de qué me
sirve"*. Y: *"probemos de 0, yo tirándole un archivo de OT y él desmenuzando"*.

El visor (en producción) es lo de DESPUÉS del número: cerrar precios, elegir MO,
ver desvíos, pasar el expediente. Esta puerta es lo de ANTES: la cotización nace
cuando Eze tira el archivo. Diseño aprobado por Eze en sesión del 17/08.

## Flujo aprobado, de punta a punta

1. **Entrada.** Eze tira el archivo en la conversación del visor (adjunto o
   drag & drop) o pega texto. Formatos día 1 (los eligió él, los cuatro):
   - PDF / documento de OT o relevamiento
   - Fotos del lugar
   - Texto pegado / dictado
   - Checklist de visita completado (viene estructurado por
     `schemas/relevamiento.ravn.schema.json` — es el caso fácil)
2. **Persistencia inmediata.** Al subir se crea la cotización en `borrador` vía
   endpoint de App RAVN (`borrador` no exige receta: el guard
   `trg_cotizaciones_guard` lo permite) y el archivo queda en
   `cotizacion_archivos`. Nada se pierde aunque se cierre la pestaña o se
   apague la Mac.
3. **Desmenuzado.** La herramienta lee el archivo y produce la **propuesta de
   reconocimiento**: rubros (lista abierta, los que salgan del laburo), ítems
   con cantidad y unidad, artefactos, maquinaria, y MO con días y cuadrilla.
   Cada dato con su origen ("lo dice la OT" / "deducido de la foto"). Lo
   ambiguo entra como pregunta (`preguntas_abiertas` de la receta candidata),
   nunca como número inventado.
4. **Confirmación de Eze.** Edita cantidades, saca/suma ítems, contesta lo
   ambiguo, en el visor. **Antes de su confirmación no se crea receta ni se
   cotiza nada** (el borrador del paso 2 sí existe, pero está vacío de alcance).
5. **Creación.** Al confirmar: se crea la **receta candidata** (origen +
   confianza por ítem, como exige `validarRecetaCandidata`) y la cotización
   pasa a `en_revision` con su `receta_id`. El guard queda satisfecho por
   diseño, no por excepción.
6. **Precios: el motor, jamás la lectura.** SISMAT por código; internet por la
   ola (jerarquía del cotizador-maestro, precios fechados con fuente). Lo que
   quede sin precio cae como "sin precio" en la cola de decisiones del visor,
   que ya lo maneja. De ahí en más es el flujo existente: cerrar precios,
   postulantes de MO, margen, pase.

## Motor de lectura — DECISIÓN DE EZE (17/08): Opción B, la ola

El desmenuzado corre como **ola por el bridge** (Codex CLI / Fable CLI en la
Mac). Textual: *"necesito de todo el potencial y yo cotizo con la Mac abierta,
no quiero gastar un peso de más"*. Sin API de pago, sin adaptador de proveedor
nuevo.

Consecuencias asumidas y aceptadas:

- **Mac apagada = la puerta no desmenuza.** El archivo y el borrador igual
  persisten (paso 2); al levantar el bridge se retoma. La UI lo dice claro
  ("bridge apagado"), nunca simula que está trabajando (regla anti-slop).
- La ola de intake recibe la REFERENCIA (id de cotización + archivo persistido)
  y lee el archivo con la credencial de lectura; el resultado estructurado
  vuelve por el contrato de escritura, no por texto suelto.
- El visor muestra la ola desmenuzando en vivo — es "la máquina que fluye"
  (dirección de producto #11), no un spinner.

## Maquinaria — concepto nuevo del motor

Resuelto con la decisión previa de Eze (09/08, caso sierra de sable Húsares:
"las herramientas de capital nunca se cargan como costo de una obra puntual;
son capex de RAVN o se alquilan"):

- **Tipo de ítem nuevo `maquinaria`** en la receta, con modalidad:
  - **`alquiler`** → entra al costo con precio fechado (SISMAT/internet), como
    un material más.
  - **`propia`** (capex) → se reconoce y se LISTA (logística, OT), pero **no
    suma al costo de la obra**.
- Sin amortización por obra en v1 (la regla es capex o alquiler, punto).
- **Artefactos**: NO son tipo nuevo. Son materiales con marca `artefacto: true`
  para que el visor los agrupe aparte ("se compran e instalan").

## Escritura — estrena el contrato de la conversación (ex PASO 5)

Molde del pase, ya probado en producción: todo lo que toca estado entra por
**endpoints de App RAVN** con `RAVN_COTIZADOR_WRITE_SECRET` y allowlist de
rutas contadas. Rutas nuevas mínimas: crear cotización `borrador` + adjuntar
archivo; confirmar reconocimiento (crea receta candidata + pasa a
`en_revision`). Esto destraba de paso adjuntos y drag & drop del composer, que
compartían el mismo bloqueo.

## Manejo de error

- Archivo ilegible / formato no reconocido → se dice, se pide de otra forma.
  No se adivina.
- Lectura ambigua → `preguntas_abiertas`, resueltas por Eze en la confirmación.
- Bridge caído a mitad del desmenuzado → el borrador + archivo persisten; se
  relanza la ola. Ningún estado intermedio se muestra como terminado.
- El pase y la creación son idempotentes al estilo del pase existente.

## Testing

- Unit: parser/validador de la propuesta de reconocimiento
  (`validarRecetaCandidata` extendido con maquinaria y artefacto), traducción
  propuesta→receta candidata.
- Endpoints: allowlist (401 con credencial equivocada), guard (borrador sin
  receta OK, `en_revision` sin receta rebota), idempotencia.
- Punta a punta: una OT real de `~/Documents/Plantillas/` (plantilla Fran) y un
  checklist de visita real → cotización en el visor con precios del motor.
- Verificación estándar del subsistema: tests cotizador + App RAVN, typecheck,
  lint, build; `cotizador_huerfanos` y `dinero_huerfanos` vacías.

## Fuera de alcance v1

- Audio con transcripción (bloqueo propio; el contrato de escritura lo acerca).
- Amortización de maquinaria por obra.
- Perfil del cliente (holgado/justo/rata) — sin definir señales con Eze.
- OT como salida del cotizador (cancelado por Eze: del cotizador sale la
  PROPUESTA; la OT es del flujo de diagnóstico).

## Restricciones que NO se negocian

- Ninguna cotización activa sin receta (`trg_cotizaciones_guard`, lo hace
  cumplir la base).
- Los precios no se inventan: la IA interpreta el QUÉ y las cantidades; el
  CUÁNTO lo pone el motor con fuente fechada.
- El cotizador sigue siendo app aparte; base compartida; lo que toca plata o
  estado pasa por endpoints de App RAVN.
- Regla anti-slop: nada se muestra como hecho/guardado/leído sin verificarlo.
