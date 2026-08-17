# Design: Login & Multi-Project Isolation

## Context & Constraints

- Local Supabase (`http://127.0.0.1:54321`), `auth.enabled = true`, **no SMTP configured** (inbucket dev mailer only — cannot rely on email delivery), `enable_refresh_token_rotation = true`, `jwt_expiry = 3600`, `enable_signup = true` today.
- Live tables with `USING (true)` policies: **7 of the original 11** — `puntos_ferroviarios`, `coordenadas_gps`, `documentos_punto`, `analisis_imagenes`, `fotos_punto`, `historial_obras`, `app_state_snapshots`. (`inspeccion_punto`, `ambiental_punto`, `materiales_punto`, `riesgos_punto` were dropped by orphan cleanups 20260707/20260708.) Plus legacy `image_analyses` with public read/insert policies.
- RPCs `guardar_punto_completo(jsonb)` / `cargar_puntos_completos()` are **SECURITY INVOKER** → caller RLS applies automatically. Edge function `sincronizar-puntos` forwards the caller's JWT → RLS applies there too.
- `numero_serie` has **no unique constraint** → no constraint relaxation needed for multi-project.
- Nomenclaturas/formato templates have **no DB table** (client-side app state + snapshots) → "stay global" = we simply do not scope them.
- State: external store (`app-store.ts` + `appReducer`), `AppProvider` auto-calls `cargarDesdeSupabase()` on mount. AppContext is a hotspot (fan-in 9–15) — minimal diff mandatory.
- Constraints: no router lib, no new frontend deps, migrations as new timestamped files, ADR-004 (`moduloData` untouched), ADR-005 (additive columns only), single-screen UX untouched once a project is active.

## Decisions

### D1. Auth mechanism — Supabase Auth email/password, supabase-js defaults
**Choice**: `signInWithPassword` + client defaults `persistSession` (localStorage) + `autoRefreshToken`.
**Rationale**: The "daily rotating token" requirement is satisfied by Supabase's built-in flow: 1h access JWT + rotating refresh tokens (already enabled in config). Zero custom token code.
**Alternatives rejected**: custom JWT/refresh endpoints (code + risk for zero benefit); magic links (need SMTP).

### D2. Invitation without SMTP — edge function `invite-user` + one-time temp password
**Choice**: New edge function (service role) creates the user via `auth.admin.createUser({ email, password: <random 12-char>, email_confirm: true })`, then sets the assigned `rol` and `debe_cambiar_password = true` on `perfiles`. The temp password is returned **once** to the inviter UI to share out-of-band. On first login the app forces `PantallaLogin modo="primer-acceso"` → `supabase.auth.updateUser({ password })` → clears flag. Set `enable_signup = false` in `config.toml` (spec: no public registration at auth layer).
**Rationale**: Works with zero email infrastructure; simplest mechanism that satisfies "invitee sets own password".
**Alternatives rejected**: `inviteUserByEmail` (needs real SMTP; inbucket only works in dev); admin SQL inserts (not a UI flow); service-role key in browser (secret exposure).

### D3. First-user bootstrap — dual safety
**Choice**: (a) `invite-user` accepts an **unauthenticated** call only when `auth.users` is empty (nothing to abuse in an empty system; window closes after user #1). (b) DB trigger promotes first `perfiles` row to `administrador` regardless of creation path.
**Rationale**: Solves chicken-and-egg (invites need an admin; first admin needs an invite) without seed passwords in git.
**Alternatives rejected**: committed seed.sql admin (secret in repo, resets duplicated); leaving `enable_signup = true` for first signup then flagging it off (violates spec, operational trap).

### D4. Auth state location — separate `AuthContext`, `AppProvider` keyed by project
**Choice**: New `src/context/AuthContext.tsx` ABOVE `AppProvider` in `main.tsx`. AuthGate renders Login / Picker / `<AppProvider key={proyectoActivoId}><Toaster/><App/></AppProvider>`.
**Rationale**: AppContext is a persisted (localStorage/IndexedDB) hotspot store — mixing auth in forces persistence rewiring and re-renders across fan-in 9–15. Keying `AppProvider` by project id gives clean per-project state reset and exactly one auto-fetch per project switch (no fetch storms) for ~1 line.
**Alternatives rejected**: extending AppContext (large diff, couples session to persisted state); Zustand/Redux (new dep, banned).

### D5. `proyecto_id` delivery to service layer — explicit param injection
**Choice**: `supabase-service` functions gain a required `proyectoId` param (`cargarPuntosCompletos(proyectoId)`, `guardarPuntoCompleto` embeds it in the RPC payload, snapshot functions filter/insert it). `AppProvider` reads it from `useAuth()`.
**Rationale**: Explicit, unit-testable, no hidden module state. RLS remains the enforcement net regardless of what the client sends.
**Alternatives rejected**: module-level mutable active-project (implicit coupling, test-hostile); context import inside `lib/` (inverts layering — `lib → context` edge exists once already, don't add more).

### D6. RLS rewrite — two-step tightening
**Choice**: PR#1 replaces all "Allow all" with **authenticated-only** baseline (kills anon access; app still works pre-projects). PR#2 tightens puntos + children + snapshots to membership/owner policies. Helpers `fn_rol_actual()`, `fn_es_admin()`, `fn_es_miembro(uuid)` as `SECURITY DEFINER STABLE SET search_path = public` (owner = postgres, bypasses perfiles RLS → **avoids the classic policy-reads-perfiles recursion**).
**Rationale**: Each PR stays independently shippable and reviewable; no intermediate state where the app breaks for logged-in users.

### D7. Project access model — membership row for everyone, owner included
**Choice**: On project create, a trigger inserts a `proyecto_miembros` row for the creator. Access check is always `fn_es_admin() OR fn_es_miembro(proyecto_id)` — no separate owner branch. No project-level role column (spec defines global roles only).
**Rationale**: One code path for owned/participated/assigned; YAGNI on project roles.
**Alternatives rejected**: `creado_por`-based owner checks (two access paths to test); project-level roles (no requirement).

### D8. Snapshots become per-user+project; nomenclaturas stay global
**Choice**: `app_state_snapshots` gains nullable `user_id` (default `auth.uid()`) + `proyecto_id`; legacy rows invisible (non-destructive, consistent with legacy puntos). Nomenclaturas/plantillas remain in app state — untouched.
**Rationale**: "Recargar desde la nube" is a personal backup of a project's state; spec keeps nomenclaturas global and they have no server table to scope.

## Data Model (DDL sketches)

```sql
-- PR#1: 20260817000001_auth_perfiles_rls.sql
CREATE TYPE rol_usuario AS ENUM ('administrador','general','usuario');
CREATE TABLE perfiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  nombre text,
  rol rol_usuario NOT NULL DEFAULT 'usuario',
  debe_cambiar_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Trigger on auth.users INSERT → SECURITY DEFINER insert into perfiles (search_path pinned)
-- BEFORE INSERT ON perfiles: IF (SELECT count(*) FROM perfiles) = 0 THEN NEW.rol := 'administrador'
--   (pg_advisory_xact_lock to close the two-concurrent-firsts race)
-- BEFORE UPDATE ON perfiles: non-admin (fn_es_admin()) cannot change rol

-- PR#2: 20260817000002_proyectos_scoping.sql
CREATE TABLE proyectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text,
  creado_por uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE proyecto_miembros (
  proyecto_id uuid NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creado_por uuid NOT NULL REFERENCES auth.users(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proyecto_id, user_id)
);
-- Trigger AFTER INSERT ON proyectos → insert membership row for creado_por
ALTER TABLE puntos_ferroviarios
  ADD COLUMN proyecto_id uuid REFERENCES proyectos(id);  -- nullable, legacy stays NULL
CREATE INDEX idx_puntos_proyecto ON puntos_ferroviarios(proyecto_id);
ALTER TABLE app_state_snapshots
  ADD COLUMN user_id uuid DEFAULT auth.uid(),
  ADD COLUMN proyecto_id uuid REFERENCES proyectos(id);

-- RPC updates (PR#2):
--   cargar_puntos_completos(p_proyecto uuid) → WHERE estado='activo' AND proyecto_id = p_proyecto
--   guardar_punto_completo: writes payload punto.proyecto_id on INSERT;
--     ON CONFLICT DO UPDATE deliberately does NOT set proyecto_id (row can't migrate projects)
```

## RLS Policy Matrix

`admin` = `fn_es_admin()`; `miembro(p)` = `fn_es_miembro(p)`. All policies `TO authenticated`.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `perfiles` | own row OR admin | — (trigger/service role only) | own row OR admin (rol frozen by trigger for non-admins) | — |
| `proyectos` | admin OR miembro(id) | admin OR `fn_rol_actual() IN ('general')` | admin OR miembro(id) | — (deletion out of scope) |
| `proyecto_miembros` | admin OR miembro(proyecto_id) | admin OR miembro(proyecto_id) | — | admin OR miembro(proyecto_id) |
| `puntos_ferroviarios` | admin OR (`proyecto_id IS NOT NULL` AND miembro) | `proyecto_id IS NOT NULL` AND miembro (admin exempt) | same as SELECT | same as SELECT |
| `coordenadas_gps`, `documentos_punto`, `analisis_imagenes`, `fotos_punto`, `historial_obras` | `EXISTS (SELECT 1 FROM puntos_ferroviarios p WHERE p.id = <t>.punto_id AND (admin OR miembro(p.proyecto_id)))` | same EXISTS pattern (covers trigger-written historial + client upserts) | same | same |
| `app_state_snapshots` | `user_id = auth.uid()` | `user_id = auth.uid()` AND `proyecto_id IS NOT NULL` AND miembro | — | `user_id = auth.uid()` |
| `image_analyses` (legacy) | authenticated | — (drop public insert policy) | — | — |

PR#1 ships the same matrix with everything below `perfiles` as plain `auth.uid() IS NOT NULL` (baseline); PR#2 tightens to the above. `historial_obras` writes come from the SECURITY INVOKER trigger — membership policy covers it because the trigger runs as the RPC caller. Storage bucket `images` stays public-read (deferred — see Risks).

## Frontend Architecture

```
main.tsx
└─ <AuthProvider>                      src/context/AuthContext.tsx  (NEW ~190 lines)
   └─ <AuthGate>                       conditional render — NO router
      ├─ cargando              → <ThinkingLoader/>
      ├─ !session              → <PantallaLogin/>                       components/auth (NEW)
      ├─ debeCambiarPassword   → <PantallaLogin modo="primer-acceso"/>  same file, two modes
      ├─ !proyectoActivo       → <SelectorProyectos/>                   components/projects (NEW)
      └─ else → <AppProvider key={proyectoActivoId}> <Toaster/> <App/>  ← UNTOUCHED single-screen UX
```

- **AuthContext state**: `session`, `perfil {rol, nombre}`, `proyectos[]`, `proyectoActivoId`, `cargando`; actions `login`, `logout`, `cambiarProyecto`, `crearProyecto`, `refrescarPerfil`. Listens to `supabase.auth.onAuthStateChange`.
- **Active-project persistence**: localStorage key `proyecto-activo:{userId}`; on restore, validated against the RLS-filtered project list — invalid/removed → picker (spec scenario). Logout clears it.
- **Project-scoped data flow**: `AppProvider` (fresh per project key) → `cargarDesdeSupabase()` → `rpc('cargar_puntos_completos',{p_proyecto})` → RLS double-checks → dispatch. Guardar/sincronizar payloads carry `proyecto_id`.
- **UI strings Spanish** (e.g. "Credenciales inválidas", "Proyecto nuevo"); all login errors map to that one generic message (anti-enumeration).

## Auth & Session Flow

```
login: Browser → signInWithPassword → GoTrue → session{JWT 1h + refresh}
       → localStorage (supabase-js) → perfiles fetch → proyectos fetch → picker/app
reload: AuthProvider: getSession() → (expired? silent refresh, rotation) → same chain
request: Bearer JWT → PostgREST → RLS (auth.uid / rol / miembros)
invite: admin UI → functions.invoke('invite-user', {email, rol}) → service-role
        createUser(email, tempPwd, email_confirm:true) + set perfiles.rol/debe_cambiar_password
        → tempPwd shown ONCE to inviter → invitee logs in → forced password change → flag cleared
logout: supabase.auth.signOut() → clear proyecto-activo key → login screen
```

## PR Slicing (stacked-to-main, ≤800 lines each)

| PR | Files | Est. lines |
|---|---|---|
| **#1 Auth+RLS foundation** | `migrations/20260817000001_auth_perfiles_rls.sql` (~200) · `config.toml` enable_signup=false (2) · `functions/invite-user/index.ts` (~100) · `src/context/AuthContext.tsx` (~190) · `src/components/auth/PantallaLogin.tsx` login+first-access (~150) · `main.tsx` gate (+15) · `types` (+20) · tests (~90) | ~770 |
| **#2 Projects+scoping** | `migrations/20260817000002_proyectos_scoping.sql` (~240) · `supabase-service.ts` proyectoId params (+70) · `AppContext.tsx` wire useAuth→actions (+40) · `AuthContext.tsx` proyectos/active/persist (+90) · `components/projects/SelectorProyectos.tsx` + new-project dialog (~250) · `main.tsx` (+15) · `types` (+25) · tests (~100) | ~780 |
| **#3 Member/role UI** | `components/projects/GestionMiembros.tsx` (~230) · `DialogoInvitar.tsx` (~140) · `PanelUsuarios.tsx` admin role mgmt (~170) · `supabase-service.ts` member/role fns (+90) · `App.tsx` header "Cambiar proyecto" button (+25) · tests (~90) | ~745 |

`sincronizar-puntos` needs **zero changes** (payloads carry `proyecto_id`; it forwards caller JWT → RLS enforces).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (vitest, jsdom) | AuthGate render states (loading/login/primer-acceso/picker/app) | mock supabase client (existing test patterns in `src/tests/`) |
| Unit | Project scoping: RPC args carry `p_proyecto`; guardar payload embeds `proyecto_id`; snapshot filters | pure function tests on service layer |
| Unit | Active-project restore + unauthorized fallback; logout clears persistence | localStorage mocking |
| SQL | Migration syntax + idempotency | `supabase db reset` applies cleanly |
| SQL | RLS enforcement (spec scenarios: usuario↛P2, legacy invisible, nomenclaturas global N/A-client-side) | `supabase/queries/verify_rls.sql`: `SET ROLE authenticated` + `SET LOCAL request.jwt.claims` per persona, assert row counts — run post-reset on local DB (port 54322) |
| Manual | invite flow, first login, member removal next-session | checklist (no E2E framework; don't add one) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable classification, or process-integration boundary in app code. (The edge function is a Supabase Deno endpoint; its call-surface risks are covered in Risks.)

## Risks & Mitigations

| Risk | L | Mitigation |
|---|---|---|
| RLS recursion on perfiles (policy → fn → perfiles) | High | Helpers are SECURITY DEFINER owned by postgres with pinned `search_path`; RED test in verify_rls.sql |
| RLS rewrite breaks existing flows | High | Two-step tightening; each PR ships verify_rls.sql covering its policies |
| Bootstrap race (two concurrent firsts) | Low | advisory xact lock in trigger + edge function single-guard |
| Temp password leaks via logs/history | Med | Returned once, never persisted; rotate on first login (flag enforced client-side; document that DB can't force it — acceptable local) |
| `images` bucket public read across projects | Med | Deferred (out of scope); images reachable only by unguessable URL locally |
| AppContext auto-fetch before project chosen | Med | AppProvider mounts only after gate; keyed remount per project |
| Legacy `image_analyses` orphan | Low | Policies restricted; drop deferred to future cleanup change |

## Open Questions

- [ ] May `general` invite with initial rol ≠ `usuario`? Design says no (inviting as general/admin ≈ granting a global role → admin-only). Confirm.
- [ ] `enable_signup=false` also disables the bootstrap signup path — team OK with edge-function bootstrap as the only first-user path?
- [ ] Drop legacy `image_analyses` in a future cleanup change?
