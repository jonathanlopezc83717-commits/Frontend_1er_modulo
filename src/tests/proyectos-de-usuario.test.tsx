/**
 * Pruebas de ProyectosDeUsuario: listado de proyectos con estado de
 * membresía, alta/baja directa por usuario y caso sin proyectos.
 * Ejecutar con: npx vitest run src/tests/proyectos-de-usuario.test.tsx
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { createElement } from 'react'
import type { Proyecto } from '@/types'

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'yo-1' } },
  proyectos: [] as Proyecto[],
  listarProyectos: vi.fn(),
  listarProyectosDeUsuario: vi.fn(),
  agregarMiembroProyecto: vi.fn(),
  quitarMiembroProyecto: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    session: mocks.session,
    perfil: null,
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
  listarProyectos: mocks.listarProyectos,
  listarProyectosDeUsuario: mocks.listarProyectosDeUsuario,
  agregarMiembroProyecto: mocks.agregarMiembroProyecto,
  quitarMiembroProyecto: mocks.quitarMiembroProyecto,
  listarPerfiles: vi.fn(),
  listarMiembrosProyecto: vi.fn(),
  cambiarRolUsuario: vi.fn(),
  crearProyecto: vi.fn(),
  actualizarProyecto: vi.fn(),
  eliminarProyecto: vi.fn(),
}))

import { ProyectosDeUsuario } from '@/components/projects/ProyectosDeUsuario'

Element.prototype.scrollIntoView = () => {}

function hacerProyecto(id: string, nombre: string, descripcion?: string): Proyecto {
  return {
    id,
    nombre,
    descripcion: descripcion ?? null,
    creado_por: 'yo-1',
    created_at: '2026-01-01T00:00:00Z',
    estado: 'activo',
  }
}

function montar() {
  return render(
    createElement(ProyectosDeUsuario, {
      userId: 'u2',
      email: 'u2@test.local',
      open: true,
      onOpenChange: vi.fn(),
    }),
  )
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.proyectos = [hacerProyecto('p1', 'Obra Norte', 'Línea norte'), hacerProyecto('p2', 'Obra Sur')]
  mocks.listarProyectos.mockResolvedValue(mocks.proyectos)
  mocks.listarProyectosDeUsuario.mockResolvedValue(['p1'])
  mocks.agregarMiembroProyecto.mockResolvedValue({ success: true })
  mocks.quitarMiembroProyecto.mockResolvedValue({ success: true })
})

describe('ProyectosDeUsuario', () => {
  it('muestra estado de miembro y no miembro por proyecto', async () => {
    const { findByTestId, findByText } = montar()

    const filaP1 = await findByTestId('proyecto-p1')
    expect(within(filaP1).getByText('Obra Norte')).toBeTruthy()
    expect(within(filaP1).getByText('Miembro')).toBeTruthy()
    expect(within(filaP1).getByRole('button', { name: 'Quitar' })).toBeTruthy()

    const filaP2 = await findByTestId('proyecto-p2')
    expect(within(filaP2).getByRole('button', { name: 'Agregar' })).toBeTruthy()
    expect(within(filaP2).queryByText('Miembro')).toBeNull()

    expect(await findByText('Miembro de 1 proyecto')).toBeTruthy()
    expect(mocks.listarProyectosDeUsuario).toHaveBeenCalledWith('u2')
  })

  it('agregar llama al servicio y refresca la lista de membresías', async () => {
    mocks.listarProyectosDeUsuario
      .mockResolvedValueOnce(['p1'])
      .mockResolvedValueOnce(['p1', 'p2'])
    const { findByTestId } = montar()

    const filaP2 = await findByTestId('proyecto-p2')
    fireEvent.click(within(filaP2).getByRole('button', { name: 'Agregar' }))

    await waitFor(() => {
      expect(mocks.agregarMiembroProyecto).toHaveBeenCalledWith('p2', 'u2', 'yo-1')
    })
    const filaP2Actualizada = await findByTestId('proyecto-p2')
    expect(await within(filaP2Actualizada).findByText('Miembro')).toBeTruthy()
    expect(mocks.listarProyectosDeUsuario).toHaveBeenCalledTimes(2)
  })

  it('quitar llama al servicio y refresca la lista de membresías', async () => {
    mocks.listarProyectosDeUsuario.mockResolvedValueOnce(['p1']).mockResolvedValueOnce([])
    const { findByTestId, findByText } = montar()

    const filaP1 = await findByTestId('proyecto-p1')
    fireEvent.click(within(filaP1).getByRole('button', { name: 'Quitar' }))

    await waitFor(() => {
      expect(mocks.quitarMiembroProyecto).toHaveBeenCalledWith('p1', 'u2')
    })
    const filaP1Actualizada = await findByTestId('proyecto-p1')
    expect(await within(filaP1Actualizada).findByRole('button', { name: 'Agregar' })).toBeTruthy()
    expect(await findByText('Miembro de 0 proyectos')).toBeTruthy()
  })

  it('sin proyectos muestra mensaje con pista para crear uno', async () => {
    mocks.listarProyectos.mockResolvedValue([])
    const { findByText } = montar()

    expect(await findByText('Todavía no hay proyectos.')).toBeTruthy()
    expect(await findByText('Creá uno desde el selector de proyectos.')).toBeTruthy()
  })
})
