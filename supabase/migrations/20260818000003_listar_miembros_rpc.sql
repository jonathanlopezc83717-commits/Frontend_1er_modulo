-- listar_miembros: reemplaza el join embebido proyecto_miembros->perfiles
-- de PostgREST, que falla con PGRST200 (no existe FK directa: user_id apunta
-- a auth.users). SECURITY DEFINER expone emails de co-miembros al gestor
-- (misma decision que fn_miembros_emails); guard: admin o miembro del proyecto.

create or replace function public.listar_miembros(p_proyecto uuid)
returns table (
  user_id uuid,
  email text,
  nombre text,
  rol public.rol_usuario,
  creado_por uuid,
  creado_en timestamptz
)
language sql
security definer
set search_path = public
as $$
  select m.user_id, p.email, p.nombre, p.rol, m.creado_por, m.creado_en
  from public.proyecto_miembros m
  join public.perfiles p on p.id = m.user_id
  where m.proyecto_id = p_proyecto
    and (public.fn_es_admin() or public.fn_es_miembro(p_proyecto))
  order by p.email
$$;

grant execute on function public.listar_miembros(uuid) to authenticated;
