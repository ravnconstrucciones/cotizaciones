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

## Proyectos confirmados por el dueño

| Proyecto | Destino | Nota |
|----------|---------|------|
| **Chamaco** | `03-Personal/Salud/` | Es personal / wellness → coach-wellness |
| **Mobiliario** | `01-Construccion/Mobiliario/` | Línea de producto propia → construccion |
| **Barrio Glorietas** | `01-Construccion/Inmobiliario/` | Construcción |
| **Daromy 172** | `01-Construccion/Inmobiliario/` | **Cruzado**: construcción + diseño. Lo leen también publicidad-webs (taggear `#publicidad`) |

---

## INSTRUCCIONES PARA HERMES (ejecutor local)

> El dueño eligió que la reorganización la haga **Hermes en su máquina**.
> Seguí esto al pie de la letra:

1. **Backup primero.** Copiá la bóveda completa a `{VAULT}-backup-AAAA-MM-DD/` antes de tocar nada.
2. **Activá** en Obsidian *Settings → Files & Links → "Automatically update internal links"*
   (o corregí los `[[wikilinks]]` manualmente tras cada movimiento).
3. **Creá** las carpetas de la "Estructura objetivo".
4. **Mové** cada carpeta/nota según el "Mapa de migración" + tabla de proyectos confirmados.
   Mostrá cada movimiento antes de hacerlo y pedí confirmación en bloque.
5. **Nada se borra.** Lo que no encaje en ninguna categoría → `00-Inbox/` con un tag `#revisar`.
6. **Daromy 172**: dejarlo en `01-Construccion/Inmobiliario/` y agregar tag `#publicidad`
   para que la agencia de diseño también lo encuentre.
7. **Verificá** al final: ningún archivo perdido (contá notas antes/después) y ningún
   `[[enlace]]` roto (buscá enlaces sin destino).
8. **Actualizá** la línea `VAULT` en `ENJAMBRE.md` con la ruta real.

> Regla de oro: **antes de mover, contar; después de mover, volver a contar.**
> Si los números no coinciden, frenar y avisar.
