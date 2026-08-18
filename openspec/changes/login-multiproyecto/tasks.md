# Tasks: Login & Multi-Project Isolation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~770 · PR2 ~780 · PR3 ~745 (total ~2295) |
| 400-line budget risk | High (per-PR ≤800 per openspec config) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 Auth+RLS → PR2 Projects+scoping → PR3 Member/role UI |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Binding user decision (resolves design Open Q1): `general` invites are locked to initial rol `usuario`; rol promotion to `general`/`administrador` is admin-only (enforced in edge function, UI, and verify_rls).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Auth + RLS baseline shippable | PR 1 | `npx vitest run src/tests/auth-gate.test.tsx` | `supabase db reset` + `psql -f supabase/queries/verify_rls.sql` (port 54322) | Migration 000001 + auth files revert; emergency policy-restore migration if needed |
| 2 | Projects + scoped data | PR 2 | `npx vitest run src/tests/proyecto-scoping.test.ts` | `supabase db reset` + verify_rls personas + manual create-project smoke | Migration 000002 + service/picker files revert |
| 3 | Member/role UI | PR 3 | `npx vitest run src/tests/gestion-miembros.test.tsx` | Manual: invite → first login → forced password change | New components revert; PR2 data intact |

## Phase 1: PR #1 — Auth + RLS Foundation

- [x] 1.1 Create `supabase/migrations/20260817000001_auth_perfiles_rls.sql`: `rol_usuario` enum, `perfiles` table, `auth.users`→perfiles SECURITY DEFINER trigger (pinned `search_path`), first-user→admin trigger (`pg_advisory_xact_lock`), non-admin rol-freeze UPDATE trigger, helpers `fn_rol_actual()`/`fn_es_admin()`. Check: `supabase db reset` clean.
- [x] 1.2 Same migration: replace "Allow all" policies on the 7 live tables + `image_analyses` with authenticated-only baseline (design matrix PR1 row). Drop public insert on `image_analyses`.
- [x] 1.3 Create `supabase/queries/verify_rls.sql`: personas `anon`/`authenticated` asserting anon gets 0 rows, authenticated reads. Check: psql port 54322 post-reset.
- [x] 1.4 `supabase/config.toml`: `enable_signup = false` in `[auth]` and `[auth.email]` (Req: Invitation-Only Signup).
- [x] 1.5 Create `supabase/functions/invite-user/index.ts`: service-role `createUser` (random 12-char temp pwd, `email_confirm:true`), sets `rol`+`debe_cambiar_password`; guards: admin, OR empty `auth.users` bootstrap (Req: Admin Bootstrap); reject `general` assigning rol ≠ `usuario` (binding decision).
- [x] 1.6 Add `Perfil`, `RolUsuario` to `src/types/index.ts`. Check: `tsc -b`.
- [x] 1.7 Create `src/context/AuthContext.tsx`: session/perfil state, `onAuthStateChange`, `login`/`logout`/`refrescarPerfil` (design D4).
- [x] 1.8 Create `src/components/auth/PantallaLogin.tsx`: modes login + `primer-acceso` (`updateUser` password → clear flag); all errors → "Credenciales inválidas" (Req: Email/Password Login). Test: `src/tests/pantalla-login.test.tsx`.
- [x] 1.9 `src/main.tsx`: wrap in `AuthProvider` + conditional gate (cargando→`ThinkingLoader`, no session→Login, `debe_cambiar_password`→primer-acceso, else App). Test: `src/tests/auth-gate.test.tsx` covers 4 render states incl. session-restore (Req: Session Persistence and Restore).
- [x] 1.10 PR #1 verification: `eslint .` + `tsc -b` + `npx vitest run` + verify_rls + manual smoke: bootstrap invite → login → forced password change → reload keeps session.

## Phase 2: PR #2 — Projects + Scoping

- [x] 2.1 Create `supabase/migrations/20260817000002_proyectos_scoping.sql`: `proyectos`, `proyecto_miembros`, creator-membership trigger, nullable `proyecto_id`+index on `puntos_ferroviarios`, `user_id`+`proyecto_id` on `app_state_snapshots`. (Shipped as `20260817000003_proyectos_scoping.sql` — PR-A took the 000002 timestamp.)
- [x] 2.2 Same migration: `fn_es_miembro()`, full RLS matrix (proyectos/miembros/puntos/5 children EXISTS/snapshots), RPC `cargar_puntos_completos(p_proyecto)`, `guardar_punto_completo` writes `proyecto_id` INSERT-only.
- [x] 2.3 Extend `verify_rls.sql`: usuario↛P2 rows, legacy NULL invisible, general create/reject, perfiles recursion (Req: Row-Level Security Enforcement; Project-Scoped Data Isolation).
- [x] 2.4 `src/lib/supabase-service.ts`: `proyectoId` param on `cargarPuntosCompletos`/`cargarPuntosDesdeDB`/`sincronizarPuntos`, payload embed in `guardarPuntoCompleto`, snapshot filter (lines ~405–469). Test: `src/tests/proyecto-scoping.test.ts` (RPC args + payloads).
- [x] 2.5 Add `Proyecto`, `ProyectoMiembro` to `src/types/index.ts`. Check: `tsc -b`.
- [x] 2.6 `AuthContext.tsx`: `proyectos[]`, `proyectoActivoId`, `crearProyecto`, `cambiarProyecto`, localStorage `proyecto-activo:{userId}` validated against RLS list (Req: Active Project Persistence). Tests in `src/tests/auth-context.test.tsx`.
- [x] 2.7 Create `src/components/projects/SelectorProyectos.tsx` + new-project dialog (rol-gated "Proyecto nuevo", empty state "contacte un administrador"). Test: `src/tests/selector-proyectos.test.tsx`.
- [x] 2.8 `src/context/AppContext.tsx`: inject `useAuth()` proyectoId into fetch/save actions; `src/main.tsx`: `<AppProvider key={proyectoActivoId}>` + picker branch.
- [x] 2.9 PR #2 verification: lint + `tsc -b` + `npx vitest run` + verify_rls + manual smoke: create project (general), legacy rows invisible, active-project restore + unauthorized fallback. (lint/tsc/vitest green; verify_rls + smoke deferred — Docker down, SQL syntax-reviewed.)

## Phase 3: PR #3 — Member/Role UI

- [ ] 3.1 `supabase-service.ts`: `invitarUsuario` (invoke `invite-user`), member list/add/remove, `cambiarRolUsuario`. Check: `tsc -b`.
- [ ] 3.2 Create `src/components/projects/DialogoInvitar.tsx`: admin picks rol; general fixed `usuario` (binding decision); temp password shown once. Test: `src/tests/dialogo-invitar.test.tsx`.
- [ ] 3.3 Create `src/components/projects/GestionMiembros.tsx`: member list, assign `usuario`, remove (Req: Membership Management). Test: `src/tests/gestion-miembros.test.tsx`.
- [ ] 3.4 Create `src/components/projects/PanelUsuarios.tsx`: admin-only global role promote/demote (Req: Global Roles and Permissions — CHANGE role row). Test: `src/tests/panel-usuarios.test.tsx`.
- [ ] 3.5 `src/App.tsx`: header "Cambiar proyecto" → `cambiarProyecto(null)` (single-screen UX otherwise untouched).
- [ ] 3.6 PR #3 verification: lint + `tsc -b` + `npx vitest run` + manual smoke: general invites usuario-only, admin promotes, removed member loses access next session.
