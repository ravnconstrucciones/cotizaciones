# Cotización orquestada — protocolo v1 (08/08/2026)

Flujo para cuando Eze manda fotos/audio de un laburo (típicamente por voz
Duplex → Codex, o directo en Claude Code) y quiere la cotización completa.
Diseño completo: `docs/superpowers/specs/2026-08-08-cerebro-compartido-cotizador-multiagente-design.md`.
Este protocolo es la versión operable HOY, sin infraestructura nueva: roles
como subagentes/etapas de conversación, con los formatos y reglas ya vigentes.

## Regla de oro

**Una sola verdad técnica.** La ficha técnica del diagnosticador es la única
fuente de alcance; cliente, Fran, precios y propuesta derivan de ella. Nadie
reinterpreta las fotos por su cuenta.

## Etapas (en orden; 3 y 4 pueden ir en paralelo)

1. **Coordinador** (la sesión que habla con Eze)
   - `ravn-memoria recuperar` con el objetivo y las entidades (obra/cliente).
   - Identifica cliente, ubicación y separa trabajos parecidos (no mezclar
     alcances ni antecedentes). Administra las dudas con Eze.
   - Es el ÚNICO que escribe el resultado consolidado en App RAVN y el Vault.

2. **Diagnosticador técnico** — produce UNA ficha técnica estructurada
   (método constructivo, tareas, metrajes, dificultades, materiales).
   De esa misma ficha salen dos documentos, mismo alcance, distinto destinatario:
   - **Diagnóstico cliente**: formato oficial dark premium (base
     `Diagnostico_Perazzo.html`), claro y poco técnico.
   - **OT para Fran/cuadrilla**: plantilla fija de `~/Documents/Plantillas/`
     (banda negra, 3–5 bullets, SIN precios) — es lo que Fran usa para pasar
     su número de mano de obra. Recordar: el primer número de Fran no es el
     final, se negocia antes de cotizar.

3. **Investigador de precios internet** — método `cotizador-rapido`: precios
   VIVOS con fuente, fecha, unidad y flete. Nunca de memoria. Devuelve rangos,
   no decide el presupuesto.

4. **Analista SISMAT** — partidas equivalentes de la base SISMAT + regla de
   doble precio (SISMAT + internet). HomeSolution SIEMPRE como referencia de
   MO (no cubre herrería). Declara coincidencias, aproximaciones y faltantes.

5. **Motor determinístico** — NO es un agente: receta paramétrica + código.
   Cantidades, desperdicios y sumas las hace la app/el script, nunca un LLM.
   Regla dura: ninguna cotización activa sin `receta_id` (trigger
   `trg_cotizaciones_guard`).

6. **Cotizador** — consolida costo interno contrastando internet, SISMAT,
   maestro de precios y obras anteriores (lecciones del vault). Presenta:
   costo con fuentes + margen sugerido. **El margen lo decide Eze** (mínimo
   ~30%: si no da, achicar alcance, no comerse el margen). Queda en
   `cotizaciones` estado `en_revision` — jamás se emite solo.

7. **Redactor de propuesta** — recién con el número final aprobado por Eze.
   Alcance, exclusiones, condiciones; formato oficial (HTML negro A4,
   2 páginas). No cambia cantidades ni inventa partidas.

## Cierre obligatorio

- `select * from cotizador_huerfanos;` y `select * from dinero_huerfanos;`
  → ambas vacías.
- `ravn-memoria cerrar` con el cierre JSON (hechos, decisiones, IDs,
  pendientes) para que Codex y Claude compartan lo laburado.
- Todo entregable: al Vault Y a App RAVN (`obra_archivos`).

## Qué NO hace este protocolo

- No emite documentos ni fija precios sin aprobación explícita de Eze.
- No inventa precios "de cabeza" — vara de herramienta real.
- No requiere el build completo de 10 tareas del plan multiagente; cuando este
  flujo muestre fricción real, ahí se evalúa persistir etapas en Supabase
  (plan: `docs/superpowers/plans/2026-08-08-cotizador-multiagente.md`).
