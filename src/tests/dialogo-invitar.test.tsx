/**
 * Pruebas de DialogoInvitar: gating de rol por perfil (decisión vinculante:
 * general solo rol usuario), password temporal mostrado una sola vez y
 * mapeo de errores 409/403 de la edge function invite-user.
 * Ejecutar con: npx vitest run src/tests/dialogo-invitar.test.tsx
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { Perfil } from '@/types'

const mocks = vi.hoisted(() => ({
  perfil: null as Perfil | null,
  session: null as { user: { id: string } } | null,
  invitarUsuario: vi.fn(),
  agregarMiembroProyecto: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    session: mocks.session,
    perfil: mocks.perfil,
    proyectos: [],
    proyectoActivoId: 'p1',
    cargando: false,
    login: vi.fn(),
    logout: vi.fn(),
    refrescarPerfil: vi.fn(),
    crearProyecto: vi.fn(),
    cambiarProyecto: vi.fn(),
  }),
}))

vi.mock('@/lib/supabase-service', () => ({
  invitarUsuario: mocks.invitarUsuario,
  agregarMiembroProyecto: mocks.agregarMiembroProyecto,
}))

import { DialogoInvitar } from '@/components/projects/DialogoInvitar'

Element.prototype.scrollIntoView = () => {}

const clipboardWriteText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: clipboardWriteText },
  configurable: true,
})

function hacerPerfil(rol: Perfil['rol'], id: string): Perfil {
  return {
    id,
    email: `${id}@test.local`,
    nombre: null,
    rol,
    debe_cambiar_password: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function montar(onInvitado?: () => void) {
  return render(
    createElement(DialogoInvitar, {
      open: true,
      onOpenChange: vi.fn(),
      proyectoId: 'p1',
      onInvitado,
    })
  )
}

async function invitar(getByRole: (role: string, options?: Record<string, unknown>) => HTMLElement) {
  fireEvent.change(getByRole('textbox', { name: /Email/ }), {
    target: { value: 'nuevo@test.local' },
  })
  fireEvent.click(getByRole('button', { name: 'Invitar' }))
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  clipboardWriteText.mockClear()
  mocks.session = { user: { id: 'admin-1' } }
  mocks.perfil = hacerPerfil('administrador', 'admin-1')
  mocks.invitarUsuario.mockResolvedValue({
    success: true,
    passwordTemporal: 'TempPass123',
    userId: 'u9',
  })
  mocks.agregarMiembroProyecto.mockResolvedValue({ success: true })
})

describe('DialogoInvitar: gating de rol', () => {
  it('administrador ve el selector con los tres roles', async () => {
    mocks.perfil = hacerPerfil('administrador', 'admin-1')

    const { getByRole, findAllByRole } = montar()

    fireEvent.click(getByRole('combobox', { name: 'Rol inicial' }))
    const opciones = await findAllByRole('option')
    expect(opciones.map((o) => o.textContent)).toEqual(['Administrador', 'Administrador de equipo', 'Usuario'])
  })

  it('general no ve selector: rol fijo usuario y la invitación viaja con ese rol', async () => {
    mocks.perfil = hacerPerfil('general', 'g-1')

    const { getByRole, queryByRole, getByText } = montar()

    expect(queryByRole('combobox')).toBeNull()
    expect(getByText('usuario')).toBeTruthy()
    await invitar(getByRole)

    await waitFor(() => {
      expect(mocks.invitarUsuario).toHaveBeenCalledWith('nuevo@test.local', 'usuario')
    })
  })
})

describe('DialogoInvitar: resultado y errores', () => {
  it('muestra el password temporal una sola vez con advertencia y copia al portapapeles', async () => {
    const { getByRole, getByTestId, getByText } = montar()

    await invitar(getByRole)

    expect(await waitFor(() => getByTestId('password-temporal'))).toBeTruthy()
    expect(getByTestId('password-temporal').textContent).toBe('TempPass123')
    expect(getByText(/Se muestra una sola vez/)).toBeTruthy()
    expect(mocks.agregarMiembroProyecto).toHaveBeenCalledWith('p1', 'u9', 'admin-1')

    fireEvent.click(getByRole('button', { name: /Copiar password/ }))
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('TempPass123')
    })
  })

  it('error 409 (usuario existente) muestra el mensaje del servidor y mantiene el diálogo', async () => {
    mocks.invitarUsuario.mockResolvedValue({
      success: false,
      error: 'Ya existe un usuario con ese email',
    })

    const { getByRole, findByRole, getByText } = montar()

    await invitar(getByRole)

    expect(await findByRole('alert')).toBeTruthy()
    expect(getByText('Ya existe un usuario con ese email')).toBeTruthy()
    expect(getByRole('button', { name: 'Invitar' })).toBeTruthy()
  })

  it('error 403 (guard de rol) muestra el mensaje de la edge function', async () => {
    mocks.invitarUsuario.mockResolvedValue({
      success: false,
      error: 'Un general solo puede invitar con rol usuario',
    })

    const { getByRole, getByText } = montar()

    await invitar(getByRole)

    await waitFor(() => {
      expect(getByText('Un general solo puede invitar con rol usuario')).toBeTruthy()
    })
  })

  it('si falla la asignación al proyecto, el password igual se muestra con aviso', async () => {
    mocks.agregarMiembroProyecto.mockResolvedValue({
      success: false,
      error: 'RLS: no autorizado',
    })

    const { getByRole, getByTestId } = montar()

    await invitar(getByRole)

    expect(await waitFor(() => getByTestId('password-temporal'))).toBeTruthy()
  })

  it('notifica a onInvitado cuando la invitación tiene éxito', async () => {
    const onInvitado = vi.fn()
    const { getByRole } = montar(onInvitado)

    await invitar(getByRole)

    await waitFor(() => {
      expect(onInvitado).toHaveBeenCalled()
    })
  })
})
