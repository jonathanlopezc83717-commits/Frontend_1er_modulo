// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { Perfil, Proyecto } from '@/types'

const mocks = vi.hoisted(() => ({
  crearProyecto: vi.fn().mockResolvedValue({ success: true }),
  cambiarProyecto: vi.fn(),
  logout: vi.fn(),
  actualizarColeccion: vi.fn(),
  eliminarColeccion: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  proyectos: [] as Proyecto[],
  perfil: null as Perfil | null,
  session: null as { user: { id: string } } | null,
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    session: mocks.session,
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

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: vi.fn(() => ({ data: mocks.proyectos, isLoading: false })),
}))

vi.mock('@/lib/collections', () => ({
  proyectosCollection: {
    insert: vi.fn(),
    update: mocks.actualizarColeccion,
    delete: mocks.eliminarColeccion,
  },
  perfilesCollection: { utils: { refetch: vi.fn() } },
  getMiembrosCollection: vi.fn(() => ({ utils: { refetch: vi.fn() } })),
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

vi.mock('@/components/projects/GestionMiembros', () => ({
  GestionMiembros: ({ open, proyectoId }: { open: boolean; proyectoId?: string }) =>
    open ? createElement('div', { 'data-testid': 'gestion-miembros', 'data-proyecto-id': proyectoId }) : null,
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

function hacerProyecto(id: string, nombre: string, extra: Partial<Proyecto> = {}): Proyecto {
  return {
    id,
    nombre,
    descripcion: null,
    creado_por: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.crearProyecto.mockResolvedValue({ success: true })
  mocks.actualizarColeccion.mockReturnValue({ isPersisted: { promise: Promise.resolve() } })
  mocks.eliminarColeccion.mockReturnValue({ isPersisted: { promise: Promise.resolve() } })
  mocks.proyectos = []
  mocks.perfil = hacerPerfil('usuario')
  mocks.session = null
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

describe('SelectorProyectos: tarjetas enriquecidas', () => {
  it('muestra miembros con tooltip de emails, creación y actividad en todas las tarjetas', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [
      hacerProyecto('p1', 'Obra Uno', {
        updated_at: new Date().toISOString(),
        miembros_count: 3,
        miembros_emails: ['a@test.local', 'b@test.local'],
      }),
    ]

    const { getByText, getByTitle } = render(createElement(SelectorProyectos))

    expect(getByText(/Creada .+ · Actividad hace/)).toBeTruthy()
    const badge = getByTitle('a@test.local, b@test.local')
    expect(badge.textContent).toContain('3')
  })

  it('usuario sin permisos de gestión no ve acciones por tarjeta', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno', { creado_por: 'otro' })]

    const { queryByTitle } = render(createElement(SelectorProyectos))

    expect(queryByTitle('Editar')).toBeNull()
    expect(queryByTitle('Miembros')).toBeNull()
    expect(queryByTitle('Eliminar')).toBeNull()
  })

  it('general dueño del proyecto ve las acciones de gestión', () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByTitle } = render(createElement(SelectorProyectos))

    expect(getByTitle('Editar')).toBeTruthy()
    expect(getByTitle('Miembros')).toBeTruthy()
    expect(getByTitle('Eliminar')).toBeTruthy()
  })

  it('general no dueño no ve acciones de gestión', () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Ajena', { creado_por: 'otro' })]

    const { queryByTitle } = render(createElement(SelectorProyectos))

    expect(queryByTitle('Editar')).toBeNull()
    expect(queryByTitle('Miembros')).toBeNull()
    expect(queryByTitle('Eliminar')).toBeNull()
  })

  it('administrador ve acciones en cualquier tarjeta', () => {
    mocks.perfil = hacerPerfil('administrador')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Ajena', { creado_por: 'otro' })]

    const { getByTitle } = render(createElement(SelectorProyectos))

    expect(getByTitle('Editar')).toBeTruthy()
    expect(getByTitle('Eliminar')).toBeTruthy()
  })

  it('abre la gestión de miembros del proyecto de la tarjeta', () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByTitle, getByTestId } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTitle('Miembros'))

    expect(getByTestId('gestion-miembros').getAttribute('data-proyecto-id')).toBe('p1')
  })
})

describe('SelectorProyectos: edición', () => {
  it('edita nombre y descripción vía la colección', async () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno', { descripcion: 'desc vieja' })]

    const { getByTitle, findByRole, getByRole } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTitle('Editar'))
    const input = await findByRole('textbox', { name: /Nombre/ })
    expect((input as HTMLInputElement).value).toBe('Obra Uno')
    fireEvent.change(input, { target: { value: 'Obra Renombrada' } })
    fireEvent.click(getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(mocks.actualizarColeccion).toHaveBeenCalledWith('p1', expect.any(Function))
    })
  })
})

describe('SelectorProyectos: eliminación con confirmación', () => {
  it('confirma con el conteo de puntos y elimina vía la colección', async () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno', { puntos_count: 7 })]

    const { getByTitle, getByText, getByTestId } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTitle('Eliminar'))
    expect(getByText(/Se ocultará el proyecto con sus 7 puntos/)).toBeTruthy()
    expect(getByText(/un administrador puede recuperarlo/)).toBeTruthy()

    fireEvent.click(getByTestId('confirmar-eliminacion'))

    await waitFor(() => {
      expect(mocks.eliminarColeccion).toHaveBeenCalledWith('p1')
    })
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Proyecto eliminado')
    })
  })

  it('el rechazo del permiso surfacea el error en español como toast', async () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]
    mocks.eliminarColeccion.mockReturnValue({
      isPersisted: {
        promise: Promise.reject(new Error('No tenés permiso para eliminar este proyecto')),
      },
    })

    const { getByTitle, getByTestId } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTitle('Eliminar'))
    fireEvent.click(getByTestId('confirmar-eliminacion'))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('No tenés permiso para eliminar este proyecto')
    })
  })
})
