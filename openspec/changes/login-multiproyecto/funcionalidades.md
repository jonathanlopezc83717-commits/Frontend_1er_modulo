# Funcionalidades — Login & Multiproyecto

Resumen funcional del desarrollo `login-multiproyecto`: agrega **autenticación** y **organización multi-proyecto** al Analizador Ferroviario. La app actual (módulo "Obras ferroviarias") pasa a ser el contenido de un proyecto, con un login y un selector de proyectos por encima.

---

## 1. Autenticación

- **Login con email y contraseña** (Supabase Auth). Credenciales inválidas → mensaje genérico, sin revelar si el email existe (evita enumeración de usuarios).
- **Sesión persistente**: al recargar la página, la sesión se restaura sin volver a pedir login.
- **Logout**: termina la sesión y limpia el proyecto activo recordado.
- **Registro solo por invitación**: NO hay auto-registro público. Una cuenta existe únicamente si un `administrador` o `general` la creó por invitación. El invitado define su propia contraseña al primer ingreso.
- **Bootstrap de administrador**: el primer usuario del sistema se auto-promueve a `administrador`, garantizando que siempre haya al menos un admin para invitar al resto.

## 2. Roles y permisos

Tres roles globales (asignados por usuario en su perfil):

| Capacidad | administrador | general | usuario |
|---|---|---|---|
| Leer proyectos | TODOS | propios + participados | solo asignados |
| Editar datos del proyecto | TODOS | propios + participados | solo asignados |
| Crear proyectos | SÍ | SÍ | NO |
| Invitar nuevos usuarios (crear cuenta + asignar rol inicial) | SÍ | SÍ | NO |
| Cambiar el rol global de un usuario (promover/degradar) | SÍ | NO | NO |
| Gestionar miembros de un proyecto | TODOS | propios + participados | NO |

- Los permisos se **imponen en la base de datos (RLS)**, no solo en la interfaz.

## 3. Proyectos

- **Crear proyecto**: `administrador` y `general` (el creador queda como owner). `usuario` no puede crear.
- **Listar proyectos**: cada usuario ve solo los proyectos a los que tiene acceso (`administrador` ve todos).
- **Proyecto activo**: se recuerda entre recargas; si el usuario ya no está autorizado, cae al selector.

## 4. Membresía

- **Asignar** un `usuario` a un proyecto.
- **Remover** un miembro (pierde el acceso al proyecto en su próxima sesión).
- **Listar** los miembros de un proyecto.
- `general` gestiona miembros solo de proyectos **propios o donde participa**; `administrador` de cualquiera.

## 5. Aislamiento de datos

- `puntos_ferroviarios` se scopea por `proyecto_id` (sus 9 tablas hijas —coordenadas, documentos, análisis, fotos, etc.— heredan el alcance por la FK).
- **Nomenclaturas y plantillas de formato son GLOBALES**: compartidas entre todos los proyectos.
- Un `usuario` **no puede leer** los puntos de un proyecto al que no fue asignado (verificable por query directa — RLS).
- Los datos legacy (filas sin `proyecto_id`) quedan invisibles bajo la nueva RLS (no destructivo; un admin puede reasignarlos después).

## 6. Interfaz y navegación

- **Login gate en la raíz**: sin sesión → pantalla de login; con sesión → app.
- **Selector de proyectos**: lista los proyectos accesibles + botón **"Proyecto nuevo"** (visible solo si el rol lo permite).
- **Estado vacío**: un `usuario` sin proyectos asignados ve un mensaje con indicación de contactar a un administrador (no una pantalla rota).
- **UX preservada**: una vez activo un proyecto, la experiencia single-screen de análisis queda igual que antes de este cambio.

---

## Fuera de alcance (diferido)

- Eliminar / archivar proyectos y operaciones masivas.
- Migración de datos existentes (se arranca limpio).
- Router (se mantiene render condicional), SSO/OAuth/MFA, log de auditoría.

## Fases de entrega (3 PRs encadenados, ≤800 líneas cada uno)

1. **Auth + base**: login, sesión, `perfiles` + roles, RLS reescrita, invitación (edge function), gate en la raíz.
2. **Proyectos + scoping**: `proyectos` + `proyecto_miembros`, `proyecto_id` en puntos, fetch filtrado por proyecto, selector + proyecto activo.
3. **Gestión de miembros/roles**: UI para invitar, asignar a proyecto, cambiar rol y remover miembros.

---

> Fuente: `proposal.md` + `spec.md` de este cambio. Este doc es un resumen funcional legible; el detalle técnico (SQL de RLS, mecanismo de invitación, arquitectura) va en la fase `design`.
