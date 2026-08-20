// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import type { MiembroProyecto } from '@/lib/supabase-service'
import type { Perfil, Proyecto } from '@/types'

const mocks = vi.hoisted(() => ({
  listarProyectos: vi.fn(),
  crearProyecto: vi.fn(),
  actualizarProyecto: vi.fn(),
  eliminarProyecto: vi.fn(),
  listarMiembrosProyecto: vi.fn(),
  agregarMiembroProyecto: vi.fn(),
  quitarMiembroProyecto: vi.fn(),
  listarPerfiles: vi.fn(),
  cambiarRolUsuario: vi.fn(),
}))

vi.mock('@/lib/supabase-service', () => mocks)

import {
  getMiembrosCollection,
  perfilesCollection,
  proyectosCollection,
} from '@/lib/collections'

function hacerMiembro(userId: string): MiembroProyecto {
  return {
    user_id: userId,
    creado_por: 'yo-1',
    creado_en: '2026-01-01T00:00:00Z',
    email: `${userId}@test.local`,
    nombre: null,
    rol: 'usuario',
  }
}

function hacerPerfil(id: string, rol: Perfil['rol']): Perfil {
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

function hacerProyecto(id: string): Proyecto {
  return {
    id,
    nombre: `Obra ${id}`,
    descripcion: null,
    creado_por: 'yo-1',
    created_at: '2026-01-01T00:00:00Z',
  }
}

function SondaMiembros({ collection }: { collection: ReturnType<typeof getMiembrosCollection> }) {
  const { data } = useLiveQuery((q) => q.from({ miembros: collection }))
  return createElement(
    'ul',
    null,
    (data ?? []).map((m) =>
      createElement('li', { key: m.user_id, 'data-testid': `fila-${m.user_id}` }, m.email ?? m.user_id),
    ),
  )
}

function SondaPerfiles() {
  const { data } = useLiveQuery((q) => q.from({ perfiles: perfilesCollection }))
  return createElement(
    'ul',
    null,
    (data ?? []).map((p) =>
      createElement('li', { key: p.id, 'data-testid': `rol-${p.id}` }, p.rol),
    ),
  )
}

function SondaProyectos() {
  const { data } = useLiveQuery((q) => q.from({ proyectos: proyectosCollection }))
  return createElement(
    'ul',
    null,
    (data ?? []).map((p) =>
      createElement('li', { key: p.id, 'data-testid': `proyecto-${p.id}` }, p.nombre),
    ),
  )
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.listarProyectos.mockResolvedValue([])
  mocks.crearProyecto.mockResolvedValue({ success: true })
  mocks.actualizarProyecto.mockResolvedValue({ success: true })
  mocks.eliminarProyecto.mockResolvedValue({ success: true })
  mocks.listarMiembrosProyecto.mockResolvedValue([])
  mocks.agregarMiembroProyecto.mockResolvedValue({ success: true })
  mocks.quitarMiembroProyecto.mockResolvedValue({ success: true })
  mocks.listarPerfiles.mockResolvedValue([])
  mocks.cambiarRolUsuario.mockResolvedValue({ success: true })
})

describe('collections: optimistic mutations with rollback', () => {
  it('member insert appears optimistically while persistence is pending', async () => {
    let resolver: (v: { success: boolean; error?: string }) => void = () => {}
    mocks.agregarMiembroProyecto.mockReturnValue(
      new Promise<{ success: boolean; error?: string }>((resolve) => {
        resolver = resolve
      }),
    )
    const collection = getMiembrosCollection('t-optimistic')
    render(createElement(SondaMiembros, { collection }))

    await act(async () => {
      collection.insert(hacerMiembro('u9'))
    })

    expect(await screen.findByTestId('fila-u9')).toBeTruthy()
    expect(mocks.agregarMiembroProyecto).toHaveBeenCalledWith('t-optimistic', 'u9', 'yo-1')

    mocks.listarMiembrosProyecto.mockResolvedValue([hacerMiembro('u9')])
    await act(async () => {
      resolver({ success: true })
    })
    await waitFor(() => {
      expect(mocks.listarMiembrosProyecto).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByTestId('fila-u9')).toBeTruthy()
  })

  it('member insert rolls back when persistence fails', async () => {
    let resolver: (v: { success: boolean; error?: string }) => void = () => {}
    mocks.agregarMiembroProyecto.mockReturnValue(
      new Promise<{ success: boolean; error?: string }>((resolve) => {
        resolver = resolve
      }),
    )
    const collection = getMiembrosCollection('t-rollback')
    render(createElement(SondaMiembros, { collection }))

    await act(async () => {
      collection.insert(hacerMiembro('u9'))
    })

    expect(await screen.findByTestId('fila-u9')).toBeTruthy()

    await act(async () => {
      resolver({ success: false, error: 'duplicate key value violates unique constraint' })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('fila-u9')).toBeNull()
    })
  })

  it('member delete rolls back when persistence fails', async () => {
    mocks.listarMiembrosProyecto.mockResolvedValue([hacerMiembro('u2')])
    mocks.quitarMiembroProyecto.mockResolvedValue({ success: false, error: 'row-level security' })
    const collection = getMiembrosCollection('t-delete-rollback')
    render(createElement(SondaMiembros, { collection }))
    expect(await screen.findByTestId('fila-u2')).toBeTruthy()

    await act(async () => {
      collection.delete('u2')
    })

    expect(mocks.quitarMiembroProyecto).toHaveBeenCalledWith('t-delete-rollback', 'u2')
    await waitFor(() => {
      expect(screen.getByTestId('fila-u2')).toBeTruthy()
    })
  })

  it('role update is optimistic and reverts when cambiarRolUsuario fails', async () => {
    let resolver: (v: { success: boolean; error?: string }) => void = () => {}
    mocks.cambiarRolUsuario.mockReturnValue(
      new Promise<{ success: boolean; error?: string }>((resolve) => {
        resolver = resolve
      }),
    )
    mocks.listarPerfiles.mockResolvedValue([hacerPerfil('u1', 'usuario')])
    render(createElement(SondaPerfiles))

    expect(await screen.findByTestId('rol-u1')).toBeTruthy()
    expect(screen.getByTestId('rol-u1').textContent).toBe('usuario')

    await act(async () => {
      perfilesCollection.update('u1', (draft) => {
        draft.rol = 'general'
      })
    })

    expect(mocks.cambiarRolUsuario).toHaveBeenCalledWith('u1', 'general')
    expect(screen.getByTestId('rol-u1').textContent).toBe('general')

    await act(async () => {
      resolver({ success: false, error: 'row-level security policy' })
    })

    await waitFor(() => {
      expect(screen.getByTestId('rol-u1').textContent).toBe('usuario')
    })
  })

  it('project insert persists via service then refetches the list (RLS-safe pattern)', async () => {
    render(createElement(SondaProyectos))
    expect(mocks.listarProyectos).not.toHaveBeenCalled()

    mocks.listarProyectos.mockResolvedValue([hacerProyecto('p9')])
    const tx = proyectosCollection.insert(hacerProyecto('p9'))
    await act(async () => {
      await tx.isPersisted.promise
    })

    expect(mocks.crearProyecto).toHaveBeenCalledTimes(1)
    expect(mocks.crearProyecto).toHaveBeenCalledWith(expect.objectContaining({ id: 'p9' }))
    await waitFor(() => {
      expect(mocks.listarProyectos).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByTestId('proyecto-p9')).toBeTruthy()
  })

  it('project insert rolls back when creation fails', async () => {
    mocks.crearProyecto.mockResolvedValue({ success: false, error: 'RLS rejected' })
    const tx = proyectosCollection.insert(hacerProyecto('p10'))
    await expect(tx.isPersisted.promise).rejects.toThrow('RLS rejected')
    expect(mocks.crearProyecto).toHaveBeenCalledWith(expect.objectContaining({ id: 'p10' }))
  })

  it('project update persists only nombre/descripcion via actualizarProyecto', async () => {
    mocks.listarProyectos.mockResolvedValue([hacerProyecto('p1')])
    render(createElement(SondaProyectos))
    await act(async () => {
      await proyectosCollection.utils.refetch()
    })
    expect(await screen.findByTestId('proyecto-p1')).toBeTruthy()

    mocks.listarProyectos.mockResolvedValue([{ ...hacerProyecto('p1'), nombre: 'Obra Nueva' }])
    await act(async () => {
      const tx = proyectosCollection.update('p1', (draft) => {
        draft.nombre = 'Obra Nueva'
      })
      await tx.isPersisted.promise
    })

    expect(mocks.actualizarProyecto).toHaveBeenCalledWith('p1', { nombre: 'Obra Nueva', descripcion: null, carpeta_nas: null })
    await waitFor(() => {
      expect(mocks.listarProyectos).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.getByTestId('proyecto-p1').textContent).toBe('Obra Nueva')
    })
  })

  it('project delete persists via eliminarProyecto RPC and refetches without the row', async () => {
    mocks.listarProyectos.mockResolvedValue([hacerProyecto('p10')])
    render(createElement(SondaProyectos))
    await act(async () => {
      await proyectosCollection.utils.refetch()
    })
    expect(await screen.findByTestId('proyecto-p10')).toBeTruthy()

    mocks.listarProyectos.mockResolvedValue([])
    await act(async () => {
      const tx = proyectosCollection.delete('p10')
      await tx.isPersisted.promise
    })

    expect(mocks.eliminarProyecto).toHaveBeenCalledWith('p10')
    await waitFor(() => {
      expect(mocks.listarProyectos).toHaveBeenCalledTimes(2)
    })
    await waitFor(() => {
      expect(screen.queryByTestId('proyecto-p10')).toBeNull()
    })
  })

  it('project delete rolls back when the RPC rejects (permiso insuficiente)', async () => {
    mocks.listarProyectos.mockResolvedValue([hacerProyecto('p11')])
    mocks.eliminarProyecto.mockResolvedValue({
      success: false,
      error: 'No tenés permiso para eliminar este proyecto',
    })
    render(createElement(SondaProyectos))
    await act(async () => {
      await proyectosCollection.utils.refetch()
    })
    expect(await screen.findByTestId('proyecto-p11')).toBeTruthy()

    await act(async () => {
      proyectosCollection.delete('p11')
    })

    expect(mocks.eliminarProyecto).toHaveBeenCalledWith('p11')
    await waitFor(() => {
      expect(screen.getByTestId('proyecto-p11')).toBeTruthy()
    })
  })
})
