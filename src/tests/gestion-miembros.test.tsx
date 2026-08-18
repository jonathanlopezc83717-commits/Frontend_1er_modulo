/**
 * Pruebas de GestionMiembros: listado del proyecto activo, alta/baja de
 * miembros y gating por rol (usuario no ve gestión — spec Req. Membership
 * Management). Ejecutar con: npx vitest run src/tests/gestion-miembros.test.tsx
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { createElement } from 'react'
import type { MiembroProyecto } from '@/lib/supabase-service'
import type { Perfil } from '@/types'

const mocks = vi.hoisted(() => ({
  perfil: null as Perfil | null,
  session: { user: { id: 'yo-1' } },
  proyectoActivoId: 'p1',
  miembros: [] as MiembroProyecto[],
  perfiles: [] as Perfil[],
  listarMiembrosProyecto: vi.fn(),
  listarPerfiles: vi.fn(),
  agregarMiembroProyecto: vi.fn(),
  quitarMiembroProyecto: vi.fn(),
  invitarUsuario: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    session: mocks.session,
    perfil: mocks.perfil,
    proyectos: [],
    proyectoActivoId: mocks.proyectoActivoId,
    cargando: false,
    login: vi.fn(),
    logout: vi.fn(),
    refrescarPerfil: vi.fn(),
    crearProyecto: vi.fn(),
    cambiarProyecto: vi.fn(),
  }),
}))

vi.mock('@/lib/supabase-service', () => ({
  listarMiembrosProyecto: mocks.listarMiembrosProyecto,
  listarPerfiles: mocks.listarPerfiles,
  agregarMiembroProyecto: mocks.agregarMiembroProyecto,
  quitarMiembroProyecto: mocks.quitarMiembroProyecto,
  invitarUsuario: mocks.invitarUsuario,
  listarProyectos: vi.fn(),
  crearProyecto: vi.fn(),
}))

import { GestionMiembros } from '@/components/projects/GestionMiembros'

Element.prototype.scrollIntoView = () => {}

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

function hacerMiembro(userId: string, email: string | null): MiembroProyecto {
  return {
    user_id: userId,
    creado_por: 'yo-1',
    creado_en: '2026-01-01T00:00:00Z',
    email,
    nombre: null,
    rol: 'usuario',
  }
}

function montar() {
  return render(
    createElement(GestionMiembros, { open: true, onOpenChange: vi.fn() })
  )
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.proyectoActivoId = 'p1'
  mocks.miembros = [hacerMiembro('yo-1', 'yo@test.local'), hacerMiembro('u2', 'u2@test.local')]
  mocks.perfiles = [hacerPerfil('administrador', 'yo-1'), hacerPerfil('usuario', 'u2')]
  mocks.listarMiembrosProyecto.mockResolvedValue(mocks.miembros)
  mocks.listarPerfiles.mockResolvedValue(mocks.perfiles)
  mocks.agregarMiembroProyecto.mockResolvedValue({ success: true })
  mocks.quitarMiembroProyecto.mockResolvedValue({ success: true })
  mocks.invitarUsuario.mockResolvedValue({
    success: true,
    passwordTemporal: 'TempPass123',
    userId: 'u9',
  })
})

describe('GestionMiembros: listado y gating', () => {
  it('lista los miembros del proyecto activo con email y rol', async () => {
    mocks.perfil = hacerPerfil('administrador', 'yo-1')

    const { findByText } = montar()

    expect(await findByText('yo-1@test.local')).toBeTruthy()
    expect(await findByText('u2@test.local')).toBeTruthy()
    expect(await findByText('administrador')).toBeTruthy()
    expect(await findByText('usuario')).toBeTruthy()
    expect(mocks.listarMiembrosProyecto).toHaveBeenCalledWith('p1')
  })

  it('usuario no ve gestión de miembros aunque el diálogo esté abierto', async () => {
    mocks.perfil = hacerPerfil('usuario', 'yo-1')

    const { queryByText } = montar()

    expect(mocks.listarMiembrosProyecto).not.toHaveBeenCalled()
    expect(queryByText('Miembros del proyecto')).toBeNull()
  })

  it('general ve la gestión pero no el selector de usuarios existentes', async () => {
    mocks.perfil = hacerPerfil('general', 'yo-1')

    const { findByText, queryByRole } = montar()

    expect(await findByText('u2@test.local')).toBeTruthy()
    expect(mocks.listarPerfiles).not.toHaveBeenCalled()
    expect(queryByRole('combobox', { name: 'Usuario a agregar' })).toBeNull()
    expect(queryByRole('button', { name: /Invitar usuario nuevo/ })).toBeTruthy()
  })

  it('miembro sin email visible (RLS de perfiles) muestra fallback por id', async () => {
    mocks.perfil = hacerPerfil('general', 'yo-1')
    mocks.listarMiembrosProyecto.mockResolvedValue([hacerMiembro('abc12345-def', null)])

    const { findByText } = montar()

    expect(await findByText('Miembro abc12345')).toBeTruthy()
  })
})

describe('GestionMiembros: acciones', () => {
  it('quitar miembro llama al servicio y recarga la lista', async () => {
    mocks.perfil = hacerPerfil('administrador', 'yo-1')

    const { findByTestId } = montar()
    const filaU2 = await findByTestId('miembro-u2')

    fireEvent.click(within(filaU2).getByRole('button', { name: /Quitar del proyecto/ }))
    await waitFor(() => {
      expect(mocks.quitarMiembroProyecto).toHaveBeenCalledWith('p1', 'u2')
    })
    await waitFor(() => {
      expect(mocks.listarMiembrosProyecto).toHaveBeenCalledTimes(2)
    })
  })

  it('admin agrega un usuario existente como miembro', async () => {
    mocks.perfil = hacerPerfil('administrador', 'yo-1')
    mocks.perfiles.push(hacerPerfil('general', 'u3'))

    const { findByText, getByRole } = montar()
    await findByText('Elegir usuario')

    fireEvent.click(getByRole('combobox', { name: 'Usuario a agregar' }))
    const opcion = await waitFor(() => {
      const opciones = document.querySelectorAll('[role="option"]')
      expect(opciones.length).toBeGreaterThan(0)
      return opciones[0]
    })
    fireEvent.click(opcion)
    fireEvent.click(getByRole('button', { name: 'Agregar' }))

    await waitFor(() => {
      expect(mocks.agregarMiembroProyecto).toHaveBeenCalledWith('p1', 'u3', 'yo-1')
    })
  })

  it('abre el diálogo de invitación desde la gestión', async () => {
    mocks.perfil = hacerPerfil('general', 'yo-1')

    const { findByRole, findByText } = montar()

    fireEvent.click(await findByRole('button', { name: /Invitar usuario nuevo/ }))

    expect(await findByText('Invitar usuario')).toBeTruthy()
  })
})
