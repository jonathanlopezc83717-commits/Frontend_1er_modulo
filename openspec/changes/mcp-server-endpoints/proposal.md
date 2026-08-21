# Proposal: MCP Server Endpoints (Civil 3D → Supabase)

## Intent

The Civil 3D MCP server (running on a workstation with AutoCAD) needs
network endpoints to push railway points + their evidence files into
Supabase without going through the React UI. Today every ingestion runs in
the browser — there is no machine-to-machine path, no slug-keyed dedup, and
no admin-controlled way to batch-trigger the existing AI analyzer on
external uploads. This change adds 4 Edge Functions, a private 3-bucket
Storage layer, a new `mcp` role, and a per-project trigger toggle so the
MCP server delivers data and admins decide when analysis runs.

## Scope

### In Scope

- New value `mcp` on existing `public.rol_usuario` enum; single technical
  user `mcp-server@<domain>` provisioned via SQL bootstrap.
- 3 private Storage buckets, path convention
  `{proyecto_id}/{YYYY-MM}/{DD}/{kind}/{slug}.{ext}`:
  `mcp-evidencia` (MCP writes fotos/croquis/documentos),
  `mcp-fichas` (PLATFORM writes PDFs after analysis; signed URLs 24h TTL),
  `mcp-referencias` (MCP writes normative docs/manuals).
- New columns on `puntos_ferroviarios`: `slug TEXT` (unique partial index)
  and `coordenadas_cad JSONB` (AutoCAD X/Y/Z — distinct from existing
  `coordenada_lat/lng` and `coordenadas_gps`; see Risks).
- New table `puntos_archivos` (M2M `puntos_ferroviarios` ↔ Storage objects,
  with `kind` enum, `analyzed_at`, `subido_por`).
- New table `mcp_config` (per-project `auto_trigger_on_upload`,
  `cron_schedule`, RLS: administrador writes, admin+general reads).
- 4 Edge Functions: `mcp-upload-files` (multipart), `mcp-create-puntos`
  (JSON batch, slug-keyed upsert), `mcp-generate-download-link`,
  `mcp-trigger-analysis` (admin manual, concurrency 5).
- Admin UI: `McpConfig.tsx` + `McpPendingFiles.tsx` + nav integration.
- Python client `server/mcp_client.py` (FastAPI wrapper for Civil 3D).

### Out of Scope

- Auto-triggering analysis on upload (toggle only; MCP never invokes it).
- Migration of legacy rows to populate `slug` / `coordenadas_cad` (nullable).
- OAuth/SSO for the MCP user; JWT rotation; per-bucket quotas; deletion API.

## Capabilities

### New Capabilities

- `mcp-ingest`: JWT-authed multipart upload + slug-keyed point upsert for
  the Civil 3D MCP server.
- `mcp-storage`: 3-bucket policy layer with project-prefixed paths and a
  signed-URL helper restricted to `mcp-fichas`.
- `mcp-analysis-trigger`: admin-only manual trigger that runs the existing
  `analyze-railway-images` over pending rows in `puntos_archivos` and stamps
  `analyzed_at`.

### Modified Capabilities

- `project-access` (login-multiproyecto): extend RLS so `mcp` role can
  INSERT into `puntos_ferroviarios` / `puntos_archivos` and Storage under
  its own `auth.uid()` prefix; cannot read other projects, cannot manage
  users/proyectos.

## Approach

Six chained PRs (≤800-line review budget per `openspec/config.yaml`):

| PR | Scope | ~Lines |
|----|-------|--------|
| #1 | Migration `20260821000000_mcp_endpoints.sql` (role + tables + config) + `20260821000001_mcp_buckets_policies.sql` (Storage RLS) + bootstrap doc | ~400 |
| #2 | `_shared/mcp-auth.ts` + `_shared/mcp-storage.ts` + `_shared/mcp-buckets.ts` + `mcp-upload-files` | ~350 |
| #3 | `mcp-create-puntos` (slug upsert via new RPC `mcp_upsert_punto_por_slug`, M2M link, concurrency 5) | ~350 |
| #4 | `mcp-trigger-analysis` + `mcp-generate-download-link` | ~400 |
| #5 | Admin UI: `McpConfig.tsx` + `McpPendingFiles.tsx` + nav | ~450 |
| #6 | `server/mcp_client.py` (FastAPI client for Civil 3D MCP) | ~250 |

If any PR exceeds 800 at apply time, split before merging.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | `20260821000000_mcp_endpoints.sql`, `20260821000001_mcp_buckets_policies.sql` |
| `supabase/functions/` | New | 4 Edge Functions + 3 `_shared/*` helpers |
| `supabase/config.toml` | Modified | 3 new `[storage.buckets.*]` sections |
| `src/components/admin/` | New | `McpConfig.tsx`, `McpPendingFiles.tsx` |
| `src/types/index.ts` | Modified | `McpConfig`, `McpUploadResponse`, `McpPuntoInput`, `McpUploadKind` |
| `server/mcp_client.py` | New | FastAPI client (new repo convention: Python at root) |

## Risks

| Risk | L | Mitigation |
|------|---|------------|
| `coordenadas_gps.coordenada_x/y` stores GPS lng/lat (not Cartesian) — confusingly named vs new `coordenadas_cad` X/Y | Med | Documented in proposal + code comment near any reader; new code never reads `coordenadas_gps` for CAD |
| `rol_usuario` enum extension via `ALTER TYPE ... ADD VALUE` cannot run in same tx as `pg_advisory_xact_lock` (only as standalone) | Low | PG 17 per `config.toml`; emit `ALTER TYPE` as its own statement before any other DDL in the migration |
| `puntos_ferroviarios` upsert today uses PK `id` (`guardar_punto_completo`); MCP upserts by `slug` → different code path | Med | New RPC `mcp_upsert_punto_por_slug` separate from existing one; existing flow untouched |
| `mcp` JWT forwarded as in `sincronizar-puntos` → if MCP server is compromised, attacker can insert anywhere with membership under its prefix | Med | Path-prefix constraint in bucket policy + 50MB / 20-file limits + short-TTL signed URLs; every insert logged in `puntos_archivos.subido_por` |
| Admin trigger runs `analyze-railway-images` synchronously on up to N points → long request | Med | Mirror `sincronizar-puntos` `pool` (concurrency 5, RPC timeout 60s); return aggregated result; UI shows progress |
| `server/mcp_client.py` introduces Python at repo root — new convention | Low | Mirrors ADR-006 (`nas-watcher` runs as separate OS process); document in `server/README.md` |
| Existing flows (`sincronizar-puntos`, `analyze-railway-images`, React UI) MUST NOT regress — 4 new functions + 1 new RPC share the `coordenadas_cad` namespace | Med | No shared column writes; new RPC is its own function; verify each PR with `eslint .` + `tsc -b` and a curl smoke test against local Supabase |

## Rollback Plan

Revert chained PRs in reverse order (#6 → #1). Migration is forward-only:
an emergency rollback migration drops `puntos_archivos` + `mcp_config`,
removes `slug` + `coordenadas_cad` columns (nullable, no data loss), drops
the 3 buckets + their policies, and reverts `ALTER TYPE rol_usuario ADD
VALUE 'mcp'`. Existing `sincronizar-puntos`, `analyze-railway-images`, and
the React UI remain untouched.

## Dependencies

- Postgres 17 + Supabase Storage already configured (per `config.toml`).
- 1 technical user `mcp-server@<domain>` provisioned via SQL bootstrap
  (mirrors `fn_primer_usuario_admin` pattern, role fixed to `mcp`).
- `OPENROUTER_API_KEY` already in Edge secrets (reused by
  `mcp-trigger-analysis`).

## Success Criteria

- [ ] MCP server uploads N fotos + 1 croquis via multipart and receives
  signed URLs per file in the response.
- [ ] `mcp-create-puntos` upserts points by `slug`, links files via
  `puntos_archivos`; idempotent on retry (same slug = UPDATE, not
  duplicate).
- [ ] Admin toggles `auto_trigger_on_upload` per project and clicks
  "Analizar ahora" to process pending files; `puntos_archivos.analyzed_at`
  is stamped after success.
- [ ] Authenticated as the `mcp` user, direct query on `puntos_ferroviarios`
  for another project returns 0 rows (RLS verified).
- [ ] `sincronizar-puntos`, `analyze-railway-images`, and the React UI
  remain unchanged (no diff outside the new files).
- [ ] Each chained PR ≤800 changed lines and independently reviewable.
