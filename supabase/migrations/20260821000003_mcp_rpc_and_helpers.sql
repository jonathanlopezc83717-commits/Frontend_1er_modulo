-- ============================================================
-- MIGRACIÓN: deferred UNIQUE constraint + slug-inmutable trigger
-- + fn_crear_usuario_mcp + mcp_upsert_punto_por_slug RPC
-- Change: mcp-server-endpoints (PR #1b — RPC + buckets + RLS)
--
-- Purpose:
--   (1) UNIQUE(punto_id, storage_path) en puntos_archivos
--       (deferred de PR #1a). Garantiza idempotencia del M2M
--       insert: el mismo (punto, storage_path) no duplica filas.
--       ALTER TABLE ADD CONSTRAINT no soporta IF NOT EXISTS —
--       wrappeado en DO $$ ... $$ que mira pg_constraint.
--   (2) Trigger function fn_puntos_slug_inmutable() BEFORE UPDATE
--       sobre puntos_ferroviarios. RAISE si NEW.slug IS DISTINCT
--       FROM OLD.slug. SECURITY DEFINER + search_path fijo
--       (mismo patron anti-recursion que fn_congelar_rol). El
--       trigger es la red final: cubre tanto path directo
--       authenticated como path SECURITY DEFINER via el RPC.
--   (3) Trigger trg_puntos_slug_inmutable BEFORE UPDATE OF slug
--       (mas barato: solo dispara cuando slug aparece en SET).
--   (4) Bootstrap function fn_crear_usuario_mcp(p_email, p_password)
--       SECURITY DEFINER. Crea auth.users (idempotente en email)
--       + perfil con rol='mcp'. Patron de fn_primer_usuario_admin:
--       despues de INSERT, fn_crear_perfil_usuario crea perfil
--       con default 'usuario'; luego UPDATE a 'mcp'. fn_congelar_rol
--       NO bloquea porque auth.uid() = NULL dentro de SECURITY
--       DEFINER.
--   (5) RPC mcp_upsert_punto_por_slug(p_payload jsonb) SECURITY
--       DEFINER. Valida que caller es mcp role Y que proyecto_id
--       esta en proyecto_miembros del caller. Payload esperado:
--       { slug, name, x, y, z?, proyecto_id, descripcion? }.
--       Retorna TABLE(id uuid, created boolean, slug text).
--       RLS no aplica en SECURITY DEFINER (por eso la validacion
--       SI O SI va dentro del body).
--
-- Depends on:
--   20260821000000_mcp_endpoints_enum.sql (mcp enum value).
--   20260821000001_mcp_endpoints_schema.sql (puntos_ferroviarios +
--     slug + coordenadas_cad columns + unique partial index).
--   20260821000002_mcp_buckets_policies.sql (fn_es_mcp helper).
--   20260817000001_auth_perfiles_rls.sql (perfiles, fn_congelar_rol).
--   20260817000003_proyectos_scoping.sql (proyecto_miembros).
--
-- Reverses via:
--   alter table public.puntos_archivos drop constraint if exists
--     puntos_archivos_punto_path_unique;
--   drop trigger if exists trg_puntos_slug_inmutable
--     on public.puntos_ferroviarios;
--   drop function if exists public.fn_puntos_slug_inmutable();
--   drop function if exists public.fn_crear_usuario_mcp(text, text);
--   drop function if exists public.mcp_upsert_punto_por_slug(jsonb);
-- ============================================================

-- ============================================================
-- Section A: deferred UNIQUE(punto_id, storage_path)
-- ALTER TABLE ADD CONSTRAINT no soporta IF NOT EXISTS; usamos
-- un DO block que consulta pg_constraint.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'puntos_archivos_punto_path_unique'
  ) THEN
    ALTER TABLE puntos_archivos
      ADD CONSTRAINT puntos_archivos_punto_path_unique
      UNIQUE (punto_id, storage_path);
  END IF;
END $$;

-- ============================================================
-- Section B: trigger function fn_puntos_slug_inmutable()
-- BEFORE UPDATE: NEW.slug IS DISTINCT FROM OLD.slug -> RAISE.
-- SECURITY DEFINER + search_path fijo (anti-recursion en
-- perfiles, mismo patron que fn_congelar_rol). Estable.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_puntos_slug_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'slug_inmutable_post_insert: slug de puntos_ferroviarios no puede cambiar tras el INSERT (NEW.slug=%, OLD.slug=%)',
      NEW.slug, OLD.slug;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- Section C: trigger BEFORE UPDATE OF slug (solo dispara si slug
-- aparece en SET; cero overhead en updates de otros campos).
-- ============================================================

DROP TRIGGER IF EXISTS trg_puntos_slug_inmutable ON public.puntos_ferroviarios;
CREATE TRIGGER trg_puntos_slug_inmutable
  BEFORE UPDATE OF slug ON public.puntos_ferroviarios
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_puntos_slug_inmutable();

-- ============================================================
-- Section D: bootstrap fn_crear_usuario_mcp(p_email, p_password)
-- SECURITY DEFINER. Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_crear_usuario_mcp(p_email text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token,
    email_change_token_new, email_change, recovery_token
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nombre":"MCP Server (technical)"}'::jsonb,
    now(), now(), '', '', '', ''
  )
  ON CONFLICT (email) WHERE is_sso_user = false DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  END IF;

  INSERT INTO public.perfiles (id, email, nombre, rol)
  VALUES (v_user_id, p_email, 'MCP Server (technical)', 'mcp'::rol_usuario)
  ON CONFLICT (id) DO UPDATE SET rol = 'mcp'::rol_usuario;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_crear_usuario_mcp(text, text) TO service_role;

-- ============================================================
-- Section E: RPC mcp_upsert_punto_por_slug(p_payload jsonb)
-- SECURITY DEFINER. RLS no aplica dentro del RPC, asi que la
-- validacion del caller y del proyecto van en el body.
-- Payload esperado:
--   { "slug": "P-001", "name": "Punto 0+250",
--     "x": 12345.67, "y": 98765.43, "z": null,
--     "proyecto_id": "uuid", "descripcion": null }
-- x, y requeridos; z opcional. numero_serie se calcula como
-- orden por created_at (next) dentro del proyecto (no se
-- acepta del caller para evitar colisiones).
-- ============================================================

CREATE OR REPLACE FUNCTION public.mcp_upsert_punto_por_slug(p_payload jsonb)
RETURNS TABLE(id uuid, created boolean, slug_out text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug_in     text := p_payload->>'slug';
  v_nombre      text := p_payload->>'name';
  v_desc        text := p_payload->>'descripcion';
  v_proyecto_id uuid := NULLIF(p_payload->>'proyecto_id','')::uuid;
  v_x           numeric := NULLIF(p_payload->>'x','')::numeric;
  v_y           numeric := NULLIF(p_payload->>'y','')::numeric;
  v_z           numeric := NULLIF(p_payload->>'z','')::numeric;
  v_punto_id    uuid;
  v_was_created boolean;
BEGIN
  IF v_slug_in IS NULL OR v_slug_in = '' THEN
    RAISE EXCEPTION 'mcp_upsert_punto_por_slug: slug requerido';
  END IF;
  IF v_nombre IS NULL OR v_nombre = '' THEN
    RAISE EXCEPTION 'mcp_upsert_punto_por_slug: name requerido';
  END IF;
  IF v_x IS NULL OR v_y IS NULL THEN
    RAISE EXCEPTION 'mcp_upsert_punto_por_slug: x e y requeridos (coordenadas_cad)';
  END IF;
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'mcp_upsert_punto_por_slug: proyecto_id requerido';
  END IF;

  IF NOT public.fn_es_mcp(auth.uid()) THEN
    RAISE EXCEPTION 'mcp_upsert_punto_por_slug: caller no es rol mcp';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.proyecto_miembros
    WHERE proyecto_id = v_proyecto_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'mcp_upsert_punto_por_slug: caller no es miembro del proyecto %', v_proyecto_id;
  END IF;

  INSERT INTO public.puntos_ferroviarios (
    id, slug, nombre, descripcion, proyecto_id,
    coordenadas_cad, estado, numero_serie, updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_slug_in,
    v_nombre,
    v_desc,
    v_proyecto_id,
    jsonb_build_object('x', v_x, 'y', v_y, 'z', v_z),
    'activo',
    COALESCE((SELECT MAX(numero_serie) FROM public.puntos_ferroviarios
      WHERE proyecto_id = v_proyecto_id), 0) + 1,
    now()
  )
  ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
    nombre         = EXCLUDED.nombre,
    descripcion    = EXCLUDED.descripcion,
    coordenadas_cad = EXCLUDED.coordenadas_cad,
    updated_at     = now()
  RETURNING puntos_ferroviarios.id, (xmax = 0) INTO v_punto_id, v_was_created;

  IF v_punto_id IS NULL THEN
    SELECT puntos_ferroviarios.id INTO v_punto_id
    FROM public.puntos_ferroviarios
    WHERE puntos_ferroviarios.slug = v_slug_in;
    v_was_created := false;
  END IF;

  RETURN QUERY SELECT v_punto_id, v_was_created, v_slug_in;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mcp_upsert_punto_por_slug(jsonb) TO authenticated, service_role;
