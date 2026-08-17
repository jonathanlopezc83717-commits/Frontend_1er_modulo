// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Perfil } from '@/types'

const mocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
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

function hacerPerfil(debeCambiar: boolean): Perfil {
  return {
    id: 'u1',
    email: 'u1@test.local',
    nombre: null,
    rol: 'usuario',
    debe_cambiar_password: debeCambiar,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

async function montarGate() {
  const { AuthProvider } = await import('@/context/AuthContext')
  const { AuthGate } = await import('@/components/auth/AuthGate')

  let authCallback: (event: string, session: Session | null) => void = () => {}
  mocks.onAuthStateChange.mockImplementation((cb: typeof authCallback) => {
    authCallback = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })

  const utils = render(
    createElement(
      AuthProvider,
      null,
      createElement(AuthGate, null, createElement('div', { 'data-testid': 'app' }, 'APLICACION')),
    ),
  )
  return {
    ...utils,
    emitir: (event: string, session: Session | null) => authCallback(event, session),
  }
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AuthGate: 4 estados de render', () => {
  it('estado 1 — cargando: muestra el loader mientras no llega el evento inicial', async () => {
    const { queryByTestId, findByText } = await montarGate()
    expect(queryByTestId('app')).toBeNull()
    expect(await findByText('Verificando sesión...')).toBeTruthy()
  })

  it('estado 2 — sin sesión: muestra la pantalla de login', async () => {
    const { emitir, findByText, queryByTestId } = await montarGate()

    await act(async () => {
      emitir('INITIAL_SESSION', null)
      await Promise.resolve()
    })

    expect(await findByText('Iniciar sesión')).toBeTruthy()
    expect(queryByTestId('app')).toBeNull()
  })

  it('estado 3 — debe_cambiar_password: muestra primer-acceso (restaurando sesión)', async () => {
    const { emitir, findByText, queryByTestId } = await montarGate()
    mocks.maybeSingle.mockResolvedValue({ data: hacerPerfil(true) })

    await act(async () => {
      emitir('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })

    expect(await findByText('Establezca su contraseña')).toBeTruthy()
    expect(queryByTestId('app')).toBeNull()
  })

  it('estado 4 — sesión restaurada con perfil completo: renderiza la app', async () => {
    const { emitir, getByTestId, queryByText } = await montarGate()
    mocks.maybeSingle.mockResolvedValue({ data: hacerPerfil(false) })

    await act(async () => {
      emitir('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(getByTestId('app').textContent).toBe('APLICACION')
    })
    expect(queryByText('Iniciar sesión')).toBeNull()
  })

  it('logout (SIGNED_OUT) devuelve al login', async () => {
    const { emitir, findByText, getByTestId } = await montarGate()
    mocks.maybeSingle.mockResolvedValue({ data: hacerPerfil(false) })

    await act(async () => {
      emitir('INITIAL_SESSION', hacerSession('u1'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(getByTestId('app')).toBeTruthy()
    })

    await act(async () => {
      emitir('SIGNED_OUT', null)
      await Promise.resolve()
    })
    expect(await findByText('Iniciar sesión')).toBeTruthy()
  })
})
