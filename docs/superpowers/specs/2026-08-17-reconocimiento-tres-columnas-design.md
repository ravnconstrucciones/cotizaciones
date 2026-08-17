# Reconocimiento en tres columnas — diseño (17/08/2026)

**Brief de Eze (textual, viendo el reconocimiento en prod):** *"del lado
izquierdo solo se orquesta […] lo que ya asuma y le saque precio al medio
[…] me tiene que listar todas las preguntas a la derecha […] que sea como un
checklist que a la vista sea lo más simple de responder, o sea no saltearte
nada y que en ningún momento maree"*. Además: durante la ola no se veía nada
trabajando (la banda vive en el tablero, que no está montado en
reconocimiento) — el copy apuntaba a una banda inexistente.

Sucede al spec `2026-08-17-puerta-conversacional-cotizador-design.md`: la
puerta sigue siendo el chat; lo que cambia es DÓNDE aterriza la vuelta de
Fable. **El circuito de atrás no cambia** (intake, bridge, prompts,
confirmar, `trg_cotizaciones_guard`).

## Decisiones cerradas con Eze (17/08)

1. **Izquierda solo orquesta.** El `ReconocimientoPanel` embebido en el hilo
   se retira; la conversación queda limpia y sigue relanzando la ola.
2. **Medio = mesa de trabajo, siempre viva.** Tres estados: ola corriendo →
   banda de terminales en vivo (`LiveTerminals`, la misma del tablero);
   propuesta lista → cuadro editable con rubros, ítems, origen y precio de
   referencia, maquinaria y artefactos; error → motivo + Relanzar.
3. **Derecha = checklist de preguntas.** Rail "Lo que falta decidir" con las
   preguntas de la ola: una por fila, campo de respuesta inline, contador
   ("2 de 6"), tilde al responder, abiertas primero. Sin cajas anidadas.
   También se pueden contestar charlando a la izquierda (las dos vías valen).
4. **"Confirmar y cotizar" va al pie del tablero del medio.** Confirmás
   mirando lo que confirmás.

## Arquitectura

- `reconocimiento-panel.tsx` se reescribe: un hook `useReconocimiento`
  (estado + poll + acciones: leer, relanzar, editar, responder, confirmar)
  cuya instancia vive en `ControlCenter`, y dos componentes de presentación:
  `RecoBoard` (columna del medio) y `RecoDecisiones` (rail derecho).
- En `momento === "reconocimiento"`:
  - `ConversationColumn` pierde el prop `panel` (y el piso de 520px).
  - El medio monta `RecoBoard` en lugar de `EstadoColumna` (que queda solo
    para `entrada`). `RecoBoard` monta `LiveTerminals` con `request: null`:
    la banda se conecta sola al stream del bridge cuando hay ola.
  - El rail monta `RecoDecisiones` en lugar de `DecisionColumn`.
  - `pending` (solapa Decidir + espina) = preguntas sin responder.
  - El health-poll propio de control-center queda solo para `entrada`
    (en reconocimiento la lámpara la alimenta `LiveTerminals`, como en charla).
- Respuestas inline: mismas semánticas de hoy — al confirmar, las
  respondidas salen de la lista y quedan como contexto en el resumen; las
  vacías siguen como `preguntas_abiertas` de la cotización.
- Celular: solapas de siempre — conversar / tablero (`RecoBoard`) /
  decidir (`RecoDecisiones`).

## Qué se borra y qué no cambia

**Se borra:** el montaje del panel dentro del hilo (variant "hilo") y su CSS.

**No cambia:** contrato de intake, bridge y prompts, `despacharOla`,
confirmación (receta candidata + `en_revision` + precios del motor),
frontera de credenciales, guard de la base, tests del circuito de intake.

## Testing

Typecheck, lint, build, tests existentes. Prueba en navegador del flujo
entero contra prod (la ola real ya corrida hoy sirve de fixture).
