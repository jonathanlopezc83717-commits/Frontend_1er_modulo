-- Verificación RLS — PR#1 (login-multiproyecto, task 1.3)
-- Ejecutar tras `supabase db reset` contra la BD local (puerto 54322):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/queries/verify_rls.sql
--
-- Personas:
--   anon           -> 0 filas en todas las tablas protegidas; insert rechazado
--   authenticated  -> lectura baseline, solo su fila de perfiles (sin
--                     recursión de policy), edits propios sin rol permitidos,
--                     cambio de rol bloqueado para no-admins
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

-- dato legible para la persona authenticated
insert into public.puntos_ferroviarios (id, numero_serie, nombre, estado)
values ('33333333-3333-3333-3333-333333333333', 1, 'Punto verify', 'activo');

-- ---------- persona: anon ----------
set local role anon;

select public.verify_assert((select count(*) = 0 from public.perfiles),
  'anon no debe leer perfiles');
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

-- ---------- persona: authenticated (segundo, no-admin) ----------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222',
                    'role', 'authenticated')::text,
  true);

select public.verify_assert((select count(*) = 1 from public.puntos_ferroviarios),
  'authenticated debe poder leer puntos_ferroviarios');
select public.verify_assert((select count(*) = 0 from public.image_analyses),
  'authenticated consulta image_analyses sin error (0 filas)');

-- perfiles: exactamente su fila. Ejercita la policy -> fn_es_admin():
-- si hubiera recursión, Postgres habría lanzado infinite_recursion.
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

rollback;
