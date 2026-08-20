-- ============================================================
-- MIGRACIÓN: buckets + Storage RLS + fn_es_mcp helper
-- Change: mcp-server-endpoints (PR #1b — RPC + buckets + RLS)
--
-- Purpose:
--   (1) Crear 3 buckets privados para MCP:
--       mcp-evidencia (MCP writes), mcp-fichas (PLATFORM writes),
--       mcp-referencias (MCP writes). Mime types acotados al case
--       de uso.
--   (2) Helper SECURITY DEFINER fn_es_mcp(uid uuid) que decide
--       si el uid pertenece a un usuario rol='mcp'. Toma uid
--       como param (no usa auth.uid() adentro) para ser
--       reutilizable desde RLS via fn_es_mcp(auth.uid()) y
--       desde el RPC via fn_es_mcp(auth.uid()) por igual.
--   (3) Storage RLS policies:
--       - mcp_write_evidencia: INSERT INTO mcp-evidencia |
--         mcp-referencias bajo prefijo = proyecto_id donde el
--         caller es miembro. Esto ata cada upload a un proyecto
--         concreto (no solo al uid).
--       - mcp_read_own_evidencia: SELECT por el mismo predicado
--         de prefijo (miembros leen su proyecto).
--       - mcp_admin_read_all: admin|general leen TODO en
--         mcp-evidencia + mcp-referencias.
--       - admin_read_fichas: admin|general leen mcp-fichas.
--       - platform_write_fichas: admin|general pueden escribir
--         en mcp-fichas (caso de operadores/plataforma).
--       NO hay policy de INSERT para mcp-fichas dirigida a
--       rol=mcp — solo plataforma (/functions/v1/...) escribe
--       alli via service_role.
--
-- Depends on:
--   20260821000000_mcp_endpoints_enum.sql (mcp enum value).
--   20260821000001_mcp_endpoints_schema.sql (puntos_archivos +
--     mcp_config tables).
--   20260817000001_auth_perfiles_rls.sql (perfiles, fn_rol_actual).
--   20260817000003_proyectos_scoping.sql (proyecto_miembros +
--     fn_es_miembro).
--
-- Reverses via:
--   delete from storage.buckets where id in ('mcp-evidencia',
--     'mcp-fichas','mcp-referencias');
--   drop policy if exists mcp_write_evidencia on storage.objects;
--   drop policy if exists mcp_read_own_evidencia on storage.objects;
--   drop policy if exists mcp_admin_read_all on storage.objects;
--   drop policy if exists admin_read_fichas on storage.objects;
--   drop policy if exists platform_write_fichas on storage.objects;
--   drop function if exists public.fn_es_mcp(uuid);
-- ============================================================

-- ============================================================
-- Section A: 3 buckets (idempotent via ON CONFLICT DO NOTHING)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('mcp-evidencia', 'mcp-evidencia', false, 52428800,
   ARRAY['image/jpeg','image/png','image/webp','application/pdf','image/vnd.dwg']),
  ('mcp-fichas', 'mcp-fichas', false, 104857600,
   ARRAY['application/pdf']),
  ('mcp-referencias', 'mcp-referencias', false, 104857600,
   ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Section B: helper fn_es_mcp(uid uuid)
-- SECURITY DEFINER (owner = postgres) para que RLS sobre
-- perfiles no bloquee la lectura. Toma uid explicito para
-- ser reusable en RLS (via auth.uid()) y dentro de SECURITY
-- DEFINER RPCs (donde el caller es auth.uid()).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_es_mcp(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = uid AND rol = 'mcp'::rol_usuario
  )
$$;

GRANT EXECUTE ON FUNCTION public.fn_es_mcp(uuid) TO anon, authenticated, service_role;

-- ============================================================
-- Section C: Storage RLS policies on storage.objects
-- El path convention acordado en PR #1b es {bucket}/{proyecto_id}/...
-- (no {bucket}/{auth.uid()}/... como sugirio el design original).
-- Esto ata cada upload a un proyecto especifico del que el caller
-- es miembro.
-- ============================================================

-- C.1 MCP puede INSERT en mcp-evidencia|mcp-referencias bajo prefijo
--     = proyecto_id donde el caller es miembro. NO permite mcp-fichas
--     (esa policy NO existe para rol=mcp).
DROP POLICY IF EXISTS mcp_write_evidencia ON storage.objects;
CREATE POLICY mcp_write_evidencia ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('mcp-evidencia','mcp-referencias')
    AND public.fn_es_mcp(auth.uid())
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT proyecto_id FROM public.proyecto_miembros
      WHERE user_id = auth.uid()
    )
  );

-- C.2 Miembros del proyecto pueden SELECT sus propios uploads
--     (mismo predicado de prefijo).
DROP POLICY IF EXISTS mcp_read_own_evidencia ON storage.objects;
CREATE POLICY mcp_read_own_evidencia ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('mcp-evidencia','mcp-referencias')
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT proyecto_id FROM public.proyecto_miembros
      WHERE user_id = auth.uid()
    )
  );

-- C.3 admin|general pueden SELECT TODO en mcp-evidencia + mcp-referencias.
DROP POLICY IF EXISTS mcp_admin_read_all ON storage.objects;
CREATE POLICY mcp_admin_read_all ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('mcp-evidencia','mcp-referencias')
    AND EXISTS (
      SELECT 1 FROM public.perfiles
      WHERE id = auth.uid() AND rol IN ('administrador','general')
    )
  );

-- C.4 admin|general pueden SELECT mcp-fichas. (mcp y usuario NO).
DROP POLICY IF EXISTS admin_read_fichas ON storage.objects;
CREATE POLICY admin_read_fichas ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'mcp-fichas'
    AND EXISTS (
      SELECT 1 FROM public.perfiles
      WHERE id = auth.uid() AND rol IN ('administrador','general')
    )
  );

-- C.5 admin|general pueden INSERT en mcp-fichas (caso operadores).
--     El platform tambien puede usar service_role via Edge Functions.
DROP POLICY IF EXISTS platform_write_fichas ON storage.objects;
CREATE POLICY platform_write_fichas ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mcp-fichas'
    AND EXISTS (
      SELECT 1 FROM public.perfiles
      WHERE id = auth.uid() AND rol IN ('administrador','general')
    )
  );
