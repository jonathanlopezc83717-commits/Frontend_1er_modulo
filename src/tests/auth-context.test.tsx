// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { createElement } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Perfil, Proyecto } from '@/types'

const mocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  maybeSingle: vi.fn(),
  proyectosRpc: vi.fn(),
  proyectosInsert: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      getSession: mocks.getSession,
    },
    rpc: mocks.proyectosRpc,
    from: vi.fn((tabla: string) => {
      if (tabla === 'proyectos') {
        return { insert: mocks.proyectosInsert }
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: mocks.maybeSingle }),
        }),
      }
    }),
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

function hacerProyecto(id: string, nombre: string): Proyecto {
  return {
    id,
    nombre,
    descripcion: null,
    creado_por: 'u1',
    created_at: '2026-01-01T00:00:00Z',
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
    localStorage.clear()
    mocks.proyectosRpc.mockResolvedValue({ data: [], error: null })
    mocks.proyectosInsert.mockResolvedValue({ error: null })
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

    const capturas: Array<{ session: Session | null; perfil: Perfil | null }> = []
    function Sonda() {
      const v = useAuth()
      capturas.push({ session: v.session, perfil: v.perfil })
      return createElement('div', null)
    }
    render(createElement(AuthProvider, null, createElement(Sonda)))

    await act(async () => {
      montaje.authCallback('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })
    const conSession = capturas[capturas.length - 1]
    expect(conSession.session).not.toBeNull()
    expect(conSession.perfil).not.toBeNull()

    await act(async () => {
      montaje.authCallback('SIGNED_OUT', null)
      await Promise.resolve()
    })
    const sinSession = capturas[capturas.length - 1]
    expect(sinSession.session).toBeNull()
    expect(sinSession.perfil).toBeNull()
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
    const perfilesVistos: Array<Perfil | null> = []
    function Sonda() {
      const v = useAuth()
      refrescar = v.refrescarPerfil
      perfilesVistos.push(v.perfil)
      return createElement('div', null)
    }
    render(createElement(AuthProvider, null, createElement(Sonda)))

    await act(async () => {
      montaje.authCallback('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })
    expect(perfilesVistos[perfilesVistos.length - 1]?.debe_cambiar_password).toBe(true)

    await act(async () => {
      await refrescar()
    })
    expect(perfilesVistos[perfilesVistos.length - 1]?.debe_cambiar_password).toBe(false)
  })
})

describe('AuthContext: proyectos y proyecto activo', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    localStorage.clear()
    mocks.maybeSingle.mockResolvedValue({ data: hacerPerfil('u1') })
    mocks.proyectosRpc.mockResolvedValue({ data: [], error: null })
    mocks.proyectosInsert.mockResolvedValue({ error: null })
  })

  async function montarConProyectos() {
    const { AuthProvider, useAuth } = await import('@/context/AuthContext')

    let authCallback: AuthCallback = () => {}
    mocks.onAuthStateChange.mockImplementation((cb: AuthCallback) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    const valores: Array<{ proyectos: Proyecto[]; proyectoActivoId: string | null; ultimoProyectoId: string | null }> = []
    function Sonda() {
      const v = useAuth()
      valores.push({ proyectos: v.proyectos, proyectoActivoId: v.proyectoActivoId, ultimoProyectoId: v.ultimoProyectoId })
      return createElement('div', null)
    }
    render(createElement(AuthProvider, null, createElement(Sonda)))

    return {
      emitir: (e: string, s: Session | null) => authCallback(e, s),
      valores,
    }
  }

  it('ofrece el último proyecto como reanudable sin auto-activarlo', async () => {
    localStorage.setItem('proyecto-activo:u1', 'p1')
    mocks.proyectosRpc.mockResolvedValue({ data: [hacerProyecto('p1', 'Obra Alpha'), hacerProyecto('p2', 'Obra Beta')], error: null })

    const montaje = await montarConProyectos()
    await act(async () => {
      montaje.emitir('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })

    const ultimo = montaje.valores[montaje.valores.length - 1]
    expect(ultimo.proyectoActivoId).toBeNull()
    expect(ultimo.ultimoProyectoId).toBe('p1')
    expect(ultimo.proyectos.map(p => p.id)).toEqual(['p1', 'p2'])
  })

  it('cae al picker y limpia la clave cuando el proyecto persistido ya no es visible', async () => {
    localStorage.setItem('proyecto-activo:u1', 'p-fuera')
    mocks.proyectosRpc.mockResolvedValue({ data: [hacerProyecto('p1', 'Obra Uno')], error: null })

    const montaje = await montarConProyectos()
    await act(async () => {
      montaje.emitir('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })

    const ultimo = montaje.valores[montaje.valores.length - 1]
    expect(ultimo.proyectoActivoId).toBeNull()
    expect(ultimo.ultimoProyectoId).toBeNull()
    expect(localStorage.getItem('proyecto-activo:u1')).toBeNull()
  })

  it('sin clave persistida arranca en el picker', async () => {
    mocks.proyectosRpc.mockResolvedValue({ data: [hacerProyecto('p1', 'Obra Uno')], error: null })

    const montaje = await montarConProyectos()
    await act(async () => {
      montaje.emitir('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })

    expect(montaje.valores[montaje.valores.length - 1].proyectoActivoId).toBeNull()
  })

  it('cambiarProyecto persiste y volver al picker conserva el último proyecto', async () => {
    mocks.proyectosRpc.mockResolvedValue({ data: [hacerProyecto('p1', 'Obra Uno'), hacerProyecto('p2', 'Obra Dos')], error: null })
    let cambiar: (id: string | null) => void = () => {}
    const { AuthProvider, useAuth } = await import('@/context/AuthContext')
    function Sonda() {
      const v = useAuth()
      cambiar = v.cambiarProyecto
      return createElement('div', null)
    }
    render(createElement(AuthProvider, null, createElement(Sonda)))

    await act(async () => {
      mocks.onAuthStateChange.mock.calls[0][0]('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })

    act(() => cambiar('p2'))
    expect(localStorage.getItem('proyecto-activo:u1')).toBe('p2')

    act(() => cambiar(null))
    expect(localStorage.getItem('proyecto-activo:u1')).toBe('p2')
  })

  it('SIGNED_OUT conserva la clave para reanudar en el próximo login del mismo usuario', async () => {
    localStorage.setItem('proyecto-activo:u1', 'p1')
    mocks.proyectosRpc.mockResolvedValue({ data: [hacerProyecto('p1', 'Obra Uno')], error: null })

    const montaje = await montarConProyectos()
    await act(async () => {
      montaje.emitir('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })
    expect(localStorage.getItem('proyecto-activo:u1')).toBe('p1')

    await act(async () => {
      montaje.emitir('SIGNED_OUT', null)
      await Promise.resolve()
    })

    expect(localStorage.getItem('proyecto-activo:u1')).toBe('p1')
    expect(montaje.valores[montaje.valores.length - 1].proyectoActivoId).toBeNull()
  })

  it('crearProyecto inserta, refresca la lista y activa el nuevo proyecto', async () => {
    const idNuevo = '99999999-9999-9999-9999-999999999999'
    const spyRandom = vi.spyOn(crypto, 'randomUUID').mockReturnValue(idNuevo)
    mocks.proyectosRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [hacerProyecto(idNuevo, 'Obra Nueva')], error: null })

    let crear: (n: string, d?: string) => Promise<{ success: boolean; error?: string }> = async () => ({ success: true })
    const { AuthProvider, useAuth } = await import('@/context/AuthContext')
    const activos: Array<string | null> = []
    function Sonda() {
      const v = useAuth()
      crear = v.crearProyecto
      activos.push(v.proyectoActivoId)
      return createElement('div', null)
    }
    render(createElement(AuthProvider, null, createElement(Sonda)))

    await act(async () => {
      mocks.onAuthStateChange.mock.calls[0][0]('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })

    const resultado = await act(() => crear('Obra Nueva', 'descripción'))
    expect(resultado.success).toBe(true)
    expect(mocks.proyectosInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: idNuevo, nombre: 'Obra Nueva', descripcion: 'descripción' }),
    )
    expect(activos[activos.length - 1]).toBe(idNuevo)
    expect(localStorage.getItem('proyecto-activo:u1')).toBe(idNuevo)
    spyRandom.mockRestore()
  })
})
