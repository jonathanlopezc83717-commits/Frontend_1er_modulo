// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { Perfil, Proyecto } from '@/types'

const mocks = vi.hoisted(() => ({
  crearProyecto: vi.fn().mockResolvedValue({ success: true }),
  cambiarProyecto: vi.fn(),
  logout: vi.fn(),
  proyectos: [] as Proyecto[],
  perfil: null as Perfil | null,
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    perfil: mocks.perfil,
    proyectos: mocks.proyectos,
    proyectoActivoId: null,
    cargando: false,
    login: vi.fn(),
    logout: mocks.logout,
    refrescarPerfil: vi.fn(),
    crearProyecto: mocks.crearProyecto,
    cambiarProyecto: mocks.cambiarProyecto,
  }),
}))

import { SelectorProyectos } from '@/components/projects/SelectorProyectos'

function hacerPerfil(rol: Perfil['rol']): Perfil {
  return {
    id: 'u1',
    email: 'u1@test.local',
    nombre: null,
    rol,
    debe_cambiar_password: false,
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

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.crearProyecto.mockResolvedValue({ success: true })
  mocks.proyectos = []
  mocks.perfil = hacerPerfil('usuario')
})

describe('SelectorProyectos: visibilidad por rol', () => {
  it('usuario sin asignaciones ve el estado vacío con guía para contactar un administrador', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = []

    const { getByText, queryByRole } = render(createElement(SelectorProyectos))

    expect(getByText('No tenés proyectos asignados')).toBeTruthy()
    expect(getByText(/Contactá a un administrador/)).toBeTruthy()
    expect(queryByRole('button', { name: /Proyecto nuevo/ })).toBeNull()
  })

  it('usuario con proyectos los lista, sin acción de proyecto nuevo', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno'), hacerProyecto('p2', 'Obra Dos')]

    const { getByText, queryByRole } = render(createElement(SelectorProyectos))

    expect(getByText('Obra Uno')).toBeTruthy()
    expect(getByText('Obra Dos')).toBeTruthy()
    expect(queryByRole('button', { name: /Proyecto nuevo/ })).toBeNull()
  })

  it('elegir un proyecto llama a cambiarProyecto con su id', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByTestId } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))
    expect(mocks.cambiarProyecto).toHaveBeenCalledWith('p1')
  })

  it('general ve la acción de proyecto nuevo', () => {
    mocks.perfil = hacerPerfil('general')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByRole } = render(createElement(SelectorProyectos))

    expect(getByRole('button', { name: /Proyecto nuevo/ })).toBeTruthy()
  })

  it('general crea un proyecto desde el diálogo', async () => {
    mocks.perfil = hacerPerfil('general')
    mocks.proyectos = []

    const { getByRole, findByRole } = render(createElement(SelectorProyectos))

    fireEvent.click(getByRole('button', { name: /Proyecto nuevo/ }))

    const input = await findByRole('textbox', { name: /Nombre/ })
    fireEvent.change(input, { target: { value: 'Obra Norte' } })
    fireEvent.click(getByRole('button', { name: 'Crear proyecto' }))

    await waitFor(() => {
      expect(mocks.crearProyecto).toHaveBeenCalledWith('Obra Norte', '')
    })
  })

  it('muestra el error y mantiene el diálogo cuando la creación falla', async () => {
    mocks.perfil = hacerPerfil('general')
    mocks.proyectos = []
    mocks.crearProyecto.mockResolvedValue({ success: false, error: 'RLS: rol no autorizado' })

    const { getByRole, findByRole, getByText } = render(createElement(SelectorProyectos))

    fireEvent.click(getByRole('button', { name: /Proyecto nuevo/ }))
    const input = await findByRole('textbox', { name: /Nombre/ })
    fireEvent.change(input, { target: { value: 'Obra Ilegal' } })
    fireEvent.click(getByRole('button', { name: 'Crear proyecto' }))

    expect(await findByRole('button', { name: 'Crear proyecto' })).toBeTruthy()
    expect(getByText('RLS: rol no autorizado')).toBeTruthy()
  })

  it('cerrar sesión está disponible desde el picker', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = []

    const { getByRole } = render(createElement(SelectorProyectos))

    fireEvent.click(getByRole('button', { name: /Cerrar sesión/ }))
    expect(mocks.logout).toHaveBeenCalled()
  })
})
