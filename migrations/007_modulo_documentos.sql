-- =====================================================================
-- 007  El modulo de Documentos dentro de Big Data
--
-- Solo se inserta una fila en el catalogo. No se crea, altera ni elimina
-- ninguna tabla: la infraestructura de documentos ya existe en la
-- plataforma compartida y aqui unicamente se consume.
--
--   storage.buckets   documentos-cursos   privado, 25 MB, 7 tipos
--   documentos_curso  la ficha de cada archivo, con RLS y sin politicas
--
-- Que la tabla tenga RLS activo y cero politicas no es un descuido: hace
-- que solo la clave de servicio llegue a ella. Por eso este modulo pasa
-- entero por el backend, sin las funciones RPC que necesito el modulo del
-- trabajador.
--
-- La columna documentos_curso.modulo_id ya estaba prevista y sin usar. Un
-- documento puede quedar general del curso (null) o colgar de un modulo
-- concreto; el trigger validar_documento_modulo_curso comprueba que ese
-- modulo pertenezca al curso.
-- =====================================================================

insert into public.curso_modulos (curso_id, clave, nombre, slug, descripcion, orden, activo)
select 1, 'big_data.documentos', 'Documentos', 'documentos',
       'Documentacion de respaldo del curso: manuales, informes y anexos.', 7, true
where not exists (
  select 1 from public.curso_modulos where clave = 'big_data.documentos'
);

select id, clave, nombre, orden, activo
  from public.curso_modulos
 where curso_id = 1
 order by orden;
