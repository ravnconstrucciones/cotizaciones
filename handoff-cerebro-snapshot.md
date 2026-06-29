# Handoff — Cerebro: snapshot de estado real (2026-06-29)

## Objetivo de la sesión
El "cerebro" (panel Orientación de App RAVN) recomendó por 6 días seguidos "mandá el
mensaje a Pueyrredón, pedí la señal" de una obra que YA estaba firmada y en obra.
Objetivo: arreglar la raíz para que el cerebro NUNCA opere con datos viejos.

## Qué se hizo (TODO commiteado, ver abajo)
1. **Diagnóstico raíz:** los 2 generadores automáticos (`job_inbox.py` → Orientación
   nocturna; `morning.sh` → "Tu Día"/1% diario) se alimentaban SOLO del texto del vault
   y se retroalimentaban de su propia salida anterior → loop de auto-engaño. Así nacieron
   2 falsas alarmas: Pueyrredón "esperando señal" (estaba Aprobada, obra abierta 16/06,
   USD 8.050) y "credenciales expuestas" (inventada al leer un doc de arquitectura).
2. **Fix raíz — fuente de verdad compartida:** nueva `snapshot_negocio(cfg, token)` en
   `daemon/jobs/jobslib.py` que lee el estado REAL y fresco de App RAVN (obras+estado,
   cotizaciones en_revision, tareas pendientes, dólar del día) con REGLA DE PRECEDENCIA
   (si el vault contradice la base, gana la base). La consumen ambos generadores:
   `job_inbox.py` por import; `morning.sh` vía nuevo `daemon/jobs/snapshot.py`.
3. **Limpieza del vault** (correcciones de contenido, ya en GitHub boveda): Orientación
   `2026-06-29.md` y `FODA/Amenazas.md` — desmentidas las 2 falsas alarmas.
4. **Credenciales:** VERIFICADO que NO hay nada expuesto (código sin service_role en
   cliente, .env no trackeado, boveda privado, sin evento real de seguridad). Falsa alarma.

## Estado de commits / push
- **Repo app `~/Documents/ravn`** (branch `home-cards`, NO main): mis 2 commits están
  LOCALES, SIN push → producción FIVE (deploya de main) intacta.
  - `9f52dde feat(cerebro): snapshot del estado real del negocio para ambos generadores`
  - `e8addb5 fix(job_inbox): inyectar estado real del pipeline de App RAVN al cerebro`
  - Solo tocan `daemon/jobs/` (jobslib.py, job_inbox.py, snapshot.py, tests/test_job_inbox.py).
    CERO archivos de `src/`.
- **Repo vault `boveda`** (`git --git-dir ~/.ravn-vault-git --work-tree ~/Obsidian/RAVN`):
  PUSHEADO (correcciones Orientación/Amenazas + morning.sh). El panel del cerebro lee de
  acá con caché 5 min.

## ⚠️ OJO — cambios sin commitear que NO son míos
En el working tree de `src/` hay trabajo en progreso de Eze de OTRA sesión (finanzas
Fase 2): `terminal/` borrado, `api/finanzas/route.ts`, `dia/`, `finanzas-screen.tsx`,
`cockpit-home.tsx`, `modulo-plata.tsx`, `api/cotizacion-dolar/` (untracked). NO TOCAR.
Hay un `handoff.md` y `handoff-finanzas-fase2.md` de esa otra sesión — NO pisarlos.

## PENDIENTE (lo que pidió Eze al final)
1. **Filtrar el snapshot de obras** — hoy trae morralla vieja: "Intendencia/Consorcio Las
   Glorietas" repetido ~5 veces y "Empresa (gastos generales)", todo con fecha seed 15/04.
   Arreglar en `jobslib.py` función `snapshot_negocio`, el `for p in presus` (líneas ~290-304):
   - Dedup por `nombre_obra` (vienen ordenadas fecha desc → primera ocurrencia = más reciente).
   - Excluir FINALIZADAS del listado de "en curso" (son historia, no pipeline).
   - Excluir la "obra" contenedora de gastos (nombre matchea "gastos generales"/"empresa (gastos").
   - Smoke test: `/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -c "from jobslib import cargar_cfg,supabase_auth,snapshot_negocio; c=cargar_cfg(); print(snapshot_negocio(c,supabase_auth(c)))"` (correr desde `~/Documents/ravn/daemon/jobs`).
2. **Decidir con Eze qué morralla/seed BORRAR de la base** (presupuestos/obras duplicados
   del 15/04). Es data real vieja; NO borrar sin su OK explícito.
3. **Bug test preexistente** (ajeno a esto): `daemon/jobs/tests/test_runner.py::
   test_error_marca_error_y_registra_evento_archivado` falla por fecha hardcodeada 2026-06-12.

## Archivos clave
- `~/Documents/ravn/daemon/jobs/jobslib.py` — `snapshot_negocio()` (la fuente de verdad).
- `~/Documents/ravn/daemon/jobs/job_inbox.py` — generador Orientación nocturna.
- `~/Documents/ravn/daemon/jobs/snapshot.py` — CLI que imprime el snapshot (lo usa morning.sh).
- `~/Obsidian/RAVN/Sistema/panel/morning.sh` — generador "Tu Día" (en repo boveda).
- Memoria: `cerebro-cruza-app-ravn.md` (en ~/.claude/.../memory).

## Cómo retomar
"Leé handoff-cerebro-snapshot.md y continuá: filtrá el snapshot de obras (pendiente 1)."
