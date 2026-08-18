-- Verificación RLS — PR#1 + PR#2 (login-multiproyecto, tasks 1.3 + 2.3)
-- Ejecutar tras `supabase db reset` contra la BD local (puerto 54322):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/queries/verify_rls.sql
--
-- Personas:
--   anon     -> 0 filas en todas las tablas protegidas; insert rechazado
--   tercero  -> general: crea proyecto (trigger de membresía), invita miembro,
--               escribe punto en su proyecto
--   segundo  -> usuario: sólo ve P1 (miembro), P2 y legacy NULL invisibles,
--               no puede crear proyecto ni puntos ajenos, snapshots por
--               usuario+proyecto, perfiles sin recursión, rol congelado
--   primero  -> administrador: ve todos los proyectos y puntos (incl. legacy)
-- Todo corre en una transacción con ROLLBACK final: no deja rastros.

begin;

-- helper de aserción: el booleano se evalúa con el rol activo (invoker)
create or replace function public.verify_assert(cond boolean, msg text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(cond, false) then
    raise exception 'VERIFY FAILED: %', msg;
  end if;
end;
$$;

-- usuarios de prueba (el trigger trg_crear_perfil_usuario crea sus perfiles)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'primero@verify-rls.local', 'x', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  'tok-verify-1', 'tok-verify-1', 'tok-verify-1', 'tok-verify-1'
), (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated',
  'segundo@verify-rls.local', 'x', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  'tok-verify-2', 'tok-verify-2', 'tok-verify-2', 'tok-verify-2'
), (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-4444-444444444444',
  'authenticated', 'authenticated',
  'tercero@verify-rls.local', 'x', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  'tok-verify-4', 'tok-verify-4', 'tok-verify-4', 'tok-verify-4'
);

-- bootstrap: primer usuario administrador, segundo no auto-promovido
select public.verify_assert(
  (select rol = 'administrador' from public.perfiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'el primer usuario debe quedar administrador');
select public.verify_assert(
  (select rol = 'usuario' from public.perfiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'el segundo usuario NO debe ser auto-promovido');

-- tercero se promueve a general como postgres (el freeze permite uid null)
update public.perfiles set rol = 'general'
  where id = '44444444-4444-4444-4444-444444444444';

-- ---------- persona: tercero (general) ----------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '44444444-4444-4444-4444-444444444444',
                    'role', 'authenticated')::text,
  true);

-- general crea el proyecto P1 (creado_por toma auth.uid() por defecto)
insert into public.proyectos (id, nombre) values (
  'aaaaaaaa-0000-0000-0000-000000000001', 'Proyecto Uno verify');

-- trigger de membresía: el creador queda miembro
select public.verify_assert(
  (select count(*) = 1 from public.proyecto_miembros
    where proyecto_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and user_id = '44444444-4444-4444-4444-444444444444'),
  'el creador debe quedar miembro de su proyecto');

-- miembro del proyecto asigna a segundo (general gestiona P1 propio)
insert into public.proyecto_miembros (proyecto_id, user_id, creado_por) values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444');

-- punto dentro de P1 (con modulo_data del round-trip de PR-A)
insert into public.puntos_ferroviarios (
  id, numero_serie, nombre, estado, proyecto_id, modulo_data
) values (
  '33333333-3333-3333-3333-333333333333', 1, 'Punto verify P1', 'activo',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '{"croquis":{"notas":"verify"}}'::jsonb);

reset role;

-- ---------- datos de contraste (postgres, bypassa RLS) ----------
-- P2 del admin; punto en P2; punto legacy sin proyecto; snapshot legacy
insert into public.proyectos (id, nombre, creado_por) values (
  'aaaaaaaa-0000-0000-0000-000000000002', 'Proyecto Dos verify',
  '11111111-1111-1111-1111-111111111111');
insert into public.puntos_ferroviarios (id, numero_serie, nombre, estado, proyecto_id) values (
  '55555555-5555-5555-5555-555555555555', 2, 'Punto verify P2', 'activo',
  'aaaaaaaa-0000-0000-0000-000000000002');
insert into public.puntos_ferroviarios (id, numero_serie, nombre, estado) values (
  '66666666-6666-6666-6666-666666666666', 3, 'Punto legacy NULL', 'activo');
insert into public.coordenadas_gps (
  punto_id, coordenada_x, coordenada_y, coordenada_z
) values (
  '33333333-3333-3333-3333-333333333333', 1, 2, 3);
insert into public.app_state_snapshots (id, tipo, descripcion, snapshot, created_at) values (
  'eeeeeeee-0000-0000-0000-0000000000e1', 'manual', 'snapshot legacy', '{}'::jsonb, now());

-- ---------- persona: anon ----------
set local role anon;

select public.verify_assert((select count(*) = 0 from public.perfiles),
  'anon no debe leer perfiles');
select public.verify_assert((select count(*) = 0 from public.proyectos),
  'anon no debe leer proyectos');
select public.verify_assert((select count(*) = 0 from public.proyecto_miembros),
  'anon no debe leer proyecto_miembros');
select public.verify_assert((select count(*) = 0 from public.puntos_ferroviarios),
  'anon no debe leer puntos_ferroviarios');
select public.verify_assert((select count(*) = 0 from public.coordenadas_gps),
  'anon no debe leer coordenadas_gps');
select public.verify_assert((select count(*) = 0 from public.documentos_punto),
  'anon no debe leer documentos_punto');
select public.verify_assert((select count(*) = 0 from public.analisis_imagenes),
  'anon no debe leer analisis_imagenes');
select public.verify_assert((select count(*) = 0 from public.fotos_punto),
  'anon no debe leer fotos_punto');
select public.verify_assert((select count(*) = 0 from public.historial_obras),
  'anon no debe leer historial_obras');
select public.verify_assert((select count(*) = 0 from public.app_state_snapshots),
  'anon no debe leer app_state_snapshots');
select public.verify_assert((select count(*) = 0 from public.image_analyses),
  'anon no debe leer image_analyses');

do $$
begin
  insert into public.image_analyses (image_url) values ('https://verify-rls.local/x.png');
  raise exception 'VERIFY FAILED: anon debia ser rechazado al insertar en image_analyses';
exception
  when insufficient_privilege then
    raise notice 'OK: insert de anon en image_analyses rechazado';
end $$;

reset role;

-- ---------- persona: segundo (usuario, miembro sólo de P1) ----------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222',
                    'role', 'authenticated')::text,
  true);

-- aislamiento por proyecto: sólo el punto de P1; P2 y legacy invisibles
select public.verify_assert((select count(*) = 1 from public.puntos_ferroviarios),
  'usuario miembro de P1 debe ver exactamente el punto de P1');
select public.verify_assert(
  (select count(*) = 0 from public.puntos_ferroviarios where proyecto_id is null),
  'puntos legacy NULL deben ser invisibles');
select public.verify_assert((select count(*) = 1 from public.proyectos),
  'usuario debe ver sólo los proyectos donde es miembro');
select public.verify_assert((select count(*) = 2 from public.proyecto_miembros),
  'miembro ve las filas de membresía de su proyecto');
select public.verify_assert((select count(*) = 1 from public.coordenadas_gps),
  'hijas heredan el scope vía EXISTS sobre el punto padre');

-- usuario no puede crear proyectos (spec: Project Creation)
do $$
begin
  insert into public.proyectos (nombre) values ('Proyecto ilegal');
  raise exception 'VERIFY FAILED: un usuario no debe poder crear proyectos';
exception
  when insufficient_privilege then
    raise notice 'OK: creación de proyecto por usuario rechazada';
end $$;

-- usuario no puede escribir puntos en un proyecto ajeno
do $$
begin
  insert into public.puntos_ferroviarios (id, numero_serie, nombre, estado, proyecto_id)
  values ('77777777-7777-7777-7777-777777777777', 4, 'intruso', 'activo',
          'aaaaaaaa-0000-0000-0000-000000000002');
  raise exception 'VERIFY FAILED: un usuario no debe escribir en un proyecto ajeno';
exception
  when insufficient_privilege then
    raise notice 'OK: inserción en proyecto ajeno rechazada';
end $$;

-- snapshots: insert válido sólo con proyecto del que es miembro
insert into public.app_state_snapshots (id, tipo, descripcion, snapshot, created_at, proyecto_id)
values ('eeeeeeee-0000-0000-0000-00000000e0e2', 'manual', 'snap P1', '{}'::jsonb, now(),
        'aaaaaaaa-0000-0000-0000-000000000001');

do $$
begin
  insert into public.app_state_snapshots (id, tipo, descripcion, snapshot, created_at)
  values ('eeeeeeee-0000-0000-0000-00000000e0e3', 'manual', 'sin proyecto', '{}'::jsonb, now());
  raise exception 'VERIFY FAILED: snapshot sin proyecto debe ser rechazado';
exception
  when insufficient_privilege then
    raise notice 'OK: snapshot sin proyecto rechazado';
end $$;

do $$
begin
  insert into public.app_state_snapshots (id, tipo, descripcion, snapshot, created_at, proyecto_id)
  values ('eeeeeeee-0000-0000-0000-00000000e0e4', 'manual', 'snap P2 ajeno', '{}'::jsonb, now(),
          'aaaaaaaa-0000-0000-0000-000000000002');
  raise exception 'VERIFY FAILED: snapshot de proyecto ajeno debe ser rechazado';
exception
  when insufficient_privilege then
    raise notice 'OK: snapshot de proyecto ajeno rechazado';
end $$;

-- snapshots: sólo los propios (el legacy de postgres es invisible)
select public.verify_assert(
  (select count(*) = 1 from public.app_state_snapshots),
  'snapshots: sólo las filas propias del usuario');

-- perfiles: exactamente su fila (sin recursión de policy)
select public.verify_assert((select count(*) = 1 from public.perfiles),
  'authenticated ve exactamente su fila de perfiles (sin recursion)');
select public.verify_assert(
  (select count(*) = 0 from public.perfiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'authenticated no debe ver perfiles ajenos');

-- puede editar campos propios (sin tocar rol)
update public.perfiles set nombre = 'Segundo Verify'
  where id = '22222222-2222-2222-2222-222222222222';
select public.verify_assert(
  (select nombre = 'Segundo Verify' from public.perfiles
    where id = '22222222-2222-2222-2222-222222222222'),
  'authenticated puede actualizar su propia fila sin rol');

-- cambio de rol bloqueado para no-admins (fallo esperado)
do $$
begin
  update public.perfiles set rol = 'administrador'
    where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'VERIFY FAILED: un no-admin no debe poder cambiar su rol';
exception
  when others then
    if sqlerrm not like '%administrador%' then
      raise exception 'VERIFY FAILED: error inesperado en freeze de rol: %', sqlerrm;
    end if;
    raise notice 'OK: cambio de rol por no-admin rechazado';
end $$;

reset role;

-- ---------- persona: primero (administrador) ----------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111',
                    'role', 'authenticated')::text,
  true);

select public.verify_assert((select count(*) = 2 from public.proyectos),
  'admin ve todos los proyectos');
select public.verify_assert((select count(*) = 3 from public.puntos_ferroviarios),
  'admin ve todos los puntos, incluidos los legacy NULL');
select public.verify_assert(
  (select count(*) = 1 from public.puntos_ferroviarios where proyecto_id is null),
  'admin ve los legacy NULL para poder reasignarlos');

reset role;

rollback;
