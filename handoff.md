# HANDOFF — RAVN Cockpit · Rediseño "cards + overlay" + precios (rama `home-cards`)

> Próxima sesión: leé memoria `proyecto-centro-de-mando` + `feedback-*` y este archivo. Después "leé el handoff y continuá".

## 👉 ARRANCÁ POR (decisiones abiertas de Eze)
1. **Probar el botón Diagnóstico** en una obra (`/obras/[id]` → 🩺) con la Mac prendida → confirmar que la Mac lo genera Y lo engancha a la obra (obra_archivos). Si genera pero no adjunta, afinar el prompt en `POST /api/obras/[id]/diagnostico` o el daemon.
2. **Terminal** (`/terminal`): ¿se convierte a cards/Geist o se deja con su estética de terminal (mono)? Es la única pantalla sin convertir.
3. **Borrar presupuestos reales sobrantes**: en Proyectos → "Todas" hay tachito; quedan 8 de cliente real (Empresa caja [APROB], Lagomarsino, Consorcio, Sliding, Intendencia x5). Eze decide cuáles van.
4. **ML (Tanda 5)**: parkeado. Registrar app en developers.mercadolibre.com.ar (necesita aceptar términos de developer) → setear `ML_ACCESS_TOKEN` donde corre el daemon y se prende la columna de desempate.
5. **App RAVN está en rama `home-cards`, NO en main.** En algún momento decidir el merge a main / deploy productivo.

## CONTEXTO
- Rama **`home-cards`** (NO main). Preview: https://ravn-app-one-git-home-cards-ravnconstrucciones-3776s-projects.vercel.app/login (`ravn.construcciones@gmail.com` / `Ravn-Mando-26`).
- App: `/Users/ezeotero/Documents/ravn` (Next 15 + Supabase + Tailwind v4 + Framer Motion). Deploy Vercel auto desde la rama. Proyecto Vercel: `ravn-app-one`.
- Bot: `/Users/ezeotero/Documents/ravn-bots` (Railway). Skills en `~/.claude/skills`.
- Eze dio luz verde a TODO "por tandas, sin drama de cuota (Max 20x)". Se va tanda por tanda, verificando y pusheando cada una.

## CONTRATO DE DISEÑO (reusar)
- `src/components/ui/heroui-card.tsx` (Card rounded-[32px]). `src/components/cockpit/panel.tsx` (contexto PanelVariant "hud"|"card"). Tokens `--cdm-*`. Fuente **Geist** (`.font-geist`, LA elegida — NO Space Grotesk). `font-mono-hud` para micro-labels `//////`.

## HECHO Y PUSHEADO ✅ (esta sesión)
1. **Menú overlay (B)** `menu-overlay.tsx` — takeover full-screen, labels Geist, flecha+cyan al hover.
2. **Nav v2** `app-shell.tsx` + `nav-config.ts` — sidebar ELIMINADA (barra slim arriba: logo+tema+"Menú"+⌘K), contenido full-width. **⌘K = Spotlight** (input filtra destinos, ↑/↓+Enter). Actividad→Datos. Maestro de precios en Datos (OJO: "Maestro de precios" ≠ SISMAT, son cosas distintas — corregido).
3. **Proyectos = galería "Projects"** `proyecto-galeria.tsx` + `obras-screen.tsx` — carrusel de cards con FOTO (upload manual, cámara), card VERDE + RENTABILIDAD al cerrar (ganancia verde/pérdida roja). Migración `obras.foto_portada_path` + `POST /api/obras/[id]/portada` (bucket privado `obra-archivos`) + resumen devuelve `foto_portada_url`. Pipeline validado e2e.
4. **Orbital `/obras/[id]`** — porté "+ avance" y "Cerrar obra" (la galería es solo overview; el detalle vive en el orbital).
5. **Tanda 1 — RUIDO DE PRECIOS** `cotizador/cotizar.ts`+`tipos.ts`+`revision-screen.tsx` — divergencia con nivel "critica" (≥100% = uno ≥2x el otro) + fuentes de cada precio; mesa muestra alerta roja "verificá especificación". 57/57 tests. Skill `cotizador-maestro` suma la regla DOMINIO SISMAT anti-pileta (en `~/.claude/skills`, fuera del repo).
6. **Tanda 2 — BOT ANTI-ARCHIVADO** (repo `ravn-bots`, pusheado a main → Railway) — "¿cuánto llevo gastado en X?" ya NO se archiva. Tres capas en `advisorService.js`: (1) SYSTEM prompt distingue REGISTRAR gasto vs PREGUNTAR por plata → preguntas van a `pesado`/orden; (2) guard en `case 'gasto'`: pregunta sin monto → encola orden, no inserta; (3) los `throw 'no hay obras activas'` (gasto y avance) pasaron a `return` con aviso (no archivan). 100/100 tests. **Fix 4 (Mac):** `scripts/gastos-obra.ts` en repo `ravn` suma `presupuestos_gastos` real por obra (probado: Polder $541.586, Daromy $40.500); el prompt `orden` del daemon (`~/.ravn-cotizador/daemon.py`, fuera de git) lo invoca. Daemon REINICIADO (launchd `com.ravn.cotizador`, pid nuevo) → ya vivo.

## DIAGNÓSTICOS CLAVE (de 2 investigaciones, ya hechas)
- **Bot (Saavedra→Archivados):** la lógica está en `ravn-bots/src/advisorService.js` (clasificador Haiku, SYSTEM ~líneas 34-129, `ejecutar()` ~203). "¿Cuánto llevo gastado en Saavedra?" se clasificó como `gasto` (REGISTRAR), buscó la obra, no matcheó → `throw 'no hay obras activas'` → el `catch` de `portero.js` archiva. Archivados = cajón de lo que crashea.
- **SISMAT:** NO está viejo (sync mensual via `daemon/jobs/job_sismat.py`→`sync.py` contra admin.sismat.com.ar con la suscripción de Eze; última 10/06). El problema fue DOMINIO sin cobertura (no tiene ítems de pileta). MercadoLibre tiene API pública gratis: `GET https://api.mercadolibre.com/sites/MLA/search?q=<q>` (techo retail, no corralón).

## HECHO Y PUSHEADO ✅ (sesión 2026-06-14 tarde — modo "lanza todo")
7. **PEDIDO EN VIVO — galería Proyectos** `obras-screen.tsx` — pestañas **Activas (en curso) / Finalizadas (nueva) / Todas**; antes "Activas" mezclaba finalizadas y confundía. En "Todas" se ocultan los **borradores** (presupuestos 0 ítems y 0 gastos). 226 tests.
8. **Tanda 3 — TU DÍA** — saqué las áreas de ocio personal (Música y Arte, Vínculos, Disfrute) de `/dia`. Repo: `src/lib/tu-dia.ts` AREAS_ORDEN (quedan Negocio, Construcción, Cuerpo, Mente, Finanzas personales). Vault (repo boveda, pusheado): `Sistema/panel/build_panel.py` (EXCLUDE/ORDER) + `morning.sh` (prompt). **DECISIÓN A CONFIRMAR:** dejé Cuerpo/Mente/Finanzas personales (base operativa). Si Eze quiere "SOLO empresa", sacar esas 3 también (1 edit en cada lado). El job morning está PAUSADO (com.ravn.tudia exit 127) → el surface vivo es la web /dia.
9. **Tanda 4 — ELIMINAR COTIZACIÓN** — `DELETE /api/cotizaciones/[id]` (nulea `cotizador_lecciones.cotizacion_id` para no romper FK y preservar la lección, después borra) + botón × por fila en `cotizaciones-screen.tsx` (window.confirm + borrado optimista).
10. **Tanda 5 — MERCADOLIBRE** — ML como TERCER precio de REFERENCIA (NO toca el total): `tipos.ts` (PrecioItem.mercadolibre + Divergencia.{mercadolibre,ml_respalda}), `cotizar.ts` (desempate: a cuál se acerca ML), `mercadolibre.ts` (fetch mediana, timeout, falla en silencio, soporta `ML_ACCESS_TOKEN`), daemon CLI `scripts/cotizador/instanciar.ts` (enriquece materiales con doble precio), mesa: columna "ML ref." + línea de desempate. +10 tests. **OJO: ML cerró el search anónimo (403)** → no devuelve nada hasta registrar app en developers.mercadolibre.com.ar y setear `ML_ACCESS_TOKEN` donde corre el daemon. Sin token todo sigue igual (columna vacía).
11. **Tanda 6 — CARDS ROLLOUT (wave 1)** — convertidas al lenguaje cards/Geist (matcheando la galería): **cotizaciones, actividad, archivados, dia**. Build + typecheck + 236 tests OK.

## HECHO Y PUSHEADO ✅ (sesión 2026-06-14 noche — review en vivo con Eze)
12. **Galería Proyectos — tachito + limpieza:** botón × por card en "Todas" (DELETE /api/presupuestos/[id], borrado seguro con FKs) + ya borradas las 19 de muestra "Ezequiel Otero". Quedan 11 presupuestos (3 obras reales + 8 de cliente real). OJO: las 8 reales (Empresa gastos generales [APROB], Lagomarsino, Consorcio, Sliding, Intendencia x5) NO se borraron — Eze decide.
13. **Nav:** sacado "Nuevo presupuesto" (sigue accesible desde Rentabilidad/Propuesta). "Catálogo" → label **"SISMAT"**. "Historial" sacado del nav (redundante con Proyectos; los docs ya están en el orbital). Archivos `/historial` y `/nuevo-presupuesto` siguen existiendo, solo no están en el menú.
14. **Botón "Generar diagnóstico"** en el orbital `/obras/[id]` → `POST /api/obras/[id]/diagnostico` encola un `orden` que la Mac arma + adjunta a la obra (obra_archivos tipo=diagnostico). ⚠️ FALTA VERIFICAR end-to-end: el lado daemon (que genere + adjunte de verdad) no se probó con la Mac. Si genera pero no engancha, afinar el prompt/daemon.
15. **Tanda 6 — CARDS ROLLOUT casi completa:** convertidas cotizaciones, actividad, archivados, dia, catalogo(SISMAT), maestro-precios (wave 1+catalogo/maestro) + rentabilidad, finanzas, control-gastos, adn (wave 2). Todas: build + 236 tests OK.

## PENDIENTE
- **terminal** (`/terminal`): única pantalla sin convertir — a propósito (es una terminal, su estética mono es intencional). Eze tiene que decidir si igual la quiere en cards.
- **ML (Tanda 5):** parkeado por Eze "hasta el final". Código listo; falta registrar app en developers.mercadolibre.com.ar (el menú "Mis aplicaciones" no le aparecía → quizás falta aceptar términos de developer) y setear `ML_ACCESS_TOKEN`.
- **Receta de conversión (probada): ** tema oscuro `bg-cdm-bg`, `font-grotesk`→`font-geist`, header grande Geist + sublabel `font-mono-hud`, `.cdm-glass`→cards `rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40`, pills mono, números `tabular-nums`. Subagente Sonnet por pantalla, theme-only sin tocar lógica, después tsc+build+push.

## GOTCHAS
- iCloud rompe `.next`: ENOENT → `rm -rf .next && ln -s .next.nosync .next`.
- **Login Playwright**: la página tiene shader Three.js → `goto(waitUntil:"networkidle")` + `waitForTimeout(1500)` ANTES de fill/click (si no, submit nativo = queda en /login). Botón "Ingresar". Después NO usar waitForURL (router.push soft) → esperar el shell (`header` con botón "Menú"). Scripts en /tmp/shot-*.mjs. Dev: `bash scripts/dev.sh` (log /tmp/ravn-dev.log).
- Migraciones a remoto: `POST https://api.supabase.com/v1/projects/lryelzsstyghylphvgju/database/query` con `Authorization: Bearer $(security find-generic-password -s "Supabase CLI" -w)`.
- Commitear SOLO archivos propios con `git add <file>` (working tree con muchos untracked).
- Hay un dev server corriendo en background (localhost:3000) de esta sesión.
