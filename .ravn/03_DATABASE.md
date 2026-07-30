> **Naturaleza:** HECHOS
> **Última verificación:** 2026-07-28 (agrega `diagnosticos`; resto 2026-07-25)
> **Fuente:** Supabase MCP list_tables + list_migrations, supabase/

# Modelo de datos — App RAVN (schema `public`)

**52 tablas** en `public` (49 verificadas 2026-07-23 + `cotizacion_mensajes` y
`puente_latidos`, migración `20260725120000_mesa_conversacional.sql` +
`diagnosticos`, migración `20260728120000_diagnosticos.sql`, aplicada y
verificada con `list_tables` el 2026-07-28).
Convención general: PK `id` (uuid en lo nuevo, bigint en lo legacy), timestamps `created_at`/`creado_at`.
Nota de identidad: en casi toda la app **la obra se identifica por `presupuesto_id` (uuid de `presupuestos`)**, no por `obras.id`. La tabla `obras` es una extensión 1:1 del presupuesto aprobado.

---

## Tablas

### Dominio: Obras (4)

| Tabla | Propósito | Columnas clave / FKs |
|---|---|---|
| `obras` | Extensión operativa 1:1 del presupuesto aprobado: cobranza, cierre, portada. | `presupuesto_id → presupuestos`, `finalizada_at`, `cobranza_cerrada_at`, `monto_total_a_cobrar_ars/usd`, `foto_portada_path` |
| `obra_archivos` | Archivos de la obra (portada, fotos, docs, PDFs emitidos). | `presupuesto_id → presupuestos`, `evento_id → eventos`, `tipo`, `storage_path`, `url_externa` |
| `obra_avances` | Bitácora de avances de obra (texto por instancia). | `presupuesto_id → presupuestos`, `texto`, `instancia` |
| `obra_plan_items` | Plan de compra/ejecución sembrado al aprobar la cotización; base del cruce cotizado/plan/real. | `presupuesto_id → presupuestos`, `cotizacion_id → cotizaciones`, `etapa`, `cantidad`, `precio_unitario`, `cotizado` (jsonb); referenciado por `presupuestos_gastos.plan_item_id` |

### Dominio: Cotizaciones y presupuestos (16)

| Tabla | Propósito | Columnas clave / FKs |
|---|---|---|
| `presupuestos` | Tabla MADRE: cada presupuesto/obra con estado, plantilla, rentabilidad. Casi todo el sistema cuelga de acá. | `id` uuid, `nombre_obra`, `nombre_cliente`, `estado`, `presupuesto_aprobado`, `rentabilidad_inputs` (jsonb), `propuesta_comercial_pref` (jsonb), `moneda`, `libreta_caja_empresa` |
| `presupuestos_items` | Ítems del presupuesto con precios congelados al emitir. | `presupuesto_id → presupuestos`, `receta_id → catalogo_recetas`, `precio_material_congelado`, `precio_mo_congelada` |
| `presupuestos_gastos` | Gastos reales por obra (la libreta de gastos); espejado al ledger vía `cuenta_id`. | `presupuesto_id → presupuestos`, `cuenta_id → cuentas`, `mo_acuerdo_id → mo_acuerdos`, `plan_item_id → obra_plan_items`, `cashflow_item_id → cashflow_items`, `adjunto_path` |
| `rubros` | Catálogo de rubros de trabajo (2 filas). | `nombre`, `tipo_trabajo`, `color_template`; referenciado por `catalogo_recetas.rubro_id` |
| `catalogo_recetas` | Catálogo viejo de recetas con costo base MO/material por unidad. **0 filas hoy** — los `receta_id` de items apuntan acá pero está vacío. | `rubro_id → rubros`, `costo_base_material_unitario`, `costo_base_mo_unitario` |
| `detalles_presupuesto` | **LEGACY, 0 filas.** Detalle del flujo viejo de presupuestos (bigint); `presupuesto_id` bigint SIN FK a `presupuestos` (que es uuid). | `receta_id → catalogo_recetas` |
| `gastos_reales` | **LEGACY, 0 filas.** Gastos del flujo viejo; `presupuesto_id` bigint SIN FK. Reemplazada por `presupuestos_gastos`. | — |
| `maestro_precios_items` | Maestro de precios por trabajo (MO/materiales/m² + match SISMAT). **0 filas hoy.** | `costo_mo_m2`, `costo_materiales_m2`, `sismat_costo_mo`, `sismat_match` |
| `maestro_precios_gestion` | Config singleton del maestro de precios. **0 filas hoy.** | `ganancia_mensual_estimada_ars`, `sismat_ultima_sync` |
| `precios_items` | Base viva de precios de mercado (fuente + fecha + origen, incluye chip DATO/eze). | `item`, `valor`, `fuente`, `origen`, `revisado_at` |
| `recetas` | Recetas paramétricas del cotizador nuevo (etapas, checklist, fuentes en jsonb, versionadas). | `nombre`, `estado`, `parametros`/`etapas`/`checklist`/`fuentes` (jsonb), `version`, `preguntas_abiertas` |
| `cotizaciones` | Cotizaciones del cotizador maestro (mesa de revisión): ficha, desglose, rango, y link al presupuesto emitido. | `trabajo_id → trabajos_cola`, `receta_id → recetas`, `presupuesto_id → presupuestos`, `ficha`/`desglose`/`revision` (jsonb), `total_min/max`, `foto_portada_path` |
| `cotizaciones_cola` | Cola de pedidos de cotización que entran por el bot (Tramo C). | `pedido`, `estado`, `respuesta`, `session_id`, `origen` |
| `cotizacion_archivos` | Archivos/renders por cotización (galería, crops por ítem, fotos de la mesa). Columna `en_propuesta` (bool, default false, 2026-07-25): marca la foto para salir en el documento emitido — página extra, cero regresión sin fotos marcadas. | `cotizacion_id → cotizaciones`, `storage_path`, `item_nombre`, `en_propuesta` |
| `cotizacion_mensajes` | **Nueva 2026-07-25 (mesa conversacional).** Hilo a tres voces de la mesa de revisión: Eze, Fable (Claude Code local) y Codex, más avisos de `sistema`. Realtime ON; RLS: select `authenticated`, insert/update siempre por service role (API routes o el puente). | `cotizacion_id → cotizaciones` (on delete cascade), `autor` (check eze\|fable\|codex\|sistema), `texto`, `adjuntos` (jsonb `[{archivo_id, storage_path, titulo}]`), `meta` (jsonb `{tipo, respuesta_a, fuentes}`); índices por `(cotizacion_id, creado_at)` y por `meta->>'respuesta_a'` (dedup del puente) |
| `diagnosticos` | **Nueva 2026-07-28 (módulo /diagnosticos, ADR 0006).** Diagnóstico técnico de obra: nace del relevamiento de campo y se convierte en cotización con "Enviar a cotizar". El documento al cliente lo renderiza la app con `src/lib/doc-a4-css.ts`, el modelo sólo aporta contenido. RLS: select `authenticated`, escritura por API route con service role. | `titulo`, `direccion`, `cliente`, `estado` (check borrador\|listo\|enviado\|cotizado), `presupuesto_id → presupuestos`, `trabajo_id → trabajos_cola`, `cotizacion_id → cotizaciones`, `relevamiento` (text crudo del checklist de visita), `contenido` (jsonb `{resumen, secciones:[{titulo,cuerpo,fotos}], alcance, recomendaciones, faltantes}`), `foto_portada_path` |
| `cotizador_lecciones` | Lecciones aprendidas post-obra que ajustan recetas futuras. | `cotizacion_id → cotizaciones`, `obra_presupuesto_id → presupuestos`, `leccion`, `ajuste` (jsonb) |
| `trabajos_cola` | Cola genérica de trabajos para el daemon de la Mac (prompt + contexto + resultado jsonb). **29/07:** la home ya no escribe acá (se borró la barra de comando y `/api/trabajos`); quedan como productores el bot de WhatsApp y `/api/obras/[id]/diagnostico`. El único consumidor verificado es `com.ravn.puente-cotizador`. | `tipo`, `estado`, `prompt`, `contexto`/`resultado` (jsonb) |

### Dominio: Dinero (14)

| Tabla | Propósito | Columnas clave / FKs |
|---|---|---|
| `movimientos_plata` | **EL LEDGER. Fuente de verdad de toda la plata** (ver Reglas). Cada pata: cuenta, dueño, moneda, grupo. | `cuenta_id → cuentas`, `dueno_obra_id → presupuestos`, `evento_id → eventos`, `dueno_tipo`, `grupo_id`, `origen_tipo`/`origen_id` (polimórfico, sin FK), `estado`, `cotizacion_ars_por_usd` |
| `cuentas` | Cajas/bolsillos (efectivo, bancos, USD, reserva MP por obra). Saldos DERIVADOS del ledger. | `moneda`, `saldo_inicial`, `procedencia`, `obra_id → obras`, `activa` |
| `cuenta_ajustes` | Arqueos: saldo declarado vs derivado, con delta. | `cuenta_id → cuentas`, `saldo_declarado`, `delta` |
| `transferencias` | Movimientos entre cuentas (incluye cambio de moneda: monto origen ≠ destino). | `cuenta_origen_id`/`cuenta_destino_id → cuentas` |
| `gastos_empresa` | Gastos de empresa sin obra asignada. | `cuenta_id → cuentas`, `moneda`, `categoria` |
| `gastos_personales` | Gastos personales de Eze (modelo alcancía; fijos y extraordinarios). | `cuenta_id → cuentas`, `fijo_id → finanzas_fijos`, `extraordinario` |
| `retiros_socio` | Retiros de socio (todo gasto personal = retiro declarado). **0 filas hoy.** | `cuenta_id → cuentas`, `moneda`, `ya_en_foto` |
| `financiamientos` | Deudas internas entre obras/empresa/personal y con terceros. | `deudor_obra_id`/`acreedor_obra_id → presupuestos`, `deudor_tipo`/`acreedor_tipo`, `saldo_pendiente`, `contraparte`, `origen_grupo_id` |
| `cashflow_items` | Cashflow proyectado vs real por obra (cobros/pagos), con soft-delete y adjuntos. | `obra_id → obras`, `cuenta_id → cuentas`, `tipo`, `monto_proyectado`/`monto_real`, `moneda`, `monto_usd`, `deleted_at` |
| `cashflow_cierres_obra` | Snapshot jsonb del cashflow al cerrar una obra. | `obra_id → obras`, `presupuesto_id → presupuestos`, `payload` (jsonb) |
| `negocio_config` | Config singleton del negocio: patrimonio inicial, % reserva/reinversión/sueldo. | `patrimonio_neto_inicial_ars/usd`, `pct_*`, `comprometido_obras_ars` |
| `finanzas_fijos` | Gastos fijos mensuales personales (plantilla). | `nombre`, `monto_ars`, `dueno`, `activo` |
| `finanzas_personal_config` | Config singleton finanzas personales: tope mensual, día de cierre. | `tope_personal_mensual_ars`, `dia_cierre`, `re_arranque` |
| `papelera_registros` | Papelera universal: fila borrada archivada como jsonb, restaurable. | `tabla`, `registro_id`, `registro` (jsonb), `restaurado_at` |

Además del ledger existe la vista **`dinero_huerfanos`** (no es tabla, no cuenta en las 49): lista filas con `cuenta_id` sin pata en el ledger; debe estar SIEMPRE vacía.

### Dominio: Mano de obra (1)

| Tabla | Propósito | Columnas clave / FKs |
|---|---|---|
| `mo_acuerdos` | Acuerdos de mano de obra por persona y obra (monto arreglado, saldo vía pagos). | `presupuesto_id → presupuestos`, `persona`, `monto_arreglado`, `moneda`, `estado`; los pagos son `presupuestos_gastos` con `mo_acuerdo_id` |

### Dominio: Otros — bot, cerebro, agenda, inmobiliario, sistema (15)

| Tabla | Propósito | Columnas clave / FKs |
|---|---|---|
| `api_uso` | Uso de API Anthropic registrado por el bot (KPI "API bot"): tokens y costo estimado por llamada. Append-only (sin UPDATE/DELETE). | `servicio`, `modelo`, `*_tokens`, `costo_usd`, `meta` (jsonb) |
| `eventos` | Inbox universal del bot de WhatsApp: cada mensaje/borrador con destino polimórfico. | `tipo`, `estado`, `contenido` (jsonb), `destino_tabla`/`destino_id` (sin FK), `wa_message_id` |
| `referencias` | Referencias guardadas por el bot (texto, imagen, video, dato). | `evento_id → eventos`, `tipo`, `etiquetas`, `imagen_path`, `url` |
| `proveedores` | Agenda de proveedores (teléfonos, rubro, zona) cargada por el bot. | `nombre`, `rubro`, `telefonos` (array), `evento_id` (uuid, sin FK declarada) |
| `tareas` | Tareas/recordatorios (bot + app), opcionalmente atadas a una obra. | `presupuesto_id → presupuestos`, `texto`, `fecha`, `estado`, `origen` |
| `calendario_eventos` | Eventos de calendario importados/manuales para "Tu Día". | `titulo`, `fecha`, `uid_externo` |
| `noticias` | Noticias curadas del día para la home (job diario). | `fecha`, `categoria`, `titulo`, `porque`, `url` |
| `cerebro_preguntas` | Pregunta del día del ciclo cerebro autónomo. | `fecha`, `tipo`, `pregunta`, `estado` |
| `cerebro_sinapsis` | Conexiones propuestas entre notas del vault (UNIR/DESCARTAR por WhatsApp). | `nota_a`, `nota_b`, `razon`, `estado` |
| `sistema_estado` | Latido del daemon de la Mac (singleton). | `ultimo_latido`, `daemon_version` |
| `puente_latidos` | **Nueva 2026-07-25.** Latido del `daemon/puente-cotizador/` (motor local de la mesa conversacional) — una fila por proceso, upsert cada 30 s. La ruta `/api/cotizaciones/[id]/mensajes` la lee para el chip "motor conectado" (umbral 90 s). RLS: select `authenticated`, escritura service role. | `id` (text, PK = nombre del proceso), `visto_at` |
| `seguridad_config` | Config de seguridad: email del bot (singleton). | `bot_email` |
| `inmobiliario_zonas` | Zonas para el radar inmobiliario. **0 filas** (módulo sin datos aún). | `nombre`, `ml_match`, `lat`/`lng` |
| `inmobiliario_avisos_snapshot` | Snapshots de avisos por zona. **0 filas.** | `zona_id → inmobiliario_zonas`, `precio_usd`, `usd_por_m2` |
| `inmobiliario_precios_zona_periodo` | Medianas USD/m² por zona y período. **0 filas.** | `zona_id → inmobiliario_zonas`, `mediana_publicacion_usd_m2`, `veredicto` |
| `inmobiliario_noticias` | Noticias del mercado inmobiliario. **0 filas.** | `titulo`, `url`, `zona_relevante` |

---

## Relaciones

- **`presupuestos` es el hub.** 14 tablas apuntan a él: `obras` (1:1 al aprobar), `presupuestos_items`, `presupuestos_gastos`, `obra_archivos`, `obra_avances`, `obra_plan_items`, `tareas`, `mo_acuerdos`, `cotizaciones`, `cotizador_lecciones`, `cashflow_cierres_obra`, `movimientos_plata.dueno_obra_id` y `financiamientos` (deudor y acreedor). "Obra" en la app = un `presupuesto_id`.
- **`cuentas` es el hub del dinero.** Todo lo que toca plata referencia una cuenta: `movimientos_plata`, `presupuestos_gastos`, `gastos_empresa`, `gastos_personales`, `retiros_socio`, `transferencias` (origen y destino), `cashflow_items`, `cuenta_ajustes`. Una cuenta puede atarse a una obra (`cuentas.obra_id`, ej. reserva MP por obra).
- **Espejo al ledger:** las tablas de gasto/cobro son la "cara" del dato; cada fila con `cuenta_id` genera patas en `movimientos_plata` vía `origen_tipo`/`origen_id` (referencia polimórfica, sin FK física). El `grupo_id` agrupa las patas de una misma operación (ej. cambio de moneda, cuotas).
- **Flujo cotizador → obra:** `trabajos_cola` → `cotizaciones` (usa `recetas`) → al aprobar se crea `presupuestos` (`cotizaciones.presupuesto_id`) y se siembra `obra_plan_items`; los gastos reales (`presupuestos_gastos.plan_item_id`) cierran el cruce cotizado/plan/real; `cotizador_lecciones` retroalimenta.
- **Mano de obra:** `mo_acuerdos` define el arreglo; cada pago es un `presupuestos_gastos` con `mo_acuerdo_id` — el saldo de la persona se deriva de ahí.
- **Bot:** `eventos` es el inbox; `destino_tabla`/`destino_id` apunta polimórficamente (sin FK) a la tabla final; `referencias`, `obra_archivos` y `movimientos_plata` guardan el `evento_id` de origen.
- **Cadena legacy:** `rubros` → `catalogo_recetas` → `detalles_presupuesto`/`presupuestos_items`. `detalles_presupuesto` y `gastos_reales` tienen `presupuesto_id` **bigint sin FK** (resto del esquema pre-uuid).

## Migraciones

- Se aplican con **MCP `apply_migration`** (DDL siempre por migración, nunca `execute_sql` para esquema). **Nunca editar ni borrar una migración ya aplicada** — cambio de esquema = migración nueva (regla dura en `02_AI_RULES.md`).
- **87 migraciones aplicadas** en remoto (según `list_migrations`). La última: `20260718132215_papelera_registros` (2026-07-18).
- El repo tiene **65 archivos** en `/Users/ezeotero/Documents/ravn/supabase/migrations/` — es un espejo **parcial y con timestamps divergentes** (ej. local `20260703100000_obra_plan_items` vs remoto `20260703031811`; faltan localmente ~22 aplicadas por MCP, como `un_solo_dueno`, `financiamientos_terceros`, `cerebro_sinapsis`). **La fuente de verdad del historial es el remoto** (`list_migrations`), no la carpeta local.

## Reglas

### Ledger de dinero = fuente de verdad

`movimientos_plata` es LA verdad de toda la plata. Los saldos de `cuentas` se DERIVAN del ledger (saldo inicial + patas), nunca se guardan. Toda escritura que toque plata por SQL directo (fuera de los write-points de la app) debe asentar sus patas en `movimientos_plata` en la misma operación, o llamar `POST /api/dinero/espejo {tabla, id}` — no existe ningún sync automático al abrir la app. Antes de cerrar cualquier sesión que tocó plata: `select * from dinero_huerfanos;` debe devolver 0 filas. (Detalle completo en `/Users/ezeotero/Documents/ravn/CLAUDE.md`, regla dura del 18/07/2026.)

### Estado REAL de RLS (verificado 2026-07-23 contra `pg_policies`; recuento de tablas re-verificado 2026-07-25 con `list_tables`)

- **Las 51 tablas tienen RLS habilitado** (`rls_enabled = true` en todas, incl. `cotizacion_mensajes` y `puente_latidos`, según `list_tables` del 2026-07-25).
- `cotizacion_mensajes` y `puente_latidos` (nuevas 2026-07-25) siguen el patrón de las 8 de abajo: **UNA política de select para `authenticated`, escritura solo por service role** (API routes y el `daemon/puente-cotizador/`, nunca RLS de insert/update).
- **47 tablas tienen políticas** (de las 49 verificadas en jun/jul previo a esta tanda). La mayoría con 4 (select/insert/update/delete para `authenticated`); algunas con 3.
- **8 tablas tienen UNA sola política** (lectura para la app; escritura solo por service role, típicamente el daemon/bot): `inmobiliario_zonas`, `inmobiliario_avisos_snapshot`, `inmobiliario_precios_zona_periodo`, `inmobiliario_noticias`, `noticias`, `precios_items`, `recetas`, `retiros_socio`.
- **2 tablas tienen RLS habilitado pero CERO políticas:** `negocio_config` y `seguridad_config`. Eso las deja en deny-all para `anon`/`authenticated` — solo el service role las lee/escribe. Si la app las consulta con la key pública, esas queries devuelven vacío. Puede ser intencional (son singletons de config), pero no está documentado: **pendiente ADR de seguridad** en `decisions/` que confirme si es deliberado o falta la política de lectura.
- Endurecimientos ya aplicados por migración: `base_seguridad`, `*_rls` (jun-2026), `function_search_path` + `pin_search_path_trigger_functions`, `harden_gastos_obra_storage_and_es_bot`.

### Rarezas conocidas del esquema

- `detalles_presupuesto` y `gastos_reales`: legacy del flujo viejo, 0 filas, `presupuesto_id` bigint sin FK. Candidatas a borrar (con migración y aprobación de Eze).
- `catalogo_recetas`, `maestro_precios_items`, `maestro_precios_gestion`: 0 filas pero con FKs/pantallas vivas — el catálogo viejo quedó vacío tras la purga del flujo de presupuesto; los `receta_id` de `presupuestos_items` quedan en null.
- Módulo `inmobiliario_*` (4 tablas): esquema desplegado (may-2026) sin datos todavía.
- `retiros_socio`: 0 filas — el modelo "un solo dueño" registra los retiros pero aún no se usó la tabla.
- Referencias polimórficas sin FK física (por diseño): `eventos.destino_tabla/destino_id`, `movimientos_plata.origen_tipo/origen_id`, `papelera_registros.tabla/registro_id`.
