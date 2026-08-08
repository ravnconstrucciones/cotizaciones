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
3. `ravn-memoria cerrar` valida el JSON contra el modelo canónico, escribe de
   forma atómica el cierre y, si se indicó `--session-path`, el crudo. Reabre el
   cierre y el índice antes de devolver `ok=true`.
4. `ravn-memoria recuperar` consulta únicamente cierres validados, prioriza
   entidades y coincidencias, incorpora vecinos derivados de Graphify cuando
   existen y limita el paquete a 8 notas y 3.000 tokens por defecto.
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
  --entidad "obra, cliente o cotización"
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

`cerrar` devuelve código `2` ante validación inválida y `3` ante un fallo de
persistencia. `estado` está reservado pero todavía no está implementado.

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
- **Recuperación vacía:** confirmar que existe un cierre estructurado, usar una
  entidad inequívoca y ejecutar `reindexar`. El crudo no se consulta por
  defecto.
- **Graphify no avanza:** revisar `.graphify-pendiente`,
  `~/.ravn-jobs/graphify-memoria.json`, el lock y el log del runner. No borrar
  el marcador ni lanzar un segundo proceso; un fallo debe quedar para reintento.
- **Crudos visibles en Graphify:** `.graphifyignore` debe contener exactamente
  una línea `Conversaciones/crudo/`.
- **Vault git:** usar el git-dir externo
  `/Users/ezeotero/.ravn-vault-git`; nunca crear `.git` dentro del Vault iCloud.

## Evidencia de esta verificación

En el worktree se verificaron 76 tests de memoria, 135 tests de jobs con Python
3.13, 527 tests de aplicación y TypeScript sin errores. También pasaron los
controles de shell, Python, plist, XML y diff. Una instalación completa bajo
`/private/tmp` fue idempotente; el segundo pase informó `changes=[]`. El smoke
creó y recuperó un cierre Codex desde el lado Claude y un cierre Claude desde
el lado Codex mediante el mismo wrapper, eliminó exactamente ambos cierres y
reindexó a cero notas.

El comando literal de jobs con el `python3` del shell no es verde: Python 3.14
carece de `certifi` y produce 11 errores de importación. La suite completa del
runtime configurado (Python 3.13) sí pasó. No se ejecutó instalación viva, no
se inició el runner, no se modificó el Vault y no hubo integración, push ni
deploy.
