# Final fix A — reporte de implementación

## Estado

Implementado sobre la base `0718f87971da00b8f95ee9e2f8693f30cfc9adaa`.

Commit del núcleo y sus pruebas: `6434b77` (`fix(memoria): endurecer contrato y persistencia`).

No se modificaron colectores, `daemon/jobs/job_memoria.py`, `output/`, el Vault vivo,
el checkout principal, datos de producción, push ni deploy.

## Cambios

- La redacción cubre `Authorization`, `Proxy-Authorization`, `Cookie` y
  `Set-Cookie` como claves JSON/YAML quoted y no quoted, manteniendo los filtros
  previos para Bearer, cookies y familias de secretos.
- `Cierre.entidades` y el schema exigen exactamente `obras`, `clientes`,
  `cotizaciones` y `documentos`, cada una `list[str]`. El tipo se conserva en el
  frontmatter, el parser, la recuperación, las razones y `origen` del índice.
- Fechas de inicio, cierre y mensajes crudos se validan como timestamps ISO-8601
  reales.
- Con `--session-path`, `fuente_cruda` se deriva de la ruta efectivamente escrita
  y se verifica byte a byte. Sin session path, la referencia debe existir y estar
  confinada bajo `Conversaciones/crudo/`; cualquier falta deja un pendiente y
  falla sin devolver `ok=true`.
- El crudo incorpora frontmatter `sensibilidad: restringida`, `host`, `thread_id`,
  `fuente` y SHA-256 del cuerpo normalizado completo. Las actualizaciones de una
  sesión creciente siguen reemplazándose atómicamente.
- El guardado de cierres serializa bajo lock por ruta. Bytes idénticos son
  idempotentes; bytes distintos conservan el original, guardan el candidato con
  extensión `.conflict`, crean `conflicto_cierre` visible y fallan antes de tocar
  el índice.
- Cada actualización del índice elimina primero esa ruta de todas las claves
  antiguas. `confianza` queda acotada a `[0, 1]`.

## Evidencia TDD

### Baseline

`python3.13 -m unittest discover -s daemon/memoria/tests -v`

- 76 pruebas, `OK` sobre `0718f87` antes del cambio.

### RED

Luego de escribir las regresiones y antes de modificar producción:

`python3.13 -m unittest daemon.memoria.tests.test_modelo daemon.memoria.tests.test_almacen daemon.memoria.tests.test_cerrar daemon.memoria.tests.test_recuperar -v`

- 55 pruebas ejecutadas.
- `FAILED (failures=11, errors=27)`.
- Fallos esperados: el modelo aceptaba/listaba entidades planas, el Markdown no
  serializaba el objeto tipado, las claves de encabezados quoted filtraban
  secretos, fechas inválidas eran aceptadas, una fuente inexistente no producía
  fallo/pending, y no existían conflicto ni lock por ruta.

RED adicional para impedir que una versión conflictiva parezca un cierre
indexable por extensión:

`python3.13 -m unittest daemon.memoria.tests.test_almacen.AlmacenMemoriaTests.test_conflicto_preserva_original_candidato_y_no_contamina_indice -v`

- 1 prueba, 1 fallo esperado porque el candidato todavía se guardaba como `.md`.

### GREEN final

- Memoria: 89/89 pruebas, `OK`.
- Jobs: 135/135 pruebas, `OK`, incluyendo todas las de `job_memoria` sin tocarlo.
- Vitest: 57 archivos, 527/527 pruebas.
- `py_compile` de `modelo.py`, `almacen.py`, `cerrar.py` y `recuperar.py`: OK.
- `git diff --check`: OK.
- No se ejecutó `tsc` porque no se tocó TypeScript.

Total de pruebas ejecutadas en la pasada final: 751.

## Concerns y handoff

- Los cierres antiguos con `entidades` como lista dejan de ser válidos para
  recuperación/reindexado. Era un formato divergente del contrato aprobado. No
  se migró estado vivo por restricción explícita del brief; antes de reindexar en
  producción corresponde auditar y convertir cualquier cierre real legado.
- Las entradas antiguas del índice con `origen: "entidad"` se eliminan al
  actualizar cada ruta o reconstruir el índice. No se ejecutó ninguna de esas
  operaciones contra el Vault vivo.
- Un cierre sin `--session-path` que aún use `session://...` ahora falla de forma
  explícita; debe referenciar un archivo relativo real bajo
  `Conversaciones/crudo/` o pasar la sesión para que el comando derive la ruta.
- Los candidatos conflictivos se preservan fuera de `Conversaciones/cierres` y
  con extensión `.conflict`, por lo que recuperación/reindexado no los tratan
  como cierres aprobados. El pendiente JSON conserva rutas y hashes de ambas
  versiones para resolución humana.
