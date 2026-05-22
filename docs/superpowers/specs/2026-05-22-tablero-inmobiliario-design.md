# Tablero de Inteligencia Inmobiliaria RAVN — Diseño

**Fecha:** 2026-05-22
**Autor:** Ezequiel Otero + Claude
**Estado:** Aprobado para implementación (Fase 1)

## Propósito

RAVN suma una pata de negocio inmobiliario. Este módulo es un **tablero de control automático** que muestra precio/m² de venta y de construcción por zona, evolución del mercado, y un ranking de barrios con veredicto "Construir / Comprar / Esperar". El objetivo es que Ezequiel tome decisiones de inversión inmobiliaria con datos reales, sin cargar nada a mano: el sistema se actualiza solo.

A futuro se convierte en un "cerebro inmobiliario" que lee noticias del sector y genera conclusiones con IA. Esa capa se construye en Fase 2; la arquitectura de Fase 1 queda preparada para recibirla sin reescritura.

## Decisiones tomadas en brainstorming

- **Layout:** Datos protagonistas (Opción B). Al entrar se ven KPIs + gráfico de tendencia + ranking de barrios. El mapa es una vista secundaria, a un click.
- **Fuente de datos:** Automática (no carga manual) y **multi-fuente para precisión** (ver sección Estrategia de datos). Fase 1 cruza MercadoLibre + Datos Abiertos CABA + Reporte Inmobiliario; el scraping de Zonaprop/Argenprop es Fase 2.
- **Cobertura inicial:** CABA + GBA Norte (zona de operación real de RAVN: Nordelta, zona norte, Capital). Expansión a todo el país en fase posterior.
- **IA (cerebro):** Diferida a Fase 2. La app NO usa el plan Max de Claude — la API se factura por uso (estimado < USD 1/mes para 1-2 conclusiones diarias). Se decidió arrancar sin IA y agregarla después.

## Prioridad rectora: PRECISIÓN

El criterio de éxito #1 de Ezequiel es que el tablero sea **acertado** — lo va a comparar contra el sistema profesional que usa su novia (sector inmobiliario). Un tablero que no coincide con la realidad del mercado no sirve. Por eso la estrategia de datos prioriza precisión sobre volumen, y es explícita sobre la diferencia entre **precio de publicación** y **precio de cierre**.

## Estrategia de datos — multi-fuente (clave de la precisión)

**Problema central:** los portales (MercadoLibre, Zonaprop, etc.) publican el **precio que pide el vendedor**, no el precio al que se escritura. En Argentina las propiedades cierran ~5–15% por debajo del valor de publicación según zona y estado de mercado. Un tablero armado solo con portales lee sistemáticamente alto y no coincidiría con un sistema profesional.

**Solución: tres fuentes gratuitas que se cruzan y calibran.**

1. **MercadoLibre Inmuebles (API)** — volumen y **precio de publicación** actual + tendencia. Mucha cantidad de avisos, gratis.
2. **Datos Abiertos CABA** (`data.buenosaires.gob.ar`) — **compraventas / escrituras reales** publicadas por el gobierno porteño. Son **precios de cierre verdaderos**: el ancla de realidad. Gratis.
3. **Reporte Inmobiliario** — valores de referencia por barrio (probable fuente del sistema de la novia). Sirve para **calibrar** y validar. Gratis (páginas públicas).

**Salida: doble número por barrio.** El tablero muestra para cada zona:
- **Precio de publicación** (USD/m², de portales)
- **Precio estimado de cierre** (USD/m², = publicación × factor de ajuste de esa zona, donde el factor se deriva del cruce con datos de escrituras reales de CABA)

Mostrar las dos puntas es lo que hace al tablero coincidir con un sistema profesional **y** ser más completo. La **brecha publicación↔cierre por zona** es además un dato de mercado valioso (mide cuánto margen de negociación hay).

> **Nota de cobertura:** Datos Abiertos de escrituras existe para CABA. Para GBA Norte (partidos de provincia) el dato oficial de cierre es más difícil de conseguir; en esas zonas el factor de ajuste se estima por analogía con zonas CABA comparables hasta conseguir fuente provincial. Marcar esta limitación en la UI (ej. badge "estimado").

## Alcance — Fase 1 (este spec)

Lo que SÍ entra:

1. **Ingesta automática multi-fuente** por zona (CABA + GBA Norte), guardada en Supabase con histórico:
   - MercadoLibre Inmuebles (API) → precio de publicación + volumen.
   - Datos Abiertos CABA → escrituras / compraventas reales (precio de cierre).
   - Reporte Inmobiliario → valores de referencia por barrio (calibración).
2. **Cálculo de precio/m²** agregado por barrio: **doble número** — mediana USD/m² de *publicación* (portales) y USD/m² *estimado de cierre* (con factor de ajuste derivado de escrituras reales). Más cantidad de avisos y variación período a período.
3. **Costo de construcción USD/m² por zona**, derivado del maestro de precios existente de RAVN (no de portales).
4. **Tablero (Layout B):** KPIs, gráfico de evolución 12 meses (venta vs. construcción), ranking de barrios ordenable.
5. **Veredicto heurístico "Construir / Comprar / Esperar"** por barrio — regla determinística basada en la brecha construcción/venta y la variación de precios (SIN IA todavía).
6. **Feed Top 10 de noticias** del sector: lectura de RSS de medios inmobiliarios argentinos, mostrado crudo (título + fuente + antigüedad), sin resumen IA.
7. **Cron de actualización** que refresca datos de precios (diario) y noticias (cada hora).

Lo que NO entra (Fase 2+):

- Resúmenes y "conclusión del día" generados por IA.
- Veredictos "Construir/Comprar" generados por IA (Fase 1 usa heurística determinística).
- Scraping de Zonaprop / Argenprop.
- Mapa interactivo geográfico (placeholder/vista simple por ahora; el mapa rico es módulo posterior).
- Calculadora de rentabilidad inmobiliaria dedicada (módulo 04, spec aparte).
- Cobertura nacional / provincias.

## Riesgos conocidos (a verificar en implementación)

- **API de MercadoLibre:** ML restringió accesos en el tiempo. El endpoint de búsqueda de ítems puede requerir OAuth y tener límites de rate. **Primer paso de implementación: validar acceso real a la API de inmuebles de ML** antes de construir sobre ella. Si está bloqueada, fallback a scraping acotado. Esta validación es bloqueante.
- **Datos Abiertos CABA:** verificar formato y vigencia del dataset de escrituras/compraventas (puede venir agregado por barrio y con rezago de algunos meses). Es para precio de cierre — aunque tenga rezago, sirve para fijar el **factor de ajuste** por zona, no para el dato del día.
- **Reporte Inmobiliario:** no tiene API; los valores de referencia salen de páginas públicas (scraping liviano o carga semilla puntual). Es fuente de calibración, no crítica para que el tablero funcione.
- **Cobertura de cierre en GBA Norte:** el dato oficial de escrituras es sólido en CABA, más difícil en partidos de provincia. En esas zonas el precio de cierre es **estimado** (factor por analogía) — marcarlo con `confianza='estimada'` en la UI.
- **Calidad de datos:** los avisos traen outliers (precios mal cargados, m² erróneos). Se filtran por percentiles (descartar P5 inferior y P95 superior) y se usa **mediana**, no promedio, para el USD/m².
- **Normalización de zonas:** mapear los nombres de barrio/partido de cada fuente a una taxonomía propia de RAVN (tabla `zonas`, campo `ml_match`/alias) para evitar duplicados ("Palermo Soho" vs "Palermo") y para cruzar las tres fuentes sobre la misma zona.

## Arquitectura

Sigue los patrones existentes del repo (App Router, `page.tsx` + `<feature>-screen.tsx`, lógica en `src/lib/`, API en `src/app/api/`, Supabase anon client, Tailwind v4 con tokens `ravn-*`, Recharts).

### Modelo de datos (Supabase)

```
zonas
  id            uuid pk
  nombre        text         -- "Palermo", "Vicente López", "Nordelta"
  tipo          text         -- 'barrio_caba' | 'partido_gba' | 'barrio_privado'
  region        text         -- 'CABA' | 'GBA_NORTE'
  ml_match      text[]       -- alias para mapear desde MercadoLibre
  lat, lng      numeric      -- centroide (para futuro mapa)
  activa        boolean

avisos_snapshot                 -- crudo ingerido, append-only
  id            uuid pk
  zona_id       uuid fk -> zonas
  fuente        text         -- 'mercadolibre' | 'caba_escrituras' | 'reporte_inmobiliario'
  tipo_dato     text         -- 'publicacion' | 'cierre' | 'referencia'
  fuente_id     text         -- id del aviso/registro en la fuente (dedup)
  operacion     text         -- 'venta'
  tipo_prop     text         -- 'departamento' | 'casa' | 'ph' | 'lote'
  precio_usd    numeric
  m2            numeric
  usd_por_m2    numeric      -- precomputado
  ambientes     int
  antiguedad    int
  capturado_en  timestamptz

precios_zona_periodo            -- agregado por zona + período, lo que lee el tablero
  id            uuid pk
  zona_id       uuid fk -> zonas
  periodo       date         -- primer día del mes
  tipo_prop     text
  -- doble número (clave de la precisión):
  mediana_publicacion_usd_m2 numeric  -- de portales (precio que se pide)
  mediana_cierre_usd_m2      numeric  -- estimado real (publicacion x factor_ajuste)
  factor_ajuste              numeric  -- brecha publicacion->cierre de la zona (ej 0.88)
  ref_reporte_usd_m2         numeric  -- valor de referencia para calibrar (puede ser null)
  p25_usd_m2    numeric
  p75_usd_m2    numeric
  n_avisos      int          -- cantidad de avisos de publicacion
  n_escrituras  int          -- cantidad de escrituras reales usadas (0 si no hay)
  var_mensual   numeric      -- % vs período anterior (sobre cierre)
  costo_constr_usd_m2 numeric -- derivado del maestro de precios RAVN
  veredicto     text         -- 'construir' | 'comprar' | 'esperar' (heurística)
  confianza     text         -- 'alta' | 'media' | 'estimada' (según fuentes disponibles)
  calculado_en  timestamptz

noticias
  id            uuid pk
  titulo        text
  url           text
  fuente        text         -- 'Infobae' | 'La Nación' | 'Reporte Inmobiliario' | ...
  publicado_en  timestamptz
  zona_relevante text        -- null o zona detectada por keywords
  score         numeric      -- relevancia (Fase 1: heurística por keywords + recencia)
  capturado_en  timestamptz
```

### Componentes y archivos

```
src/app/inmobiliario/
  page.tsx                      -- metadata + server component, entrega TableroScreen
  tablero-screen.tsx            -- Layout B, client component, orquesta secciones

src/components/inmobiliario/
  kpi-grid.tsx                  -- 4 KPIs superiores
  evolucion-chart.tsx           -- Recharts: venta vs construcción 12m
  ranking-barrios.tsx           -- tabla ordenable con veredicto
  feed-noticias.tsx             -- Top 10 noticias

src/lib/inmobiliario/
  fuentes/mercadolibre.ts       -- cliente API ML (publicación) + normalización a avisos_snapshot
  fuentes/caba-escrituras.ts    -- ingesta Datos Abiertos CABA (cierre real)
  fuentes/reporte-inmobiliario.ts -- valores de referencia por barrio (calibración)
  fuentes/noticias-rss.ts       -- parser de feeds RSS de medios
  agregar-precios.ts            -- snapshot crudo -> precios_zona_periodo (mediana, percentiles, filtros, factor de ajuste publicación->cierre)
  costo-construccion.ts         -- deriva costo USD/m² del maestro de precios RAVN
  veredicto.ts                  -- heurística construir/comprar/esperar (sobre precio de cierre)
  zonas-seed.ts                 -- taxonomía inicial CABA + GBA Norte

src/app/api/inmobiliario/
  refresh-precios/route.ts      -- ingesta ML + agregación (cron diario)
  refresh-noticias/route.ts     -- ingesta RSS (cron horario)
  tablero/route.ts              -- lee precios_zona_periodo + noticias para el front
```

### Flujo de datos

```
[Cron diario]  -> /api/inmobiliario/refresh-precios
                  -> mercadolibre.ts        (fetch publicación por zona)
                  -> caba-escrituras.ts     (fetch cierre real, cuando hay)
                  -> reporte-inmobiliario.ts (fetch referencia)
                  -> avisos_snapshot (insert, dedup por fuente+fuente_id)
                  -> agregar-precios.ts (mediana publicación, factor de ajuste
                                         publicación->cierre desde escrituras,
                                         percentiles, filtros outliers, confianza)
                  -> costo-construccion.ts (maestro RAVN)
                  -> veredicto.ts (sobre precio de cierre)
                  -> precios_zona_periodo (upsert período actual)

[Cron horario] -> /api/inmobiliario/refresh-noticias
                  -> noticias-rss.ts (fetch feeds, dedup por url)
                  -> score por keywords + recencia
                  -> noticias (insert)

[Browser]      -> /inmobiliario (page.tsx)
                  -> /api/inmobiliario/tablero (lee agregados, NO recalcula)
                  -> TableroScreen renderiza KPIs + chart + ranking + noticias
```

El front **nunca** llama a las fuentes externas en vivo: lee siempre los agregados ya calculados de Supabase. Esto mantiene el tablero rápido y resiliente ("que no se frene por nada").

### Cron / actualización automática

Vercel Cron (configurado en `vercel.json` o `vercel.ts`):
- `refresh-noticias`: cada hora (`0 * * * *`).
- `refresh-precios`: una vez por día (`0 6 * * *`).

Resiliencia: cada handler captura errores por zona/fuente individualmente — si ML falla para una zona, las demás siguen; si un feed RSS cae, los otros siguen. Nunca se borran datos viejos: si una corrida falla, el tablero sigue mostrando el último agregado válido.

### Heurística de veredicto (Fase 1, sin IA)

Determinística, en `veredicto.ts`:

- **Brecha** = mediana_usd_m2 / costo_constr_usd_m2.
- `construir` si brecha alta (≥ umbral, mucho margen entre construir y vender) **y** var_mensual positiva sostenida.
- `comprar` si precios estables/bajos relativos a la zona y brecha media (más barato comprar hecho que construir).
- `esperar` si var negativa o brecha baja (poco margen).

Umbrales configurables en un objeto de constantes, ajustables sin tocar lógica. En Fase 2 la IA reemplaza/enriquece esta función pero la firma se mantiene.

## Estética

Layout B validado en mockup. Estilo RAVN: tokens `ravn-*` existentes (light/dark), Raleway, cero border-radius (`rounded-none`), bordes finos negros, acento beige/taupe para deltas y veredictos. KPIs con números tabulares. Charts con Recharts respetando la paleta (negro = venta, beige punteado = construcción). Veredictos con color semántico + texto (nunca solo color): Construir (beige/dorado), Comprar (azul), Esperar (gris).

Animaciones: el repo no usa Framer Motion hoy; transiciones sutiles con Tailwind (150-300ms) en hover/estados. (Nota: la regla global de Framer Motion aplica a sitios nuevos; este es un módulo dentro de una app existente que ya define su propio patrón sin Framer Motion. Confirmar con Ezequiel si quiere introducirlo.)

## Testing

- `agregar-precios.ts`: tests unitarios con datasets sintéticos — verificar filtrado de outliers, mediana correcta, manejo de zona sin avisos (n=0 → no rompe).
- `veredicto.ts`: tests de tabla — cada combinación de brecha/variación da el veredicto esperado.
- `mercadolibre.ts`: test de normalización con fixtures de respuesta real de la API (capturados en el paso de validación).
- `noticias-rss.ts`: test de parseo con un XML de feed de ejemplo + dedup.
- Manual/UI: cargar el tablero con datos seed, verificar render en 375/768/1024/1440px, light y dark, y estados vacíos ("sin datos aún").

## Costo mensual

- **Fase 1:** ~USD 0 adicional. Las tres fuentes de datos (MercadoLibre API, Datos Abiertos CABA, Reporte Inmobiliario) son gratuitas. Vercel + Supabase ya están en uso para la app. Los crons entran en el plan actual de Vercel.
- **Fase 2:** cerebro de IA ~< USD 1/mes (API de Claude vía AI Gateway, 1-2 conclusiones diarias). Opcional y sólo si se suma scraping de Zonaprop/Argenprop con proxies, podría haber un costo de proxies (estimado USD 10-30/mes) — evitable.

## Criterios de éxito Fase 1

1. Entrás a `/inmobiliario` y ves, por barrio de CABA + GBA Norte, **dos números**: precio de publicación y precio estimado de cierre — sin haber cargado nada.
2. **Precisión validable:** el precio estimado de cierre coincide razonablemente (±10%) con un sistema profesional de referencia (ej. el que usa la novia de Ezequiel / Reporte Inmobiliario). Este es el criterio rector.
3. Los datos se actualizan solos por cron (verificable en `calculado_en`).
4. El ranking muestra veredicto coherente por barrio, calculado sobre el precio de **cierre** (no de publicación).
5. El Top 10 de noticias se refresca y prioriza tu zona.
6. Si una fuente falla, el tablero sigue mostrando el último dato válido (resiliencia).
