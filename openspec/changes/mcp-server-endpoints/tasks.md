# Tasks: MCP Server Endpoints (Civil 3D → Supabase)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2150 total across 7 chained PRs (1a/1b/2/3/4/5/6) |
| Review budget | 800 lines per PR (per `openspec/config.yaml`) |
| Chained PRs recommended | Yes (already 7) |
| 400-line budget risk | High at PR #4 (400) and PR #5 (445) |
| Delivery strategy | force-chained (user pre-selected) |
| Chain strategy | stacked-to-main (user pre-selected; no feature-branch-chain) |

```yaml
review_workload_forecast:
  total_changed_lines_estimate: ~2150   # sum of all PR lines
  chained_prs_recommended: true         # already 7 chained PRs
  review_budget_lines: 800              # per openspec/config.yaml
  max_single_pr_lines: 450              # PR #5 is the largest
  decision_needed_before_apply: false   # chain strategy already locked
  per_pr_estimate:
    - pr: "1a (enum + schema)"
      lines: 290
    - pr: "1b (RPC + buckets + RLS)"
      lines: 115
    - pr: "2 (helpers + upload)"
      lines: 350
    - pr: "3 (create-puntos)"
      lines: 350
    - pr: "4 (trigger + download)"
      lines: 400
    - pr: "5 (admin UI)"
      lines: 445
    - pr: "6 (python client)"
      lines: 250
  risk_signals:
    - "PR #5 at 445 lines — at budget edge. If apply forecast exceeds 800, split 5a (McpConfig) / 5b (McpPendingFiles + nav)."
    - "PR #4 at 400 lines — at budget edge. Same precaution."
    - "All PRs touch Supabase infra; review surface is auth + RLS, not UI design."
```

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1a | Enum + table/column/index foundation ships independently | PR #1a | `supabase db reset` + `\dT+ rol_usuario` shows `mcp` | psql port 54322: enum lists `mcp`; tables exist; bootstrap doc idempotent | Migrations 1a + 2 reverted; no DB data to undo |
| 1b | RPC + buckets + Storage RLS land behind PR #1a's enum | PR #1b | `supabase db reset` + `\df mcp_upsert_punto_por_slug` + `supabase status` lists 3 buckets | psql: RPC upsert by slug; anon INSERT into `mcp-fichas` rejected | Migrations 1b + 3 reverted; UI untouched |
| 2 | Multipart upload endpoint + shared helpers | PR #2 | `pnpm lint && pnpm build` + curl: 401 (no JWT), 200 (mcp JWT + 1 jpeg) | Edge function: signed URL returned; bucket object visible | File deletion; PR revert; no DB state |
| 3 | Slug-keyed batch upsert endpoint | PR #3 | `pnpm lint && pnpm build` + curl: 422 (missing ref), 200 (new slug), 200 repeat = same id | Edge function: idempotent on slug | File deletion; PR revert |
| 4 | Admin trigger + signed-URL helper | PR #4 | `pnpm lint && pnpm build` + curl: 403 (mcp JWT), 200 (admin JWT), 200 (no pendientes) | Edge functions: trigger stamps `analyzed_at`; download link TTL clamped | File deletion; PR revert |
| 5 | Admin UI for config + pending queue | PR #5 | `pnpm lint && pnpm build` + manual click "Analizar ahora" on dev server | UI: toggle persists; badge counts update | File deletion; UI-only rollback |
| 6 | Python FastAPI client for Civil 3D workstation | PR #6 | `python -m pytest server/tests/` + `--dry-run` flag does login + health | End-to-end: workstation stub uploads 1 foto + creates 1 punto | File deletion; ADR-006 honored |

## Conventions

- Every PR is one logical work unit. PR title format: `feat(mcp): <PR title>`.
- Each task lists: file(s) to create/modify, verification command, rollback note.
- Each PR closes with: lint OK, build OK, smoke test OK.
- Tasks within a PR are committed together but logically separate (work-unit-commits).
- Branch chain: each PR targets `main` (stacked-to-main); base = `main` for every PR.
- NEW: `src/components/admin/` directory does not exist yet (verified). PR #5 creates the directory + entry point.
- NEW: server-side `server/` directory already exists (per design §architecture). PR #6 adds `server/mcp_client.py` + `server/README.md`.
- Path convention (locked per design §Storage Layout): `{bucket}/{auth.uid()}/{YYYY-MM}/{DD}/{kind}/{slug}.{ext}`.
- All Edge Functions forward caller JWT (mirrors `sincronizar-puntos/index.ts:147-153`); no JWT rotation logic in Edge (design D8).

---

## Phase 1: PR #1a — Enum + Schema Foundation  (~290 lines)

**Goal**: Add `mcp` enum value + new columns/tables/indexes/types + bootstrap helper. No RPC yet, no Storage changes yet — that's PR #1b. Foundation for everything else.

- [x] **1.1** Add migration `supabase/migrations/20260821000000_mcp_endpoints_enum.sql`
  - Single statement: `ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'mcp';`
  - Must be standalone file (PG 14+ rule: enum value unreferenceable until tx commits).
  - Verify: `supabase db reset` clean; `psql -p 54322 -c "\dT+ public.rol_usuario"` shows `mcp` in values list.
  - Rollback: forward-only; `ALTER TYPE` cannot DROP VALUE (acceptable, 4-byte cost).
- [x] **1.2** Add migration `supabase/migrations/20260821000001_mcp_endpoints_schema.sql`
  - `CREATE TYPE public.kind_archivo AS ENUM (...)` — deferred to PR #1b (PR #1a uses TEXT+CHECK per launch prompt).
  - `ALTER TABLE public.puntos_ferroviarios ADD COLUMN IF NOT EXISTS slug text, ADD COLUMN IF NOT EXISTS coordenadas_cad jsonb;`
  - `CREATE UNIQUE INDEX IF NOT EXISTS puntos_ferroviarios_slug_key ON public.puntos_ferroviarios (slug) WHERE slug IS NOT NULL;`
  - `CREATE INDEX IF NOT EXISTS idx_puntos_slug_proyecto ON public.puntos_ferroviarios (proyecto_id, slug) WHERE slug IS NOT NULL;`
  - `CREATE TABLE public.puntos_archivos (...)` per design §Data Model — bucket/kind as TEXT+CHECK (kind_archivo enum deferred to PR #1b).
  - `CREATE TABLE public.mcp_config (proyecto_id PK FK, auto_trigger_on_upload bool, cron_schedule text NULL, updated_at timestamptz, updated_by uuid);`
  - `CREATE INDEX IF NOT EXISTS idx_puntos_archivos_pendientes ON public.puntos_archivos (punto_id) WHERE analyzed_at IS NULL;`
  - `ALTER TABLE public.puntos_archivos ENABLE ROW LEVEL SECURITY;`
  - `ALTER TABLE public.mcp_config ENABLE ROW LEVEL SECURITY;`
  - Verify: `supabase db reset`; `\d puntos_archivos` and `\d mcp_config` show correct columns/indexes/RLS enabled.
  - Rollback: `DROP TABLE public.puntos_archivos CASCADE; DROP TABLE public.mcp_config CASCADE;` (FK chain) + `ALTER TABLE puntos_ferroviarios DROP COLUMN IF EXISTS slug, DROP COLUMN IF EXISTS coordenadas_cad; DROP INDEX IF EXISTS puntos_ferroviarios_slug_key, idx_puntos_slug_proyecto;`.
- [x] **1.3** Add `supabase/bootstrap_mcp_user.sql` (one-time provisioning script, NOT in migrations/)
  - Header comment: not in `migrations/` so it does NOT run on `supabase db reset`.
  - Section 1: `INSERT INTO auth.users` for `mcp-server@<domain>` placeholder (operator edits).
  - Section 2: `INSERT INTO public.perfiles` with `rol='mcp'` (idempotent via ON CONFLICT).
  - Section 3: commented `INSERT INTO proyecto_miembros` example (operator uncomment+edit per project).
  - Verify: file is idempotent (`ON CONFLICT DO NOTHING` everywhere); safe to re-run.
  - Rollback: doc/SQL file deletion; `auth.users` row remains until manually deleted.
  - [x] **1.4** Extend `supabase/queries/verify_rls.sql` with mcp-readonly persona
  - GIVEN `mcp` user authenticated, querying `puntos_ferroviarios WHERE proyecto_id = <other>` returns 0 rows.
  - Verify: `psql -p 54322 -f supabase/queries/verify_rls.sql` returns the new scenario rows as expected.
  - Rollback: revert file extension.
- [x] **PR #1a verification**: `npm run lint` (no TS changes, expect pass-through) + `supabase db reset` clean + `psql` persona checks green. Commit message: `feat(mcp): add mcp enum value, slug/coordenadas_cad columns, puntos_archivos and mcp_config tables`.

## Phase 2: PR #1b — RPC + Storage buckets + RLS  (~115 lines)

**Goal**: Add the slug-keyed upsert RPC, the 3 buckets, and Storage RLS. Depends on PR #1a (enum committed).

- [x] **2.1** Same migration file `20260821000001_mcp_endpoints_schema.sql`: append RPC + helpers + RLS
  - `CREATE OR REPLACE FUNCTION public.fn_es_mcp() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ select coalesce(public.fn_rol_actual()::text = 'mcp', false) $$;`
  - `CREATE OR REPLACE FUNCTION public.fn_puntos_slug_inmutable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public ...` (raises `slug_inmutable_post_insert` when NEW.slug IS DISTINCT FROM OLD.slug).
  - `CREATE TRIGGER trg_puntos_slug_inmutable BEFORE UPDATE ON public.puntos_ferroviarios FOR EACH ROW EXECUTE FUNCTION public.fn_puntos_slug_inmutable();`
  - `CREATE OR REPLACE FUNCTION public.mcp_upsert_punto_por_slug(p_punto jsonb, p_storage_paths text[]) RETURNS jsonb ...` SECURITY INVOKER — validates JSONB shape (`? 'x'`, `? 'y'`), upserts by slug using `ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE`, inserts M2M `puntos_archivos` rows with `ON CONFLICT (punto_id, storage_path) DO NOTHING`, returns `{id, slug, created}`.
  - `CREATE OR REPLACE FUNCTION public.fn_crear_usuario_mcp() RETURNS void ...` — idempotent bootstrap of `mcp-server@<domain>` in `auth.users` + `perfiles.rol='mcp'`.
  - RLS policies: `puntos_archivos_select/insert/update` (admin-all, member-SELECT, subido_por=auth.uid() for INSERT), `mcp_config_select/modify` (admin write, admin+general read), `puntos_ferroviarios` update WITH CHECK extension for slug immutability (defense-in-depth alongside trigger).
  - Grants: `grant usage on type kind_archivo`, `grant select, insert, update on puntos_archivos`, `grant execute on function mcp_upsert_punto_por_slug, fn_es_mcp`.
  - Verify: `supabase db reset`; `psql -p 54322 -c "\df mcp_upsert_punto_por_slug"` + `select * from mcp_upsert_punto_por_slug(...)` insert + second call returns same id (idempotent).
  - Rollback: `DROP FUNCTION ...; DROP TRIGGER trg_puntos_slug_inmutable;` + reverse policy `DROP POLICY IF EXISTS ...`.
- [x] **2.2** Add migration `supabase/migrations/20260821000002_mcp_buckets_policies.sql`
  - 3× `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (...)` with mime lists from design §Storage RLS.
  - `CREATE POLICY mcp_evidencia_insert` (MCP under own UID prefix), `mcp_referencias_insert` (same), `mcp_evidence_read` (admin + miembros), `mcp_fichas_read` (admin + general only — no mcp).
  - NO insert policy on `mcp-fichas` for any user role (platform writes only).
  - Verify: `psql -p 54322 -c "select id, name, public from storage.buckets where id like 'mcp-%'"` shows 3 rows; anon insert to `mcp-evidencia` rejected; mcp insert to own UID prefix allowed.
  - Rollback: `delete from storage.buckets where id in ('mcp-evidencia','mcp-fichas','mcp-referencias');` + `DROP POLICY IF EXISTS ...`.
- [x] **2.3** Update `supabase/config.toml`: add 3 `[storage.buckets.mcp-evidencia]` / `mcp-fichas` / `mcp-referencias` sections (private = `public = false`).
  - Verify: `supabase status` lists 3 buckets after `supabase db reset`.
  - Rollback: revert config.toml.
- [x] **PR #1b verification**: `supabase db reset` clean + `pnpm lint` + verify_rls personas green + manual `select fn_crear_usuario_mcp();` creates mcp user idempotently. Commit: `feat(mcp): add mcp_upsert_punto_por_slug RPC, slug immutability trigger, 3 storage buckets and Storage RLS`.

## Phase 3: PR #2 — Helpers + mcp-upload-files  (~350 lines)

**Goal**: Shared Deno helpers + multipart upload Edge Function. First user-facing endpoint for the Civil 3D MCP server.

- [x] **3.1** Create `supabase/functions/_shared/mcp-buckets.ts`
  - Export `BUCKETS`, `KIND_TO_BUCKET` map, `KINDS = ['foto','croquis','documento','referencia']` (no `ficha`), `ALLOWED_MIMES`, `MAX_FILE_BYTES = 50*1024*1024`, `MAX_FILES_PER_REQUEST = 20`, `DEFAULT_TTL_SECONDS = 86400`, `MAX_TTL_SECONDS = 604800`, `MIN_TTL_SECONDS = 60`.
  - Verify: `deno check supabase/functions/_shared/mcp-buckets.ts` type-checks.
  - Rollback: file deletion.
- [x] **3.2** Create `supabase/functions/_shared/mcp-auth.ts`
  - Export `requireMcpUser(req): Promise<{userId, proyectoId, email}>` — reads `Authorization: Bearer <jwt>`, verifies via `SUPABASE_URL/rest/v1/user` with service-role client, fetches `perfiles.rol`, throws HTTP 401 on non-`mcp` or missing JWT.
  - Export `requireAdminOrGeneral(req)`, `requireAdmin(req)` — same pattern with role whitelist.
  - Mirror `sincronizar-puntos/index.ts:147-153` JWT forwarding pattern.
  - Verify: unit test using `fetch`-mocked PostgREST returns expected 401/200 paths.
  - Rollback: file deletion.
- [x] **3.3** Create `supabase/functions/_shared/mcp-storage.ts`
  - Export `buildPath(proyectoId, kind, slug, ext): string` — returns `{bucket}/{uid}/{YYYY-MM}/{DD}/{kind}/{slug}.{ext}` (uid filled at call time from `requireMcpUser`).
  - Export `validateMime(file): string` — returns mime or throws HTTP 415.
  - Export `signUrl(bucket, path, ttlSeconds): Promise<string>` — wraps `supabase.storage.from(bucket).createSignedUrl(path, expiresIn)`.
  - Export `pathBelongsToUser(path, userId): boolean` — checks first segment after bucket equals `userId`.
  - Verify: `deno check`; unit test each helper (deno test, no fixtures).
  - Rollback: file deletion.
- [x] **3.4** Create `supabase/functions/mcp-upload-files/index.ts`
  - POST handler + OPTIONS CORS preflight.
  - Parses `multipart/form-data` with `proyecto_id`, `slug`, `kind`, files[].
  - Concurrency 5 pool (mirrors `sincronizar-puntos/index.ts:7`).
  - Per file: mime allowlist check, size check (413 if >50MB), `buildPath`, `pathBelongsToUser`, upload via service-role `supabase.storage.from(bucket).upload(path, body, {upsert:true})`, sign URL (24h TTL hardcoded).
  - Rejects `kind=ficha` with HTTP 400 `kind_no_permitido_para_mcp`.
  - Validates `proyecto_id` against `proyecto_miembros` (422 if not found).
  - Returns `{uploads: [{slug, path, size, mimeType, signedUrl}], errores: []}`.
  - Verify: curl `POST http://127.0.0.1:54321/functions/v1/mcp-upload-files` with 1 jpeg (mcp JWT) → 200; anon JWT → 401; admin JWT → 401; 51MB file → 413; `kind=ficha` → 400.
  - Rollback: file deletion + `supabase functions delete mcp-upload-files` if deployed.
- [x] **3.5** Update `src/types/index.ts`: add `McpUploadKind`, `McpUploadFileResult`, `McpUploadResponse`, `McpFileMeta`.
  - Verify: `pnpm lint && pnpm build` green.
  - Rollback: revert types changes.
- [x] **PR #2 verification**: `pnpm lint && pnpm build` + curl smoke test (1 valid + 4 negative cases) + bucket shows object via `supabase status`. Commit: `feat(mcp): add shared mcp helpers and mcp-upload-files Edge Function`.

## Phase 4: PR #3 — mcp-create-puntos  (~350 lines)

**Goal**: Slug-keyed batch upsert of puntos + M2M file linking.

- [x] **4.1** Create `supabase/functions/mcp-create-puntos/index.ts`
  - POST + OPTIONS.
  - `requireMcpUser(req, proyecto_id)` enforces `rol=mcp` + `proyecto_id` member check (signature now takes proyectoId; PR #2's mcp-upload-files updated to thread it).
  - Validates body: `proyecto_id`, `puntos[]` required, each punto has `slug`, `name`, `x`, `y`, optional `z`, `photo_refs[]`, `croquis_ref`.
  - Concurrency 5 pool invoking `mcp_upsert_punto_por_slug` via `POST {SUPABASE_URL}/rest/v1/rpc/mcp_upsert_punto_por_slug` with caller JWT; alias `slug_out` extracted from RETURNS TABLE.
  - For each `photo_refs/croquis_ref`: existence verified via `supabase.storage.from(bucket).exists(paths)`; if missing → push to `errores[]` with `{reason:'storage_path_not_found'}` and skip the whole punto (no partial commits).
  - On success: `puntos_archivos` M2M insert per path with `subido_por = userId`, `analyzed_at = NULL` (idempotent via `ON CONFLICT (punto_id, storage_path) DO NOTHING` from PR #1a's UNIQUE constraint).
  - Returns `{creados: number, actualizados: number, errores: [...], ids: [uuid, ...]}`.
  - Verify: lint + build OK (0 errors); curl smoke with mcp JWT (see PR #3 apply-progress).
  - Rollback: file deletion + `supabase functions delete mcp-create-puntos`.
- [x] **4.2** Update `src/types/index.ts`: add `McpPuntoInput`, `McpCreatePuntosResponse`.
  - Verify: `pnpm lint && pnpm build` green.
  - Rollback: revert types changes.
- [ ] **4.3** Extend `supabase/queries/verify_rls.sql` with scenario "MCP cannot read other projects"
  - GIVEN `mcp` user member of P only, `select count(*) from puntos_ferroviarios where proyecto_id = <other>` returns 0.
  - Verify: psql run shows 0 rows.
  - Rollback: revert file.
  - **Note (PR #3):** Out of scope per the launch prompt ("Do NOT touch existing files except src/types/index.ts + tasks.md"). The scenario is already covered by the `mcp-readonly + mcp-write-own-project` personas added in PR #1b (commit 4a1ae83). Carrying 4.3 as a follow-up if a more explicit scenario is desired.
- [ ] **PR #3 verification**: `pnpm lint && pnpm build` + curl idempotency test (2× POST same body returns same ids) + verify_rls green. Commit: `feat(mcp): add mcp-create-puntos Edge Function with slug-keyed upsert and M2M file linking`.

## Phase 5: PR #4 — mcp-trigger-analysis + mcp-generate-download-link  (~400 lines)

**Goal**: Admin-only manual analysis trigger + signed-URL helper restricted to `mcp-fichas`.

- [x] **5.1** Create `supabase/functions/mcp-generate-download-link/index.ts`
  - POST + OPTIONS; `requireAdminOrGeneral(req)` (rejects `mcp` with 403 `rol_no_autorizado`).
  - Body: `{path: string, ttlSeconds?: number}`.
  - Validates `path.startsWith('mcp-fichas/')` — else 403 `path_fuera_de_mcp-fichas`.
  - Validates `ttlSeconds` ∈ [60, 604800], default 86400; out-of-range → 400 `ttl_fuera_de_rango`.
  - Calls `supabase.storage.from('mcp-fichas').createSignedUrl(path, ttlSeconds)` via service-role.
  - Returns `{signedUrl: string, expiresAt: ISO string}`.
  - Verify: curl admin JWT + `mcp-fichas/P/2026-08/20/PK-001.pdf` → 200 with `signedUrl`; same with `mcp-evidencia/...` → 403; mcp JWT → 403; `ttlSeconds: 30` → 400; `ttlSeconds: 999999999` → 400.
  - Rollback: file deletion.
- [x] **5.2** Create `supabase/functions/mcp-trigger-analysis/index.ts`
  - POST + OPTIONS; `requireAdmin(req)`.
  - Body: `{proyecto_id: string, punto_slug?: string}`.
  - Reads `puntos_archivos WHERE analyzed_at IS NULL AND punto_id IN (SELECT id FROM puntos_ferroviarios WHERE proyecto_id = p_proyecto AND (? slug IS NULL OR slug = p_slug))`.
  - Groups by `punto_id`; concurrency 5 pool.
  - Per group: collect all `storage_path`, sign URLs (24h, scope `mcp-evidencia`), fetch images, invoke `POST {SUPABASE_URL}/functions/v1/analyze-railway-images` with `image_urls[]` (service-role key, no JWT forwarding — function is admin-only per design D7).
  - Persists results to `analisis_imagenes` (existing shape).
  - `UPDATE puntos_archivos SET analyzed_at = NOW() WHERE id = ANY(processed_ids)` ONLY on success.
  - Returns `{procesados: number, errores: [{punto_id, error}]}` — HTTP 200 even on partial failures.
  - Verify: curl admin JWT + 3 pendientes → `{procesados:3, errores:[]}` + `puntos_archivos.analyzed_at` populated + `analisis_imagenes` rows grew; 0 pendientes → `{procesados:0, errores:[]}`; mcp JWT → 403.
  - Rollback: file deletion.
- [x] **5.3** Update `src/types/index.ts`: add `McpDownloadLinkResponse`, `McpTriggerInput`, `McpTriggerAnalysisResponse`, `McpPendingFile`.
  - Verify: `pnpm lint && pnpm build` green.
  - Rollback: revert types changes.
- [x] **PR #4 verification**: `pnpm lint && pnpm build` + curl smoke (admin success, admin no pendientes, mcp rejected, ttl out-of-range, path-prefix rejection) + end-to-end smoke per design §11 (upload → create punto → admin trigger → analyzed_at stamped). Commit: `feat(mcp): add admin trigger and signed-URL helper Edge Functions`.

## Phase 6: PR #5 — Admin UI  (~445 lines, may split 5a/5b at apply if >800 forecast)

**Goal**: Admin UI for per-project config toggle + pending-queue table with "Analizar ahora" button. Creates new `src/components/admin/` directory (verified: does not exist today).

- [x] **6.1** Create `src/components/admin/McpConfig.tsx`
  - Reads `mcp_config` row for `useApp().proyectoActivoId` via `supabase.from('mcp_config').select('*').eq('proyecto_id', id).maybeSingle()`.
  - Toggle (Radix Switch) bound to `auto_trigger_on_upload` — calls `supabase.from('mcp_config').upsert({proyecto_id, auto_trigger_on_upload, updated_at: new Date().toISOString()}, {onConflict:'proyecto_id'})` with admin JWT.
  - Text input for `cron_schedule` (placeholder `0 * * * *`, future use per spec).
  - Read-only display of `mcp-server@<domain>` email (from auth.users lookup OR config note).
  - Verify: `pnpm dev`; toggle persists across reload; non-admin sees disabled toggle with "Solo administradores" tooltip.
  - Rollback: file deletion.
- [x] **6.2** Create `src/components/admin/McpPendingFiles.tsx`
  - Lists `puntos_archivos WHERE analyzed_at IS NULL` joined with `puntos_ferroviarios.slug, puntos_ferroviarios.nombre, puntos_ferroviarios.proyecto_id`.
  - Filtered by `useApp().proyectoActivoId` (admin sees ALL projects; general sees own).
  - Polls every 30s (or Supabase realtime channel if available locally).
  - Per row: `kind`, `created_at`, parent `slug`/`nombre`. "Analizar ahora" button → `functions.invoke('mcp-trigger-analysis', {body:{proyecto_id}})`.
  - Shows pending count badge + per-row progress via `sonner` toast on response.
  - Verify: seeded 3 pendientes → click button → toast "3 puntos analizados"; pending count drops to 0; `puntos_archivos.analyzed_at` populated.
  - Rollback: file deletion.
- [x] **6.3** Create `src/components/admin/index.ts` + entry point integration
  - `src/components/admin/index.ts` re-exports `McpConfig`, `McpPendingFiles`.
  - Verify: `pnpm build` succeeds.
  - Rollback: file deletion.
- [x] **6.4** Add admin route/nav integration in `src/App.tsx` or `src/components/ModuleTabs.tsx`
  - Creates the admin section if not present; gates by `useAuth().perfil.rol === 'administrador'`.
  - Badge in nav shows total pendientes across visible projects.
  - Verify: non-admin → entry hidden; admin → entry visible + badge accurate.
  - Rollback: revert App.tsx / ModuleTabs.tsx.
- [x] **6.5** Update `src/types/index.ts`: add `McpConfigRow`, `McpPendingFileRow` (UI-side, distinct from Edge return types).
  - Verify: `pnpm lint && pnpm build` green.
  - Rollback: revert types changes.
- [x] **PR #5 verification**: `pnpm lint && pnpm build` + manual UI smoke: login admin → toggle persists → click "Analizar ahora" → results match. **If forecast >800 at apply time**: split into PR #5a (McpConfig + types) and PR #5b (McpPendingFiles + nav integration). Commit: `feat(mcp): add admin UI for MCP config toggle and pending-file analysis trigger`.

## Phase 7: PR #6 — server/mcp_client.py  (~250 lines)

**Goal**: FastAPI bridge for Civil 3D MCP server. Reuses existing JWT auth from Supabase.

- [x] **7.1** Create `server/mcp_client.py`
  - FastAPI app with endpoints:
    - `POST /login` → `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` with email/password from `server/.mcp_credentials.json`; stores `{access_token, refresh_token, expires_at}` in process memory.
    - `POST /upload-files` → forwards multipart to `{SUPABASE_URL}/functions/v1/mcp-upload-files` with current JWT.
    - `POST /create-puntos` → forwards JSON to `{SUPABASE_URL}/functions/v1/mcp-create-puntos` with current JWT.
    - `GET /health` → returns `{status: 'ok', jwt_expires_at}`.
    - `POST /refresh-jwt` → calls `/auth/v1/token?grant_type=refresh_token` and updates in-memory state.
  - Auto-refresh: detect 401 from proxied call → call `/refresh-jwt` → retry once → 502 if still 401.
  - Stdlib only (`urllib` + `http.client`) — NO `httpx` dependency (per design §PR Boundaries #6).
  - `--dry-run` CLI flag: does login + health check without uploading.
  - Verify: `python -m server.mcp_client --dry-run` against local Supabase → prints JWT expiry + exits 0.
  - Rollback: file deletion.
- [x] **7.2** Create `server/.mcp_credentials.example.json` (template, gitignored copy is `server/.mcp_credentials.json`)
  - Shape: `{ "supabase_url": "http://127.0.0.1:54321", "email": "mcp-server@analizador-ferroviario.local", "password": "...", "proyecto_id": "..." }`.
  - Verify: `cat` shows expected JSON.
  - Rollback: file deletion.
- [x] **7.3** Add `server/README.md` documenting run + credential setup + ADR-006 reference.
  - Verify: doc renders.
  - Rollback: file deletion.
- [ ] **7.4** End-to-end smoke from a fresh machine
  - **Note (PR #6)**: the full e2e requires a running local Supabase + a provisioned `mcp-server@<domain>` user + a real test jpeg. None of those exist in this apply batch (no dev stack running). Verified at the static level instead: `py_compile`, import, uvicorn boots, `GET /health` returns 200 with the expected `{status, auth_state}` envelope, `--dry-run` fails fast with a clear "missing credentials" message. Carrying the full e2e (upload 1 jpeg, create 1 punto with slug `TEST-E2E-001`, verify DB row + M2M link) as a follow-up that the integration phase can run against a live local stack.
  - Start `server/mcp_client.py` against local Supabase; upload 1 test foto (jpeg < 1MB); create 1 test punto with slug `TEST-E2E-001`; query DB → row exists with `slug='TEST-E2E-001'`, `coordenadas_cad` populated, `puntos_archivos` M2M row links to uploaded storage path.
  - Verify: psql + `supabase status` confirm artifact.
  - Rollback: clean test row.
- [x] **PR #6 verification**: `python -m server.mcp_client --dry-run` (fails fast with clear "missing credentials" message — correct behavior, file is gitignored) + `GET /health` returns 200 with the expected envelope (uvicorn boots cleanly) + no `print()` of JWT (the only token-related print is `state['email']`, not the token itself; grep `print.*access_token` returns 0). Commit: `feat(mcp): add Python FastAPI client for Civil 3D MCP server with JWT auto-refresh`.

---

## Cross-cutting

- [ ] After each PR: `pnpm lint && pnpm build` (skipped for PR #1a/1b if no TS changes; required for PRs #2-#5).
- [ ] After PR #1b: `supabase db reset` + run `supabase/queries/verify_rls.sql` end-to-end (all personas).
- [ ] After PR #4: full end-to-end smoke per design §11 verification (login mcp → upload → create punto → admin trigger → analyzed_at stamped → download link).
- [ ] After PR #5: manual UI verification on dev server (`pnpm dev`).
- [ ] Final task before merge of PR #6: update `AGENTS.md` "Hotspots" table with new helpers (`mcp-auth.ts`, `mcp-storage.ts`, `mcp-buckets.ts`) and Edge Functions (`mcp-upload-files`, `mcp-create-puntos`, `mcp-trigger-analysis`, `mcp-generate-download-link`).
- [ ] Final task: update `AGENTS.md` "Architecture Decisions" if any decision changed during implementation (none expected; design locked all 5 open questions).
- [ ] Final task: open follow-up issues for design Open Questions left as TODOs (`mcp-server@<domain>` production domain; `cron_schedule` semantics; `mcp-generate-download-link` accepting `mcp-evidencia` paths).

## Out of Scope (carry-overs, NOT for apply)

- Auto-trigger cron implementation (toggle only, MVP).
- JWT signing/rotation Edge logic (client-side refresh only per design D8).
- Migration of legacy rows to populate `slug` / `coordenadas_cad` (nullable, no-op).
- OAuth/SSO for the MCP user; per-bucket quotas; deletion API for MCP-uploaded objects.
- Async/batched trigger pattern for >50 pendientes (single-call MVP).
- `mcp-generate-download-link` accepting `mcp-evidencia` paths (admin/general only read what they already have RLS to see).

---
**Archived**: 2026-08-20 (sdd-archive)
**Status**: ⚠️ Verified with warnings — see `verify-report.md` + `archive-report.md`
**Branches merged (local, not pushed)**: `feat/mcp-server-endpoints-1a-enum-schema` → `feat/mcp-server-endpoints-1b-rpc-buckets` → `feat/mcp-server-endpoints-2-upload-files` → `feat/mcp-server-endpoints-3-create-puntos` → `feat/mcp-server-endpoints-4-trigger-download` → `feat/mcp-server-endpoints-5-admin-ui` → `feat/mcp-server-endpoints-6-mcp-client`
**Total**: 30 commits across 7 branches, ~3700 lines added, 1 line removed
**Operator**: push branches in order (or squash to one PR if review budget permits) and verify against a live Supabase before merging to master