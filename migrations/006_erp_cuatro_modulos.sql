-- =====================================================================
-- 006  El sistema pasa a ser un ERP de cuatro modulos
--
-- Hasta aqui la aplicacion entraba directo a las pantallas de Big Data,
-- como si fuera todo lo que hay. Desde ahora Big Data es UNO de los cuatro
-- modulos del ERP, y todo lo construido vive dentro de el:
--
--   ERP
--   |- Big Data     Importar datos, Datasets, Analisis, Comparacion,
--   |               Estructura de datos, Graficos
--   |- Modulo 2     vacio
--   |- Modulo 3     vacio
--   |- Modulo 4     vacio
--
-- Los tres nuevos nacen sin ningun `curso_modulos`: son el marcador del
-- lugar que van a ocupar, y se renombran cuando se sepa que van a ser.
--
-- Esto es solo data. No se toca el esquema de la capa de cursos, que es de
-- la plataforma: se agregan filas a las tablas que existen justamente para
-- describir esta estructura.
--
-- El reparto de accesos ya funcionaba asi y no cambia nada:
--
--   acceso  =  estar en `usuario_cursos`  Y  tener el modulo en `usuario_modulos`
--
-- Es decir: el administrador da permiso al modulo del ERP, y dentro elige
-- si concede todas sus pantallas, algunas o una sola.
-- =====================================================================

insert into public.cursos (nombre, slug, descripcion, orden, activo)
values
  ('Modulo 2', 'modulo-2', 'Pendiente de definir. Todavia no tiene pantallas.', 2, true),
  ('Modulo 3', 'modulo-3', 'Pendiente de definir. Todavia no tiene pantallas.', 3, true),
  ('Modulo 4', 'modulo-4', 'Pendiente de definir. Todavia no tiene pantallas.', 4, true)
on conflict (slug) do nothing;

-- Resultado, para verificar en la misma corrida
select
  c.id,
  c.nombre,
  c.slug,
  c.orden,
  count(cm.id) filter (where cm.activo) as modulos
from public.cursos c
left join public.curso_modulos cm on cm.curso_id = c.id
group by c.id, c.nombre, c.slug, c.orden
order by c.orden;
