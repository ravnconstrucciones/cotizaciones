-- Índices para las consultas calientes del Centro de Mando
-- (daemon poll cada 45s, feeds del tablero, contraste de obras)

-- daemon: claim de trabajos pendientes + barridos por estado
create index if not exists idx_trabajos_cola_estado_creado
  on trabajos_cola (estado, creado_at);

-- tablero: feed de actividad (orden por fecha) y archivados (filtro por estado)
create index if not exists idx_eventos_creado on eventos (creado_at desc);
create index if not exists idx_eventos_estado_creado on eventos (estado, creado_at desc);

-- contraste de obras + pantallas de gastos: gastos por presupuesto y fecha
create index if not exists idx_presupuestos_gastos_presupuesto
  on presupuestos_gastos (presupuesto_id, fecha);

-- cashflow: items por obra (alimenta /cashflow/resumen)
create index if not exists idx_cashflow_items_obra
  on cashflow_items (obra_id);

-- mesa de revisión y bot: cotizaciones por estado
create index if not exists idx_cotizaciones_estado_creado
  on cotizaciones (estado, creado_at desc);

-- ADN: referencias por tipo, cronológico
create index if not exists idx_referencias_tipo_creado
  on referencias (tipo, creado_at desc);

-- legacy hasta que Frente E la dropee: el daemon la sigue poleando
create index if not exists idx_cotizaciones_cola_estado
  on cotizaciones_cola (estado);
