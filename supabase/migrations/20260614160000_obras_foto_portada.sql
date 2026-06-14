-- obras.foto_portada_path: la foto de PORTADA que Eze elige a mano para cada
-- proyecto (rediseño /obras estilo "Projects" — carrusel con foto por obra).
--
-- Separada a propósito de obra_archivos.tipo='foto' (que junta TODO lo que el
-- bot recibe por WhatsApp): la portada es una elección manual, no la última
-- foto que entró. Guarda el storage_path dentro del bucket privado existente
-- `obra-archivos`; la lectura es server-side por signed URL (admin client).
--
-- Sin cambios de RLS: la columna hereda la RLS de obras. El upload y el set de
-- la columna van por una ruta server-side con admin client (no por el cliente).

alter table public.obras
  add column if not exists foto_portada_path text;

comment on column public.obras.foto_portada_path is
  'Storage path (bucket privado obra-archivos) de la foto de portada elegida a mano para el proyecto. Lectura server-side por signed URL. NULL = sin portada (la card muestra placeholder).';
