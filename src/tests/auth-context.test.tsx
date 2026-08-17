// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { createElement } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Perfil } from '@/types'

const mocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      getSession: mocks.getSession,
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    })),
  },
}))

function hacerSession(userId: string): Session {
  return { user: { id: userId, email: `${userId}@test.local` } } as unknown as Session
}

function hacerPerfil(userId: string, debeCambiar = false): Perfil {
  return {
    id: userId,
    email: `${userId}@test.local`,
    nombre: null,
    rol: 'usuario',
    debe_cambiar_password: debeCambiar,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

type AuthCallback = (event: string, session: Session | null) => void

function montarConCallback(): { authCallback: AuthCallback } {
  let authCallback: AuthCallback = () => {}
  mocks.onAuthStateChange.mockImplementation((cb: AuthCallback) => {
    authCallback = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  return {
    authCallback: (e: string, s: Session | null) => authCallback(e, s),
  }
}

describe('AuthContext: restauración de sesión y acciones', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('arranca en cargando y restaura sesión + perfil con el evento inicial', async () => {
    const { AuthProvider, useAuth } = await import('@/context/AuthContext')
    const montaje = montarConCallback()
    mocks.maybeSingle.mockResolvedValue({ data: hacerPerfil('u1') })

    const valores: Array<{ cargando: boolean; session: Session | null; perfil: Perfil | null }> = []
    function Sonda() {
      const v = useAuth()
      valores.push({ cargando: v.cargando, session: v.session, perfil: v.perfil })
      return createElement('div', { 'data-testid': 's' })
    }

    render(createElement(AuthProvider, null, createElement(Sonda)))
    expect(valores[0].cargando).toBe(true)

    await act(async () => {
      montaje.authCallback('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })

    const ultimo = valores[valores.length - 1]
    expect(ultimo.cargando).toBe(false)
    expect(ultimo.session?.user.id).toBe('u1')
    expect(ultimo.perfil?.id).toBe('u1')
    expect(mocks.maybeSingle).toHaveBeenCalled()
  })

  it('SIGNED_OUT limpia session y perfil', async () => {
    const { AuthProvider, useAuth } = await import('@/context/AuthContext')
    const montaje = montarConCallback()
    mocks.maybeSingle.mockResolvedValue({ data: hacerPerfil('u1') })

    let actual: { session: Session | null; perfil: Perfil | null } | null = null
    function Sonda() {
      const v = useAuth()
      actual = { session: v.session, perfil: v.perfil }
      return createElement('div', null)
    }
    render(createElement(AuthProvider, null, createElement(Sonda)))

    await act(async () => {
      montaje.authCallback('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })
    expect(actual?.session).not.toBeNull()
    expect(actual?.perfil).not.toBeNull()

    await act(async () => {
      montaje.authCallback('SIGNED_OUT', null)
      await Promise.resolve()
    })
    expect(actual?.session).toBeNull()
    expect(actual?.perfil).toBeNull()
  })

  it('login mapea cualquier error de credenciales al mensaje genérico', async () => {
    const { AuthProvider, useAuth } = await import('@/context/AuthContext')
    montarConCallback()
    mocks.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') })

    let login: (e: string, p: string) => Promise<{ error: string | null }> = async () => ({ error: null })
    function Sonda() {
      const v = useAuth()
      login = v.login
      return createElement('div', null)
    }
    render(createElement(AuthProvider, null, createElement(Sonda)))

    const res = await act(() => login('x@test.local', 'mala'))
    expect(res).toEqual({ error: 'Credenciales inválidas' })
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'x@test.local', password: 'mala' })
  })

  it('login exitoso no devuelve error', async () => {
    const { AuthProvider, useAuth } = await import('@/context/AuthContext')
    montarConCallback()
    mocks.signInWithPassword.mockResolvedValue({ error: null })

    let login: (e: string, p: string) => Promise<{ error: string | null }> = async () => ({ error: null })
    function Sonda() {
      const v = useAuth()
      login = v.login
      return createElement('div', null)
    }
    render(createElement(AuthProvider, null, createElement(Sonda)))

    const res = await act(() => login('x@test.local', 'buena'))
    expect(res).toEqual({ error: null })
  })

  it('refrescarPerfil vuelve a consultar la fila de perfiles', async () => {
    const { AuthProvider, useAuth } = await import('@/context/AuthContext')
    const montaje = montarConCallback()
    mocks.getSession.mockResolvedValue({ data: { session: hacerSession('u1') } })
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: hacerPerfil('u1', true) })
      .mockResolvedValueOnce({ data: hacerPerfil('u1', false) })

    let refrescar: () => Promise<void> = async () => {}
    let perfilVisto: Perfil | null = null
    function Sonda() {
      const v = useAuth()
      refrescar = v.refrescarPerfil
      perfilVisto = v.perfil
      return createElement('div', null)
    }
    render(createElement(AuthProvider, null, createElement(Sonda)))

    await act(async () => {
      montaje.authCallback('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })
    expect(perfilVisto?.debe_cambiar_password).toBe(true)

    await act(async () => {
      await refrescar()
    })
    expect(perfilVisto?.debe_cambiar_password).toBe(false)
  })
})
