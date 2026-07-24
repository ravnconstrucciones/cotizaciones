# Fase 0 — Siembra de `.ravn/` en App RAVN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear la carpeta `.ravn/` de App RAVN con docs HECHOS extraídos del código real y docs INTENCIÓN borradores para validar con Eze, según el spec `docs/superpowers/specs/2026-07-23-sistema-multiagente-ravn-design.md`.

**Architecture:** Docs HECHOS se generan leyendo `src/`, `daemon/`, `supabase/` y `~/Documents/ravn-bots` — nunca de memoria ni genérico. Docs INTENCIÓN se redactan desde el vault (`~/Obsidian/RAVN/`) y la memoria persistente, marcados para validación de Eze. Extracciones independientes se paralelizan con subagentes.

**Tech Stack:** Markdown puro. Fuentes: Next.js 15 App Router, Supabase (MCP `list_tables`/`list_migrations`), bot Node en ravn-bots, daemon de scrap.

## Global Constraints

- Cabecera obligatoria en TODO doc de `.ravn/`:
  ```markdown
  > **Naturaleza:** HECHOS | INTENCIÓN | HECHOS + INTENCIÓN
  > **Última verificación:** 2026-07-23
  > **Fuente:** <rutas de código/base de donde se extrajo, o "Eze + vault">
  ```
- Regla de extracción: cada afirmación en un doc HECHOS debe poder señalarse a un archivo/tabla real. Prohibido inventar o completar de memoria.
- Docs INTENCIÓN llevan además `> **Estado:** BORRADOR — pendiente validación Eze` hasta que Eze los apruebe.
- No tocar código de la app en esta fase. Solo docs.
- Commits chicos, uno por task, sin push.

---

### Task 1: Estructura + `02_AI_RULES.md`

**Files:**
- Create: `.ravn/02_AI_RULES.md`
- Create: `.ravn/decisions/TEMPLATE.md`

**Interfaces:**
- Produces: convención de cabecera y carpeta que usan todos los tasks siguientes.

- [ ] **Step 1: Crear `.ravn/02_AI_RULES.md`** con este contenido (naturaleza INTENCIÓN, ya validado en el spec — no es borrador):

```markdown
> **Naturaleza:** INTENCIÓN
> **Última verificación:** 2026-07-23
> **Fuente:** spec 2026-07-23 (Eze + ChatGPT + Claude)

# Reglas para cualquier IA que trabaje en este proyecto

Estas reglas son agnósticas del proveedor. Aplican a Claude, Codex, Gemini,
Cursor o cualquier agente futuro.

## Rol
- El agente implementa dentro de la arquitectura definida. NUNCA cambia
  arquitectura crítica por iniciativa propia. Si cree que hay algo mejor:
  se detiene → explica por qué → ventajas → desventajas → espera aprobación.
- Toda decisión de producto la toma Eze (Product Owner).

## Reglas duras
1. Nunca romper compatibilidad de APIs o esquema sin aprobación explícita.
2. Nunca borrar ni editar migraciones ya aplicadas. Cambios de esquema = migración nueva.
3. No duplicar lógica: buscar si ya existe antes de escribir.
4. No agregar dependencias sin justificar por qué no alcanza lo que hay.
5. KISS: si una solución tarda 20 minutos en entenderse, es demasiado compleja.
6. Preferir funciones chicas, archivos enfocados, nombres descriptivos.
7. Ante la duda: preguntar, nunca asumir.
8. Decisión importante de arquitectura/producto → escribir ADR en `decisions/`.

## Checklist de cierre de toda tarea
- [ ] Compila (`npm run build` o el build del proyecto)
- [ ] Tests pasan
- [ ] No rompí compatibilidad
- [ ] Docs `.ravn/` afectados actualizados (con fecha de verificación)
- [ ] Sin código duplicado ni dependencias nuevas injustificadas
- [ ] Nombres claros, feature desacoplada

## Fuente de verdad
- `.ravn/` es el punto único de verdad para cualquier IA.
- Docs HECHOS: regenerables desde el código; ante conflicto, gana el código.
- Docs INTENCIÓN: solo se editan con Eze; el código NO los puede inferir.
- Doc con verificación >2 semanas = hipótesis, re-verificar antes de usar.
```

- [ ] **Step 2: Crear `.ravn/decisions/TEMPLATE.md`**:

```markdown
# NNNN — <título de la decisión>

**Fecha:** AAAA-MM-DD
**Estado:** vigente | reemplazada por NNNN

## ¿Por qué hicimos esto?
## ¿Qué alternativas había?
## ¿Por qué las descartamos?
## ¿Qué implicancias tiene?
```

- [ ] **Step 3: Verificar** — `ls .ravn/ .ravn/decisions/` muestra ambos archivos.
- [ ] **Step 4: Commit** — `git add .ravn && git commit -m "docs(.ravn): estructura + AI_RULES + template ADR"`

---

### Task 2: `01_ARCHITECTURE.md` (HECHOS — extracción)

**Files:**
- Create: `.ravn/01_ARCHITECTURE.md`
- Fuentes de lectura: `src/app/` (rutas y páginas), `src/app/api/` (endpoints), `src/lib/` y `src/components/` (si existen), `daemon/`, `scripts/`, `supabase/`, `~/Documents/ravn-bots/` (estructura y jobs), `next.config.ts`, `package.json`.

**Interfaces:**
- Produces: lista canónica de componentes del sistema que Task 5 (PROMPTS) y Task 7 (ROADMAP) referencian por nombre.

- [ ] **Step 1: Extraer** — recorrer las fuentes y armar el doc con estas secciones exactas: `## Componentes` (App Next.js con sus áreas: obras, cotizar, dinero, mano-obra, dia, maestro-precios, etc. | Bot ravn-bots en Railway con sus jobs | Daemon de scrap en la Mac | Supabase como base única | Vercel deploy `ravn-app-one`), `## Comunicación` (quién habla con quién y por qué vía: app↔Supabase, bot↔Supabase, bot↔vault, daemon→Supabase, launchd jobs), `## Responsabilidades` (una línea por componente: qué hace y qué NO hace), `## Convenciones` (App Router, dónde viven páginas vs API vs lib vs components; ledger `dinero` como fuente de verdad).
- [ ] **Step 2: Verificar** — cada componente/ruta nombrado existe (`ls` de cada path citado). Cero afirmaciones sin archivo real detrás.
- [ ] **Step 3: Commit** — `git commit -m "docs(.ravn): 01_ARCHITECTURE extraída del código"`

---

### Task 3: `03_DATABASE.md` (HECHOS — extracción)

**Files:**
- Create: `.ravn/03_DATABASE.md`
- Fuentes: MCP Supabase `list_tables` + `list_migrations`, y `supabase/` del repo.

**Interfaces:**
- Produces: nombres canónicos de tablas que Task 4 (APIS) referencia.

- [ ] **Step 1: Extraer** — `list_tables` (schema public) → doc con secciones: `## Tablas` (por dominio: obras/cotizaciones/dinero/mano de obra/otros; por tabla: propósito en una línea + columnas clave + FKs), `## Relaciones` (las FKs importantes en prosa), `## Migraciones` (cómo se aplican: MCP `apply_migration`; cuántas hay y última fecha), `## Reglas` (ledger = fuente de verdad de dinero; RLS estado actual — si falta, decirlo honesto y apuntar ADR futuro).
- [ ] **Step 2: Verificar** — conteo de tablas del doc == conteo de `list_tables`. Ninguna tabla inventada.
- [ ] **Step 3: Commit** — `git commit -m "docs(.ravn): 03_DATABASE extraída de Supabase"`

---

### Task 4: `04_APIS.md` (HECHOS — extracción)

**Files:**
- Create: `.ravn/04_APIS.md`
- Fuentes: `src/app/api/**/route.ts` (todos).

**Interfaces:**
- Consumes: nombres de tablas de Task 3.

- [ ] **Step 1: Extraer** — por cada `route.ts`: ruta, métodos exportados (GET/POST/…), qué recibe (params/body real del código), qué devuelve, tablas que toca, errores que emite. Agrupar por dominio con una tabla-resumen al inicio (ruta | métodos | propósito).
- [ ] **Step 2: Verificar** — `find src/app/api -name "route.ts" | wc -l` == cantidad de rutas documentadas.
- [ ] **Step 3: Commit** — `git commit -m "docs(.ravn): 04_APIS extraída de src/app/api"`

---

### Task 5: `05_PROMPTS.md` (HECHOS + INTENCIÓN — extracción)

**Files:**
- Create: `.ravn/05_PROMPTS.md`
- Fuentes: `~/Documents/ravn-bots/` (grep de llamadas a Anthropic/system prompts), `daemon/`, `scripts/`, skills `~/.claude/skills/` relevantes (cotizador-maestro, cotizador-rapido), `src/` (si hay llamadas a IA).

**Interfaces:**
- Consumes: componentes de Task 2.

- [ ] **Step 1: Extraer** — inventario: por cada prompt del sistema: nombre, dónde vive (ruta exacta + línea aprox), modelo que usa, variables que recibe, objetivo en una línea, formato de salida esperado. Incluir sección `## Cómo afinar un prompt` (tocar en el código fuente, probar, actualizar este doc — el doc es índice, NO copia: la copia se desactualiza).
- [ ] **Step 2: Verificar** — cada ruta citada existe y contiene el prompt señalado.
- [ ] **Step 3: Commit** — `git commit -m "docs(.ravn): 05_PROMPTS inventario de prompts del sistema"`

---

### Task 6: `06_UI.md` (INTENCIÓN — desde marca ya definida)

**Files:**
- Create: `.ravn/06_UI.md`
- Fuentes: memoria de marca RAVN + `src/app/globals.css` + `raleway-local.ts` + componentes existentes (para citar ejemplos reales de patrones).

- [ ] **Step 1: Redactar** — secciones: `## Marca` (blanco `#f2efe8`, negro `#070707`, Raleway, cero color, cero border-radius, logo `RAVN.`), `## Stack obligatorio de UI` (skill ui-ux-pro-max antes de diseñar, Framer Motion para toda animación, hero de referencia 21st.dev en landings), `## Patrones existentes` (citar componentes reales del repo que son el patrón a seguir: tarjetas, tablas negras, glass del /dia), `## Criterios` (estatus se muestra no se dice; entregables dark premium; A4 negro para docs de cliente).
- [ ] **Step 2: Verificar** — los componentes citados como patrón existen en `src/`.
- [ ] **Step 3: Commit** — `git commit -m "docs(.ravn): 06_UI marca y estándar"`

---

### Task 7: `00_VISION.md` + `07_ROADMAP.md` (INTENCIÓN — borradores para Eze)

**Files:**
- Create: `.ravn/00_VISION.md`, `.ravn/07_ROADMAP.md`
- Fuentes: `~/Obsidian/RAVN/Ravn/ADN.md`, `Ravn/Posicionamiento.md`, última `Orientación/`, memoria (cotizadora autoalimentada = goal final), `goal.md` del repo.

- [ ] **Step 1: Redactar `00_VISION.md`** — misión, visión (ciclo completo de la propiedad), cliente ideal, propuesta de valor, y el goal de la app: cotizadora que se alimenta sola (2 leyes: nunca inventar + construir juntos). Marcar `Estado: BORRADOR — pendiente validación Eze`.
- [ ] **Step 2: Redactar `07_ROADMAP.md`** — `## Existe` (extraído de la app real), `## En curso`, `## Próximos 4 frentes` (1 loop cotizado vs real, 2 scrap cobertura+confianza, 3 Tramo C WhatsApp, 4 librería UI — en este orden, decisión de Eze 23/07). Mismo estado BORRADOR.
- [ ] **Step 3: Commit** — `git commit -m "docs(.ravn): VISION y ROADMAP borradores para validar"`

---

### Task 8: ADRs iniciales (decisiones ya tomadas)

**Files:**
- Create: `.ravn/decisions/0001-ledger-fuente-de-verdad.md`
- Create: `.ravn/decisions/0002-cotizadora-dos-leyes.md`
- Create: `.ravn/decisions/0003-margen-por-consola-emision-por-eze.md`

- [ ] **Step 1: Escribir los 3 ADRs** usando TEMPLATE.md, con el contexto real (por qué, alternativas, descarte, implicancias) reconstruido desde vault + memoria: 0001 el ledger `dinero` como única verdad de plata (vs saldos calculados ad-hoc); 0002 la cotizadora nunca inventa precios + se construye con Eze (vs auto-completar); 0003 margen y emisión de presupuestos los decide Eze por consola/mesa de revisión (vs emisión automática).
- [ ] **Step 2: Verificar** — numeración correlativa, template completo, sin secciones vacías.
- [ ] **Step 3: Commit** — `git commit -m "docs(.ravn): ADRs 0001-0003 decisiones fundacionales"`

---

### Task 9: Adelgazar `CLAUDE.md` + `AGENTS.md` raíz

**Files:**
- Modify: `CLAUDE.md` (raíz del repo — OJO: tiene cambios sin commitear de Eze, preservarlos)
- Modify: `AGENTS.md` (raíz — untracked, preservar contenido)

- [ ] **Step 1: Agregar al inicio de ambos** (sin borrar lo existente, que es contexto personal válido):

```markdown
> **Fuente de verdad técnica de este proyecto: carpeta `.ravn/`.**
> Leer SIEMPRE `.ravn/02_AI_RULES.md` antes de tocar código.
> Arquitectura: `01_ARCHITECTURE.md` · Base: `03_DATABASE.md` · APIs: `04_APIS.md`
> Prompts: `05_PROMPTS.md` · UI: `06_UI.md` · Decisiones: `decisions/`
```

- [ ] **Step 2: Commit solo esas ediciones** — `git add -p CLAUDE.md AGENTS.md` (solo el bloque nuevo) + commit `"docs: CLAUDE/AGENTS apuntan a .ravn/"`.

---

### Task 10: Cierre de fase — checkpoint con Eze

- [ ] **Step 1: Self-check anti-zombie** — todo doc tiene cabecera completa; HECHOS sin afirmaciones sin fuente; conteos de Tasks 3-4 verificados.
- [ ] **Step 2: Mostrar a Eze** — abrir `.ravn/` y presentar resumen en el chat; pedir validación de `00_VISION.md` y `07_ROADMAP.md` (borradores INTENCIÓN).
- [ ] **Step 3: Con el OK de Eze** — quitar `Estado: BORRADOR` de los validados, commit final `"docs(.ravn): fase 0 completa"`.
