# Capability: project-access

**Status**: active
**Source change**: login-multiproyecto (base, 2026-08-17), extended by
mcp-server-endpoints (delta, 2026-08-20)
**Created**: 2026-08-20 (synced from `openspec/changes/login-multiproyecto/spec.md`
+ delta from `openspec/changes/mcp-server-endpoints/spec.md`)
**Verified**: ✅ Verified (4/5 PASS, 1/5 NOT VERIFIED — needs live
Supabase runtime; see `openspec/changes/archive/2026-08-20-mcp-server-endpoints/verify-report.md`)

## Purpose

Global roles, projects, membership, project-scoped data isolation,
Row-Level Security enforcement, and the machine-to-machine `mcp`
role used by the Civil 3D integration.

> **Role matrix history.** This capability originally defined a
> 3-role matrix (administrador / general / usuario) in
> `openspec/changes/login-multiproyecto/spec.md` (2026-08-17). The
> `mcp-server-endpoints` change (2026-08-20) extended the matrix with
> a fourth role, `mcp`, with restricted INSERT-only privileges for the
> Civil 3D MCP server. See "Delta: mcp-server-endpoints (2026-08-20)"
> at the bottom of this file.

---

## Base (from login-multiproyecto)

### Requirement: Global Roles and Permissions

The system MUST enforce three global roles on `perfiles` per the
following matrix.

| Capability | administrador | general | usuario |
|---|---|---|---|
| READ projects | ALL | owned + participated | assigned only |
| WRITE project data | ALL | owned + participated | assigned only |
| CREATE projects | YES | YES | NO |
| INVITE new users (create account, assign initial role) | YES | YES | NO |
| CHANGE a user's global role (promote/demote administrador/general/usuario) | YES | NO | NO |
| MANAGE project members | ALL | owned + participated | NO |

#### Scenario: Usuario edits assigned project

- GIVEN a `usuario` assigned to project P
- WHEN they edit puntos_ferroviarios in P
- THEN the edit succeeds

#### Scenario: Usuario cannot create projects

- GIVEN a `usuario`
- WHEN they attempt to create a project
- THEN the action is rejected at both UI and data layer

#### Scenario: General manages participated project members

- GIVEN a `general` who participates in project P
- WHEN they manage members of P
- THEN the action succeeds (owned OR participated)

### Requirement: Project Creation

Only `administrador` and `general` MAY create projects. The creator
MUST become owner (member) of the new project.

#### Scenario: General creates a project

- GIVEN an authenticated `general`
- WHEN they create a new project
- THEN the project is created and the creator is recorded as its owner

#### Scenario: Usuario cannot create a project

- GIVEN a `usuario`
- WHEN they attempt to create a project
- THEN creation is rejected

### Requirement: Project Listing by Access

The system MUST list ONLY projects the user is authorized to see:
`administrador` sees all; `general` and `usuario` see only projects
they own or are a member of.

#### Scenario: Usuario sees only assigned projects

- GIVEN a `usuario` assigned to projects P1 and P2
- WHEN they open the project picker
- THEN only P1 and P2 are listed

### Requirement: Membership Management

The system MUST support assigning a `usuario` to a project, removing
a member, and listing members. A `general` MAY manage members ONLY of
projects they own OR participate in. An `administrador` MAY manage
members of ANY project.

#### Scenario: General cannot manage an arbitrary project

- GIVEN a `general` who is NOT a member of project P
- WHEN they attempt to manage P's members
- THEN the action is rejected

#### Scenario: Admin removes a member

- GIVEN an `administrador` and project P with member M
- WHEN they remove M from P
- THEN M loses access to P and can no longer read P's data on next
  session

### Requirement: Active Project Persistence

The system MUST remember the last active project across reloads, but
MUST fall back to the project picker if the user is no longer
authorized for that project (removed as a member, or no longer
`administrador`).

#### Scenario: Active project restored when still authorized

- GIVEN a user whose persisted active project is P and who is still
  a member/admin of P
- WHEN they reload
- THEN the app restores P as active and skips the picker

#### Scenario: Falls back to picker when no longer authorized

- GIVEN a user whose persisted active project they can no longer
  access
- WHEN they reload
- THEN the picker is shown instead of the persisted project

### Requirement: Project-Scoped Data Isolation

`puntos_ferroviarios` MUST be scoped by a nullable `proyecto_id`. The
9 child tables MUST inherit scope via FK CASCADE. `nomenclaturas` and
formato templates MUST remain GLOBAL (readable by all authenticated
users regardless of active project).

#### Scenario: Legacy rows are invisible

- GIVEN legacy puntos_ferroviarios rows with NULL `proyecto_id`
- WHEN any user queries puntos_ferroviarios
- THEN those legacy rows are not returned (non-destructive; an admin
  may reassign them later)

#### Scenario: Nomenclaturas stay global

- GIVEN any authenticated user with any active project
- WHEN they read nomenclaturas or formato templates
- THEN they receive the full global set, unaffected by active project

### Requirement: Row-Level Security Enforcement

The 11 existing "Allow all" (`USING (true) WITH CHECK (true)`)
policies MUST be replaced by role- and membership-aware policies that
enforce the permissions above at the database layer (not only in the
UI).

#### Scenario: Usuario cannot read another project's puntos

- GIVEN a `usuario` assigned to P1 only
- WHEN they directly query puntos_ferroviarios for project P2 (to
  which they are not assigned)
- THEN zero rows from P2 are returned, enforced by RLS

### Requirement: Project Deletion (Excluded)

Project deletion, archival, and bulk operations are OUT of scope.
The system MUST NOT be required to provide any of them in any phase
of this change.

#### Scenario: No deletion path exists

- GIVEN any user, including `administrador`
- WHEN they use the app
- THEN no project deletion, archival, or bulk operation is available
  (deferred to a future change)

---

## Delta: mcp-server-endpoints (2026-08-20)

### ADDED Requirements

#### Requirement: MCP Role in Global Permissions Matrix

The capability's role matrix MUST be extended to include a fourth
role, `mcp`. The matrix row and column conventions from the base spec
apply unchanged.

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
- WHEN it queries `puntos_ferroviarios WHERE proyecto_id = Q` via
  PostgREST
- THEN 0 rows from Q are returned (RLS verified)

##### Scenario: MCP cannot create projects

- GIVEN the `mcp` user with a valid JWT
- WHEN it INSERTs into `public.proyectos` directly
- THEN the insert is rejected by RLS (policy `proyectos_insert`
  requires `fn_rol_actual() = 'general'` or `fn_es_admin()`)

##### Scenario: MCP cannot modify perfiles

- GIVEN the `mcp` user with a valid JWT
- WHEN it UPDATEs any row in `public.perfiles`
- THEN the update is rejected (trigger `trg_congelar_rol` raises
  `Solo un administrador puede cambiar el rol de un usuario`)

#### Requirement: MCP role can INSERT into puntos_ferroviarios / puntos_archivos

The capability's RLS MUST allow a `mcp` user to INSERT rows into
`puntos_ferroviarios` (when the row's `proyecto_id` matches one of
its member projects) and into `puntos_archivos` (when the parent
punto is accessible). UPDATE on `puntos_ferroviarios` SHALL be
allowed ONLY when the row's `slug` matches the JWT-supplied slug
(idempotent re-upsert by same slug = UPDATE, not duplicate INSERT).

##### Scenario: MCP inserts new punto under member project

- GIVEN `mcp-server@<domain>` has a `proyecto_miembros` row for P
- WHEN it POSTs to `/functions/v1/mcp-create-puntos` with a new slug
  not present in `puntos_ferroviarios` and `proyecto_id = P`
- THEN a new `puntos_ferroviarios` row is created via
  `mcp_upsert_punto_por_slug`
- AND a `puntos_archivos` row per `photo_refs`/`croquis_ref` is
  inserted

##### Scenario: MCP cannot UPDATE a punto with a different slug

- GIVEN an existing row with `slug=PK-001`
- WHEN the `mcp` user tries to UPDATE that row with a new value that
  changes `slug` to `PK-002`
- THEN the update is rejected by RLS or by the slug-immutable trigger

## Files

### Base (login-multiproyecto)
- `supabase/migrations/20260817000001_auth_perfiles_rls.sql` —
  `perfiles` + `fn_rol_actual`, `fn_es_admin`, `fn_congelar_rol`,
  `fn_primer_usuario_admin`, `trg_crear_perfil_usuario`
- `supabase/migrations/20260817000003_proyectos_scoping.sql` —
  `proyectos`, `proyecto_miembros`, `puntos_ferroviarios.proyecto_id`
  RLS

### Delta (mcp-server-endpoints)
- `supabase/migrations/20260821000000_mcp_endpoints_enum.sql` —
  `ALTER TYPE public.rol_usuario ADD VALUE 'mcp'`
- `supabase/migrations/20260821000001_mcp_endpoints_schema.sql` —
  `puntos_ferroviarios.slug`, `coordenadas_cad`,
  `puntos_archivos`, `mcp_config`, RLS extensions
- `supabase/migrations/20260821000002_mcp_buckets_policies.sql` —
  `fn_es_mcp(uid)` helper + Storage path-prefix RLS
- `supabase/migrations/20260821000003_mcp_rpc_and_helpers.sql` —
  RPC `mcp_upsert_punto_por_slug`, trigger
  `trg_puntos_slug_inmutable`, `fn_crear_usuario_mcp`
- `supabase/functions/mcp-upload-files/index.ts` —
  `requireMcpUser()` enforces membership
- `supabase/functions/mcp-create-puntos/index.ts` — slug-keyed
  upsert, M2M insert
- `supabase/functions/mcp-generate-download-link/index.ts` —
  `requireAdminOrGeneral()` rejects `mcp`
- `supabase/functions/mcp-trigger-analysis/index.ts` —
  `requireAdmin()` rejects `mcp`
- `supabase/queries/verify_rls.sql` — `mcp-readonly` +
  `mcp-write-own-project` personas
- `supabase/bootstrap_mcp_user.sql` — `mcp-server@<domain>`
  provisioning
- `src/types/index.ts` — `McpXxx` interfaces

## Known Deviations

- **D1** (WARNING, mcp-storage): Storage path prefix is `proyecto_id`
  not `auth.uid()`. Same security property; more restrictive.
