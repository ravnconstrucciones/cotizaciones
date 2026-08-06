# Últimos 10 gastos + Deshacer — Diseño

**Fecha:** 2026-08-06
**Estado:** aprobado para implementación
**Ruta:** `/gasto`

## Objetivo

Dar una salida segura al error de carga inmediata: debajo del formulario o del resultado de `/gasto`, mostrar los diez gastos rápidos más recientes y permitir deshacer uno sin dejar Caja, ledger o Papelera inconsistentes.

## Alcance y contrato de origen

- Se incluyen únicamente egresos `obra`, `empresa` y `personal` creados por `POST /api/gastos/rapido` a partir de esta versión.
- Los ingresos quedan excluidos por construcción: se guardan en `cashflow_items` y nunca reciben el marcador de gasto rápido.
- Se agrega `origen_carga text` a `presupuestos_gastos`, `gastos_empresa` y `gastos_personales`. El único valor nuevo válido es `gasto_rapido_v2`; el histórico queda `null`.
- El `POST` nuevo escribe ese marcador. El dedupe de reintentos también exige el marcador, para no adoptar como deshacible una fila histórica parecida.
- La lista filtra por el marcador, une las tres tablas, ordena por `created_at DESC, id DESC` y corta exactamente en 10.

## Modelo de lectura

`GET /api/gastos/rapido/recientes` devuelve:

```ts
type GastoRapidoReciente = {
  id: string;
  tipo: "obra" | "empresa" | "personal";
  concepto: string;
  importe: number;
  moneda: "ARS" | "USD";
  fecha: string;
  createdAt: string;
  cuenta: string | null;
  detalle: string | null;
};
```

Cada tabla aporta como máximo diez filas marcadas, con la cuenta y el nombre de obra cuando existe. Un helper puro normaliza, une, desempata y limita. Fallar una consulta falla toda la respuesta; no se presenta una lista parcial como completa.

## Deshacer atómico

`POST /api/gastos/rapido/[tipo]/[id]/deshacer` llama una sola RPC PostgreSQL con `service_role`. La RPC:

1. valida `tipo` e identifica la tabla y el `origen_tipo` del ledger;
2. bloquea la fila objetivo con `FOR UPDATE`;
3. si ya no existe, consulta Papelera: si hay un snapshot activo marcado, devuelve `ya_deshacido`; si no, devuelve `no_encontrado`;
4. rechaza cualquier fila cuyo `origen_carga` no sea `gasto_rapido_v2`;
5. para Obra, bloquea el `cashflow_items` vinculado y valida que sea el espejo `RAVN_GASTO_OBRA`;
6. bloquea las patas de `movimientos_plata` ligadas al detalle o al cashflow y rechaza grupos con financiamiento;
7. inserta en `papelera_registros` el snapshot completo del detalle y en `vinculos jsonb` los snapshots de cashflow y patas de ledger;
8. marca `deleted_at` en el cashflow espejo, elimina las patas asentadas y elimina el detalle;
9. retorna el id de Papelera.

Todas las instrucciones viven en una sola función PL/pgSQL y una sola transacción implícita. Cualquier excepción revierte el archivo, cashflow, ledger y detalle. Un índice único parcial sobre `(tabla, registro_id)` con `restaurado_at is null` impide dos snapshots activos. La segunda solicitud concurrente espera el lock y recibe `ya_deshacido`; el endpoint lo traduce a HTTP 409.

La RPC es `SECURITY DEFINER`, fija `search_path = ''`, usa nombres calificados, revoca `EXECUTE` a `PUBLIC`, `anon` y `authenticated`, y lo concede sólo a `service_role`.

## Restauración

La misma migración agrega una RPC transaccional para restaurar los snapshots rápidos:

- bloquea la fila de Papelera;
- reinsertará el detalle desde `registro` conservando id, timestamps, marcador, cuenta y vínculos;
- repone el estado previo de `deleted_at` del cashflow desde `vinculos.cashflow_item`;
- repone exactamente las patas archivadas desde `vinculos.movimientos_plata`;
- marca `restaurado_at` sólo al final.

`POST /api/papelera/[id]/restaurar` usa esta RPC cuando el snapshot tiene `origen_carga = gasto_rapido_v2`; para entradas históricas conserva el flujo compatible existente. Un fallo revierte la restauración rápida completa.

## Interfaz operativa

La sección `Últimos gastos cargados` aparece al final de ambos estados de `/gasto`: formulario y resultado. No es un hero ni una pantalla separada.

- Visual: fondo `#070707`, texto `#f2efe8`, Raleway/tokens existentes, bordes rectos y color sólo semántico para error/destrucción/éxito.
- Carga: skeleton compacto con `aria-busy` y espacio reservado.
- Error: mensaje inline y botón `Reintentar` de al menos 44 px.
- Vacío: explica que aparecerán sólo gastos cargados desde esta pantalla a partir de ahora.
- Fila colapsada: tipo, concepto, importe y fecha; cuenta en segunda línea. Toda la fila es un botón de al menos 56 px.
- Sólo una fila se expande. `aria-expanded`, `aria-controls` y foco visible preservan teclado y lector de pantalla.
- Expandido: repite el contexto necesario y expone `Deshacer gasto`, separado y con target mínimo de 44 px.
- Confirmación obligatoria: “También se revertirá la salida de Caja. El gasto quedará en Papelera y podrás restaurarlo.” Botones `Cancelar` y `Confirmar deshacer`; durante la solicitud quedan deshabilitados y se muestra progreso.
- `AnimatePresence` anima una sola expansión y el diálogo. `useReducedMotion` lleva duración a cero cuando corresponde.
- Safe area: el diálogo inferior suma `env(safe-area-inset-bottom)`; sin scroll horizontal a 375 px.
- Tras éxito se quita la fila, se cierra el diálogo y se anuncia el resultado con `aria-live`. Un 409 refresca la lista y comunica que ya fue deshecho.

## Estados y errores

| Estado | UI | HTTP |
|---|---|---|
| Lista disponible | hasta 10 filas | 200 |
| Sin gastos nuevos | vacío explícito | 200 |
| Fila histórica/no marcada | no se lista; RPC rechaza | 409 |
| Primer undo | quita fila + aviso | 200 |
| Doble/concurrente | refresca + “ya fue deshecho” | 409 |
| Falla DB | conserva fila + error reintentable | 500 |

## Verificación requerida

- Obra con/sin cashflow y con/sin cuenta.
- Empresa y Personal con cuenta.
- Orden exacto y límite 10; ingresos e históricos excluidos.
- Snapshot de detalle, cashflow y ledger; restauración exacta.
- Dos requests concurrentes, doble undo y rechazo sin marcador.
- Grupos/patas sin financiamiento y rechazo seguro si lo hubiera.
- `dinero_huerfanos` vacío antes y después de undo/restore.
- UI en loading, error, vacío, expansión, confirmación, progreso, éxito y 409.
- 375 px, escritorio, teclado, lector semántico, target 44 px, reduced motion y safe area.

## Auto-revisión

- Cobertura: la spec incluye recientes, origen explícito, exclusión de ingresos, atomicidad, locks, idempotencia, Papelera, restauración, ledger, cashflow, UI móvil y accesibilidad.
- Riesgo principal: el historial remoto de migraciones diverge del checkout local. La migración se aplicará de forma puntual por el flujo aprobado; no se usará `supabase db push` ni se reparará historia.
- Decisión de mínima superficie: no se crea tabla nueva ni motor paralelo; se agregan tres columnas de marcador, un campo JSONB de vínculos, dos RPC acotadas y dos endpoints.
