-- =====================================================================
-- 008  Una importacion no se puede repetir
--
-- Hasta aqui el mismo archivo se podia cargar dos veces, y cada carga
-- volcaba otra vez sus filas en empresa_datos: los datos quedaban
-- duplicados sin que nada lo advirtiera.
--
-- La huella se calcula sobre las filas leidas y no sobre los bytes del
-- fichero. El mismo CSV guardado con otra codificacion o exportado de
-- nuevo desde Excel da bytes distintos y los mismos datos, y lo que
-- importa es si esos datos ya estan.
--
-- Solo se agrega una columna a `imports`, que es tabla de este proyecto.
-- Nada de la capa de plataforma se toca.
-- =====================================================================

alter table public.imports add column if not exists huella text;

create index if not exists imports_huella_idx on public.imports (huella);

-- Las importaciones anteriores no tienen huella. Se rellenan con
-- scripts/rellenar-huella.mjs, que la calcula con la misma funcion que usa
-- el servidor: hacerlo aqui en SQL daria un valor distinto al del backend
-- y el control no serviria de nada.

select
  count(*) as importaciones,
  count(huella) as con_huella,
  count(*) - count(huella) as pendientes
from public.imports;
