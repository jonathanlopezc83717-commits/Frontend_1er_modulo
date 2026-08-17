-- ============================================================
-- Login & multi-project isolation — PR#1 (auth + RLS foundation)
-- Change: login-multiproyecto (tasks 1.1 + 1.2)
--
-- 1) enum rol_usuario + tabla perfiles (1 fila por auth.users)
-- 2) trigger auth.users INSERT -> perfiles (SECURITY DEFINER)
-- 3) bootstrap: primer usuario -> administrador (pg_advisory_xact_lock)
-- 4) congelamiento de rol: no-admins no pueden cambiar rol
-- 5) helpers fn_rol_actual()/fn_es_admin() (SECURITY DEFINER con
--    search_path fijo: evita la recursión clásica de policies en perfiles)
-- 6) RLS en perfiles: fila propia OR admin
-- 7) baseline authenticated-only reemplazando "Allow all" en las
--    7 tablas vivas + image_analyses (se elimina el insert público)
-- ============================================================

create type public.rol_usuario as enum ('administrador', 'general', 'usuario');

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text,
  rol public.rol_usuario not null default 'usuario',
  debe_cambiar_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- helpers ----
-- SECURITY DEFINER (owner = postgres, bypassa RLS de perfiles):
-- las policies de perfiles pueden llamarlas sin recursión.
create or replace function public.fn_rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select p.rol from public.perfiles p where p.id = auth.uid()
$$;

create or replace function public.fn_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.fn_rol_actual() = 'administrador', false)
$$;

-- ---- provisión de perfiles al crear usuario ----
create or replace function public.fn_crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_crear_perfil_usuario
after insert on auth.users
for each row execute function public.fn_crear_perfil_usuario();

-- ---- bootstrap: el primer usuario queda administrador ----
create or replace function public.fn_primer_usuario_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(2026081701);
  if (select count(*) from public.perfiles) = 0 then
    new.rol := 'administrador';
  end if;
  return new;
end;
$$;

create trigger trg_primer_usuario_admin
before insert on public.perfiles
for each row execute function public.fn_primer_usuario_admin();

-- ---- congelamiento de rol (service role / auth.uid() null sí puede) ----
create or replace function public.fn_congelar_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rol is distinct from old.rol
     and auth.uid() is not null
     and not public.fn_es_admin() then
    raise exception 'Solo un administrador puede cambiar el rol de un usuario';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_congelar_rol
before update on public.perfiles
for each row execute function public.fn_congelar_rol();

-- ---- RLS perfiles ----
alter table public.perfiles enable row level security;

create policy perfiles_select on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.fn_es_admin());

create policy perfiles_update on public.perfiles
  for update to authenticated
  using (id = auth.uid() or public.fn_es_admin())
  with check (id = auth.uid() or public.fn_es_admin());
-- sin policies de insert/delete: las filas las crea el trigger y las
-- gestiona el service role; ambos bypassan estas policies.

-- ---- baseline: "Allow all" -> authenticated-only ----
-- (PR#2 ajustará puntos/hijos/snapshots a policies de membership)
drop policy if exists "Allow all" on public.puntos_ferroviarios;
drop policy if exists "Allow all" on public.coordenadas_gps;
drop policy if exists "Allow all" on public.documentos_punto;
drop policy if exists "Allow all" on public.analisis_imagenes;
drop policy if exists "Allow all" on public.fotos_punto;
drop policy if exists "Allow all" on public.historial_obras;
drop policy if exists allow_all_app_state_snapshots on public.app_state_snapshots;

create policy authenticated_baseline on public.puntos_ferroviarios
  for all to authenticated using (true) with check (true);
create policy authenticated_baseline on public.coordenadas_gps
  for all to authenticated using (true) with check (true);
create policy authenticated_baseline on public.documentos_punto
  for all to authenticated using (true) with check (true);
create policy authenticated_baseline on public.analisis_imagenes
  for all to authenticated using (true) with check (true);
create policy authenticated_baseline on public.fotos_punto
  for all to authenticated using (true) with check (true);
create policy authenticated_baseline on public.historial_obras
  for all to authenticated using (true) with check (true);
create policy authenticated_baseline on public.app_state_snapshots
  for all to authenticated using (true) with check (true);

-- image_analyses (legacy): solo lectura authenticated, sin insert público
-- ("Allow all" lo crea 20250101000001_fix_coordenadas_gps.sql)
drop policy if exists "Allow public read" on public.image_analyses;
drop policy if exists "Allow public insert" on public.image_analyses;
drop policy if exists "Allow all" on public.image_analyses;

create policy authenticated_baseline on public.image_analyses
  for select to authenticated using (true);

-- ---- grants explícitos ----
-- (auto_expose_new_tables dejó de aplicar defaults a tablas de migrations;
--  sin esto, ni anon ni authenticated tienen privilegios tras un reset)
grant usage on type public.rol_usuario to anon, authenticated, service_role;
-- anon: solo privilegio de lectura; RLS devuelve 0 filas (sin policies TO anon)
grant select on public.perfiles to anon;
grant select, update on public.perfiles to authenticated, service_role;
-- baseline tables + image_analyses: privilegio completo, RLS es quien filtra
-- (anon queda en 0 filas: no tiene ninguna policy)
grant all on public.puntos_ferroviarios, public.coordenadas_gps,
  public.documentos_punto, public.analisis_imagenes, public.fotos_punto,
  public.historial_obras, public.app_state_snapshots, public.image_analyses
  to anon, authenticated, service_role;
grant execute on function public.fn_rol_actual() to anon, authenticated, service_role;
grant execute on function public.fn_es_admin() to anon, authenticated, service_role;
