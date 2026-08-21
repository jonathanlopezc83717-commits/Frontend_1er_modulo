# Design: MCP Server Endpoints (Civil 3D → Supabase)

## Context & Constraints

- Local Supabase at `http://127.0.0.1:54321`, Postgres **17** (`supabase/config.toml` line 42), `auth.enabled = true`, `jwt_expiry = 3600`, `enable_refresh_token_rotation = true`, `enable_signup = false`, no SMTP. Inherited auth/helpers from `login-multiproyecto` (`20260817000001_auth_perfiles_rls.sql`): `fn_rol_actual() rol_usuario`, `fn_es_admin() boolean`, `fn_es_miembro(uuid) boolean`, `fn_congelar_rol()` BEFORE UPDATE trigger on `perfiles`.
- Existing tables: `puntos_ferroviarios`, `coordenadas_gps`, `documentos_punto`, `analisis_imagenes`, `fotos_punto`, `historial_obras`, `app_state_snapshots`, `perfiles`, `proyectos`, `proyecto_miembros` (per `20260817000003_proyectos_scoping.sql`). Existing RPC `guardar_punto_completo(p_payload jsonb)` SECURITY INVOKER, scoped to `proyecto_id`.
- Existing Edge Functions: `sincronizar-puntos` (concurrency 5, 60s timeout, forwards caller Bearer JWT to PostgREST — pattern at `supabase/functions/sincronizar-puntos/index.ts` lines 147-153), `analyze-railway-images` (OpenRouter gpt-4o-mini per image + consolidation, 60s timeout, 3 retries w/ backoff), `invite-user`.
- Storage today: bucket `images` (public read, see `src/lib/storage-dedup.ts:40`); all `[storage.buckets.*]` sections in `config.toml` are commented out (lines 121-125).
- **Naming clash warning** (`coordenadas_gps.coordenada_x/y/z` already store GPS **lng/lat** — see `20260817000003_proyectos_scoping.sql:188-198` mapping them to `latitud`, `longitud`, `altitud`). New `coordenadas_cad` is the AutoCAD Cartesian triple and MUST NOT be confused. Documented in code comment at every reader (proposal risk #1).
- ADR-004 (`PuntoFerroviario.moduloData` untouched) and ADR-005 (additive nullable columns) both honored — `slug TEXT` and `coordenadas_cad JSONB` are nullable, additive, with no rewrite of `guardar_punto_completo`.
- `sincronizar-puntos`, `analyze-railway-images`, React UI, `coordenadas_gps`/`coordenadas_cad` namespace → zero regressions.

## Decisions (5 spec open questions + 3 design-level)

### D1. Signed-URL TTL: `ttlSeconds` integer, default 86400, max 604800, min 60
**Choice**: Request body `{path: string, ttlSeconds?: number}`. Default `ttlSeconds = 86400` (24h), max `604800` (7d), min `60` (avoid instant URLs). Out-of-range values rejected with `400 ttl_fuera_de_rango`.
**Rationale**: Mirrors Supabase JS `createSignedUrl(path, expiresIn)` API which takes seconds; integer seconds is unambiguous across MCP server (Python) and admin UI (TS); 24h covers a workday review window; 7d matches Supabase JWT maximum (`config.toml:164`).
**Alternatives rejected**: ms-precision (premature); ISO-8601 duration strings (`PT24H` — extra parsing); separate `signedUrlTtl` env var (no per-request override needed). Evidence: `supabase/config.toml:164` max JWT expiry is 604800s, so we mirror it.

### D2. `coordenadas_cad` JSONB shape: `{x: number, y: number, z?: number}`
**Choice**: JSONB column on `puntos_ferroviarios`, keys `x` (number, required), `y` (number, required), `z` (number, optional). Reads via `puntos_ferroviarios.coordenadas_cad->>'x'` etc. ADR-004-equivalent comment near every reader: `// coordenadas_cad es Cartesiano AutoCAD — NO GPS. coordenadas_gps.coordenada_x/y guardan lng/lat.`
**Rationale**: Spec already assumes this shape; parallels `coordenadas_gps` column names; `z` optional because Civil 3D 2D polylines exist; JSONB keeps validation server-side (`IS JSON` + `jsonb_typeof` checks in RPC) without breaking legacy rows.
**Alternatives rejected**: Three flat columns `cad_x/cad_y/cad_z` (clutters schema, breaks ADR-005 additive-only intent); `geog`/`geometry` PostGIS types (over-engineered for one triple, requires extension enable); nested `{point: {x, y, z}}` (extra level, no benefit). Evidence: `coordenadas_gps` already uses `coordenada_x/y/z` flat numbers in `20250101000000_create_obras_ferroviarias.sql:33-46`.

### D3. Auto-trigger toggle MVP: stored, never fired
**Choice**: `mcp_config.auto_trigger_on_upload boolean` is read by no code path in this change. `mcp-upload-files` ignores it. `mcp-trigger-analysis` is invoked only by manual admin click. The toggle's only consumer is a future cron (Out of Scope, separate change).
**Rationale**: Spec scenario "Per-project toggle stored, no auto-trigger" explicitly defines MVP semantics; matches proposal Out-of-Scope clause; avoids silent background work that an admin might not see.
**Alternatives rejected**: Auto-fire via pg_cron (no extension enabled today; would require additional change); auto-fire via Edge Function on storage event (Supabase Storage triggers not available on local stack without Webhooks; out of scope).

### D4. Slug immutability: `BEFORE UPDATE` trigger (recommended)
**Choice**: Trigger `trg_puntos_slug_inmutable` BEFORE UPDATE on `puntos_ferroviarios`. PL/pgSQL raises `EXCEPTION 'slug_inmutable_post_insert'` when `NEW.slug IS DISTINCT FROM OLD.slug`. Defined as `SECURITY DEFINER SET search_path = public` (same anti-recursion pattern as `fn_congelar_rol` in `20260817000001_auth_perfiles_rls.sql:95-114`).
**Rationale**:
- RLS `WITH CHECK` cannot reference `OLD.*` (Postgres RLS WITH CHECK only sees the proposed new row, not the pre-update row). Comparing `NEW.slug = OLD.slug` requires a trigger or a `current_setting('request.jwt.claims')` extraction (no JWT claim carries slug).
- The trigger covers both RLS paths (authenticated direct UPDATE) and SECURITY DEFINER RPC paths (`mcp_upsert_punto_por_slug` could run as caller OR definer — the trigger catches both).
- Mirrors the existing `trg_congelar_rol` pattern (proven in the repo, no new pattern).
**Alternatives rejected**:
- (a) RLS `WITH CHECK` on UPDATE — cannot reference `OLD` (PG limitation).
- (c) No enforcement — fails spec scenario "MCP cannot UPDATE a punto with a different slug".
- (d) CHECK constraint preventing UPDATE entirely — would block all legitimate updates of OTHER columns (e.g., `descripcion`, `coordenadas_cad`).

### D5. `ALTER TYPE rol_usuario ADD VALUE 'mcp'`: **3 migrations** (deviation from proposal's 2)
**Choice**: Three timestamped files, all standalone transactions (Supabase migration runner):
1. `20260821000000_mcp_role.sql` — only `ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'mcp';`
2. `20260821000001_mcp_endpoints.sql` — tables, columns, indexes, RPC, RLS (now safe to reference `'mcp'` as enum literal because migration 1 already committed)
3. `20260821000002_mcp_buckets_policies.sql` — buckets + Storage RLS
**Rationale**: In PG 14+ (confirmed: `config.toml:42` major_version=17), `ALTER TYPE ... ADD VALUE` can run inside a transaction, **but the new value cannot be referenced (cast, assigned, compared to an enum-typed column) until the transaction commits** (PG docs: "If ALTER TYPE ... ADD VALUE ... is executed inside a transaction block, the new value cannot be used until after the transaction has been committed"). Migration 1's transaction is the WHOLE file; any subsequent statement in the same file referencing `'mcp'` as an enum literal would fail at parse time. A separate first migration guarantees commit.
**Alternatives rejected**:
- 2 migrations with `fn_rol_actual()::text = 'mcp'` cast trick — works but introduces a TEXT-vs-ENUM comparison footgun if any future edit forgets the cast; risk of regression if a contributor removes the cast.
- 2 migrations with `ALTER TYPE ... ADD VALUE` as the first statement — fails on PG 14+ rule above; subsequent statements in the same transaction cannot use the value.
- Single 1-statement-per-migration atomicity would require 6+ migrations, overkill.

This deviates from proposal "two migrations" because the proposal's risk-row (#2) explicitly notes `ALTER TYPE ... ADD VALUE` placement as the constraint. The deviation honors the constraint more strictly.

### D6. (design-level) `mcp` user provisioning via SQL bootstrap
**Choice**: One technical user `mcp-server@<domain>` provisioned via a SQL bootstrap function `fn_crear_usuario_mcp()` (SECURITY DEFINER, idempotent on `auth.users.email`). Pattern mirrors `fn_primer_usuario_admin` (`20260817000001_auth_perfiles_rls.sql:75-88`). Trigger `trg_crear_perfil_usuario` (`20260817000001_auth_perfiles_rls.sql:70-72`) auto-inserts a `perfiles` row. The bootstrap function sets `rol := 'mcp'` via `NEW.rol := 'mcp'`, but **AFTER** the enum migration 1 commits (so the assignment is legal).
**Rationale**: Mirrors `fn_primer_usuario_admin`; runs once at deploy; idempotent so reruns are safe; no seed password in git.
**Alternatives rejected**: Edge function `bootstrap-mcp-user` (extra surface area, not needed at deploy time); manual `supabase auth signup` (requires SMTP/UI, defeats automation).

### D7. (design-level) `mcp-trigger-analysis` reuses `analyze-railway-images` per-punto
**Choice**: For each `puntos_archivos` row with `analyzed_at IS NULL`, sign the Storage URL (24h, `mcp-evidencia` scope — explicitly NOT `mcp-fichas` per spec), then `fetch → POST /functions/v1/analyze-railway-images` with the signed URL in `image_urls[]`. The result is persisted to `analisis_imagenes` for the parent punto. `analyzed_at = now()` is stamped ONLY on success. Concurrency 5 (mirrors `sincronizar-puntos/index.ts:7`).
**Rationale**: Reuses the existing analyzer without duplication; spec scenario "Admin runs trigger with 3 pending puntos" requires per-punto iteration; partial failures must NOT stamp `analyzed_at` so retries are idempotent.
**Alternatives rejected**: Single batched call with all signed URLs per punto (analyzer already does per-image fan-out internally — same result, less code).

### D8. (design-level) JWT refresh during long batches: client responsibility
**Choice**: MCP client (`server/mcp_client.py`) refreshes JWT every 50 min via `POST /auth/v1/token?grant_type=refresh_token` (Supabase pattern). Edge Function assumes JWT validity (GoTrue validates signature); on `401`, returns `{"error": "jwt_expirado_reintentar"}` so the client refreshes and retries once. No refresh logic in Edge Functions.
**Rationale**: Mirrors `sincronizar-puntos` (no internal refresh, caller is responsible); Supabase refresh tokens already rotate with `refresh_token_reuse_interval = 86400` (`config.toml:176`); client has a single long-lived session and can refresh out-of-band.
**Alternatives rejected**: Server-side refresh via `service_role` token exchange (privilege escalation risk; service_role bypasses RLS); explicit long-lived 7d JWT (defeats security posture, contradicts proposal "JWT rotation declared Out of Scope").

---

## Architecture Overview

```
                       ┌─────────────────────────────────────────────┐
                       │             Civil 3D Workstation            │
                       │   mcp_client.py (FastAPI; per proyecto_id)  │
                       │   - lee slug + (x,y,z) del DWG/Civil 3D     │
                       │   - sube evidencia + referencias            │
                       │   - llama upsert de puntos                  │
                       └──────────────────┬──────────────────────────┘
                                          │ Bearer JWT (forwarded)
                                          │ {mcp-server@<domain> rol='mcp'}
                                          ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                       Supabase Edge Functions                           │
   │                                                                          │
   │  mcp-upload-files         mcp-create-puntos       mcp-trigger-analysis  │
   │  (multipart ≤50MB)        (JSON slug-keyed)       (admin only, conc 5)  │
   │  kind ∈ foto|croquis|doc  upsert por slug         iterates pending      │
   │  → Storage upload         + M2M puntos_archivos   → signs URL (24h)     │
   │  → signedUrl response     → validates paths       → analyze-railway-    │
   │                                                    images per punto     │
   │  mcp-generate-download-link                                                 │
   │  (admin|general) path ∈ mcp-fichas/**                                     │
   │  ttlSeconds 60..604800                                                     │
   └──────────────────────────┬──────────────────────────────────────────────┘
                              │ Bearer JWT forwarded
                              ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                  PostgREST + Postgres 17 + Storage                       │
   │                                                                          │
   │  Tablas NUEVAS:                                                           │
   │   puntos_archivos (M2M punto ↔ storage path)                              │
   │     id uuid PK, punto_id uuid FK, storage_path text,                     │
   │     bucket text, kind kind_archivo, subido_por uuid,                     │
   │     analyzed_at timestamptz NULL, created_at timestamptz                  │
   │   mcp_config (1 fila por proyecto)                                        │
   │     proyecto_id uuid PK FK, auto_trigger_on_upload bool,                 │
   │     cron_schedule text NULL, updated_at timestamptz                       │
   │                                                                          │
   │  Tablas MODIFICADAS:                                                      │
   │   puntos_ferroviarios + slug text NULL,                                   │
   │                          + coordenadas_cad jsonb NULL                    │
   │                                                                          │
   │  Buckets NUEVOS:                                                          │
   │   mcp-evidencia     (MCP writes; platform reads)                          │
   │   mcp-fichas        (PLATFORM writes only; admin/general read via signed) │
   │   mcp-referencias   (MCP writes; platform reads)                          │
   │                                                                          │
   │  RPC NUEVA:                                                               │
   │   mcp_upsert_punto_por_slug(p_punto jsonb, p_storage_paths text[])        │
   │     SECURITY INVOKER → RLS del caller aplica                              │
   │                                                                          │
   │  Triggers:                                                                │
   │   trg_puntos_slug_inmutable BEFORE UPDATE on puntos_ferroviarios         │
   └─────────────────────────────────────────────────────────────────────────�
                              ▲
                              │ Bearer JWT (admin user)
                              │
                       ┌──────┴───────────────────┐
                       │   React Admin UI         │
                       │   McpConfig.tsx          │
                       │   McpPendingFiles.tsx    │
                       │   (in admin nav)         │
                       └──────────────────────────┘
```

### Concrete data-flow example

MCP server (Python) executes for project P:
```
1. POST /functions/v1/mcp-upload-files
   multipart: proyecto_id=P, slug_prefix=PK-001, kind=foto, 3 files
   → bucket mcp-evidencia paths:
     mcp-evidencia/<UID>/2026-08/20/foto/PK-001.0.jpg
     mcp-evidencia/<UID>/2026-08/20/foto/PK-001.1.jpg
     mcp-evidencia/<UID>/2026-08/20/foto/PK-001.2.jpg
   → response: [{slug:"PK-001.0", path:"...", signedUrl, size, mimeType}, ...]

2. POST /functions/v1/mcp-create-puntos
   body: { puntos: [
     {slug:"PK-001", proyecto_id:P, numero_serie:1, nombre:"PK-001",
      coordenadas_cad:{x:1250.5, y:875.3, z:142.0},
      photo_refs:["mcp-evidencia/<UID>/2026-08/20/foto/PK-001.0.jpg", ...]}]}
   → RPC mcp_upsert_punto_por_slug INSERT or UPDATE on puntos_ferroviarios
     WHERE slug='PK-001'
   → for each path in photo_refs, INSERT into puntos_archivos (analyzed_at=NULL,
     subido_por=auth.uid())  — idempotent on (punto_id, bucket, storage_path)
```

Admin (browser) later:
```
3. GET /admin/McpPendingFiles → SELECT * FROM puntos_archivos
   WHERE analyzed_at IS NULL AND punto's proyecto_id ∈ projects I administer
4. Click "Analizar ahora" → POST /functions/v1/mcp-trigger-analysis
   body: {proyecto_id: P}
   → for each pending row, sign storage_path (24h, scope mcp-evidencia),
     POST /functions/v1/analyze-railway-images {image_urls:[signedUrl], ...},
     persist result to analisis_imagenes, UPDATE analyzed_at=now()
5. GET /functions/v1/mcp-generate-download-link
   body: {path:"mcp-fichas/P/2026-08/20/PK-001.pdf", ttlSeconds:86400}
   → returns signedUrl (admin|general only; mcp rejected with 403)
```

---

## Component Breakdown

### `supabase/migrations/20260821000000_mcp_role.sql` (NEW, ~5 lines)
- **Responsibility**: Extend `rol_usuario` enum with `'mcp'`.
- **Inputs/Outputs**: N/A → DDL only.
- **Dependencies**: None (must run before migration 2).
- **Failure modes**: `ALTER TYPE ... ADD VALUE IF NOT EXISTS` is idempotent; safe on rerun.

### `supabase/migrations/20260821000001_mcp_endpoints.sql` (NEW, ~280 lines)
- **Responsibility**: Schema + RPC + RLS for `mcp-ingest` and `mcp-analysis-trigger`.
- **Inputs/Outputs**: N/A → DDL only.
- **Dependencies**: Migration 1 committed.
- **Failure modes**: Migration runner aborts → review SQL (no partial state).
- **Contents** (top-down):
  1. `ALTER TABLE public.puntos_ferroviarios ADD COLUMN IF NOT EXISTS slug text, ADD COLUMN IF NOT EXISTS coordenadas_cad jsonb`
  2. `CREATE UNIQUE INDEX IF NOT EXISTS idx_puntos_slug ON public.puntos_ferroviarios (slug) WHERE slug IS NOT NULL` (partial unique index per spec)
  3. `CREATE INDEX IF NOT EXISTS idx_puntos_slug_proyecto ON public.puntos_ferroviarios (proyecto_id, slug) WHERE slug IS NOT NULL` (covers MCP upsert + admin trigger lookups)
  4. `CREATE TYPE public.kind_archivo AS ENUM ('foto','croquis','documento','referencia','ficha')`
  5. `CREATE TABLE public.puntos_archivos (...)` — see §Data Model
  6. `CREATE TABLE public.mcp_config (...)` — see §Data Model
  7. `CREATE OR REPLACE FUNCTION public.mcp_upsert_punto_por_slug(p_punto jsonb, p_storage_paths text[]) RETURNS jsonb ...` — SECURITY INVOKER, validates path prefix = bucket + UID prefix, JSONB shape checks
  8. `CREATE OR REPLACE FUNCTION public.fn_puntos_slug_inmutable() RETURNS trigger ...` — raises if `NEW.slug IS DISTINCT FROM OLD.slug`
  9. `CREATE TRIGGER trg_puntos_slug_inmutable BEFORE UPDATE ON public.puntos_ferroviarios FOR EACH ROW EXECUTE FUNCTION public.fn_puntos_slug_inmutable()`
  10. RLS extension on `puntos_ferroviarios` (new WITH CHECK for slug match on UPDATE — see below), `puntos_archivos`, `mcp_config`
  11. RLS helper `fn_es_mcp()` SECURITY DEFINER
  12. `CREATE OR REPLACE FUNCTION public.fn_crear_usuario_mcp() RETURNS void ...` — idempotent bootstrap of `mcp-server@<domain>` user
  13. `GRANT` statements (auto_expose_new_tables inactive per `20260817000001_auth_perfiles_rls.sql:165`)

### `supabase/migrations/20260821000002_mcp_buckets_policies.sql` (NEW, ~80 lines)
- **Responsibility**: Bucket creation + Storage RLS.
- **Dependencies**: Migration 2 committed (so enum value exists).
- **Contents**: `INSERT INTO storage.buckets ...` for 3 buckets + `CREATE POLICY` on `storage.objects` for prefix matching.

### `supabase/functions/_shared/mcp-auth.ts` (NEW, ~70 lines)
- **Responsibility**: Validate JWT, fetch `perfiles.rol`, enforce `rol === 'mcp'` (or other role for admin/general function), check `fn_es_miembro(proyecto_id)`.
- **Inputs**: `req: Request`, optional `requiredRol: 'mcp' | 'administrador' | 'administrador-general'`, optional `proyectoId: string`.
- **Outputs**: `{ ok: true, userId, rol, proyectoId }` or `{ ok: false, status, error }`.
- **Dependencies**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from Deno.env. Calls PostgREST `/rest/v1/perfiles?select=rol&id=eq.<uid>` and `/rest/v1/proyecto_miembros?select=proyecto_id&user_id=eq.<uid>&proyecto_id=eq.<pid>`.
- **Failure modes**: Missing header → 401; invalid signature (verified by service-role client internally) → 401; wrong role → 401 `rol_no_autorizado`; non-member → 403 `no_miembro_proyecto`.

### `supabase/functions/_shared/mcp-storage.ts` (NEW, ~110 lines)
- **Responsibility**: Wrapper around `supabase-js` (Deno) `storage.from(bucket).upload()` + `createSignedUrl()`.
- **Inputs**: `{bucket: 'mcp-evidencia'|'mcp-fichas'|'mcp-referencias', path: string, body: Uint8Array, contentType: string, upsert?: boolean, jwt: string, userUid: string}`.
- **Outputs**: `{path, size, mimeType, signedUrl}`.
- **Dependencies**: Calls `mcp-auth.ts` to get JWT; path validator ensures `{bucket}/<UID>/...` prefix.
- **Failure modes**: Path-prefix mismatch → 400 `path_prefix_invalido`; mime not in allowlist → 415; size >50MiB → 413 (defense in depth, bucket policy also enforces); upload network error → 502.

### `supabase/functions/_shared/mcp-buckets.ts` (NEW, ~30 lines)
- **Responsibility**: Constants + allowed-buckets/kinds/mime map.
- **Inputs**: N/A.
- **Outputs**: Exports `{ BUCKETS: {...}, KINDS: [...], ALLOWED_MIMES: {...}, MAX_FILE_BYTES: 50*1024*1024, MAX_FILES_PER_REQUEST: 20, DEFAULT_TTL_SECONDS: 86400, MAX_TTL_SECONDS: 604800, MIN_TTL_SECONDS: 60 }`.
- **Failure modes**: N/A.

### `supabase/functions/mcp-upload-files/index.ts` (NEW, ~140 lines)
- **Responsibility**: Multipart ingestion of evidence/reference files.
- **Inputs**: `multipart/form-data` with `proyecto_id`, `slug`, `kind ∈ {foto,croquis,documento,referencia}`, files[].
- **Outputs**: `{files: [{slug, path, size, mimeType, signedUrl}]}` (HTTP 200) or 4xx/5xx.
- **Dependencies**: `_shared/mcp-auth.ts` (rol=mcp, member of proyecto_id); `_shared/mcp-storage.ts` (upload + sign 24h).
- **Failure modes**: 401 (no JWT / non-mcp), 403 (not member), 413 (>50MB), 422 (proyecto not found), 415 (mime not allowed), 400 (kind=ficha rejected — per spec).

### `supabase/functions/mcp-create-puntos/index.ts` (NEW, ~120 lines)
- **Responsibility**: Slug-keyed batch upsert of puntos + M2M insert into `puntos_archivos`.
- **Inputs**: `{puntos: [{slug, proyecto_id, numero_serie, nombre, descripcion?, coordenadas_cad?, photo_refs?, croquis_ref?, doc_refs?}]}`.
- **Outputs**: `{puntos: [{slug, id, created: boolean}]}`.
- **Dependencies**: `_shared/mcp-auth.ts`; calls `mcp_upsert_punto_por_slug` via PostgREST with caller JWT (mirrors `sincronizar-puntos/index.ts:88-103`); validates each `photo_refs[]` path exists in `storage.objects` via `_shared/mcp-storage.ts.head()`.
- **Failure modes**: 401 (auth), 422 (storage_ref_inexistente), 500 (RPC raised), 409 (slug collision with different proyecto_id).

### `supabase/functions/mcp-trigger-analysis/index.ts` (NEW, ~160 lines)
- **Responsibility**: Admin manual trigger; iterates pending rows, signs URLs, calls `analyze-railway-images`, persists results, stamps `analyzed_at`.
- **Inputs**: `{proyecto_id: string}`.
- **Outputs**: `{procesados: number, errores: [{punto_id, error}]}` (HTTP 200 even on partial failures).
- **Dependencies**: `_shared/mcp-auth.ts` (rol=administrador); `_shared/mcp-storage.ts` (sign); existing `analyze-railway-images` (called via `fetch` to same Supabase URL with service-role key — bypasses RLS, no JWT forwarding needed since function is admin-only).
- **Failure modes**: 401 (auth), 403 (non-admin), 504 (one analyzer call exceeds 60s timeout — other rows still process), per-row errors captured in `errores[]` but never abort the batch.

### `supabase/functions/mcp-generate-download-link/index.ts` (NEW, ~80 lines)
- **Responsibility**: Sign `mcp-fichas/**` paths for admin/general only.
- **Inputs**: `{path: string, ttlSeconds?: number}`.
- **Outputs**: `{signedUrl: string}` (HTTP 200).
- **Dependencies**: `_shared/mcp-auth.ts` (rol ∈ {administrador, general}); `_shared/mcp-storage.ts` (sign only, no upload).
- **Failure modes**: 401 (no JWT), 403 (rol=mcp OR path not in `mcp-fichas/`), 400 (`ttlSeconds` < 60 or > 604800).

### RPC `mcp_upsert_punto_por_slug` (NEW, in migration 2, ~60 lines)
- **Signature**: `mcp_upsert_punto_por_slug(p_punto jsonb, p_storage_paths text[]) RETURNS jsonb` — returns `{id, slug, created: boolean}`.
- **Body sketch**:
  ```sql
  DECLARE v_slug text := p_punto->>'slug';
          v_id uuid;
          v_created boolean;
  BEGIN
    -- Validar JSONB shape: {x,y} requeridos; z opcional
    IF NOT (p_punto ? 'x') OR NOT (p_punto ? 'y') THEN
      RAISE EXCEPTION 'coordenadas_cad_invalidas';
    END IF;
    -- UPSERT por slug (no PK)
    INSERT INTO public.puntos_ferroviarios
      (id, numero_serie, nombre, slug, coordenadas_cad, proyecto_id, estado, updated_at)
    VALUES (...)
    ON CONFLICT ((slug)) WHERE slug IS NOT NULL DO UPDATE SET
      numero_serie = EXCLUDED.numero_serie,
      coordenadas_cad = EXCLUDED.coordenadas_cad,
      updated_at = now();
    -- El trigger trg_puntos_slug_inmutable solo dispara en UPDATE, y OLD.slug
    -- == NEW.slug aquí (no se incluye slug en el UPDATE SET), por lo que pasa.
    SELECT id INTO v_id FROM public.puntos_ferroviarios WHERE slug = v_slug;
    -- M2M inserts (idempotente por (punto_id, storage_path))
    INSERT INTO public.puntos_archivos (punto_id, bucket, storage_path, kind, subido_por)
    SELECT v_id, (split_part(p, '/', 1)), p, k, auth.uid()
    FROM unnest(p_storage_paths) WITH ORDINALITY AS u(p, ord)
    JOIN ...  -- map kind per path
    ON CONFLICT (punto_id, storage_path) DO NOTHING;
    RETURN jsonb_build_object('id', v_id, 'slug', v_slug, 'created', v_created);
  END;
  ```
  Note: `ON CONFLICT ((slug)) WHERE slug IS NOT NULL` requires a partial unique INDEX (which we create). PG syntax: `ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE ...` works since 9.5 with `DO NOTHING` and 11+ with `DO UPDATE` on partial indexes when conflict target includes the predicate.
- **Failure modes**: Invalid `coordenadas_cad` JSONB → SQLSTATE `P0001 coordenadas_cad_invalidas` → 500 mapped by Edge; slug collision with different proyecto → `unique_violation` → 409.

### `src/components/admin/McpConfig.tsx` (NEW, ~180 lines)
- **Responsibility**: Admin form for per-project toggle + cron schedule text + show mcp-server email + show last-error log.
- **Inputs**: reads `mcp_config` for current proyecto_activo.
- **Outputs**: PATCH via `supabase.from('mcp_config').upsert({proyecto_id, auto_trigger_on_upload, cron_schedule, updated_at:now()}, {onConflict:'proyecto_id'})`.
- **Dependencies**: `useApp()` for active project; `useAuth()` for admin role.
- **Failure modes**: Non-admin → button disabled with tooltip "Solo administradores".

### `src/components/admin/McpPendingFiles.tsx` (NEW, ~210 lines)
- **Responsibility**: Table of `puntos_archivos WHERE analyzed_at IS NULL AND proyecto IN visible`. Shows pending count badge, "Analizar ahora" button, progress bar during batch.
- **Inputs**: poll `puntos_archivos` every 30s OR use Supabase realtime channel (optional).
- **Outputs**: triggers `functions.invoke('mcp-trigger-analysis', {body:{proyecto_id}})` and displays `{procesados, errores}` from response.
- **Dependencies**: `useApp()`, `useAuth()`.
- **Failure modes**: Trigger in progress → button disabled; partial errors → toast with `errores[]` summary.

### `server/mcp_client.py` (NEW, ~250 lines)
- **Responsibility**: FastAPI HTTP bridge between Civil 3D MCP and Supabase Edge Functions.
- **Endpoints**:
  - `POST /api/mcp/upload` → forwards to `mcp-upload-files` with JWT.
  - `POST /api/mcp/upsert-puntos` → forwards to `mcp-create-puntos`.
  - `POST /api/mcp/refresh-jwt` → calls `/auth/v1/token?grant_type=refresh_token` and caches the new JWT.
- **State**: in-memory `{access_token, refresh_token, expires_at}`; refresh every 50 min.
- **Failure modes**: 401 from Edge → refresh + retry once → 502 if still failing.

---

## Data Model (locked)

### ER diagram

```
                              ┌──────────────────────────┐
                              │ proyectos (existing)     │
                              │  id PK                    │
                              └─────┬────────────────────┘
                                    │ 1:N
                                    ▼
   ┌────────────────────────────────────────────────────────┐
   │ puntos_ferroviarios (existing + new columns)           │
   │   id PK                                                │
   │   proyecto_id FK → proyectos.id  [nullable, legacy]    │
   │   slug text  [nullable, NEW, unique partial idx]       │
   │   coordenadas_cad jsonb  [nullable, NEW]               │
   │   ... (existing cols)                                  │
   └─────┬──────────────────────┬───────────────────────────┘
         │ 1:N                  │ 1:1 (each storage obj)
         ▼                      ▼
   ┌─────────────────┐    ┌───────────────────────────────┐
   │ puntos_archivos │    │ storage.objects (existing)    │
   │  id PK          │    │  bucket text, name text PK     │
   │  punto_id FK    │    └───────────────────────────────┘
   │  bucket text    │
   │  storage_path   │
   │  kind kind_     │
   │   archivo enum  │
   │  subido_por FK  │
   │   →auth.users   │
   │  analyzed_at    │
   │   timestamptz   │
   │   NULL          │
   │  UNIQUE         │
   │   (punto_id,    │
   │    storage_path)│
   └─────────────────┘

   ┌───────────────────────────────┐
   │ mcp_config (1:1 with project) │
   │  proyecto_id PK FK            │
   │  auto_trigger_on_upload bool  │
   │  cron_schedule text NULL      │
   │  updated_at timestamptz       │
   └───────────────────────────────┘
```

### Tables (exact DDL)

```sql
-- kind_archivo enum (per spec: foto, croquis, documento, referencia, ficha)
create type public.kind_archivo as enum ('foto','croquis','documento','referencia','ficha');

create table public.puntos_archivos (
  id uuid primary key default gen_random_uuid(),
  punto_id uuid not null references public.puntos_ferroviarios (id) on delete cascade,
  bucket text not null check (bucket in ('mcp-evidencia','mcp-fichas','mcp-referencias')),
  storage_path text not null,
  kind public.kind_archivo not null,
  subido_por uuid not null references auth.users (id),
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (punto_id, storage_path)  -- idempotent M2M insert
);
create index idx_puntos_archivos_punto on public.puntos_archivos (punto_id);
create index idx_puntos_archivos_pending
  on public.puntos_archivos (punto_id) where analyzed_at is null;  -- trigger scan

create table public.mcp_config (
  proyecto_id uuid primary key references public.proyectos (id) on delete cascade,
  auto_trigger_on_upload boolean not null default false,
  cron_schedule text,
  updated_at timestamptz not null default now()
);

-- puntos_ferroviarios additions
alter table public.puntos_ferroviarios
  add column if not exists slug text,
  add column if not exists coordenadas_cad jsonb;

-- Partial unique index for upsert by slug
create unique index if not exists idx_puntos_slug
  on public.puntos_ferroviarios (slug) where slug is not null;

-- Composite covering index for (proyecto_id, slug) lookups
create index if not exists idx_puntos_slug_proyecto
  on public.puntos_ferroviarios (proyecto_id, slug) where slug is not null;
```

### Index rationale
- `idx_puntos_slug`: partial unique — supports `ON CONFLICT (slug) WHERE slug IS NOT NULL` in RPC; legacy rows with `slug IS NULL` are unaffected.
- `idx_puntos_slug_proyecto`: covers admin "list puntos by project with slug" + MCP re-upsert by `(proyecto_id, slug)`.
- `idx_puntos_archivos_pending`: partial index for the trigger scan; ~10× smaller than full index when only a fraction of files are pending.

### RLS policies (text + role)

```sql
alter table public.puntos_archivos enable row level security;
alter table public.mcp_config enable row level security;

-- Helper fn_es_mcp (text cast avoids 'mcp' enum-context in same tx)
create or replace function public.fn_es_mcp()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_rol_actual()::text = 'mcp', false)
$$;

-- puntos_ferroviarios UPDATE extension: WITH CHECK enforces slug matches existing
drop policy if exists puntos_acceso on public.puntos_ferroviarios;
create policy puntos_select on public.puntos_ferroviarios
  for select to authenticated
  using (public.fn_es_admin()
    or (proyecto_id is not null and public.fn_es_miembro(proyecto_id)));
create policy puntos_insert on public.puntos_ferroviarios
  for insert to authenticated
  with check (public.fn_es_admin()
    or (fn_es_mcp() and proyecto_id is not null and fn_es_miembro(proyecto_id))
    or (proyecto_id is not null and fn_es_miembro(proyecto_id)));
create policy puntos_update on public.puntos_ferroviarios
  for update to authenticated
  using (public.fn_es_admin() or (proyecto_id is not null and fn_es_miembro(proyecto_id)))
  with check (public.fn_es_admin()
    or (slug = (select p.slug from public.puntos_ferroviarios p where p.id = puntos_ferroviarios.id))
    or (proyecto_id is not null and fn_es_miembro(proyecto_id)));
-- El trigger trg_puntos_slug_inmutable es la red final (cubre SECURITY DEFINER paths).
-- La policy de arriba es defense-in-depth para el camino autenticado directo.

-- puntos_archivos
create policy puntos_archivos_select on public.puntos_archivos
  for select to authenticated
  using (
    exists (select 1 from public.puntos_ferroviarios p
      where p.id = puntos_archivos.punto_id
        and (public.fn_es_admin() or fn_es_miembro(p.proyecto_id)))
  );
create policy puntos_archivos_insert on public.puntos_archivos
  for insert to authenticated
  with check (
    subido_por = auth.uid()
    and exists (select 1 from public.puntos_ferroviarios p
      where p.id = puntos_archivos.punto_id
        and (public.fn_es_admin() or fn_es_miembro(p.proyecto_id)))
  );
create policy puntos_archivos_update on public.puntos_archivos
  for update to authenticated
  using (public.fn_es_admin())  -- sólo admin para "stamping" analyzed_at
  with check (public.fn_es_admin());
-- delete: no policy → no DELETE privilege

-- mcp_config: admin writes, admin+general reads
create policy mcp_config_select on public.mcp_config
  for select to authenticated
  using (public.fn_es_admin()
    or (public.fn_rol_actual() = 'general' and fn_es_miembro(proyecto_id)));
create policy mcp_config_modify on public.mcp_config
  for all to authenticated
  using (public.fn_es_admin())
  with check (public.fn_es_admin());

-- Slug-immutability trigger (the hard guard)
create or replace function public.fn_puntos_slug_inmutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'slug_inmutable_post_insert';
  end if;
  return new;
end;
$$;
create trigger trg_puntos_slug_inmutable
  before update on public.puntos_ferroviarios
  for each row execute function public.fn_puntos_slug_inmutable();

-- Grants
grant usage on type public.kind_archivo to authenticated, service_role;
grant select, insert on public.puntos_archivos to authenticated;
grant update on public.puntos_archivos to authenticated;
grant select, insert, update on public.mcp_config to authenticated;
grant all on public.puntos_archivos, public.mcp_config to service_role;
grant execute on function public.fn_es_mcp() to anon, authenticated, service_role;
grant execute on function public.mcp_upsert_punto_por_slug(jsonb, text[]) to authenticated, service_role;
```

### Storage RLS (in migration 3)

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('mcp-evidencia',   'mcp-evidencia',   false, 52428800,
     array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('mcp-fichas',      'mcp-fichas',      false, 52428800,
     array['application/pdf']),
  ('mcp-referencias', 'mcp-referencias', false, 52428800,
     array['application/pdf','image/jpeg','image/png']);

-- MCP can INSERT into mcp-evidencia / mcp-referencias under own UID prefix
create policy mcp_evidencia_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mcp-evidencia'
    and (storage.foldername(name))[1] = auth.uid()::text
    and fn_es_mcp()
  );
create policy mcp_referencias_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mcp-referencias'
    and (storage.foldername(name))[1] = auth.uid()::text
    and fn_es_mcp()
  );
-- mcp-fichas: NO insert policy for any user role → only service_role / Edge
-- Function can write (uses service-role key).

-- Read: admin + general + miembro can SELECT from mcp-evidencia/referencias
create policy mcp_evidence_read on storage.objects for select to authenticated
  using (
    bucket_id in ('mcp-evidencia','mcp-referencias')
    and (public.fn_es_admin() or fn_es_miembro((storage.foldername(name))[1]::uuid))
  );
-- mcp-fichas read: admin or general only (NO mcp, NO usuario)
create policy mcp_fichas_read on storage.objects for select to authenticated
  using (
    bucket_id = 'mcp-fichas'
    and public.fn_rol_actual() in ('administrador','general')
  );
```

---

## Auth Flow (locked)

```
Login:    POST /auth/v1/token?grant_type=password  {email, password}
          → {access_token (1h), refresh_token (rotates every 24h)}

Refresh:  POST /auth/v1/token?grant_type=refresh_token {refresh_token}
          → {access_token (new 1h), refresh_token (new rotated)}
          Trigger: every 50 min from mcp_client.py (config.toml:176 reuse_interval)

Forward:  Edge Function reads `Authorization: Bearer <jwt>` header
          (mirrors sincronizar-puntos/index.ts:147-153)
          Forwards same JWT in `apikey` + `Authorization` to PostgREST
          → RLS uses auth.uid() + auth.role()

Long batch (>1h):  mcp_client.py detects 401 from Edge → refresh → retry once
                   On second 401 → fail loud to MCP UI; admin sees partial
                   pendientes in McpPendingFiles.tsx.
```

The MCP server holds `{access_token, refresh_token}` in process memory; never persisted to disk. On process restart, re-login is required (mirrors how the React UI persists via supabase-js localStorage; the MCP server is not a browser, so we don't reuse that storage path).

---

## Storage Layout (locked)

### Path convention (single, applied to all 3 buckets)
```
{bucket}/{auth.uid()}/{YYYY-MM}/{DD}/{kind}/{slug}.{ext}
```
Examples (UID = `a1b2c3d4-...`, date = 2026-08-20):
- `mcp-evidencia/a1b2c3d4-...-uuid/2026-08/20/foto/PK-001.0.jpg`
- `mcp-fichas/a1b2c3d4-...-uuid/2026-08/20/ficha/PK-001.pdf` (PLATFORM writes only)
- `mcp-referencias/a1b2c3d4-...-uuid/2026-08/20/referencia/Norma-AREMA-2020.pdf`

### `signedUrl` TTL
- `mcp-upload-files` response: 86400 (24h) hardcoded — covers one review session.
- `mcp-generate-download-link`: caller-supplied `ttlSeconds`, validated to [60, 604800], default 86400. Computed by Edge from `Math.min(Math.max(requestBody.ttlSeconds ?? 86400, 60), 604800)`; passed as `expiresIn` to `supabase.storage.createSignedUrl()`.

### Bucket policy SQL (full text in §Data Model above)

### Path-prefix RLS expression
- `(storage.foldername(name))[1]` extracts the first `/`-delimited segment after the bucket name → must equal `auth.uid()::text`.
- The Edge Function ALSO validates this client-side before upload (defense in depth) so a malicious MCP server cannot smuggle paths that bypass the policy.

---

## Migration Ordering

| File | Contents | Why first / last |
|------|----------|------------------|
| `20260821000000_mcp_role.sql` | `ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'mcp';` | Must commit before any statement references `'mcp'` (PG 14+ rule). Single-statement migration is bulletproof. |
| `20260821000001_mcp_endpoints.sql` | Tables, columns, indexes, RPC `mcp_upsert_punto_por_slug`, slug-immutability trigger, RLS extensions, `fn_es_mcp()`, `fn_crear_usuario_mcp()` | Now safe to reference `'mcp'` as enum value (committed). |
| `20260821000002_mcp_buckets_policies.sql` | 3 buckets + Storage RLS + bucket grants | Split from schema so reviewers can focus on policy surface independently (proposal intent, preserved). |

Deviation from proposal's "2 migrations": the enum-value transaction constraint forces a 3-way split. Proposal risk #2 already acknowledged the constraint; this design honors it more strictly than the proposal's "ALTER TYPE ... as standalone statement before any other DDL in migration 1" wording, which would still fail on PG 14+.

---

## UI Flow

### Admin nav integration
- `src/components/admin/McpConfig.tsx` and `src/components/admin/McpPendingFiles.tsx` are rendered inside the existing `<SelectorProyectos />`-style admin section, gated by `useAuth().perfil.rol === 'administrador'`.
- McpConfig shows: per-project toggle `auto_trigger_on_upload` (boolean switch), `cron_schedule` text input (placeholder: "0 * * * *"), mcp-server email (read-only), last-error log (last 20 lines from `puntos_archivos.subido_por` failures).
- McpPendingFiles shows: pending count badge in nav (`usePolling 30s`), table with `punto.nombre`, `kind`, `created_at`, "Analizar ahora" button per row OR bulk for the active project.

### "Analizar ahora" flow
```
1. User clicks button → setState({triggering: true, processed: 0, total: N})
2. functions.invoke('mcp-trigger-analysis', {body: {proyecto_id: active.id}})
3. Edge returns {procesados: N, errores: []} → toast "N puntos analizados"
4. Realtime channel on puntos_archivos refreshes table → pending count drops
```

---

## PR Boundaries (locked, mirror proposal + specifics)

| PR | Files | Est. lines | Reviewer focus | Verification | Rollback |
|----|-------|------------|----------------|--------------|----------|
| **#1 Schema + enum + RLS** | `supabase/migrations/20260821000000_mcp_role.sql` (~5) · `supabase/migrations/20260821000001_mcp_endpoints.sql` (~280) · `supabase/migrations/20260821000002_mcp_buckets_policies.sql` (~80) · `docs/mcp-bootstrap.md` (~40) | ~405 | (a) enum value addition is standalone; (b) RLS extensions don't break existing flow (verify `fn_es_miembro` still applies for non-mcp roles); (c) trigger `trg_puntos_slug_inmutable` mirrors `fn_congelar_rol` pattern | `supabase db reset` clean · `supabase/queries/verify_rls.sql` extended with mcp + slug-mutation scenarios · curl `select fn_es_mcp() = false` as admin | Drop migrations 3→1 + run `ALTER TABLE puntos_ferroviarios DROP COLUMN slug, DROP COLUMN coordenadas_cad; DROP TABLE puntos_archivos, mcp_config; ALTER TYPE rol_usuario DROP VALUE 'mcp';` (forward-only; data preserved if rollback before usage) |
| **#2 Upload + shared helpers** | `supabase/functions/_shared/mcp-auth.ts` (~70) · `supabase/functions/_shared/mcp-storage.ts` (~110) · `supabase/functions/_shared/mcp-buckets.ts` (~30) · `supabase/functions/mcp-upload-files/index.ts` (~140) | ~350 | (a) JWT forwarding pattern mirrors `sincronizar-puntos/index.ts:147-153` exactly; (b) path-prefix validation BEFORE upload; (c) kind=ficha rejected with 400; (d) size/mime checks before file read | `deno run --allow-net --allow-env supabase/functions/mcp-upload-files/index.ts` smoke OR curl with admin JWT: 401 (no JWT), 401 (admin JWT — wrong role), 200 (mcp JWT + valid files) · `eslint .` | Drop files; revert PR; no DB state to undo |
| **#3 Create puntos + RPC** | `supabase/functions/mcp-create-puntos/index.ts` (~120) | ~120 | (a) `mcp_upsert_punto_por_slug` SECURITY INVOKER (caller RLS applies); (b) idempotent M2M insert via `ON CONFLICT (punto_id, storage_path) DO NOTHING`; (c) `storage_ref_inexistente` validated via `storage.head()` before insert | curl smoke: POST with non-existent path → 422; POST with valid path + new slug → 200 + new row; repeat → 200 + same id (idempotent) · `eslint .` · `tsc -b` | Drop file; existing flujo (`sincronizar-puntos` + `guardar_punto_completo`) untouched |
| **#4 Trigger + download link** | `supabase/functions/mcp-trigger-analysis/index.ts` (~160) · `supabase/functions/mcp-generate-download-link/index.ts` (~80) | ~240 | (a) concurrency 5 mirrors `sincronizar-puntos/index.ts:7`; (b) per-punto `analyzed_at` stamp only on success; (c) `ttlSeconds` validated to [60,604800]; (d) mcp role explicitly rejected on download link | curl smoke: `mcp-trigger-analysis` with admin JWT → `{procesados, errores}`; with mcp JWT → 403; `mcp-generate-download-link` with mcp-evidencia path → 403; with mcp-fichas path → 200 | Drop files; revert PR |
| **#5 Admin UI** | `src/components/admin/McpConfig.tsx` (~180) · `src/components/admin/McpPendingFiles.tsx` (~210) · `src/types/index.ts` (+40 for McpConfig, McpUploadResponse, McpPuntoInput, McpUploadKind) · `src/App.tsx` admin nav (+15) | ~445 | (a) gated by `perfil.rol === 'administrador'`; (b) toggle persists via `upsert onConflict:proyecto_id`; (c) pending poll uses existing supabase realtime channel pattern (or simple `setInterval`) | `eslint .` · `tsc -b` · click "Analizar ahora" locally with seeded pendientes | Drop files; admin nav reverts to pre-PR; DB rows untouched (UI-only) |
| **#6 Python client** | `server/mcp_client.py` (~250) · `server/README.md` (+20) | ~270 | (a) JWT refresh every 50 min, not per request; (b) on 401 from Edge → refresh + retry once; (c) `httpx` not added (use stdlib `urllib` + `http.client`); (d) no `print()` of JWT | `python -m pytest server/tests/test_mcp_client.py` (1 unit test: mock 401 → refresh → success) · manual: civil 3D stub end-to-end | Drop files; ADR-006 "Python at repo root is acceptable for OS-level processes" honored |

Total: ~1,830 lines across 6 PRs; per-PR ≤445 lines, **each ≤800 (config.yaml)** and **each ≤400 (chained-pr skill budget)** — note: PR #1 at ~405 is 5 over. **Recommendation: split PR #1 into 1a (enum + tables, ~290 lines) and 1b (RPC + RLS + buckets, ~115 lines)** to honor both budgets strictly. This is a design-level recommendation, applied during `sdd-tasks` if forecast is High.

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `coordenadas_gps.coordenada_x/y` store GPS lng/lat — confusing vs new `coordenadas_cad` X/Y/Z | Med | ADR-004-equivalent comment at every reader of `coordenadas_cad`; spec scenario "MCP cannot UPDATE a punto with a different slug" tested in verify_rls.sql; new code never reads `coordenadas_gps` for CAD purposes |
| `ALTER TYPE ... ADD VALUE 'mcp'` cannot be referenced inside same transaction | Low | 3 migrations; migration 1 commits before any `'mcp'` usage |
| `puntos_ferroviarios` upsert today uses PK `id` (`guardar_punto_completo`) — MCP upsert by `slug` → different code path | Med | New RPC `mcp_upsert_punto_por_slug` separate from `guardar_punto_completo`; existing flow untouched |
| `mcp` JWT forwarded: if MCP server compromised, attacker inserts anywhere within their UID prefix | Med | Path-prefix validation client-side + bucket policy server-side + 50MB / 20-file / kind allowlist; every insert logged in `puntos_archivos.subido_por`; admin sees count badge |
| Admin trigger runs `analyze-railway-images` sync up to N puntos → long request | Med | Concurrency 5 (mirrors `sincronizar-puntos`); 60s per-call timeout; per-punto errors captured in `errores[]` not aborting the batch; UI shows progress (badge + button states) |
| `server/mcp_client.py` introduces Python at repo root — new convention | Low | Mirrors ADR-006 (nas-watcher runs as separate OS process); `server/README.md` updated |
| Existing flows (`sincronizar-puntos`, `analyze-railway-images`, React UI) MUST NOT regress | Med | No shared column writes; new RPC is its own function; verify each PR with `eslint .` + `tsc -b` + curl smoke test |
| **(design)** Supabase Storage RLS with `(storage.foldername(name))[1]` requires the path to have a slash-separated first segment — MCP server must NOT upload to top-level paths | Med | `_shared/mcp-storage.ts` validates prefix BEFORE calling `storage.upload()`; spec scenario "MCP cannot write under another UID prefix" tested |
| **(design)** `mcp-trigger-analysis` uses service-role key to call `analyze-railway-images` bypassing caller RLS — if Edge Function is misconfigured, all projects' pendientes could be triggered | Low | Function requires explicit `proyecto_id` in body; `puntos_archivos` query is filtered by `punto.proyecto_id = p_proyecto`; idempotent retry on partial failure |
| **(design)** Long-running batch (50+ pendientes) — single `mcp-trigger-analysis` call exceeds Edge Function timeout (~150s default in Supabase) | Med | Concurrency 5 keeps total wall-time bounded; for very large batches, client-side chunking (UI shows "Procesando 50/120") OR future async pattern (Out of Scope here) |

---

## Rollback

### Per-PR
See the "Rollback" column in the §PR Boundaries table. PRs #2-#6 are file-deletion rollbacks (no DB state). PR #1 is forward-only and requires the emergency migration below if rolled back after data was written.

### Emergency full rollback migration (run AFTER PR #1 is on main)
```sql
-- 20260821000099_mcp_endpoints_rollback.sql (DO NOT COMMIT to repo unless
--   production rollback is needed; one-shot script)
delete from public.puntos_archivos;          -- removes M2M rows
delete from public.mcp_config;
drop table if exists public.puntos_archivos cascade;
drop table if exists public.mcp_config cascade;
alter table public.puntos_ferroviarios drop column if exists coordenadas_cad;
alter table public.puntos_ferroviarios drop column if exists slug;
drop index if exists public.idx_puntos_slug;
drop index if exists public.idx_puntos_slug_proyecto;
drop trigger if exists public.trg_puntos_slug_inmutable on public.puntos_ferroviarios;
drop function if exists public.fn_puntos_slug_inmutable();
drop function if exists public.mcp_upsert_punto_por_slug(jsonb, text[]);
drop function if exists public.fn_es_mcp();
drop type if exists public.kind_archivo;
delete from storage.buckets where id in ('mcp-evidencia','mcp-fichas','mcp-referencias');
-- ALTER TYPE cannot DROP VALUE in PG; 'mcp' remains inert (no user has it).
```
**Caveat**: `ALTER TYPE` cannot `DROP VALUE` in PG; the `'mcp'` enum label persists as inert. Acceptable: it costs 4 bytes per enum definition and prevents future reuse of the label.

### JWT + secrets
- No Edge Function secrets added (none needed; OPENROUTER_API_KEY already exists for `analyze-railway-images`).
- `mcp-server@<domain>` user: drop via `delete from auth.users where email = 'mcp-server@<domain>'` (cascades to `perfiles` via FK).

---

## Open Questions

- [ ] `mcp-server@<domain>` placeholder: confirm domain for the technical user (e.g., `mcp-server@analizador-ferroviario.local` for local dev; production TBD). Decision needed before PR #1 merge.
- [ ] `cron_schedule` semantics — is the format `pg_cron` style (`0 * * * *`) or Supabase Edge Function cron (`@hourly`)? Spec says stored only; semantics deferred to future change. Document as text-only field.
- [ ] Should `mcp-generate-download-link` ALSO accept `mcp-evidencia` paths for admin/general (read-only)? Current spec restricts to `mcp-fichas` only (signed-URL helper). Confirm — design assumes spec.

**None of the above BLOCKS this design.** Apply can proceed with placeholders for #1 and #2; the schema accepts whatever string.

## Next Step
Ready for `sdd-tasks` (PR slicing confirmation + per-PR task plan).
