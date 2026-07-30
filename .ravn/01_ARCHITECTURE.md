# Arquitectura real — App RAVN

> **Naturaleza:** HECHOS
> **Última verificación:** 2026-07-29 (borra la command bar del cockpit y `/api/trabajos`; `daemon/puente-cotizador/` 2026-07-25; resto 2026-07-23)
> **Fuente:** src/, daemon/, scripts/, supabase/, ~/Documents/ravn-bots/

Todo lo afirmado acá sale de archivos leídos en esa fecha. Cada bloque cita su fuente. Lo no verificable está marcado "a verificar".

---

## Componentes

### 1. App Next.js (este repo, `~/Documents/ravn`)

Next.js 15.5 + React 19 + Tailwind 4 + Supabase (`@supabase/ssr` + `supabase-js`), tests con Vitest (`package.json`). Config mínima en `next.config.ts` (solo `outputFileTracingRoot`, `removeConsole` en prod, sin headers ni rewrites). Deploy en Vercel, proyecto **`ravn-app-one`** (a verificar en Vercel: el nombre del proyecto no aparece en el repo; no confundir con el decoy `ravn-app` — fuente: memoria del usuario, no código).

Áreas/rutas reales (todas verificadas con `find src/app -name page.tsx`):

| Ruta | Propósito (según código de la página / API asociada) |
|---|---|
| `/` (`src/app/page.tsx`) | Home / cockpit (tablero central; componentes en `src/components/cockpit/`). La `command-bar.tsx` se borró el 29/07: encolaba en `trabajos_cola` y ningún daemon la levantaba. |
| `/obras`, `/obras/[id]` | Obras y su detalle; subrutas `[id]/gastos`, `[id]/mano-obra`, `[id]/plan` (plan de compra). |
| `/cotizar` | Mesa del cotizador (APIs `api/cotizar/recetas`, `takeoff`, `precios/refresh`). |
| `/cotizaciones`, `/cotizaciones/[id]/revision`, `/cotizaciones/[id]/documento` | Galería de cotizaciones, mesa de revisión (con panel de conversación vía `trabajos_cola`) y documento emitible. |
| `/dinero` | Módulo Dinero sobre el ledger (`src/lib/dinero*.ts`, API `api/dinero` + `api/dinero/espejo`). |
| `/mano-obra`, `/mano-obra/informe` | Acuerdos y pagos de mano de obra (`src/lib/mano-obra.ts`) + informe imprimible (`src/components/informe-mo-print.tsx`). |
| `/dia` | Tablero "Tu Día" (`src/lib/tu-dia.ts`). |
| `/maestro-precios` | Maestro de precios (migraciones `20260419140000_maestro_precios.sql`, `*_maestro_precios_sismat.sql`). |
| `/cashflow` + `obra/[obra_id]`, `obra/[obra_id]/cierre`, `planificar/[presupuesto_id]` | Cashflow por obra, cierre y planificación desde presupuesto (`src/lib/cashflow-*.ts`). |
| `/finanzas` | Finanzas personales (`src/lib/finanzas-personal.ts`, API `api/finanzas/*`). |
| `/gastos/nuevo` | Alta de gastos. |
| `/empresa` | Vista empresa (gastos empresa: `src/lib/gastos-empresa.ts`). |
| `/grafo` | Visualización del grafo del cerebro (`src/lib/grafo.ts`, `grafo-dibujo.ts`, API `api/grafo`). |
| `/adn` | Clasificación ADN (API `api/adn/sin-clasificar`). |
| `/archivados` | Bandeja de archivados + resolver (`api/archivados/resolver`). |
| `/actividad` | Feed de eventos (tabla `eventos`). |
| `/pendientes` | Pendientes de cuenta (API `api/pendientes-cuenta`). |
| `/proveedores` | Proveedores (`src/lib/proveedores-whatsapp.ts`, API `api/proveedores`). |
| `/catalogo` | Catálogo de recetas/ítems (modales `crear-item-catalogo-modal.tsx`, `nuevo-receta-modal.tsx`). |
| `/remito/[id]` | Remito vivo por presupuesto. |
| `/historial`, `/landing`, `/login` | Historial, landing y login (auth Supabase vía `src/middleware.ts`). |

Grupos de endpoints API reales (`find src/app/api -name route.ts`): `adn`, `archivados`, `auto-login`, `cashflow` (extract-comprobante, marcar-item, obra/[obra_id] + cierre/cobranza-cerrar/finalizar, planificar-preview/confirmar, registrar-movimiento), `cotizacion-dolar`, `cotizaciones` (CRUD + aprobar/rechazar/emitir/estado/desglose/portada/crops/archivos/conversacion), `cotizar` (recetas, takeoff, precios/refresh), `cuentas` (+ reserva-obra), `dinero` (+ espejo), `dolar`, `finanzas` (config, fijos, presupuesto-hoy), `gastos-empresa`, `grafo`, `negocio` (config, retiro), `obra-archivos`, `obras` (+ [id]/diagnostico, finalizar, plan/importar, portada), `papelera/[id]/restaurar`, `pendientes-cuenta`, `presupuestos/[id]`, `proveedores`, `proyectos`, `referencias`, `trabajos`.

### 2. Bot ravn-bots (Railway, `~/Documents/ravn-bots`)

Node + Express, entrada única `src/index.js` ("BOT WHATSAPP v6.2"), deps: `@anthropic-ai/sdk`, `@supabase/supabase-js`, `axios`, `express` (`package.json`). Corre en Railway (`https://ravn-bots-production.up.railway.app`, log de arranque en `index.js`). Endpoints HTTP: `/webhook` (GET verify + POST WhatsApp Cloud API), `/health`, `/log`, `/send`, `/send-template`, `/` (status).

Módulos reales (`src/`): `portero.js` (rutea TODO mensaje del owner; regla: error ⇒ evento archivado + aviso, transitorio ⇒ estado `reintentar`), `advisorService.js` (asesor con SDK Anthropic), `supabaseService.js` (toda la charla con Supabase, incl. `macViva()` leyendo `sistema_estado.ultimo_latido` y CRUD de `trabajos_cola`), `githubVault.js` (vault vía GitHub Contents API, repo `ravnconstrucciones/boveda` — PUT directo, cada PUT es un commit, sin git clone), `visionService.js`, `transcribeService.js` (audios), `videoService.js`, `adnService.js`, `preguntasService.js`, `dinero.js`/`dineroFlujo.js`/`cuentas.js`/`saldos.js`/`manoObra.js` (flujo de plata por chat), `reintento.js`, `providers.json` + `telefonos.js` (proveedores). Tests con `node --test` en `test/`. Hay además un `dashboard/` Vite de monitoreo.

**"Jobs" del bot:** el bot NO tiene cron scheduler externo; tiene un `cronTick()` interno con `setInterval` cada 30 min (`index.js:809-839`) que hace: `checkTareasVencidas`, `preguntas.barrerVencidas()`, `enviarPreguntaCerebro()`, `enviarSinapsisCerebro()` (manda propuestas UNIR/DESCARTAR por WhatsApp) y `reprocesarEventosReintentar()`. Los jobs pesados NO viven en el bot: viven en el daemon de la Mac (abajo).

### 3. Daemon de la Mac (`daemon/` en este repo)

Runner Python `daemon/jobs/runner.py` disparado por launchd **`com.ravn.jobs`** cada 30 min (`StartInterval 1800`, `daemon/launchd/com.ravn.jobs.plist`), vía wrapper `run-jobs.sh` copiado a `~/.ravn-jobs/` por `daemon/install.sh`. Catch-up por períodos (día/semana ISO/mes): si la Mac estuvo apagada, el primer tick corre todo lo vencido; tope 3 errores/día; lock viejo a 120 min (docstring de `runner.py`).

Jobs reales (lista `JOBS` de `runner.py` + docstring de cada `job_*.py`):

- `job_calendario` — diario ~7h: espejo Calendar de macOS → tabla `calendario_eventos`, sin IA (osascript).
- `job_resumen` — diario ~7h: resumen mañanero determinístico por WhatsApp (lee Supabase, envía al OWNER_PHONE).
- `job_noticias` — diario ~7h: 3 noticias por frente (economía/construcción/inmobiliario) con Claude headless + WebSearch, para Tu Día.
- `job_dolar` — diario ~8h: dólar sin IA (Bluelytics → fallback DolarAPI) → `dolar.json` del vault + push.
- `job_precios` — diario ~8h: **el scraper de precios retail**: corre `npx tsx scripts/cotizador/refrescar-precios.ts`, que junta materiales de todas las recetas y busca precio vivo por cadena (lógica en `src/lib/cotizador/retail.ts`: VTEX Easy/Prestigio/Colorshop/Blaisten, Sodimac por `__NEXT_DATA__`, Tiendanube/Rojas por dataLayer; mediana anti-outliers; ruteo material→cadena por rubro) y upsertea `precios_items` con timestamp. Ley 1: sin dato no hay fila.
- `job_sismat` — mensual (día ≥2): sync base SISMAT al vault.
- `job_maestro` — mensual: vincula ítems del maestro de precios con su tarea SISMAT (usa `maestro_aliases.json`).
- `job_top30` — semanal: refresca precios de `materiales-construccion.md` con Claude headless + WebSearch.
- `job_salud` — semanal, Python puro sin IA: verifica signup Supabase cerrado + webs vivas.
- `job_auditoria` — dominical: itera la auditoría integral semanal.
- `job_inbox` — diario ~2h: "procesá mi inbox" con Claude Code headless + patrones ADN (rutea Inbox del vault, Orientación).
- `job_foda` — dominical, ANTES de cerebro: FODA de negocio; su resumen es la pregunta del domingo.
- `job_cerebro` — diario, DESPUÉS de inbox: pull del vault, graphify determinístico, diagnóstico + pregunta del día.
- `job_sinapsis` — diario, después de cerebro: propone conexiones entre células huérfanas del grafo (el bot las manda por WhatsApp para UNIR/DESCARTAR).
- `job_datos` — cada tick: referencias tipo "dato" → vault, sin IA.

Auxiliares: `jobslib.py` (auth Supabase, vencimientos, `snapshot_negocio` = estado real del negocio para el cerebro), `snapshot.py`, `chequear_evento.py`, tests en `daemon/jobs/tests/`.

Segundo launchd existente en la Mac (no en este repo): **`com.ravn.homereno-goteo`** (`~/Library/LaunchAgents/`), Python cada 3h que corre `_goteo.py` del vault HomeRenoVision (goteo de transcripciones al cerebro de construcción).

**A verificar:** el consumidor de `trabajos_cola` que late `sistema_estado.ultimo_latido` "~45s" (citado en `ravn-bots/src/supabaseService.js:356` y `src/lib/terminal-hilo.ts`) no está ni en `daemon/` ni en `ravn-bots/` — es un proceso Claude Code de la Mac cuyo código no encontré en estos dos repos.

### 3.1. Puente-cotizador (`daemon/puente-cotizador/` en este repo, nuevo 2026-07-25)

Motor local de la **mesa de cotización conversacional** (spec 2026-07-25, ver ADR `0005`). Componente propio, distinto de `com.ravn.jobs`: no corre-y-muere cada 30 min, queda escuchando — launchd **`com.ravn.puente-cotizador`** con `KeepAlive` (`daemon/launchd/com.ravn.puente-cotizador.plist`), instalado por `daemon/puente-cotizador/install.sh`, wrapper `run-puente.sh`. Estado local en `~/.ravn-puente/` (`env`, `sesiones.json` — session id de Claude por cotización para `--resume` —, `procesados.json` para dedup, `logs/`).

Archivos: `puente.ts` (loop principal: Realtime sobre `cotizacion_mensajes`, serialización por cotización, dedup crash-safe con guard en memoria + persistencia post-turno + fallback por `meta->>respuesta_a`, latido a `puente_latidos` cada 30 s, barrido cada 60 s para mensajes que llegaron con el proceso caído), `motor-fable.ts` (Claude Code local, sesión `--resume` por cotización), `motor-codex.ts` (Codex para búsqueda de precios, flag global `--search` **antes** de `exec`; corre en paralelo a Fable y se consolida), `prompt-sistema.md` (prompt del rol Fable en la mesa). Parseo tolerante de directivas JSON de Fable en `src/lib/puente/protocolo.ts` (compartido con la app, no vive en `daemon/`).

Habla con la app **como un agente**, no como el bot ni como el daemon de jobs: usa el bypass `x-ravn-agente` de `src/middleware.ts` (ver 04_APIS.md) para pegarle a `/api/cotizaciones/[id]/mensajes`, `/documento-borrador` y `/archivos/[archivoId]` sin sesión de usuario. Motores locales por suscripción (Fable/Codex ya pagos), no API paga por token — decisión completa en `.ravn/decisions/0005-mesa-cotizacion-conversacional.md`.

### 4. Supabase (base única)

Un solo proyecto Supabase para todo: 65 migraciones en `supabase/migrations/` + `config.toml`. Tablas/dominios visibles en migraciones: `presupuestos*` (+gastos, rentabilidad_inputs, propuesta), `cashflow_*`, `obras` (+`obra_plan_items`, `obra_archivos` vía storage), `maestro_precios` (+SISMAT), `inmobiliario`, `gastos_personales`/`finanzas_personales`, `tareas`, `eventos`, `trabajos_cola`, `recetas`/`cotizaciones`/`cotizador_lecciones`/`referencias`, `calendario_eventos`, `sistema_estado`, `dinero_movimientos_plata` + `dinero_financiamientos` + RPC `asentar`, `precios_items`, `mo_acuerdos`, `papelera_registros`, RLS por dominio (`*_rls.sql`, `base_seguridad.sql`) y Realtime (`realtime_centro_mando.sql`, `obra_plan_items_realtime_delete.sql`).

### 5. Deploy

- App → Vercel (framework Next.js; el repo no contiene config de Vercel — nombre de proyecto `ravn-app-one` a verificar en el dashboard).
- Bot → Railway (doc `ravn-bots/RAILWAY-SETUP.md`; URL de producción en `index.js`).
- Daemon → launchd local en la Mac (`daemon/install.sh`).
- Puente-cotizador → launchd local en la Mac, propio (`daemon/puente-cotizador/install.sh`, `com.ravn.puente-cotizador`, `KeepAlive`).

---

## Comunicación

- **App ↔ Supabase**: única persistencia. Server components y API routes usan `src/lib/supabase/server.ts` (incl. `createSupabaseAdminClient`), client components `src/lib/supabase/client.ts`; sesión/auth en `src/middleware.ts` con `@supabase/ssr` (cookies). Realtime para tablas vivas (`src/hooks/use-realtime-table.ts`).
- **App → vault (GitHub)**: solo LECTURA server-side del repo `boveda` vía GitHub Contents API con revalidate 5 min (`src/lib/vault.ts`; prohibido importarlo desde client components).
- **Bot ↔ WhatsApp**: WhatsApp Cloud API (webhook entrante en `/webhook`, salida vía Graph API con `PHONE_NUMBER_ID` + `ACCESS_TOKEN`, `index.js`).
- **Bot ↔ Supabase**: `supabaseService.js` — lee/escribe gastos, cuentas, tareas, preguntas, sinapsis, eventos y `trabajos_cola`; chequea `sistema_estado.ultimo_latido` para saber si la Mac está viva antes de prometer proceso inmediato (`portero.js` → `ackCola`).
- **Bot → vault (GitHub)**: ESCRITURA vía GitHub Contents API, un commit por PUT (`githubVault.js`) — así el bot escribe el Inbox del vault sin tener la Mac prendida.
- **Bot ↔ Mac (trabajo pesado)**: asíncrono por Supabase. El portero encola en `trabajos_cola` (estado `pendiente`); la Mac procesa y marca `completado` con `resultado.texto`. No hay conexión directa bot↔Mac ni bot↔app.
  - **Verificado 29/07/2026:** el único daemon vivo que consume la cola es `com.ravn.puente-cotizador` (mesa de cotización). `com.ravn.jobs` (`~/.ravn-jobs/run-jobs.sh`) NO menciona `trabajos_cola`. Por eso la command bar del cockpit y `api/trabajos/route.ts` se borraron (última orden completada 17/06, 12 pendientes colgadas del 01/07), junto con `src/lib/terminal-hilo.ts`, que ya no tenía ningún consumidor. **Cuidado:** `/api/obras/[id]/diagnostico` sigue encolando tipo `orden` ahí — depende de un consumidor que hoy no está verificado.
- **Daemon → Supabase**: REST con auth propia (`jobslib.supabase_auth`) — escribe `calendario_eventos`, `precios_items`, sinapsis, estado de sistema; lee snapshot del negocio.
- **Daemon → vault**: git pull/push local del vault (Obsidian/iCloud) — p. ej. `job_dolar` "pushea el vault".
- **Daemon → WhatsApp**: `job_resumen` envía al OWNER_PHONE (vía el bot/Cloud API según config del job).
- **launchd**: `com.ravn.jobs` cada 30 min dispara el runner; `com.ravn.homereno-goteo` cada 3h el goteo HomeRenoVision. Nada corre constante en la Mac — **excepción deliberada**: `com.ravn.puente-cotizador` (2026-07-25) queda escuchando con `KeepAlive`, porque la mesa conversacional necesita respuesta en segundos, no en el próximo tick de 30 min.
- **Puente-cotizador ↔ App**: Realtime sobre `cotizacion_mensajes` (escucha) + REST con el bypass `x-ravn-agente` (escribe `/mensajes`, `/documento-borrador`, `/archivos/[archivoId]`) + latido propio en `puente_latidos` (no comparte `sistema_estado` con el daemon de jobs).

---

## Responsabilidades

- **App Next.js**: toda la UI y los write-points de datos (obras, cotizaciones, dinero, cashflow, MO, finanzas). NO corre jobs programados, NO scrapea precios, NO escribe al vault (solo lee).
- **Bot ravn-bots**: interfaz WhatsApp 24/7 — captura (audios, fotos, gastos de bolsillo), asesor liviano, preguntas del cerebro, mensajes a proveedores. NO hace trabajo pesado (lo encola en `trabajos_cola`), NO tiene los jobs del cerebro (solo los reparte por chat).
- **Daemon (com.ravn.jobs)**: todos los jobs programados — precios/scraping retail, dólar, SISMAT, cerebro/grafo/FODA/sinapsis, inbox, resumen, salud, auditoría. NO sirve UI, NO atiende requests: corre cada 30 min y muere (regla "nada constante en la Mac", batería).
- **Puente-cotizador (com.ravn.puente-cotizador)**: el ÚNICO proceso que queda vivo permanentemente en la Mac — motor conversacional de la mesa de cotización (Fable + Codex). NO reemplaza al cotizador maestro ni decide margen/emisión (eso sigue siendo de Eze, ADR 0003); NO es fuente de verdad — si está caído, la mesa sigue operable a mano y el barrido resuelve lo perdido al reconectar.
- **Supabase**: base única de datos + auth + storage + Realtime. Toda comunicación asíncrona entre componentes pasa por acá (cola, estado, latido).
- **Vault (repo GitHub `boveda` / Obsidian)**: conocimiento y cerebro, NO datos operativos — los datos operativos viven en Supabase.
- **Vercel / Railway / launchd**: hosting de app, bot y jobs respectivamente.

---

## Convenciones

- **App Router de Next.js**: páginas = `src/app/<ruta>/page.tsx` (+ `layout.tsx`, `template.tsx`, `loading.tsx`, `global-error.tsx` en la raíz); endpoints = `src/app/api/**/route.ts`. Rutas dinámicas con `[id]` / `[obra_id]` / `[presupuesto_id]`.
- **Lógica en `src/lib/`**, no en páginas: módulos por dominio (`dinero*`, `cashflow-*`, `mano-obra`, `salud-negocio`, `tu-dia`) y subcarpetas para dominios grandes (`cotizador/`, `plan-compra/`, `inmobiliario/`, `supabase/`). Los tests viven al lado (`*.test.ts`) o en `__tests__/`, corren con Vitest.
- **Componentes en `src/components/`** (cockpit/, shell/, ui/ + modales y prints sueltos); hooks en `src/hooks/`; tipos compartidos en `src/types/` (`ravn.ts`, `centro-mando.ts`).
- **Scripts operativos en `scripts/`** (dev.sh, cotizador/, perf) — `scripts/cotizador/*` reusa la lógica de `src/lib/cotizador/` (la lógica VTEX vive en `retail.ts`, "acá NO se duplica", docstring de `job_precios.py`).
- **Migraciones SQL versionadas** en `supabase/migrations/` con timestamp; RLS explícito por dominio.
- **Ledger de dinero = fuente de verdad** (regla dura en `CLAUDE.md` del repo, 18/07/2026): toda plata tocada por SQL directo debe asentar patas en `movimientos_plata` en la misma operación; el espejo (`sincronizarEspejo`, `src/lib/dinero-espejo.ts`) corre SOLO en los write-points de la app; verificación: la vista `dinero_huerfanos` debe quedar vacía. Tablas con plata: `presupuestos_gastos`, `gastos_empresa`, `gastos_personales`, `retiros_socio`, `transferencias`, `cashflow_items`.
- **Español en todo el código** (nombres de archivos, funciones, comentarios y tablas), formato A4 negro para prints, sin Excel.
