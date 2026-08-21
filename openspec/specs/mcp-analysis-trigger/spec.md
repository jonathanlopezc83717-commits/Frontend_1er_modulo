# Capability: mcp-analysis-trigger

**Status**: active
**Source change**: mcp-server-endpoints
**Created**: 2026-08-20
**Verified**: ✅ Verified (2/3 PASS, 1/3 NOT VERIFIED — needs live
Supabase runtime; see `openspec/changes/archive/2026-08-20-mcp-server-endpoints/verify-report.md`)

## Purpose

Admin-controlled manual trigger that runs the existing
`analyze-railway-images` over rows in `puntos_archivos` whose
`analyzed_at IS NULL`, and stamps `analyzed_at` on success.

> **Auto-trigger MVP semantics.** The toggle
> `mcp_config.auto_trigger_on_upload` is read by no code path. It is
> persisted for a future cron implementation. The admin clicks
> "Analizar ahora" to invoke the trigger.

## Requirements

### Requirement: Manual Trigger by Admin

The system MUST expose `mcp-trigger-analysis` Edge Function that
accepts `{proyecto_id}` and a Bearer JWT with `perfiles.rol =
'administrador'`. The function MUST select all `puntos_archivos` rows
for project P whose `analyzed_at IS NULL`, sign their Storage URLs
(24h TTL, `mcp-evidencia` scope does not apply — these are
`mcp-evidencia`), feed them to `analyze-railway-images` per punto,
persist results, and stamp `analyzed_at = now()` on success.
Concurrency is capped at 5 per proposal (mirrors `sincronizar-puntos`).

#### Scenario: Per-project toggle stored, no auto-trigger

- GIVEN admin sets `mcp_config.auto_trigger_on_upload = true` for
  project P
- WHEN new files arrive via `mcp-upload-files`
- THEN NOTHING happens automatically (rows are stored with
  `analyzed_at = NULL`); the toggle is persisted for a future cron
  implementation (Out of Scope)

#### Scenario: Admin runs trigger with 3 pending puntos

- GIVEN an admin JWT and project P with 3 distinct `puntos_archivos`
  rows having `analyzed_at IS NULL`
- WHEN admin clicks "Analizar ahora" (POST
  `/functions/v1/mcp-trigger-analysis {proyecto_id: P}`)
- THEN for each pending row: a signed URL is generated, that URL is
  fed to `analyze-railway-images`, the result is persisted
- AND each row's `analyzed_at` is set to the current timestamp
- AND the response is HTTP 200 with `{procesados: 3, errores: []}`

#### Scenario: No pending files

- GIVEN an admin JWT and project P with 0 rows where
  `analyzed_at IS NULL`
- WHEN admin POSTs `/functions/v1/mcp-trigger-analysis {proyecto_id:
  P}`
- THEN the response is HTTP 200 with `{procesados: 0, errores: []}`
  (NOT an error)

## Files

- `supabase/functions/mcp-trigger-analysis/index.ts` — admin trigger
  Edge Function
- `supabase/functions/_shared/mcp-auth.ts` — `requireAdmin(req)` helper
- `src/components/admin/McpConfig.tsx` — toggle + cron placeholder
- `src/components/admin/McpPendingFiles.tsx` — pending-queue table +
  "Analizar ahora" button
- `src/App.tsx` — admin Tabs integration + badge count
- `src/types/index.ts` — `McpTriggerAnalysisInput`,
  `McpTriggerAnalysisResponse`, `McpConfigRow`, `McpPendingArchivo`

## Known Deviations

- **D10** (INFO): `mcp-trigger-analysis` forwards caller JWT to
  `analyze-railway-images` (not service-role). Function rejects
  non-admin/general caller, so the chained JWT is always admin/general.
  Tracked.
