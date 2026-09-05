-- Deja la base lista para empezar de cero.
--
-- Borra unicamente los datos: archivos importados, su contenido, las tareas
-- y las tablas que se crearon a partir de una importacion. No toca el
-- esquema, las funciones RPC, las politicas ni los usuarios.

delete from public.tareas;

-- import_rows cae solo por la clave foranea con on delete cascade
delete from public.imports;

delete from public.cambios_estructura;

-- empresa_datos y cualquier emp_* que haya creado el trabajador
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (c.relname = 'empresa_datos' or c.relname like 'emp\_%')
  loop
    execute format('drop table public.%I cascade', r.relname);
  end loop;
end
$$;

-- Los contadores vuelven a 1 para que la numeracion empiece limpia
alter table public.imports alter column id restart with 1;
alter table public.tareas  alter column id restart with 1;

-- Resultado, para verificar en la misma corrida
select
  (select count(*) from public.imports)            as imports,
  (select count(*) from public.import_rows)        as import_rows,
  (select count(*) from public.tareas)             as tareas,
  (select count(*) from public.cambios_estructura) as cambios,
  (select count(*) from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname = 'empresa_datos' or c.relname like 'emp\_%')) as tablas_materializadas,
  (select count(*) from public.profiles)           as perfiles_intactos;
