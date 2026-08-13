# Proposal: Login & Multi-Project Isolation

## Intent

App is single-tenant today: no auth, wide-open RLS (`USING (true) WITH CHECK (true)` on every table), no project concept. This change adds Supabase Auth (email/password), per-user global roles, and project-scoped data isolation so multiple projects coexist with role-based access — preserving the existing single-screen UX once a project is active.

## Scope

### In Scope
- Supabase Auth (email/password); new users auto-create `perfiles` row, default role `usuario`.
- Global roles on `perfiles` (→ `auth.users`):
  - `administrador` — full access to ALL projects + user/role admin.
  - `general` — creates projects (owner), manages members of and edits participated projects.
  - `usuario` — reads/edits ONLY projects assigned via `proyecto_miembros`; no project creation or member admin.
- Project creation: `administrador` + `general` only.
- `proyectos` + `proyecto_miembros` tables.
- `proyecto_id` (nullable) on `puntos_ferroviarios` ONLY; 9 child tables inherit scope via FK CASCADE. Nomenclaturas + formato templates stay GLOBAL.
- RLS rewrite: replace 11 "Allow all" policies with role/membership policies.
- Login screen + root gate (conditional render, no router).
- Project picker (list + "Proyecto nuevo" shown only if role allows).
- Active-project state in AppContext; project-scoped fetch.
- Member/role management UI (invite, assign, change role).

### Out of Scope
- Router library; SSO/OAuth/MFA; legacy-row migration (`proyecto_id` nullable, old rows invisible — non-destructive); audit log; project archival/deletion; bulk operations.

## Capabilities

### New Capabilities
- `user-auth`: email/password auth, `perfiles` auto-provisioning, session handling.
- `project-access`: projects, membership, project-scoped data isolation, role enforcement.
- `project-management-ui`: login screen, project picker, member/role admin UI.

### Modified Capabilities
- None (no prior openspec specs exist).

## Approach

Three phases → three chained PRs (≤800-line review budget each):

- **PR #1 — Auth + RLS foundation**: enable `supabase.auth`; `perfiles` + role enum + auto-insert trigger; replace "Allow all" policies with role-aware baseline; Login screen + root gate. Admin bootstrap via seed SQL or auto-promote first signup.
- **PR #2 — Projects + scoping**: `proyectos` + `proyecto_miembros`; nullable `proyecto_id` on `puntos_ferroviarios`; scope `cargarPuntosCompletos` / `cargarPuntosDesdeDB` / `sincronizarPuntos` by active project; project picker + active-project state.
- **PR #3 — Member/role UI**: invite, assign `usuario`, change/remove members; admin sees all projects + user/role admin.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | `perfiles`, `proyectos`, `proyecto_miembros`, `proyecto_id` col, RLS policies, triggers |
| `src/lib/supabase-service.ts` | Modified | project-scoped fetch functions |
| `src/context/AppContext.tsx` | Modified | auth + active-project state |
| `src/App.tsx` | Modified | auth gate, picker routing |
| `src/components/auth/`, `src/components/projects/` | New | Login, picker, member management UI |
| 11 existing tables | Modified | RLS policy rewrite (replace "Allow all") |

## Risks

| Risk | L | Mitigation |
|------|---|------------|
| RLS rewrite leaks data or breaks flows | High | Per-table policy tests; verify with anon + authenticated sessions |
| First user has no admin to assign roles | Med | Bootstrap SQL + auto-promote-first-signup fallback |
| `usuario` with no assignments sees empty picker | Med | Empty-state UX + admin contact |
| Legacy rows invisible post-migration | Low | Non-destructive; admin can reassign later |

## Rollback Plan

Revert chained PRs in reverse order (#3 → #2 → #1). Migrations are forward-only; an emergency rollback migration can restore `USING (true)` policies if access must be reopened.

## Dependencies

- Supabase Auth enabled on the project instance.
- Postgres RLS already enabled on all tables (policy replacement only).

## Success Criteria

- [ ] Email/password login works; new signups get a `perfiles` row with role `usuario`.
- [ ] Role permissions enforced as specified across all three roles.
- [ ] A `usuario` cannot read another project's `puntos_ferroviarios` rows (verified by direct query).
- [ ] Existing single-screen UX preserved once a project is active.
- [ ] Nomenclaturas and formato templates remain globally accessible.
- [ ] Each chained PR ≤800 changed lines and independently reviewable.
