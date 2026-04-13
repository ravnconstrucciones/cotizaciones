-- Ítems de catálogo para rubro Siding (solo precio material; M.O. en 0).
-- Requiere un rubro cuyo nombre contenga "siding" (p. ej. "Siding", "Revestimiento siding").
-- Si no hay coincidencia, este script no inserta filas: creá el rubro en Catálogo y volvé a ejecutar.

WITH r AS (
  SELECT id
  FROM public.rubros
  WHERE nombre ILIKE '%siding%'
  ORDER BY id
  LIMIT 1
),
v (nombre_item, unidad, pm) AS (
  VALUES
    ('SIDING CEDAR 8 MM 3600 x 200 mm', 'placa', 21767.20),
    ('OMEGA ANTISONORO perforada tira 2,60 m', 'ml', 4314.92),
    ('SOLERA 35x30 mm C-0,50 tira 2,60 m', 'ml', 4117.78),
    ('CANTONERA METÁLICA tira 2,60 m', 'ml', 2819.24),
    ('BUÑAS PERIMETRALES Z tira 2,80 m', 'ml', 4049.10),
    ('TORNILLO T2 ALAS x UNIDAD 8 x 1 1/4 TEL', 'un', 67.02),
    ('TORNILLO T1 MECHA x UNIDAD 8 x 1/2', 'un', 17.38),
    ('UNIPEGA PU40 blanco/gris/negro cartucho 280 ml', 'un', 16165.11),
    ('TRANSPORTE', 'un', 20000.00),
    ('AISLAHOME 1,50 x 20 m (30 m²)', 'm2', 35862.36)
)
INSERT INTO public.recetas (
  rubro_id,
  nombre_item,
  unidad,
  costo_base_material_unitario,
  costo_base_mo_unitario
)
SELECT
  r.id,
  v.nombre_item,
  v.unidad,
  v.pm::double precision,
  0::double precision
FROM r
CROSS JOIN v
WHERE NOT EXISTS (
  SELECT 1
  FROM public.recetas e
  WHERE e.rubro_id = r.id
    AND e.nombre_item = v.nombre_item
);
