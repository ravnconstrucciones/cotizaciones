# HANDOFF

> Próxima sesión: "leé el handoff y continuá".
>
> **✅ ACTUALIZACIÓN 2026-06-29 (sesión 2):** Correa RESUELTO. Total real = **$3.300.000** ($2,9M base ya cobrado + $400k cielorraso). El `monto_total_a_cobrar_ars` ya era $3,3M; se subió la `propuesta_comercial_pref` de $2,9M→$3,3M para que aparezcan los **$400.000 por cobrar**. `rentabilidad_inputs` de Correa cargados (costo $1.628.534 = mat $850k + MO $778.534) → Rédito calcula. **PENDIENTE solo:** que Eze CONFIRME que la base era $2,9M (no $3,3M) — si la base ya era $3,3M, el cielorraso sería un +$400k extra → total $3,7M (avisar).
>
> **▶ Lo que queda (necesita a Eze):** confirmar costos-estimación de rentabilidad (abajo) + push del commit `d891b2f`.

---

## ⭐ SESIÓN 2026-06-29 — leer primero

Eze pidió hacer 3 frentes en orden. Estado:

### ✅ FRENTE 1 — Plan diario logística 2 obras (HECHO)
- Entregable: **`/Users/ezeotero/Documents/ravn/Logistica_Dos_Obras.html`** (dark premium, abierto y aprobado tras correcciones).
- **OJO error corregido en vivo:** primero armé el plan con la cotización equivocada del vault (`Cotizaciones/2026-06-09-revestimiento-container-plegable.md` = sistema EIFS/Tarquini, 10-12 días). Eze lo cazó: "12 días me fundo". La obra real es **SIDING de fibrocemento**, no Tarquini.
- **Datos reales confirmados por Eze:**
  - Obra A = **"Siding de fibrocemento"** ($2.170.000), **5-6 días**, **2 personas**, **materiales los pone el BARRIO** (Las Glorietas). Arranca **mié 01/07**.
  - Sistema: estructura/rastreles → barrera Tyvek + lana → placas fibrocemento atornilladas → **tarquinado SOLO en las esquinas** como detalle de remate (único paso húmedo, último día). NO va tarquinado general.
  - Regla de oro siding: el 30/06 Eze **verifica que el barrio tenga el material**, no compra nada.
  - Obra B = **Baño Pueyrredón** (reforma integral llave en mano, USD 8.050, ~3 sem / 15 días hábiles, cuadrilla 2-3, material RAVN). Arranca **lun 06/07**.
  - Cuadrillas **separadas en paralelo** → casi no se pisan (solo conviven 06 y 07/07; el siding ya está en terminaciones, va solo mientras arranca el baño).
- Reglas de oro del baño (en el HTML): mueble laqueado + mesada Silestone se encarga ESTA semana (cola 2-3 sem, se coloca 22/07); grifería ducha empotrada Piazza comprada ANTES de la sanitaria (08/07, se empotra en pared); mampara templado se mide el 17/07 y se encarga (cola 5-7 días).
- Pendiente opcional: pasar el método del siding por el cerebro de Seia (no crítico, la estructura ya es correcta).

### 🔄 FRENTE 2 — Rentabilidad CARGADA con estimaciones (falta SOLO precio de Correa + que Eze confirme números)
**Cargado vía SQL el 29/06:** Siding costo $700k → margen 68% · Pueyrredón costo USD 5.600 @1520 → margen 30,4%. Los costos son estimación mía, Eze los ajusta.
**Correa (actualizado):** costo cargado = **$1.628.534** = gastos $1.428.534 + $200k MO pendiente (poner rasos + pintura). Eze va a hacer un **cielorraso extra que cobra $400.000** (mat+MO, para recuperar gastos; obra tuvo errores/rework "no salió lo que quisimos"). ⚠️ **FALTA: el precio TOTAL de Correa = base pactada + $400k extra.** Con ese número, setear `obras.monto_total_a_cobrar_ars` (obra `6e5e171c-e657-4c1b-ae10-a5c5fa19b58e`) y el rédito calcula. Eze quiere que el extra quede BIEN sumado en la salud del trabajo para no aparecer como pérdida por las materias/MO/errores ya absorbidos.

Objetivo: que el KPI "Rédito proyectado" muestre margen real (hoy muestra "—" porque ninguna obra activa tiene `rentabilidad_inputs`).

**Lo investigado (NO re-investigar):**
- Tabla: `presupuestos.rentabilidad_inputs` (jsonb). Gastos reales = tabla **`presupuestos_gastos`** (col `importe`, `presupuesto_id` uuid). El KPI calcula **costo estimado = costoMaterial + costoMo + costosInternos + cargosAdicionales** (sin contingencia).
- **Formato exacto del jsonb** (sacado de obras que ya lo tienen):
  ```json
  {"v":1,"casaDolar":"blue","costoMoStr":"1.500.000,00","mostrarIva":false,
   "presupuestoId":"<uuid>","costoMaterialStr":"2.345.965,10","precioObraManual":null,
   "remarqueMoPctStr":"40","costosInternosStr":"200000","contingenciaPctStr":"10",
   "monedaPresentacion":"ARS","cotizacionManualStr":"","cargosAdicionalesStr":"",
   "remarqueMaterialPctStr":"40","bonificacionComercialPctStr":"0"}
  ```
- **Las 3 obras a cargar (presupuesto_id / obra_id / estado):**
  1. **Siding de fibrocemento** — presup `36dfddb0-e113-46dc-984c-dbf63f9c163c` / obra `23b7011c-4804-461b-ae55-2967aba4677e`. Precio $2.170.000 (ya en `monto_total_a_cobrar_ars`). Material **$0** (lo pone el barrio). **FALTA: costo MO + internos.** Eze tiró "le tendría que sacar mínimo unos 700.000" → confirmar si es costo total (~margen 68%).
  2. **Baño Correa** (Lagomarsino) — presup `762f49eb-a364-4bed-a9c7-3f31062a5f64` / obra `6e5e171c-e657-4c1b-ae10-a5c5fa19b58e`. Casi cerrada. Costo ≈ gastos ya cargados = **$1.428.534** (17 gastos). ⚠️ **FALTA: precio de cierre** (la obra tiene `monto_total_a_cobrar` NULL en la base → sin precio el rédito da null).
  3. **Pueyrredón 1100** — presup `9a3c7543-d4b6-43d9-a202-a4259d5c1fa9` / obra `d3c1e076-...`. Obra USD: 8.050 congelado a **$1.520/USD** (= $12.236.000 ars). Desde cero. **FALTA: costo material + MO.** ⚠️ **RIESGO #1:** dolarizar el costo a la MISMA cotización del contrato ($1.520), no a otra, o el margen miente.
- **Forma de cargar:** escribir el jsonb vía SQL (mcp supabase `execute_sql`/`apply_migration`) o que Eze lo cargue en la pantalla Rentabilidad. NO cargar con números inventados — esperar los de Eze.

### ✅ FRENTE 3 — Commit fix Rédito (HECHO)
- Commit **`d891b2f`** en branch `home-cards`: SOLO los 4 archivos del fix (salud-negocio.ts/.test.ts, cashflow/resumen/route.ts, modulo-salud-negocio.tsx). El resto del working tree sucio quedó sin tocar (Eze decide). **NO pusheado** aún (Eze decide push).
- Branch `home-cards`. Working tree sigue sucio con lo no relacionado (landing + inmobiliario + dia + borrados de terminal).
- El fix de Rédito proyectado YA ESTÁ VIVO en prod FIVE (se deployó con el working tree) pero **sin commitear**. Archivos del fix: `src/lib/salud-negocio.ts`, `salud-negocio.test.ts`, `src/app/cashflow/resumen/route.ts`, `src/components/cockpit/modulo-salud-negocio.tsx`. Tests 270 verde, tsc 0 errores, review hecho (3 🟡 menores, ver más abajo).
- Hacer: commit limpio separando SOLO los archivos del fix Rédito de lo no relacionado. Eze decide qué más commitear.

---

## Pendientes operativos (de memoria, retomar)
- Procesar charlas de la **expo** (revestimientos + impermeabilización techos) → destilar a cerebro construcción.

---
*(Frente 3 — detalle del review del fix Rédito, 3 🟡 a confirmar: #1 obra USD cotización de dolarización debe = la del contrato congelado; #2 `esUsd` flipea si hay cobro USD por error; #3 alarma roja USD compara gastado nominal vs costo floteado al blue. Núcleo 🟢 OK.)*
