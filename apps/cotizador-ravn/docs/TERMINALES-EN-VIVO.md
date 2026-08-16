# Propuesta — Dos terminales Codex + Fable en vivo (pedido 7, 15/08/2026)

**Estado: PROPUESTA. No se construye sin aprobación explícita de Eze.**

## Qué pidió Eze (por voz, 15/08 noche)

Cuando se cotiza, el visor despliega DOS terminales (una Codex, una Fable) donde se ve
en vivo lo que cada uno busca y hace **con las suscripciones locales** (Codex CLI y
Claude Code), no con API paga. La data de ambos cae al visor y se muestran los merges:
en qué coinciden, en qué no, puntos a revisar al final de la ola. Absorbe el pedido 4
(cruce a fondo). Regla vigente: **terminal real o nada** — nunca actividad simulada.

## Arquitectura propuesta: bridge local a demanda

```
Visor (Next.js :3010)  ←SSE─  cotizador-bridge (Node, 127.0.0.1)  ─spawn→  claude -p … --output-format stream-json
        │                              │                          ─spawn→  codex exec --json …
        └── merge por rubro ←── eventos parseados de ambos streams
```

1. **`cotizador-bridge`**: proceso Node chico que corre en la Mac SOLO mientras se
   cotiza (lo levanta el visor o un comando; **no es un daemon** — respeta la regla
   "nada constante en la Mac"). Expone SSE en `127.0.0.1` con token local.
2. **Spawn por ola**: al disparar una cotización, el bridge lanza una sesión headless
   por modelo con el prompt de la ola (rubro/receta). Ambos CLIs ya cobran por
   suscripción: cero API.
3. **Stream crudo + eventos**: cada terminal del visor muestra el stream tal cual
   (stdout JSON-lines → texto legible). En paralelo, el bridge parsea eventos
   estructurados (fuente encontrada, precio con fecha, duda) para la banda de cruce.
4. **Merge al final de la ola**: coincidencias, divergencias y huecos por rubro.
   Persistencia del cruce = contrato nuevo (hoy la banda dice "Sin comparación
   persistida"); se persiste vía los flujos existentes, no por escritura directa
   del visor (el visor sigue read-only contra App RAVN).
5. **Fail-closed**: si el bridge no corre o un CLI no responde, el panel muestra
   N/D. Nunca se inventa actividad.

## Fases (cada una con veredicto de Eze antes de seguir)

- **F1 — Terminales crudas:** bridge + spawn + stream en vivo de ambos CLIs en el
  visor. Sin merge. Es la prueba de que la idea vale.
- **F2 — Eventos estructurados:** convención de salida (JSON por evento) para que
  los aportes caigan tipados por rubro.
- **F3 — Cruce persistido:** contrato de comparación (coincide / diverge / hueco)
  guardado, alimenta la banda de cruce y el punteo final de la ola.

## Decisiones que tiene que tomar Eze

1. ¿El visor **lanza** las sesiones (botón "cotizar") o se **engancha** a sesiones
   que Eze ya tiene abiertas? (Recomendado: lanzar — attach a TTYs ajenas es frágil.)
2. Qué corre cada uno en la ola: Fable con `cotizador-maestro`/`cotizador-rapido`,
   ¿y Codex con qué prompt/skill equivalente?
3. Cada ola consume cuota de las DOS suscripciones a la vez — ¿ok como default o
   se elige modelo por ola?

## Riesgos conocidos

- Coordinación de turnos con Codex en el mismo worktree (canon multiagente).
- Permisos de los CLIs en headless: la sesión hereda la config local; hay que
  definir el perfil de permisos de la ola (solo lectura + búsqueda web).
- La Mac apagada = no hay terminales; el visor en la nube mostraría N/D (correcto).
