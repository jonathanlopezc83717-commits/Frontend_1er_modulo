/**
 * Pruebas de retención de snapshots en la nube.
 * Ejecutar con: npx vitest run src/tests/snapshot-retention.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstadoGuardado } from '@/types'

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  order: vi.fn(),
  deleteIn: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla !== 'app_state_snapshots') throw new Error(`tabla inesperada: ${tabla}`)
      return {
        upsert: mocks.upsert,
        select: () => ({ order: mocks.order }),
        delete: () => ({ in: mocks.deleteIn }),
      }
    },
  },
}))

import { guardarEstadoAppEnNube, idsParaEliminarPorRetencion } from '@/lib/supabase-service'

function ids(cantidad: number): string[] {
  return Array.from({ length: cantidad }, (_, i) => `snap-${String(i).padStart(2, '0')}`)
}

const ESTADO: EstadoGuardado = {
  id: 'snap-00',
  tipo: 'manual',
  descripcion: 'prueba',
  createdAt: '2026-08-17T00:00:00Z',
  snapshotCompleto: true,
  snapshot: { puntos: [], puntoActivoId: null, moduloActivo: 'analisis', nomenclaturasGlobales: [], plantillasFormato: [], plantillasPdfFormato: [] },
} as unknown as EstadoGuardado

beforeEach(() => {
  vi.clearAllMocks()
  mocks.upsert.mockResolvedValue({ error: null })
  mocks.deleteIn.mockResolvedValue({ error: null })
})

describe('idsParaEliminarPorRetencion', () => {
  it('no elimina nada con 10 o menos snapshots', () => {
    expect(idsParaEliminarPorRetencion(ids(10))).toEqual([])
    expect(idsParaEliminarPorRetencion(ids(3))).toEqual([])
  })

  it('elimina los más antiguos más allá del límite', () => {
    expect(idsParaEliminarPorRetencion(ids(12))).toEqual(['snap-10', 'snap-11'])
    expect(idsParaEliminarPorRetencion(ids(5), 2)).toEqual(['snap-02', 'snap-03', 'snap-04'])
  })
})

describe('guardarEstadoAppEnNube', () => {
  it('borra los excedentes tras un upsert exitoso', async () => {
    mocks.order.mockResolvedValue({ data: ids(12).map(id => ({ id })), error: null })

    const resultado = await guardarEstadoAppEnNube(ESTADO, 'proyecto-1')

    expect(resultado.success).toBe(true)
    expect(mocks.upsert).toHaveBeenCalledTimes(1)
    expect(mocks.deleteIn).toHaveBeenCalledWith('id', ['snap-10', 'snap-11'])
  })

  it('no borra nada cuando hay 10 o menos filas', async () => {
    mocks.order.mockResolvedValue({ data: ids(10).map(id => ({ id })), error: null })

    await guardarEstadoAppEnNube(ESTADO, 'proyecto-1')

    expect(mocks.deleteIn).not.toHaveBeenCalled()
  })

  it('no falla el guardado si la retención falla', async () => {
    mocks.order.mockRejectedValue(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const resultado = await guardarEstadoAppEnNube(ESTADO, 'proyecto-1')

    expect(resultado.success).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
