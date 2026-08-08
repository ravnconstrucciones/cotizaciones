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

## Fix A — ronda de revisión 1/5

Commit: `f805a2e` (`fix(memoria): cubrir mappings y ocultar identidad cruda`).

### Hallazgos resueltos

- `Authorization`, `Proxy-Authorization`, `Cookie` y `Set-Cookie` se redactan
  también cuando aparecen en mappings YAML de secuencia, con claves quoted o no
  quoted. La sustitución termina en el salto de línea y conserva el siguiente
  item de la lista.
- Los cuatro encabezados se redactan dentro de mappings inline hasta `,` o `}`;
  no consumen campos vecinos. Los filtros previos de JSON, YAML de bloque,
  Bearer, Basic, cookies y secretos genéricos continúan cubiertos por la suite.
- La ruta cruda ya no incorpora slugs derivados de `host` ni `thread_id`. Usa
  únicamente la fecha, un host fijo `codex`/`claude` (o `host` para entradas no
  canónicas) y el SHA-256 completo de `host + NUL + thread_id`. La misma identidad
  conserva ruta determinística sin exponer el valor original.
- `marcar_pendiente` redacta recursivamente strings, claves de objetos y valores
  dentro de listas/tuplas antes de escribir JSON. Esto cubre todos los pendientes
  producidos por los archivos propios del fix sin modificar `job_memoria`.

### Evidencia RED/GREEN

RED inicial de la ronda:

`python3.13 -m unittest <5 regresiones focales> -v`

- 5 pruebas ejecutadas, 5 fallos esperados.
- Las secuencias dejaban tres valores expuestos; el mapping inline perdía un
  separador y dejaba cookies expuestas; la ruta normal seguía usando el thread;
  una identidad maliciosa aparecía completa en el nombre; y el pendiente
  persistía tres secretos anidados.

GREEN final de la ronda:

- Memoria: 93/93 pruebas, `OK`.
- Jobs: 135/135 pruebas, `OK`.
- Vitest: 57 archivos, 527/527 pruebas.
- `py_compile` del núcleo de memoria: OK.
- `git diff --check`: OK.
- Total de la pasada final: 755 pruebas.

### Compatibilidad y límites

- Los respaldos crudos ya existentes conservan su nombre anterior; no se tocó el
  Vault vivo. Una sesión nueva o modificada se archiva con la ruta hasheada. El
  cursor actual impide una migración silenciosa de sesiones sin cambios, por lo
  que cualquier limpieza de nombres legados debe ser una operación separada y
  aprobada.
- `host` y `thread_id` siguen presentes, redactados según los patrones conocidos,
  dentro del frontmatter restringido. La protección nueva evita su exposición en
  nombres de archivo y pendientes; no pretende convertir identificadores
  ordinarios en secretos.

## Fix A — ronda de revisión 2/5

Commit: `59fea30` (`fix(memoria): parsear encabezados en mappings flow`).

### Hallazgos resueltos

- Se reemplazó la acumulación de regex específicas de headers por un escáner
  determinístico y acotado a `Authorization`, `Proxy-Authorization`, `Cookie` y
  `Set-Cookie`.
- Los cuatro encabezados se redactan también cuando el mapping flow comienza con
  `[`. Se conservan claves y valores quoted/unquoted, además de los delimitadores
  originales.
- En valores flow sin comillas, una coma sólo cierra el secreto cuando introduce
  una clave YAML/JSON válida; las comas internas de `Cookie` y `Set-Cookie` quedan
  redactadas. Los campos vecinos y los cierres `}`/`]` se preservan.
- El procesamiento de headers ya redactados es idempotente y no duplica el
  corchete final de `[REDACTADO]`.

### Evidencia RED/GREEN

RED inicial de la ronda:

`python3.13 -m unittest <3 regresiones focales> -v`

- 3 métodos ejecutados, 3 fallos esperados.
- El flow `[...]` dejaba `Authorization` sin redactar y filtraba segmentos de
  cookies posteriores a comas internas; el flow `{...}` sufría la misma fuga.

RED adicional de idempotencia:

`python3.13 -m unittest <regresión de idempotencia flow> -v`

- 1 prueba, 1 fallo esperado por duplicación de `]` en cada header reprocesado.

GREEN final de la ronda:

- Memoria: 96/96 pruebas, `OK`.
- Jobs: 135/135 pruebas, `OK`.
- Vitest: 57 archivos, 527/527 pruebas.
- `py_compile` del núcleo de memoria: OK.
- `git diff --check`: OK.
- Total de la pasada final: 758 pruebas.

### Compatibilidad y límites

- El escáner interpreta como campo vecino una coma seguida por una clave válida y
  `:`. En sintaxis flow esto coincide con el límite estructural; un valor literal
  que contenga esa forma debe estar quoted para no ser ambiguo en YAML/JSON.
- No se tocaron colectores, `daemon/jobs/job_memoria.py`, el Vault/estado vivo ni
  `output/`.
