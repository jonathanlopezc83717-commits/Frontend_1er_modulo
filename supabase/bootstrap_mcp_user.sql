-- ============================================================
-- MCP SERVER BOOTSTRAP — one-time provisioning script
-- Change: mcp-server-endpoints (PR #1a)
--
-- ⚠️  BEFORE RUNNING:
--   1. Edit the email placeholder below
--      (default: mcp-server@analizador-ferroviario.local).
--   2. Run this script as the Supabase superuser (postgres role):
--         supabase db reset    -- if it's the first time
--         psql -U postgres -d postgres -f supabase/bootstrap_mcp_user.sql
--      Or via the SQL editor in Supabase Studio as a superuser.
--
-- Purpose:
--   Creates the technical user `mcp-server@<domain>` in auth.users
--   and the matching row in public.perfiles with rol='mcp'. The
--   trigger trg_crear_perfil_usuario (defined in
--   20260817000001_auth_perfiles_rls.sql:70-72) normally creates the
--   perfil automatically; we INSERT directly here because the
--   trigger would assign rol='usuario' (the default). We override
--   via ON CONFLICT to lock the rol.
--
--   This script does NOT live in supabase/migrations/ so it does
--   NOT run on `supabase db reset`. It is a one-time operator
--   action — never replayed by the migration runner.
--
-- Idempotent:
--   All INSERTs use ON CONFLICT DO NOTHING. Re-running is safe.
--
-- Membership:
--   The commented example at the bottom shows how an admin grants
--   the MCP server access to a specific project. The operator
--   uncomments + edits the project UUID before running.
-- ============================================================

-- 1. Insert auth.users row (placeholder email — edit before running)
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'mcp-server@analizador-ferroviario.local',
  crypt('CHANGE_ME_ON_FIRST_LOGIN', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"nombre":"MCP Server (technical)"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (email) DO NOTHING;

-- 2. Lock rol='mcp' on the matching perfil (trigger may have already
--    inserted a 'usuario' row; we override idempotently).
INSERT INTO public.perfiles (id, email, nombre, rol)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data ->> 'nombre', split_part(u.email, '@', 1)),
  'mcp'::rol_usuario
FROM auth.users u
WHERE u.email = 'mcp-server@analizador-ferroviario.local'
ON CONFLICT (id) DO UPDATE
  SET rol = 'mcp'::rol_usuario;

-- 3. (Operator) Add MCP user to a project
--    Edit the project UUID below to grant the MCP server write
--    access to specific projects. The fn_primer_usuario_admin /
--    fn_congelar_rol triggers do NOT fire here because we are
--    running as superuser (no auth.uid()).
--
-- INSERT INTO public.proyecto_miembros (proyecto_id, user_id, creado_por)
-- SELECT
--   'PASTE-PROJECT-UUID-HERE'::uuid,
--   u.id,
--   u.id
-- FROM auth.users u
-- WHERE u.email = 'mcp-server@analizador-ferroviario.local'
-- ON CONFLICT (proyecto_id, user_id) DO NOTHING;
