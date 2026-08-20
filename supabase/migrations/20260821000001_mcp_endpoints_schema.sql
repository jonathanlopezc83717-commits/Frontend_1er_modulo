-- ============================================================
-- MIGRACIÓN: schema foundation para MCP server endpoints
-- Change: mcp-server-endpoints (PR #1a — enum + schema foundation)
--
-- Purpose:
--   (1) Extender puntos_ferroviarios con slug + coordenadas_cad;
--       slug permite upsert idempotente por nombre legible y
--       coordenadas_cad guarda la terna X/Y/Z de AutoCAD (distinta
--       de coordenadas_gps.coordenada_x/y que almacenan lng/lat).
--   (2) Crear puntos_archivos (M2M punto ↔ storage object) con
--       bucket/kind como TEXT+CHECK (se migra a enum en PR #1b
--       cuando se introduzcan los buckets).
--   (3) Crear mcp_config (1 fila por proyecto) para el toggle
--       auto_trigger_on_upload + cron_schedule. MVP: persistido,
--       nunca disparado (Out of Scope: cron real).
--   (4) RLS baseline para los nuevos objects que NO regresiona
--       los flujos existentes (sincronizar-puntos, React UI).
--       Las policies completas (WITH CHECK de slug, fn_es_mcp,
--       fn_crear_usuario_mcp, RPC mcp_upsert_punto_por_slug) llegan
--       en PR #1b.
--
-- Depends on:
--   20260821000000_mcp_endpoints_enum.sql (mcp committeado como
--   valor de rol_usuario antes de cualquier referencia aquí).
--   20260817000001_auth_perfiles_rls.sql (perfiles + auth).
--   20260817000003_proyectos_scoping.sql (proyectos +
--   fn_es_miembro).
--
-- Reverses via:
--   DROP TABLE IF EXISTS public.puntos_archivos CASCADE;
--   DROP TABLE IF EXISTS public.mcp_config CASCADE;
--   ALTER TABLE public.puntos_ferroviarios
--     DROP COLUMN IF EXISTS slug,
--     DROP COLUMN IF EXISTS coordenadas_cad;
--   DROP INDEX IF EXISTS public.puntos_ferroviarios_slug_key;
--   DROP INDEX IF EXISTS public.idx_puntos_slug_proyecto;
-- ============================================================

-- ============================================================
-- 1. puntos_ferroviarios: slug + coordenadas_cad
-- ============================================================

ALTER TABLE puntos_ferroviarios
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS coordenadas_cad JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS puntos_ferroviarios_slug_key
  ON puntos_ferroviarios (slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_puntos_slug_proyecto
  ON puntos_ferroviarios (proyecto_id, slug)
  WHERE slug IS NOT NULL;

COMMENT ON COLUMN puntos_ferroviarios.slug IS
  'Stable identifier for MCP upserts (UUID-free, human-readable). UNIQUE when present; legacy rows may have NULL.';

COMMENT ON COLUMN puntos_ferroviarios.coordenadas_cad IS
  'AutoCAD X/Y/Z world coordinates as JSONB {x,y,z?}. Distinct from coordenadas_gps.coordenada_x/y which store lng/lat (confusingly named).';

-- ============================================================
-- 2. puntos_archivos: M2M punto ↔ storage object
-- ============================================================

CREATE TABLE IF NOT EXISTS puntos_archivos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  punto_id UUID NOT NULL REFERENCES puntos_ferroviarios(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('mcp-evidencia','mcp-fichas','mcp-referencias')),
  kind TEXT NOT NULL CHECK (kind IN ('foto','croquis','documento','referencia','ficha')),
  mime_type TEXT,
  size_bytes BIGINT,
  subido_por UUID NOT NULL REFERENCES auth.users(id),
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_puntos_archivos_punto
  ON puntos_archivos(punto_id);

CREATE INDEX IF NOT EXISTS idx_puntos_archivos_pendientes
  ON puntos_archivos(punto_id) WHERE analyzed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_puntos_archivos_path
  ON puntos_archivos(storage_path);

-- ============================================================
-- 3. mcp_config: per-project toggle (MVP stored, never fired)
-- ============================================================

CREATE TABLE IF NOT EXISTS mcp_config (
  proyecto_id UUID PRIMARY KEY REFERENCES proyectos(id) ON DELETE CASCADE,
  auto_trigger_on_upload BOOLEAN NOT NULL DEFAULT FALSE,
  cron_schedule TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE mcp_config IS
  'Per-project toggle for MCP-triggered analysis. MVP: stored, not auto-fired (PR #4 implements manual trigger only).';

-- ============================================================
-- 4. RLS baseline (no regression of existing flows)
-- ============================================================

ALTER TABLE puntos_archivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_config ENABLE ROW LEVEL SECURITY;

-- puntos_archivos: member-owned writes; admin/general read
DROP POLICY IF EXISTS mcp_user_insert ON puntos_archivos;
CREATE POLICY mcp_user_insert ON puntos_archivos
  FOR INSERT TO authenticated
  WITH CHECK (
    subido_por = auth.uid()
    AND (SELECT rol FROM perfiles WHERE id = auth.uid()) = 'mcp'
  );

DROP POLICY IF EXISTS mcp_user_select_own ON puntos_archivos;
CREATE POLICY mcp_user_select_own ON puntos_archivos
  FOR SELECT TO authenticated
  USING (
    subido_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid() AND rol IN ('administrador','general')
    )
  );

DROP POLICY IF EXISTS admin_general_update ON puntos_archivos;
CREATE POLICY admin_general_update ON puntos_archivos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid() AND rol IN ('administrador','general')
    )
  );

-- mcp_config: admin/all write; admin+general read
DROP POLICY IF EXISTS admin_read ON mcp_config;
CREATE POLICY admin_read ON mcp_config
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid() AND rol IN ('administrador','general')
    )
  );

DROP POLICY IF EXISTS admin_write ON mcp_config;
CREATE POLICY admin_write ON mcp_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid() AND rol = 'administrador'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM perfiles
      WHERE id = auth.uid() AND rol = 'administrador'
    )
  );

-- ============================================================
-- 5. Grants (auto_expose_new_tables inactive per
--    20260817000001_auth_perfiles_rls.sql:165)
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON puntos_archivos TO authenticated;
GRANT ALL ON puntos_archivos TO service_role;
GRANT SELECT, INSERT, UPDATE ON mcp_config TO authenticated;
GRANT ALL ON mcp_config TO service_role;
