# Tablero de Inteligencia Inmobiliaria RAVN — Diseño

**Fecha:** 2026-05-22
**Autor:** Ezequiel Otero + Claude
**Estado:** Aprobado para implementación (Fase 1)

## Propósito

RAVN suma una pata de negocio inmobiliario. Este módulo es un **tablero de control automático** que muestra precio/m² de venta y de construcción por zona, evolución del mercado, y un ranking de barrios con veredicto "Construir / Comprar / Esperar". El objetivo es que Ezequiel tome decisiones de inversión inmobiliaria con datos reales, sin cargar nada a mano: el sistema se actualiza solo.

A futuro se convierte en un "cerebro inmobiliario" que lee noticias del sector y genera conclusiones con IA. Esa capa se construye en Fase 2; la arquitectura de Fase 1 queda preparada para recibirla sin reescritura.

## Decisiones tomadas en brainstorming

- **Layout:** Datos protagonistas (Opción B). Al entrar se ven KPIs + gráfico de tendencia + ranking de barrios. El mapa es una vista secundaria, a un click.
- **Fuente de datos:** Automática (no carga manual). Fase 1 arranca con la API de MercadoLibre Inmuebles; el scraping de Zonaprop/Argenprop es Fase 2.
- **Cobertura inicial:** CABA + GBA Norte (zona de operación real de RAVN: Nordelta, zona norte, Capital). Expansión a todo el país en fase posterior.
- **IA (cerebro):** Diferida a Fase 2. La app NO usa el plan Max de Claude — la API se factura por uso (estimado < USD 1/mes para 1-2 conclusiones diarias). Se decidió arrancar sin IA y agregarla después.

## Alcance — Fase 1 (este spec)

Lo que SÍ entra:

1. **Ingesta automática de datos** desde la API de MercadoLibre Inmuebles, por zona (CABA + GBA Norte), guardada en Supabase con histórico.
2. **Cálculo de precio/m²** agregado por barrio (venta) a partir de los avisos ingeridos: mediana USD/m², cantidad de avisos, variación período a período.
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

- **API de MercadoLibre:** ML restringió accesos en el tiempo. El endpoint de búsqueda de ítems puede requerir OAuth y tener límites de rate. **Primer paso de implementación: validar acceso real a la API de inmuebles de ML** antes de construir sobre ella. Si está bloqueada, fallback a: (a) feed de datos de Properati/otra fuente abierta, o (b) scraping acotado como adelanto de Fase 2. Esta validación es bloqueante.
- **Calidad de datos:** los avisos traen outliers (precios mal cargados, m² erróneos). Se filtran por percentiles (descartar P5 inferior y P95 superior) y se usa **mediana**, no promedio, para el USD/m².
- **Normalización de zonas:** mapear los nombres de barrio/partido de ML a una taxonomía propia de RAVN (tabla `zonas`) para evitar duplicados ("Palermo Soho" vs "Palermo").

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
  fuente        text         -- 'mercadolibre'
  fuente_id     text         -- id del aviso en la fuente (dedup)
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
  mediana_usd_m2 numeric
  p25_usd_m2    numeric
  p75_usd_m2    numeric
  n_avisos      int
  var_mensual   numeric      -- % vs período anterior
  costo_constr_usd_m2 numeric -- derivado del maestro de precios RAVN
  veredicto     text         -- 'construir' | 'comprar' | 'esperar' (heurística)
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
  fuentes/mercadolibre.ts       -- cliente API ML + normalización a avisos_snapshot
  fuentes/noticias-rss.ts       -- parser de feeds RSS de medios
  agregar-precios.ts            -- snapshot crudo -> precios_zona_periodo (mediana, percentiles, filtros)
  costo-construccion.ts         -- deriva costo USD/m² del maestro de precios RAVN
  veredicto.ts                  -- heurística construir/comprar/esperar
  zonas-seed.ts                 -- taxonomía inicial CABA + GBA Norte

src/app/api/inmobiliario/
  refresh-precios/route.ts      -- ingesta ML + agregación (cron diario)
  refresh-noticias/route.ts     -- ingesta RSS (cron horario)
  tablero/route.ts              -- lee precios_zona_periodo + noticias para el front
```

### Flujo de datos

```
[Cron diario]  -> /api/inmobiliario/refresh-precios
                  -> mercadolibre.ts (fetch por zona)
                  -> avisos_snapshot (insert, dedup por fuente_id)
                  -> agregar-precios.ts (mediana/percentiles/filtros outliers)
                  -> costo-construccion.ts (maestro RAVN)
                  -> veredicto.ts
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

## Criterios de éxito Fase 1

1. Entrás a `/inmobiliario` y ves precio/m² real por barrio de CABA + GBA Norte, sin haber cargado nada.
2. Los datos se actualizan solos por cron (verificable en `calculado_en`).
3. El ranking muestra veredicto coherente por barrio.
4. El Top 10 de noticias se refresca y prioriza tu zona.
5. Si una fuente falla, el tablero sigue mostrando el último dato válido.
