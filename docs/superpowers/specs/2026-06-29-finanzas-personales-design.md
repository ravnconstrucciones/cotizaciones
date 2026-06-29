# Finanzas Personales — App RAVN

_Spec de diseño · 2026-06-29 · Ezequiel Otero / RAVN_

## Problema

Eze tiene **una sola tarjeta personal pagando dos mundos**: su vida personal y el
software/IA que en realidad es de RAVN. Mirar la tarjeta para entender sus
finanzas "empasta" porque mezcla los dos mundos. Además los dos mundos se tocan
en un punto (el **retiro**: plata que sale de RAVN y se vuelve su ingreso
personal), y eso, sin nombrarlo, se siente como una fuga.

Lo que necesita, "como el pan de cada día":

1. Saber **cuánto puede gastar hoy / esta semana** en su vida personal, con un
   tope mensual y un acumulado que arrastra (lo que no gasta se suma; lo que se
   pasa, le resta de los días que vienen).
2. Ver **en qué se le va la plata** (rubro por rubro, gasto por gasto),
   separando lo que es suyo de lo que es software de la empresa.
3. Que el **bot de WhatsApp** pueda contestarle "¿cuánto puedo gastar hoy?".

Objetivo de fondo: RAVN tiene prioridad total. Eze **no escatima en la empresa y
sí en lo personal**. El presupuesto personal es su freno de mano para contenerse
y dejarle más al negocio.

## Modelo conceptual: DOS libretas, NO una

| Libreta | Qué tiene | Estado |
|---|---|---|
| **RAVN (negocio)** | Caja (pesos+USD), salud obra por obra, por cobrar, costos fijos | ✅ ya existe (`/cashflow`, Salud del Negocio) |
| **Vos (personal)** | Ingreso (retiros) − gasto (fijos + variable) = lo que queda + presupuesto diario | 🔨 lo nuevo |

**Se tocan en UN solo punto: el retiro.** Nada más.

**La tarjeta es el riel de pago, no una libreta.** El software de RAVN cae en la
tarjeta personal pero **no es gasto de Eze**: se muestra **etiquetado al costado**
("esto es de la empresa") para entender por qué la tarjeta da lo que da, pero
**no suma al total personal y no se mete en el rédito de RAVN** (decisión
explícita de Eze: solo etiqueta informativa, sin llevar cuenta de "lo que la
empresa le debe" — es dueño único, esa deuda nunca se salda y solo agrega
complejidad).

## Decisiones cerradas (con Eze, 2026-06-29)

1. **Tope personal mensual = $2.800.000** (techo TOTAL, con los fijos adentro).
2. **El ciclo es el de la tarjeta: del 26 al 25.** El acumulado se **resetea el
   día de cierre (25)**, NO el 1ro de mes. La asignación diaria se calcula sobre
   el ciclo de la tarjeta (≈28–31 días, variable).
3. **Software de la empresa**: etiquetado e informativo en la vista personal,
   fuera del total personal y fuera del rédito del negocio.
4. **Cashflow = SOLO empresa**: caja (cuánto hay), ingresado vs gastado, y arriba
   apartado lo **pendiente de ingreso** (por cobrar). Cero gasto personal ahí.
   → Se reusa lo existente, no se reconstruye.

## El motor de presupuesto (el corazón)

El acumulado **no guarda día por día nada**. Es una fórmula determinística (el
código suma, la IA no — igual que `salud-negocio.ts`):

```
fijos_personal      = Σ fijos activos con dueño = 'personal'
discrecional_mes    = tope_personal_mensual − fijos_personal
asignacion_diaria   = discrecional_mes / dias_del_ciclo
gastado_variable    = Σ gastos_personales con fecha dentro del ciclo actual
disponible_hoy      = asignacion_diaria × dias_transcurridos_del_ciclo − gastado_variable
```

El rollover sale solo (ejemplo con asignación $20k/día):

| Día del ciclo | Acumulado (asig×días) | Gastado | Disponible hoy |
|---|---|---|---|
| 1 | $20k | $0 | **$20k** |
| 2 | $40k | $0 | **$40k** ← se sumó lo de ayer |
| 3 | $60k | $50k | **$10k** ← se pasó, queda poco |
| 4 | $80k | $50k | **$30k** ← se recupera solo |

- **`disponible_hoy`** es el número estrella ("cuánto puedo gastar ahora").
- **Ritmo semanal** = `asignacion_diaria × 7` (referencia para el finde).
- **Semáforo**: `disponible_hoy > asignacion_diaria` → verde; `0..asignacion` →
  amarillo; `< 0` → rojo ("hoy venís en rojo, recuperás en N días").
- **Proyección fin de ciclo** = `discrecional_mes − gastado_variable` (lo que te
  queda para todo el ciclo).

### Cálculo del ciclo (a partir de `dia_cierre = 25`)

- Si hoy ≤ 25 → el ciclo va del **26 del mes anterior** al **25 de este mes**.
- Si hoy > 25 → el ciclo va del **26 de este mes** al **25 del mes que viene**.
- `dias_del_ciclo` = (fin − inicio) + 1 (varía 28–31). `dias_transcurridos` =
  (hoy − inicio) + 1. Todo en zona horaria America/Argentina/Buenos_Aires.

## Datos (Supabase)

### Tablas nuevas

**`finanzas_personal_config`** (fila única, id=1 — patrón de `negocio_config`):

| Columna | Tipo | Nota |
|---|---|---|
| `id` | int PK | siempre 1 |
| `tope_personal_mensual_ars` | numeric(12,2) | $2.800.000 |
| `dia_cierre` | int | default 25 |
| `notas` | text null | |
| `updated_at` | timestamptz | |

**`finanzas_fijos`** (lista de costos fijos, personal Y software-empresa):

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `nombre` | text | "Prepaga", "Expensas", "Claude", … |
| `monto_ars` | numeric(12,2) | mensual |
| `dueno` | text | `'personal'` \| `'empresa'` |
| `activo` | bool | default true |
| `orden` | int | default 0 |
| `created_at` | timestamptz | |

- `dueno='personal'` → resta del discrecional (prepaga, expensas, servicios, gym,
  teléfono, seguros). Algunos no pasan por la tarjeta (débito) — no importa, se
  cargan igual como monto fijo conocido.
- `dueno='empresa'` → el software/IA (Claude, Canva, CapCut, Wispr, Apple One,
  Hostinger, Rendair, Railway, TiendaNube). Solo se muestra etiquetado; NO entra
  en ningún cálculo personal.

**RLS**: mismo contrato que `gastos_personales` (authenticated total; el bot
puede `select`; `config`/`fijos` los edita solo Eze, no el bot). Migración
versionada en `supabase/migrations/`, siguiendo el patrón de
`20260612101000_gastos_personales.sql` (enable RLS, revoke anon, drop policies
previas, crear policies del contrato).

### Tablas que ya existen (se reusan)

- **`gastos_personales`** = gasto VARIABLE día a día (súper, salidas, combustible,
  ropa, delivery, varios). Ya la cargan la app y el bot. **No se toca el esquema.**
- **`retiros_socio`** = ingreso personal (lo que Eze saca de RAVN). Ya existe.
- **`negocio_config` / cashflow / salud-negocio** = la libreta del negocio.

## API

- **`GET /api/finanzas`** — se **refactoriza**: hoy devuelve un presupuesto
  hardcodeado ($707.942/mes). Pasa a devolver la salida del motor (config +
  fijos + gastos del ciclo → `disponible_hoy`, `asignacion_diaria`, semáforo,
  proyección, desglose variable por categoría, fijos personales, total software
  empresa etiquetado, últimos gastos). El cálculo vive en un módulo puro
  `src/lib/finanzas-personal.ts` (testeable, sin IO).
- **`GET/POST /api/finanzas/config`** — leer/editar tope y día de cierre.
- **`GET/POST/DELETE /api/finanzas/fijos`** — ABM de la lista de fijos.
- **`POST/DELETE /api/finanzas`** (cargar/borrar gasto variable) — se mantiene.

### Integración con el bot

El bot (`ravn-bots`, Railway) ya rutea personal vs obra
(`advisorService.js` → `insertGastoPersonal` vs `presupuestos_gastos`). Para
"¿cuánto puedo gastar hoy?":

- **Recomendado (single source of truth):** el bot hace `GET` a un endpoint lean
  del app — `GET /api/finanzas/presupuesto-hoy` — que devuelve
  `{ disponible_hoy, asignacion_diaria, semaforo, frase }`. El motor queda en un
  solo lugar (el app); el bot solo lo lee y lo redacta.
- Alternativa descartada: replicar la fórmula en el bot (riesgo de drift entre
  las dos copias del cálculo).

## UI — pantalla `/finanzas` (rediseño)

Mantiene el sistema visual actual (cards `cdm-*`, Geist, semáforo verde/amarillo/
rojo, Framer Motion). Orden de la pantalla:

1. **HERO — "Hoy podés gastar"**: `disponible_hoy` en grande, color por semáforo,
   con la asignación diaria y barra de progreso. Subtítulo: ritmo semanal / "hasta
   el finde". Línea de ciclo: "Ciclo 26 may → 25 jun · día X de Y".
2. **Presupuesto del ciclo**: tope $2,8M − fijos personales = discrecional ·
   gastado variable · disponible · proyección fin de ciclo.
3. **Fijos personales** (lista editable, suma).
4. **Software RAVN (de la empresa)** — bloque **etiquetado y separado**, suma a la
   vista pero NO al total personal. Deja claro por qué la tarjeta da de más.
5. **Variable por categoría** (lo que ya hay) + **cargar gasto** + **últimos
   gastos** (lo que ya hay).

Entrada desde la home: nueva card/acceso en `cockpit-home.tsx` (hoy `/finanzas`
no está linkeada en el bento). Es la **libreta personal**, hermana de "Salud del
Negocio".

## Fases

**Fase 1 — el pan de cada día (este spec, foco):**
- Tablas `finanzas_personal_config` + `finanzas_fijos` (+ migración + RLS).
- Motor puro `lib/finanzas-personal.ts` (con tests del ciclo y el rollover).
- Refactor `GET /api/finanzas` + `/config` + `/fijos` + `/presupuesto-hoy`.
- Rediseño de la pantalla `/finanzas` (HERO presupuesto + fijos + software
  etiquetado + variable).
- Bot contesta "¿cuánto puedo gastar hoy?".
- Acceso desde la home.

**Fase 2 — la foto y el tablero (después):**
- Resumen compacto del **cashflow de la empresa** (caja pesos+USD, ingresado vs
  gastado, pendiente de ingreso arriba) que **linkea** al módulo existente — sin
  duplicar lógica.
- **Foto mensual rubro por rubro** de la tarjeta (lo que hoy da el HTML
  `Desglose_Tarjetas_*.html`), empresa vs mío, procesada cuando Eze pasa el
  resumen de la tarjeta a la terminal y se guarda un snapshot del ciclo.

## Fuera de alcance (YAGNI)

- Llevar cuenta acumulada de "lo que RAVN le debe a Eze" por el software (es
  dueño único; pura complejidad sin claridad nueva).
- Wirear el software al rédito de RAVN.
- Parseo automático del PDF de la tarjeta dentro del app (lo procesa Eze + la
  terminal; el app solo guarda el resultado — Fase 2).
- Mover los gastos personales al cashflow del negocio (quedan en mundos
  separados, a pedido explícito).
