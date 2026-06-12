-- Limpieza post-advisor: los índices del Frente A ya cubrían estas consultas;
-- se eliminan los duplicados creados en 20260614130000 (se conservan los originales).
drop index if exists idx_cashflow_items_obra;
drop index if exists idx_cotizaciones_estado_creado;
drop index if exists idx_eventos_creado;
drop index if exists idx_eventos_estado_creado;
drop index if exists idx_referencias_tipo_creado;
drop index if exists idx_trabajos_cola_estado_creado;

-- FKs sin índice que sí valen (advisor): el loop de oro joinea por acá
create index if not exists idx_cotizaciones_presupuesto on cotizaciones (presupuesto_id);
create index if not exists idx_cotizador_lecciones_cotizacion on cotizador_lecciones (cotizacion_id);
create index if not exists idx_cotizador_lecciones_obra on cotizador_lecciones (obra_presupuesto_id);
create index if not exists idx_cashflow_cierres_presupuesto on cashflow_cierres_obra (presupuesto_id);
