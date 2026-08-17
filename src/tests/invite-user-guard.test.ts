import { describe, it, expect } from 'vitest'
import { decidirInvitacion, generarPasswordTemporal, type RolUsuario } from '../../supabase/functions/invite-user/guard'

function entrada(parcial: Partial<Parameters<typeof decidirInvitacion>[0]> = {}) {
  return {
    callerRol: 'administrador' as RolUsuario | null,
    usuariosExisten: true,
    rolSolicitado: 'usuario',
    email: 'nuevo@ejemplo.com',
    ...parcial,
  }
}

describe('decidirInvitacion (guard de invite-user)', () => {
  it('rechaza email inválido con 400', () => {
    for (const email of ['no-mail', 'a@b', 'a b@c.com', 42, undefined]) {
      const r = decidirInvitacion(entrada({ email }))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(400)
    }
  })

  it('rechaza rol fuera del enum con 400', () => {
    for (const rol of ['superadmin', '', null, 123]) {
      const r = decidirInvitacion(entrada({ rolSolicitado: rol }))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(400)
    }
  })

  it('administrador puede invitar cualquier rol', () => {
    for (const rol of ['administrador', 'general', 'usuario'] as const) {
      const r = decidirInvitacion(entrada({ callerRol: 'administrador', rolSolicitado: rol }))
      expect(r).toEqual({ ok: true, rol, bootstrap: false })
    }
  })

  it('general NO puede invitar con rol distinto de usuario (decisión vinculante)', () => {
    for (const rol of ['administrador', 'general']) {
      const r = decidirInvitacion(entrada({ callerRol: 'general', rolSolicitado: rol }))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(403)
    }
  })

  it('general puede invitar con rol usuario', () => {
    const r = decidirInvitacion(entrada({ callerRol: 'general', rolSolicitado: 'usuario' }))
    expect(r).toEqual({ ok: true, rol: 'usuario', bootstrap: false })
  })

  it('usuario no puede invitar (403)', () => {
    const r = decidirInvitacion(entrada({ callerRol: 'usuario' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('sin sesión con usuarios existentes es rechazado (403)', () => {
    const r = decidirInvitacion(entrada({ callerRol: null, usuariosExisten: true }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('sin sesión con sistema vacío -> bootstrap administrador', () => {
    const r = decidirInvitacion(entrada({ callerRol: null, usuariosExisten: false }))
    expect(r).toEqual({ ok: true, rol: 'administrador', bootstrap: true })
  })

  it('normaliza email con espacios y mayúsculas antes de validar', () => {
    const r = decidirInvitacion(entrada({ email: '  Nuevo@Ejemplo.COM ' }))
    expect(r.ok).toBe(true)
  })
})

describe('generarPasswordTemporal', () => {
  it('genera 12 caracteres del alfabeto sin ambiguos', () => {
    for (let i = 0; i < 20; i++) {
      const pwd = generarPasswordTemporal()
      expect(pwd).toHaveLength(12)
      expect(pwd).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]+$/)
    }
  })

  it('dos generaciones difieren (aleatoriedad mínima)', () => {
    expect(generarPasswordTemporal()).not.toBe(generarPasswordTemporal())
  })
})
