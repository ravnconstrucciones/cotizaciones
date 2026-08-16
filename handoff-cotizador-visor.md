# Handoff — Visor Cotizador RAVN (consola de instrumentos)

**Al día:** 16/08/2026 noche · **PASOS 0, 1, 2, 3 y EL PASE CERRADOS.** El
cotizador está en la nube (https://ravn-cotizador.vercel.app, usuario `eze`) y
ahora **deja el número y el extracto en App RAVN con un botón**.

**EL PASE ESTÁ EN PRODUCCIÓN Y VERIFICADO.** Para retomar: ir a
**"⏭️ PEDIDOS NUEVOS DE EZE"** — tres pedidos frescos del 16/08 noche (consolas
apretadas, conversación que se queda corta abajo, y **MO como ítem aparte con
contraste a tres puntas**, que es el grande).

## Lo último: EL PASE DEL EXPEDIENTE (16/08 noche)

Spec completo: `docs/superpowers/specs/2026-08-16-pase-expediente-cotizador-design.md`.

**El encuadre lo corrigió Eze y manda sobre cualquier plan viejo:** *"lo que
hacemos con el cotizador es sacarle toda la maquinaria, la lógica y el análisis;
después todo eso se manda a App RAVN… lo que se manda es la receta. Todo lo que
consideramos se compara con lo que efectivamente pasa, pero eso ya pasa en App
RAVN en el proyecto, una vez aprobada la cotización."* Y antes: *"del laboratorio
sólo quiero el precio; la redacción y todo el trabajo viene del diagnóstico"*.

Las dos leyes que salen de ahí:

1. **El laboratorio aporta el CUÁNTO, el diagnóstico el QUÉ.** El pase no mueve
   una línea de texto: ni título, ni alcance, ni notas.
2. **La maquinaria no se muda.** Fuentes, desvíos, veredictos y dial se quedan
   en el cotizador. A la oficina va el EXTRACTO.

**Hallazgo que achicó el laburo a la mitad: el circuito ya estaba construido.**
Al aprobar, `crearObraDesdeCotizacion` → `importarPlanDesdeCotizacion` siembra
`obra_plan_items` desde `desglose.items`, y el cruce compara ese plan contra
compras y MO reales. O sea: **el extracto ES `desglose.items`** y su destino es
el plan de compra. Por eso el extracto NO es opcional — sin él la obra nace con
la lista de compras incompleta y el contraste miente.

Lo construido:

- **`src/lib/cotizador/mesa-merge.ts`** — la fusión PURA que ahora comparten la
  hoja viva (`PATCH .../desglose`, una op por request) y el pase. Se extrajo del
  PATCH, no se duplicó: las dos puertas de escritura no pueden divergir en las
  reglas. La hoja viva quedó con comportamiento idéntico (569 tests verdes).
- **`POST /api/cotizaciones/[id]/pase`** — recibe el estado COMPLETO del taller,
  corre el motor UNA vez y escribe UNA vez (desglose + `precio_propuesta`
  juntos). Por la otra puerta serían 20 requests y un corte a la mitad dejaría
  el desglose sin su precio.
- **Credencial de escritura propia** — `RAVN_COTIZADOR_WRITE_SECRET`, header
  `x-ravn-cotizador-write`, allowlist de UNA ruta. Falla cerrada si la
  provisionan igual que la de lectura o la del legacy.
- **Lado cotizador:** `adapters/app-ravn-write-adapter.ts` (espejo del de
  lectura), `taller/pase.ts` (traducción pura taller→extracto), `app/api/pase`
  (proxy que agrega el secreto) y el botón al pie de la consola de margen.
- **El extracto NO se lo pide al navegador:** el proxy lo deriva de lo
  persistido (mesa en la base + expediente de App RAVN). Lo que viaja es lo que
  quedó guardado, no lo que dice tener una pantalla abierta hace media hora.

**Decisión de Eze que quedó clavada en el código: el precio cerrado viaja con su
ORIGEN real y sólo el número propio calibra.** Si cerrás un ítem con el precio de
SISMAT, el ítem queda cerrado en ese valor pero **`precios_items` no se toca** —
y el ajuste conserva `fuente: "SISMAT"` con su fecha original, así el vencimiento
sigue midiendo la antigüedad real. Esto corrige un defecto del PATCH viejo, que
inscribía TODO como *"Eze — mesa de revisión"*. El precio de un ítem a mano sí
calibra: ese lo tipeó él.

**Re-pase: el taller manda.** El pase reconstruye `ajustes` desde cero, así que
la cotización queda idéntica al taller. Pasar dos veces da lo mismo; lo que
sacaste del taller desaparece. **Lo que NO pisa:** `cantidad` y `activo` de
ajustes previos — eso sale de la mesa de revisión de la app, no del laboratorio.

**Riesgo conocido, aceptado en v1:** si entre un pase y otro editás precios a
mano en la mesa de App RAVN, el siguiente pase los pisa. Se avisa en el texto de
confirmación; detectar el conflicto real es otra vuelta.

### Probado de punta a punta contra la base REAL (16/08 noche)

Con dos cotizaciones descartables (una sintética y **un clon de una real con
receta**), borradas después por el mismo camino:

| Prueba | Resultado |
|---|---|
| Sin credencial | 401 |
| Credencial de LECTURA sobre el pase | 401 |
| Credencial de ESCRITURA sobre `/aprobar` y `/emitir` | **401 las dos** |
| El pase con su credencial | 200, motor recalculado |
| Pase repetido idéntico | **mismos totales** (idempotente) |
| Pase con el taller VACÍO | volvió a los totales originales del clon |
| Precio cerrado con origen `sismat` | ajuste con `fuente: SISMAT`, **`precios_items` intacto** |
| Precio cerrado con origen `eze` | fila `eze` escrita en `precios_items` |
| Pase sobre cotización `aprobada` | 409 con motivo |
| Origen inventado / ítem inexistente | 400 con motivo |

`cotizador_huerfanos` y `dinero_huerfanos` en **0** después de todo.
569 tests App RAVN · 125 cotizador (eran 116) · lint limpio · build OK ·
**First Load JS 167 kB** (era 166).

### DESPLEGADO A PRODUCCIÓN (16/08 noche) — Eze aprobó el deploy

`RAVN_COTIZADOR_WRITE_SECRET` cargado en los DOS proyectos (`ravn-app-one` y
`ravn-cotizador`), Production y Preview, mismo valor. Deploys disparados por API
contra `home-cards` con `target: production` (el push solo NO dispara deploy en
estos proyectos: `productionBranch` es `main`).

- App RAVN: `ravn-app-1j19li4hp-…` · Cotizador: `ravn-cotizador-qs8o0eibk-…`
- Verificado en prod: cotizador sin credenciales **401** · App RAVN `/` 307 →
  login, `/login` 200 · **el pase con la credencial de escritura da 404** sobre
  un id inexistente (o sea: pasó el middleware y llegó a la ruta) · **`/aprobar`
  con esa MISMA credencial sigue dando 401**. La frontera aguanta en la nube.

**El cotizador sigue siendo app aparte** (regla de Eze, reafirmada al aprobar el
deploy): dos proyectos Vercel, dos dominios, dos deploys. Lo único compartido es
la base. El pase los conecta por una puerta de UNA ruta, no los fusiona.

### ⏭️ PEDIDOS NUEVOS DE EZE (16/08, viendo la consola en prod) — ARRANCAR POR ACÁ

Veredicto: *"igual quedó muy muy bien, me encanta"*. Tres pedidos, ninguno
empezado. **El 3 es el más grande y es de producto, no de diseño.**

1. **Las consolas del final siguen apretadas.** Textual: *"sigue todo medio
   apretado lo de las consolas al final, que sea más extenso, que se vea más"*.
   Es la `InstrumentRow` (Confianza · Decisiones cerradas · MO vs materiales ·
   Tiempo de obra · Dispersión máxima): las cinco cards entran comprimidas y el
   texto de apoyo queda en dos líneas apretadas. Dirección: darles alto y aire
   de verdad, o pasarlas a dos filas. Ojo: no romper la vara de performance ni
   meter relleno — cada instrumento tiene que seguir midiendo algo real.
2. **El panel de conversación se queda corto abajo.** Textual: *"ahí se queda
   corto, ¿ves que abajo no se ve?"* — con la captura del monolito cortado por
   el borde inferior de la columna izquierda. El contenido (monolito de fondo +
   composer) no llega al pie de la región.
3. **Mano de obra como ítem aparte, con contraste de tres puntas.** Textual:
   *"mano de obra tiene que ser un ítem aparte donde yo la cargue a mano contra
   mano de obra sugerida SISMAT y mano de obra encontrada en web"*. O sea: la MO
   deja de ser un ítem más del rubro y pasa a tener su propia estación donde se
   ven **las tres**: la que él carga a mano, la sugerida por SISMAT y la
   encontrada en internet. **Antes de construir, cerrar con él:** ¿es por rubro
   o una sola MO de toda la obra? ¿la de él pisa el costo como hoy hace
   `precio_eze`? Hoy el contrato ya trae `precios.{sismat,internet}` por ítem y
   `desglose.tiempo` con jornales — el dato está, falta la vista y el lugar
   donde él la carga.

## Lo último: el cotizador vive en la nube (PASO 3, 16/08 noche)

**El bloqueo que el handoff no tenía visto:** el PASO 3 decía "poner
`RAVN_COTIZADOR_READ_SECRET` en App RAVN prod", pero la variable sola no servía
para nada — **el código que la lee no estaba en producción**. El gate
(`bypassCotizadorReadPermitido` en `src/middleware.ts`) vivía sólo en
`codex/cotizador-standalone-v1`; prod corre `home-cards`. Eze eligió llevarlo a
prod.

Lo hecho, en orden:

1. **Merge `codex/cotizador-standalone-v1` → `home-cards`** (`3edfa8a`, no-ff:
   `home-cards` tenía un commit propio, `e90b4ab`). Antes de mergear se verificó
   que el build raíz de App RAVN pasa en la rama — el `tsconfig` raíz incluye
   `**/*.ts` y sólo excluye `node_modules`, así que `apps/cotizador-ravn` entra
   al typecheck de la app grande. **Pasa, pero es una dependencia frágil: si el
   cotizador rompe tipos, rompe el build de App RAVN.**
2. **`RAVN_COTIZADOR_READ_SECRET` en Vercel de `ravn-app-one`** (Production y
   Preview) y **promote a prod**. Verificado contra la URL FIVE: sin secreto
   **401**, con secreto **200** con cotizaciones reales, ruta fuera de la
   allowlist (`/api/dinero/espejo`) **401**. App RAVN sana después del promote
   (`/` 307 → login, `/login` 200).
3. **Proyecto Vercel nuevo `ravn-cotizador`** (`prj_SrMGeh9XcwHfFZ2sUAanQuZSl3Ip`),
   conectado al repo de GitHub, con las 6 variables en Production y Preview.

**El error de deploy que importa recordar: el cotizador NO es autocontenido.**
El primer deploy voló con `Module not found: '../../../../src/lib/cotizador/cotizar'`.
La app importa de App RAVN `src/lib/cotizador/{tipos,cotizar,vencimiento}` y las
seis Raleway de `src/fonts/`. **Eso es a propósito y no se toca:** los umbrales
del motor son los que hacen que el visor opine, y duplicarlos rompe la propiedad
de "si el motor cambia el umbral, cambia la opinión". La solución es de
configuración, no de código:

- **Root Directory = `apps/cotizador-ravn` + `sourceFilesOutsideRootDirectory =
  true`** en el proyecto Vercel (seteado por API; en el dashboard es el check
  "Include source files outside of the Root Directory").
- Por eso el deploy **no puede salir de `vercel deploy` parado en la carpeta de
  la app**. Sale del repo entero: se dispara por API contra el ref de git
  (`POST /v13/deployments` con `gitSource {repoId: 1200117728, ref: "home-cards"}`).

**`productionBranch` del proyecto quedó en `main`** (la API rechaza patchear
`link`), igual que `ravn-app-one`. O sea: **un push a `home-cards` genera
Preview, no prod** — mismo flujo que ya conoce, `vercel promote` o disparo por
API.

**Password de basic auth: se cambió.** El local era de 11 caracteres y esto ya
está en internet abierto; se generó uno de 28. El de Vercel **no es** el que
está en el `.env.local` viejo del worktree.

Probado de punta a punta contra la nube: basic auth (sin credenciales 401, con
credenciales 200, password mala 401) · `/api/quotes` devuelve las cotizaciones
REALES de App RAVN prod · `/api/taller` alta + baja de un ítem contra Supabase
y la mesa vuelve a quedar vacía.

## Lo último: lectura real andando (commit `d3807dd`, PASO 2)

El gate de solo lectura **ya estaba construido** en esta rama
(`src/middleware.ts` de App RAVN: `bypassCotizadorReadPermitido`, tres GET y
nada más). Faltaba únicamente el secreto. Generado y puesto en las dos puntas:

- `apps/cotizador-ravn/.env.local`: `RAVN_APP_URL=http://localhost:3000` +
  `RAVN_COTIZADOR_READ_SECRET`.
- `Documents/ravn/.env.local`: el mismo `RAVN_COTIZADOR_READ_SECRET`.
- **Falta ponerlo en Vercel** (App RAVN prod) antes del PASO 3.

Probado: sin secreto **401**, con secreto **200**, y con secreto pero pegándole
a una ruta fuera de la allowlist (`/api/dinero/espejo`) **también 401**. La
frontera aguanta.

**Bug real que sólo apareció con datos de verdad:** el visor no podía abrir
NINGUNA cotización. En la base conviven **dos formas de `revision`** — la del
motor de recetas y una de investigación en curso (`{dudas, estado,
evidencia_fuente, metraje_confirmado}`). El validador exigía la primera, así que
tiraba el expediente entero por un campo accesorio. Ahora lo que no reconoce se
degrada a `null`, que aguas abajo ya significa "falta la revisión". 116 tests.

**Ojo con las cotizaciones viejas (Húsares y compañía):** su `desglose.items`
tiene la forma vieja de la consola (`{item, costo}`), incompatible con el motor
de recetas. El visor las rechaza y está BIEN que lo haga — pero conviene
decidir si se muestran como "formato viejo, no legible" en el selector en vez de
romper al elegirlas. **No lo toqué: es decisión de producto.**

### Cómo probarlo local (dos servidores)

El gate vive en ESTA rama, así que App RAVN tiene que correr desde el worktree,
no desde `Documents/ravn`:

```
cd /Users/ezeotero/.codex/worktrees/ee5a/ravn && npx next dev --port 3000
cd apps/cotizador-ravn && npm run dev        # 3010
```
(Se copió `Documents/ravn/.env.local` a la raíz del worktree; está gitignored.)

El histórico largo vive en `_bitacora-cotizador-visor.md` — no hace falta para
trabajar.

## Lo último: la mesa se guarda de verdad (commit `67144bd`, PASO 1)

Eze contestó las tres preguntas del PASO 0 (16/08, tarde):

1. **Base compartida + esquema propio del cotizador.** No base aparte.
2. **Las rutas del cotizador salen de App RAVN recién cuando el standalone esté
   probado**, no en esta tanda.
3. **Pedido 5 ("la UT/OT que arrastre") = LAS DOS COSAS:** primero la OT al pie
   del tablero (se puede contra el fixture), y el drag & drop de archivos cuando
   exista el contrato de subida.

Lo construido contra eso:

- **Migración `20260816180000_cotizador_taller.sql`, ya aplicada.** Dos tablas:
  `cotizador_taller_items` (ítem a mano, FK a `cotizaciones`, on delete cascade)
  y `cotizador_taller_decisiones` (PK `cotizacion_id + item_key`, así el upsert
  pisa y el último criterio manda). RLS al mismo criterio que
  `cotizador_lecciones`: autenticado sí, `es_bot()` no. **Ninguna toca plata:
  no hay pata de `movimientos_plata` que asentar.**
- **`src/taller/`** — `types.ts` (dominio + validación pura), `store.ts` (acceso
  por PostgREST con `fetch`, server-only, sin dependencia nueva: un cliente de
  Supabase entero para dos tablas no se justifica), `persistence.ts` (dos caras
  con la misma interfaz: **remota** contra `/api/taller`, **local** para el
  preview sintético, cuya cotización no existe en la base y rebotaría contra la
  FK). 24 tests propios.
- **Rutas** `/api/taller` (GET), `/api/taller/items` (POST/DELETE),
  `/api/taller/decisiones` (POST/DELETE).
- **Escrituras optimistas con reversión.** Si la base rechaza, el cambio se
  deshace y la consola lo dice en el chip de la cabecera del ledger
  (`.qz-taller-state`: "Mesa guardada" / "Mesa local (preview)" / el error).
  Regla anti-slop: nunca se muestra como guardado algo que no entró.
- **El ancho de las columnas se queda en `localStorage` a propósito** — es
  preferencia de ese navegador, no dato del negocio.
- La capa local lee las claves viejas (`qz:manual:`, `qz:decidido:`): lo que ya
  había guardado el visor no se pierde.

**Agujero PREEXISTENTE encontrado y tapado: el basic auth nunca corrió.** Con
`app/` adentro de `src/`, Next exige el middleware en `src/middleware.ts`; en la
raíz lo ignoraba **en silencio**. `/` y `/api` respondían 200 sin credenciales.
Movido a `src/middleware.ts`; ahora dan 401 y el build lista `ƒ Middleware` por
primera vez. `manifest.webmanifest` queda fuera del matcher porque el navegador
lo pide sin credenciales. **Esto era bloqueante para el PASO 3 (deploy).**

Verificado: 115 tests verdes (eran 91) · lint y typecheck limpios · build OK ·
**First Load JS 166 kB** · alta, decisión, reabrir y baja probadas por curl
contra la base REAL (cotización Glorietas) y las filas de prueba borradas por el
mismo camino · ítem a mano probado en el navegador.

**Lo único que quedó sin probar de punta a punta: la rama remota desde la UI.**
El código se ejercitó por curl, pero la consola con `preview=0` no levanta hasta
que exista el `READ_SECRET` (PASO 2). Por eso el PASO 2 va primero.

## Lo último: el flujo de decisión (commit `023985f`)

Las cuatro que le propuse y aprobó ("resolvé las 4"):

1. **El ítem a mano empuja el número.** Interruptor en la consola de margen:
   suma lo agregado a las DOS puntas del costo y el margen se recalcula.
   Prendido por defecto. Apagado vuelve al costo del motor solo.
2. **La decisión se toma desde la tarjeta.** Cada precio tiene `Usar`: un clic
   y el ítem sale de la cola, queda marcado en el ledger ("lo cerraste vos con
   X · $Y") con botón de reabrir. También "lo dejo cerrado igual". Vive en
   `localStorage` (`qz:decidido:<id>`) — **el visor sigue read-only: lo que
   avanza es el FLUJO, no el dato en App RAVN.** Al llegar a cero la cola, el
   rail se pliega solo y queda el tablero completo.
3. **Colores de editor en las terminales** (cierra el pedido 2).
   `src/bridge/highlight.ts`: tokenizador de UNA pasada por línea — comando,
   ruta, archivo, flag, string, número, url. Sin librerías. El `kind` de la
   línea sigue mandando el color base. 4 tests propios.
4. **Rubros que se cierran.** Plegado muestra cuántos ítems tiene y cuántos
   siguen sin cerrar.

De paso: los instrumentos pasaron de `grid auto-fit` a **flex** — en la última
fila crecen y no dejan el hueco que dejaba auto-fit.

91 tests verdes · First Load JS **165 kB**.
Capturas nuevas: `.impeccable/finish/consola-v4-decidir.png`,
`terminales-color.png`.

**La pregunta abierta más grande — YA CONVERSADA (16/08, ~11:55).** Eze quiere
que el cotizador siga siendo herramienta aparte pero que TODO persista y
alimente. Recomendación dada, esperando su OK:
**dos apps, UNA sola base (Supabase compartida) con tablas/esquema propios del
cotizador.** El límite es por momento del laburo — el cotizador es el TALLER
(antes del número), App RAVN es la OFICINA (después). Escrituras: lo del taller
va directo a sus tablas; lo que toca plata o estado pasa por endpoints de App
RAVN para que corran triggers y ledger.
Orden propuesto: (1) tablas propias en Supabase → ítems a mano y decisiones
dejan el `localStorage`; (2) deploy a Vercel con auth (hoy es localhost);
(3) handoff de expediente cerrado hacia App RAVN; (4) recién ahí sacar las rutas
del cotizador de App RAVN, que era el motivo original (velocidad).
**Detalle completo y razonamiento: `vault/Decisiones/2026-08-16-cotizador-app-aparte-base-compartida.md`.**
OJO con la premisa que Eze traía: separar la app ≠ separar la base; base propia
no acelera la carga de App RAVN ni un milisegundo, y rompe el contraste
estimado-vs-real (la receta deja de aprender).

## Lo último: la vuelta de cantos y ventanas (commit `93d3273`)

Seis pedidos de Eze (16/08, ~11:10), los seis aplicados:

1. **Cantos redondeados en todo.** Tokens `--qz-r-panel` (14), `--qz-r-card`
   (10), `--qz-r-control` (8) y píldoras en chips. El DS de la firma (cero
   radio) NO gobierna adentro del visor. `.qz-ledger` usa `overflow: clip` y no
   `hidden`: con `hidden` se crea un scrollport propio y los encabezados de
   rubro dejan de pegarse al scroll del tablero.
2. **Barras que se ven.** Scrollbars propias (12 px, pulgar claro sobre pista
   tenue) + **separadores arrastrables** entre las tres regiones — esto cierra
   el **pedido 4**. El ancho se guarda en `localStorage` (`qz:layout`), doble
   clic vuelve al de fábrica, y flechas/Shift+flechas lo mueven por teclado.
3. **El monolito vuelve a moverse.** No estaba roto: giraba a 40 s por vuelta
   (bridge apagado) y contra el negro se leía quieto. El piso subió a 20 s (11
   listo, 5 corriendo) y sumó cabeceo lento en X. Sigue a 30 fps y sigue
   codificando el estado real.
4. **Wordmark del rail en Raleway 300** (era 600). El peso lo da el tracking.
5. **"Lo que falta decidir" se pliega.** Plegado queda el lomo (`.qz-spine`)
   con el contador y un **!** rojo si hay pendientes. **Cuando la cola llega a
   cero se pliega solo** y el tablero se queda con la pantalla — eso era
   "cuando respondí todo, que aparezca el tablero completo". Si vuelve a haber
   pendientes el pliegue automático se rearma; si él lo abre a mano, no se le
   vuelve a cerrar. En mobile manda la solapa: el lomo no existe.
6. **Ítems a mano por rubro.** Botón `+ ÍTEM` en cada encabezado, alta inline
   (qué, tipo, cantidad, unidad, precio unitario), fila marcada **A MANO** con
   botón para sacarla, subtotal por rubro (`+ $X a mano`) y un cuarto dato en
   la lectura principal ("Agregado a mano" + techo con lo suyo). **Vive en
   `localStorage` por cotización (`qz:manual:<id>`), NO en App RAVN**: el visor
   sigue read-only y el ítem nunca se mezcla con el rango que cerró el motor.
   **Pendiente de definir con Eze:** si esto tiene que persistir de verdad,
   hace falta el contrato de escritura (mismo bloqueo que adjuntos y audio).

Regresión encontrada y arreglada en la misma vuelta: con el cuarto dato, la
columna de deltas (que era `auto`) se comía el número grande. Ahora está
acotada y envuelve.

Capturas: `.impeccable/finish/consola-cantos-abierta.png`,
`consola-rail-plegado.png`, `item-a-mano.png`.
87 tests verdes · First Load JS **164 kB** (era 162).

## Lo último: los dos instrumentos (commit `4e5cb03`)

Eze contestó la propuesta abierta con "avanzá con la grande del margen y la
gratis, con ambas". Antes de construir se le cerró el alcance con dos
preguntas; sus dos respuestas están clavadas en el código:

1. **Simulador, no lectura.** El instrumento tiene dial: mueve el precio y
   recalcula. **No escribe nada en App RAVN** — el visor sigue read-only, el
   número final lo fija él en la app.
2. **Las dos puntas del margen, sin jerarquía.** El costo es banda, así que el
   margen es banda: se muestran las dos y no se elige una. (Rompe a propósito
   su regla de "plata = UN número": acá el rango es el dato.)

**`src/domain/margin.ts` (+ test, 20 casos).** Toda la aritmética vive ahí; la
UI no calcula nada. Dos reglas que vienen de afuera y quedan a la vista:

- **Margen SOBRE VENTA** — `(precio − costo) / precio`. Es la MISMA cuenta que
  el cruce de obra de App RAVN (`src/lib/plan-compra/cruce.ts`). Si se
  desalinean, el contraste estimado-vs-real miente. No tocar una sin la otra.
- **`MARGEN_PISO_PCT = 30`** — regla de negocio de Eze, NO umbral del motor
  (a diferencia de los de `price-decision.ts`). Se toca ahí y cambia en todo el
  visor. **Pendiente de confirmar con él si el piso es 30% para todo laburo o
  cambia por tipo de trabajo.**

Veredictos que da: cierra el piso salga como salga · el piso es apuesta (sólo
llega si la obra sale barata) · bajo el piso en las dos puntas · el precio no
cubre ni el costo. Con el fixture: a $3.150.000 da 30,4—34,6%; a $2.950.000 se
pone ámbar con 25,6—30,2%.

**Tiempo de obra (el quinto instrumento).** `desglose.tiempo` ya venía
persistido y el visor lo tiraba. Expuesto en `core.schedule`: días, gente en
obra, jornales (días × cuadrilla) y el cruce que sirve — **lo que la MO
cotizada paga el día de cuadrilla** ($44.091 a $60.625 en el fixture). Ese
número es el que se contrasta contra lo que de verdad cobra Fran.

**El tablero ahora va para abajo (pedido 1, resuelto en parte).** Hubo que
hacerlo: al sumar la consola de margen el ledger se comía a **CERO px** — era
la única fila elástica de una grilla de 100dvh. Ahora las filas toman su alto
natural, el ledger muestra todos sus ítems y **scrollea la columna del tablero,
no la página**, con el rail de decisión quieto a la vista. Falta la parte 2 del
pedido: paneles redimensionables (pedido 4).

Capturas: `.impeccable/finish/consola-margen.png` y `margen-riesgo.png`.
87 tests verdes · First Load JS **162 kB** (era 160).

## Lo que quedó construido el 16/08 (noche) — commit `66076eb`

Contra la sección "⚠️ DIRECCIÓN NUEVA" de abajo, que sigue siendo el brief:

- **Consola a 100dvh, sin scroll de página.** Rail de 52 px + tres regiones con
  scroll propio: conversación (360) · tablero (1fr) · rail de decisión (356).
  Muere el bento con aire muerto; la pantalla se ocupa como panel.
- **El monolito es el fondo de la conversación** (precisión 6), a 330 px, girando
  con el estado real del bridge. Sale de la banda de terminales; ya no come celda.
- **Precios comparados de verdad** (precisiones 9 y 10). Módulo nuevo
  `src/domain/price-decision.ts` (+ su test): por ítem arma el abanico de precios
  persistidos (SISMAT / internet / retail / tu número) con **desvío % contra la
  más barata**, y da un veredicto **determinístico** — más barata, la que usaría,
  descartada — con **el criterio a la vista**. Los umbrales NO son inventados:
  salen del motor (`UMBRAL_DIVERGENCIA_PCT` 25, `CRITICA` 100,
  `VENCIMIENTO_DIAS` 15/30). Si el motor cambia el umbral, cambia la opinión.
- **Cola de decisiones** en el rail derecho, ordenada por severidad (sin precio →
  conflicto de fuentes → dispersión → vencido → sin contraste). Cada tarjeta
  muestra las opciones, marca la elegida y la descartada, explica por qué y
  manda a resolverlo en la conversación (hover resalta el ítem en el ledger).
- **Rubros siempre desglosados por ítem** con sus fuentes (precisión 11).
- **Números grandes** (precisión 8) y **cero relleno** (precisión 7): se fueron
  las cuatro cards de estaciones y la banda "sin comparación persistida".
  Controles guardados y actividad quedan en cajones cerrados del rail derecho.
- **Profundidad y glow**: planos montados sobre chasis con costura de 1 px,
  cantos de luz, caída estática, marcas de registro en las lecturas. El glow va
  sólo en lecturas vivas. **First Load JS 160 kB** (antes 163) — la vara de
  performance se sostuvo.

Capturas: `.impeccable/finish/consola-desktop.png` y `consola-mobile.png`.

### Vuelta de Eze sobre la consola (16/08, ~10:35) — commit `eee7a1b`

Veredicto: *"va queriendo… mucho mejor, vas, te felicito"*. Tres correcciones que
pidió, las tres aplicadas:

1. **La tipografía se había roto y era un BUG, no una decisión.** `--qz-font` se
   declaraba en `:root` pero next/font expone `--font-raleway` en la **clase del
   body**: el `var()` quedaba inválido y toda la app caía a la **serif por
   defecto del navegador**. Eso era el "AI slop" que vio. La familia vuelve a
   declararse en `body`. **No volver a mover eso a `:root`.**
2. **Relieve real** en lectura, instrumentos y banda de la ola (tokens
   `--qz-relief` y `--qz-well`): módulos levantados del chasis, dial hundido en
   su pozo. Sigue siendo sombra estática.
3. **La ola con color por tipo de línea** (`data-kind`): `tool` — lo que la ola
   busca — en salvia, `status` en dim, `result` destacado con filete, cuerpo a
   0.76rem/1.75. Y el ledger más espacioso (ítem 0.95rem, chips con aire).

**Pendiente que él dejó abierto:** el criterio de recomendación (hoy: debajo de
25% va la más barata, arriba desempata el retail, sin retail no elige) está para
discutir con él — si en obra lo resuelve distinto, se cambia en
`price-decision.ts` y cambia en todo el visor.

### ⏭️ PRÓXIMA VUELTA — pedidos de Eze del 16/08 (~10:50). ARRANCAR POR ACÁ

Veredicto: *"me encanta"*. Cinco pedidos, en orden de peso. El 3 está hecho
(`045e98c`) y el 1 quedó resuelto en parte con `4e5cb03` (el tablero ya
scrollea para abajo; falta redimensionar). Quedan vivos el 2, el 4 y el 5.

1. ~~**"Rubro y precio por ítem" está muy apretado.**~~ **EN PARTE** (`4e5cb03`). Textual: *"que vaya para
   abajo, que se pueda scrollear la página, que no haya un scroll general"*. Lo
   que molesta es la consola encerrada en 100dvh con scroll interno del ledger:
   en el rubro entran dos ítems y chau. **Dirección:** que el tablero central
   pueda respirar hacia abajo — o el ledger se estira con scroll de página, o
   los paneles se vuelven altos y el chasis scrollea entero. Ojo de no perder lo
   ganado: el rail de decisión tiene que seguir a la vista mientras se lee el
   ledger (sticky), que era el punto del rediseño.
2. ~~**Terminales: colores de editor de verdad.**~~ **HECHO** (`023985f`), en
   `bridge/highlight.ts` y no en `stream-format.ts`: el formateador sigue
   decidiendo QUÉ dice la línea, el tokenizador pinta adentro.
3. ~~Sacar la cuadrícula de atrás del monolito~~ **HECHO** (`045e98c`).
4. ~~**Ventanas manipulables:** separadores arrastrables entre las tres
   columnas, con el tamaño persistido.~~ **HECHO** (`93d3273`). Falta, si lo
   pide: expandir una región a pantalla completa.
5. **"Que abajo de todo se vea la UT/OT que arrastre".** ⚠️ Dictado por voz,
   quedó ambiguo — **preguntarle antes de construir**: ¿es la **OT** (orden de
   trabajo del rubro, para mandarle a la cuadrilla) al pie del tablero, o es
   arrastrar un archivo (drag & drop) a la app? Si es la OT: hoy no está en el
   contrato del visor. Si es drag & drop: depende del contrato de subida, que
   sigue sin existir.

**Lo que le propuse agregar:** ~~el quinto instrumento gratis (tiempo) y el
instrumento de margen~~ — **LOS DOS HECHOS** en `4e5cb03`. Ver la sección "Lo
último" arriba.

**Ojo al retomar:** el fixture de preview ahora trae un `retail` y un caso real
de divergencia (adhesivo, 31,7%) para ejercitar el instrumento; los totales del
fixture se recalcularon y los tests están al día (67 verdes).

## ⚠️ DIRECCIÓN NUEVA — 16/08 tarde. LEER ESTO PRIMERO Y NO NEGOCIARLO

Eze vio el monolito y aclaró que el pedido **nunca fue sólo el logo**. Textual:

> *"yo no iba solo al monolito, iba a toda la app. El monolito girando tiene que
> ser el CENTRO de la app. Y TODOS LOS ELEMENTOS TIENEN QUE TENER PROFUNDIDAD 3D
> y glow, si es que no afecta la performance. Quiero que parezca un laboratorio,
> un centro de control, tipo tablero de la NASA. **Te doy permiso para que te
> corras de la línea estética de la firma.**"*

Y sobre la captura del tablero: *"fijate que quizás no aprovecha el espacio a la
perfección"*.

**Qué significa esto, sin suavizarlo:**

1. **La licencia es total dentro del visor.** El Design System de RAVN (acero
   minimalista, cero color, cero sombra, geometría cuadrada) **ya no gobierna
   acá**. Eze lo levantó explícitamente. No volver a preguntar, no volver a
   frenarse por el DS, no pedirle permiso de nuevo. El visor es su centro de
   mando personal, no una pieza de marca hacia el cliente.
2. **El monolito es el centro de la APP**, no un instrumento de la banda de
   terminales. Repensar la arquitectura de la vista alrededor de él: la pieza
   girando manda la composición y el resto orbita.
3. **Profundidad y glow en TODOS los elementos**, con el único límite de la
   performance. Capas, volumen, perspectiva real, vidrio, luz — no hairlines
   planas con una sombrita.
4. **Vara:** laboratorio / centro de control / tablero de la NASA. Esa es la
   referencia, no un dashboard SaaS.
5. **El espacio está mal aprovechado.** En su captura: aire muerto abajo del
   número en "Rango estimado", y la columna de la decisión medio vacía. El
   tablero tiene que ocupar la pantalla como un panel de instrumentos, no dejar
   huecos.

**Lo único que sigue firme:** la performance (su vara textual: *"lo MÁS
importante es la performance"*) y la regla anti-slop — cada instrumento muestra
un dato REAL, nada de osciloscopios decorativos con data inventada. Un panel de
la NASA está lleno de instrumentos porque cada uno mide algo.

Esto absorbe y reemplaza al pedido 13. Va junto con el **pedido 11** (la máquina
que fluye): son la misma cosa vista desde dos lados.

### Precisiones que dio a continuación (16/08, viendo la banda del núcleo)

6. **El monolito no puede ocupar espacio propio sin ganárselo.** Textual: *"no
   entiendo por qué está ahí ocupando espacio; de última que el monolito esté
   girando en la conversación de la izquierda, de fondo"*. → Sacarlo de la
   banda de terminales y ponerlo **de fondo del panel de conversación**, detrás
   del contenido, girando. Deja de comer una celda y pasa a ser el fondo vivo
   de la app. Ojo contraste: los mensajes tienen que seguir leyéndose.
7. **CERO relleno. Todo lo que está en pantalla tiene que ser útil.** Textual:
   *"no agregues ningún dato al pedo por diseño"*. La densidad de laboratorio se
   consigue con instrumentos que MIDEN, no con adornos.
8. **Los números van GRANDES y legibles.** Es el protagonista de cada panel.
9. **Desviaciones porcentuales en TODO.** Cada número comparado contra su
   referencia (entre fuentes, contra SISMAT, contra el histórico de obra, contra
   lo estimado). El % de desvío es dato de primera clase, no un caption.
10. **El visor tiene que OPINAR, no sólo listar.** Textual: *"me decís cuál es
    el más económico, cuál usarías vos, cuál no, y yo te voy agregando"*. Por
    ítem/rubro: mostrar las opciones de precio, marcar la más barata, marcar la
    recomendada con el motivo, marcar la descartada con el motivo — y que él
    agregue o corrija desde ahí. Es un flujo de decisión, no una tabla.
11. **Dividir bien TODOS los rubros.** El desglose fino es parte del pedido.
12. **La conversación de la izquierda tiene que interpretar documentos:** el
    diagnóstico (mencionó el de cowork), la OT, y lo que le tire. Es ingesta +
    lectura, no sólo texto libre.

### Lo que hace falta para poder cumplirlo (avisarle a Eze — él lo pidió)

Estas tres cosas son BLOQUEOS reales, no excusas de diseño. Sin ellas los
pedidos 9, 10 y 12 no se pueden hacer con datos de verdad (y con datos
inventados no se hacen, regla anti-slop):

- **Desviaciones y "cuál es el más barato" necesitan MÁS DE UN PRECIO por
  ítem.** Hoy el contrato trae fuentes por ítem pero no un abanico de ofertas
  comparables. Hay que persistir las opciones por ítem (proveedor, valor, fecha,
  link) para poder calcular desvío y elegir. Es trabajo de datos, arriba del
  visor.
- **Que la conversación interprete la OT y el diagnóstico necesita adjuntos.**
  Hoy la conversación es read-only y el botón "Adjuntar" está deshabilitado a
  propósito. Hace falta el contrato de escritura + subida + parseo.
- **`RAVN_COTIZADOR_READ_SECRET`** en App RAVN y en el Cotizador. Hasta que
  esté, la lectura live falla cerrada y todo se ve contra el fixture sintético.

Mientras eso no exista: construir la interfaz completa contra el fixture, con
los lugares de cada dato ya resueltos, y dejar en N/D lo que todavía no se
instrumenta. Nunca rellenar con números inventados.

**Error a no repetir de la sesión del 16/08:** se entregó el monolito bien
resuelto pero metido en una celda, respetando el DS que Eze ya quería romper.
Cuando él pide "más futurista" por tercera vez, no es un ajuste de detalle: es
que la dirección está corta.

## Lo vigente

- **Código: ya está en `home-cards`** (merge `3edfa8a`, pusheado). La rama
  `codex/cotizador-standalone-v1` y el worktree `/Users/ezeotero/.codex/worktrees/ee5a/ravn`
  quedan como histórico — **el trabajo nuevo va en `home-cards` desde
  `~/Documents/ravn`**, que es de donde deploya Vercel.
- **Nube:** proyecto Vercel `ravn-cotizador` → https://ravn-cotizador.vercel.app
  (basic auth `eze` + password de 28 chars en las env de Vercel). Root Directory
  `apps/cotizador-ravn` con "include source files outside root" PRENDIDO — sin
  eso el build vuela por los imports a `src/lib/cotizador/`.
- **App:** `apps/cotizador-ravn` (Next.js standalone, puerto 3010 en local).
  Read-only contra App RAVN (3 GET), fail-closed, preview sintético.
- **Correr:** `cd apps/cotizador-ravn && npm run dev` →
  `http://localhost:3010/?preview=1` (necesita `COTIZADOR_PREVIEW_ENABLED=1` en
  `.env.local`, ya está, gitignored). El bridge de terminales se levanta aparte
  con `npm run bridge`.
- **OJO:** `npm run build` PISA el `.next` del dev server corriendo → 404 de
  chunks. Reiniciar `npm run dev` después de cada build.
- **`.env.local` suma `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`** (copiadas
  de App RAVN) — sin eso la mesa falla cerrada y lo dice en el chip. Están en
  `.env.example` documentadas.
- **El middleware vive en `src/middleware.ts`. NO moverlo a la raíz:** con
  `app/` adentro de `src/`, Next lo ignora en silencio y la app queda sin auth.

### El núcleo: monolito de piedra (pedido 13, commit `4542ffe`)

La pieza es la que Eze diseñó en Claude Design. Su bundle exportado está en
`apps-referencias/ravn-stone-monolith/` (leer `project/ravn-mark.html`: define
contorno, materiales y luces; `project/uploads/IMG_7708.jpg` es su referencia
de textura). **Antes de tocar el núcleo, abrir ese archivo.**

- La R se construye **por código** en `src/components/ravn-mark-3d.tsx` con el
  contorno del isotipo (mismo polígono que `ISO_PATH` en `ravn-iso.tsx`),
  extruida 0.17, sobre un plinto de grafito. Piedra fundida `#dedfdc`,
  roughness 0.72, metalness 0.05 — **mate, no acero**: con metalness alto y sin
  environment map la pieza se va a negro.
- Luz de estudio de su archivo: hemisférica 1.0, key blanca 2.2 en (4,7,5),
  fill cálida 0.5 en (−5,3,−4). Encuadre: fov 45, dirección (1, 0.55, 1.25).
- Gira según el estado REAL del bridge (apagado 40 s/vuelta · listo 18 s · ola
  corriendo 6 s). Es funcional, no decorativo.
- **300 px es el piso de legibilidad.** Probado a 216: la pieza girada no se
  lee como la R, parece una cuña. La celda se dimensiona para el monolito, no
  al revés.

**Reglas de performance del núcleo** (vara de Eze, 16/08: *"lo MÁS importante
es la performance"*). No romper ninguna sin medir:

- Geometría procedural: no hay fetch de `.glb` ni GLTFLoader en el bundle.
- `three` entra por import dinámico al montar. First Load JS: **163 kB**.
- **Sin shadow map**: sobre fondo negro la sombra proyectada no se lee y
  costaba un pase de render entero por cuadro. El plinto apoya la pieza; el
  piso lo dibuja un radial-gradient en CSS.
- Loop clavado a **30 fps** (la vuelta más rápida es de 6 s: a 60 fps se
  gastaba el doble de GPU para el mismo movimiento).
- Pausa fuera de viewport y con la pestaña oculta; DPR ≤ 2.
- `prefers-reduced-motion`: dibuja UN cuadro y no abre loop.
- Mobile (<900 px): el núcleo está en `display:none` y no se levanta WebGL.

### Profundidad y glow (licencia de Eze)

Eze habilitó **explícitamente** sombra y glow monocromos dentro del visor,
fuera de la regla "cero sombra" del Design System. Tokens en `globals.css`:
`--qz-edge` (canto de luz), `--qz-elev-1/2` (caída), `--qz-glow`. Son sombras
**estáticas**: nada las anima, así el compositor no repinta. El glow va sólo en
lecturas vivas (banda de la regla, ticks llenos del dial, segmentos listos,
punto de terminal corriendo) — nunca decorativo.

La banda del núcleo es UNA escena (monolito + estado de la máquina sobre el
mismo piso), no dos celdas con aire muerto al lado.

### La ola sale del chat (pedido 14, commit `4542ffe`)

Se fue el input lateral del launcher. El composer de la conversación despacha
la ola al bridge (`WaveRequest {prompt, seq}`; el `seq` evita el doble
disparo). **Falta**: que el composer acepte adjunto (OT/foto/hoja) — el botón
"Adjuntar" sigue deshabilitado a propósito, no hay contrato de subida todavía.

## ⏭️ POR ACÁ SE SIGUE — plan de la próxima sesión

El visor está **completo como interfaz** contra el fixture: todos los pedidos
visuales y de flujo están cerrados. Lo que falta ya no es diseño, es
**persistencia y despliegue**. El orden sale de la decisión de arquitectura del
16/08 (`vault/Decisiones/2026-08-16-cotizador-app-aparte-base-compartida.md`) y
cada paso destraba al siguiente.

~~**PASO 0 — confirmar con Eze.**~~ **HECHO** (16/08 tarde). Las tres respuestas
están arriba, en "Lo último".

~~**PASO 1 — tablas propias del cotizador en Supabase.**~~ **HECHO**
(`67144bd`). Ver arriba. Queda como regla de escrituras para lo que viene: lo
del taller va directo a sus tablas; **lo que toca plata o estado pasa sí o sí
por endpoints de App RAVN** (triggers, guards, ledger).

~~**PASO 2 — `RAVN_COTIZADOR_READ_SECRET`.**~~ **HECHO** (`d3807dd`). Ver arriba.

~~**PASO 3 — deploy a Vercel con auth.**~~ **HECHO** (16/08 noche). Ver "Lo
último" arriba. Estado: https://ravn-cotizador.vercel.app, basic auth andando,
lectura real contra App RAVN prod, mesa escribiendo en Supabase.

**⚠️ PASO 4 CANCELADO POR EZE (16/08 noche). NO CONSTRUIRLO.** Textual: *"pero
por qué sale la OT si lo que tiene que salir es la propuesta?"*. Tiene razón y
el handoff estaba mal: la OT nació de una interpretación del pedido 5 dictado
por voz. **La OT ya la produce el flujo de diagnóstico** (agente
`ravn-diagnostico` → `diagnosticos/OT_*.html|pdf`; App RAVN no genera OTs por
código) y es de ANTES del número, para que Fran pase precio. De un cotizador lo
que tiene que salir es **la PROPUESTA**.

~~**PASO 5 (adelantado) — el pase del expediente a App RAVN.**~~ **HECHO**
(16/08 noche). Ver "Lo último" arriba. La emisión sigue siendo de la app:
numeración, estados, `presupuesto_id` y el guard de receta viven allá.

**⏭️ ACÁ SE SIGUE, en este orden:**

1. **Provisionar `RAVN_COTIZADOR_WRITE_SECRET` en Vercel** (los dos proyectos,
   Production y Preview, mismo valor) + promote de App RAVN + deploy del
   cotizador. **Necesita a Eze.** Sin esto el botón no puede entrar.
2. **Que Eze pruebe el pase con una cotización de verdad** y diga si el resumen
   de confirmación le alcanza o quiere ver más antes de escribir.
3. **Contrato de escritura de la conversación** (lo que abajo figura como PASO
   5): destraba adjuntos, drag & drop, audio y que la conversación interprete
   documentos. Ahora que existe una credencial de escritura, el molde está.
4. **Sacar las rutas del cotizador de App RAVN** — el motivo original de todo:
   velocidad. Eze confirmó que esto va último.

**Lo que decía el PASO 4 original, por si alguna vez vuelve** (mitad 1 del pedido 5).
La orden de trabajo del rubro, sin precios, armándose sola abajo del ledger a
medida que él cierra ítems. Se puede hacer contra el fixture — no depende de
ningún contrato nuevo. Formato FIJO de la OT: ver memoria
[[feedback-formato-doc-fran]] y la plantilla en `~/Documents/Plantillas/`.

**PASO 5 — contrato de escritura de la conversación.** Destraba de una los
cuatro pendientes que comparten bloqueo: adjuntos en el composer (OT,
diagnóstico, fotos), **el drag & drop de archivos** (mitad 2 del pedido 5),
audio con transcripción, y que la conversación interprete documentos.

**PASO 6 — handoff de expediente cerrado hacia App RAVN** (el "subo el
proyecto" de Eze) y recién después sacar las rutas del cotizador de la app, que
era el motivo original de todo: velocidad. Eze confirmó que esto va **último**,
con el standalone ya probado.

## Lo que falta (pendientes viejos, sin orden forzado)

5. **Audio en el composer:** mandar audio y que se transcriba. Bloqueado por el
   contrato de escritura (la conversación es read-only en v1).
6. **Perfil del cliente ("análisis psicológico"): holgado / justo / rata.**
   Construirlo desde App RAVN (historial de pagos, regateos, obras) + vault y
   mostrarlo junto a la confianza para calibrar el margen. **Definir con Eze
   qué señales lo alimentan — no inventar el dato.**
11. **DIRECCIÓN DE PRODUCTO (textual, LO MÁS IMPORTANTE):** *"cotizar realmente
    es lo que más me embola, más me cuesta y más evito… me gustaría que sea
    como una plataforma dinámica, entretenida… que el cotizador me dé ganas de
    cotizar… que lo vea como una máquina, algo que fluye"*. El visor no es un
    tablero de lectura: es una MÁQUINA que trabaja para él y se ve trabajando.
    Menos superficie estática, más flujo visible (cola de rubros avanzando,
    precios cayendo, progreso que se completa solo); la ola como protagonista;
    micro-momentos de avance sin confeti ni slop. **Releer esta línea antes de
    cualquier rediseño.**
15. **Arquitectura de agentes — esperando OK de Eze.** Recomendación dada: **2
    agentes LLM + 2 fuentes por código**. Codex CLI y Fable CLI son los dos
    investigadores (ahí está el valor del contraste). SISMAT y el historial de
    App RAVN NO llevan agente: son consultas determinísticas que el bridge
    corre por CÓDIGO (cero tokens) y el visor muestra como dos estaciones más
    de la ola. El cruce por rubro: merge determinístico + una sola pasada corta
    de UN modelo si hace falta lectura semántica.
- La banda de cruce muestra "Sin comparación persistida": falta persistir la
  comparación real (contrato nuevo o derivarla de los aportes por rubro).
- **Decisión de producto pendiente (del PASO 2):** las cotizaciones viejas
  (Húsares y compañía) tienen `desglose.items` con la forma vieja de la consola
  (`{item, costo}`) y el visor las rechaza — está BIEN que lo haga, pero
  conviene mostrarlas como "formato viejo, no legible" en el selector en vez de
  romper al elegirlas.
- **Deuda que dejó el deploy:** `apps/cotizador-ravn` entra al typecheck raíz de
  App RAVN (el `tsconfig` raíz incluye `**/*.ts`). Hoy pasa, pero un error de
  tipos en el cotizador rompe el build de la app grande. Si molesta, excluir
  `apps` del tsconfig raíz.

## Reglas duras del subsistema

- **Read-only:** no tocar el `/aprobar` legacy (crea obra + presupuesto).
- **No inventar actividad:** lo no instrumentado se muestra como N/D, nunca
  simulado. Terminal real o nada.
- **Trabajo en el worktree de Codex = coordinar.** Si Codex está activo ahí, no
  tocar (turnos; ver canon multiagente del vault).
- Skills al retomar diseño: `impeccable` + `ui-ux-pro-max` + espejo del DS en
  `vault/Ravn/Design-System/DESIGN.md`.

## Capturas

`apps/cotizador-ravn/.impeccable/finish/` (dir untracked): `monolito-nucleo`,
`monolito-board`, `monolito-mobile`, `monolito-check` (el monolito a 460 px,
la prueba de legibilidad).

## Cierres relacionados en el vault

- `Conversaciones/cierres/2026/08/2026-08-15-7a5eecccec6e463813ad5c03.md` (Codex, v1)
- `Conversaciones/cierres/2026/08/2026-08-15-6b417428624bdbb7b9bd2d35.md` (Codex, rediseño)
- `Conversaciones/cierres/2026/08/2026-08-15-44331e2507b9af2ff50c52ca.md` (Claude, validación+push)
