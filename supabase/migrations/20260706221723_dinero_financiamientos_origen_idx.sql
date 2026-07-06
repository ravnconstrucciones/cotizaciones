-- Índice para el lookup inverso "¿qué financiamiento creó esta operación del
-- ledger?" — lo va a necesitar el RPC de Fase 2 para idempotencia (no duplicar
-- el financiamiento si un grupo se confirma dos veces). Pedido del review de
-- cierre de Fase 1.
create index financiamientos_origen_grupo_idx
  on public.financiamientos (origen_grupo_id);
