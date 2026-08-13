# Spec: Login & Multi-Project Isolation

Three NEW capabilities (no prior openspec specs exist): `user-auth`, `project-access`, `project-management-ui`. **Project deletion, archival, and bulk operations are OUT of scope** for all phases of this change (deferred).

---

## Capability: user-auth

### Purpose
Email/password authentication, **invitation-only** account creation, session handling, and per-user profile provisioning.

### Requirements

#### Requirement: Email/Password Login
The system MUST authenticate users via Supabase Auth (email/password). Invalid credentials MUST be rejected with a generic, non-enumerable error.

##### Scenario: Successful login
- GIVEN a registered user who has set a password
- WHEN they submit valid email + password
- THEN an authenticated session is created and the user proceeds to the project picker (or directly to the app if an active project is restored)

##### Scenario: Failed login — wrong password
- GIVEN a registered user
- WHEN they submit a valid email with a wrong password
- THEN authentication is rejected with a generic "invalid credentials" message; no session is created

##### Scenario: Failed login — unknown email
- GIVEN an email with no account
- WHEN login is attempted
- THEN authentication is rejected with the SAME generic message as the wrong-password case (no user enumeration)

#### Requirement: Invitation-Only Signup
The system MUST NOT provide public self-registration. A user account SHALL exist only if a user with role `administrador` or `general` created it by invitation. The invitee MUST set their own password on first access. Each new user MUST receive a `perfiles` row with an assigned role (default `usuario`).

##### Scenario: Admin/general invites a new user
- GIVEN an authenticated `administrador` or `general`
- WHEN they invite an email and assign a role
- THEN an account is created for that email, the invitee is prompted to set a password, and a `perfiles` row exists with the assigned role

##### Scenario: Public self-registration is rejected
- GIVEN an unauthenticated visitor
- WHEN they attempt to register without a prior invitation
- THEN no account is created and no public registration path exists in the UI or auth layer

#### Requirement: Admin Bootstrap
The very first user created in the system MUST be auto-promoted to role `administrador`, guaranteeing at least one admin exists to invite further users.

##### Scenario: First user becomes admin
- GIVEN a system with zero users
- WHEN the first user account is created (via any bootstrap path)
- THEN that user's `perfiles.role` is set to `administrador`

##### Scenario: Subsequent users are not auto-promoted
- GIVEN at least one user already exists
- WHEN a new user is created
- THEN that user's role is the assigned role (default `usuario`); they are never auto-promoted

#### Requirement: Session Persistence and Restore
An authenticated session MUST persist across browser reloads. On reload, the system MUST restore the session without requiring re-login.

##### Scenario: Session restored on reload
- GIVEN a user with an active authenticated session
- WHEN they reload the page
- THEN the session is restored and the user is not asked to log in again

##### Scenario: Expired or invalid session
- GIVEN a session that is no longer valid
- WHEN the app loads
- THEN the user is returned to the login screen

#### Requirement: Logout
The system MUST provide a logout action that terminates the session.

##### Scenario: Logout ends session
- GIVEN an authenticated user
- WHEN they trigger logout
- THEN the session is terminated, the persisted active-project state is cleared, and the login screen is shown

---

## Capability: project-access

### Purpose
Global roles, projects, membership, project-scoped data isolation, and Row-Level Security enforcement.

### Requirements

#### Requirement: Global Roles and Permissions
The system MUST enforce three global roles on `perfiles` per the following matrix.

| Capability | administrador | general | usuario |
|---|---|---|---|
| READ projects | ALL | owned + participated | assigned only |
| WRITE project data | ALL | owned + participated | assigned only |
| CREATE projects | YES | YES | NO |
| INVITE new users (create account, assign initial role) | YES | YES | NO |
| CHANGE a user's global role (promote/demote administrador/general/usuario) | YES | NO | NO |
| MANAGE project members | ALL | owned + participated | NO |

##### Scenario: Usuario edits assigned project
- GIVEN a `usuario` assigned to project P
- WHEN they edit puntos_ferroviarios in P
- THEN the edit succeeds

##### Scenario: Usuario cannot create projects
- GIVEN a `usuario`
- WHEN they attempt to create a project
- THEN the action is rejected at both UI and data layer

##### Scenario: General manages participated project members
- GIVEN a `general` who participates in project P
- WHEN they manage members of P
- THEN the action succeeds (owned OR participated)

#### Requirement: Project Creation
Only `administrador` and `general` MAY create projects. The creator MUST become owner (member) of the new project.

##### Scenario: General creates a project
- GIVEN an authenticated `general`
- WHEN they create a new project
- THEN the project is created and the creator is recorded as its owner

##### Scenario: Usuario cannot create a project
- GIVEN a `usuario`
- WHEN they attempt to create a project
- THEN creation is rejected

#### Requirement: Project Listing by Access
The system MUST list ONLY projects the user is authorized to see: `administrador` sees all; `general` and `usuario` see only projects they own or are a member of.

##### Scenario: Usuario sees only assigned projects
- GIVEN a `usuario` assigned to projects P1 and P2
- WHEN they open the project picker
- THEN only P1 and P2 are listed

#### Requirement: Membership Management
The system MUST support assigning a `usuario` to a project, removing a member, and listing members. A `general` MAY manage members ONLY of projects they own OR participate in. An `administrador` MAY manage members of ANY project.

##### Scenario: General cannot manage an arbitrary project
- GIVEN a `general` who is NOT a member of project P
- WHEN they attempt to manage P's members
- THEN the action is rejected

##### Scenario: Admin removes a member
- GIVEN an `administrador` and project P with member M
- WHEN they remove M from P
- THEN M loses access to P and can no longer read P's data on next session

#### Requirement: Active Project Persistence
The system MUST remember the last active project across reloads, but MUST fall back to the project picker if the user is no longer authorized for that project (removed as a member, or no longer `administrador`).

##### Scenario: Active project restored when still authorized
- GIVEN a user whose persisted active project is P and who is still a member/admin of P
- WHEN they reload
- THEN the app restores P as active and skips the picker

##### Scenario: Falls back to picker when no longer authorized
- GIVEN a user whose persisted active project they can no longer access
- WHEN they reload
- THEN the picker is shown instead of the persisted project

#### Requirement: Project-Scoped Data Isolation
`puntos_ferroviarios` MUST be scoped by a nullable `proyecto_id`. The 9 child tables MUST inherit scope via FK CASCADE. `nomenclaturas` and formato templates MUST remain GLOBAL (readable by all authenticated users regardless of active project).

##### Scenario: Legacy rows are invisible
- GIVEN legacy puntos_ferroviarios rows with NULL `proyecto_id`
- WHEN any user queries puntos_ferroviarios
- THEN those legacy rows are not returned (non-destructive; an admin may reassign them later)

##### Scenario: Nomenclaturas stay global
- GIVEN any authenticated user with any active project
- WHEN they read nomenclaturas or formato templates
- THEN they receive the full global set, unaffected by active project

#### Requirement: Row-Level Security Enforcement
The 11 existing "Allow all" (`USING (true) WITH CHECK (true)`) policies MUST be replaced by role- and membership-aware policies that enforce the permissions above at the database layer (not only in the UI).

##### Scenario: Usuario cannot read another project's puntos
- GIVEN a `usuario` assigned to P1 only
- WHEN they directly query puntos_ferroviarios for project P2 (to which they are not assigned)
- THEN zero rows from P2 are returned, enforced by RLS

#### Requirement: Project Deletion (Excluded)
Project deletion, archival, and bulk operations are OUT of scope. The system MUST NOT be required to provide any of them in any phase of this change.

##### Scenario: No deletion path exists
- GIVEN any user, including `administrador`
- WHEN they use the app
- THEN no project deletion, archival, or bulk operation is available (deferred to a future change)

---

## Capability: project-management-ui

### Purpose
Login gate, project picker, member/role management UI, and preservation of the existing single-screen UX.

### Requirements

#### Requirement: Login Gate at Root
The app root MUST render the login screen for unauthenticated users and the authenticated experience for authenticated users, via conditional rendering (no router library).

##### Scenario: Unauthenticated visitor sees login
- GIVEN an unauthenticated visitor
- WHEN they open the app
- THEN only the login screen is rendered

#### Requirement: Project Picker
Authenticated users without an active project MUST see a project picker listing the projects they may access. A "new project" action MUST appear ONLY for `administrador` and `general`.

##### Scenario: Usuario picker has no new-project action
- GIVEN an authenticated `usuario`
- WHEN they open the picker
- THEN no "new project" action is shown

##### Scenario: General picker shows new-project action
- GIVEN an authenticated `general`
- WHEN they open the picker
- THEN a "new project" action is shown

#### Requirement: Empty-Picker State
A `usuario` with zero project assignments MUST see an empty state with guidance to contact an administrator, rather than a blank or broken UI.

##### Scenario: Usuario with no assignments
- GIVEN a `usuario` with no `proyecto_miembros` rows
- WHEN they reach the picker
- THEN an empty-state message is shown with instructions to contact an admin

#### Requirement: Member and Role Management UI
The system MUST provide UI for `administrador` and authorized `general` to: invite new users (and set their role), assign a `usuario` to projects, change a member's role, and remove members.

##### Scenario: Admin changes a user's role
- GIVEN an `administrador` viewing a member
- WHEN they change the member's role
- THEN the change persists and takes effect on the member's next session

#### Requirement: Single-Screen UX Preservation
Once a project is active, the existing single-screen analysis UX MUST remain unchanged in behavior and layout. The auth and picker additions MUST NOT alter the in-project experience.

##### Scenario: Existing UX intact post-login
- GIVEN an authenticated user with an active project
- WHEN they use the analyzer
- THEN the single-screen experience behaves exactly as before this change
