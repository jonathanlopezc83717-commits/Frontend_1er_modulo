/**
 * Pruebas del servicio de gestión de proyectos: meta RPC, soft delete
 * por RPC y actualización de metadatos.
 * Ejecutar con: npx vitest run src/tests/gestion-proyectos.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Proyecto } from '@/types'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
  },
}))

import { actualizarProyecto, eliminarProyecto, listarProyectos } from '@/lib/supabase-service'

function hacerProyecto(extra: Partial<Proyecto>): Proyecto {
  return {
    id: 'p1',
    nombre: 'Obra',
    descripcion: null,
    creado_por: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: [], error: null })
})

describe('eliminarProyecto: soft delete por RPC', () => {
  it('usa el RPC eliminar_proyecto y no toca tablas (los puntos quedan intactos)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const resultado = await eliminarProyecto('p1')

    expect(resultado.success).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('eliminar_proyecto', { p_id: 'p1' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('propaga el error en español cuando el RPC rechaza (no dueño)', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'No tenés permiso para eliminar este proyecto' },
    })

    const resultado = await eliminarProyecto('p1')

    expect(resultado.success).toBe(false)
    expect(resultado.error).toBe('No tenés permiso para eliminar este proyecto')
  })
})

describe('actualizarProyecto: metadatos', () => {
  it('actualiza sólo nombre y descripción del proyecto', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    mocks.from.mockReturnValue({ update })

    const resultado = await actualizarProyecto('p1', { nombre: 'Obra Nueva', descripcion: 'desc' })

    expect(resultado.success).toBe(true)
    expect(mocks.from).toHaveBeenCalledWith('proyectos')
    expect(update).toHaveBeenCalledWith({ nombre: 'Obra Nueva', descripcion: 'desc' })
    expect(eq).toHaveBeenCalledWith('id', 'p1')
  })

  it('devuelve el error cuando el update falla', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'row-level security' } })
    const update = vi.fn().mockReturnValue({ eq })
    mocks.from.mockReturnValue({ update })

    const resultado = await actualizarProyecto('p1', { nombre: 'X' })

    expect(resultado.success).toBe(false)
    expect(resultado.error).toBe('row-level security')
  })
})

describe('listarProyectos: meta enriquecida', () => {
  it('usa el RPC listar_proyectos_con_meta', async () => {
    await listarProyectos()

    expect(mocks.rpc).toHaveBeenCalledWith('listar_proyectos_con_meta')
  })

  it('filtra eliminados y ordena por nombre', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        hacerProyecto({ id: 'pz', nombre: 'Zeta', estado: 'eliminado' }),
        hacerProyecto({ id: 'pb', nombre: 'Beta' }),
        hacerProyecto({ id: 'pa', nombre: 'Alfa' }),
      ],
      error: null,
    })

    const proyectos = await listarProyectos()

    expect(proyectos.map((p) => p.id)).toEqual(['pa', 'pb'])
  })

  it('devuelve [] cuando el RPC falla', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    expect(await listarProyectos()).toEqual([])
  })
})
