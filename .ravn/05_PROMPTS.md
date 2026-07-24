# 05 — Inventario de prompts de IA del sistema RAVN

> **Naturaleza:** HECHOS + INTENCIÓN
> **Última verificación:** 2026-07-23
> **Fuente:** ravn-bots/, daemon/, scripts/, src/, ~/.claude/skills/

Este doc es un ÍNDICE: dice qué prompt existe, dónde vive y para qué está. El texto del prompt vive en el código fuente — acá no se copia (la copia se desactualiza).

---

## 1. Bot asesor de WhatsApp (ravn-bots, Railway)

Tres prompts Anthropic (SDK `@anthropic-ai/sdk`, todos `claude-sonnet-5`) + tres prompts Gemini (REST `generativelanguage`, modelo `GEMINI_MODEL` o `gemini-2.5-flash`). Los tres de Anthropic viven en el mismo archivo.

### 1.1 SYSTEM del clasificador (el prompt madre del asesor)
- **Dónde:** `/Users/ezeotero/Documents/ravn-bots/src/advisorService.js` — `const SYSTEM` líneas ~66–278; se usa en `clasificar()` (~L672–717, llamada `messages.create` L698).
- **Modelo:** `claude-sonnet-5`, `max_tokens: 4000` (era Haiku/700 — se saturaba y truncaba, comentado ahí mismo).
- **Variables:** fecha/hora AR inyectadas al system; `forzarTipo` (cuando Eze ya eligió tipo); contexto del vault (`buildContext()`, con recorte Dieta/Rutina si el tema no es cuerpo); historial persistido de 10 eventos como `messages`.
- **Objetivo:** clasificar cualquier mensaje de Eze (texto o audio transcripto) en ~17 tipos: tarea, gasto, consulta, cotización, redactar, pesado, estado_obra, presupuesto_personal, nota, filosofía, estética, avance, borrar, proveedor, buscar proveedor, transferencia, etc.
- **Salida:** SOLO JSON — objeto único o array si el mensaje trae varias cosas. Fallback de código si no parsea ("No te entendí…").

### 1.2 Discriminador de respuesta libre a pregunta pendiente
- **Dónde:** mismo archivo, `discriminarRespuestaPregunta()` ~L725–754 (system inline L728–735).
- **Modelo:** `claude-sonnet-5`, `max_tokens: 60`. Sin vault ni historial (barata y enfocada).
- **Variables:** texto de la pregunta pendiente + opciones numeradas + respuesta libre de Eze.
- **Objetivo:** decidir si un texto libre contesta una pregunta con opciones del bot.
- **Salida:** JSON `{"veredicto":"opcion","n":N} | {"veredicto":"instruccion"} | {"veredicto":"suelto"}`. Ante error → `suelto` (el mensaje nunca se pierde).

### 1.3 Parseador de desglose de mano de obra
- **Dónde:** mismo archivo, `parsearDesgloseMO()` ~L761–794 (system inline L769–776).
- **Modelo:** `claude-sonnet-5`, `max_tokens: 300`.
- **Variables:** lista numerada de arreglos MO candidatos (persona, trabajo, obra, saldo) + respuesta libre de Eze; total del gasto si se conoce.
- **Objetivo:** mapear "800 lucas de Pueyrredón y el resto de Correa" → partes `{n, monto}`. Regla de montos LITERALES en el prompt; la suma la valida el CÓDIGO después (`dineroFlujo.aplicarDesgloseMO`) — si no cierra, se re-pregunta.
- **Salida:** JSON `{"partes":[{"n":1,"monto":800000}]}` o `{"no_es_desglose":true}`.

### 1.4 Transcripción de audios (Gemini)
- **Dónde:** `/Users/ezeotero/Documents/ravn-bots/src/transcribeService.js` — prompt inline ~L37, en `transcribeAudio()`.
- **Modelo:** Gemini (`gemini-2.5-flash` default), `temperature: 0`, audio inline base64.
- **Variables:** el audio de WhatsApp; sin más contexto.
- **Objetivo:** audio → español rioplatense tal cual.
- **Salida:** texto plano, solo la transcripción.

### 1.5 Visión de imágenes (Gemini)
- **Dónde:** `/Users/ezeotero/Documents/ravn-bots/src/visionService.js` — `const PROMPT_VISION` L10–46; llamada ~L96–107.
- **Modelo:** Gemini (`gemini-2.5-flash` default), 1 reintento con backoff 2s.
- **Variables:** la imagen + caption del usuario (el caption "manda sobre lo que parece la imagen").
- **Objetivo:** clasificar toda foto que entra por WhatsApp en estetica / filosofia / factura / obra / contacto / otra, y si es factura o contacto, LEERLA (total, comercio, moneda / teléfonos, rubro, zona).
- **Salida:** JSON con clase, descripcion, etiquetas, texto_extraido, bloque factura y bloque contacto.

### 1.6 Análisis de videos de YouTube (Gemini)
- **Dónde:** `/Users/ezeotero/Documents/ravn-bots/src/videoService.js` — `const PROMPT` L44+; llamada en `analizar()` ~L59–77 con `file_uri`.
- **Modelo:** Gemini (`gemini-2.5-flash` default), `temperature: 0.2`, `responseMimeType: application/json`, timeout 180s.
- **Variables:** la URL del video (Gemini lo mira directo, sin descargar).
- **Objetivo:** extraer lo valioso de un video que Eze manda por WhatsApp para el segundo cerebro.
- **Salida:** JSON `{titulo, ideas[], frases[], resumen}` → nota en el vault (/adn).

---

## 2. Jobs del cerebro (daemon Mac)

Todos corren **Claude Code headless**: `correr_claude(prompt, timeout, modelo)` en `/Users/ezeotero/Documents/ravn/daemon/jobs/jobslib.py` L429–439 — `claude -p --model <sonnet|opus> --output-format json --dangerously-skip-permissions`. El "prompt" es a la vez system + tarea, y el agente tiene tools (lee el vault, WebSearch, edita archivos).

### 2.1 job_inbox — Orientación diaria
- **Dónde:** `/Users/ezeotero/Documents/ravn/daemon/jobs/job_inbox.py` — `armar_prompt()` L41; llamada L99. Sonnet, timeout 1800s.
- **Variables:** fecha, referencias ADN de la semana (desde Supabase), patrones detectados por código, `snapshot_negocio` (estado real App RAVN).
- **Objetivo:** ejecutar "procesá mi inbox" del CLAUDE.md del vault y escribir `Orientación/{fecha}.md`. Regla de precedencia dura: App RAVN gana sobre el vault; anti-zombie; nunca follow-up de venta de obra firmada.
- **Salida:** escribe la Orientación en el vault + última línea = resumen de 1 línea.

### 2.2 job_auditoria — auditoría semanal (domingo)
- **Dónde:** `/Users/ezeotero/Documents/ravn/daemon/jobs/job_auditoria.py` — `componer_prompt()` L33; llamada L71. Sonnet (default), timeout 1200s.
- **Variables:** fecha, snapshot del negocio, nombre + texto de la auditoría anterior (máx 12.000 chars).
- **Objetivo:** auditoría que ITERA sobre la anterior: balance, ✅/⚠️/❌ de las acciones pasadas, hallazgos nuevos, máx 3 acciones. Incluye regla anti-zombie y "CORRECCIONES DE EZE pisan hallazgos".
- **Salida:** SOLO el markdown del archivo, empezando exacto con `# Auditoría semanal — {fecha}` → `~/Obsidian/RAVN/Auditorias/`.

### 2.3 job_foda — FODA vivo (domingo, Opus)
- **Dónde:** `/Users/ezeotero/Documents/ravn/daemon/jobs/job_foda.py` — `armar_prompt()` L34; llamada L65 con `modelo="opus"`, timeout 1200s.
- **Variables:** fecha, snapshot del negocio, ruta del diagnóstico del grafo (ADN) y de la última Orientación.
- **Objetivo:** cruzar grafo + estado real + Orientación y pisar `Ravn/FODA-vivo.md` entero (F/O/D/A + "la movida de la semana"). El cuello de botella histórico es VENDER.
- **Salida:** escribe el archivo; la respuesta del modelo = mensaje de WhatsApp para Eze (máx 500 chars).

### 2.4 job_sinapsis — conexiones del grafo (nocturno)
- **Dónde:** `/Users/ezeotero/Documents/ravn/daemon/jobs/job_sinapsis.py` — `armar_prompt()` L52; llamada L121. Sonnet, timeout 900s, `MAX_PROPUESTAS = 3`.
- **Variables:** lista de notas huérfanas candidatas (path + label) sacadas del graph.json por código.
- **Objetivo:** proponer hasta 3 conexiones REALES huérfana ↔ nota existente (leyendo el vault con Grep/Glob), con razón de 1 frase. Eze aprueba por WhatsApp (UNIR/DESCARTAR).
- **Salida:** array JSON `[{nota_a, nota_b, razon}]`; el código valida existencia, pares repetidos y links ya en tinta.

### 2.5 job_top30 — refresh semanal de precios de materiales
- **Dónde:** `/Users/ezeotero/Documents/ravn/daemon/jobs/job_top30.py` — `armar_prompt()` L56; llamada L76. Sonnet, timeout 1500s, `MAX_FILAS = 30`.
- **Variables:** fecha, ruta del MD de precios del vault, cantidad de filas.
- **Objetivo:** por cada fila usar su "Query de actualización" con WebSearch y editar SOLO precio/fecha/fuente. Si no hay precio confiable, la fila queda como está — nunca inventar.
- **Salida:** edita el .md del vault + responde "actualizadas X de N filas". El código verifica que haya filas con la fecha de hoy.

### 2.6 job_noticias — editor de noticias del día
- **Dónde:** `/Users/ezeotero/Documents/ravn/daemon/jobs/job_noticias.py` — `const PROMPT` L24 (fijo, sin variables); llamada L99. Sonnet, timeout 900s.
- **Objetivo:** con WebSearch, 3 noticias por frente (economía / construcción / inmobiliario) con "por qué le importa a Ezequiel", fuente y URL real.
- **Salida:** SOLO un objeto JSON con los 3 arrays → tabla para el panel del día.

**Sin LLM (determinísticos, cero prompts):** `job_cerebro` (graphify update + `~/Documents/organismo/cerebro.py`, que se declara "cero LLM"), `job_datos` (chip DATO → vault "SIN IA"), `job_maestro` (matcheo SISMAT por difflib), `job_resumen`, `job_salud`, `job_dolar`, `job_sismat`, `job_precios`, `job_calendario`, y el goteo HomeReno (`~/Obsidian/RAVN/Conocimiento/Construccion/HomeRenoVision/_goteo.py`, launchd `com.ravn.homereno-goteo`).

---

## 3. Sistema de cotización (skills de Claude Code)

Acá el "prompt" no es un string en código: son **skills** que gobiernan a Claude Code cuando cotiza. El motor numérico es código determinístico — la IA piensa, el código suma.

### 3.1 cotizador-maestro
- **Dónde:** `/Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md` (114 líneas).
- **Modelo:** el de la sesión de Claude Code (Sonnet por defecto) — en sesión o headless vía `trabajos_cola`.
- **Variables:** el pedido de Eze ("cotizame X") + fotos/datos; jerarquía de fuentes: Datos-de-obra → fichas técnicas → Seia → CYPE (cantidades sí, precios JAMÁS) → internet.
- **Objetivo:** flujo formal completo: lecciones previas → ficha → receta paramétrica → doble precio SISMAT+internet → motor determinístico (`/Users/ezeotero/Documents/ravn/scripts/cotizador/instanciar.ts`) → tabla `cotizaciones` en `en_revision` + espejo vault. NUNCA emite solo; costo mío / margen de Eze; confianza declarada verificado/estimado; contraste de mercado siempre.
- **Salida:** fila en `cotizaciones` (estado `en_revision`) + `.md` en el vault; Eze aprueba/emite en la app.

### 3.2 cotizador-rapido
- **Dónde:** `/Users/ezeotero/.claude/skills/cotizador-rapido/SKILL.md` (66 líneas).
- **Objetivo:** consulta exprés para ENTENDER un laburo: método + materiales + tiempo/gente + precio de mercado, todo de internet en vivo con referencias, doble precio con SISMAT (`buscar.py`), regla anti-transplante.
- **Salida:** respuesta en chat + guardado en `~/Obsidian/RAVN/Cotizaciones/consultas/`.

### 3.3 Cola `trabajos_cola` (prompts dinámicos, sin texto fijo)
- **Productores:** el bot (`/Users/ezeotero/Documents/ravn-bots/src/portero.js` — `encolar()` L25; re-cotización con corrección L288) y la app (`/Users/ezeotero/Documents/ravn/src/app/api/trabajos/route.ts`; `/Users/ezeotero/Documents/ravn/src/app/api/obras/[id]/diagnostico/route.ts` L31 arma un prompt completo de orden: generar diagnóstico HTML + adjuntarlo a `obra_archivos`).
- **Consumidor:** Claude Code en la Mac (sesión con los skills de arriba). No hay un system prompt fijo en código: el prompt viaja en la fila (`prompt` + `contexto`).

**Sin prompts:** `scripts/cotizador/*.ts` (instanciar/sembrar/refrescar precios) y `scripts/gastos-obra.ts`, `scripts/dinero-foto.ts` son CLIs determinísticos que Claude Code invoca — no llaman a ninguna IA.

---

## 4. App RAVN (src/)

Única llamada directa a IA desde la app:

### 4.1 Extracción de comprobantes del cashflow (imagen y audio)
- **Dónde:** `/Users/ezeotero/Documents/ravn/src/app/api/cashflow/extract-comprobante/route.ts` — `promptImagen()` L20, `promptAudio()` L36.
- **Modelo:** Gemini (`GEMINI_MODEL` o `gemini-2.5-flash`, L168) con **fallback a Claude** para imágenes (`ANTHROPIC_MODEL` o `claude-3-5-sonnet-20241022`, L172 y L319 — reutiliza `promptImagen`).
- **Variables:** la imagen/audio + fecha de hoy en Argentina (para resolver "hoy"/"ayer").
- **Objetivo:** ticket o audio → borrador de movimiento de cashflow.
- **Salida:** JSON `{monto_ars, fecha, concepto, tipo}` (+ `transcripcion` en audio).

*(El resto de la app no llama IA: encola en `trabajos_cola` o lee lo que los jobs/bot ya escribieron.)*

---

## Cómo afinar un prompt

1. **Se toca en el código fuente**, en la ruta y línea que dice este índice — no hay panel de prompts, no hay copia paralela.
2. **Se prueba** ahí mismo: bot → deploy a Railway y mensaje real de WhatsApp (o tests en `ravn-bots/test/`); jobs → correr el job a mano (`python3 daemon/jobs/<job>.py` vía runner) y mirar la salida; skills → una cotización de prueba en sesión; app → subir un ticket real.
3. **Se actualiza este doc** solo si cambió lo estructural (archivo, línea, modelo, variables, formato de salida). Este doc es ÍNDICE, no copia — la copia se desactualiza; el texto vivo del prompt está siempre en el código.
