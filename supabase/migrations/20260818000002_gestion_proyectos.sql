-- ============================================================
-- Gestión de proyectos — PR#4 (meta enriquecida, actividad y
-- soft delete)
-- Change: gestion-proyectos
--
-- 1) proyectos.estado ('activo'|'eliminado') + updated_at
-- 2) trigger BEFORE UPDATE en proyectos: toca updated_at
-- 3) trigger AFTER INSERT/UPDATE en puntos_ferroviarios:
--    actualiza proyectos.updated_at (SECURITY DEFINER,
--    search_path fijo — mismo patrón anti-recursión que PR#1)
-- 4) RPC eliminar_proyecto: soft delete, sólo admin o creado_por
-- 5) SELECT de proyectos excluye eliminados para no-admins
-- 6) RPC listar_proyectos_con_meta (SECURITY INVOKER: aplica
--    RLS del llamador) + helper definer de emails
-- 7) revoke delete: la eliminación es sólo por RPC
-- ============================================================

alter table public.proyectos
  add column if not exists estado text not null default 'activo'
    check (estado in ('activo', 'eliminado'));

alter table public.proyectos
  add column if not exists updated_at timestamptz not null default now();

-- ---- touch de updated_at en ediciones del proyecto ----
create or replace function public.fn_proyectos_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_proyectos_updated_at on public.proyectos;
create trigger trg_proyectos_updated_at
before update on public.proyectos
for each row execute function public.fn_proyectos_touch_updated_at();

-- ---- actividad: guardar punto toca updated_at del proyecto ----
create or replace function public.fn_punto_toca_proyecto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.proyecto_id is not null then
    update public.proyectos
      set updated_at = now()
      where id = new.proyecto_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_punto_toca_proyecto on public.puntos_ferroviarios;
create trigger trg_punto_toca_proyecto
after insert or update on public.puntos_ferroviarios
for each row execute function public.fn_punto_toca_proyecto();

-- ---- soft delete por RPC (nunca destruye datos) ----
create or replace function public.eliminar_proyecto(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.fn_es_admin()
     and not exists (
       select 1 from public.proyectos p
       where p.id = p_id and p.creado_por = auth.uid()
     ) then
    raise exception 'No tenés permiso para eliminar este proyecto';
  end if;

  update public.proyectos
    set estado = 'eliminado'
    where id = p_id;
end;
$$;

-- ---- RLS: eliminados invisibles para no-admins ----
-- (el admin conserva visibilidad total: recuperable vía SQL)
drop policy if exists proyectos_select on public.proyectos;

create policy proyectos_select on public.proyectos
  for select to authenticated
  using (
    public.fn_es_admin()
    or (estado = 'activo' and public.fn_es_miembro(id))
  );

-- ---- helper de emails (definer con guard de membresía/admin):
-- perfiles sólo expone la fila propia, el picker necesita los
-- emails de todos los miembros del proyecto visible ----
create or replace function public.fn_miembros_emails(p_proyecto uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(pr.email order by pr.email),
    array[]::text[]
  )
  from public.proyecto_miembros m
  join public.perfiles pr on pr.id = m.user_id
  where m.proyecto_id = p_proyecto
    and (public.fn_es_admin() or public.fn_es_miembro(p_proyecto))
$$;

-- ---- meta enriquecida: aplica la visibilidad RLS del llamador ----
create or replace function public.listar_proyectos_con_meta()
returns table (
  id uuid,
  nombre text,
  descripcion text,
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

-- ---- grants (auto_expose inactivo) ----
grant execute on function public.eliminar_proyecto(uuid) to authenticated;
grant execute on function public.listar_proyectos_con_meta() to authenticated;
grant execute on function public.fn_miembros_emails(uuid) to authenticated;
grant execute on function public.eliminar_proyecto(uuid) to service_role;
grant execute on function public.listar_proyectos_con_meta() to service_role;
grant execute on function public.fn_miembros_emails(uuid) to service_role;

-- belt+braces: nunca delete físico desde el cliente
revoke delete on public.proyectos from authenticated;
