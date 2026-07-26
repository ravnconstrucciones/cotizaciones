# 04 — Inventario de APIs (App RAVN)

> **Naturaleza:** HECHOS
> **Última verificación:** 2026-07-25
> **Fuente:** src/app/api/**/route.ts, src/middleware.ts

**57 rutas** (`find src/app/api -name "route.ts"` = 57: las 54 de 2026-07-23 + `cotizaciones/[id]/mensajes`, `cotizaciones/[id]/documento-borrador`, `cotizaciones/[id]/archivos/[archivoId]`, mesa conversacional 2026-07-25).

**Auth global:** `src/middleware.ts` exige sesión Supabase para TODO (incluye `/api/*`); única excepción del matcher: `/api/auto-login` (que tiene su propia doble guardia: `PREVIEW_AUTO_LOGIN=true` + `VERCEL_ENV !== "production"`, si no → 404). Todos los handlers usan `createSupabaseAdminClient()` (service_role, bypass RLS) detrás de ese middleware.

**Bypass de agente local (2026-07-25, spec mesa conversacional):** antes de la guardia de sesión, el middleware chequea el header `x-ravn-agente`. Si coincide con `process.env.RAVN_AGENTE_SECRET` **y el path empieza con `/api/`**, deja pasar sin exigir cookie de sesión — es el mecanismo que usa `daemon/puente-cotizador/` (Fable/Codex corriendo local en la Mac de Eze) para leer/escribir la mesa como si fuera un usuario logueado. Sin `RAVN_AGENTE_SECRET` configurado en el entorno, el bypass no existe (no hay fallback ni valor default). Acotado a `/api/*`: nunca abre páginas ni el resto del matcher.

---

## Tabla resumen

### Obras y archivos de obra

| Ruta | Métodos | Propósito |
|---|---|---|
| `/api/obras` | POST | Alta de obra liviana (presupuesto ya aprobado + fila en obras) |
| `/api/obras/[id]/diagnostico` | POST | Encola trabajo `orden` para que el daemon genere el diagnóstico |
| `/api/obras/[id]/finalizar` | POST | Cerrar obra desde galería ([id] = presupuesto_id) |
| `/api/obras/[id]/plan/importar` | POST | Importa plan de compra desde la cotización vinculada |
| `/api/obras/[id]/portada` | POST | Subir/cambiar foto de portada de la obra |
| `/api/obra-archivos` | GET, DELETE | Carpeta de la obra: listar con signed URLs + borrar archivo |

### Cashflow

| Ruta | Métodos | Propósito |
|---|---|---|
| `/api/cashflow/extract-comprobante` | POST | IA (Gemini/Claude) extrae monto/fecha/concepto de foto o audio |
| `/api/cashflow/marcar-item` | POST | Marca ítem proyectado como real (monto_real + fecha_real) |
| `/api/cashflow/obra/[obra_id]` | GET | Libreta completa de la obra: ítems, saldo, serie, anulados |
| `/api/cashflow/obra/[obra_id]/cierre` | GET | Último cierre guardado de la obra |
| `/api/cashflow/obra/[obra_id]/cobranza-cerrar` | POST | Fija total a cobrar (de la propuesta) y activa modo cobranza |
| `/api/cashflow/obra/[obra_id]/finalizar` | POST | Cierre de obra desde cashflow (misma lógica que /obras/[id]/finalizar) |
| `/api/cashflow/planificar-confirmar` | POST | Aprueba presupuesto + crea obra + siembra ítems del plan |
| `/api/cashflow/planificar-preview` | GET | Preview del plan (ingresos 30/30/20 + egresos por ítem) |
| `/api/cashflow/registrar-movimiento` | POST | Registro rápido de ingreso/egreso en una obra |

### Cotizaciones (mesa de revisión)

| Ruta | Métodos | Propósito |
|---|---|---|
| `/api/cotizaciones` | GET, POST | Galería de tarjetas (con portadas firmadas) / crear cotización |
| `/api/cotizaciones/[id]` | GET, PATCH, DELETE | Detalle joineado / vincular presupuesto / borrado físico |
| `/api/cotizaciones/[id]/aprobar` | POST | OK de Eze → estado aprobada + loop de oro (crea proyecto) |
| `/api/cotizaciones/[id]/rechazar` | POST | Rechazo con motivo → lección en cotizador_lecciones |
| `/api/cotizaciones/[id]/emitir` | POST | Aprobada → documento_emitido con datos del documento |
| `/api/cotizaciones/[id]/estado` | PATCH | Reclasificación libre entre pestañas (con efectos reales) |
| `/api/cotizaciones/[id]/desglose` | PATCH | Hoja viva: editar ítem/manual y re-correr el motor server-side |
| `/api/cotizaciones/[id]/conversacion` | GET, POST | Hilo cronológico / mensaje de Eze (CORREGIR o consulta) — flujo daemon legacy, intacto |
| `/api/cotizaciones/[id]/mensajes` | GET, POST | **Nueva 2026-07-25.** Hilo de la mesa conversacional: mezcla legacy (trabajos_cola+eventos) con `cotizacion_mensajes` (Eze/Fable/Codex/sistema) + `motor_conectado` por latido |
| `/api/cotizaciones/[id]/documento-borrador` | PATCH | **Nueva 2026-07-25.** Merge del borrador vivo de propuesta sobre `revision.documento_borrador`; solo estados de mesa |
| `/api/cotizaciones/[id]/archivos` | GET, POST | Propuestas/fotos adjuntas (listar firmadas / subir; `tipo=foto` → carpeta `fotos/`) |
| `/api/cotizaciones/[id]/archivos/[archivoId]` | PATCH | **Nueva 2026-07-25.** Toggle `en_propuesta` de una foto (pestaña Fotos de la mesa) |
| `/api/cotizaciones/[id]/crops` | GET, POST, DELETE | Recortes del render por ítem |
| `/api/cotizaciones/[id]/portada` | POST | Foto de portada de la cotización |

### Cotizador (panel exploratorio /cotizar)

| Ruta | Métodos | Propósito |
|---|---|---|
| `/api/cotizar/recetas` | GET, POST | Recetario / alta de receta candidata validada (ley 1) |
| `/api/cotizar/takeoff` | POST | Receta + parámetros → desglose vivo (NO crea cotización) |
| `/api/cotizar/precios/refresh` | POST | Refresca precios retail vivos (VTEX) al cache fechado |

### Dinero, cuentas y negocio

| Ruta | Métodos | Propósito |
|---|---|---|
| `/api/cuentas` | GET | Saldos derivados por cuenta (motor + reconciliación contra ledger) |
| `/api/cuentas/reserva-obra` | POST | Crea/reactiva cuenta espejo "MP · Reserva Obra" + transferencia |
| `/api/dinero` | GET | Tablero /dinero: bolsillos, financiamientos, borradores, arqueos |
| `/api/dinero/espejo` | POST | Re-sincroniza una fila al ledger (movimientos_plata) |
| `/api/pendientes-cuenta` | GET, POST, DELETE | Movimientos sin cuenta: listar / asignar cuenta / eliminar |
| `/api/negocio/config` | GET, POST | Config del negocio + resumen de retiros del socio |
| `/api/negocio/retiro` | POST | Registra retiro o aporte de socio |
| `/api/papelera/[id]/restaurar` | POST | Restaura fila archivada de la papelera universal |
| `/api/gastos-empresa` | GET | Calendario mensual de gastos de empresa |

### Finanzas personales

| Ruta | Métodos | Propósito |
|---|---|---|
| `/api/finanzas` | GET, POST, DELETE | Motor alcancía completo / cargar gasto variable / borrar gasto |
| `/api/finanzas/config` | GET, POST | Tope mensual + día de cierre de tarjeta (fila id=1) |
| `/api/finanzas/fijos` | GET, POST, DELETE | ABM de costos fijos |
| `/api/finanzas/presupuesto-hoy` | GET | Versión lean para el bot: "¿cuánto puedo gastar hoy?" |

### Dólar

| Ruta | Métodos | Propósito |
|---|---|---|
| `/api/cotizacion-dolar` | GET | Blue (dolarapi.com) para el tablero de salud |
| `/api/dolar` | GET | Tablero completo de casas (DolarAPI → Bluelytics → CriptoYa) |
| `/api/api-uso` | GET | Gasto de API Anthropic (Admin API + tabla api_uso) para el KPI "API bot" |

### Presupuestos y proyectos

| Ruta | Métodos | Propósito |
|---|---|---|
| `/api/presupuestos/[id]` | DELETE | Borrado físico de presupuesto en orden seguro (FKs) |
| `/api/proyectos` | GET | Todos los presupuestos con conteo de items y gastos |

### Trabajos, eventos y varios

| Ruta | Métodos | Propósito |
|---|---|---|
| `/api/trabajos` | GET, POST | Barra de comando → trabajos_cola + evento espejo / últimos 10 |
| `/api/adn/sin-clasificar` | GET | Imágenes de WhatsApp archivadas sin destino (vista ADN) |
| `/api/archivados/resolver` | POST | Resuelve evento archivado: insert de destino + marca resuelto |
| `/api/referencias` | GET | Tabla referencias con imágenes firmadas |
| `/api/proveedores` | GET | Agenda de proveedores activos con flyer firmado |
| `/api/grafo` | GET | Sirve grafo-app.json del bucket `grafo` (graphify) |
| `/api/auto-login` | GET | Auto-login SOLO para previews de Vercel (404 en prod) |

---

## Detalle por dominio

### Obras

**POST /api/obras** — alta de obra liviana desde el cockpit.
- Body: `{ nombre_obra (req), nombre_cliente?, instancia_inicial? }`.
- Inserta `presupuestos` (aprobado=true, estado en_curso), asegura fila en `obras` (defensivo al trigger), opcional primer avance en `obra_avances`.
- Devuelve `{ ok, obra_id, presupuesto_id }`. Errores: 400 sin nombre, 500 DB.

**POST /api/obras/[id]/diagnostico** — [id] = presupuesto_id. Body: `{ detalle? }`. Valida que exista en `presupuestos`, inserta trabajo `orden` en `trabajos_cola` + evento en `eventos` (best-effort). Devuelve `{ ok, trabajo_id }`. 404 si no existe la obra.

**POST /api/obras/[id]/finalizar** — [id] = presupuesto_id; resuelve `obras.id` y delega a `finalizarObra()` (lib compartida con cashflow). Devuelve `{ ok, cierre, lecciones_contraste }`. Tablas (vía lib): obras, cashflow_cierres_obra, cotizador_lecciones. 404 obra no encontrada.

**POST /api/obras/[id]/plan/importar** — busca última cotización aprobada/emitida con ese `presupuesto_id` y delega a `importarPlanDesdeCotizacion()`. Sin cotización → `{ insertados: 0, motivo: "sin_cotizacion" }` (200).

**POST /api/obras/[id]/portada** — multipart `file` (máx 8 MB, JPG/PNG/WEBP/HEIC). Sube a bucket `obra-archivos` (`portadas/{obraId}/…`), actualiza `obras.foto_portada_path`, borra la anterior, devuelve signed URL (30 min). Errores: 400/413/415/404/500. Rollback del archivo si falla el update.

**GET /api/obra-archivos?presupuesto_id=** — lista `obra_archivos` + signed URLs (1 h) + thumbs (transform 360px, solo tipo=foto). **DELETE** body `{ id }`: borra binario del bucket y la fila. 404 si no existe.

### Cashflow

**POST /api/cashflow/extract-comprobante** — multipart `file` (imagen o audio, máx 15 MB). Imagen → Gemini o Claude según `CASHFLOW_EXTRACT_PROVIDER` (HEIC solo Gemini); audio → solo Gemini. Devuelve `{ monto_ars, fecha, concepto, tipo, transcripcion? }`. No toca Supabase. Errores: 400 body/tipo, 422 HEIC sin Gemini, 501 falta API key, 500 provider.

**POST /api/cashflow/marcar-item** — body `{ id, usar_monto_proyectado?, monto_real?, fecha_real? }`. Update de `cashflow_items` (monto_real, fecha_real, estado) + `sincronizarEspejo` best-effort. Errores: 400 inválidos, 404 ítem, 500.

**GET /api/cashflow/obra/[obra_id]** — arma la libreta: `obras` (join `presupuestos`), `cashflow_cierres_obra` (último), `cashflow_items` (vivos + anulados). Devuelve ítems, saldo_caja, totales, referencia de propuesta, serie del gráfico, `ultimo_cierre`. Cache privado 15 s.

**GET /api/cashflow/obra/[obra_id]/cierre** — último registro de `cashflow_cierres_obra` → `{ cierre: { id, created_at, payload } | null }`.

**POST /api/cashflow/obra/[obra_id]/cobranza-cerrar** — sin body útil. Lee `obras` + `presupuestos.propuesta_comercial_pref`, calcula importe ARS y setea `obras.cobranza_cerrada_at` + `monto_total_a_cobrar_ars`. Errores: 404, 409 ya cerrada, 400 libreta empresa o sin importe.

**POST /api/cashflow/obra/[obra_id]/finalizar** — delega a `finalizarObra()` (idéntico a /obras/[id]/finalizar pero con obra_id directo).

**POST /api/cashflow/planificar-confirmar** — body `{ presupuesto_id, filas: [{tipo, categoria, descripcion, monto_proyectado, fecha_proyectada}] }`. Valida categorías/montos/fechas, valida suma de ingresos vs total de propuesta (tolerancia 0,2 %), crea obra si no existe, inserta `cashflow_items` (nota PLAN_APROBACION, sin cuenta_id a propósito) y marca `presupuestos.presupuesto_aprobado=true`. Errores: 400 varios, 404, 409 ya aprobado.

**GET /api/cashflow/planificar-preview?presupuesto_id=** — propone plan: ingresos 30/30/20 a 30/60/90 días + un egreso por línea de `presupuestos_items` (join `catalogo_recetas`). 409 si ya aprobado.

**POST /api/cashflow/registrar-movimiento** — body `{ obra_id, quick_tipo (cobre_cliente|pago_proveedor|compra_material|pago_mano_obra|otro), monto_real, fecha, descripcion?, cuenta_id? }`. Inserta `cashflow_items` (nota REGISTRO_RAPIDO) + espejo. Errores: 400, 404 obra.

### Cotizaciones

Todas leen/escriben `cotizaciones`; los cambios de estado usan guard de carrera (`.eq("estado", …)` + `.select()`; 0 filas → 409).

**GET /api/cotizaciones[?estado=]** — lista (máx 200) + portadas firmadas (bucket `obra-archivos`, 30 min) + `archivos_count` desde `cotizacion_archivos`. **POST** — body `{ titulo (req), zona?, estado? (borrador|en_revision), receta_id?, trabajo_id?, presupuesto_id?, ficha?, desglose?, revision?, total_min?, total_max? }` → 201 `{ id }`. (El daemon NO usa esta ruta: inserta por REST directo.)

**GET /api/cotizaciones/[id]** — `SELECT *` + joins `recetas` y `presupuestos`. **PATCH** — body `{ presupuesto_id: uuid | null }` vincula/desvincula obra (cualquier estado). **DELETE** — nulea `cotizador_lecciones.cotizacion_id` (preserva lecciones) y borra la fila. 404 si no existe.

**POST /api/cotizaciones/[id]/aprobar** — body `{ importe_final? }`. `aprobar()` valida transición **desde `borrador` o `en_revision`** (2026-07-25: la mesa conversacional también opera en borrador, `ESTADOS_MESA` en `src/lib/cotizador/estado.ts`); si no tiene `presupuesto_id`, `crearObraDesdeCotizacion()` crea presupuesto + obra (loop de oro, post-estado, no bloquea el OK). Devuelve `{ ok, estado, presupuesto_id, obra_id }`. 409 transición/carrera.

**POST /api/cotizaciones/[id]/rechazar** — body `{ motivo? }`. Válido desde `borrador` o `en_revision` (mismo `ESTADOS_MESA`, 2026-07-25). Estado → rechazada + inserta lección tipo `rechazo` en `cotizador_lecciones` (best-effort).

**POST /api/cotizaciones/[id]/emitir** — body `{ cliente, lugar, forma_pago, plazo, notas }` (strings o arrays de líneas). Solo desde aprobada → documento_emitido.

**PATCH /api/cotizaciones/[id]/estado** — body `{ estado (en_revision|aprobada|rechazada), motivo?, importe_final? }`. Reclasificación libre; aprobada dispara loop de oro si no hay obra, rechazada con motivo inserta lección. documento_emitido queda fuera.

**PATCH /api/cotizaciones/[id]/desglose** — body con EXACTAMENTE una operación: `ajuste {nombre, precio?, cantidad?, activo?}` | `manual {nombre, rubro, tipo, unidad, cantidad, precio?, notas?}` | `quitar_manual`. Funde con `desglose.ajustes`, re-corre `cotizar()` server-side, persiste desglose/revision/totales. Precio corregido por Eze → upsert a `precios_items` (origen `eze`); precio limpiado → delete. Solo `borrador`/`en_revision` (2026-07-25, `ESTADOS_MESA`; antes solo en_revision) — 409 fuera de la mesa. Tablas: cotizaciones, recetas, precios_items.

**GET /api/cotizaciones/[id]/conversacion** — hilo cronológico desde `trabajos_cola` (origen + derivados por contexto) y `eventos` (destino/contenido → id). **POST** body `{ mensaje }` (máx 4000): en_revision → mecanismo CORREGIR (rechaza + lección + re-encola trabajo `cotizar` con `contexto.correccion`); otro estado → encola trabajo `consulta`. Siempre registra evento. Tablas: cotizaciones, trabajos_cola, eventos, cotizador_lecciones. **Ruta hermana de `/mensajes`, queda intacta para el flujo daemon** (`trabajos_cola`); no la reemplaza.

**GET /api/cotizaciones/[id]/mensajes** — hilo de la MESA CONVERSACIONAL (spec 2026-07-25): mezcla el hilo legacy (`construirHilo` sobre trabajos_cola+eventos filtrados por `contexto->>cotizacion_id`/`cotizacion_anterior` o `trabajo_id`) con `cotizacion_mensajes` (`mensajesDeTabla`), intercalados por fecha (`mezclarHilos`, `src/lib/cotizador/conversacion.ts`). Devuelve además `motor_conectado`: `true` si `puente_latidos` (id `puente-cotizador`) late hace menos de 90 s. **POST** body `{ texto?, adjuntos? }` (`adjuntos: [{archivo_id, storage_path, titulo?}]`; al menos uno de los dos, texto máx 4000): con texto inserta autor `eze` (meta `tipo: charla`, lo responde el puente); solo adjuntos inserta autor `sistema` (meta `tipo: adjuntos`, avisa al puente por el mismo canal Realtime). 404 si la cotización no existe.

**PATCH /api/cotizaciones/[id]/documento-borrador** — body `{ documento: Partial<DatosDocumento> }` (`cliente`, `lugar`, `forma_pago[]`, `plazo[]`, `notas[]`). Mergea campo a campo sobre `revision.documento_borrador` (lo no enviado se conserva). Solo estados `borrador`/`en_revision` (409 fuera de la mesa). Guard de carrera: el UPDATE lleva `.in("estado", ["borrador","en_revision"])` — 0 filas ⇒ 409 "recargá la mesa" en vez de éxito fantasma. Es donde Fable va redactando la propuesta viva turno a turno; emitir sigue siendo acción explícita de Eze (`/emitir`).

**GET /api/cotizaciones/[id]/archivos** — lista `cotizacion_archivos` (incl. `en_propuesta`, `storage_path`) con signed URLs (1 h). **POST** multipart `file` (máx 25 MB) + `tipo?` (propuesta|diagnostico|**foto**) + `titulo?`; sube a `propuestas/…`, `diagnosticos/…` o **`fotos/…`** (tipo `foto`, drag&drop de la mesa) del bucket `obra-archivos` con rollback si falla el insert; devuelve `storage_path` en la respuesta.

**PATCH /api/cotizaciones/[id]/archivos/[archivoId]** — body `{ en_propuesta: boolean }` (requerido). Toggle sobre `cotizacion_archivos.en_propuesta`, filtrado por `id`+`cotizacion_id`. 404 si no matchea. Sin guard de carrera (el front deshabilita el toggle mientras el PATCH está en vuelo y lo revierte si no persiste).

**GET /api/cotizaciones/[id]/crops** — `{ render_url (portada firmada), crops: {item→url} }` de filas tipo `crop_item`. **POST** multipart `file` (máx 8 MB, JPG/PNG/WEBP) + `item_nombre`: reemplaza el recorte previo del ítem. **DELETE** body `{ item_nombre }`: borra fila + archivo.

**POST /api/cotizaciones/[id]/portada** — igual que la portada de obra pero sobre `cotizaciones.foto_portada_path` (path `portadas-cotizacion/…`).

### Cotizador (panel /cotizar)

**GET /api/cotizar/recetas** — lista `recetas` (campos livianos). **POST** — alta de receta candidata: `validarRecetaCandidata(body)` (400 con `violaciones` si viola ley 1), insert con estado `candidata`; 409 si el nombre ya existe (código 23505).

**POST /api/cotizar/takeoff** — body `{ receta (nombre), parametros? }`. Lee `recetas` + `precios_items` de sus ítems, corre `cotizar()` y devuelve el cálculo + `revisado` por ítem. NO crea fila en cotizaciones. 400 `faltan_parametros` con lista.

**POST /api/cotizar/precios/refresh** — body `{ receta (nombre) }`. `refrescarRetail()` (fetches VTEX, `maxDuration=60`) → upsert a `precios_items` (onConflict item,origen). Devuelve `{ actualizados, sin_precio }`.

### Dinero / cuentas / negocio

**GET /api/cuentas** — Promise.all de 8 fuentes: `cuentas`, `presupuestos_gastos`, `cashflow_items`, `retiros_socio`, `gastos_personales`, `gastos_empresa`, `transferencias`, `cuenta_ajustes` + vista `dinero_saldos_bolsillos`. Motor puro `saldosPorCuenta()` en dos pasadas: si el ledger conoce la cuenta, un ajuste virtual delta hace que mande el ledger. Cache privado 15 s.

**POST /api/cuentas/reserva-obra** — body `{ obra_id (uuid), monto? }`. Crea/reactiva la cuenta de reserva (procedencia obra, índice único por obra_id) y si hay monto inserta `transferencias` Mercado Pago → reserva + espejo. Tablas: obras, presupuestos, cuentas, transferencias. Errores: 400, 404 obra, 500 (incl. "No encontré la cuenta Mercado Pago").

**GET /api/dinero** — vista `dinero_saldos_bolsillos`, `financiamientos` (filtra legacy dueño personal), `movimientos_plata` estado=borrador, vista `dinero_costos_obra`, `cuentas` (para marcar tarjetas), `cuenta_ajustes` (arqueos, máx 200), nombres desde `presupuestos`. Cache privado 15 s.

**POST /api/dinero/espejo** — body `{ tabla (una de: presupuestos_gastos, cashflow_items, gastos_empresa, gastos_personales, retiros_socio, transferencias), id (uuid) }` → `sincronizarEspejo()`. Es el mecanismo manual de la REGLA DURA del ledger.

**GET /api/pendientes-cuenta** — junta movimientos con `cuenta_id null` posteriores a la foto (2026-07-02) de: presupuestos_gastos, cashflow_items (excluye espejados por gasto), gastos_personales, gastos_empresa, retiros_socio (excluye `ya_en_foto`). **POST** `{ origen, id, cuenta_id }` — valida cuenta activa y asigna (guard `.is("cuenta_id", null)`, 409 si ya tenía) + espejo. **DELETE** `{ origen, id }` — cashflow soft-delete (`deleted_at`); gasto_obra arrastra su espejo de libreta; resto delete físico; siempre solo si sigue sin cuenta.

**GET /api/negocio/config** — `negocio_config` (fila id=1) + últimos 120 `retiros_socio` con agregados mes/total (USD aparte, nunca sumados a ARS). **POST** — patch numérico whitelisted (patrimonio, sueldo objetivo, fijos, comprometido, colchón) + fecha_patrimonio + notas; update de la fila id=1.

**POST /api/negocio/retiro** — body `{ monto_ars (req >0), tipo? (retiro|aporte), concepto?, fecha?, cuenta_id? }`. Insert en `retiros_socio` + espejo.

**POST /api/papelera/[id]/restaurar** — lee `papelera_registros` (no restaurado), solo tabla `presupuestos_gastos` (whitelist), upsert de la fila original, des-anula el `cashflow_items` vinculado (`deleted_at=null`), marca `restaurado_at`, re-espeja ambos. Errores: 404, 400 tabla no permitida.

**GET /api/gastos-empresa?mes=YYYY-MM** — filas de `gastos_empresa` del mes (default mes actual AR) → `armarMesEmpresa()` (día por día + categorías).

### Finanzas personales

**GET /api/finanzas** — `finanzas_personal_config` (id=1) + `finanzas_fijos` + `gastos_personales` del ciclo de tarjeta (excluye fijo_id y extraordinarios; pagos de fijos aparte para marcar "pagado") → motor `calcularFinanzas()`. **POST** — body `{ concepto (req), monto (req), categoria?, fecha?, fijo_id?, extraordinario? }`: insert en `gastos_personales` (fecha default hoy BA) + espejo. **DELETE** — `{ id }`: delete físico + espejo.

**GET /api/finanzas/config** — tope + día de cierre + notas (defaults 2.800.000 / 25). **POST** — valida tope ≥ 0 y dia_cierre 1..28; upsert fila id=1.

**GET /api/finanzas/fijos** — lista ordenada por (dueno, orden). **POST** — con `id` = update parcial, sin `id` = insert; dueno ∈ {personal, empresa}, monto ≥ 0. **DELETE** — `{ id }`.

**GET /api/finanzas/presupuesto-hoy** — versión lean para el bot de WhatsApp: mismas tablas que /api/finanzas, devuelve `{ disponible_hoy, presupuesto_hoy, gastado_hoy, ahorrado, disponible_ciclo, asignacion_diaria, semaforo, frase }`.

### Dólar

**GET /api/cotizacion-dolar** — dolarapi.com blue (revalidate 600 s) → `{ blue_venta, blue_compra, actualizado }`. 502 si la fuente falla.

**GET /api/api-uso** — KPI "API bot" de Salud del Negocio (2026-07-23). Dos patas que degradan por separado: `admin` = costo posta vía Anthropic Admin API `cost_report` (necesita `ANTHROPIC_ADMIN_KEY`; montos en centavos de USD; fetch con revalidate 3600 s; sin key → `{disponible:false}`) y `propio` = suma de la tabla `api_uso` que el bot de Railway alimenta llamada a llamada (hoy + mes, hora AR) → `{ admin: {disponible, mes_usd, ultimos_30_usd}, propio: {hoy_usd, hoy_mensajes, mes_usd, mes_llamadas} }`.

**GET /api/dolar** — cascada DolarAPI → Bluelytics → CriptoYa (timeout 18 s c/u) → `{ cotizaciones: [{casa, nombre, compra, venta}], fuente, cronistaUrl, referencia }`. Si todo falla devuelve **200** con `error` y lista vacía (para que el front pida carga manual). Sin Supabase.

### Presupuestos / proyectos

**DELETE /api/presupuestos/[id]** — borrado físico en orden: 1) nulea FKs nullable (cotizaciones, tareas, cotizador_lecciones.obra_presupuesto_id); 2) borra obra_archivos, obra_avances, presupuestos_items; 3) borra `presupuestos` (cascade → presupuestos_gastos, cashflow_obras, cierres). 404 si no existía.

**GET /api/proyectos** — `presupuestos` + conteos de `presupuestos_items` y `presupuestos_gastos`, ordenado por `ordenarProyectos()`. Cache `s-maxage=30` (ver nota abajo).

### Trabajos / eventos / varios

**POST /api/trabajos** — body validado por `validarNuevoTrabajo()` → insert en `trabajos_cola` (origen tablero) + evento espejo en `eventos` (best-effort). **GET** — últimos 10 trabajos.

**GET /api/adn/sin-clasificar** — `eventos` estado=archivado con media o imagen_path (máx 60) + signed URLs del bucket `referencias` (1 h, tolera fallas parciales).

**POST /api/archivados/resolver** — body `{ evento_id, destino, monto?, categoria?, presupuesto_id?, etiquetas? }`. `resolverDestino()` decide el insert (con copia de imagen entre buckets `referencias` → `obra-archivos` si es foto_obra); marca el evento `resuelto` con destino_tabla/destino_id. Errores: 400, 404, 409 no archivado.

**GET /api/referencias?tipo=filosofia|estetica&limit=N** — tabla `referencias` (máx 200) + imágenes firmadas del bucket `referencias`.

**GET /api/proveedores** — `proveedores` activos (máx 500) + flyer firmado del bucket `referencias` (30 min).

**GET /api/grafo** — descarga `grafo-app.json` del bucket `grafo` y lo sirve tal cual (cache privado 5 min).

**GET /api/auto-login?next=** — solo previews Vercel: `signInWithPassword` con `PREVIEW_LOGIN_EMAIL/PASSWORD` y redirect a `next`. 404 si `PREVIEW_AUTO_LOGIN !== "true"` o `VERCEL_ENV === "production"`; 500 sin credenciales; 401 login fallido.

---

## Observaciones (endpoints sospechosos / notas)

- **Comentarios que apuntan a rutas que ya no existen:** `cashflow/marcar-item` y `planificar-confirmar` mencionan "cashflow/item", y `cashflow/obra/[obra_id]` menciona "/cashflow/resumen" — ninguna existe hoy en `src/app/api`. Solo comentarios zombie, no afecta runtime.
- **Solapamiento dólar:** `/api/cotizacion-dolar` (solo blue) y `/api/dolar` (tablero completo con 3 proveedores) coexisten. No es duplicado exacto (consumidores distintos: tablero salud vs pantalla cotización), pero es el candidato natural a unificar.
- **Doble ruta de cierre de obra:** `/api/obras/[id]/finalizar` (por presupuesto_id) y `/api/cashflow/obra/[obra_id]/finalizar` (por obra_id) — misma lib `finalizarObra()`, duplicación intencional documentada en el código.
- **`/api/cotizaciones/[id]/estado` vs aprobar/rechazar/emitir:** el PATCH libre reimplementa aprobar y rechazar (con los mismos efectos). Intencional (ordenar la mesa), pero son dos caminos al mismo estado.
- **Cache pública en ruta autenticada:** `/api/proyectos` setea `Cache-Control: s-maxage=30` (directiva de CDN compartida) mientras todo el resto usa `private, max-age=15`. Detrás del middleware de sesión el riesgo práctico es bajo, pero es inconsistente y conviene pasarlo a `private`.
- **Auth:** ninguna ruta hace chequeo de sesión propio — todas dependen 100 % del matcher del middleware. Si el matcher se rompe alguna vez, todas quedan abiertas con service_role. `/api/auto-login` es la única fuera del matcher (con doble guardia propia, correcta).
- **`/api/dolar` devuelve 200 en error** (a propósito, para el flujo manual del front) — no tratarlo como health-check.
