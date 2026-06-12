# RAVN Centro de Mando — Diseño

**Fecha:** 2026-06-11
**Estado:** aprobado por Ezequiel en sesión de brainstorming (pendiente revisión final del spec escrito)
**Decisión madre:** App RAVN renace como el Centro de Mando — una sola app, una sola Supabase, un solo login.

---

## 1. Visión

Un solo lugar — el Jarvis de Ezequiel — donde vive absolutamente todo: obras, plata, pendientes, cotizaciones, el cerebro (vault) y la actividad del sistema. Se abre en la Mac como cockpit principal; el celular entra por el bot de WhatsApp, que escribe a la misma base. Nada se registra dos veces, nada se pierde, nada queda en una pieza suelta.

**Lo que NO es:** un séptimo sistema. Es la unificación de los seis que existen, con la muerte explícita de los duplicados.

## 2. Decisiones tomadas (con Ezequiel, 2026-06-11)

| Decisión | Elección |
|---|---|
| Arquitectura | **Renacimiento**: App RAVN se convierte en el Centro de Mando. Carcasa, navegación y home nuevas (estética Jarvis). Módulos viejos viven adentro y se rediseñan por tandas. `ravn-tu-dia` muere. |
| Dispositivo principal | **Mac primero** (cockpit de escritorio). Celular = bot WhatsApp, sin app móvil propia. |
| Salud | **Fuera del tablero** (se gestiona aparte). |
| 1% kaizen | Sin protagonismo en el tablero. Disponible como herramienta para momentos de traba, no como módulo fijo. |
| Bot ante dudas | **Pregunta con opciones numeradas + timeout → Archivados**. Nada se pierde nunca. |
| Piezas locales | **Mueren todas** (ver §8), recién cuando lo nuevo esté andando. Oficina se absorbe como feed de Actividad. |
| Cotizador: disparo | WhatsApp + barra de comando del tablero → cola Supabase → daemon Mac con **Claude Code headless (suscripción, no API)**. |
| Cotizador: loop | Las 4 patas: memoria, contraste con realidad, precios frescos, auto-crítica. |
| Cotizador: aprobación | **Dos tiempos obligatorios**: mesa de revisión → OK explícito de Eze → documento final. Nunca auto-finaliza. |
| Fuentes técnicas | Jerarquía formal (ver §6.3). Seia NUNCA como verdad única; siempre cruce con internet. |
| Vault en el tablero | Lo registrado hoy + última orientación + patrones/FODA, **actualizándose solos** (job nocturno). |

## 3. Arquitectura

```
                    ┌──────────────────────────────────┐
                    │   RAVN CENTRO DE MANDO (Vercel)  │
                    │   Next.js 15 — ~/Documents/ravn  │
                    │   home = cockpit Jarvis          │
                    └───────────────┬──────────────────┘
                                    │
   Bot WhatsApp (Railway) ──────►   │   ◄────── Vault (repo GitHub "boveda")
   Haiku: clasifica, registra   ┌───┴────────┐         lectura server-side cacheada
                                │  SUPABASE  │
   Daemon Mac ◄────────────────►│  (la única │
   Claude Code headless         │   base)    │
   cotiza, procesa inbox,       └────────────┘
   refresca precios
```

- **Una app** (`~/Documents/ravn`, proyecto Vercel `ravn-app-one`): se le construye carcasa + navegación + home nuevas. Las pantallas existentes (presupuestos, cashflow, maestro, catálogo, rentabilidad, finanzas) quedan adentro de la carcasa desde el día uno y se rediseñan por tandas.
- **Una Supabase**: la actual de App RAVN. El bot y el daemon escriben ahí con **usuario dedicado** (no service_role expuesta).
- **El vault sigue siendo el cerebro narrativo** (Obsidian/iCloud + repo GitHub `boveda`). El tablero lo lee server-side vía GitHub API con caché (~5 min). No se duplica el contenido en la base; la base guarda lo transaccional.
- **El daemon Mac** (`~/.ravn-cotizador/daemon.py`, ya existe) se mantiene y se amplía: es el músculo pesado. Levanta trabajos de la cola y corre Claude Code headless con la suscripción. Si la Mac está apagada, el trabajo espera en cola y el bot avisa.

## 4. Home cockpit (módulos)

Una pantalla, sin scroll en desktop:

1. **Barra de comando** — entrada de texto arriba de todo: "cotizame baño completo en Pilar", "qué gasté hoy", "anotá llamar a Oribe". Crea un trabajo en la cola (`trabajos_cola`, generalización de `cotizaciones_cola`) o resuelve inline lo simple. Progreso visible en vivo (Supabase Realtime).
2. **Obras** — activas con estado, último gasto, margen al día (`presupuestos`/`obras`/`cashflow_items`).
3. **Plata** — cashflow del mes, gastos de hoy (obra + personales), semáforo.
4. **Pendientes** — tabla `tareas` unificada (la única fuente de tareas: bot, tablero y comando escriben acá). CRUD desde el tablero.
5. **Cotizaciones** — en proceso (estado vivo) + historial con resultado y estado de aprobación.
6. **Actividad** (ex-oficina) — feed de la tabla `eventos`: todo lo que hizo el bot, el daemon y los agentes. Reemplaza al cockpit local 4317.
7. **Archivados** — ítems sin clasificar pendientes de Eze. Badge visible si hay algo. Resolver = asignar destino con un click.
8. **El cerebro** — "siguiente paso" de la última Orientación, patrones y FODA del vault. Lectura GitHub cacheada.

## 5. Flujo WhatsApp — nada se pierde

1. **Todo mensaje entrante genera una fila en `eventos`** (registro permanente, primero que todo). Esto reemplaza el historial en memoria que hoy se borra en cada reboot de Railway.
2. El bot clasifica con Haiku:
   - **Confianza alta** → registra en el destino (gasto de obra → `presupuestos_gastos`; gasto personal → `gastos_personales`; tarea → `tareas`; nota → vault Inbox) y confirma en una línea.
   - **Duda** → responde con opciones numeradas. Si Eze no contesta en N horas (configurable, default 4h) → estado `archivado`, visible en el tablero con aviso.
3. **Fixes de fragilidad del bot** (parte del alcance):
   - Vault en `/tmp` de Railway → reemplazar por commits vía API de GitHub (sin clone) o volumen persistente.
   - Inserts rechazados por RLS en silencio → error visible + evento `archivado` (nunca se pierde el dato).
   - Código duplicado (`index.js` vs `messageHandler.js`/`webhook.js`) → consolidar en uno.
   - Verificar variables de entorno reales en Railway (GITHUB_TOKEN, SUPABASE_*, GEMINI_API_KEY) — el explorador local no puede confirmarlas.
   - Historial de conversación → persistir en `eventos` (deja de vivir solo en memoria).

## 6. Cotizador 2.0

### 6.1 Pipeline

```
orden (WhatsApp o barra de comando)
  → ficha de datos (si faltan datos, el bot pregunta — cotización a ciegas: nunca)
  → cola Supabase (trabajos_cola)
  → daemon Mac: Claude Code headless corre cotizador-maestro
      receta (jerarquía de fuentes §6.3) + cantidades por CÓDIGO (§6.2)
      + doble precio SISMAT/internet + checklist anti-olvidos + sanidad física
  → MESA DE REVISIÓN (§6.4) → OK de Eze → documento final (formato Presupuesto oficial)
  → guarda: tabla cotizaciones + vault Cotizaciones/ + aviso WhatsApp + tablero
```

### 6.2 Las 7 mejoras

1. **Criterio vs cálculo separados** — la IA decide la receta; las cantidades, desperdicios y totales los calcula código determinístico con tests unitarios. La IA piensa, el código suma. Cero errores aritméticos.
2. **Recetario paramétrico** — biblioteca de recetas (baño completo, pintura interior, tabique durlock, …): etapas + materiales con fórmula por m²/ml/unidad + MO + tiempos. Cotizar = instanciar con medidas. Cada cotización refina la receta. Tabla `recetas` + espejo legible en el vault.
3. **Checklist anti-olvidos** — por tipo de trabajo: flete, volquete, consumibles, andamios, limpieza final, retiro de escombros, imprevistos %, factor zona (countries +15–20%). El revisor cruza la cotización contra el checklist antes de mostrarla.
4. **Precios con vencimiento** — todo precio guarda fecha + fuente. Vencido (15 días materiales / 30 MO, configurable) → se re-busca solo antes de usarse. SISMAT: sync automático mensual (script ya existe, se agenda). Dólar: diario. Top-30 materiales más usados: re-cotización semanal programada.
5. **Calibración con obras reales (el loop de oro)** — al cerrar una obra, un job compara cotizado vs gastado real (`presupuestos_gastos`) ítem por ítem y ajusta coeficientes de desperdicio/rendimiento en `cotizador_lecciones`. También calibra tiempos y cuadrilla con fechas reales.
6. **Ficha por WhatsApp** — sin datos suficientes no se cotiza; el bot hace las 3-4 preguntas de la ficha primero (mecanismo `jobAnswers` ya existe, se formaliza).
7. **Sanidad física** — chequeos automáticos: rendimientos dentro de rangos físicos, precio final por m² dentro de banda de mercado del rubro, relaciones geométricas posibles. Fuera de banda → no se entrega, se marca y se consulta.

### 6.3 Jerarquía de fuentes (criterio)

1. **Fichas técnicas de fabricantes** (Weber, Klaukol, Sika, Alba, Cacique, …) — rendimientos y consumos oficiales del producto. Máxima autoridad en SU producto.
2. **Seia** — método, secuencia, criterio de obra, errores típicos (293 destilados; si falta el destilado pero existe la cruda, se destila en el momento).
3. **Cruce de internet — SIEMPRE** — mínimo 2 fuentes profesionales independientes. Conflicto con Seia o con la experiencia de Eze → ambas versiones a la mesa + pregunta. Nunca se elige en silencio.
4. **Tarifarios para MO/costos** — SISMAT como referencia A (sync mensual). Si se identifica un segundo tarifario vivo y accesible, se suma como referencia B.
5. **Las obras de Eze** — la fuente que más peso gana con el tiempo (vía calibración §6.2.5).

**Protocolo "Seia no lo tiene":** ficha de fabricante + 2 fuentes profesionales independientes → receta marcada `investigada — sin validar en obra`, con banderas visibles en la mesa de revisión → tras usarse en obra real y pasar el contraste, se promueve a `confiable`.

### 6.4 Mesa de revisión (gate obligatorio)

Antes de cualquier documento final, Eze ve TODO:
- Receta usada (y su estado: confiable / investigada)
- Fuentes con fecha, de cada dato
- Precios (SISMAT vs internet, divergencias >25% marcadas)
- Cantidades calculadas y sus fórmulas
- Resultado del checklist anti-olvidos y de la sanidad física
- Dudas abiertas del sistema

Por WhatsApp: resumen + "OK / corregir X". En el tablero: vista completa. **El documento final no se genera sin OK explícito.** Estados: `borrador → en_revision → aprobada → documento_emitido` (o `rechazada` con motivo, que alimenta lecciones).

### 6.5 Los 4 loops (motor permanente)

1. **Memoria** — tabla `cotizaciones` + vault; toda cotización nueva arranca de las similares previas.
2. **Contraste con la realidad** — §6.2.5.
3. **Precios frescos** — §6.2.4.
4. **Auto-crítica** — post-cotización, agente revisor la cruza contra Seia + checklist + historial; anota en `cotizador_lecciones` y en `Conocimiento/Precios/lecciones-cotizador.md`. Las lecciones se inyectan en la próxima cotización.

## 7. El cerebro se actualiza solo

Job nocturno en la Mac (daemon): corre "procesá mi inbox" con Claude Code headless → rutea entradas del día, actualiza FODA/Patrones, genera Orientación nueva, pushea a `boveda`. El tablero la muestra fresca a la mañana. Si la Mac está apagada esa noche, corre al prenderse (catch-up).

## 8. Lo que se muere (al final, no al principio)

| Pieza | Reemplazo |
|---|---|
| `panel.html` local + `build_panel.py` | Home cockpit |
| `app.html` + `panel-server.py` (4319) | Home cockpit |
| launchd `com.ravn.tudia` (roto desde 2026-06-07) | Job nocturno del daemon |
| `oficina.html` + `oficina-server.py` (4317) | Feed Actividad (tabla `eventos`) |
| Proyecto `ravn-tu-dia` (repo + Vercel) | Centro de Mando |
| Código duplicado del bot | Bot consolidado |

**Regla:** ninguna pieza se borra hasta que su reemplazo esté funcionando verificado. Recién ahí: baja de launchd, archivo del repo, borrado del proyecto Vercel.

## 9. Cimientos y seguridad

- **Migración versionada para `gastos_personales`** (hoy en producción sin migración — riesgo de pérdida).
- **Auditoría RLS** de todas las tablas (estándar de seguridad Ravn). Bot y daemon escriben con usuario dedicado; service_role solo server-side en la app.
- **Política RLS inmobiliario** (`using (true)`) se restringe.
- **Vitest** configurado, con tests en la lógica que toca plata: motor de cálculo del cotizador, cómputo de cashflow, clasificación de eventos.
- **Resiliencia:** WhatsApp caído → tablero sigue; web caída → bot sigue registrando; Claude falla → reintento con backoff y el evento queda `archivado` (jamás se pierde); Mac apagada → cola espera + aviso.

## 10. Diseño visual

- **Identidad RAVN:** negro `#0a0a0a`, off-white `#f0ede6`, taupe `#c8b49a`, Raleway 300/400/700/900, cero border-radius, espaciado generoso y asimétrico.
- **Sensación Jarvis:** cockpit oscuro, datos en vivo, microanimaciones con propósito, barra de comando como protagonista.
- **Mac-first:** densidad de cockpit en desktop; responsive como degradación elegante (el móvil es WhatsApp, no la web).
- **En implementación es obligatorio:** skill `ui-ux-pro-max` antes de diseñar, referencia hero/componentes de 21st.dev, animaciones con Framer Motion (regla global del stack web de Eze).

## 11. Fuera de alcance

- Módulo de salud (se gestiona aparte; decisión explícita de Eze).
- App móvil nativa (WhatsApp es el canal móvil).
- El 1% kaizen como módulo fijo (queda como herramienta bajo demanda).
- Rediseño completo de TODAS las pantallas viejas en esta etapa (entran a la carcasa nueva; el rediseño profundo va por tandas posteriores).
- Tablero inmobiliario Fase 1 (proyecto aparte ya especificado; convive dentro de la misma app).

## 12. Frentes de implementación (para writing-plans)

Trabajables en paralelo; cada uno tendrá su plan detallado:

- **Frente A — Cimientos:** migración `gastos_personales`, auditoría RLS, tablas nuevas (`eventos`, `trabajos_cola`, `cotizaciones`, `recetas`, `cotizador_lecciones`), Vitest base, verificación Railway.
- **Frente B — Carcasa + Home cockpit:** shell de navegación nueva, home Jarvis con los 8 módulos, barra de comando, Realtime.
- **Frente C — Bot 2.0:** eventos permanentes, pregunta+archivados, fixes de fragilidad, consolidación de código.
- **Frente D — Cotizador 2.0:** motor de cálculo determinístico, recetario, checklist, vencimiento de precios, mesa de revisión, los 4 loops.
- **Frente E — Cerebro + limpieza:** job nocturno de inbox, lecturas del vault en el tablero, y la baja ordenada de las piezas viejas (§8).

Dependencias duras: A antes que el resto en lo que toque tablas; B necesita las tablas de A para Actividad/Archivados; D depende de la cola (A) y del bot para la ficha (C). Todo lo demás avanza en paralelo.

## 13. Criterio de éxito

1. Ezequiel abre UNA url en la Mac y ve toda su operación viva, sin tocar nada local.
2. Todo lo que manda al bot queda registrado o en Archivados — pérdida: cero.
3. Una cotización disparada desde el celular llega a mesa de revisión sin intervención, con fuentes fechadas, y NO se emite sin su OK.
4. Las piezas de §8 están dadas de baja y nada las extraña.
5. El cotizador mejora solo: cada obra cerrada ajusta coeficientes; cada cotización deja lecciones.
