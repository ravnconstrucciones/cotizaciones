# Final Fix C — reporte de implementación

Fecha: 2026-08-08

Base al iniciar: `c2fa83c`

Base concurrente verificada antes del commit: `13af04f`

## Resultado

- `ravn-memoria cerrar` valida el cierre antes de invocar Git y ejecuta
  preflight, pull/rebase, persistencia verificada, stage allowlisted, commit y
  push bajo un único lock externo con modo `0600`.
- El sincronizador usa `--git-dir` externo, nunca crea `.git` dentro del Vault,
  rechaza un índice Git previamente ocupado y no usa `add -A` para los cierres
  nuevos.
- Un non-fast-forward admite un solo pull/rebase y reintento. Un conflicto
  captura SHAs y rutas, aborta el rebase sin elegir una versión y conserva el
  cierre local mediante un pendiente sanitizado.
- Timeouts, Git no disponible y fallos al registrar el pendiente no ocultan la
  persistencia ya verificada. La salida separa `persistido_local`, `indexado`,
  `sincronizado`, `paso`, `pendiente` y `detalle`.
- La CLI implementa la semántica 0/2/3/4. `--sin-sincronizacion` queda como
  bypass explícito para pruebas o diagnóstico aislado.
- Los pulls y pushes heredados de `jobslib` comparten el mismo lock. El pull
  directo de `job_cerebro` quedó delegado al sincronizador controlado.
- `ravn-memoria recuperar` resuelve primero metadata operativa mínima de App
  RAVN mediante el backend autenticado read-only ya existente en jobs. No usa
  service role ni headers de bypass y sólo ejecuta GET sobre tablas/campos
  allowlisted.
- Obras se canonicalizan a `presupuesto_id`; clientes se agrupan entre
  presupuestos y diagnósticos; cotizaciones y documentos excluyen contenido,
  desglose, relevamiento, storage paths y URLs firmadas.
- Las coincidencias son UUID o nombre normalizado exacto. Identidades distintas
  producen `ambigua`; auth/red produce `no_disponible`, nunca una ausencia falsa.
- El orden de autoridad es App RAVN operativa, Vault histórico y Graphify
  derivado. Cada nota informa ruta, fecha, host/thread, secciones, razones
  tipadas, coincidencia y autoridad.
- La recuperación abre únicamente rutas sembradas por el índice del Vault. Un
  índice ausente/corrupto degrada de forma explícita sin escaneo global; el
  paquete respeta topes duros de 8 notas y 3000 tokens contando el JSON final.
- Las referencias de App aceptan sólo `app://` o rutas web allowlisted y no
  reexponen paths locales.
- Se actualizaron las instrucciones administradas y la documentación operativa
  con autoridad, estados parciales y uso de flags tipados.

## Evidencia TDD

Los escenarios RED cubrieron: orden transaccional Git, allowlist, índice
preocupado, non-fast-forward, conflicto sin destrucción, idempotencia, fallo de
pull, timeout, fallo al registrar pendiente, código 4, backend read-only,
canonicalización, ambigüedad, indisponibilidad, input hostil, App primero,
índice sin scan, límites duros, CLI legacy/tipada y exclusión de paths locales.

GREEN final:

- `python3 -m unittest discover -s daemon/memoria/tests -v`: 138 OK.
- `python3.13 -m unittest discover -s daemon/jobs/tests -v`: 159 OK.
- `npm test`: 57 archivos, 527 tests OK.
- `npm run build`: OK, incluida validación de tipos.
- `python3 -m py_compile daemon/memoria/*.py daemon/jobs/jobslib.py daemon/jobs/job_cerebro.py`: OK.
- `git diff --check`: OK.

## Límites respetados

- No se escribió el Vault vivo ni el checkout principal.
- No se abrió ningún secreto ni se hizo una consulta real a App RAVN.
- No hubo red, push, deploy ni instalación viva.
- No se modificaron `daemon/jobs/job_memoria.py`,
  `daemon/memoria/colectores.py` ni `output/`.
- Los repositorios Git de prueba fueron locales y temporales.
- El resultado está validado en este worktree; no se declara integrado,
  instalado ni desplegado en producción.

## Ronda correctiva posterior — base `20e016d`

La revisión final agregó pruebas rojas específicas y cerró estos huecos:

- Un pull inicial fallido puede persistir y commitear localmente; el segundo
  intento sincroniza sin quedar bloqueado por cambios tracked. Un commit fallido
  no deja stage real y también es reintentable.
- Los conflictos informan el SHA local anterior al rebase, el SHA remoto y las
  rutas; sólo se aborta un rebase iniciado por la invocación actual. El puntero
  `.git` regular al git-dir externo configurado es válido.
- Los ocho escritores reales del Vault migraron a `transaccion_vault`, con
  validación previa al commit y allowlists propias. `job_inbox` usa ownership
  dinámico fail-close y exige un Vault limpio; ningún escritor operativo llama
  `push_vault`, `pull_vault` ni `git add -A`.
- El sincronizador común —CLI y jobs— detecta Obsidian Git automático antes de escribir y falla cerrado,
  porque ese plugin no coopera con `vault-git.lock`. No se cambió su
  configuración viva: desactivarla es requisito explícito de activación.
- Graphify se lee desde `graphify-out/graph.json`. Sin entidad explícita, la
  recuperación construye como máximo 32 candidatos relevantes antes de abrir
  cierres; con identidad explícita no rellena presupuesto con otra obra.
- App RAVN pagina por `id.asc` hasta 5.000 filas, distingue truncamiento de
  ausencia y convierte configuración/autenticación incompleta en
  `no_disponible`. La entrada del usuario nunca controla tabla, campos ni URL.
- Un fallo aislado al crear `.graphify-pendiente` conserva cierre e índice
  verificados, registra pendiente cuando puede y devuelve código 4.

Evidencia GREEN de esta ronda:

- `python3 -m unittest discover -s daemon/memoria/tests -v`: 150 OK.
- Python 3.13 `-m unittest discover -s daemon/jobs/tests -v`: 163 OK.
- `npm test`: 57 archivos, 527 tests OK.
- `npm run build`: exit 0.
- `py_compile` de memoria, jobslib y los ocho escritores: OK.
- `git diff --check`: OK.

Continúan respetados los límites anteriores: sin Vault vivo, App real, red,
checkout principal, push, deploy ni instalación. `output/` quedó intacto.

La revisión especializada posterior detectó y se corrigieron antes del cierre:
el guard faltante en la CLI, la tupla/contador de `job_top30`, la mezcla de
tipos homónimos en recuperación y el orden antiguo→nuevo previo al cap de 32.
