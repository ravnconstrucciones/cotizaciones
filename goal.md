# GOAL — La Cotizadora que se alimenta sola (Master Plan RAVN)

**Spec completo:** `docs/superpowers/specs/2026-07-09-cotizadora-autoalimentada-design.md` — leerlo entero antes de tocar código.

## El goal en una frase

Que todo el sistema de cotización **se retroalimente solo y sea una música**: Eze lanza un laburo → si hay receta, take-off instantáneo con precios vivos → si NO hay, el sistema investiga (fabricante + videos + Seia + fichas + SISMAT), arma una **receta candidata** con fuente+confianza por cantidad, pregunta lo que le falta, cotiza, **guarda la receta** → la próxima vez ya está. Cada obra lo hace más inteligente.

## Las dos leyes madre (INNEGOCIABLES — las dictó Eze)

1. **NUNCA inventar un número.** Dato faltante = PREGUNTA a Eze, jamás un relleno. Si al ejecutar esto el sistema (o vos, agente) no tiene una cantidad/precio/paso: se planta y lo pide. **Por esta ley, en el Caso B (siding sin receta) el flujo VA A FRENAR para pedirle datos a Eze — eso es por diseño, no un bug.**
2. **Los presupuestos se construyen JUNTOS.** El sistema guía y pregunta; se alimenta de experiencia real de obra + info que carga Eze + videos/fichas.

Corolario: todo número lleva traza (fuente + fecha + confianza verificado/estimado).

## Primer build (Capítulo 1 = Fase 1 de ejecución)

El loop entero en dos casos:
- **Caso A — CON receta:** pintura-interior, 80 m² → take-off instantáneo con precios vivos en un panel exploratorio.
- **Caso B — SIN receta:** siding de fibrocemento → investigar → receta candidata con fuentes+confianza → preguntas abiertas a Eze → co-construcción → guardar en `recetas`.

Las 3 piezas de conectiva que faltan (el 90% ya existe, NO rehacer piezas):
1. Panel exploratorio (Capa 3) — ruta nueva liviana tipo `/cotizar`, sin estado formal en `cotizaciones`.
2. Fábrica de recetas (cerebro → receta candidata → aprobación → tabla `recetas`).
3. Capa fina de precios fechados (daemon escribe precios con timestamp; panel muestra "revisado hace 2 h" + refrescar).

## Reparto de trabajo acordado con Eze (09/07)

- **Backend/lógica (motor, tablas, pipeline receta candidata, precios fechados): hacerlo YA**, con agentes que implementan + agentes que revisan el código + un tercero que corrige sobre lo revisado.
- **La pasada de DISEÑO visual del panel (cómo se ve en la web) queda PARA VERLA CON EZE** — funcional primero, estética después con él (skill `ui-ux-pro-max` en esa pasada).
- El Capítulo 2 (industrializar la fábrica de recetas) es su propio spec, después.
