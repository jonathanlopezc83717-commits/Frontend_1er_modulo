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

-- ---------- PR#4: gestión de proyectos (soft delete + meta) ----------
-- P3 del tercero con segundo como miembro (no dueño) y 2 puntos
insert into public.proyectos (id, nombre, creado_por) values (
  'aaaaaaaa-0000-0000-0000-000000000003', 'Proyecto Tres verify',
  '44444444-4444-4444-4444-444444444444');
insert into public.proyecto_miembros (proyecto_id, user_id, creado_por) values (
  'aaaaaaaa-0000-0000-0000-000000000003',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444');
insert into public.puntos_ferroviarios (id, numero_serie, nombre, estado, proyecto_id) values
  ('88888888-8888-8888-8888-888888888881', 5, 'Punto P3 a', 'activo',
   'aaaaaaaa-0000-0000-0000-000000000003'),
  ('88888888-8888-8888-8888-888888888882', 6, 'Punto P3 b', 'activo',
   'aaaaaaaa-0000-0000-0000-000000000003');

-- trigger de puntos: escribir un punto avanza proyectos.updated_at.
-- now() es estable dentro de la transacción: se retrocede el valor
-- manualmente (trigger de touch deshabilitado un instante) y se
-- exige que el touch del punto lo devuelva exactamente a now().
do $$
begin
  alter table public.proyectos disable trigger trg_proyectos_updated_at;
  update public.proyectos set updated_at = now() - interval '1 hour'
    where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  alter table public.proyectos enable trigger trg_proyectos_updated_at;

  update public.puntos_ferroviarios set nombre = 'Punto P3 a editado'
    where id = '88888888-8888-8888-8888-888888888881';

  if (select updated_at from public.proyectos
       where id = 'aaaaaaaa-0000-0000-0000-000000000003') <> now() then
    raise exception 'VERIFY FAILED: escribir puntos debe tocar proyectos.updated_at';
  end if;
  raise notice 'OK: trigger de puntos toca proyectos.updated_at';
end $$;

-- segundo (miembro, no dueño) ve P3 antes de la eliminación
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222',
                    'role', 'authenticated')::text,
  true);
select public.verify_assert(
  (select count(*) = 2 from public.proyectos),
  'miembro de P3 debe verlo antes de la eliminación');

-- permisos de eliminar: no dueño y no admin rechazado
do $$
begin
  perform public.eliminar_proyecto('aaaaaaaa-0000-0000-0000-000000000003');
  raise exception 'VERIFY FAILED: un miembro no dueño no debe poder eliminar';
exception when others then
  if sqlerrm not like '%permiso%' then
    raise exception 'VERIFY FAILED: error inesperado al eliminar sin permiso: %', sqlerrm;
  end if;
  raise notice 'OK: eliminación por no-dueño rechazada';
end $$;

-- delete físico revocado para authenticated
do $$
begin
  delete from public.proyectos where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  raise exception 'VERIFY FAILED: delete físico debe estar revocado';
exception when insufficient_privilege then
  raise notice 'OK: delete físico revocado para authenticated';
end $$;

reset role;

-- tercero (general, dueño de P3) elimina por RPC: soft delete
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '44444444-4444-4444-4444-444444444444',
                    'role', 'authenticated')::text,
  true);
select public.eliminar_proyecto('aaaaaaaa-0000-0000-0000-000000000003');
reset role;

-- soft delete: estado marca eliminado, los puntos NO se destruyen
select public.verify_assert(
  (select estado = 'eliminado' from public.proyectos
    where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'P3 debe quedar estado=eliminado tras el RPC');
select public.verify_assert(
  (select count(*) = 2 from public.puntos_ferroviarios
    where proyecto_id = 'aaaaaaaa-0000-0000-0000-000000000003'
      and estado = 'activo'),
  'los puntos de P3 deben seguir intactos y activos');

-- segundo ya no ve P3; el meta RPC respeta la misma visibilidad
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222',
                    'role', 'authenticated')::text,
  true);
select public.verify_assert(
  (select count(*) = 1 from public.proyectos),
  'eliminado debe ser invisible para el miembro no admin');
select public.verify_assert(
  (select count(*) = 1 from public.listar_proyectos_con_meta()),
  'meta RPC debe excluir el proyecto eliminado para no-admin');
select public.verify_assert(
  (select miembros_count = 2 from public.listar_proyectos_con_meta()
    where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'meta RPC debe contar los miembros del proyecto visible');
select public.verify_assert(
  (select array_length(miembros_emails, 1) = 2
     from public.listar_proyectos_con_meta()
    where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'meta RPC debe exponer los emails de miembros al miembro');

reset role;

-- admin sigue viendo P3 (eliminado) vía RLS y vía meta RPC
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111',
                    'role', 'authenticated')::text,
  true);
select public.verify_assert(
  (select count(*) = 3 from public.proyectos),
  'admin debe seguir viendo el proyecto eliminado');
select public.verify_assert(
  (select count(*) = 3 from public.listar_proyectos_con_meta()),
  'admin debe ver los 3 proyectos en el meta RPC');
select public.verify_assert(
  (select puntos_count = 2 from public.listar_proyectos_con_meta()
    where id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'meta RPC debe contar los puntos activos del proyecto');

reset role;

-- ---------- PR #1b: mcp (civil 3D workstation) ----------
-- Bootstrap del usuario mcp via fn_crear_usuario_mcp (idempotente).
-- El id se asigna por fn_crear_usuario_mcp via gen_random_uuid(); lo
-- capturamos en una variable para evitar problemas de ACL con temp
-- tables cuando bajamos a role authenticated.
do $$
declare
  v_mcp_id uuid;
begin
  v_mcp_id := fn_crear_usuario_mcp('mcp-verify@verify-rls.local', 'change-m3-now');
  perform set_config('verify_rls.mcp_user_id', v_mcp_id::text, false);
end $$;

-- Boostrap del proyecto P_mcp (el trigger trg_crear_miembro_creador
-- ya agrega al mcp user como miembro).
insert into public.proyectos (id, nombre, creado_por) values (
  'bbbbbbbb-0000-0000-0000-0000000000b1',
  'Proyecto MCP verify',
  current_setting('verify_rls.mcp_user_id')::uuid);

-- Punto en P_mcp (via INSERT directo, probando que el mcp user tb
-- puede escribir si la RLS lo deja).
insert into public.puntos_ferroviarios (
  id, numero_serie, nombre, estado, proyecto_id, slug, coordenadas_cad
) values (
  'cccccccc-0000-0000-0000-0000000000c1', 1, 'Punto MCP verify', 'activo',
  'bbbbbbbb-0000-0000-0000-0000000000b1', 'TEST-MCP-1B', '{"x":1,"y":2}'::jsonb);

-- bootstrap storage object bajo prefijo del proyecto del mcp.
-- (postgres bypassa RLS: lo usaremos como baseline.)
insert into storage.objects (bucket_id, name, owner, metadata)
values (
  'mcp-evidencia',
  'bbbbbbbb-0000-0000-0000-0000000000b1/2026-08/20/foto/test.jpg',
  current_setting('verify_rls.mcp_user_id')::uuid,
  '{"mimetype":"image/jpeg","sizeBytes":1024}'::jsonb)
on conflict (bucket_id, name) do nothing;

-- ---------- persona: mcp-readonly (mcp user, miembro de P_mcp) ----------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('verify_rls.mcp_user_id'),
                    'role', 'authenticated')::text,
  true);

-- aislamiento por proyecto: mcp user NO ve P1 ni P2 ni P3.
select public.verify_assert(
  (select count(*) = 1 from public.puntos_ferroviarios
    where slug = 'TEST-MCP-1B'),
  'mcp-readonly: ve solo el punto del proyecto donde es miembro');

-- intento de leer proyectos ajenos devuelve 0
select public.verify_assert(
  (select count(*) = 0 from public.proyectos
    where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'mcp-readonly: no debe leer proyectos ajenos (aislamiento por RLS)');

-- mcp no puede crear proyectos (spec: MCP cannot create projects)
do $$
begin
  insert into public.proyectos (nombre, creado_por) values
    ('mcp-proyecto-ilegal',
     current_setting('verify_rls.mcp_user_id')::uuid);
  raise exception 'VERIFY FAILED: mcp no debe poder crear proyectos';
exception
  when insufficient_privilege then
    raise notice 'OK: creacion de proyecto por mcp rechazada';
end $$;

-- mcp no puede modificar perfiles (trigger trg_congelar_rol)
do $$
begin
  update public.perfiles set rol = 'administrador'
    where id = current_setting('verify_rls.mcp_user_id')::uuid;
  raise exception 'VERIFY FAILED: mcp no debe poder cambiar su propio rol';
exception when others then
  if sqlerrm not like '%administrador%' then
    raise exception 'VERIFY FAILED: error inesperado en freeze de rol: %', sqlerrm;
  end if;
  raise notice 'OK: cambio de rol por mcp rechazado';
end $$;

-- mcp no puede escribir mcp_config (admin-only)
do $$
begin
  insert into public.mcp_config (proyecto_id, auto_trigger_on_upload)
  values ('bbbbbbbb-0000-0000-0000-0000000000b1', true);
  raise exception 'VERIFY FAILED: mcp no debe poder escribir mcp_config';
exception
  when insufficient_privilege then
    raise notice 'OK: INSERT de mcp en mcp_config rechazado';
end $$;

-- mcp-readonly: no puede UPDATE el slug (trigger trg_puntos_slug_inmutable)
do $$
begin
  update public.puntos_ferroviarios
    set slug = 'TEST-MCP-1B-NEW'
    where slug = 'TEST-MCP-1B';
  raise exception 'VERIFY FAILED: mcp no debe poder cambiar slug del punto';
exception when others then
  if sqlerrm not like '%slug_inmutable%' then
    raise exception 'VERIFY FAILED: error inesperado en slug-inmutable: %', sqlerrm;
  end if;
  raise notice 'OK: cambio de slug por mcp rechazado (trigger)';
end $$;

-- ---------- persona: mcp-write-own-project (storage RLS) ----------
-- upload bajo prefijo de OTRO proyecto: esperado policy denial
do $$
begin
  insert into storage.objects (bucket_id, name, owner, metadata)
  values (
    'mcp-evidencia',
    'aaaaaaaa-0000-0000-0000-000000000001/2026-08/20/foto/otro.jpg',
    current_setting('verify_rls.mcp_user_id')::uuid,
    '{"mimetype":"image/jpeg","sizeBytes":1024}'::jsonb);
  raise exception 'VERIFY FAILED: mcp no debe poder subir a prefijo de otro proyecto';
exception when insufficient_privilege then
  raise notice 'OK: upload de mcp a prefijo ajeno rechazado';
end $$;

-- upload en mcp-fichas: NO existe policy de INSERT para mcp
do $$
begin
  insert into storage.objects (bucket_id, name, owner, metadata)
  values (
    'mcp-fichas',
    'bbbbbbbb-0000-0000-0000-0000000000b1/2026-08/20/ficha/test.pdf',
    current_setting('verify_rls.mcp_user_id')::uuid,
    '{"mimetype":"application/pdf","sizeBytes":1024}'::jsonb);
  raise exception 'VERIFY FAILED: mcp no debe poder escribir en mcp-fichas';
exception when insufficient_privilege then
  raise notice 'OK: INSERT de mcp en mcp-fichas rechazado';
end $$;

reset role;

rollback;
