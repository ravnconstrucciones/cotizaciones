# Final fix B — reporte de implementación

Fecha: 2026-08-08

Base original: `dd13853`

Base de esta corrección: `1a7805e`

Base de la corrección ronda 2: `c2fa83c`

## Resultado

- Discovery excluye sólo los journals no-sesión conocidos por nombre y preserva
  sesiones Claude válidas dentro de `subagents/`, `workflows/` y `journals/`.
- `leer_sesion` carga cada JSONL una sola vez y reutiliza los mismos registros para detectar host y normalizar.
- Claude conserva únicamente bloques `text` como mensaje visible, descarta `thinking` y convierte `tool_use` en un mensaje acotado con nombre y SHA-256; `tool_result` conserva el límite existente.
- El cursor v2 guarda firma `(mtime_ns, size)`, host, thread, estado y error. Las entradas v1 descubiertas se verifican nuevamente y las entradas viejas ausentes no contaminan el formato v2.
- Las firmas v2 sin cambios no vuelven a abrir ni normalizar JSONL, pero siguen reevaluando inactividad desde la metadata del cursor.
- El pipeline completo queda aislado por fuente: fallos de `stat`, lectura,
  persistencia del crudo, creación del pendiente o validación no impiden avanzar
  una fuente sana.
- Una fuente con formato permanentemente desconocido queda omitida sin repetir
  el evento mientras su firma no cambie. Un error transitorio queda en estado
  `error`, se reintenta aun con firma idéntica y se informa una sola vez.
- Se comprueba la firma antes y después de leer y persistir el crudo. Si el
  JSONL crece durante el snapshot, no se publica como archivado y se reintenta.
- Un cursor corrupto se conserva con nombre determinístico
  `memoria-cursor.json.corrupt-<sha256>` y se reconstruye de forma conservadora.
- Un cierre tardío mueve de forma bloqueada y atómica sus pendientes
  `cierre_estructurado_faltante` a
  `Sistema/Memoria/pendientes-resueltos/`, agrega `resuelto_at` y conserva
  `evento_emitido: false` hasta confirmar el evento.
- La corrida completa, la creación de pendientes y el marcado/resolución usan
  locks compatibles para evitar duplicados en concurrencia.
- El evento resumido informa respaldadas, sin cierre, omitidas y errores. Un
  outbox local durable conserva su identidad y acciones: una falla de red, de
  marcado local o de cursor se reintenta sin releer snapshots ya confirmados ni
  duplicar el evento lógico.
- La firma confirmada se escribe en el cursor antes de intentar el POST. Las
  acciones ya reclamadas por un outbox se descuentan de forma granular: si una
  sesión crece después de una caída de red, el evento nuevo contiene sólo el
  snapshot nuevo y no vuelve a incluir el cierre pendiente anterior.
- Los fallos al leer cierres o resolver/mover pendientes se aíslan antes del
  loop de fuentes. Quedan en `errores_globales` del cursor, se reintentan en cada
  corrida y sólo generan una advertencia hasta recuperarse. Mientras el listado
  de cierres es incompleto no se crean falsos pendientes de cierre.

## Evidencia TDD

RED inicial: 26 tests dirigidos, con 5 fallos y 2 errores esperados por las conductas todavía ausentes. Un ciclo RED adicional reprodujo un `OSError` de lectura aislado.

La ronda de corrección agregó ciclos RED independientes para: sesiones válidas
en directorios anidados, aislamiento de fallos por fuente, crecimiento durante
lectura y persistencia, retry transitorio sin spam, cursor corrupto, resolución
con evento fallido, carreras al crear/mover pendientes, corridas concurrentes,
outbox ante falla de red y POST exitoso seguido de falla del cursor.

La ronda 2 agregó tres reproducciones RED: caída de red seguida por crecimiento
de la sesión, `Operation not permitted` al leer un cierre y
`Operation not permitted` al mover un pendiente resuelto. Las tres pasaron a
GREEN y además ajustaron el contrato del resumen: una acción ya durable en el
outbox no vuelve a contarse como `sin_cierre` o `resueltas` en el reintento.

GREEN dirigido final: 43 tests OK.

Fixtures agregados: `workflow-journal.jsonl` con un único registro `{"type":"started"}`. Todos los demás casos usan archivos temporales sintéticos.

## Verificación

- `python3.13 -m unittest discover -s daemon/memoria/tests -p 'test_*.py'`:
  temporalmente bloqueada por trabajo concurrente de Fix C. Una primera corrida
  ejecutó 130 tests y tuvo cinco `IndexError` ajenos en `test_recuperar`; una
  repetición mientras cambiaba el árbol ejecutó 132 y dejó un `AttributeError`
  ajeno porque `daemon.memoria.cli` todavía no exponía `_crear_resolver_app`.
- `python3.13 -m unittest discover -s daemon/jobs/tests -p 'test_*.py'`: 156 OK
  antes de la siguiente expansión concurrente de Fix C. Una repetición posterior
  descubrió 158 tests y quedó temporalmente bloqueada por dos `AttributeError`
  ajenos en `test_jobslib`, mientras `crear_sincronizador_vault` todavía no
  estaba disponible.
- `npm test`: 57 archivos, 527 tests OK.
- `npm run build`: OK.
- `python3.13 -m py_compile ...`: OK.
- `git diff --check`: OK.

## Límites respetados

- No se inspeccionó el corpus vivo `~/.codex` / `~/.claude`.
- No se modificaron modelo, almacén, cierre, recuperación, runner, Git sync, Vault ni checkout principal.
- `output/` quedó intacto y fuera del commit.
- Sin push ni deploy.
