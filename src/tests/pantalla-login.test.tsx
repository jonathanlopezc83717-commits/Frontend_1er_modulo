// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { Perfil } from '@/types'

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  updatePerfil: vi.fn(),
  eq: vi.fn(),
  login: vi.fn(),
  refrescarPerfil: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { updateUser: mocks.updateUser },
    from: vi.fn(() => ({
      update: (payload: unknown) => {
        mocks.updatePerfil(payload)
        return { eq: mocks.eq }
      },
    })),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1', email: 'u1@test.local' } },
    perfil: hacerPerfilBase(),
    cargando: false,
    login: mocks.login,
    logout: vi.fn(),
    refrescarPerfil: mocks.refrescarPerfil,
  }),
}))

function hacerPerfilBase(): Perfil {
  return {
    id: 'u1',
    email: 'u1@test.local',
    nombre: null,
    rol: 'usuario',
    debe_cambiar_password: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

async function montar(modo?: 'login' | 'primer-acceso') {
  const { PantallaLogin } = await import('@/components/auth/PantallaLogin')
  const utils = render(createElement(PantallaLogin, modo ? { modo } : null))
  return utils
}

describe('PantallaLogin modo login', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renderiza email + contraseña y llama login con las credenciales', async () => {
    mocks.login.mockResolvedValue({ error: null })
    const { getByLabelText, getByText } = await montar()

    await act(async () => {
      fireEvent.change(getByLabelText('Correo electrónico'), { target: { value: 'op@test.local' } })
      fireEvent.change(getByLabelText('Contraseña'), { target: { value: 'secreta1' } })
      fireEvent.click(getByText('Ingresar'))
    })

    expect(mocks.login).toHaveBeenCalledWith('op@test.local', 'secreta1')
  })

  it('muestra el mensaje genérico ante credenciales inválidas (anti-enumeración)', async () => {
    mocks.login.mockResolvedValue({ error: 'Credenciales inválidas' })
    const { getByLabelText, getByText, findByRole } = await montar()

    await act(async () => {
      fireEvent.change(getByLabelText('Correo electrónico'), { target: { value: 'op@test.local' } })
      fireEvent.change(getByLabelText('Contraseña'), { target: { value: 'mala' } })
      fireEvent.click(getByText('Ingresar'))
    })

    expect((await findByRole('alert')).textContent).toContain('Credenciales inválidas')
  })
})

describe('PantallaLogin modo primer-acceso', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mocks.eq.mockResolvedValue({ error: null })
  })

  it('rechaza contraseñas que no coinciden sin llamar a updateUser', async () => {
    const { getByLabelText, getByText, findByRole } = await montar('primer-acceso')

    await act(async () => {
      fireEvent.change(getByLabelText('Nueva contraseña'), { target: { value: 'nueva123' } })
      fireEvent.change(getByLabelText('Confirmar contraseña'), { target: { value: 'distinta' } })
      fireEvent.click(getByText('Guardar contraseña'))
    })

    expect((await findByRole('alert')).textContent).toContain('Las contraseñas no coinciden')
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('rechaza contraseñas menores al mínimo (6)', async () => {
    const { getByLabelText, getByText, findByRole } = await montar('primer-acceso')

    await act(async () => {
      fireEvent.change(getByLabelText('Nueva contraseña'), { target: { value: 'abc' } })
      fireEvent.change(getByLabelText('Confirmar contraseña'), { target: { value: 'abc' } })
      fireEvent.click(getByText('Guardar contraseña'))
    })

    expect((await findByRole('alert')).textContent).toContain('al menos 6 caracteres')
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('actualiza contraseña, limpia debe_cambiar_password y refresca el perfil', async () => {
    mocks.updateUser.mockResolvedValue({ error: null })
    const { getByLabelText, getByText } = await montar('primer-acceso')

    await act(async () => {
      fireEvent.change(getByLabelText('Nueva contraseña'), { target: { value: 'nueva123' } })
      fireEvent.change(getByLabelText('Confirmar contraseña'), { target: { value: 'nueva123' } })
      fireEvent.click(getByText('Guardar contraseña'))
    })

    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'nueva123' })
      expect(mocks.updatePerfil).toHaveBeenCalledWith({ debe_cambiar_password: false })
      expect(mocks.eq).toHaveBeenCalledWith('id', 'u1')
      expect(mocks.refrescarPerfil).toHaveBeenCalled()
    })
  })

  it('ante fallo de updateUser muestra error y no limpia el flag', async () => {
    mocks.updateUser.mockResolvedValue({ error: new Error('weak password') })
    const { getByLabelText, getByText, findByRole } = await montar('primer-acceso')

    await act(async () => {
      fireEvent.change(getByLabelText('Nueva contraseña'), { target: { value: 'nueva123' } })
      fireEvent.change(getByLabelText('Confirmar contraseña'), { target: { value: 'nueva123' } })
      fireEvent.click(getByText('Guardar contraseña'))
    })

    expect((await findByRole('alert')).textContent).toContain('No se pudo actualizar la contraseña')
    expect(mocks.updatePerfil).not.toHaveBeenCalled()
    expect(mocks.refrescarPerfil).not.toHaveBeenCalled()
  })
})
