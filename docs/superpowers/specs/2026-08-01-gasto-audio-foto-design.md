# /gasto — entrada por audio y foto

**Fecha:** 2026-08-01 · **Aprobado por:** Eze (chat)

## Qué

La pantalla `/gasto` suma dos entradas: foto de ticket (cámara o galería) y
nota de voz grabada en la app. La IA precarga el formulario; **nada se guarda
sin confirmación** (regla: borrador hasta aprobación).

## Cómo

- **Motor único:** se reutiliza `/api/cashflow/extract-comprobante` (Gemini,
  ya procesa imagen y audio). Se extiende con un campo de form opcional
  `contexto` (JSON: `obras[{id,nombre}]`, `rubros[{id,nombre}]`) que entra al
  prompt de audio para que el modelo elija obra/rubro/tipo de una lista
  cerrada. Respuesta suma `obra_id`, `rubro_id`, `tipo_gasto`
  ("obra"|"empresa"|"personal") — todos opcionales y validados contra la
  lista (nunca se acepta un id que no vino en `contexto`).
- **Foto:** solo monto/concepto/fecha. Un ticket no sabe de qué obra es;
  obra/cuenta/rubro quedan con los defaults de la pantalla.
- **Audio:** monto/concepto/fecha + obra/rubro/tipo si los nombra. Grabación
  con MediaRecorder (iOS graba audio/mp4-AAC, Gemini lo acepta). Botón estilo
  WhatsApp: tocar para grabar, tocar para cortar, indicador + timer.
- **UI:** dos botones (📷/🎤) arriba del monto, estética actual (negro,
  minimal). Al volver la IA: campos precargados con marca sutil + línea con
  la transcripción de lo entendido. Se puede corregir todo antes de Guardar.
- **Errores:** fallo de Gemini/cuota → aviso claro, la carga manual sigue
  intacta. Micrófono denegado → instrucción para habilitarlo en iOS.
- **Deploy:** requiere `GEMINI_API_KEY` en el env de Vercel (verificar antes
  de dar por terminado).

## Fuera de alcance

- Cuenta desde el audio (queda el default/último usado).
- Guardado automático sin confirmar.
- Adjuntar archivos de audio ya grabados.
