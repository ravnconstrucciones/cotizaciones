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

## Fix A — ronda de revisión 3/5

Commit: `8e39f36` (`fix(memoria): cerrar variantes estructurales de headers`).

### Hallazgos resueltos

- El sanitizador normaliza escapes Unicode JSON válidos antes de reconocer
  claves sensibles. Esto cubre claves parcial o totalmente escapadas y pares de
  sustitutos; los sustitutos aislados y escapes anulados por otra barra se
  conservan sin fabricar Unicode inválido.
- Los escalares YAML literales/folded de headers (`|`/`>`, chomping e indicador de
  indentación en ambos órdenes) se reemplazan completos y terminan en el sibling
  de igual o menor indentación. También se cubren mappings dentro de secuencias.
- Los valores quoted multilínea, con escapes de comilla o comillas simples YAML
  duplicadas, se recorren hasta su cierre. Una comilla block sin cierre falla
  cerrado hasta el siguiente sibling en vez de filtrar continuaciones.
- El lexer flow conserva nesting, comillas y claves vecinas quoted, escapadas,
  dotted o Unicode —incluidas claves Unicode que no son identificadores—. Las
  comas y dos puntos dentro de cookies no cortan el secreto si no forman un
  límite inequívoco.
- Cuando un valor flow no ofrece un límite de campo parseable, se redacta hasta
  el cierre del contenedor sensible.

### Evidencia RED/GREEN

RED inicial de la ronda:

`python3.13 -m unittest <5 regresiones estructurales> -v`

- 5 métodos ejecutados: 4 fallos esperados y 1 caso fail-closed que ya pasaba.
- Se filtraban claves JSON Unicode, cuerpos block/folded y continuaciones quoted;
  el flow no reconocía vecinos dotted/Unicode escapados.

RED adicionales:

- 1 fallo esperado al exigir una clave vecina Unicode no identificadora
  (`🛠.estado`).
- 1 fallo esperado al exigir fallo cerrado para un quote block sin cierre.

GREEN final de la ronda:

- Memoria: 102/102 pruebas, `OK`.
- Jobs: 135/135 pruebas, `OK`.
- Vitest: 57 archivos, 527/527 pruebas.
- `py_compile` del núcleo de memoria: OK.
- `git diff --check`: OK.
- Total de la pasada final: 764 pruebas.

### Compatibilidad y límites

- La normalización Unicode es semántica: las secuencias JSON `\uXXXX` válidas
  pasan a sus caracteres antes del resto del filtrado. Esto puede cambiar la
  representación textual de campos ordinarios, pero no su significado.
- Una clave flow plain que contiene `=` se trata como ambigua frente a un
  fragmento de cookie. En ese caso se prioriza no filtrar y se redacta hasta el
  siguiente límite inequívoco o el cierre; claves ambiguas deben ir quoted para
  conservarse como sibling.
- No se tocaron colectores, `daemon/jobs/job_memoria.py`, el Vault/estado vivo ni
  `output/`.

## Fix A — ronda de revisión 4/5

Commit: `931ac0b` (`fix(memoria): preservar escapes fuera de claves sensibles`).

### Hallazgo resuelto

- Se eliminó la normalización Unicode global introducida en la ronda 3. El
  sanitizador ya no decodifica ni reescribe el documento completo antes de
  clasificar una clave.
- El regex estructural conserva ahora el token quoted crudo. Sólo ese token se
  decodifica en memoria para compararlo, con `casefold`, contra
  `Authorization`, `Proxy-Authorization`, `Cookie` y `Set-Cookie`.
- Las claves double-quoted aceptan escapes JSON/YAML simples y las formas
  `\uXXXX`, `\UNNNNNNNN` y `\xNN`, incluidos pares sustitutos JSON válidos. Las
  claves YAML single-quoted respetan el doblado `''`. Un escape inválido o
  desconocido no se clasifica como header sensible.
- La representación cruda de la clave queda intacta. Una vez confirmada como
  sensible, el valor se entrega al mismo scanner estructural de quoted,
  multiline, block/folded y flow; sólo el valor pasa a `[REDACTADO]`.
- Los vecinos JSON mantienen exactamente sus bytes, incluyendo `\u000A`,
  `\u0022`, barras escapadas y pares sustitutos. La salida continúa siendo
  aceptada por `json.loads` y sus valores vecinos conservan la misma semántica.
- Se cubrieron claves escapadas parciales y totales, comparación sin distinguir
  mayúsculas, mappings flow dentro de arrays/objects y valores YAML quoted
  multiline, literales y folded. No se agregó PyYAML ni otra dependencia.

### Evidencia RED/GREEN

RED inicial, antes de modificar producción:

`python3.13 -m unittest <6 regresiones focales> -v`

- 6 métodos ejecutados, 9 fallos esperados (cuatro subcasos en la matriz JSON).
- La implementación previa reescribía todas las claves y vecinos `\uXXXX`,
  convertía `\u000A` en un salto real que invalidaba JSON, fabricaba comillas sin
  escapar desde `\u0022` y no reconocía claves YAML con `\x` o `\U`.

GREEN focal:

- Las 6 regresiones nuevas pasan.
- Modelo: 36/36 pruebas, `OK`.

GREEN final:

- Memoria: 107/107 pruebas, `OK`.
- Jobs: 135/135 pruebas, `OK`.
- Vitest: 57 archivos, 527/527 pruebas.
- `py_compile` de `modelo.py` y `test_modelo.py`: OK.
- `git diff --check`: OK.
- Total de la pasada final: 769 pruebas.

### Compatibilidad y límites

- Cambia únicamente la representación de salida que la ronda 3 había empezado
  a normalizar: ahora todo byte ajeno al valor sensible se preserva como entró.
  El significado de los headers detectados y la política fail-closed del
  scanner de valores no cambian.
- No se tocaron schema, almacén, cierre, recuperación, colectores,
  `daemon/jobs/job_memoria.py`, `output/`, el Vault/estado vivo ni producción.
  Tampoco hubo push ni deploy.

## Fix A — ronda de revisión 5/5

Commit: `f601ead` (`fix(memoria): fallar cerrado ante headers no mapeados`).

### Hallazgo resuelto

- `redactar_secretos` escanea ahora el texto original completo antes de producir
  la salida. Detecta tokens plain y quoted que contienen `Authorization`,
  `Proxy-Authorization`, `Cookie` o `Set-Cookie`, sin distinguir mayúsculas. Los
  tokens double-quoted se decodifican sólo en memoria con los escapes simples y
  `\x`, `\u` y `\U` ya soportados; el documento fuente no se reescribe.
- El mapeador estructural devuelve, además del texto redactado, los spans exactos
  de cada clave sensible que procesó. La postcondición exige que todas las
  ocurrencias encontradas en el original estén dentro de ese conjunto.
- Si queda una sola ocurrencia sin manejar, se descarta toda la salida parcial y
  se devuelve exactamente `[CONTENIDO SENSIBLE REDACTADO]`. El sentinel no
  incorpora claves, valores ni ningún otro fragmento del texto original.
- Las claves explícitas YAML block/flow y las variantes decoradas con `?`,
  anchors, aliases o tags quedan protegidas aunque el mapeador no entienda esa
  gramática: la postcondición las detecta y falla cerrada. Esto incluye claves
  explícitas escapadas con `\x`, `\u` y `\U`.
- Los mappings JSON/YAML comunes siguen usando la redacción localizada y
  conservan vecinos, delimitadores y bytes originales. También se mantuvo la
  compatibilidad de una línea mixta con `Authorization: Bearer` después de otros
  campos, sin clasificar como normal una clave precedida por decoradores YAML.

### Evidencia RED/GREEN

Baseline previo a la implementación:

`python3.13 -m unittest daemon.memoria.tests.test_modelo -v`

- Modelo: 36/36 pruebas, `OK`.

RED inicial, antes de modificar producción:

`python3.13 -m unittest <5 regresiones fail-close> -v`

- 5 métodos ejecutados; 9 fallos esperados y el control de mappings comunes ya
  pasaba.
- Se filtraban secretos en claves explícitas block/flow, claves explícitas
  escapadas y headers precedidos por anchor, alias o tag. Una ocurrencia
  estructuralmente manejada seguida por otra sin manejar tampoco activaba un
  cierre global.

RED adicional para tokens quoted con menciones internas:

`python3.13 -m unittest <regresión quoted postcondition> -v`

- 1 método, 2 fallos esperados: una mención literal y otra escapada con `\x`
  permanecían en la salida.

GREEN focal:

- Modelo: 42/42 pruebas, `OK`.

GREEN final:

- Memoria: 113/113 pruebas, `OK`.
- Jobs: 135/135 pruebas, `OK`.
- Vitest: 57 archivos, 527/527 pruebas.
- `py_compile` de `modelo.py` y `test_modelo.py`: OK.
- `git diff --check`: OK.
- Total de la pasada final: 775 pruebas.

### Compatibilidad y límites

- La política prioriza seguridad sobre precisión: una mención de cualquiera de
  los cuatro headers fuera de una clave estructural reconocida —incluso en
  prosa o dentro de un token quoted— reemplaza el contenido completo por el
  sentinel. Es una sobre-redacción deliberada para impedir falsos negativos.
- No se agregó una dependencia ni un parser YAML general. La postcondición es
  independiente de la gramática particular y cubre por defecto cualquier forma
  futura o no reconocida.
- No se tocaron schema, almacén, cierre, recuperación, colectores,
  `daemon/jobs/job_memoria.py`, `output/`, el Vault/estado vivo ni producción.
  Tampoco hubo push ni deploy.
