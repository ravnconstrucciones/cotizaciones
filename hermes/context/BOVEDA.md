# 🗂️ Plano maestro de la bóveda Obsidian (optimizada para el enjambre)

> Objetivo: que la información esté **perfectamente segmentada**, que **no se pierda
> nada**, y que **cada agente acceda solo a lo que le compete**. Todo lo que ya
> tenés se conserva: solo se REUBICA bajo la agencia correcta.

---

## Estructura objetivo

```
{VAULT}/
├── 00-Inbox/                      ← captura rápida sin clasificar (TODOS triagean)
│
├── 01-Construccion/               🏗️ AGENCIA CONSTRUCCIÓN
│   ├── Clientes/                  → construccion-clientes
│   ├── Obras/                     → cotizaciones · clientes · vision · renders
│   │   └── <Obra>/  (Cliente · Proyecto · Materiales · Avance · Renders)
│   ├── Proveedores/               → construccion-proveedores
│   ├── Presupuestos/              → construccion-cotizaciones
│   ├── Inmobiliario/              → construccion-inmobiliario
│   ├── Workflows/                 → renders · vision  (diagnóstico técnico, RenderAI)
│   └── RAVN-Marca/                → vision (+ lectura: publicidad-webs)
│                                     (ADN, Posicionamiento, Presencia digital,
│                                      Stack tecnológico, Landing page)
│
├── 02-Publicidad/                 🎨 AGENCIA PUBLICIDAD / DISEÑO
│   ├── Proyectos/                 → publicidad-webs · codigo · software
│   │   └── <Proyecto>/
│   ├── Workflows/                 → publicidad-webs  (videos Flow+Omni, etc.)
│   └── Recursos/                  → publicidad  (how-tos: capcut-export, etc.)
│
├── 03-Personal/                   🌟 COACH PERSONAL / HOLDING
│   ├── Finanzas/                  → coach-finanzas
│   ├── Salud/                     → coach-wellness        (crear)
│   ├── Orientacion/               → coach-psicologo  (síntesis de sesiones)
│   ├── Filosofia/                 → coach-psicologo
│   ├── Decisiones/                → coach-psicologo (+ vision)
│   ├── Aprendizajes/              → coach-psicologo / todos
│   ├── Yo/                        → coach-psicologo  (+ CARNET)
│   ├── Estrategia/FODA/           → vision + coach-oportunidades
│   └── Oportunidades/             → coach-oportunidades
│
├── 90-Templates/                  ← tus plantillas (las usan todos)
└── 91-Sistema/                    ← docs/superpowers, CLAUDE, Inicio (meta)
```

---

## Mapa de migración (de dónde → a dónde)

| Hoy | Va a | Dueño |
|-----|------|-------|
| `Obras/` | `01-Construccion/Obras/` | cotizaciones, clientes, vision |
| `Proveedores/` | `01-Construccion/Proveedores/` | proveedores |
| `Ravn/` (ADN, Posicionamiento, Presencia digital, Stack, Landing) | `01-Construccion/RAVN-Marca/` | vision (+ webs lee) |
| `Proyectos/Modelo inmobiliario` | `01-Construccion/Inmobiliario/` | inmobiliario |
| `Proyectos/Workflow renders RenderAI` | `01-Construccion/Workflows/` | renders |
| `Proyectos/Workflow diagnóstico técnico` | `01-Construccion/Workflows/` | vision/renders |
| `Proyectos/Agencia de Contenido` | `02-Publicidad/Proyectos/` | webs |
| `Proyectos/Agencia de Diseño y Webs` | `02-Publicidad/Proyectos/` | webs |
| `Proyectos/Contenido Instagram` | `02-Publicidad/Proyectos/` | webs |
| `Proyectos/Video San Vicente` | `02-Publicidad/Proyectos/` | webs |
| `Proyectos/Workflow videos Flow + Omni` | `02-Publicidad/Workflows/` | webs |
| `Aprendizajes/capcut-export-instagram` | `02-Publicidad/Recursos/` | webs |
| `Finanzas/` | `03-Personal/Finanzas/` | finanzas |
| `Orientación/` | `03-Personal/Orientacion/` | psicologo |
| `Filosofía/` | `03-Personal/Filosofia/` | psicologo |
| `Decisiones/` | `03-Personal/Decisiones/` | psicologo, vision |
| `Aprendizajes/` (resto) | `03-Personal/Aprendizajes/` | psicologo |
| `Yo/` + nota `CARNET` | `03-Personal/Yo/` | psicologo |
| `FODA/` | `03-Personal/Estrategia/FODA/` | vision, oportunidades |
| `FODA/Oportunidades` (+nuevas) | `03-Personal/Oportunidades/` | oportunidades |
| `Inbox/` | `00-Inbox/` | todos |
| `Templates/` | `90-Templates/` | todos |
| `docs/` + nota `CLAUDE` + `Inicio` | `91-Sistema/` | meta |

---

## ⚠️ A confirmar contigo (no puedo verlos por dentro)

Estos proyectos pueden ir a Construcción o a Publicidad — decime cuál:

- **Chamaco** → ¿obra/inmobiliario o proyecto de agencia?
- **Mobiliario** → ¿obra/producto o contenido de diseño?
- **Barrio Glorietas** → ¿inmobiliario? (asumido: 01-Construccion/Inmobiliario)
- **Daromy 172** → ¿inmobiliario? (asumido: 01-Construccion/Inmobiliario)

---

## Cómo ejecutar la reorganización SIN romper enlaces

Los `[[enlaces]]` de Obsidian se rompen si movés archivos con la terminal.
**Tres formas seguras (de mejor a más rápida):**

1. **Dentro de Obsidian** (recomendado): activá *Settings → Files & Links →
   "Automatically update internal links"*, y arrastrá las carpetas según el mapa.
   Obsidian reescribe los enlaces solo.
2. **Con tu Hermes local**: pasale este archivo como instrucción. El agente mueve
   y corrige enlaces con cuidado, paso a paso, mostrándote cada cambio.
3. **Script** (rápido, pero rompe wikilinks): solo si tus notas casi no usan `[[ ]]`.

> Regla: **nada se borra**. Si algo no encaja, va a `00-Inbox/` para clasificarlo después.
