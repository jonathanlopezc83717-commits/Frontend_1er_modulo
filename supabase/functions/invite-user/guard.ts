// Lógica pura del guard de invitaciones (task 1.5).
// Sin APIs de Deno para que vitest la importe directamente.

export type RolUsuario = "administrador" | "general" | "usuario"

export const ROLES_VALIDOS: readonly RolUsuario[] = ["administrador", "general", "usuario"]

export interface EntradaDecision {
  /** Rol del invocador verificado contra perfiles; null = sin sesión / inválido */
  callerRol: RolUsuario | null
  /** true si auth.users ya tiene al menos un usuario */
  usuariosExisten: boolean
  /** rol solicitado para el invitado (sin validar) */
  rolSolicitado: unknown
  /** email del invitado (sin validar) */
  email: unknown
}

export type DecisionInvitacion =
  | { ok: true; rol: RolUsuario; bootstrap: boolean }
  | { ok: false; status: 400 | 403; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function decidirInvitacion(entrada: EntradaDecision): DecisionInvitacion {
  const email = typeof entrada.email === "string" ? entrada.email.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "Email inválido" }
  }
  const rol = typeof entrada.rolSolicitado === "string" ? entrada.rolSolicitado : ""
  if (!(ROLES_VALIDOS as readonly string[]).includes(rol)) {
    return { ok: false, status: 400, error: "Rol inválido" }
  }

  // Bootstrap: sistema vacío acepta la primera invitación sin sesión.
  // El trigger de BD promueve a administrador de todas formas (doble seguro).
  if (entrada.callerRol === null) {
    if (entrada.usuariosExisten) {
      return { ok: false, status: 403, error: "No autorizado" }
    }
    return { ok: true, rol: "administrador", bootstrap: true }
  }
  if (entrada.callerRol === "administrador") {
    return { ok: true, rol: rol as RolUsuario, bootstrap: false }
  }
  // Decisión vinculante del usuario: general solo puede invitar rol usuario.
  if (entrada.callerRol === "general") {
    if (rol !== "usuario") {
      return { ok: false, status: 403, error: "Un general solo puede invitar con rol usuario" }
    }
    return { ok: true, rol: "usuario", bootstrap: false }
  }
  return { ok: false, status: 403, error: "No autorizado" }
}

const ALFABETO_PWD = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

export function generarPasswordTemporal(largo = 12): string {
  const bytes = new Uint8Array(largo)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < bytes.length; i++) {
    out += ALFABETO_PWD[bytes[i] % ALFABETO_PWD.length]
  }
  return out
}
