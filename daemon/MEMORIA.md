# Memoria compartida Codex–Claude

**Estado verificado:** 2026-08-08

**Runtime del daemon:** Python 3.13

**Estado vivo:** implementación validada en este worktree, todavía no integrada ni instalada en el checkout principal.

## Resultado y límites

Codex y Claude usan el mismo contrato, el mismo Vault y el mismo comando
`ravn-memoria`. La memoria narrativa queda en Obsidian; App RAVN/Supabase sigue
siendo la verdad operativa. Graphify deriva relaciones desde los cierres y nunca
se edita como fuente primaria.

El sistema separa dos capas:

- `Conversaciones/crudo/`: respaldo auditable de sesiones normalizadas. Tiene
  permisos `0700`, está excluido por `.graphifyignore` y no entra en la
  recuperación habitual.
- `Conversaciones/cierres/`: cierres estructurados, redactados y validados. Son
  la fuente de `Sistema/Memoria/indices/entidades.json` y sí pueden entrar a
  Graphify.

La instalación real no debe ejecutarse desde un worktree. El wrapper generado
fija el `PYTHONPATH` al `--source`; el instalador vivo y `daemon/install.sh`
usan `/Users/ezeotero/Documents/ravn`. Primero hay que integrar allí la rama
que contiene `daemon/memoria/`.

## Arquitectura

1. `daemon/memoria/colectores.py` descubre y normaliza JSONL de Codex y Claude,
   redacta secretos y trunca sólo cargas extensas de herramientas.
2. `daemon/jobs/job_memoria.py` corre en cada tick. Respalda sesiones nuevas o
   modificadas, detecta sesiones inactivas sin cierre y publica el cursor sólo
   después de verificar escritura y evento.
3. `ravn-memoria cerrar` valida antes de tocar disco y ejecuta pull, escritura,
   stage allowlisted, commit y push bajo el lock común
   `~/.ravn-jobs/vault-git.lock`. Reabre el cierre y el índice antes de declarar
   persistencia; un fallo de red conserva el cierre local y registra un
   pendiente sin confundirlo con sincronización completa.
   Un marcador Graphify que no puede publicarse es también resultado parcial:
   el cierre y el índice conservan su evidencia, pero la CLI devuelve código 4.
4. `ravn-memoria recuperar` consulta primero metadata operativa mínima y
   read-only de App RAVN mediante la sesión autenticada de jobs. Después abre
   sólo las rutas sembradas por `Sistema/Memoria/indices/entidades.json`, y
   Graphify aporta únicamente vecinos derivados. El paquete tiene topes duros
   de 8 notas y 3.000 tokens; un índice ausente o corrupto se declara y no
   dispara un escaneo implícito del corpus.
5. Cada cierre verificado marca `.graphify-pendiente`. El runner agrupa la
   actualización incremental durante 15 minutos y usa un lock compartido con
   la reconstrucción nocturna. Un fallo conserva el marcador para reintento.
6. `daemon/memoria/instalar.py` administra tres bloques de instrucciones más
   `.graphifyignore`, instala el schema y el wrapper, crea los directorios y
   preserva contenido ajeno. La operación es atómica, idempotente y confinable
   mediante `--root`.

## Uso cotidiano

Recuperar contexto antes de un trabajo material:

```bash
ravn-memoria recuperar \
  --vault "/Users/ezeotero/Obsidian/RAVN" \
  --query "objetivo y entidades inequívocas" \
  --obra "nombre o UUID de obra" \
  --cliente "nombre exacto del cliente" \
  --cotizacion "título o UUID de cotización" \
  --documento "título o UUID de documento"
```

Cerrar una conversación. El archivo debe cumplir
`Sistema/Memoria/esquemas/cierre-conversacion.schema.json`:

```bash
ravn-memoria cerrar \
  --vault "/Users/ezeotero/Obsidian/RAVN" \
  < "/ruta/al/cierre-conversacion.json"
```

Para respaldar también una sesión y completar metadatos ausentes:

```bash
ravn-memoria cerrar \
  --vault "/Users/ezeotero/Obsidian/RAVN" \
  --session-path "/ruta/a/la/sesion.jsonl" \
  --host codex \
  --thread-id "id-de-la-sesion" \
  < "/ruta/al/cierre-conversacion.json"
```

Reconstruir el índice local sólo desde cierres válidos:

```bash
ravn-memoria reindexar --vault "/Users/ezeotero/Obsidian/RAVN"
```

`cerrar` devuelve código `0` sólo cuando verificó persistencia, índice y
marcador Graphify y sincronización Git; `2` ante validación inválida; `3` ante
un fallo de persistencia; y `4` cuando Git o el marcador Graphify quedó
pendiente, o cuando el guard de un escritor Git externo frenó antes de tocar el
Vault. La salida JSON separa
`persistido_local`, `indexado`, `graphify_marcado`, `sincronizado`, `paso` y
`pendiente`. Los flags
`--sin-app` y `--sin-sincronizacion` existen sólo para pruebas o diagnóstico
aislado, no para el flujo normal. `estado` está reservado pero todavía no está
implementado.

## Verificación e instalación

Suites del runtime real:

```bash
python3 -m unittest discover -s daemon/memoria/tests -v
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
  -m unittest discover -s daemon/jobs/tests -v
npm test
npx tsc --noEmit
zsh -n daemon/install.sh daemon/jobs/run-jobs.sh
plutil -lint daemon/launchd/com.ravn.jobs.plist
git diff --check
```

Dry-run aislado, sin crear la raíz:

```bash
python3 -m daemon.memoria.instalar \
  --dry-run \
  --root "/private/tmp/ravn-memoria-dry-run" \
  --source "/ruta/al/checkout-integrado"
```

La salida debe informar `ok=true`, `dry_run=true`, cuatro
`managed_targets`, cinco directorios, schema, wrapper y el plan de cambios. La
raíz indicada debe seguir ausente.

## Activación viva: prerequisito y secuencia

Al 2026-08-08, `/Users/ezeotero/Documents/ravn` está en `home-cards` commit
`d3dada2`, no contiene `daemon/memoria/` y es ancestro 26 commits detrás de la
implementación verificada (`aa294bd`). Además:

- `/Users/ezeotero/.local/bin/ravn-memoria` no existe;
- los tres archivos globales no contienen el bloque administrado;
- el Vault no excluye aún `Conversaciones/crudo/`;
- `~/.ravn-jobs/state.json` no registra `memoria` ni `graphify_memoria`;
- el LaunchAgent instalado conserva tres horarios diarios, no el intervalo de
  900 segundos requerido por el lote incremental.

Por lo tanto, la activación requiere primero integrar esta cadena en el
checkout principal y revisar su estado:

```bash
cd /Users/ezeotero/Documents/ravn
git status --short --branch
git rev-parse HEAD
test -d daemon/memoria
PYTHONPATH=/Users/ezeotero/Documents/ravn \
  /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
  -m daemon.memoria.instalar --dry-run
```

Sólo después de revisar ese dry-run y con aprobación explícita de Eze:

```bash
cd /Users/ezeotero/Documents/ravn
./daemon/install.sh
```

Ese script sí escribe en home/Vault, reemplaza el plist y reinicia el
LaunchAgent. No debe ejecutarse en paralelo con otro deploy o instalación.
Después de activarlo, verificar:

```bash
launchctl print "gui/$(id -u)/com.ravn.jobs"
plutil -p /Users/ezeotero/Library/LaunchAgents/com.ravn.jobs.plist
ravn-memoria reindexar --vault "/Users/ezeotero/Obsidian/RAVN"
ravn-memoria recuperar \
  --vault "/Users/ezeotero/Obsidian/RAVN" \
  --query "memoria compartida Codex Claude"
```

El plist debe mostrar `StartInterval = 900`; `state.json` debe incorporar
`memoria` y `graphify_memoria` tras una corrida exitosa. No iniciar manualmente
otro runner si launchd ya administra `com.ravn.jobs`.

## Salud y troubleshooting

- **`ravn-memoria: command not found`:** comprobar que el checkout principal ya
  contiene `daemon/memoria/`, ejecutar primero el dry-run y luego la instalación
  aprobada. Revisar que `~/.local/bin` esté en `PATH`.
- **`ModuleNotFoundError`:** abrir las dos líneas del wrapper y confirmar que
  `PYTHONPATH` apunta al checkout principal integrado y que usa Python 3.13.
- **Tests de jobs fallan al importar `certifi`:** el `python3` del shell puede
  ser Python 3.14 sin las dependencias del daemon. Usar el binario 3.13 exacto
  fijado en `run-jobs.sh`.
- **Código `2` al cerrar:** validar campos, enums y listas contra el schema. No
  editar el cierre publicado a mano.
- **Código `3` o pendiente de escritura:** conservar
  `Sistema/Memoria/pendientes-escritura/`; corregir permisos o almacenamiento y
  reintentar. No afirmar persistencia hasta obtener `ok=true`.
- **Código `4` al cerrar:** la evidencia local y el índice sí fueron
  verificados cuando la salida incluye esos campos; si el guard de Obsidian Git
  frenó antes, no hubo escritura. Revisar `paso`, `detalle` y `pendiente`,
  resolver la causa y reintentar; no presentar el cierre como compartido hasta
  obtener código 0.
- **Recuperación vacía:** confirmar que existe un cierre estructurado, usar una
  entidad inequívoca y revisar `indice_estado`. Sólo ejecutar `reindexar` como
  reparación explícita. El crudo no se consulta por defecto.
- **Graphify no avanza:** revisar `.graphify-pendiente`,
  `~/.ravn-jobs/graphify-memoria.json`, el lock y el log del runner. No borrar
  el marcador ni lanzar un segundo proceso; un fallo debe quedar para reintento.
- **Crudos visibles en Graphify:** `.graphifyignore` debe contener exactamente
  una línea `Conversaciones/crudo/`.
- **Vault git:** usar el git-dir externo
  `/Users/ezeotero/.ravn-vault-git`; nunca crear `.git` dentro del Vault iCloud.
- **Obsidian Git bloquea los jobs:** el plugin no respeta
  `~/.ravn-jobs/vault-git.lock`. Antes de habilitar los escritores, desactivar
  `autoSaveInterval`, `autoPullInterval`, `autoPushInterval` y
  `autoPullOnBoot`. El runtime lo verifica antes de escribir y falla cerrado;
  el modo Git manual puede permanecer disponible.
- **Escritores legacy:** auditoría, cerebro/Graphify, datos, dólar, FODA,
  inbox, SISMAT y top-30 usan `transaccion_vault`; sus escrituras, validación y
  Git ocurren bajo el mismo lock y nunca usan `git add -A`.

## Evidencia de esta verificación

La evidencia histórica de rondas anteriores se conserva abajo; los conteos de
la ronda vigente se registran en el reporte de Fix C y no deben reemplazarse por
afirmaciones de instalación viva. Una instalación completa bajo
`/private/tmp` fue idempotente; el segundo pase informó `changes=[]`. El smoke
creó y recuperó un cierre Codex desde el lado Claude y un cierre Claude desde
el lado Codex mediante el mismo wrapper, eliminó exactamente ambos cierres y
reindexó a cero notas.

El comando literal de jobs con el `python3` del shell no es verde: Python 3.14
carece de `certifi` y produce 11 errores de importación. La suite completa del
runtime configurado (Python 3.13) sí pasó. No se ejecutó instalación viva, no
se inició el runner, no se modificó el Vault y no hubo integración, push ni
deploy.
