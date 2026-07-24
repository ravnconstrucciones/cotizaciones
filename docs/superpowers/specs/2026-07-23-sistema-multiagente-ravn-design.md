# Sistema de desarrollo multi-agente RAVN — Diseño

**Fecha:** 2026-07-23
**Estado:** aprobado por Eze (con aportes de ChatGPT como Architect externo)
**Alcance:** estándar para TODOS los proyectos RAVN. Primer proyecto: App RAVN (`~/Documents/ravn`).

---

## Objetivo

Un sistema de trabajo donde cada agente de IA tiene un rol claro y toda IA que participe
(Claude hoy; Codex/Gemini/Cursor mañana) lee la misma fuente de verdad: la carpeta `.ravn/`.

El criterio de toda decisión: **¿esto acelera la información, el scrapeo, la automatización
de cotizaciones/presupuestos/diagnósticos, la velocidad de respuesta, la asertividad y la
calidad de UI?** El sistema de agentes es el motor, no el producto.

---

## Roles

| Rol | Quién | Qué hace |
|---|---|---|
| **Lead Engineer** (Architect + Builder + Reviewer) | Claude Code | Tiene repo, base, vault, MCPs y terminal. Diseña, implementa y revisa usando agentes separados (`ravn-desarrollador`, `ravn-code-reviewer`, `ravn-ux`, `ravn-cotizador`). |
| **Architect externo / sparring** | ChatGPT | Entra solo en decisiones grandes: arquitectura, producto, UX importante, roadmap, IA, performance. Se le pegan los docs `.ravn/`. NO está en el loop diario. |
| **Product Owner** | Eze | Decide prioridades, alcance, acepta o rechaza. Toda decisión de producto pasa por él. |

Regla dura para Claude: **nunca cambiar arquitectura crítica por iniciativa propia.**
Si hay una arquitectura mejor: detenerse → explicar por qué → ventajas → desventajas → esperar aprobación.

---

## Carpeta `.ravn/` — fuente única de verdad

Cada doc lleva en su cabecera:
- **Naturaleza:** `HECHOS` (regenerable desde el código — verdad verificable) o `INTENCIÓN`
  (lo que Eze quiere construir — el código no lo puede inferir; solo se edita con Eze).
- **Última verificación:** fecha (regla anti-zombie: doc viejo = hipótesis, no verdad).

| Archivo | Naturaleza | Contenido |
|---|---|---|
| `00_VISION.md` | INTENCIÓN | Misión, visión, cliente ideal, propuesta de valor. |
| `01_ARCHITECTURE.md` | HECHOS | Arquitectura real: componentes, comunicación, responsabilidades. Extraída del código. |
| `02_AI_RULES.md` | INTENCIÓN | Reglas agnósticas del proveedor para CUALQUIER IA: nunca romper compatibilidad, no borrar migraciones, no cambiar arquitectura sin justificar, actualizar docs, correr tests, no duplicar lógica, checklist de cierre de tarea. |
| `03_DATABASE.md` | HECHOS | Tablas, relaciones, migraciones. Extraído de Supabase. |
| `04_APIS.md` | HECHOS | Rutas/APIs: entradas, salidas, errores. Extraído del código. |
| `05_PROMPTS.md` | HECHOS + INTENCIÓN | Todos los prompts del sistema (bot, cotizador, scrapers): dónde viven, variables, objetivo. Centralizados para afinarlos → más asertividad. |
| `06_UI.md` | INTENCIÓN | Marca RAVN (B&N, Raleway, cero radius) + stack obligatorio (ui-ux-pro-max, Framer Motion, hero 21st.dev) + criterios de calidad UI. |
| `07_ROADMAP.md` | INTENCIÓN | Qué existe, qué falta, prioridades. |
| `decisions/` | INTENCIÓN | ADRs — ver abajo. |

Se eliminan respecto a la propuesta original: `02_PRODUCT` (se funde en VISION+ROADMAP),
`08_CODE_STYLE` y `09_REVIEW_CHECKLIST` (se funden en AI_RULES), `CODEX.md` y `CHATGPT.md`
(infra muerta hoy; Codex lee `AGENTS.md` si algún día se usa).

### `decisions/` — registro de decisiones (ADRs)

Archivos `NNNN-tema.md` (ej: `0001-ledger-como-fuente-de-verdad.md`). Cada uno responde:

1. ¿Por qué hicimos esto?
2. ¿Qué alternativas había?
3. ¿Por qué las descartamos?
4. ¿Qué implicancias tiene?

Se escribe un ADR cada vez que se toma una decisión de arquitectura o producto importante.
Es memoria que no depende del contexto de ninguna sesión.

### Archivos raíz del proyecto

- `CLAUDE.md` — fino: contexto específico de Claude + puntero a `.ravn/`. No repite reglas.
- `AGENTS.md` — equivalente para otras IAs (Codex lo lee nativo) + puntero a `.ravn/`.

---

## Replicación a otros proyectos

Plantilla `.ravn/` estándar + proceso de siembra: al aplicarla a un proyecto, los docs
HECHOS se **extraen leyendo el código real** (nunca genérico, nunca inventado) y los docs
INTENCIÓN se completan en conversación con Eze. Proyectos candidatos después de App RAVN:
ravn-landing, bot Railway, webs de clientes.

---

## Mantenimiento (anti-zombie)

- "Docs `.ravn/` actualizados" es ítem obligatorio del checklist de cierre de toda tarea.
- Todo doc HECHOS es regenerable: ante duda, se re-extrae del código.
- Doc con verificación >2 semanas = hipótesis a confirmar, no verdad.

---

## Flujo de trabajo

Feature nueva → se define el problema (Eze) → arquitectura si hace falta (Claude propone;
ChatGPT opina si es decisión grande; ADR si es importante) → Eze aprueba → Claude implementa
→ tests → review (`ravn-code-reviewer`) → correcciones → merge → docs actualizados.

Cambio chico (un botón, un fix) → directo a Claude, sin ceremonia.
