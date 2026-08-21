# Capability: mcp-storage

**Status**: active
**Source change**: mcp-server-endpoints
**Created**: 2026-08-20
**Verified**: ✅ Verified (6/6 scenarios PASS — see
`openspec/changes/archive/2026-08-20-mcp-server-endpoints/verify-report.md`)

## Purpose

Three private Storage buckets with a project-prefixed path scheme and a
signed-URL helper restricted to `mcp-fichas`.

> **Bucket ownership.** MCP writes to `mcp-evidencia` and
> `mcp-referencias` ONLY; the platform (Edge Function on behalf of
> analysis output) writes to `mcp-fichas`. Any `kind=ficha` value
> submitted by MCP is rejected.

## Requirements

### Requirement: Bucket Layout and Path Convention

The system MUST create three private buckets — `mcp-evidencia`,
`mcp-fichas`, `mcp-referencias` — and document a single path
convention: `{proyecto_id}/{YYYY-MM}/{DD}/{kind}/{slug}.{ext}`.
Only the platform writes to `mcp-fichas`; MCP writes to
`mcp-evidencia` and `mcp-referencias` only.

#### Scenario: mcp-fichas written only by platform

- GIVEN the bucket `mcp-fichas` exists
- WHEN an Edge Function with a `general` JWT tries to upload to it
- THEN the upload is rejected at the Storage RLS layer
- AND only `analyze-railway-images` or the future platform cron may
  insert (signed-URL helper is read-only)

### Requirement: Signed-URL Helper Restricted to mcp-fichas

The system MUST expose `mcp-generate-download-link` (Edge Function)
that accepts `{path, ttlSeconds?}` and returns `{signedUrl}`. The
function MUST verify the caller has `perfiles.rol ∈ {administrador,
general}` AND that `path` starts with `mcp-fichas/`. Default TTL is
86400 (24h); max is 604800 (7d); min is 60. `mcp` role MUST be
rejected.

#### Scenario: admin/general fetches mcp-fichas signed URL

- GIVEN an `administrador` JWT and an existing object at
  `mcp-fichas/P/2026-08/20/PK-001.pdf`
- WHEN it POSTs `/functions/v1/mcp-generate-download-link` with that
  path
- THEN the response is HTTP 200 with `{signedUrl:
  "https://...?token=..."}` valid for 24h

#### Scenario: admin cannot fetch mcp-evidencia signed URL

- GIVEN an `administrador` JWT
- WHEN it POSTs `/functions/v1/mcp-generate-download-link` with a path
  starting `mcp-evidencia/`
- THEN the response is HTTP 403 with a body indicating the bucket is
  outside the allowed scope

#### Scenario: MCP role rejected by signed-URL helper

- GIVEN a `mcp` JWT
- WHEN it POSTs `/functions/v1/mcp-generate-download-link` with any
  path
- THEN the response is HTTP 403 with a body indicating the role is not
  authorized

### Requirement: Storage RLS by Project Prefix

The system MUST enforce Storage RLS such that a caller authenticated as
user U can INSERT objects whose first path segment after the bucket
name equals a `proyecto_id` in which U has `proyecto_miembros` membership.
For `mcp-fichas`, no user role has INSERT privilege (only platform
writes via service-role).

> **Implementation note (deviation D1, more restrictive).** The design
> said `{bucket}/<U's uid>/...` but implementation chose
> `{bucket}/<proyecto_id>/...`. This is more restrictive (a single MCP
> user can serve multiple projects without leaking across them) and
> matches the security property the spec wanted.

#### Scenario: MCP user writes under own project prefix

- GIVEN a `mcp` JWT for `mcp-server@<domain>` with `auth.uid() = U`
  and `proyecto_miembros` row for P
- WHEN it uploads to `mcp-evidencia/P/2026-08/20/foto/PK-001.jpg`
  OR `mcp-fichas/P/...` (attempts via the underlying supabase-storage
  API)
- THEN `mcp-evidencia` upload is HTTP 200 (RLS allows under own
  project prefix)
- AND `mcp-fichas` upload is HTTP 403 (platform-only bucket)

#### Scenario: MCP user cannot write under another project prefix

- GIVEN a `mcp` JWT with `auth.uid() = U` and `proyecto_miembros`
  only for P
- WHEN it tries to upload to `mcp-evidencia/<other-project-uuid>/...`
- THEN the Storage RLS rejects the upload with HTTP 403

## Files

- `supabase/migrations/20260821000002_mcp_buckets_policies.sql` —
  buckets + Storage RLS + `fn_es_mcp()` helper
- `supabase/config.toml` — 3 `[storage.buckets.*]` sections
  (private = `public = false`)
- `supabase/functions/_shared/mcp-buckets.ts` — bucket config +
  limits + TTL constants
- `supabase/functions/_shared/mcp-storage.ts` — `buildPath`,
  `validateMime`, `signUrl`, `pathBelongsToProyecto`
- `supabase/functions/mcp-generate-download-link/index.ts` — signed
  URL helper
- `src/types/index.ts` — `McpDownloadLinkInput`,
  `McpDownloadLinkResponse`, `McpBucket`

## Known Deviations

- **D1** (WARNING): Storage path prefix is `proyecto_id` not
  `auth.uid()` (design.md §Path-prefix RLS said `<bucket>/<U's uid>/`).
  Same security property; more restrictive; documented above.
