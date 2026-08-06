# Últimos 10 gastos + Deshacer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar los diez gastos rápidos recientes en `/gasto` y permitir deshacer/restaurar cada uno con cashflow, ledger y Papelera atómicos.

**Architecture:** Tres tablas reciben el marcador `gasto_rapido_v2`; una API normaliza y ordena recientes, y una RPC PL/pgSQL bloquea/archiva/revierte cada gasto en una transacción. La UI cliente consume esa API, mantiene una sola fila expandida y confirma toda destrucción.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase/PostgreSQL 17, Vitest, Framer Motion 12, Tailwind 4.

## Global Constraints

- Sólo `obra`, `empresa` y `personal` con `origen_carga = 'gasto_rapido_v2'`; nunca ingresos ni históricos ambiguos.
- Orden global `created_at DESC, id DESC`; máximo exacto 10.
- Undo y restore rápidos atómicos; rollback total ante fallo; doble undo/concurrencia → 409.
- `#070707`, `#f2efe8`, bordes rectos, color sólo semántico, target destructivo >=44px.
- Framer Motion/AnimatePresence, `prefers-reduced-motion` y safe area.
- No `supabase db push`; aplicar sólo la migración puntual aprobada.

---

### Task 1: Contratos puros de recientes y estados

**Files:**
- Create: `src/lib/gastos-rapidos.ts`
- Test: `src/lib/gastos-rapidos.test.ts`

**Interfaces:**
- Produces: `GastoRapidoReciente`, `normalizarGastosRecientes(fuentes): GastoRapidoReciente[]`, `estadoInicialUltimosGastos`, `reducirUltimosGastos(estado, evento)`.

- [ ] **Step 1: Escribir tests fallantes** para límite 10, empate por id, mezcla de tipos, exclusión por fuente y transiciones loading/error/confirmación/éxito/409 con fixtures literales.
- [ ] **Step 2: Ejecutar `npm test -- src/lib/gastos-rapidos.test.ts`** y comprobar que falla por módulo ausente.
- [ ] **Step 3: Implementar los tipos, normalizador y reducer mínimos** sin dependencias de Supabase o React.
- [ ] **Step 4: Repetir el test focalizado** y comprobar cero fallos.

### Task 2: Migración y RPC transaccionales

**Files:**
- Create: `supabase/migrations/<cli-timestamp>_gastos_rapidos_undo.sql`
- Create: `supabase/tests/gastos_rapidos_undo.sql`

**Interfaces:**
- Produces: columnas `origen_carga`, `papelera_registros.vinculos`, índice parcial de snapshot activo, RPC `gasto_rapido_deshacer(text, uuid)` y `gasto_rapido_restaurar(uuid)`.

- [ ] **Step 1: Generar el archivo con `supabase migration new gastos_rapidos_undo`**; no inventar timestamp.
- [ ] **Step 2: Escribir un test SQL transaccional fallante** que cubra Obra con/sin cashflow y cuenta, Empresa/Personal con cuenta, no marcado, doble/concurrente lógico, snapshots, patas, restore y `dinero_huerfanos` vacío; todos los fixtures viven entre `BEGIN` y `ROLLBACK`.
- [ ] **Step 3: Implementar la migración mínima** con locks `FOR UPDATE`, snapshots JSONB, borrado/restauración de patas y grants sólo a `service_role`.
- [ ] **Step 4: Revisar manualmente mutaciones**: quitar filtro de marcador, lock, delete de patas, restore de cashflow o unique parcial debe romper una aserción.
- [ ] **Step 5: Aplicar sólo esta migración por MCP aprobado**, sin tocar el historial divergente, y ejecutar el SQL test en una transacción que termina en rollback.
- [ ] **Step 6: Ejecutar advisors de seguridad y performance** y revisar permisos efectivos de ambas RPC.

### Task 3: Endpoints de recientes, undo y restore

**Files:**
- Create: `src/app/api/gastos/rapido/recientes/route.ts`
- Create: `src/app/api/gastos/rapido/[tipo]/[id]/deshacer/route.ts`
- Modify: `src/app/api/gastos/rapido/route.ts`
- Modify: `src/app/api/papelera/[id]/restaurar/route.ts`
- Test: `src/lib/gastos-rapidos-api.test.ts`

**Interfaces:**
- Consumes: `normalizarGastosRecientes`, RPC `gasto_rapido_deshacer`, RPC `gasto_rapido_restaurar`.
- Produces: `GET /api/gastos/rapido/recientes`, `POST /api/gastos/rapido/:tipo/:id/deshacer`; el POST existente marca toda fila nueva.

- [ ] **Step 1: Escribir tests fallantes de helpers de traducción** para resultados RPC `deshecho`, `ya_deshacido`, `no_habilitado`, `no_encontrado` y error; 409 en estados de conflicto.
- [ ] **Step 2: Ejecutar el test focalizado** y verificar el fallo esperado.
- [ ] **Step 3: Implementar consultas y handlers mínimos**; las tres inserciones y sus dedupes incluyen `origen_carga`.
- [ ] **Step 4: Integrar restore rápido** y conservar el fallback existente sólo para snapshots históricos.
- [ ] **Step 5: Ejecutar tests focalizados y typecheck**.

### Task 4: Lista móvil y confirmación

**Files:**
- Create: `src/app/gasto/ultimos-gastos.tsx`
- Modify: `src/app/gasto/gasto-screen.tsx`
- Test: `src/lib/gastos-rapidos.test.ts`

**Interfaces:**
- Consumes: endpoints de Task 3 y reducer de Task 1.
- Produces: `<UltimosGastos refreshKey={string | number} />`.

- [ ] **Step 1: Agregar tests fallantes del reducer** para una sola expansión, apertura/cancelación, loading de undo, error preservando fila y éxito quitándola.
- [ ] **Step 2: Ejecutar tests y verificar RED**.
- [ ] **Step 3: Implementar componente mobile-first** con `AnimatePresence`, `useReducedMotion`, semántica button/dialog, `aria-live`, targets mínimos y padding safe-area.
- [ ] **Step 4: Montarlo debajo de formulario y resultado**; después de una carga exitosa incrementar `refreshKey` para refrescar.
- [ ] **Step 5: Ejecutar tests focalizados y typecheck**.

### Task 5: Verificación completa e integración

**Files:**
- Modify sólo si una verificación descubre un defecto dentro del alcance anterior.

**Interfaces:**
- Consumes: todos los entregables.

- [ ] **Step 1: Ejecutar tests focalizados**, luego `npm test`, `npx tsc --noEmit` y `npm run build`; guardar conteos y exit codes.
- [ ] **Step 2: Levantar la app y verificar `/gasto` autenticado** en 375 px y escritorio: loading, error inducido reversible, vacío/lista, una expansión, confirmación/cancelación, teclado, foco y reduced motion; no crear movimientos reales.
- [ ] **Step 3: Consultar en sólo lectura** permisos de RPC, marcador/índices, migración aplicada y `select count(*) from dinero_huerfanos` = 0.
- [ ] **Step 4: Comparar de nuevo principal/rama/HEAD/dirty y confirmar que no hay deploy en curso**; integrar sólo estos archivos.
- [ ] **Step 5: Revisar diff, crear commit y push de `codex/ultimos-gastos-deshacer`**.
- [ ] **Step 6: Integrar en la rama compartida sólo si sigue sincronizada**, desplegar por el flujo normal, verificar Vercel Ready y HTTP/auth route.
- [ ] **Step 7: Informar al coordinador** resultado, pruebas, migración, integración, deploy y cualquier trabajo pendiente.

## Auto-revisión del plan

- Cobertura de spec: Tasks 1–4 cubren lista/origen/orden, undo, restore, cashflow, ledger, concurrencia, Papelera, UI, loading/error/confirmación y accesibilidad; Task 5 cubre esquema real, huérfanos, suite, build, responsive, integración y deploy.
- Placeholders: el timestamp de migración se delega explícitamente al CLI porque la regla del skill prohíbe inventarlo; no hay `TODO`, “similar a” ni implementación diferida.
- Consistencia: el marcador, nombres de RPC, endpoints y tipo `GastoRapidoReciente` son iguales en todas las tareas.
