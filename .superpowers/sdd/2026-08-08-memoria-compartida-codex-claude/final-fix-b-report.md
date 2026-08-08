# Final fix B — reporte de implementación

Fecha: 2026-08-08

Base: `dd13853`

## Resultado

- Discovery omite journals, workflows y subagents conocidos antes de leer JSONL.
- `leer_sesion` carga cada JSONL una sola vez y reutiliza los mismos registros para detectar host y normalizar.
- Claude conserva únicamente bloques `text` como mensaje visible, descarta `thinking` y convierte `tool_use` en un mensaje acotado con nombre y SHA-256; `tool_result` conserva el límite existente.
- El cursor v2 guarda firma `(mtime_ns, size)`, host, thread, estado y error. Las entradas v1 descubiertas se verifican nuevamente y las entradas viejas ausentes no contaminan el formato v2.
- Las firmas v2 sin cambios no vuelven a abrir ni normalizar JSONL, pero siguen reevaluando inactividad desde la metadata del cursor.
- Una fuente desconocida queda registrada como omitida/error sin abortar fuentes sanas ni repetir el evento mientras su firma no cambie.
- Un cierre tardío mueve de forma bloqueada y atómica sus pendientes `cierre_estructurado_faltante` a `Sistema/Memoria/pendientes-resueltos/`, agrega `resuelto_at` y no toca otras operaciones.
- El evento resumido informa respaldadas, sin cierre, omitidas y errores, con identidad estable para reintentos.

## Evidencia TDD

RED inicial: 26 tests dirigidos, con 5 fallos y 2 errores esperados por las conductas todavía ausentes. Un ciclo RED adicional reprodujo un `OSError` de lectura aislado.

GREEN dirigido: 27 tests OK.

Fixtures agregados: `workflow-journal.jsonl` con un único registro `{"type":"started"}`. Todos los demás casos usan archivos temporales sintéticos.

## Verificación

- `python3.13 -m unittest discover -s daemon/memoria/tests -p 'test_*.py'`: 116 OK.
- `python3.13 -m unittest discover -s daemon/jobs/tests -p 'test_*.py'`: 140 OK.
- `npm test`: 57 archivos, 527 tests OK.
- `npm run build`: OK; compiló con las advertencias preexistentes de Supabase en Edge Runtime.
- `python3.13 -m py_compile ...`: OK.
- `git diff --check`: OK.

## Límites respetados

- No se inspeccionó el corpus vivo `~/.codex` / `~/.claude`.
- No se modificaron modelo, almacén, cierre, recuperación, runner, Git sync, Vault ni checkout principal.
- `output/` quedó intacto y fuera del commit.
- Sin push ni deploy.
