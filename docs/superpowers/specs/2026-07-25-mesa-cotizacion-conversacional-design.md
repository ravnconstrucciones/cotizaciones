# Mesa de cotización conversacional — Diseño

**Fecha:** 2026-07-25
**Estado:** aprobado por Eze (brainstorm con mockups, layout B elegido)

## Qué es

La mesa de revisión (`/cotizaciones/[id]/revision`) evoluciona a **Mesa de cotización**: un solo lugar donde Eze arranca una cotización desde cero conversando, los rubros se llenan en vivo con precios de SISMAT + internet, la propuesta A4 se redacta sola al costado, y las fotos del proyecto se arrastran a la pantalla. Dos motores de IA corren **locales en la Mac** (Claude Code = Fable, Codex CLI) con las suscripciones existentes — **cero costo de API**.

## Decisiones tomadas con Eze

1. **Motor local, no API**: la app (Vercel) es la cara; los cerebros corren en la Mac. Uso principal desde la compu, así que la Mac está prendida por definición.
2. **Doble motor solo en búsquedas**: Fable conduce la charla. Cuando Eze pide precios/datos, se disparan Fable + Codex en paralelo, cada uno trae su tabla con fuentes, y después charlan entre los tres sobre las diferencias.
3. **Ubicación**: evolucionar la mesa de revisión existente. Botón "Nueva cotización" en `/cotizaciones` crea una cotización en blanco y lleva a la mesa. El flujo viejo (daemon arma → Eze revisa) sigue intacto.
4. **Layout B**: chat grande a la izquierda; a la derecha un panel con pestañas **Rubros / Propuesta / Fotos**.
5. **Estética**: el sistema visual de App RAVN es obligatorio — tokens `cdm-*`, Liquid Glass, Raleway/Space Grotesk, Framer Motion. Los mockups del brainstorm NO definen estética (feedback explícito de Eze sobre la tipografía). Invocar `ui-ux-pro-max` antes de construir UI, como exige `.ravn/06_UI.md`. Mobile: el panel derecho colapsa a drawer (la app es mobile-first aunque esta mesa se piense para compu).

## Leyes que este diseño respeta (no negociables)

- **Ley 1 — nunca inventar**: ítem sin precio → `sin_precio: true`, hueco visible, jamás $0.
- **Ley 2 — el código suma, la IA no**: Fable jamás calcula totales; toca el desglose únicamente vía `PATCH /api/cotizaciones/[id]/desglose` (el motor existente re-corre `cotizar()` server-side).
- **El chat jamás emite**: aprobar y emitir siguen siendo botones de Eze con la máquina de estados existente.

## Arquitectura

```
App RAVN (Vercel)                      Mac de Eze
┌──────────────────────┐               ┌─────────────────────────────┐
│ Mesa de cotización   │   Supabase    │ puente-cotizador (launchd)  │
│  chat + rubros +     │◄─ Realtime ──►│  ├─ claude -p --resume      │
│  propuesta + fotos   │   (mensajes,  │  │   (Fable, sesión por     │
│                      │    desglose,  │  │    cotización)           │
│ APIs existentes:     │    latidos)   │  └─ codex exec (búsquedas)  │
│  /desglose /archivos │               │                             │
└──────────────────────┘               └─────────────────────────────┘
```

### Componente nuevo 1 — tabla `cotizacion_mensajes`

Columnas: `id`, `cotizacion_id` (FK), `autor` (`eze` | `fable` | `codex` | `sistema`), `texto`, `adjuntos` jsonb, `meta` jsonb (fuentes, tipo de mensaje: charla | busqueda | aviso), `created_at`.
RLS como el resto del módulo: la app escribe vía API routes con service role; lectura + Realtime para el cliente autenticado. El hilo visible mezcla esta tabla con el hilo legacy (`construirHilo`) para cotizaciones viejas.

### Componente nuevo 2 — `puente-cotizador` (launchd, hermano de `com.ravn.jobs`)

- Se suscribe por Supabase Realtime a inserts en `cotizacion_mensajes` con `autor='eze'`. Al arrancar, barre mensajes sin responder (por si estaba caído).
- Por cada mensaje: corre **Claude Code headless** (`claude -p --resume <session>`) con sesión persistente **por cotización** (mantiene el contexto de toda la charla). El system prompt del puente le da: skill cotizador, SISMAT del vault, acceso a internet, y las herramientas para tocar la cotización (via API con token propio).
- **Directiva de búsqueda**: cuando Fable decide que hace falta buscar precios/datos, emite una directiva estructurada en su salida; el puente la interpreta y lanza `codex exec` **en paralelo** con la misma consigna. Cada motor escribe su propio mensaje (`autor='fable'`/`'codex'`) con hallazgos y fuentes. Luego el puente re-invoca a Fable con la respuesta de Codex para la ronda de consolidación (la "charla entre los tres").
- **Efectos sobre la cotización**: Fable aplica cambios solo vía las APIs existentes (`PATCH /desglose` con ops `ajuste`/`manual`, `POST /crops`, etc.) y actualiza el borrador de propuesta (abajo).
- **Latido**: upsert cada 30 s en tabla `puente_latidos` (`id` fijo, `visto_at`). La mesa muestra "motor conectado / desconectado" leyendo el último latido (> 90 s sin latido = desconectado).
- **Sesiones**: el mapeo cotización → session-id de Claude vive en disco local del puente (no necesita tabla).

### Componente nuevo 3 — estado `borrador`

- `EstadoCotizacion` suma `borrador` (en `src/lib/cotizador/estado.ts` + guards).
- "Nueva cotización" (botón en `/cotizaciones`) → POST crea cotización vacía en `borrador` → redirige a la mesa.
- Transiciones: `borrador → aprobada` y `borrador → rechazada` con el mismo guard de carrera 409. El flujo daemon existente sigue naciendo en `en_revision`; en esas cotizaciones la mesa conversacional también funciona.

### Componente nuevo 4 — propuesta en vivo

- Campo nuevo `revision.documento_borrador` (mismo shape `DatosDocumento` + relato) que Fable actualiza vía endpoint nuevo `PATCH /api/cotizaciones/[id]/documento-borrador`.
- La pestaña **Propuesta** renderiza ese borrador con el mismo lenguaje visual del documento A4 emitido (`/documento`), actualizándose por Realtime.
- Al emitir: el borrador precarga el `DatosDocumento` final; Eze completa lo que falte y emite con el botón de siempre.

### Fotos

- Drag & drop sobre **toda la mesa** (patrón ya resuelto en `command-bar.tsx`): overlay de soltar → POST `/api/cotizaciones/[id]/archivos` → `cotizacion_archivos` (bucket `obra-archivos`, signed URLs).
- Pestaña **Fotos**: grilla de miniaturas con toggle "va en la propuesta". Las marcadas aparecen en el documento (borrador y emitido).
- Al soltar fotos, la app inserta además un mensaje `autor='sistema'` con las referencias en `adjuntos` — así el puente se entera por el mismo canal Realtime y le pasa las imágenes a Fable (visión) en el próximo turno.

## UI (layout B)

- **Izquierda — charla**: hilo con autor visible por burbuja (Eze / Fable / Codex / Sistema), indicador "Fable está escribiendo…", renglón abajo con Enter para mandar. Base: `conversacion-panel.tsx` existente, extendido a tres voces.
- **Derecha — panel con pestañas**:
  - **Rubros**: la botonera de rubros existente de `hoja-viva.tsx` (10 rubros canónicos de `rubros.ts`) con totales por rubro, ítems editables, resaltado de ítems recién tocados por el motor, `SIN PRECIO` visible.
  - **Propuesta**: documento A4 en vivo.
  - **Fotos**: grilla + contador en la pestaña.
- Realtime: `use-realtime-table.ts` (respetar el contrato de `onChange` con `useCallback`).

## Errores

- **Puente caído / Mac dormida**: mesa muestra "motor desconectado"; los mensajes de Eze se guardan igual y el puente los responde al volver (barrido inicial).
- **Codex falla o tarda** (timeout configurable, ~90 s): Fable sigue solo y escribe un aviso ("Codex no respondió, va solo mi búsqueda").
- **Precio no encontrado**: `sin_precio`, hueco visible.
- **Carrera de estado**: guards existentes (`.eq("estado", X)` → 409).
- **Mensaje duplicado / re-proceso**: el puente marca en `meta` el id del mensaje que responde; nunca responde dos veces el mismo.

## Testing

- Lógica pura con tests (como `conversacion.ts` hoy): armado del hilo a tres voces + merge con hilo legacy, parseo de la directiva de búsqueda, transiciones de estado con `borrador`, reducer del documento borrador.
- Puente: prueba end-to-end real con una cotización de verdad (mensaje → respuesta de Fable → búsqueda doble → ítem cargado por `PATCH /desglose` → propuesta actualizada) antes de darlo por vivo.

## Fuera de alcance (YAGNI)

- Voz (entrada o salida) — resuelto en otro lado, y TTS está descartado por decisión previa.
- Emisión automática de documentos por el chat.
- Tocar el flujo daemon existente (`trabajos_cola` tipo `cotizar`) — sigue igual.
- Apps móviles nativas / optimización mobile más allá del colapso a drawer.
- Streaming token a token dentro de una burbuja (se escribe mensaje completo por turno; si después se quiere, se agrega).
