-- =====================================================================
-- 004  Usuario como identificador, alta desde el panel y acceso total
--      del administrador a los modulos del trabajador
--
-- Tres cosas:
--   1. profiles gana la columna "usuario": el identificador corto con el
--      que se conoce a cada persona dentro de la empresa. El inicio de
--      sesion sigue siendo por correo, pero el correo se arma a partir
--      del usuario y del dominio de la empresa.
--   2. El trigger de alta respeta el usuario que llega en la metadata,
--      resolviendo colisiones por su cuenta.
--   3. emp_exigir_trabajador() pasa a admitir tambien al administrador,
--      porque desde ahora el admin entra a todos los modulos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles.usuario
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists usuario text;

-- Normaliza un texto a identificador de usuario y le agrega un numero si
-- ya esta tomado. Se usa tanto en el backfill como en el alta.
create or replace function public.emp_usuario_libre(p_base text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_try  text;
  n      integer := 1;
begin
  v_base := lower(btrim(coalesce(p_base, '')));
  v_base := translate(v_base, 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
  v_base := regexp_replace(v_base, '[^a-z0-9_.]+', '', 'g');

  if v_base = '' then
    v_base := 'usuario';
  end if;

  v_try := v_base;

  while exists (select 1 from public.profiles where lower(usuario) = v_try) loop
    n := n + 1;
    v_try := v_base || n::text;
  end loop;

  return v_try;
end
$$;

-- Backfill de los perfiles que ya existian. Se numera dentro de la misma
-- sentencia porque la funcion no veria las filas que la propia consulta
-- esta escribiendo.
with base as (
  select
    id,
    regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_.]+', '', 'g') as u,
    row_number() over (
      partition by regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_.]+', '', 'g')
      order by created_at
    ) as n
  from public.profiles
  where usuario is null
)
update public.profiles p
   set usuario = case when b.n = 1 then nullif(b.u, '') else nullif(b.u, '') || b.n::text end
  from base b
 where b.id = p.id;

update public.profiles set usuario = public.emp_usuario_libre('usuario') where usuario is null;

create unique index if not exists profiles_usuario_key on public.profiles (lower(usuario));

alter table public.profiles alter column usuario set not null;

-- ---------------------------------------------------------------------
-- 2. Alta de perfiles
--
-- El rol NUNCA sale de la metadata: cualquiera podria mandar
-- role = 'admin' al registrarse. Nace siempre como trabajador y el
-- administrador lo cambia despues con la clave de servicio.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario text;
begin
  v_usuario := public.emp_usuario_libre(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'usuario'), ''),
      split_part(new.email, '@', 1)
    )
  );

  insert into public.profiles (id, email, full_name, usuario)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_usuario
  )
  on conflict (id) do nothing;

  return new;
end
$$;

-- ---------------------------------------------------------------------
-- 3. El administrador entra a los modulos del trabajador
--
-- La funcion conserva su nombre a proposito: la invocan las siete
-- funciones empresa_* de 002 y 003, y volver a emitirlas aqui solo para
-- cambiarles una linea dejaria dos definiciones compitiendo por la misma
-- firma, que es justo lo que hay que evitar en este esquema.
-- ---------------------------------------------------------------------
create or replace function public.emp_exigir_trabajador()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_rol text;
begin
  v_id := auth.uid();

  if v_id is null then
    raise exception 'Sesion no valida' using errcode = '42501';
  end if;

  select role into v_rol from public.profiles where id = v_id;

  if v_rol is null then
    raise exception 'El usuario no tiene un perfil asignado' using errcode = '42501';
  end if;

  if v_rol not in ('trabajador', 'admin') then
    raise exception 'Esta operacion requiere una cuenta de la empresa' using errcode = '42501';
  end if;

  return v_id;
end
$$;

comment on function public.emp_exigir_trabajador() is
  'Guarda de los modulos de datos. Admite trabajador y admin: el administrador tiene acceso a todos los modulos desde 004. El nombre se conserva porque lo invocan las funciones empresa_* de 002 y 003.';

revoke all on function public.emp_usuario_libre(text) from public, anon, authenticated;
