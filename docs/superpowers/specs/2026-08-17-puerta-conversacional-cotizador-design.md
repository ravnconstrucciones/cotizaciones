# Puerta conversacional del cotizador — diseño (17/08/2026)

**Brief de Eze (textual, viendo el composer en prod):** *"la puerta de entrada
tiene que ser esa!! ahí cargo la OT"* — señalando la caja de conversación del
expediente. La entrada al cotizador deja de ser un formulario y pasa a ser la
conversación misma.

Sucede al spec `2026-08-17-puerta-entrada-cotizador-design.md` (la puerta
construida esa madrugada). **El circuito de atrás no cambia**: este diseño
mueve la puerta a la caja de chat y borra el formulario. Enfoque aprobado:
la caja conversacional despacha los circuitos existentes (intake y charla);
no se unifican las olas.

## Decisiones cerradas con Eze (17/08, una por una)

1. **El chat ES la puerta.** El formulario `intake-gate.tsx` se borra;
   "+ Nueva cotización" deja al usuario en la conversación vacía.
2. **La vuelta de Fable aterriza en el hilo + panel editable.** Mensaje de
   resumen en la conversación y el `ReconocimientoPanel` montado ahí mismo.
3. **Adjuntar siempre.** El clip queda habilitado también en expedientes
   existentes.
4. **Home = la caja.** Al entrar al visor lo primero es el composer vacío
   (estilo ChatGPT); el selector de expedientes queda visible a un toque.

## 1 · La entrada

- Al abrir el visor sin cotización elegida se muestra la columna de
  conversación vacía con el composer: placeholder tipo
  "Tirá la OT: archivo, foto o contame el trabajo…" (copy institucional:
  "trabajo", nunca "laburo").
- Adjuntar habilitado con los límites vigentes: ≤4MB por proxy multipart,
  >4MB firmar → PUT directo a Storage → confirmar.
- "+ Nueva cotización" en el selector limpia la selección y deja esta misma
  caja vacía.

## 2 · El primer envío (nace el expediente)

Orden inquebrantable, el mismo de la puerta actual — primero PERSISTE,
después la ola:

1. `POST /api/intake` crea el borrador en App RAVN. **Título provisional**:
   primer renglón del mensaje (recortado); si no hay texto, el nombre del
   primer archivo. El título definitivo llega en `propuesta.titulo` de Fable
   y se ve en el panel antes de confirmar (contrato ya existente, no se toca).
2. Suben los archivos adjuntos (rutas de intake existentes).
3. El texto del mensaje persiste como primer mensaje `eze` del hilo
   (`cotizacion_mensajes`, mismo circuito de la charla): el expediente
   arranca con su historia completa.
4. Recién después se despacha la ola de reconocimiento por el bridge.

Bridge apagado (celular / Mac cerrada): todo queda persistido, el hilo lo
dice ("guardado; la ola sale cuando la Mac esté prendida") y ofrece
Relanzar (idempotente). Nada se afirma sin verificarse.

## 3 · Regla de despacho (una caja, dos momentos)

- **Expediente sin propuesta confirmada** → los mensajes alimentan el
  reconocimiento: respuestas a preguntas de Fable, datos nuevos, otro
  archivo. Enviar dispara el relanzamiento de la ola de reconocimiento
  (con bridge vivo; si no, persiste y avisa) — misma mecánica que la
  charla: la caja dispara, el botón Relanzar queda para reintentos.
- **Expediente con propuesta confirmada** → ola de charla, como hoy.
- El hilo declara en qué momento está el expediente; no hay heurística
  oculta ni magia de intención.

## 4 · La vuelta de Fable

- Propuesta lista → entra al hilo un mensaje `fable` con el resumen en una
  frase (rubros, ítems, maquinaria, cantidad de preguntas).
- El `ReconocimientoPanel` (componente existente, editable) se monta dentro
  de la columna de conversación, debajo de ese mensaje.
- Las preguntas se contestan en el panel **o** escribiendo en la caja (lo
  natural en el celular).
- Confirmar hace exactamente lo de hoy: receta candidata + `en_revision` +
  precios del motor + tablero con la cola de decisiones.

## 5 · Adjuntar en expedientes existentes

- El archivo va a los archivos del expediente (allowlist vigente).
- Queda registrado en el hilo como mensaje de Eze con el adjunto.
- La próxima ola — reconocimiento o charla según el momento — lo ve.
- Caso típico: el plano llega dos días después y se tira en la charla.

## 6 · Qué se borra y qué no cambia

**Se borra:** `intake-gate.tsx` y su pantalla en el selector.

**No cambia:** contrato de intake (`intake-contract.ts`), bridge y sus
prompts, `ReconocimientoPanel` (solo se muda de lugar), el pase,
aprobar/emitir (siguen siendo actos de Eze en App RAVN), la frontera de
credenciales (write: pase + intake + archivos + confirmar-reconocimiento;
`/aprobar` y `/emitir` siguen 401), `trg_cotizaciones_guard`.

**Errores:** igual que hoy — si la ola falla, el motivo entra al hilo como
`sistema` con Relanzar.

## Testing

- Tests de la regla de despacho (momento del expediente → tipo de ola).
- Tests del título provisional (primer renglón / nombre de archivo / vacíos).
- El circuito de intake y el panel conservan sus tests actuales.
- Verificación completa antes de afirmar nada: tests cotizador + App RAVN,
  typecheck, lint, build, y prueba en navegador del flujo entero
  (`TZ=UTC` para reproducir Vercel).

## Fuera de alcance

Igual que el spec anterior: audio con transcripción, amortización de
maquinaria, perfil del cliente. Tampoco entra acá unificar las olas en una
sola (enfoque B, descartado por riesgo sin ganancia visible).
