# Spec: MCP Server Endpoints (Civil 3D → Supabase)

Three NEW capabilities (`mcp-ingest`, `mcp-storage`, `mcp-analysis-trigger`) plus
one MODIFIED capability (`project-access` from `login-multiproyecto`). All
content is testable Given/When/Then. The `mcp` role is a NEW value on the
existing `public.rol_usuario` enum; no existing user-facing flow is
modified.

> **Auth convention.** Every endpoint forwards the caller's Bearer JWT
> exactly like `sincronizar-puntos` (verified on PR #1). Edge Functions
> validate JWT signature via `SUPABASE_URL` + service-role key client.
> No JWT signing/rotation logic ships in this change (declared Out of Scope
> by the proposal).

> **Slug semantics.** `puntos_ferroviarios.slug` is nullable, immutable after
> INSERT, and matches the Storage object basename (without extension). The
> UNIQUE index is partial: `WHERE slug IS NOT NULL`. Legacy rows with
> `slug IS NULL` keep working unchanged.

> **Bucket ownership.** MCP writes to `mcp-evidencia` and `mcp-referencias`
> ONLY; the platform (Edge Function on behalf of analysis output) writes
> to `mcp-fichas`. Any `kind=ficha` value submitted by MCP is rejected with
> HTTP 400 (test case "ficha kind rejected from MCP").

---

## Capability: mcp-ingest

### Purpose

JWT-authenticated ingestion surface for the Civil 3D MCP server:
multipart evidence uploads + JSON batch point upsert keyed by `slug`.

### Requirements

#### Requirement: MCP Multipart Upload

The system MUST expose a `mcp-upload-files` Edge Function that accepts a
`multipart/form-data` POST with a Bearer JWT whose caller has `perfiles.rol =
'mcp'`. The function MUST validate the JWT, the membership in the declared
`proyecto_id`, and per-file constraints (≤50MB each, ≤20 files, mime ∈
{image/*, application/pdf}). Each file MUST be uploaded to
`mcp-evidencia` at path `{proyecto_id}/{YYYY-MM}/{DD}/{kind}/{slug}.{ext}`
where `{kind}` ∈ `{foto, croquis, documento}`. The response MUST include,
per file, `{slug, path, size, mimeType, signedUrl}` (signed URL TTL 24h).

##### Scenario: Successful upload of N fotos + 1 croquis

- GIVEN a valid Bearer JWT for user `mcp-server@<domain>` whose
  `proyecto_miembros` row lists project P
- WHEN it POSTs `/functions/v1/mcp-upload-files` with `proyecto_id=P`,
  `slug=PK-001`, `kind=foto`, and 3 fotos + 1 croquis (each ≤50MB)
- THEN each of the 4 objects is stored under
  `mcp-evidencia/P/{current YYYY-MM}/{current DD}/{kind}/{PK-001}.{ext}`
- AND the response includes, per file, `{slug, path, size, mimeType,
  signedUrl}` with HTTP 200

##### Scenario: Idempotent upload by slug

- GIVEN a prior successful upload of `PK-001.0.jpg` to the same path
- WHEN the MCP server POSTs `/functions/v1/mcp-upload-files` with the same
  `slug=PK-001`, `kind=foto`, and one replacement foto
- THEN no duplicate Storage object is created (same path is overwritten OR
  Storage returns a deterministic error that the function treats as
  already-uploaded)
- AND the response returns HTTP 200 with the existing object's path

##### Scenario: Rejects non-MCP JWT

- GIVEN a valid Bearer JWT whose `perfiles.rol` is `administrador`,
  `general`, or `usuario`
- WHEN it POSTs `/functions/v1/mcp-upload-files`
- THEN the function returns HTTP 401 with `{error: "rol no autorizado"}`

##### Scenario: Per-file size limit

- GIVEN a valid MCP JWT and a single file of 51MB
- WHEN it POSTs `/functions/v1/mcp-upload-files`
- THEN the response is HTTP 413 with body `{error: "file_too_large",
  detalles: [{filename, size, limit: 52428800}]}`
- AND no object is written to Storage

##### Scenario: Invalid proyecto_id

- GIVEN a valid MCP JWT and `proyecto_id=00000000-0000-0000-0000-000000000000`
  (no such project)
- WHEN it POSTs `/functions/v1/mcp-upload-files`
- THEN the response is HTTP 422 with body `{error: "proyecto_no_encontrado",
  proyecto_id}`

##### Scenario: ficha kind rejected from MCP

- GIVEN a valid MCP JWT
- WHEN it POSTs `/functions/v1/mcp-upload-files` with `kind=ficha`
- THEN the response is HTTP 400 with `{error: "kind_no_permitido_para_mcp",
  kind: "ficha"}` and nothing is written

##### Scenario: Batch upsert with shared slug

- GIVEN a valid MCP JWT and existing `puntos_ferroviarios` row with
  `slug=PK-001` and `proyecto_id=P`
- WHEN it POSTs `/functions/v1/mcp-create-puntos` with body
  `{puntos: [..., {slug:"PK-001", ...updated...}, ...]}`
- THEN the existing row is upserted (not duplicated) via RPC
  `mcp_upsert_punto_por_slug`
- AND returned `puntos[]` carries the same `id` as the prior row

##### Scenario: Missing storage reference

- GIVEN a valid MCP JWT
- WHEN it POSTs `/functions/v1/mcp-create-puntos` with a punto whose
  `photo_refs=["mcp-evidencia/P/.../missing.jpg"]` does not exist in
  Storage
- THEN the response is HTTP 422 with body `{error: "storage_ref_inexistente",
  field: "photo_refs", path: "mcp-evidencia/P/.../missing.jpg"}` and no
  `puntos_archivos` row is inserted

---

## Capability: mcp-storage

### Purpose

Three private Storage buckets with a project-prefixed path scheme and a
signed-URL helper restricted to `mcp-fichas`.

### Requirements

#### Requirement: Bucket Layout and Path Convention

The system MUST create three private buckets — `mcp-evidencia`,
`mcp-fichas`, `mcp-referencias` — and document a single path convention:
`{proyecto_id}/{YYYY-MM}/{DD}/{kind}/{slug}.{ext}`. Only the platform
writes to `mcp-fichas`; MCP writes to `mcp-evidencia` and
`mcp-referencias` only.

##### Scenario: mcp-fichas written only by platform

- GIVEN the bucket `mcp-fichas` exists
- WHEN an Edge Function with a `general` JWT tries to upload to it
- THEN the upload is rejected at the Storage RLS layer
- AND only `analyze-railway-images` or the future platform cron may
  insert (signed-URL helper is read-only)

#### Requirement: Signed-URL Helper Restricted to mcp-fichas

The system MUST expose `mcp-generate-download-link` (Edge Function) that
accepts `{path, ttlSeconds?}` and returns `{signedUrl}`. The function MUST
verify the caller has `perfiles.rol ∈ {administrador, general}` AND that
`path` starts with `mcp-fichas/`. Default TTL is 86400 (24h); max is
604800 (7d). `mcp` role MUST be rejected.

##### Scenario: admin/general fetches mcp-fichas signed URL

- GIVEN an `administrador` JWT and an existing object at
  `mcp-fichas/P/2026-08/20/PK-001.pdf`
- WHEN it POSTs `/functions/v1/mcp-generate-download-link` with that path
- THEN the response is HTTP 200 with `{signedUrl: "https://...?token=..."}`
  valid for 24h

##### Scenario: admin cannot fetch mcp-evidencia signed URL

- GIVEN an `administrador` JWT
- WHEN it POSTs `/functions/v1/mcp-generate-download-link` with a path
  starting `mcp-evidencia/`
- THEN the response is HTTP 403 with `{error: "path_fuera_de_mcp-fichas"}`

##### Scenario: MCP role rejected by signed-URL helper

- GIVEN a `mcp` JWT
- WHEN it POSTs `/functions/v1/mcp-generate-download-link` with any path
- THEN the response is HTTP 403 with `{error: "rol_no_autorizado"}`

#### Requirement: Storage RLS by Path Prefix

The system MUST enforce Storage RLS such that a caller authenticated as
user U can INSERT objects whose path begins with `<bucket>/<U's uid>/`,
and the prefix MUST equal the first path segment after the bucket name.
For `mcp-fichas`, no user role has INSERT privilege (only platform writes).

##### Scenario: MCP user writes under own prefix

- GIVEN a `mcp` JWT for `mcp-server@<domain>` with `auth.uid() = U`
- WHEN it uploads to `mcp-evidencia/U/2026-08/20/foto/PK-001.jpg`
  OR `mcp-fichas/U/...` (attempts via the underlying supabase-storage API)
- THEN `mcp-evidencia` upload is HTTP 200 (RLS allows under own UID prefix)
- AND `mcp-fichas` upload is HTTP 403 (platform-only bucket)

##### Scenario: MCP user cannot write under another UID prefix

- GIVEN a `mcp` JWT with `auth.uid() = U`
- WHEN it tries to upload to `mcp-evidencia/<other-user-uid>/2026-08/.../foto/x.jpg`
- THEN the Storage RLS rejects the upload with HTTP 403

---

## Capability: mcp-analysis-trigger

### Purpose

Admin-controlled manual trigger that runs the existing
`analyze-railway-images` over rows in `puntos_archivos` whose
`analyzed_at IS NULL`, and stamps `analyzed_at` on success.

### Requirements

#### Requirement: Manual Trigger by Admin

The system MUST expose `mcp-trigger-analysis` Edge Function that accepts
`{proyecto_id}` and a Bearer JWT with `perfiles.rol = 'administrador'`. The
function MUST select all `puntos_archivos` rows for project P whose
`analyzed_at IS NULL`, sign their Storage URLs (24h TTL, `mcp-fichas`
scope does not apply — these are `mcp-evidencia`), feed them to
`analyze-railway-images` per punto, persist results, and stamp
`analyzed_at = now()` on success. Concurrency is capped at 5 per
proposal (mirrors `sincronizar-puntos`).

##### Scenario: Per-project toggle stored, no auto-trigger

- GIVEN admin sets `mcp_config.auto_trigger_on_upload = true` for project P
- WHEN new files arrive via `mcp-upload-files`
- THEN NOTHING happens automatically (rows are stored with `analyzed_at =
  NULL`); the toggle is persisted for a future cron implementation (Out of
  Scope)

##### Scenario: Admin runs trigger with 3 pending puntos

- GIVEN an admin JWT and project P with 3 distinct `puntos_archivos` rows
  having `analyzed_at IS NULL`
- WHEN admin clicks "Analizar ahora" (POST
  `/functions/v1/mcp-trigger-analysis {proyecto_id: P}`)
- THEN for each pending row: a signed URL is generated, that URL is fed to
  `analyze-railway-images`, the result is persisted
- AND each row's `analyzed_at` is set to the current timestamp
- AND the response is HTTP 200 with
  `{procesados: 3, errores: []}`

##### Scenario: No pending files

- GIVEN an admin JWT and project P with 0 rows where `analyzed_at IS NULL`
- WHEN admin POSTs `/functions/v1/mcp-trigger-analysis {proyecto_id: P}`
- THEN the response is HTTP 200 with
  `{procesados: 0, errores: []}` (NOT an error)

---

## MODIFIED Capability: project-access

> **Base spec.** This section modifies `project-access` from
> `login-multiproyecto/spec.md` (Opened 2026-08-17, src `openspec/changes/
> login-multiproyecto/spec.md`). The base spec is unchanged elsewhere.

### ADDED Requirements

#### Requirement: MCP Role in Global Permissions Matrix

The capability's role matrix MUST be extended to include a fourth role,
`mcp`. The matrix row and column conventions from the base spec apply
unchanged.

| Capability | administrador | general | usuario | mcp |
|---|---|---|---|---|
| READ projects | ALL | owned + participated | assigned only | assigned only |
| READ project data | ALL | owned + participated | assigned only | assigned only |
| WRITE project data | ALL | owned + participated | assigned only | INSERT only, by slug, under own UID prefix |
| CREATE projects | YES | YES | NO | NO |
| INVITE new users | YES | YES | NO | NO |
| CHANGE global role | YES | NO | NO | NO |
| MANAGE project members | ALL | owned + participated | NO | NO |
| READ mcp-fichas objects | YES | YES | NO | NO |

##### Scenario: MCP cannot read other projects

- GIVEN the `mcp` user is a member of project P only (no row in
  `proyecto_miembros` for Q)
- WHEN it queries `puntos_ferroviarios WHERE proyecto_id = Q` via PostgREST
- THEN 0 rows from Q are returned (RLS verified)

##### Scenario: MCP cannot create projects

- GIVEN the `mcp` user with a valid JWT
- WHEN it INSERTs into `public.proyectos` directly
- THEN the insert is rejected by RLS (policy `proyectos_insert` requires
  `fn_rol_actual() = 'general'` or `fn_es_admin()`)

##### Scenario: MCP cannot modify perfiles

- GIVEN the `mcp` user with a valid JWT
- WHEN it UPDATEs any row in `public.perfiles`
- THEN the update is rejected (trigger `trg_congelar_rol` raises
  `Solo un administrador puede cambiar el rol de un usuario`)

#### Requirement: MCP role can INSERT into puntos_ferroviarios / puntos_archivos

The capability's RLS MUST allow a `mcp` user to INSERT rows into
`puntos_ferroviarios` (when the row's `proyecto_id` matches one of its
member projects) and into `puntos_archivos` (when the parent punto is
accessible). UPDATE on `puntos_ferroviarios` SHALL be allowed ONLY when
the row's `slug` matches the JWT-supplied slug (idempotent re-upsert
by same slug = UPDATE, not duplicate INSERT).

##### Scenario: MCP inserts new punto under member project

- GIVEN `mcp-server@<domain>` has a `proyecto_miembros` row for P
- WHEN it POSTs to `/functions/v1/mcp-create-puntos` with a new slug not
  present in `puntos_ferroviarios` and `proyecto_id = P`
- THEN a new `puntos_ferroviarios` row is created via
  `mcp_upsert_punto_por_slug`
- AND a `puntos_archivos` row per `photo_refs`/`croquis_ref` is inserted

##### Scenario: MCP cannot UPDATE a punto with a different slug

- GIVEN an existing row with `slug=PK-001`
- WHEN the `mcp` user tries to UPDATE that row with a new value that
  changes `slug` to `PK-002`
- THEN the update is rejected by RLS or by the slug-immutable trigger

---

## Open Questions (risks called out for design review)

1. **TTL format** — proposal says "24h default, configurable" but does
   not specify units. Spec assumes seconds in JSON (`ttlSeconds`), default
   `86400`, max `604800`. **Design MUST confirm.**
2. **`coordenadas_cad` schema** — proposal says "JSONB with X/Y/Z" but
   does not lock the key names. Spec assumes `{x: number, y: number, z:
   number}` because it parallels `coordenadas_gps.coordenada_x/y/z`.
   **Design MUST confirm; ADR-004-equivalent comment required.**
3. **Auto-trigger semantic** — proposal says toggle is for "future cron";
   spec captures `auto_trigger_on_upload = true` stores pending state
   but does NOT trigger analysis. **Design MUST confirm this is the
   desired MVP semantics** (vs. silent trigger that an MCP client may
   never see).
4. **Slug immutability enforcement** — spec assumes either RLS `WITH
   CHECK` on UPDATE or a `BEFORE UPDATE` trigger. Pick one in design.
