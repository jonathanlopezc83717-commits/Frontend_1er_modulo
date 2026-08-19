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
  ultimoProyectoId: null as string | null,
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    session: mocks.session,
    perfil: mocks.perfil,
    proyectos: mocks.proyectos,
    proyectoActivoId: null,
    ultimoProyectoId: mocks.ultimoProyectoId,
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

vi.mock('@/components/projects/SeccionMiembros', () => ({
  SeccionMiembros: ({ proyectoId, soloLectura }: { proyectoId: string; soloLectura?: boolean }) =>
    createElement('div', {
      'data-testid': 'seccion-miembros',
      'data-proyecto-id': proyectoId,
      'data-solo-lectura': String(soloLectura ?? false),
    }),
}))

vi.mock('@/components/projects/PanelUsuarios', () => ({
  PanelUsuarios: () => createElement('div', { 'data-testid': 'panel-usuarios' }),
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
  mocks.ultimoProyectoId = null
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

  it('usuario con proyectos los lista en la barra lateral, sin acción de proyecto nuevo', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno'), hacerProyecto('p2', 'Obra Dos')]

    const { getByTestId, queryByRole } = render(createElement(SelectorProyectos))

    expect(getByTestId('proyecto-p1')).toBeTruthy()
    expect(getByTestId('proyecto-p2')).toBeTruthy()
    expect(queryByRole('button', { name: /Proyecto nuevo/ })).toBeNull()
  })

  it('enfocar un proyecto no abre la app; doble clic llama a cambiarProyecto', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByTestId, getByRole } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))
    expect(mocks.cambiarProyecto).not.toHaveBeenCalled()
    expect(getByRole('heading', { name: 'Obra Uno' })).toBeTruthy()

    fireEvent.doubleClick(getByTestId('proyecto-p1'))
    expect(mocks.cambiarProyecto).toHaveBeenCalledTimes(1)
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

    const { getAllByRole, getByRole, findByRole } = render(createElement(SelectorProyectos))

    fireEvent.click(getAllByRole('button', { name: /Proyecto nuevo/ })[0])

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

    const { getAllByRole, getByRole, findByRole, getByText } = render(createElement(SelectorProyectos))

    fireEvent.click(getAllByRole('button', { name: /Proyecto nuevo/ })[0])
    const input = await findByRole('textbox', { name: /Nombre/ })
    fireEvent.change(input, { target: { value: 'Obra Ilegal' } })
    fireEvent.click(getByRole('button', { name: 'Crear proyecto' }))

    expect(await findByRole('button', { name: 'Crear proyecto' })).toBeTruthy()
    expect(getByText('RLS: rol no autorizado')).toBeTruthy()
  })

  it('cerrar sesión está disponible desde el workspace', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = []

    const { getByRole } = render(createElement(SelectorProyectos))

    fireEvent.click(getByRole('button', { name: /Cerrar sesión/ }))
    expect(mocks.logout).toHaveBeenCalled()
  })
})

describe('SelectorProyectos: búsqueda', () => {
  it('filtra la lista por nombre y descripción sin distinguir mayúsculas', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [
      hacerProyecto('p1', 'Obra Norte', { descripcion: 'Viaducto' }),
      hacerProyecto('p2', 'Puente Sur'),
    ]

    const { getByLabelText, getByTestId, queryByTestId, getByText } =
      render(createElement(SelectorProyectos))

    fireEvent.change(getByLabelText('Buscar proyectos'), { target: { value: 'OBRA' } })
    expect(getByTestId('proyecto-p1')).toBeTruthy()
    expect(queryByTestId('proyecto-p2')).toBeNull()

    fireEvent.change(getByLabelText('Buscar proyectos'), { target: { value: 'viaducto' } })
    expect(getByTestId('proyecto-p1')).toBeTruthy()
    expect(queryByTestId('proyecto-p2')).toBeNull()

    fireEvent.change(getByLabelText('Buscar proyectos'), { target: { value: 'sur' } })
    expect(queryByTestId('proyecto-p1')).toBeNull()
    expect(getByTestId('proyecto-p2')).toBeTruthy()

    fireEvent.change(getByLabelText('Buscar proyectos'), { target: { value: 'zzz' } })
    expect(queryByTestId('proyecto-p1')).toBeNull()
    expect(queryByTestId('proyecto-p2')).toBeNull()
    expect(getByText('Ningún proyecto coincide con la búsqueda.')).toBeTruthy()
  })
})

describe('SelectorProyectos: panel de detalle', () => {
  it('muestra meta con miembros y tooltip de emails del proyecto enfocado', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [
      hacerProyecto('p1', 'Obra Uno', {
        updated_at: new Date().toISOString(),
        miembros_count: 3,
        miembros_emails: ['a@test.local', 'b@test.local'],
      }),
    ]

    const { getByTestId, getByText, getByTitle } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))

    expect(getByText(/Creada .+ · Actividad hace/)).toBeTruthy()
    const badge = getByTitle('a@test.local, b@test.local')
    expect(badge.textContent).toContain('3')
  })

  it('sin proyecto enfocado muestra el aviso de selección', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByText } = render(createElement(SelectorProyectos))

    expect(getByText(/Elegí un proyecto para ver su detalle/)).toBeTruthy()
  })

  it('usuario sin permisos de gestión ve meta y miembros en solo lectura, sin acciones', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno', { creado_por: 'otro' })]

    const { getByTestId, getByRole, queryByTitle } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))

    expect(queryByTitle('Editar')).toBeNull()
    expect(queryByTitle('Eliminar')).toBeNull()
    expect(getByRole('heading', { name: 'Obra Uno' })).toBeTruthy()
    const seccion = getByTestId('seccion-miembros')
    expect(seccion.getAttribute('data-proyecto-id')).toBe('p1')
    expect(seccion.getAttribute('data-solo-lectura')).toBe('true')
  })

  it('general dueño del proyecto ve las acciones de gestión y miembros editables', () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByTestId, getByTitle } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))

    expect(getByTitle('Editar')).toBeTruthy()
    expect(getByTitle('Eliminar')).toBeTruthy()
    expect(getByTestId('seccion-miembros').getAttribute('data-solo-lectura')).toBe('false')
  })

  it('general no dueño no ve acciones de gestión', () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Ajena', { creado_por: 'otro' })]

    const { getByTestId, queryByTitle } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))

    expect(queryByTitle('Editar')).toBeNull()
    expect(queryByTitle('Eliminar')).toBeNull()
  })

  it('administrador ve acciones en cualquier proyecto', () => {
    mocks.perfil = hacerPerfil('administrador')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Ajena', { creado_por: 'otro' })]

    const { getByTestId, getByTitle } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))

    expect(getByTitle('Editar')).toBeTruthy()
    expect(getByTitle('Eliminar')).toBeTruthy()
  })
})

describe('SelectorProyectos: vista de administración', () => {
  it('admin alterna entre la vista de proyectos y la de usuarios y roles', () => {
    mocks.perfil = hacerPerfil('administrador')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByRole, getByTestId, queryByRole, queryByTestId } = render(createElement(SelectorProyectos))

    expect(queryByTestId('panel-usuarios')).toBeNull()

    fireEvent.click(getByRole('button', { name: /Usuarios y roles/ }))
    expect(getByTestId('panel-usuarios')).toBeTruthy()
    expect(queryByRole('heading', { name: 'Obra Uno' })).toBeNull()

    fireEvent.click(getByRole('button', { name: /Usuarios y roles/ }))
    expect(queryByTestId('panel-usuarios')).toBeNull()
  })

  it('usuario no ve el toggle de administración', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { queryByRole, queryByTestId } = render(createElement(SelectorProyectos))

    expect(queryByRole('button', { name: /Usuarios y roles/ })).toBeNull()
    expect(queryByTestId('panel-usuarios')).toBeNull()
  })

  it('enfocar un proyecto desde la vista de usuarios vuelve a la vista de proyectos', () => {
    mocks.perfil = hacerPerfil('administrador')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByRole, getByTestId } = render(createElement(SelectorProyectos))

    fireEvent.click(getByRole('button', { name: /Usuarios y roles/ }))
    expect(getByTestId('panel-usuarios')).toBeTruthy()

    fireEvent.click(getByTestId('proyecto-p1'))
    expect(getByRole('heading', { name: 'Obra Uno' })).toBeTruthy()
  })
})

describe('SelectorProyectos: edición', () => {
  it('edita nombre y descripción vía la colección', async () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno', { descripcion: 'desc vieja' })]

    const { getByTestId, getByTitle, findByRole, getByRole } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))
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

describe('SelectorProyectos: banner de reanudación', () => {
  it('muestra la última sesión con la pista de doble clic', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno'), hacerProyecto('p2', 'Obra Dos')]
    mocks.ultimoProyectoId = 'p2'

    const { getByTestId } = render(createElement(SelectorProyectos))

    const banner = getByTestId('banner-reanudar')
    expect(banner.textContent).toContain('Obra Dos')
    expect(banner.textContent).toContain('Última sesión')
    expect(banner.textContent).toContain('doble clic')
  })

  it('doble clic en una card abre el proyecto', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno'), hacerProyecto('p2', 'Obra Dos')]
    mocks.ultimoProyectoId = 'p2'

    const { getByTestId } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p2'))
    expect(mocks.cambiarProyecto).not.toHaveBeenCalled()

    fireEvent.doubleClick(getByTestId('proyecto-p2'))
    expect(mocks.cambiarProyecto).toHaveBeenCalledWith('p2')
  })

  it('un solo clic enfoca sin abrir', () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByTestId, getByTitle } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))
    expect(mocks.cambiarProyecto).not.toHaveBeenCalled()
    expect(getByTitle('Editar')).toBeTruthy()
  })

  it('sin último proyecto persistido no muestra el banner', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { queryByTestId } = render(createElement(SelectorProyectos))

    expect(queryByTestId('banner-reanudar')).toBeNull()
  })

  it('botón Continuar del header entra directo al último proyecto', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno'), hacerProyecto('p2', 'Obra Dos')]
    mocks.ultimoProyectoId = 'p2'

    const { getByTestId } = render(createElement(SelectorProyectos))

    const boton = getByTestId('continuar-ultimo')
    expect(boton.textContent).toContain('Obra Dos')
    fireEvent.click(boton)
    expect(mocks.cambiarProyecto).toHaveBeenCalledWith('p2')
  })

  it('sin último proyecto no aparece el botón Continuar', () => {
    mocks.perfil = hacerPerfil('usuario')
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { queryByTestId } = render(createElement(SelectorProyectos))

    expect(queryByTestId('continuar-ultimo')).toBeNull()
  })
})

describe('SelectorProyectos: eliminación con confirmación', () => {
  it('exige escribir BORRAR "nombre" y elimina vía la colección', async () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno', { puntos_count: 7 })]

    const { getByTestId, getByTitle, getByText } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))
    fireEvent.click(getByTitle('Eliminar'))
    expect(getByText(/Se ocultará el proyecto con sus 7 puntos/)).toBeTruthy()
    expect(getByText(/un administrador puede recuperarlo/)).toBeTruthy()

    const boton = getByTestId('confirmar-eliminacion') as HTMLButtonElement
    expect(boton.disabled).toBe(true)

    fireEvent.change(getByTestId('confirmar-eliminacion-input'), { target: { value: 'BORRAR' } })
    expect(boton.disabled).toBe(true)

    fireEvent.change(getByTestId('confirmar-eliminacion-input'), { target: { value: 'BORRAR "Obra Uno"' } })
    expect(boton.disabled).toBe(false)
    fireEvent.click(boton)

    await waitFor(() => {
      expect(mocks.eliminarColeccion).toHaveBeenCalledWith('p1')
    })
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Proyecto eliminado')
    })
  })

  it('bloquea el pegado en el campo de confirmación', () => {
    mocks.perfil = hacerPerfil('general')
    mocks.session = { user: { id: 'u1' } }
    mocks.proyectos = [hacerProyecto('p1', 'Obra Uno')]

    const { getByTestId, getByTitle } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))
    fireEvent.click(getByTitle('Eliminar'))

    const input = getByTestId('confirmar-eliminacion-input')
    const pegado = new Event('paste', { bubbles: true, cancelable: true })
    input.dispatchEvent(pegado)
    expect(pegado.defaultPrevented).toBe(true)
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

    const { getByTestId, getByTitle } = render(createElement(SelectorProyectos))

    fireEvent.click(getByTestId('proyecto-p1'))
    fireEvent.click(getByTitle('Eliminar'))
    fireEvent.change(getByTestId('confirmar-eliminacion-input'), { target: { value: 'BORRAR "Obra Uno"' } })
    fireEvent.click(getByTestId('confirmar-eliminacion'))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('No tenés permiso para eliminar este proyecto')
    })
  })
})
