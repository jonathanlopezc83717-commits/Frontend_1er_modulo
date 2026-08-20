-- ============================================================
-- Carpeta NAS por proyecto
-- ============================================================
-- Cada proyecto define la subcarpeta (relativa a la raíz vigilada
-- por el watcher NAS) donde viven sus archivos. Solo lectura para
-- la app: los snapshots siguen en {raíz}/.snapshots/{proyectoId}.
-- Se recrea listar_proyectos_con_meta para exponer la nueva columna.

alter table public.proyectos
  add column if not exists carpeta_nas text;

-- CREATE OR REPLACE no puede cambiar el tipo de retorno (columnas OUT):
-- se elimina y se recrea con carpeta_nas. Los grants se re-declaran abajo.
drop function if exists public.listar_proyectos_con_meta();

create or replace function public.listar_proyectos_con_meta()
returns table (
  id uuid,
  nombre text,
  descripcion text,
  carpeta_nas text,
  created_at timestamptz,
  updated_at timestamptz,
  creado_por uuid,
  miembros_count bigint,
  miembros_emails text[],
  puntos_count bigint,
  estado text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.nombre,
    p.descripcion,
    p.carpeta_nas,
    p.created_at,
    p.updated_at,
    p.creado_por,
    (select count(*) from public.proyecto_miembros m
      where m.proyecto_id = p.id) as miembros_count,
    (public.fn_miembros_emails(p.id))[1:5] as miembros_emails,
    (select count(*) from public.puntos_ferroviarios pf
      where pf.proyecto_id = p.id
        and pf.estado = 'activo') as puntos_count,
    p.estado
  from public.proyectos p
  order by p.nombre asc
$$;

grant execute on function public.listar_proyectos_con_meta() to authenticated;
grant execute on function public.listar_proyectos_con_meta() to service_role;
