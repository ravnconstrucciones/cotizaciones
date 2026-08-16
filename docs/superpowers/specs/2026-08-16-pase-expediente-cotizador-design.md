# El pase del expediente — del Cotizador a App RAVN

**Fecha:** 16/08/2026 · **Estado:** aprobado por Eze · **Rama:** `home-cards`

Sucede al PASO 4 (la OT al pie del tablero), que Eze canceló: *"¿por qué sale la
OT si lo que tiene que salir es la propuesta?"*. La OT es del flujo de
diagnóstico y es de ANTES del número.

## El encuadre, en palabras de Eze

> *"Lo que hacemos con el cotizador es sacarle toda la parte de maquinaria, toda
> la parte de lógica, toda la parte de análisis. Después, todo eso se manda a App
> RAVN… lo que se manda es la receta. Todo lo que nosotros consideramos se compara
> con lo que efectivamente pasa, pero eso ya pasa en App RAVN en el proyecto, una
> vez que la cotización está aprobada."*

Y antes: *"del laboratorio sólo quiero el precio; la redacción y todo el trabajo
viene del diagnóstico"*.

De ahí salen las dos leyes de este contrato:

1. **El laboratorio aporta el CUÁNTO. El diagnóstico aporta el QUÉ.** El pase no
   mueve una sola línea de texto: ni título, ni alcance, ni descripción, ni
   notas. La propuesta se redacta con el diagnóstico.
2. **La maquinaria no se muda.** Fuentes por ítem, desvíos, veredictos, cola de
   decisiones, conversación y dial de margen se quedan en el cotizador para
   siempre. App RAVN recibe el **extracto**, no el razonamiento.

## Qué viaja

Dos cosas y nada más:

| Dato | Destino en App RAVN | Para qué |
|---|---|---|
| **El número final** | `cotizaciones.precio_propuesta` | Es *el* dato. Lo fija Eze con el dial, nunca el motor. |
| **El extracto rubro por rubro** | `cotizaciones.desglose` (ítems a mano + precios cerrados) | Al aprobar se siembra como **plan de compra de la obra** (`obra_plan_items`, vía `importarPlanDesdeCotizacion`), y contra ese plan la app cruza compras y MO reales. |

El extracto no es decoración: **si no viaja, la obra nace con una lista de
compras incompleta** y el contraste estimado-vs-real compara contra un costo que
nunca se usó. El circuito que Eze describe ("se compara con lo que efectivamente
pasa, en el proyecto") ya está construido en App RAVN — este pase es lo único que
faltaba para alimentarlo.

## Cómo viaja

### Endpoint nuevo: `POST /api/cotizaciones/[id]/pase`

Recibe el estado **completo** del taller más el precio, corre el motor **una vez**
y escribe **una vez**.

Ya existe `PATCH /api/cotizaciones/[id]/desglose`, pero acepta *una operación por
request*. Un taller con 8 ítems a mano y 12 precios cerrados serían 20 llamadas,
20 corridas del motor, y un corte en la 11 deja el desglose a medias y sin
precio. El endpoint nuevo **reusa la misma lógica de fusión** — se extrae del
PATCH a un módulo compartido, no se duplica — y la aplica junta.

**Body:**

```ts
{
  precio_propuesta: number | null,     // el número del dial; null lo borra
  manuales: Array<{                    // reemplaza ajustes.manuales COMPLETO
    nombre: string, rubro: string, tipo: "material" | "mano_de_obra",
    unidad: Unidad, cantidad: number, precio?: number, notas?: string
  }>,
  precios_cerrados: Array<{            // reemplaza los precio_eze COMPLETO
    nombre: string, valor: number,
    origen: "sismat" | "internet" | "retail" | "eze"
  }>
}
```

**Respuesta:** `{ ok, total_min, total_max, precio_propuesta, aplicados: {manuales, precios} }`.

### La calibración respeta el origen real

Decisión de Eze (16/08): *el precio cerrado viaja con su fuente real; sólo tu
número calibra.*

`precios_cerrados[].origen` distingue de dónde salió el valor. En la cotización
el ítem queda cerrado en ese número igual (colapsa el rango: `instanciar.ts` hace
`precioMin = precioMax = eze.valor`), pero **`precios_items` sólo se toca cuando
`origen === "eze"`**. Cerrar un ítem con el precio de SISMAT ya no lo inscribe en
la base como "precio de Eze".

Esto corrige un defecto real del PATCH actual, que upsertea todo lo que recibe
como `origen: 'eze'` con fuente *"Eze — mesa de revisión"*.

### Credencial de escritura aparte

El `RAVN_COTIZADOR_READ_SECRET` de hoy es deliberadamente incapaz de escribir y
**eso no se toca**. Va un `RAVN_COTIZADOR_WRITE_SECRET` nuevo, header
`x-ravn-cotizador-write`, con allowlist de **exactamente una ruta**:

```
POST /api/cotizaciones/[^/]+/pase
```

`aprobar` y `emitir` quedan sin llave. El cotizador no puede aprobar, emitir,
crear obra ni tocar plata — ni por bug ni por error. Es la frontera taller /
oficina de la decisión del 16/08, sostenida por permisos y no por buena voluntad.

Fail-closed y **distinto del de lectura y del legacy**: si alguno coincide, el
bypass no existe (mismo criterio que `credencialCotizadorReadValida`).

## Qué ve Eze

Botón al pie de la consola de margen, junto al precio que acaba de fijar. Antes
de escribir, resumen y confirmación:

> *precio $3.150.000 · 4 ítems a mano · 7 precios cerrados*

Estados del botón, con la regla anti-slop: **nunca se muestra como pasado algo
que no entró.**

- Preview sintético → deshabilitado (la cotización no existe en la base).
- Sin precio fijado → deshabilitado ("fijá el precio primero").
- Cotización aprobada o emitida → el pase rebota con 409 y lo dice.
- Error de red o de base → el botón vuelve a "Pasar" con el motivo a la vista.

## Re-pase: el taller manda

El pase envía el estado **completo**, así que la cotización queda **idéntica** al
taller: los `ajustes.manuales` y los `precio_eze` se reconstruyen desde cero en
cada pase.

- Pasar dos veces con el mismo taller da exactamente el mismo resultado
  (idempotente por construcción).
- Si sacaste un ítem del taller, en la app desaparece. Sin acumulación fantasma.
- El número de las dos puntas nunca puede divergir.

**Riesgo conocido, aceptado en v1:** si entre un pase y otro Eze edita a mano en
la mesa de revisión de App RAVN, el siguiente pase pisa esa edición. Se avisa en
el texto de confirmación. Detectar el conflicto real (comparar los ajustes de la
app contra los del taller) queda para otra vuelta.

## Guards que se respetan

- **Sólo `borrador` o `en_revision`.** Mismo criterio que la hoja viva. Se
  verifica con el patrón de guard de carrera del repo: `UPDATE … .in("estado",
  [...]).select("id")` y 0 filas → 409, nunca éxito fantasma.
- **`trg_cotizaciones_guard`** (ninguna cotización activa sin receta) sigue
  gobernando: el pase no lo esquiva ni lo comenta.
- **No toca plata.** No hay pata de `movimientos_plata` que asentar: el pase
  escribe desglose y `precio_propuesta`, que no son movimientos.

## Módulos

| Archivo | Qué hace |
|---|---|
| `src/lib/cotizador/mesa-merge.ts` | **nuevo** — fusión pura de ajustes (extraída del PATCH). Sin I/O, testeable sola. |
| `src/app/api/cotizaciones/[id]/desglose/route.ts` | usa el módulo extraído; comportamiento intacto. |
| `src/app/api/cotizaciones/[id]/pase/route.ts` | **nuevo** — el endpoint del pase. |
| `src/middleware.ts` | allowlist + credencial de escritura. |
| `apps/cotizador-ravn/src/adapters/app-ravn-write-adapter.ts` | **nuevo** — cliente del pase, server-only. |
| `apps/cotizador-ravn/src/app/api/pase/route.ts` | **nuevo** — proxy que agrega el secreto. |
| Consola de margen | el botón, el resumen y los estados. |

## Verificación

- Tests de la fusión pura (alta, baja, reemplazo completo, idempotencia).
- Tests del endpoint: estado inválido → 409 · body inválido → 400 · origen no
  `eze` **no** escribe `precios_items` · origen `eze` **sí**.
- Tests de la credencial: sin header → 401 · header de lectura sobre el pase →
  401 · ruta fuera de la allowlist con el header de escritura → 401.
- Prueba de punta a punta contra la base real con una cotización de prueba, y
  las filas borradas por el mismo camino.
