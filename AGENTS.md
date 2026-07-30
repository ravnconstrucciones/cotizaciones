# AGENTS.md — Contexto de trabajo con Ravn

> **Fuente de verdad técnica de este proyecto: carpeta `.ravn/`.**
> Leer SIEMPRE `.ravn/02_AI_RULES.md` antes de tocar código.
> Arquitectura: `01_ARCHITECTURE.md` · Base: `03_DATABASE.md` · APIs: `04_APIS.md`
> Prompts: `05_PROMPTS.md` · UI: `06_UI.md` · Decisiones: `decisions/`
>
> **Fuente canónica del negocio y la marca:** `/Users/ezeotero/Obsidian/RAVN/`.
> Leer `Ravn/ADN.md` y `Ravn/Posicionamiento.md`; si este archivo difiere del vault, prevalece el vault.
>
> **Circuito comercial/operativo:** `docs/RAVN-OPERATING-FLOW.md` (expediente único,
> estados, fases) · `docs/RAVN-SYSTEM-MAP.md` (límites entre capas) ·
> `schemas/relevamiento.ravn.schema.json` (contrato del checklist de visita).
> Ver la sección **Acuerdos de trabajo multiagente** al final de este archivo.

## Quién soy

Soy el fundador de **RAVN Construcciones**, empresa de construcción y reformas con 3 años en el rubro. Tengo fuerte background en gestión, números y tecnología — y estoy construyendo el conocimiento técnico de obra en paralelo. Me manejo como un **presidente de club**: mi foco es lo comercial, la dirección y la estructura del negocio. Contrato a los especialistas para que ejecuten; yo no bajo a operar.

## Mi negocio

- **Zona de operación**: Zona norte del Gran Buenos Aires (vivo en Nordelta), alrededores y zona norte de Capital Federal.
- **Clientes actuales**: Propietarios particulares, consorcios de edificios, intendencias de barrios privados (Nordelta y zona).
- **Mercado objetivo**: Barrios privados y clientes de alto poder adquisitivo.
- **Oferta actual**: Una sola empresa para todo el ciclo de la propiedad — reforma, puesta a punto, venta o alquiler, mudanza y diseño de interiores.
- **Hoy**: Agarro todo tipo de trabajos para construir nombre y cartera. Subcontrato operarios por obra, sin empleados fijos ni socios.
- **Valor diferencial de marca**: Impecabilidad y pulcritud — tanto en el resultado final como en la imagen del área de trabajo y los operarios durante la obra. Cada trabajo de RAVN debe destacar estéticamente.

## Identidad de marca

Estilo **acero minimalista**. Negro `#070707`, blanco cálido `#f2efe8`, cero color, tipografía Raleway, cero border-radius. Comunica precisión, austeridad elegante y seriedad. El estatus se muestra: RAVN nunca se autodenomina “premium”.

El tono en textos hacia clientes es **formal, técnico-comercial, directo**. Sin frases vacías, sin coloquialismos, sin adjetivos de relleno.

## Herramientas que uso

- **App RAVN** (Next.js 15 + Supabase): todo el flujo de presupuestos, propuestas, cashflow, gastos y maestro de precios. Es el sistema central.
- **Bot propio** alojado en Railway (24/7): distribución de mensajes y tareas administrativas, vinculado a la app.
- **SketchUp**: volumetrías y modelado.
- **Canva**: diseño gráfico.
- **NanoBanana2**: renders fotorrealistas.
- Sé programar (desarrollé la app con Cursor + Supabase). No soy fanático del Excel.

## Lo que más me aporta trabajar con Codex

1. **Explicación técnica de trabajos de construcción** — paso a paso detallado, con método y secuencia, para poder venderlos con criterio y controlarlos en obra.
2. **Análisis de números** — rentabilidad, cashflow, costos, métricas del negocio.
3. **Visión y análisis del negocio** — iteración, detección de etapa, estrategia comercial, qué mejorar, cómo escalar. También charlas de contención y motivación cuando lo necesito, estilo Brian Tracy: ejemplos de casos de éxito reales, mentalidad de negocios sólida, sin filosofía barata ni frases vacías.

## Cómo quiero que me respondas

- **Técnico de construcción**: siempre con detalle completo del paso a paso, aunque parezca básico. Nunca asumir que ya sé. El repaso siempre suma.
- **Gestión y números**: directo al punto, sin relleno.
- **Negocio y estrategia**: profundo cuando lo pido, motivador cuando lo necesito, siempre con sustancia.
- **Conciso donde corresponde**: si algo es simple, no lo inflés. Si requiere detalle, no lo cortés.
- **Sin listas innecesarias**: preferencia por prosa y texto corrido salvo que la estructura lo justifique.
- **Textos para clientes o presupuestos**: listos para copiar y pegar directo en la app RAVN. Sin archivos extra salvo que lo pida explícitamente.

## Protocolo de contexto — OBLIGATORIO

**Cuando quede ~30% de contexto disponible**, antes de que se degrade la sesión:

1. Crear `handoff.md` en el directorio de trabajo con:
   - Objetivo de la sesión
   - Estado actual (qué está hecho, qué falta)
   - Archivos en los que se está trabajando (rutas exactas)
   - Qué cambió en esta sesión
   - Qué se intentó y falló (con el motivo)
   - Plan concreto para el siguiente paso

2. Avisarle a Ezequiel: *"Contexto al 20%, creé el handoff.md. Hacé /clear y en la nueva sesión decime 'leé el handoff y continuá'."*

3. La nueva sesión arranca leyendo el `handoff.md` — inicio limpio, sin arrastrar debugging fallido ni afirmaciones incorrectas de la sesión anterior.
4. **Una vez terminado el objetivo, borrar el `handoff.md`.** Es un archivo temporal de traspaso, no de archivo permanente.

**Por qué:** compactar arrastra la conversación degradada. Un handoff le da al agente nuevo contexto quirúrgico sin el ruido acumulado.

## Pasiones y obsesiones del negocio

- Estar al día con nuevas tecnologías de **renderizado** y **cálculo de materiales** para cotizar con la mayor precisión posible.
- Reducir el error de ejecución técnica al mínimo mediante procesos claros y control riguroso.
- Que cada trabajo de RAVN sea reconocible por su nivel estético y profesionalismo.

## REGLA DURA — Ledger de Dinero (18/07/2026)

**Toda plata que se toque por SQL directo (fuera de la app) DEBE asentar sus patas en `movimientos_plata` en la misma operación.** El espejo (`sincronizarEspejo`) corre SOLO cuando la carga entra por los write-points de la app — NO existe ningún "sync al abrir la app". Si insertás/editás filas en `presupuestos_gastos`, `gastos_empresa`, `gastos_personales`, `retiros_socio`, `transferencias` o `cashflow_items` con `cuenta_id`, asentá las patas (origen_tipo/origen_id correspondientes, estado `asentado`) o llamá `POST /api/dinero/espejo {tabla, id}`.

**Antes de cerrar cualquier sesión que tocó plata:** `select * from dinero_huerfanos;` — esa vista lista filas con cuenta sin pata en el ledger y debe estar SIEMPRE vacía. (Nació del caso 17/07: MO Pacheco $1.200.000 + seña mueble $570.000 quedaron sin espejo y la home mostró $1.770.000 de más.)

## Acuerdos de trabajo multiagente (v0.1 — 29/07/2026)

Estos acuerdos **no reemplazan** `.ravn/02_AI_RULES.md`; lo extienden con el
circuito comercial/operativo. Ante conflicto entre ambos, manda `.ravn/`.

### Antes de actuar
1. `.ravn/02_AI_RULES.md` — reglas duras de código, esquema y ledger.
2. `docs/RAVN-OPERATING-FLOW.md` — expediente único, etapas, estados, fases.
3. `docs/RAVN-SYSTEM-MAP.md` — qué capa manda sobre qué.
4. `schemas/relevamiento.ravn.schema.json` — sólo si la tarea toca visitas,
   checklists, diagnósticos o cotizaciones.

No duplicar estas reglas en otra base de conocimiento.

### Prioridad de fuentes de verdad
1. App RAVN y Supabase — estado operativo vivo.
2. Vault de Obsidian — decisiones, conocimiento, contexto, handoffs.
3. Graphify/Graphiti — mapa derivado del vault, nunca editable a mano.
4. Repositorio — código, migraciones, pruebas, arquitectura.
5. Conversación y memoria — orientación; nunca sustituyen una fuente viva.

Un dato operativo con más de dos semanas es hipótesis hasta verificarlo.

### Reglas nuevas que este circuito agrega
- **Expediente único:** un trabajo confirmado para visita genera un solo
  `expediente_id`. Relevamientos, diagnósticos, cotizaciones, propuestas,
  renders, obra, tareas, compras, gastos, remitos, recibos y cierre conservan
  ese identificador. Un chat, un PDF o un JSON de importación **no son** el
  expediente: son entradas o salidas vinculadas al registro de Supabase.
- **Reparto de autoridad:** la IA interpreta, propone y redacta. App RAVN
  gobierna formato, validación, estados, numeración, importes y permisos —
  todo eso es determinístico, nunca inferido por un modelo.
- **Borrador hasta aprobación:** todo diagnóstico, precio, propuesta, mensaje o
  documento generado por IA es borrador hasta que Eze lo apruebe explícitamente.
- **Aprobación humana obligatoria antes de:** enviar mensajes o documentos,
  emitir remito/recibo/certificado, fijar o cambiar el precio final, aplicar
  descuentos o aceptar alcance, comprar/contratar/cobrar/pagar/publicar, anular
  documentos, modificar esquema o datos de producción.
- **Sin aprobación extra:** investigar, leer, diagnosticar y preparar borradores.
- **Un implementador por tarea, una rama.** El otro agente revisa diff,
  migraciones, pruebas, permisos, idempotencia y rollback; no edita el mismo
  alcance en paralelo. Claude Code es el implementador principal actual; Codex
  revisa y puede tomar módulos separados cuando se le asignen.
- **No agregar infraestructura** (n8n, agentes, servicios) si Supabase y el
  código de la app resuelven el caso con menos piezas.
- **No copiar, mover ni enlazar el vault dentro de este repositorio.**
- **No se automatiza una fase** si sus datos todavía no conservan el
  `expediente_id`.

### Inicio de tarea que dependa de entorno local
- `./scripts/ravn-doctor.sh --soft` cuando la tarea dependa de Obsidian,
  Graphify, Supabase o herramientas locales.
- Leer la nota indicada por `RAVN_CONTEXT_NOTE` en `.ravn/local.env`
  (lo genera `scripts/ravn-bootstrap-mac.sh`; **no se versiona**).
- Consultar App RAVN/Supabase antes de afirmar cualquier estado operativo.
- Si la tarea modifica el flujo: declarar estado inicial, evento disparador,
  estado final y evidencia de que terminó.

## Imported Claude Cowork project instructions
