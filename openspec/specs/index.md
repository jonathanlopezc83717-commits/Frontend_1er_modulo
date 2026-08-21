# OpenSpec Capabilities — Source of Truth

This directory holds the **permanent** specs for every capability in
the project. Delta specs live in `openspec/changes/<change-name>/specs/`
until archived.

| Capability | Status | Source change | Created | Scenarios |
|---|---|---|---|---|
| `mcp-ingest` | active | mcp-server-endpoints | 2026-08-20 | 8 (5 OK / 3 WARN / 1 NOT-VERIFIED) |
| `mcp-storage` | active | mcp-server-endpoints | 2026-08-20 | 6 (6 OK / 0 WARN / 0 NOT-VERIFIED) |
| `mcp-analysis-trigger` | active | mcp-server-endpoints | 2026-08-20 | 3 (2 OK / 0 WARN / 1 NOT-VERIFIED) |
| `project-access` | active | login-multiproyecto (base) + mcp-server-endpoints (delta) | 2026-08-20 (synced) | 13 (12 OK / 0 WARN / 1 NOT-VERIFIED) |

## Status Legend

- **active** — implemented and shipping; behavior covered by tests or
  verified manually.
- **draft** — proposed but not implemented yet.
- **deprecated** — superseded by a newer capability; kept for
  reference.

## Conventions

- Every capability spec MUST have a **Status** header line.
- Every capability spec MUST list the **Files** that implement it
  (so a new agent can find the code from the spec alone).
- Every deviation from the spec MUST be documented in a "Known
  Deviations" subsection with a follow-up reference.
- See `openspec/changes/archive/<YYYY-MM-DD>-<change-name>/` for the
  full audit trail of each change.

## Changes Pending Archive

- `login-multiproyecto` (base for `project-access` capability; not yet
  archived — `openspec/changes/login-multiproyecto/` still holds the
  active change folder)
