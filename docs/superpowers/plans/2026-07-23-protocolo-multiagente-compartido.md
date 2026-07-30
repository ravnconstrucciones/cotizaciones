# Protocolo multiagente compartido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalizar que Claude Code y Codex operan un mismo sistema RAVN: vault y grafo para conocimiento, Supabase/App RAVN para operación y un registro auditable entre ambos.

**Architecture:** No se agrega infraestructura ni una segunda base. El bot continúa escribiendo el vault; `job_cerebro` continúa ejecutando el update incremental de Graphify y cargando `grafo-app.json` a Supabase; la App continúa usando Supabase como fuente operativa. El cambio convierte esos flujos existentes en un contrato agnóstico del proveedor y explicita cómo un agente entrega contexto al otro.

**Tech Stack:** Markdown, Obsidian/GitHub vault, Graphify, daemon Python, Supabase, Next.js 15, Railway bot.

## Global Constraints

- No cambiar tablas, APIs, RLS ni jobs: el circuito técnico ya está desplegado y verificado el 2026-07-23.
- El vault es conocimiento; Supabase es estado operativo.
- Todo cambio de plata mantiene el ledger y termina con `dinero_huerfanos` vacío.
- No se registra una conversación completa: se registra solo una decisión, entrega, cambio operativo o bloqueo que el siguiente agente necesite para continuar.
- El grafo se deriva de fuentes del vault; nunca se edita `graphify-out/graph.json` a mano.

---

### Task 1: Declarar el contrato compartido para cualquier IA

**Files:**
- Modify: `.ravn/02_AI_RULES.md`
- Test: revisión de enlaces y de las restricciones de capas.

**Interfaces:**
- Consumes: `.ravn/01_ARCHITECTURE.md` y `Sistema/Protocolo de agentes compartido.md`.
- Produces: reglas obligatorias para Claude, Codex, Gemini y futuros agentes.

- [x] **Step 1: Definir la regla verificable**

Todo agente debe poder responder, antes de cerrar una tarea: qué cambió, en qué capa quedó persistido y cómo lo encuentra el siguiente agente.

- [x] **Step 2: Registrar el contrato en `02_AI_RULES.md`**

Agregar una sección `Protocolo multiagente compartido` que establezca las capas de verdad, el handoff mínimo, el flujo vault → Graphify → App y la regla de intervención en Supabase.

- [x] **Step 3: Verificar referencias**

Run: `rg -n "Protocolo multiagente|Sistema/Protocolo de agentes compartido|job_cerebro" .ravn/02_AI_RULES.md`

Expected: una sola sección de protocolo y referencias explícitas a la fuente técnica y al documento del vault.

### Task 2: Persistir la decisión de arquitectura

**Files:**
- Create: `.ravn/decisions/0004-protocolo-multiagente-compartido.md`
- Test: revisión contra `TEMPLATE.md`.

**Interfaces:**
- Consumes: aprobación de Eze del 2026-07-23.
- Produces: ADR con motivo, alternativas, descarte e implicancias.

- [x] **Step 1: Documentar la decisión**

Crear ADR 0004: una sola memoria compartida por capas, con Claude y Codex como operadores complementarios; no se crea un router ni se duplica la base de datos.

- [x] **Step 2: Verificar estructura**

Run: `rg -n "^## ¿Por qué|^## ¿Qué alternativas|^## ¿Por qué las descartamos|^## ¿Qué implicancias" .ravn/decisions/0004-protocolo-multiagente-compartido.md`

Expected: cuatro secciones, una por pregunta obligatoria del ADR.

### Task 3: Crear el handoff legible desde Obsidian

**Files:**
- Create: `/Users/ezeotero/Obsidian/RAVN/Sistema/Protocolo de agentes compartido.md`
- Modify: `/Users/ezeotero/Obsidian/RAVN/Sistema/Arquitectura vigente.md`
- Test: revisión de wikilinks y de la jerarquía de verdad.

**Interfaces:**
- Consumes: ADR 0004 y el flujo real documentado en `.ravn/01_ARCHITECTURE.md`.
- Produces: protocolo cotidiano para Claude Code, Codex, Cowork y el bot administrativo.

- [x] **Step 1: Escribir el protocolo de operación**

Definir responsabilidades: WhatsApp/bot captura administración; Claude Code/Cowork y Codex construyen e intervienen App RAVN; Obsidian conserva decisiones; Graphify deriva conexiones; Supabase conserva operación.

- [x] **Step 2: Definir el handoff mínimo**

Exigir un registro corto con `actor`, `fecha`, `acción`, `resultado`, `persistencia` y `siguiente paso` solo cuando la acción afecte una decisión, un dato operativo, un deploy, una migración o un bloqueo.

- [x] **Step 3: Actualizar la arquitectura vigente**

Agregar el enlace al protocolo y reemplazar la descripción de "Terminal Claude Code" por la de terminales de construcción complementarias, sin alterar los límites del bot de bolsillo.

- [x] **Step 4: Verificar que el grafo sigue siendo derivado**

Run: `rg -n "job_cerebro|Graphify|grafo" /Users/ezeotero/Documents/ravn/daemon/jobs/job_cerebro.py /Users/ezeotero/Obsidian/RAVN/Sistema/'Protocolo de agentes compartido.md'`

Expected: `job_cerebro` sigue siendo el único ciclo automático que actualiza y publica el grafo.

### Task 4: Cerrar con una prueba documental y de estado

**Files:**
- Modify: los cuatro archivos de las tareas anteriores.
- Test: `git diff --check` y validación de vínculos/documentos.

**Interfaces:**
- Consumes: documentos creados en Tasks 1–3.
- Produces: contrato listo para usar por ambos agentes sin cambios de runtime.

- [x] **Step 1: Validar whitespace y contenido**

Run: `git diff --check -- .ravn/02_AI_RULES.md .ravn/decisions/0004-protocolo-multiagente-compartido.md docs/superpowers/plans/2026-07-23-protocolo-multiagente-compartido.md && rg -n "Codex|Claude|Supabase|Graphify|handoff" .ravn/02_AI_RULES.md .ravn/decisions/0004-protocolo-multiagente-compartido.md /Users/ezeotero/Obsidian/RAVN/Sistema/'Protocolo de agentes compartido.md`

Expected: sin errores de diff; los cuatro conceptos aparecen en el contrato.

- [x] **Step 2: Registrar la activación en el vault**

Agregar la decisión al Inbox del día con los enlaces a la regla y al protocolo, para que `job_cerebro` la incorpore en su próxima actualización incremental.

- [ ] **Step 3: Commit**

No crear un commit automático: el árbol de trabajo ya tiene cambios ajenos. Entregar el diff acotado para que Eze o el flujo de Git existente lo incorpore.

## Self-Review

- Cobertura: roles, fuente de verdad, retroalimentación del grafo, intervención de App RAVN y trazabilidad están cubiertos por Tasks 1–4.
- Placeholders: ninguno; cada cambio, archivo y validación está especificado.
- Consistencia: el vault no guarda estado operativo, el grafo no es fuente editable y Supabase conserva el circuito de la app.
