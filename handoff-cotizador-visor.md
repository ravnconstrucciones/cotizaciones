# Handoff — Visor Cotizador RAVN (consola de instrumentos)

## ✅ PUERTA CONVERSACIONAL: EL CHAT ES LA PUERTA (17/08 mediodía) — SIN DEPLOY

Eze vio el composer y dijo, textual: *"la puerta de entrada tiene que ser
esa!! ahí cargo la OT"*. Diseño cerrado con él pregunta por pregunta (spec
`docs/superpowers/specs/2026-08-17-puerta-conversacional-cotizador-design.md`,
plan `docs/superpowers/plans/2026-08-17-puerta-conversacional-cotizador.md`)
y CONSTRUIDO ENTERO. Commits en `home-cards` (local): `14bf381` spec ·
`c4eed54` plan · `84c5e80` helpers · `a43ad47` intake-client · `c33f1f4`
composer · `49d162f` caja+panel · `e49992a` bridge · `e5827fe` home ·
`968d120` borra gate · `873146f` fixes de la prueba real.
**✅ PUSHEADO y EN PRODUCCIÓN (17/08 ~12:50, Eze aprobó):** deploy
`dpl_VEjG3Ka47bn2AEs5CmNanJkkQ18S` READY sobre `e51ea91`. Verificado en la
nube: 401 sin clave · 200 con la cookie de acceso · la home sirve la puerta
("Tirá la OT…").

**🔌 PUENTE LEGACY APAGADO (orden de Eze: "las cotizaciones NACEN POR LA
PUERTA"):** `com.ravn.puente-cotizador` (el daemon que contestaba
`cotizacion_mensajes` por Realtime) quedó bootout + disable, y su plist movido
a `~/Library/LaunchAgents/com.ravn.puente-cotizador.plist.apagado-20260817`.
No recarga al login. El código en `daemon/puente-cotizador/` queda en el repo
como archivo muerto — si alguien lo quiere revivir, primero hablarlo con Eze.

**Lo que quedó:** el visor abre en la caja vacía (estilo ChatGPT); el primer
envío crea el expediente (título provisional del primer renglón; el real lo
trae Fable), sube adjuntos, deja el primer mensaje del hilo y despacha la ola;
la propuesta vuelve al hilo como mensaje de Fable con el `ReconocimientoPanel`
embebido debajo (`variant="hilo"`); responder por la caja relanza la ola DE
INTAKE **con el hilo a la vista** (el bridge lo lee por PostgREST — verificado:
la hormigonera pasó a "propia" por un mensaje del chat); Confirmar → receta
candidata + `en_revision` + tablero, igual que antes. El clip vive SIEMPRE
(charla incluida: sube al expediente + pie "Adjunté: …" + la ola de charla
baja los archivos y corre con Read). `intake-gate.tsx` BORRADO; `subirUno` y
`despacharOla` viven en `src/lib/intake-client.ts`. Sin cotización activa el
adapter cae a la más nueva (antes: pantalla de error).

**Probado punta a punta con DOS olas reales** (cotización de prueba borrada,
`cotizador_huerfanos` y `dinero_huerfanos` en 0): OT .txt + texto → propuesta
con 3 rubros / 13 ítems / maquinaria propia vs alquiler / 5 preguntas de obra
→ respuesta por chat → propuesta v2 con la respuesta incorporada → Confirmar →
tablero. Capturas: `.impeccable/finish/puerta-conversacional-*.png`.
Verificación: 207 tests cotizador · 591 App RAVN · typecheck raíz+cotizador ·
lint · build 177 kB (era 176).

**🔴 HALLAZGO para decidir con Eze:** el hilo lo contesta TAMBIÉN el
respondedor legacy de App RAVN (el daemon que responde `cotizacion_mensajes`).
En la prueba metió respuestas tipo charla diciendo "el adjunto no me llegó"
(él no ve los archivos de la puerta) y "ya volcado a la propuesta" (no puede
tocarla — slop). Dos voces contestando el mismo hilo confunden: decidir si el
daemon se apaga para cotizaciones con intake o se le enseña la puerta.

**Pendiente chico anotado:** si una ola de charla/intake se despacha mientras
otra corre, el bridge devuelve 409 y el aviso lo dice — comportamiento
correcto pero sin cola; con uso real conviene mirar si molesta.

## ✅ CONVERSACIÓN OPERATIVA: EL COMPOSER ESCRIBE DE VERDAD (17/08 mañana)

Eze vio el composer muerto desde el celular ("¿podés hacer que eso también
funcione? dejá todo operativo") y quedó construido, probado y EN PRODUCCIÓN.
Commits `35bd834` (la conversación) + `dcaedf4` (CORS del bridge) en
`origin/home-cards`. Deploys: App RAVN `dpl_JCLRrUXATwG46kKXySsBSBGoYKmg` ·
Cotizador `dpl_7aXRMwXHmLPca1knLAX8rQ1iwPFu` (este último con las env nuevas
del bridge), los dos READY y verificados.

**El circuito:** composer → `POST /api/mensajes?quote=` (proxy) → App RAVN
`POST .../mensajes` con la write credential (allowlist ampliada; `/aprobar` y
`/emitir` siguen 401) → el mensaje persiste como `eze` en
`cotizacion_mensajes` ANTES de despachar nada → ola de charla al bridge
(`kind: "charla"`) → Fable con el expediente a la vista (cotización + últimos
30 mensajes por PostgREST, prompt `bridge/charla-prompt.mjs`) → su respuesta
entra al MISMO hilo como `fable` con `respuesta_a` → el visor refresca el hilo
solo (debounce 900 ms tras cada `result` de la ola). Si la ola falla, el
motivo queda en el hilo como `sistema`. Sin bridge, el mensaje queda guardado
y el aviso lo dice. El hilo ahora muestra las cuatro voces (antes filtraba
fable/codex).

**Probado punta a punta en navegador** contra un clon real del intertrabado
(borrado después, huérfanos en 0): pregunta desde el composer → respuesta de
Fable en 11 s con datos REALES del desglose ("cama y recolocación $825.000 =
31% de los $2.620.593 de MO"). Captura:
`apps/cotizador-ravn/.impeccable/finish/conversacion-operativa.png`.

**Para que la ola salga desde el visor de la NUBE (en la Mac):**
`COTIZADOR_BRIDGE_TOKEN` + `COTIZADOR_BRIDGE_URL=http://127.0.0.1:3011` ya
están en Vercel (Production+Preview) y el bridge acepta lista de orígenes
(`COTIZADOR_BRIDGE_ALLOWED_ORIGIN` en `.env.local`, ahora local + prod, CORS
con eco y `Vary: Origin`). Desde el CELULAR el bridge es inalcanzable
(127.0.0.1): el mensaje persiste igual y la ola se relanza con la Mac abierta
— es el modelo "yo cotizo con la Mac abierta". Ojo Safari: puede bloquear
http://127.0.0.1 desde página HTTPS; en Chrome anda.

**Anotado, NO arreglado (cosmético):** en la terminal de Fable, un mensaje del
asistente con bloque `thinking` vacío se imprime como JSON crudo
(`stream-format.ts` no lo reconoce y lo pasa entero — es la regla "no
desaparecer mensajes" de la ronda 4 mostrando su costado feo).

**El bridge quedó CORRIENDO** (se apaga solo a los 30 min sin uso; se levanta
con `npm run bridge` en `apps/cotizador-ravn`). Dev servers apagados.

## ✅ PUERTA DE ENTRADA: CONSTRUIDA Y EN PRODUCCIÓN (17/08 madrugada)

Eze dijo "terminalo para cuando me despierte" y quedó TERMINADA, verificada y
deployada. Plan ejecutado completo:
`docs/superpowers/plans/2026-08-17-puerta-entrada-cotizador.md` (spec en
`docs/superpowers/specs/2026-08-17-puerta-entrada-cotizador-design.md`).

**Commits en `origin/home-cards`:** `bae1280` (motor: maquinaria + artefacto) ·
`98186d6` (migración `cotizador_intake` + check del plan de compra, APLICADA a
prod) · `28e17d5` (App RAVN: `POST /api/cotizaciones/intake`,
`POST .../confirmar-reconocimiento`, allowlists de archivos) · `9b84070`
(cotizador: contrato de propuesta, traducción a candidata, intake store, rutas
`/api/intake/*`) · `3286eaa` (bridge: ola de intake con Fable + Read) ·
`21a61e3` (visor: IntakeGate + ReconocimientoPanel + maquinaria propia fuera de
la cola) · `11ed5fd` (COPAIPA en el prompt) · `b925d9b` (fix 1ª ola real + copy
institucional).

**Deploys de prod verificados:** App RAVN `dpl_J4DgZpnPGfPBGNoHnvZsZsEkgiYb` ·
Cotizador `dpl_BeGxXrpi8i27iWxv6Shp1QfQqS1E`, los dos READY sobre `b925d9b`.
Circuito prod-a-prod probado: el visor cloud creó un borrador en App RAVN cloud
por su write secret y lo leyó con intake+archivos (cotización de prueba borrada
después).

**El flujo que quedó andando (probado punta a punta con una OLA REAL):**
"+ Nueva cotización" en el selector → gate (drop de archivos ≤4MB por proxy,
>4MB directo a Storage con firmar/confirmar, texto pegado) → borrador +
`cotizador_intake` persisten AL TOQUE → la ola corre en la Mac por el bridge
(SOLO Fable, `claude -p` con Read+WebSearch) → propuesta de reconocimiento
persistida por PostgREST → panel editable (rubros, ítems, cantidades,
maquinaria alquiler/propia, artefactos, preguntas con respuesta) → Confirmar →
receta candidata + `en_revision` + precios del motor (cache `precios_items` +
referencias fechadas de la ola, fecha más nueva gana, `eze` solo del cache) →
tablero normal con la cola de decisiones. Captura de la propuesta real:
`.impeccable/finish/puerta-entrada-propuesta.png` (pintura 4x3: 9 ítems con
origen, escalera reconocida como maquinaria PROPIA que no suma, 6 preguntas de
obra de verdad).

**Reglas que quedaron clavadas en código:**
- Maquinaria = tipo nuevo del motor. `alquiler` suma en bucket propio
  (`totales.maquinaria_min/max`); `propia` se lista (subtotal 0, no entra a la
  cola: `price-decision.ts` la cierra como capex). Check de `obra_plan_items`
  ampliado a maquinaria.
- Artefacto = marca sobre material (`artefacto: true`), agrupado aparte en el
  panel.
- La write credential ahora abre: pase + intake + archivos (3 rutas de subida) +
  confirmar-reconocimiento. Verificado en prod: `/aprobar` y `/emitir` siguen
  401 con esa credencial.
- La read credential suma `GET .../archivos` (URLs firmadas para la ola).
- Fuente con tipo fuera del enum en la propuesta → se normaliza a `obra` (la 1ª
  ola real vino con "Texto de Eze" tipo inventado y se tiró entera; ya no).
- Copy institucional: "trabajo", nunca "laburo" (corrección de Eze en vivo).

**OJO para la próxima sesión:**
- **SECRETS ROTADOS Y ALINEADOS (17/08, pedido de Eze "alinea eso"):**
  `RAVN_COTIZADOR_READ_SECRET` y `RAVN_COTIZADOR_WRITE_SECRET` se regeneraron y
  quedaron IGUALES en las cuatro puntas: Vercel `ravn-app-one` + `ravn-cotizador`
  (Production y Preview, ahora tipo `encrypted` — legibles por API, ya no
  sensitive) y los dos `.env.local` (raíz y cotizador). Verificado contra prod:
  read 200 · intake 400 · pase 404 · aprobar 401 · secret trucho 401. Cualquier
  copia vieja del secret quedó inválida.
- **El "desalineado" de anoche era el DECOY:** `ravn-app-one.vercel.app` sirve
  un deployment CLAVADO de julio (la memoria ya lo marcaba). La URL real de
  App RAVN prod es **`ravn-app-one-five.vercel.app`** — toda verificación por
  curl va SIEMPRE ahí. El `targets.production` del proyecto sí apunta al deploy
  nuevo.
- Deploys finales de la alineación: App RAVN `dpl_jsPBmJ4QrgvJVYe4FByyNjT7HiC7`
  · Cotizador `dpl_2p8zetnsBJDSTLyZkmpGu2RgGAd8`, los dos READY y verificados.
- El bridge necesita `SUPABASE_URL` (o NEXT_PUBLIC) + `SUPABASE_SERVICE_ROLE_KEY`
  en `apps/cotizador-ravn/.env.local` para persistir la propuesta (ya están).
  Sin ellas rechaza la ola de intake con 503 y lo dice.
- Bridge y dev servers quedaron APAGADOS. Levantar: `npm run bridge` (cotizador)
  cuando se cotice.
- COPAIPA (pedido de Eze 17/08) quedó como vara mensual en el prompt de intake y
  documentada con calibre anti-transplante en
  `vault/Conocimiento/Precios/copaipa.md`; calculatucasa.com.ar en
  `calculatucasa.md` (obra nueva, no reformas).

**⏭️ SIGUE: cotizar de verdad por la puerta** — tirar una OT real de
`~/Documents/Plantillas/` o un checklist de visita y recorrer el flujo entero
con Eze. Fuera de alcance v1 (spec): audio, amortización de maquinaria, perfil
del cliente.

## Historia: el diseño aprobado (17/08) — YA CONSTRUIDO, ver arriba

El brainstorming YA ESTÁ HECHO y el diseño está APROBADO por Eze. **Spec
completo y commiteado (`ff57a5b` en `home-cards`):
`docs/superpowers/specs/2026-08-17-puerta-entrada-cotizador-design.md` — leerlo
ANTES que cualquier otra cosa de esta sección.** Decisiones clavadas:

- **Motor de lectura = Opción B, la ola** (bridge → Codex/Fable en la Mac).
  Textual de Eze: *"necesito de todo el potencial y yo cotizo con la Mac
  abierta, no quiero gastar un peso de más"*. Sin API de pago. Mac apagada =
  no desmenuza, pero archivo + borrador persisten y se retoma.
- **Formatos día 1 (eligió los cuatro):** PDF/OT · fotos · texto pegado/dictado
  · checklist de visita (schema ya existe).
- **Flujo:** subida → cotización `borrador` + `cotizacion_archivos` al toque →
  ola desmenuza → propuesta de reconocimiento (rubros/ítems/artefactos/
  maquinaria/MO, con origen; lo ambiguo = pregunta) → Eze edita y CONFIRMA →
  receta candidata + `en_revision` → precios del motor → visor normal.
- **Maquinaria = tipo de ítem nuevo** con modalidad `alquiler` (entra al costo,
  precio fechado) / `propia` (capex, se lista, NO suma) — sale de la decisión
  de Eze del 09/08 (sierra de sable). Artefactos = material con marca, no tipo
  nuevo. Sin amortización en v1.
- **Escritura por el molde del pase**: endpoints App RAVN + write secret +
  allowlist. Estrena el contrato de escritura (ex PASO 5) y destraba adjuntos y
  drag & drop.

**⏭️ Próxima sesión: arrancar leyendo el spec e invocar
`superpowers:writing-plans` para el plan de implementación. NO re-preguntar
nada de lo de arriba.**

## 🚨 EL BRIEF ORIGINAL (17/08, madrugada) — ya convertido en el spec de arriba

Textual, después de entrar al visor y ver que no podía hacer nada con una OT:
*"yo no quería eso!!! justamente lo que quería no era algo de lectura, era algo
que le tire la OT y cotice!!! o sea tiene que reconocer rubros, artefactos a
utilizar, maquinaria, si no de qué me sirve"*. Y antes: *"probemos de 0, yo
tirándole un archivo de OT y él desmenuzando"*.

**El malentendido de fondo, para que no se repita:** el visor se construyó como
LABORATORIO DE LECTURA sobre cotizaciones que ya nacieron en App RAVN — decidir
precios, comparar fuentes, elegir mano de obra, pasar el expediente. Nunca tuvo
puerta de ENTRADA. Para Eze la herramienta empieza antes: **la cotización nace
cuando él tira la OT.** Sin esa puerta, el visor le pide un trabajo que ya está
hecho, y por eso dice "no me sirve". No es un pedido de feature: es el arranque
del flujo que faltaba.

**Lo que hay que construir (el brief, en sus términos):** él suelta un archivo
de OT / relevamiento / pedido del cliente, y la herramienta **desmenuza sola**:

- **rubros** (los que salgan del trabajo, no una lista fija),
- **ítems con cantidad y unidad**,
- **artefactos** a utilizar (los que se compran e instalan),
- **maquinaria** y herramienta necesaria — hoy NO existe como concepto en el
  motor: es dato nuevo, no está en `desglose.items` ni en las recetas,
- **mano de obra** con días y cuadrilla,

y de ahí sale una cotización de verdad, con precios de las fuentes que ya
existen (SISMAT + internet, jerarquía del cotizador-maestro), que **cae en el
visor para que él la desmenuce**: cerrar precios, cargar postulantes de MO, ver
desvíos y hacer el pase. O sea: el visor sigue siendo lo de después — lo que
falta es lo de antes.

**Restricciones duras que condicionan el diseño (verificadas, no supuestas):**

1. **`trg_cotizaciones_guard`**: ninguna cotización `en_revision`/`aprobada`/
   `documento_emitido` puede existir sin `receta_id`. "Manual" no existe. O sea:
   el intake tiene que **producir una receta** o dejar la cotización en
   `borrador` hasta que la tenga. Esto no se negocia por código, lo hace cumplir
   la base.
2. **La maquinaria es concepto nuevo.** Antes de construir hay que decidir si es
   un rubro, un tipo de ítem o un campo del desglose — y si se alquila o se
   amortiza, porque eso cambia el número.
3. **El composer del visor no escribe todavía** (no hay contrato de escritura),
   así que la puerta de entrada es trabajo nuevo de punta a punta: subida del
   archivo, lectura, propuesta, confirmación de Eze, creación.
4. **Los precios NO se inventan**: salen de la maquinaria que ya existe. La IA
   interpreta el QUÉ y las cantidades; el CUÁNTO lo pone el motor con fuente
   fechada. Es la regla del vault ("costo mío con fuente, margen suyo").

**Cómo arrancar la sesión que lo construya:** brainstorming con Eze sobre la
puerta de entrada (qué formatos entran, qué hace la herramienta cuando el
archivo es ambiguo, cómo confirma él lo que reconoció antes de que se cree
nada), y recién después el plan. NO empezar a codear el parser sin eso.


**Al día:** 17/08/2026 · **LOS 19 ARREGLOS YA ESTÁN EN PRODUCCIÓN.** Eze aprobó
el deploy y se dispararon los dos por API sobre `48bf735` (`home-cards`,
`target: production`): Cotizador `dpl_Erva9uaLioNMKFs5XbPq1dJwuTsF` · App RAVN
`dpl_3o6N4biwcHhAdeLsnV1putTBWhqR`. Los dos READY. Verificado en la nube:
cotizador **401** sin credenciales y **200** con ellas, `/api/quotes` devuelve
las cotizaciones REALES; App RAVN `/` 307 → login, `/login` 200. **App RAVN
también había que deployarla** — tres de los arreglos viven en su código
(`cotizar.ts`, `mesa-merge.ts`, `vencimiento.ts`: el sellado de precios con la
fecha de mañana). **⏭️ Lo que sigue: cotizar de verdad con Eze.**

**Al día previo:** 16/08/2026 noche · **CAZA DE ERRORES CERRADA: 4 rondas, 19 bugs,
commit `7587657` en `origin/home-cards`.** · **PASOS 0,
1, 2, 3, EL PASE y LOS TRES PEDIDOS DEL 16/08 CERRADOS.** El cotizador está en la nube
(https://ravn-cotizador.vercel.app, usuario `RAVN`), deja el número y el
extracto en App RAVN con un botón, y **la mano de obra ya es un rubro propio con
postulantes**.

**✅ EN PRODUCCIÓN Y VERIFICADO (16/08 noche).** Eze aprobó las dos cosas y se
hicieron:

1. **Migración `cotizador_taller_postulantes_mo` APLICADA** a la base de
   producción (10 columnas, 4 policies, 3 índices, RLS activo). CRUD probado
   contra la base REAL por curl: alta, elegir, cambio de elegido (el índice
   único hace el swap bien) y baja; **filas de prueba borradas**;
   `cotizador_huerfanos` y `dinero_huerfanos` en **0**.
2. **Commits `78f3579` + `e9fb679` pusheados a `origin/home-cards`** y **deploy
   de producción de los DOS proyectos** por API contra ese ref:
   App RAVN `dpl_ChQaBMqadVRcuNKUdSRbEMCXGau3` · Cotizador
   `dpl_7RCRxEmXhfwFAF8KBratY19sdyWX`. Los dos READY.

Verificado en la nube: cotizador **401** sin credenciales y **200** con ellas ·
`/api/taller/postulantes` existe y valida (**409 not_persistable** con un id que
no es UUID) · `/api/taller` de una cotización real devuelve **200** con
`postulantes: []` · App RAVN `/` 307 → login, `/login` 200.

## 🔴 CAZA DE ERRORES — RONDA 1 HECHA (16/08 noche). SIN COMMITEAR.

Eze pidió, textual: *"/loop de corrección de errores que no quede ni uno fuera y
ya avanzamos para usarlo"*, y después *"segui con ronda 2 que no haya errores"*.

**Estado: 4 bugs encontrados, arreglados y verificados. TODO EN EL WORKING TREE
de `home-cards`, sin commit ni deploy** (Eze no lo pidió todavía; se le preguntó
y contestó "seguí con ronda 2"). Base al empezar: commit `3357d9b`.

Verificación de la ronda 1: **155 tests cotizador** (eran 150) · **572 App RAVN**
· typecheck y lint limpios · `npm run build` OK con **171 kB** First Load JS (no
engordó) · los tres fixes de UI probados en el navegador con Playwright contra
`?preview=1`.

### Los 4 bugs de la ronda 1

1. **`src/domain/labor.ts` — el desvío recitado tenía la base invertida.** Con
   SISMAT 100k y Fran 150k elegido escribía *"SISMAT está 50% abajo de Fran"*:
   es **33,3%**. El 50% es cuánto está Fran ARRIBA, que es la otra cuenta (y es
   la que alimenta el veredicto, que estaba bien). Pasaba en 3 frases; la rama
   sin elegido estaba correcta y sirvió de control. Ahora conviven `contraOther`
   (base = referencia, para el veredicto) y `delta` (base = elegido, para la
   frase). **Dos tests existentes codificaban el bug** (24,9% y 25%) y se
   corrigieron con la cuenta verificada a mano; se sumó un test de dirección.

2. **`src/domain/margin.ts` + `MarginConsole` — la MO elegida y los ítems a mano
   entraban al costo SIN imprevistos ni zona.** El más caro. `core.costRange` es
   un TOTAL (`subtotal × (1+imprevistos%) × factor_zona`), pero el postulante
   marcado y el add-on son subtotales crudos y se sumaban derecho. Se agregó
   `subtotalToTotalScale()` (puro, con tests) y se escala antes de sumar.
   Medido contra la base real: Glorietas `3.909.708,65 × 1,10 × 1,20 = 5.160.815
   = total_max` → **factor ×1,32**. Verificado en navegador: un add-on de
   $370.000 ahora pesa $407.000 (factor 1,1000 exacto en el fixture, que no es
   zona premium).

3. **`MarginConsole` — el precio que ponía Eze se borraba solo.** El `useEffect`
   dependía de `opening`, que se recalcula con `costMax`: marcar un postulante o
   tocar el interruptor de ítems a mano pisaba el precio con el piso del 30%. Y
   ese precio es el que viaja en el pase (`precioPropuesta`). Ahora la reapertura
   se dispara por `snapshot.quote.id` con un `useRef`, que era la intención
   declarada en el comentario original.

4. **`MarginConsole` — vaciar el campo de precio desarmaba el panel.** `price`
   quedaba en null → `band` null → el early-return se comía el input (no había
   forma de volver a escribir) y encima mentía *"el motor todavía no cerró el
   costo"*. Se separó el early-return del costo del de "todavía no hay precio", y
   el campo se extrajo a `PriceField` para que sea el MISMO en los dos estados.

## 🔴 CAZA DE ERRORES — RONDA 2 HECHA (16/08 noche). SIN COMMITEAR.

**6 bugs encontrados, arreglados y verificados**, encima del working tree de la
ronda 1 (sigue todo sin commit ni deploy sobre `3357d9b`).

Verificación: **160 tests cotizador** (eran 155) · **572 App RAVN** · typecheck
raíz y del cotizador limpios · lint limpio · `npm run build` **171 kB** (no
engordó) · probado en el navegador contra `?preview=1` a las 22:08 de Buenos
Aires, que es justo la hora en la que muerde el bug de fechas.

### Los 6 bugs de la ronda 2

**Los tres primeros son la misma falla, en tres lugares: la fecha se tomaba de
UTC o de la zona de la máquina, nunca de Buenos Aires por su nombre.** La ronda
1 arregló esto sólo en `labor.ts` y con `getTimezoneOffset()`, que tapa el
navegador y deja roto el servidor. Ahora hay UN helper —`hoyIsoAR()` en
`src/lib/cotizador/vencimiento.ts`, con la zona NOMBRADA, mismo criterio que
`src/lib/semana.ts`— y lo usan los dos lados.

1. **`labor.ts` — `hoyLocalIso` daba distinto en el servidor que en el
   navegador.** `getTimezoneOffset()` es la zona de la MÁQUINA y en Vercel eso
   es UTC; esta consola la renderiza Next del lado del servidor antes de
   hidratar. Entre las 21 y las 00 el HTML llegaba con un día y el navegador
   calculaba otro → mismatch de hidratación en el `value` del campo de fecha y
   en los "N días" de antigüedad. **El test que lo cubría derivaba el esperado
   con la misma cuenta que la función, así que pasaba siempre** — incluso en
   UTC, donde la respuesta era el día equivocado. Reescrito con el día a mano.
2. **`quote-workspace.ts` — la antigüedad de precios se medía contra UTC**
   mientras la MO ya usaba la local. Después de las 21 el MISMO precio se leía
   un día más viejo en el ledger de materiales que en el de MO: uno lo cantaba
   vencido y el otro no, y eso levanta un bloqueo y una tarjeta en la cola.
3. **App RAVN sellaba los precios con la fecha de MAÑANA.** `mesa-merge.hoyIso`
   y el `hoy` de `cotizar.ts` eran UTC: un precio cerrado a la noche quedaba
   guardado con el día siguiente en `precio_eze.fecha` y en `precios_items` —
   dato equivocado que PERSISTE, y el vencimiento después mide contra una fecha
   que todavía no pasó. Medido en vivo a las 22:06: UTC decía `2026-08-17`,
   Buenos Aires `2026-08-16`.
4. **`taller/store.ts` — el rubro podía quedar SIN NADIE elegido y la consola
   mostrando un elegido.** Elegir son dos escrituras (desmarcar el rubro, marcar
   al nuevo). El segundo PATCH filtra por rubro Y por id: si el id no es de ese
   rubro no actualiza nada y PostgREST contesta 200 igual (el no-op silencioso
   que la ronda 1 dejó anotado). Peor: si ese segundo paso falla, el primero ya
   desmarcó, y el cliente revertía a `previous` — el elegido ANTERIOR, que
   tampoco es lo que hay en la base. La consola decía "va con Fran", el margen
   calculaba con Fran, y el pase no mandaba nada. Ahora el segundo PATCH pide la
   representación y 0 filas es error; y ante el fallo el cliente **relee la
   mesa** en vez de inventar un estado. 3 tests nuevos.
5. **El pase afirmaba "no entró" cuando no lo sabía.** Un timeout (10 s) o un
   corte de red después de que App RAVN escribió decía *"el pase no entró"*: es
   la regla anti-slop al revés, un estado que no se verificó. Podía mandar a Eze
   a corregir a mano algo que ya estaba pasado. Ahora dice que puede haber
   entrado, que verifique, y que reintentar es seguro (el pase es idempotente).
6. **El cartel "Pasado a App RAVN" no se caía al cambiar de proveedor.** El
   reseteo dependía de la CANTIDAD de rubros cerrados, así que cambiar el
   elegido de Fran a Pacheco dentro del mismo rubro dejaba el número igual, la
   mesa distinta y el cartel mintiendo. Ahora depende de una huella de lo que
   realmente viajaría (ids y precios de manuales, decisiones y elegidos).

### Lo que se revisó y quedó limpio

`app-ravn-read-adapter.ts`, `pase.ts` (traducción taller→extracto), la ruta
`/api/cotizaciones/[id]/pase` de App RAVN y `mesa-merge.ts`, `price-decision.ts`,
`rubros.ts`, `persistence.ts`, `types.ts` y las rutas de `/api/taller`.

**`retail.ts`, `contraste.ts` y `contraste-obra.ts` NO se auditaron y no hace
falta para el visor: el cotizador no los importa.** Sólo importa
`cotizador/{tipos, cotizar, vencimiento, rubros}`. Son código de App RAVN.

## 🔴 RONDA 3 HECHA (16/08 noche) — 3 arreglos más + la pregunta abierta, CERRADA

Eze salió a caminar y dejó dicho: *"seguí con todo vos mismo"* y *"sigo todas
las recomendaciones que vos me des, dale para adelante en todo"*.

1. **`live-terminals.tsx` — la terminal duplicaba TODA la salida al reconectar.**
   El stream SSE se corta seguido (el bridge se reinicia, la máquina duerme) y
   al volver el bridge replica la ola desde el principio. Las líneas viejas se
   apilaban sobre las que ya estaban: cada línea dos veces, y React chocando las
   keys porque la key ES la seq. Ahora se descarta lo que ya está (mismo agente
   + misma seq).
2. **`live-terminals.tsx` — el aviso de error quedaba clavado para siempre.**
   Sólo se limpiaba al lanzar una ola. Escribías un mensaje sin bridge, después
   levantabas el bridge, y el cartel seguía diciendo "sin bridge configurado no
   hay ola que lanzar" mientras la lámpara al lado ya decía "Bridge listo": dos
   cosas contradictorias en la misma cabecera. Ahora se limpia en cuanto el
   bridge contesta.
3. **La pregunta abierta, resuelta con mi criterio** (`price-decision.ts`): un
   ítem que Eze ya cerró con su número **ya no vuelve a la cola** porque el
   SISMAT de al lado esté vencido. La regla de la mesa es que su número pisa; una
   referencia vieja no lo mueve, así que la tarjeta era ruido en la única cola
   que tiene que llegar a cero para que se despliegue el tablero. **La referencia
   vencida se sigue mostrando con su nota** — no se esconde ningún número, deja
   de pedir una decisión que ya está tomada. Si el vencido ES el que está en el
   costo, sigue volviendo a la cola igual que antes. 3 tests nuevos que fijan las
   tres ramas (antes NINGÚN test cubría esto).

**Anotado y NO arreglado:** el tope de líneas (`MAX_LINES * 2`) es global para
los dos agentes, así que un Codex charlatán puede desalojar todas las líneas de
Fable. Y el token del bridge viaja en la query string del `EventSource` (no se
le pueden poner headers); es localhost, pero queda en logs e historial.

## 🔴 RONDA 4 HECHA (16/08 noche) — 6 bugs más. COMMITEADA: `7587657`

Barrida la columna de conversación, el splitter y `bridge/stream-format.ts`, que
era lo que quedaba. **Commit `7587657` pusheado a `origin/home-cards`. SIN
DEPLOY a producción** (el push a esa rama sólo genera Preview).

1. **El más gordo, y estaba tapando a los otros: con las credenciales en la URL
   el visor no podía escribir NADA.** Se entra por basic auth, y la forma cómoda
   —la que documenta este mismo handoff— es `http://RAVN:APORTODO@host/`. Con
   ese documento abierto, Chrome rebota todo `fetch` de ruta relativa antes de
   salir a la red (*"Request cannot be constructed from a URL that includes
   credentials"*), y acá TODO es ruta relativa: `/api/quotes`, `/api/taller…`,
   `/api/pase`. O sea: no se podía cambiar de cotización, la mesa no cargaba y
   el pase no salía. **Se veía viva y no guardaba nada.** Helper único
   `src/lib/api-url.ts`: resuelve contra `location.origin`, que nunca lleva las
   credenciales. Verificado en el navegador con esa URL: antes el cambio de
   cotización moría con el error en el cartel; ahora Garage → Glorietas → Lote 1
   → Baño render dan **200** y cambia el tablero. (Las 502 de Húsares ×3 y Lara
   son las viejas de formato, comportamiento conocido.) **Por el diálogo del
   navegador nunca falló** — por eso no se había visto.
2. **La hora de los mensajes salía de la zona de la MÁQUINA** (`TIME` en
   `control-center.tsx` era el único `Intl` sin zona; `formatObservedDate` ya la
   tenía nombrada desde antes). Medido: el formateador viejo en un servidor UTC
   escribe **"09:31 a. m."** donde el navegador en Buenos Aires pinta **"06:31"**
   — hora equivocada en el HTML y mismatch de hidratación en CADA `<time>` del
   hilo. Ahora es `formatObservedTime`, al lado de las fechas, con la zona
   nombrada. Probado con el dev server en `TZ=UTC` (como Vercel) y el navegador
   en AR: **mismas horas y cero warnings de hidratación**.
3. **El composer afirmaba "Ola despachada" sin saberlo** (tercera vez que
   aparece este patrón). Si el bridge rechazaba la ola, el cartel del composer
   decía que estaba corriendo y el de la ola decía el error — **y en mobile son
   solapas distintas**, así que el error quedaba en una pantalla que él no está
   mirando. Ahora el resultado real sube desde `LiveTerminals` por
   `onWaveOutcome`. Probado interceptando el POST en el navegador (**sin
   disparar una ola real**: el bridge de Eze estaba vivo): los dos carteles dicen
   lo mismo.
4. **Al cambiar de cotización quedaba pegada la anterior:** el borrador a medio
   escribir, los mensajes locales y el último aviso. Si le daba enviar, el texto
   entraba en la cotización que no era. Y el hilo no bajaba al último mensaje
   (sólo miraba los mensajes locales), así que abría mostrando lo más viejo.
5. **`stream-format.ts`, tres:** (a) `item.updated` repetía la línea del comando
   en cada actualización —y el filtro de la terminal no lo tapa porque cada
   evento trae su propia seq—; (b) un `exit_code` ausente se cantaba como
   **✓ éxito** cuando lo que hay es un no-sabemos; (c) un mensaje del asistente
   con bloques no reconocidos (o con `content` de texto pelado) **desaparecía
   entero**, contra la regla que declara la cabecera del propio módulo.
6. **Dos chicas:** las flechas del splitter redimensionaban **y** scrolleaban el
   tablero (faltaba `preventDefault`; medido: ahora +32 px de ancho con el scroll
   quieto en 0), y **"Resolver en la conversación" no hacía nada si ya había algo
   escrito** — ahora la pregunta se suma al final sin pisar el borrador.

Verificación: **175 tests cotizador** (eran 163) · **572 App RAVN** · typecheck
del cotizador y de la raíz · lint limpio · build **171 kB** (no engordó).

**Anotado y NO arreglado (sigue de la ronda 3):** el tope de líneas
(`MAX_LINES * 2`) es global para los dos agentes; el token del bridge viaja en la
query string del `EventSource`; `PostulanteForm` divide por `cantidad` sin guard;
el botón "Pasar" no se bloquea al primer clic. **Nuevo de esta ronda:** sin
`preview`, el botón "Resolver en la conversación" carga la pregunta en un
composer deshabilitado — es coherente con "la conversación todavía no escribe",
pero es un camino que no termina en ningún lado hasta que exista el contrato de
escritura.

### ⏭️ CÓMO RETOMAR (sesión nueva, en frío)

Base: **`7587657` en `home-cards`** (rondas 1 a 4, 19 bugs, todo commiteado y
pusheado). **SIN DEPLOY a producción** — el push a esta rama sólo genera Preview;
prod se dispara por API con `target: production`. En el working tree del repo hay
cambios de OTRA sesión (`.ravn/`, `AGENTS.md`, `CLAUDE.md`, `docs/`,
`daemon/memoria/`): **no son de esta caza, no commitearlos a ciegas.**

Cómo verificar, siempre las cuatro cosas antes de decir que algo está hecho:

```
cd apps/cotizador-ravn && npm test        # 175
cd /Users/ezeotero/Documents/ravn && npm test   # 572
cd apps/cotizador-ravn && npx tsc --noEmit && npm run lint && npm run build   # 171 kB
```

Navegador: `pkill -f "next dev --port 3010"; rm -rf .next; COTIZADOR_PREVIEW_ENABLED=1 npm run dev`
y entrar por `http://localhost:3010/?preview=1&k=$COTIZADOR_ACCESS_KEY`.
Para el camino REAL (sin preview) hace falta App RAVN local:
`npx next dev --port 3000` en `Documents/ravn` y entrar sin `?preview=1`.
**Dos cosas que valen para probar bien:** (a) `TZ=UTC npm run dev` reproduce el
servidor de Vercel y es lo único que destapa los bugs de zona horaria; (b) el
bridge de Eze suele estar vivo — interceptar el `POST /waves` con `page.route`
en vez de disparar una ola real, que despierta a Codex y Fable de verdad.

**Autorización vigente de Eze (16/08, ~22:10):** *"salgo a caminar 30 minutos,
seguí con todo vos mismo"* y *"sigo todas las recomendaciones que vos me des,
dale para adelante en todo"*. Buscar, arreglar, commitear y pushear a
`home-cards` entra ahí. **El deploy a producción no**: eso se le pide.

### ⏭️ QUÉ QUEDA DE LA CAZA

La caza de errores del visor **está terminada**: las cuatro rondas barrieron el
dominio (`labor`, `margin`, `quote-workspace`, `price-decision`), el taller y su
persistencia, el pase, el tablero, el ledger, la consola de margen, la
conversación, el splitter, las terminales y el bridge. **Lo que sigue es usarlo
cotizando de verdad con Eze**, que era el motivo del pedido.

Sin probar todavía contra la nube (no lo cubrió ninguna ronda):

- **El CRUD de postulantes desde la UI contra la base real**, y **el pase con un
  postulante elegido punta a punta**. Ojo: hasta este commit, hacer esa prueba
  entrando con las credenciales en la URL habría fallado por el bug 1 de la
  ronda 4 — ahora sí se puede.
- **Cotizaciones viejas (Húsares ×3 y Lara)**: dan **502** al elegirlas
  (`desglose.items` con la forma vieja). Confirmado de nuevo en esta ronda. Sigue
  siendo decisión de producto mostrarlas como "formato viejo, no legible" en el
  selector en vez de tirar el error.
- **Ninguna cotización real tiene mensajes de hilo** (las 13 dieron 0), así que
  la conversación con datos de verdad no se pudo mirar: lo del hilo se verificó
  contra el preview.

**Lo de la ronda 1 que sigue sin probarse contra la nube** (no lo cubrió esta
caza, sigue vigente del deploy):

- **El CRUD de postulantes desde la UI contra la nube.** Probado por curl contra
  la base y en el navegador contra el fixture (mesa local), pero **no** la
  combinación UI + cotización real + base.
- **El pase con un postulante elegido, punta a punta.** `construirPase` lo
  traduce y hay tests, pero no se disparó un pase real con MO elegida contra
  App RAVN.
- **Cotizaciones viejas (Húsares y compañía)**: `desglose.items` con la forma
  vieja (`{item, costo}`); el visor las rechaza al elegirlas. **Sigue siendo
  decisión de producto** mostrarlas como "formato viejo, no legible" en el
  selector en vez de romper. (Confirmado contra la base: Húsares, Lara y
  Glorietas Lote 1 tienen `desglose.totales` en null.)
- **Los rubros sin ítem de MO** no aparecen en el rubro de mano de obra (es
  correcto), pero conviene mirar una cotización real con muchos rubros para ver
  que el tablero no queda raro.

**OJO al levantar el visor:** si la página carga pero no responde a nada, es el
`.next` pisado (404 de `main-app.js`, React sin hidratar). `pkill -f "next dev
--port 3010"`, `rm -rf .next`, `npm run dev`. Credenciales locales `RAVN` /
`APORTODO`, y para Playwright entra por
`http://localhost:3010/?preview=1&k=$COTIZADOR_ACCESS_KEY`.

"⚠️ DIRECCIÓN NUEVA" sigue siendo el brief. Los pendientes viejos (contrato de
escritura de la conversación → adjuntos/audio/drag & drop, y sacar las rutas del
cotizador de App RAVN) siguen abiertos.

## Lo último: la MO como rubro propio (pedido 3, commit `78f3579`)

**El hallazgo que definió el diseño, medido contra la base y no supuesto:
ninguna cotización tiene más de UN ítem de mano de obra por rubro** (consulta
sobre `desglose.items` de todas las cotizaciones). Por eso el postulante elegido
cae justo sobre la maquinaria que ya existía —el precio cerrado del ítem— y el
contrato del pase no hubo que tocarlo.

Cómo quedó:

- **Tabla `cotizador_taller_postulantes_mo`** (proveedor, rubro, ítem,
  `precio_unit`, fecha, procedencia, `elegido`). Es dato del TALLER, va al lado
  de `cotizador_taller_items`. **Índice único parcial: un solo elegido por
  rubro, lo hace cumplir la base y no la UI** — dos marcados dejarían el costo
  del rubro ambiguo. Por eso `elegirPostulante` limpia el rubro ANTES de marcar.
- **`src/domain/labor.ts` (+ 20 tests).** Arma el rubro y sobre todo **la
  LECTURA**: cada postulante contra los otros y contra las dos investigaciones,
  en %, con la frase. Umbrales **del motor** (`UMBRAL_DIVERGENCIA_PCT` 25,
  `CRITICA` 100) y vencimiento de MO (30 días): **no hay criterio paralelo al de
  materiales**. Si el motor mueve un umbral, se mueve también la MO.
- **El elegido pisa el costo y recalcula al toque**, sin confirmación ni freno
  por desvío. La consola de margen suma `laborOverrideDelta` y dice cuánto le
  movió al piso y al techo.
- **Precio total o por unidad, a elección.** La cantidad ya se conoce, así que
  traducir uno al otro es una división. El formulario muestra los dos mientras
  tipea.
- **En el pase viaja el elegido, nunca los descartados** — como precio cerrado
  del ítem de MO, origen `eze`, y **con el NOMBRE del proveedor como fuente**.
  Eso hizo falta extender `PrecioCerrado` con un `fuente?` opcional (mesa-merge
  + ruta del pase de App RAVN): sin eso `precios_items` aprendía "Eze — mesa de
  revisión" y se perdía de quién era el precio, que es el dato que sirve dentro
  de tres meses. Si hay decisión previa sobre el mismo ítem, **manda el
  postulante**: marcarlo es un acto más explícito.
- **La MO salió del ledger de materiales y de la cola de decisiones.** El ledger
  ahora es "Materiales por rubro" y usa `materialsRange`; la cola filtra los
  ítems de MO. Dejarla en los dos lados era pedir la misma decisión dos veces.

**Bug encontrado en preview y arreglado (era anti-slop):** los rubros cuya MO ya
estaba cerrada por Eze (`precios.eze`) se leían como *"sin precio de mano de
obra"* mientras mostraban plata. Al principio había excluido `eze` de los
contendientes por prolijidad conceptual — pero ES el número que está en el costo.
Ahora entra como contendiente `propio` ("tu número · ya cerrado por vos"), no se
puede elegir ni sacar, y el rubro lo declara. **Regla que queda: no se descarta
ninguna fuente persistida; un precio guardado que no se muestra es un número que
desaparece.**

**Fecha local, no UTC (`hoyLocalIso`).** `toISOString()` a las 21 de Buenos
Aires ya es el día siguiente: un presupuesto cargado de noche aparecía fechado
mañana. La fecha de un presupuesto es dato de obra y se mide donde se trabaja.

Verificado: **150 tests cotizador** (eran 125) · **572 App RAVN** (eran 569) ·
lint y typecheck limpios · y probado en el navegador de punta a punta contra el
fixture (alta de dos presupuestos, elección, desvío recitado —"Cuadrilla Pacheco
está 15,4% arriba de lo que te cobra Fran"— y el margen recalculado solo).
Captura: `.impeccable/finish/mo-rubro-postulantes.png`.

**Lo único sin probar contra la base real: el CRUD de postulantes**, porque la
tabla todavía no existe (aprobación 1). El resto del taller sí está probado
contra Supabase de sesiones anteriores y este código sigue el mismo molde.

**Queda como idea, no como pendiente:** `mo_acuerdos` de App RAVN guarda lo que
de verdad se le terminó pagando a cada uno por obra. Sería la cuarta vara del
rubro —"lo que le pagaste a Fran la última vez"— pero son montos globales por
obra, sin precio unitario, así que no se puede comparar sin decidir cómo. **No
lo pidió Eze: no construir sin hablarlo.**

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

1. ~~**Las consolas del final siguen apretadas.**~~ **HECHO** (16/08 noche, sólo
   CSS). Medido, no estimado: a 1470 px de ancho los cinco instrumentos entraban
   a **137 px** cada uno y las etiquetas se partían en **27 y 40 px de alto**
   (dos y tres renglones), con el texto de apoyo en cuatro. Ahora la base es
   232 px: la fila se corta en **3 + 2** a cualquier ancho de tablero, los cinco
   rótulos quedan en **13 px (un renglón)**, cada instrumento mide 158 px de
   alto con padding 18/20 y el texto de apoyo subió a 0.7rem/1.55. La última
   fila sigue creciendo y no deja hueco. Cero datos nuevos: los mismos cinco
   instrumentos, con aire.
2. ~~**El panel de conversación se queda corto abajo.**~~ **HECHO** (16/08
   noche, sólo CSS). **La causa no era el composer: era el escenario.** El
   `.qz-chat__backdrop` iba con `inset: 0`, así que el monolito se centraba
   contra el panel ENTERO — composer incluido. Al achicarse la ventana la banda
   opaca del composer le subía encima y **le cortaba la base**: reproducido a
   1470×720, la pieza partida al medio, que es exactamente la captura que
   mandó Eze. Ahora el escenario es una región propia (`grid-area: 1 / 1 / 3 /
   2`, sólo cabecera + conversación) y la pieza no la puede pisar nadie.
   Verificado en el navegador: `monolitoTapadoPorComposer: false`,
   `monolitoDentroDeLaBanda: true`, y el composer termina **a 0 px** del pie del
   panel.
   - **Dos cosas para no volver a romper:** (a) las cuatro regiones del chat se
     colocan EXPLÍCITAMENTE — si sólo se coloca el escenario, el auto-placement
     saltea la celda ocupada y la cabecera se va a la fila del composer; (b) el
     piso de 300 px de legibilidad ahora se mide contra la banda con una
     `@container qz-stage (max-height: 356px)` que **esconde** el núcleo en vez
     de achicarlo (por debajo de ~603 px de ventana). Achicarlo sería mostrar
     una cuña, y con `display: none` el IntersectionObserver del núcleo ni abre
     el loop de render.

   Verificación de los dos: **125 tests verdes · lint limpio · typecheck
   limpio**. `npm run build` NO se corrió en local a propósito — pisa el `.next`
   del dev server y el cambio es CSS puro; el build de Vercel fue la
   verificación real. Capturas del antes y el después en `.impeccable/finish/`:
   `antes-720.png` (la pieza cortada) vs `despues-720.png`, más
   `antes-desktop.png` y `antes-laptop.png`.

   **Cerrados el 16/08 noche:** commit `c8da187` → `origin/home-cards` → deploy
   de producción `dpl_FTxv51oLLj41QNz6jZC7BUtbVJgu` sobre el sha `c8da187`.
   Recordatorio que no cambia: **el push solo NO deploya a prod** en este
   proyecto (`productionBranch` es `main`), el disparo va por
   `POST /v13/deployments` con `target: production` y
   `gitSource {repoId: 1200117728, ref: "home-cards"}`.
3. ~~**Mano de obra = RUBRO APARTE con postulantes.**~~ **HECHO** (16/08 noche,
   commit `78f3579`) — ver "Lo último" arriba. Falta sólo aplicar la migración y
   deployar. El alcance que se construyó es el que sigue, tal como lo dictó Eze:
   Textual: *"yo puedo poner mano de obra 1, mano de obra 2,
   mano de obra 3, porque yo puedo hacer una investigación entre 3 proveedores y
   ver cuál es el que me cobra más o menos… como que haya varios"*. Y: *"la que
   vale es la que yo voy a poner como la que me cobran a mí"*.

   **La forma:** la MO sale de ser un ítem más del rubro y pasa a ser un **rubro
   propio**, con una lista ABIERTA de contendientes por rubro de obra:

   - `postulante 1`, `postulante 2`, `postulante 3`… — presupuestos reales de
     proveedores, **con nombre** (Fran, el que sea) y su precio. Los carga él.
     No son tres fijos: son los que haya.
   - `investigación SISMAT` — la del tarifario.
   - `investigación internet` — la que encuentra la ola.

   **Quién manda:** el que él marca como "el que me cobran a mí" es el que entra
   al costo y recalcula margen. SISMAT e internet **nunca** entran al costo: son
   la vara contra la que se mide. (Queda por confirmar si el elegido calibra
   `precios_items` como hoy hace `precio_eze` — por la regla del pase, el precio
   tipeado por él SÍ calibra.)

   **El desvío es el producto, y tiene que hablar.** Textual: *"recitás el
   análisis… fijate que SISMAT está un 10% abajo de lo que te está cobrando
   Fran"*. O sea: no una tabla de números, una LECTURA — cada postulante contra
   los otros y contra las dos investigaciones, en %, con la frase que lo dice.
   Es el mismo criterio que ya corre `price-decision.ts` para materiales
   (umbrales del motor: 25% / 100%), aplicado a MO. **Reusar ese módulo, no
   escribir un criterio paralelo.**

   **Qué falta de datos:** hoy el contrato trae `precios.{sismat,internet}` por
   ítem y `desglose.tiempo` con jornales, pero **no existe la tabla de
   postulantes de MO** (proveedor, rubro, precio, fecha, de dónde salió). Va en
   el esquema propio del cotizador, al lado de `cotizador_taller_items` — es
   dato del TALLER, no de la oficina. Al pasar el expediente, lo que viaja a App
   RAVN es el elegido, no los descartados.

   **CONTESTADO por Eze (16/08 noche) — no queda nada abierto:** el postulante
   elegido **pisa el costo y recalcula el precio AL TOQUE, sin confirmación ni
   freno por desvío**. Textual: *"pisa el costo y recalcula el precio al toque,
   yo de última lo miro y sé cómo manejarlo y ver de buscar otras opciones"*.
   O sea: **nada de modal de confirmación arriba del 25%** — el desvío se
   MUESTRA (es el producto), pero no interrumpe. El criterio de Eze es que él
   lee el desvío y decide si sale a buscar otro postulante; la herramienta no
   lo tutela. Esto vale también contra la tentación de meter un guard: sería
   fricción en el único lugar donde él ya sabe qué está haciendo.

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

**EL BASIC AUTH SE FUE (17/08, commit `fcf35d5`, prod
`dpl_GsQjJ1LjourawXs5J1uj7CeUhYRq`).** Eze, textual, viendo el diálogo del
navegador: *"basta de esto!! sacáselo!!!"*. Pedía usuario y contraseña en cada
dispositivo y cada sesión — fricción pura en la única herramienta que él tiene
que abrir con ganas. **`RAVN`/`APORTODO` ya no sirven** (dan 401).

Ahora se entra **por enlace**: `https://ravn-cotizador.vercel.app/?k=<llave>`.
La llave se canjea por una cookie firmada de un año (`qz_acceso`) y **se borra de
la URL** con un 307. Sin `WWW-Authenticate` no hay diálogo posible. La cookie es
un HMAC-SHA256 derivado de la llave, no la llave: leerla no reconstruye el
enlace, y **rotar `COTIZADOR_ACCESS_KEY` invalida todas las cookies vivas de
una** — esa es la forma de "cerrarle la puerta" a un dispositivo perdido.

`COTIZADOR_ACCESS_KEY` está en Vercel (`ravn-cotizador`, Production y Preview,
marcada `sensitive` → la API la devuelve vacía) y en
`Documents/ravn/apps/cotizador-ravn/.env.local`, que **es el único lugar legible**.
De ahí sale el enlace para un dispositivo nuevo. `COTIZADOR_BASIC_USER` y
`COTIZADOR_BASIC_PASSWORD` quedaron huérfanas: ningún código las lee.

**Dónde vive y qué NO se puede recuperar:** las dos vars están marcadas
`sensitive` en Vercel, así que la API las devuelve vacías — el único lugar
legible es el `.env.local` de `Documents/ravn/apps/cotizador-ravn/`. **OJO con
el otro `.env.local`:** el del worktree viejo de Codex
(`~/.codex/worktrees/ee5a/ravn/`) tiene `visual-only` y NO sirve; una nota vieja
de este handoff mandaba a buscar ahí y hacía perder tiempo.

**La puerta está por una razón, no por trámite:** la URL es pública y el visor
muestra costos reales y márgenes. Alternativa ofrecida y no tomada (queda para
cuando moleste de nuevo): Deployment Protection de Vercel — entra el que está
logueado en su cuenta, sin password que perder.

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
