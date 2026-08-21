# Capability: mcp-ingest

**Status**: active
**Source change**: mcp-server-endpoints
**Created**: 2026-08-20
**Verified**: ⚠️ Verified with warnings (see `openspec/changes/archive/2026-08-20-mcp-server-endpoints/verify-report.md`)

## Purpose

JWT-authenticated ingestion surface for the Civil 3D MCP server:
multipart evidence uploads plus JSON batch point upsert keyed by `slug`.

> **Auth convention.** Every endpoint forwards the caller's Bearer JWT
> exactly like `sincronizar-puntos`. Edge Functions validate JWT signature
> via `SUPABASE_URL` + service-role key client. No JWT signing/rotation
> logic ships in this change (declared Out of Scope by the proposal).

> **Slug semantics.** `puntos_ferroviarios.slug` is nullable, immutable
> after INSERT, and matches the Storage object basename (without
> extension). The UNIQUE index is partial: `WHERE slug IS NOT NULL`.
> Legacy rows with `slug IS NULL` keep working unchanged.

## Requirements

### Requirement: MCP Multipart Upload

The system MUST expose a `mcp-upload-files` Edge Function that accepts a
`multipart/form-data` POST with a Bearer JWT whose caller has
`perfiles.rol = 'mcp'`. The function MUST validate the JWT, the
membership in the declared `proyecto_id`, and per-file constraints
(≤50MB each, ≤20 files, mime ∈ {image/*, application/pdf}). Each file
MUST be uploaded to `mcp-evidencia` at path
`{proyecto_id}/{YYYY-MM}/{DD}/{kind}/{slug}.{ext}` where `{kind}` ∈
`{foto, croquis, documento}`. The response MUST include, per file,
`{slug, path, size, mimeType, signedUrl}` (signed URL TTL 24h).

#### Scenario: Successful upload of N fotos + 1 croquis

- GIVEN a valid Bearer JWT for user `mcp-server@<domain>` whose
  `proyecto_miembros` row lists project P
- WHEN it POSTs `/functions/v1/mcp-upload-files` with `proyecto_id=P`,
  `slug=PK-001`, `kind=foto`, and 3 fotos + 1 croquis (each ≤50MB)
- THEN each of the 4 objects is stored under
  `mcp-evidencia/P/{current YYYY-MM}/{current DD}/{kind}/{PK-001}.{ext}`
- AND the response includes, per file, `{slug, path, size, mimeType,
  signedUrl}` with HTTP 200

#### Scenario: Idempotent upload by slug

- GIVEN a prior successful upload of `PK-001.0.jpg` to the same path
- WHEN the MCP server POSTs `/functions/v1/mcp-upload-files` with the
  same `slug=PK-001`, `kind=foto`, and one replacement foto
- THEN no duplicate Storage object is created (same path is overwritten
  OR Storage returns a deterministic error that the function treats as
  already-uploaded)
- AND the response returns HTTP 200 with the existing object's path

#### Scenario: Rejects non-MCP JWT

- GIVEN a valid Bearer JWT whose `perfiles.rol` is `administrador`,
  `general`, or `usuario`
- WHEN it POSTs `/functions/v1/mcp-upload-files`
- THEN the function returns HTTP 401 with `{error: "rol no
  autorizado"}`

#### Scenario: Per-file size limit

- GIVEN a valid MCP JWT and a single file of 51MB
- WHEN it POSTs `/functions/v1/mcp-upload-files`
- THEN the response indicates the oversized file was rejected (HTTP 200
  envelope with the entry in `errores[]`, or HTTP 413 with body
  `{error: "file_too_large", detalles: [{filename, size, limit:
  52428800}]}`)
- AND no object is written to Storage

#### Scenario: Invalid proyecto_id

- GIVEN a valid MCP JWT and `proyecto_id` that is not a UUID OR refers
  to a project the caller is not a member of
- WHEN it POSTs `/functions/v1/mcp-upload-files`
- THEN the response is HTTP 400 (bad UUID) or HTTP 403 (not a member)
  with body describing the rejection

#### Scenario: ficha kind rejected from MCP

- GIVEN a valid MCP JWT
- WHEN it POSTs `/functions/v1/mcp-upload-files` with `kind=ficha`
- THEN the request is rejected (HTTP 400 or 200 + `errores[]` entry);
  no entry is written to `mcp-fichas`

#### Scenario: Batch upsert with shared slug

- GIVEN a valid MCP JWT and existing `puntos_ferroviarios` row with
  `slug=PK-001` and `proyecto_id=P`
- WHEN it POSTs `/functions/v1/mcp-create-puntos` with body
  `{puntos: [..., {slug:"PK-001", ...updated...}, ...]}`
- THEN the existing row is upserted (not duplicated) via RPC
  `mcp_upsert_punto_por_slug`
- AND returned `puntos[]` carries the same `id` as the prior row

#### Scenario: Missing storage reference

- GIVEN a valid MCP JWT
- WHEN it POSTs `/functions/v1/mcp-create-puntos` with a punto whose
  `photo_refs=["mcp-evidencia/P/.../missing.jpg"]` does not exist in
  Storage
- THEN the whole punto is rejected; no `puntos_archivos` row is
  inserted for the missing reference

## Files

- `supabase/functions/mcp-upload-files/index.ts` — multipart Edge Function
- `supabase/functions/mcp-create-puntos/index.ts` — JSON batch Edge Function
- `supabase/functions/_shared/mcp-auth.ts` — JWT + role helpers
- `supabase/functions/_shared/mcp-buckets.ts` — bucket config + limits
- `supabase/functions/_shared/mcp-storage.ts` — Storage upload + sign helpers
- `supabase/migrations/20260821000001_mcp_endpoints_schema.sql` — `puntos_archivos` + RLS
- `supabase/migrations/20260821000003_mcp_rpc_and_helpers.sql` — RPC `mcp_upsert_punto_por_slug`
- `supabase/bootstrap_mcp_user.sql` — `mcp-server@<domain>` provisioning
- `server/mcp_client.py` — Python FastAPI bridge (Civil 3D side)
- `src/types/index.ts` — `McpUploadKind`, `McpUploadResponse`,
  `McpPuntoInput`, `McpCreatePuntosResponse`

## Known Deviations (carried forward as follow-ups)

- **D2** (WARNING): Response envelope wraps `uploads[]` and `errores[]`
  in a single `{uploads, errores}` object rather than flat array
  per-file. Spec wording vs. implementation envelope shape differ;
  functional coverage matches.
- **D3** (WARNING): Idempotent upload of 409 silently drops the file
  from BOTH `uploads[]` and `errores[]`. Spec wants existing path in
  `uploads[]`. Suggested fix is 3 lines.
- **D4** (WARNING): `puntos_archivos` M2M retry fails on duplicate
  `(punto_id, storage_path)` because the Edge Function uses `.insert()`
  without `ON CONFLICT DO NOTHING`. Suggested fix is a one-line
  `.upsert(...)` switch.
- **D11** (INFO): `McpUploadResponse` is `{uploads, errores}`, spec
  scenario 1 expected flat array. Cosmetic.
