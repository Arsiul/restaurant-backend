-- =====================================================================
-- 005  Alineacion con el sistema de modulos de la plataforma
--
-- POR QUE EXISTE ESTE ARCHIVO
--
-- La base viene con un sistema de permisos por modulo que NO pertenece a
-- este proyecto y que este repositorio no debe administrar:
--
--   cursos / curso_modulos / usuario_cursos / usuario_modulos
--   profiles.activo
--   app_tiene_modulo(clave)  ->  emp_exigir_modulo(clave)
--
-- Es una capa de plataforma compartida con otras aplicaciones del mismo
-- proyecto de Supabase. Aqui se CONSUME, nunca se altera: no se crea, no
-- se modifica y no se borra ninguna de esas tablas ni de esas funciones.
--
-- Lo que si es de este proyecto son las siete funciones empresa_*, y ahi
-- estaba el problema: en la base ya exigen modulo, pero 002 y 003 todavia
-- las emitian exigiendo rol. Reaplicar 002 desactivaba el sistema de
-- modulos entero, en silencio. Este archivo las vuelve a emitir tal como
-- estan vivas, de modo que correr 001..005 en orden reproduzca la base.
--
-- CLAVES DE MODULO, tomadas de lo que exige hoy cada funcion:
--
--   big_data.importar    ->  empresa_materializar
--   big_data.estructura  ->  las otras seis
-- =====================================================================

-- ---------------------------------------------------------------------
-- Modulos efectivos de quien llama
--
-- Espejo de app_tiene_modulo, pero devolviendo el conjunto en vez de
-- responder por una clave suelta: el backend lo necesita entero para
-- decidir que menu dibujar. Es de solo lectura sobre la plataforma.
--
-- Lleva prefijo emp_ para no invadir el espacio de nombres app_, que es
-- de la plataforma compartida.
-- ---------------------------------------------------------------------
create or replace function public.emp_mis_modulos()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- El administrador pasa por encima del reparto, igual que en
    -- app_tiene_modulo. Se le devuelve el catalogo activo completo.
    when exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.activo and p.role = 'admin'
    )
    then (
      select coalesce(array_agg(cm.clave), '{}')
        from public.curso_modulos cm
        join public.cursos c on c.id = cm.curso_id
       where cm.activo and c.activo
    )
    else (
      -- Hace falta estar inscrito en el curso Y tener el modulo asignado.
      select coalesce(array_agg(distinct cm.clave), '{}')
        from public.usuario_modulos um
        join public.curso_modulos cm on cm.id = um.modulo_id
        join public.cursos c on c.id = cm.curso_id
        join public.usuario_cursos uc
          on uc.user_id = um.user_id and uc.curso_id = c.id
        join public.profiles p on p.id = um.user_id
       where um.user_id = auth.uid()
         and p.activo and um.activo and uc.activo and cm.activo and c.activo
    )
  end
$$;

revoke all on function public.emp_mis_modulos() from public, anon;
grant execute on function public.emp_mis_modulos() to authenticated;

comment on function public.emp_mis_modulos() is
  'Modulos efectivos del usuario autenticado. Solo lectura sobre la capa de cursos, que es de la plataforma compartida.';


-- =====================================================================
-- Las siete funciones empresa_*, exigiendo modulo en vez de rol
--
-- Son identicas a las de 002 y 003 salvo por esa linea: se generaron a
-- partir de ellas justamente para que no se cuele ninguna otra
-- diferencia. Esta es la version que ya corre en la base; aqui queda
-- escrita para que el repositorio pueda reproducirla.
--
-- empresa_agregar_columna sale de 003, que es la que ademas cierra la
-- tarea que pedia esa columna.
-- =====================================================================
create or replace function public.empresa_tablas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  perform public.emp_exigir_modulo('big_data.estructura');

  select coalesce(jsonb_agg(jsonb_build_object('tabla', c.relname, 'filas', coalesce(s.n_live_tup, 0))
                            order by c.relname), '[]'::jsonb)
    into v
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where n.nspname = 'public'
    and c.relkind = 'r'
    and (c.relname = 'empresa_datos' or c.relname like 'emp\_%');

  return v;
end
$$;

create or replace function public.empresa_leer(
  p_tabla text default 'empresa_datos',
  p_limite integer default 25,
  p_desde integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tabla  text;
  v_limite integer;
  v_desde  integer;
  v_filas  jsonb;
  v_total  integer;
begin
  perform public.emp_exigir_modulo('big_data.estructura');

  v_tabla  := public.emp_validar_tabla(p_tabla);
  v_limite := least(greatest(coalesce(p_limite, 25), 1), 500);
  v_desde  := greatest(coalesce(p_desde, 0), 0);

  if to_regclass(format('public.%I', v_tabla)) is null then
    return jsonb_build_object('existe', false, 'tabla', v_tabla);
  end if;

  execute format(
    'select coalesce(jsonb_agg(t order by t.id), ''[]''::jsonb)
       from (select * from public.%I order by id limit %s offset %s) t',
    v_tabla, v_limite, v_desde
  ) into v_filas;

  execute format('select count(*)::int from public.%I', v_tabla) into v_total;

  return jsonb_build_object(
    'existe', true,
    'tabla', v_tabla,
    'total', v_total,
    'filas', v_filas,
    'columnas', (
      select coalesce(jsonb_agg(jsonb_build_object('columna', column_name, 'tipo', data_type)
                                order by ordinal_position), '[]'::jsonb)
      from information_schema.columns
      where table_schema = 'public' and table_name = v_tabla
    )
  );
end
$$;

create or replace function public.empresa_agregar_columna(
  p_tabla   text,
  p_columna text,
  p_tipo    text,
  p_defecto text default null,
  p_motivo  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tabla    text;
  v_columna  text;
  v_tipo     text;
  v_sufijo   text := '';
  v_sql      text;
  v_cerradas integer := 0;
begin
  perform public.emp_exigir_modulo('big_data.estructura');

  v_tabla   := public.emp_validar_tabla(p_tabla);
  v_columna := public.emp_validar_columna(p_columna);
  v_tipo    := public.emp_tipo_sql(p_tipo);

  if to_regclass(format('public.%I', v_tabla)) is null then
    raise exception 'La tabla % todavia no existe', v_tabla using errcode = '42P01';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = v_tabla and column_name = v_columna
  ) then
    raise exception 'La columna "%" ya existe en %', v_columna, v_tabla using errcode = '42701';
  end if;

  if nullif(btrim(coalesce(p_defecto, '')), '') is not null then
    v_sufijo := case lower(p_tipo)
      when 'entero'   then format(' default %s', coalesce(public.emp_a_entero(p_defecto)::text, 'null'))
      when 'numero'   then format(' default %s', coalesce(public.emp_a_numero(p_defecto)::text, 'null'))
      when 'moneda'   then format(' default %s', coalesce(public.emp_a_numero(p_defecto)::text, 'null'))
      when 'booleano' then format(' default %s', coalesce(public.emp_a_booleano(p_defecto)::text, 'null'))
      when 'fecha'    then format(' default %L', public.emp_a_fecha(p_defecto))
      else                 format(' default %L', btrim(p_defecto))
    end;
  end if;

  v_sql := format('alter table public.%I add column %I %s%s', v_tabla, v_columna, v_tipo, v_sufijo);
  execute v_sql;

  perform public.emp_registrar(
    v_tabla, 'add_column',
    jsonb_build_object('columna', v_columna, 'tipo', lower(p_tipo), 'valorDefecto', p_defecto),
    p_motivo, v_sql
  );

  -- Si habia una tarea pendiente pidiendo justo esta columna, se cierra.
  update public.tareas
     set estado = 'completada', completada_at = now(), cierre = 'automatico'
   where asignada_a = auth.uid()
     and estado = 'pendiente'
     and columna_sugerida = v_columna
     and tabla_destino = v_tabla;

  get diagnostics v_cerradas = row_count;

  return jsonb_build_object(
    'tabla', v_tabla,
    'columna', v_columna,
    'tipo', lower(p_tipo),
    'tareasCerradas', v_cerradas
  );
end
$$;

create or replace function public.empresa_crear_tabla(
  p_nombre   text,
  p_columnas jsonb,
  p_motivo   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tabla   text;
  v_cuerpo  text := '';
  v_sql     text;
  v_columna text;
  v_vistas  text[] := '{}';
  r         jsonb;
begin
  perform public.emp_exigir_modulo('big_data.estructura');

  v_tabla := lower(btrim(coalesce(p_nombre, '')));
  if v_tabla <> 'empresa_datos' and v_tabla not like 'emp\_%' then
    v_tabla := 'emp_' || v_tabla;
  end if;
  v_tabla := public.emp_validar_tabla(v_tabla);

  if to_regclass(format('public.%I', v_tabla)) is not null then
    raise exception 'La tabla "%" ya existe', v_tabla using errcode = '42P07';
  end if;

  if p_columnas is null or jsonb_typeof(p_columnas) <> 'array' or jsonb_array_length(p_columnas) = 0 then
    raise exception 'Define al menos una columna' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_columnas) loop
    v_columna := public.emp_validar_columna(r->>'nombre');

    if v_columna = any (v_vistas) then
      raise exception 'La columna "%" esta repetida', v_columna using errcode = '42701';
    end if;

    v_vistas := v_vistas || v_columna;
    v_cuerpo := v_cuerpo || format(', %I %s', v_columna, public.emp_tipo_sql(r->>'tipo'));
  end loop;

  v_sql := format(
    'create table public.%I (id bigint generated always as identity primary key%s, created_at timestamptz not null default now())',
    v_tabla, v_cuerpo
  );
  execute v_sql;

  execute format('alter table public.%I enable row level security', v_tabla);
  execute format(
    'create policy %I on public.%I for all to authenticated using (true) with check (true)',
    v_tabla || '_todo', v_tabla
  );

  perform public.emp_registrar(v_tabla, 'create_table', jsonb_build_object('columnas', p_columnas), p_motivo, v_sql);

  return jsonb_build_object('tabla', v_tabla, 'columnas', jsonb_array_length(p_columnas));
end
$$;

create or replace function public.empresa_eliminar_columna(
  p_tabla   text,
  p_columna text,
  p_motivo  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tabla   text;
  v_columna text;
  v_sql     text;
begin
  perform public.emp_exigir_modulo('big_data.estructura');

  v_tabla   := public.emp_validar_tabla(p_tabla);
  v_columna := public.emp_validar_columna(p_columna);

  v_sql := format('alter table public.%I drop column %I', v_tabla, v_columna);
  execute v_sql;

  perform public.emp_registrar(v_tabla, 'drop_column', jsonb_build_object('columna', v_columna), p_motivo, v_sql);

  return jsonb_build_object('tabla', v_tabla, 'columna', v_columna);
end
$$;

create or replace function public.empresa_actualizar_celda(
  p_tabla   text,
  p_id      bigint,
  p_columna text,
  p_valor   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tabla   text;
  v_columna text;
  v_tipo    text;
  v_expr    text;
begin
  perform public.emp_exigir_modulo('big_data.estructura');

  v_tabla   := public.emp_validar_tabla(p_tabla);
  v_columna := public.emp_validar_columna(p_columna);

  if p_id is null or p_id <= 0 then
    raise exception 'Identificador de fila no valido' using errcode = '22023';
  end if;

  select data_type into v_tipo
  from information_schema.columns
  where table_schema = 'public' and table_name = v_tabla and column_name = v_columna;

  if v_tipo is null then
    raise exception 'La columna "%" no existe en %', v_columna, v_tabla using errcode = '42703';
  end if;

  if nullif(btrim(coalesce(p_valor, '')), '') is null then
    v_expr := 'null';
  elsif v_tipo = 'boolean' then
    v_expr := coalesce(public.emp_a_booleano(p_valor)::text, 'null');
  elsif v_tipo in ('integer', 'bigint', 'smallint') then
    if public.emp_a_entero(p_valor) is null then
      raise exception '"%" no es un numero entero valido', p_valor using errcode = '22023';
    end if;
    v_expr := public.emp_a_entero(p_valor)::text;
  elsif v_tipo in ('numeric', 'double precision', 'real') then
    if public.emp_a_numero(p_valor) is null then
      raise exception '"%" no es un numero valido', p_valor using errcode = '22023';
    end if;
    v_expr := public.emp_a_numero(p_valor)::text;
  elsif v_tipo = 'date' then
    if public.emp_a_fecha(p_valor) is null then
      raise exception '"%" no es una fecha valida', p_valor using errcode = '22023';
    end if;
    v_expr := quote_literal(public.emp_a_fecha(p_valor));
  else
    v_expr := quote_literal(btrim(p_valor));
  end if;

  execute format('update public.%I set %I = %s where id = %s', v_tabla, v_columna, v_expr, p_id);

  return jsonb_build_object('tabla', v_tabla, 'id', p_id, 'columna', v_columna);
end
$$;

create or replace function public.empresa_materializar(
  p_import_id  bigint,
  p_estructura jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tabla    text := 'empresa_datos';
  v_creada   boolean := false;
  v_cuerpo   text := '';
  v_destinos text := '';
  v_origenes text := '';
  v_columna  text;
  v_filas    integer;
  r          jsonb;
begin
  perform public.emp_exigir_modulo('big_data.importar');

  if not exists (select 1 from public.imports where id = p_import_id) then
    raise exception 'La importacion % no existe', p_import_id using errcode = '42P01';
  end if;

  if p_estructura is null or jsonb_typeof(p_estructura) <> 'array' or jsonb_array_length(p_estructura) = 0 then
    raise exception 'La estructura del archivo llego vacia' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_estructura) loop
    v_columna  := public.emp_validar_columna(r->>'columna');
    v_cuerpo   := v_cuerpo || format(', %I %s', v_columna, public.emp_tipo_sql(r->>'tipo'));
    v_destinos := v_destinos || format(', %I', v_columna);
    v_origenes := v_origenes || ', ' || public.emp_expresion(r->>'original', r->>'tipo');
  end loop;

  if to_regclass(format('public.%I', v_tabla)) is null then
    execute format(
      'create table public.%I (id bigint generated always as identity primary key,
         import_id bigint, fila integer%s, created_at timestamptz not null default now())',
      v_tabla, v_cuerpo
    );
    execute format('alter table public.%I enable row level security', v_tabla);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      v_tabla || '_todo', v_tabla
    );
    v_creada := true;
  else
    for r in select * from jsonb_array_elements(p_estructura) loop
      v_columna := public.emp_validar_columna(r->>'columna');
      execute format('alter table public.%I add column if not exists %I %s',
                     v_tabla, v_columna, public.emp_tipo_sql(r->>'tipo'));
    end loop;
  end if;

  execute format(
    'insert into public.%I (import_id, fila%s) select r.import_id, r.fila%s
       from public.import_rows r where r.import_id = %s order by r.fila',
    v_tabla, v_destinos, v_origenes, p_import_id
  );

  get diagnostics v_filas = row_count;

  perform public.emp_registrar(
    v_tabla,
    case when v_creada then 'create_table' else 'add_column' end,
    jsonb_build_object('importId', p_import_id, 'filas', v_filas, 'columnas', p_estructura),
    case when v_creada then 'Creada al importar el primer archivo de la empresa'
         else 'Ampliada al importar un archivo nuevo de la empresa' end,
    format('-- materializar import %s en %s', p_import_id, v_tabla)
  );

  update public.imports set tabla_fisica = v_tabla where id = p_import_id;

  return jsonb_build_object('tabla', v_tabla, 'creada', v_creada, 'filas', v_filas,
                            'columnas', jsonb_array_length(p_estructura));
end
$$;


-- Los ayudantes siguen sin exponerse por PostgREST; las publicas solo se
-- invocan con sesion iniciada.
revoke all on function
  public.empresa_tablas(), public.empresa_leer(text, integer, integer),
  public.empresa_agregar_columna(text, text, text, text, text),
  public.empresa_crear_tabla(text, jsonb, text),
  public.empresa_eliminar_columna(text, text, text),
  public.empresa_actualizar_celda(text, bigint, text, text),
  public.empresa_materializar(bigint, jsonb)
from public, anon;

grant execute on function
  public.empresa_tablas(), public.empresa_leer(text, integer, integer),
  public.empresa_agregar_columna(text, text, text, text, text),
  public.empresa_crear_tabla(text, jsonb, text),
  public.empresa_eliminar_columna(text, text, text),
  public.empresa_actualizar_celda(text, bigint, text, text),
  public.empresa_materializar(bigint, jsonb)
to authenticated;

-- emp_exigir_trabajador() queda huerfana: ya no la invoca nadie. Se deja
-- en pie porque borrarla no aporta nada y podria romper algo de la
-- plataforma que no vemos desde aqui.
