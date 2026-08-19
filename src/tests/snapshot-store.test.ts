/**
 * Pruebas del store de snapshots NAS (fetch mockeado).
 * Ejecutar con: npx vitest run src/tests/snapshot-store.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { EstadoGuardado } from '@/types'

const fetchMock = vi.fn()

function respuesta(status: number, cuerpo: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  }
}

const SNAPSHOT: EstadoGuardado['snapshot'] = {
  puntos: [],
  puntoActivoId: null,
  moduloActivo: 'analisis',
  nomenclaturasGlobales: [],
  plantillasFormato: [],
  plantillasPdfFormato: [],
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('guardarSnapshotNAS', () => {
  it('postea el JSON completo al endpoint y propaga el exito', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { ok: true, id: 'abc', created_at: '2026-08-19T00:00:00Z' }))

    const { guardarSnapshotNAS } = await import('@/lib/snapshot-store')
    const resultado = await guardarSnapshotNAS({
      proyectoId: '11111111-1111-1111-1111-111111111111',
      tipo: 'manual',
      descripcion: 'prueba',
      guardadoPor: 'u@test.local',
      snapshot: SNAPSHOT,
    })

    expect(resultado.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/nas-snapshots')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      proyectoId: '11111111-1111-1111-1111-111111111111',
      tipo: 'manual',
      descripcion: 'prueba',
      guardadoPor: 'u@test.local',
      snapshot: SNAPSHOT,
    })
  })

  it('503 (NAS no configurado) devuelve success false con detalle', async () => {
    fetchMock.mockResolvedValue(respuesta(503, { error: 'NAS no configurado' }))

    const { guardarSnapshotNAS } = await import('@/lib/snapshot-store')
    const resultado = await guardarSnapshotNAS({
      proyectoId: '11111111-1111-1111-1111-111111111111',
      tipo: 'automatico',
      descripcion: 'auto',
      snapshot: SNAPSHOT,
    })

    expect(resultado.success).toBe(false)
    expect(resultado.error).toContain('503')
    expect(resultado.error).toContain('NAS no configurado')
  })

  it('fallo de red devuelve success false sin lanzar', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'))

    const { guardarSnapshotNAS } = await import('@/lib/snapshot-store')
    const resultado = await guardarSnapshotNAS({
      proyectoId: '11111111-1111-1111-1111-111111111111',
      tipo: 'manual',
      descripcion: 'x',
      snapshot: SNAPSHOT,
    })

    expect(resultado.success).toBe(false)
    expect(resultado.error).toBe('fetch failed')
  })
})

describe('listarSnapshotsNAS', () => {
  it('mapea los metadatos del indice a EstadoGuardado', async () => {
    fetchMock.mockResolvedValue(respuesta(200, {
      updatedAt: '2026-08-19T01:00:00Z',
      snapshots: [
        { id: 's1', tipo: 'manual', descripcion: 'uno', created_at: '2026-08-19T01:00:00Z', guardadoPor: 'a@x.local', kb: 12.5 },
        { id: 's2', tipo: 'automatico', descripcion: 'dos', created_at: '2026-08-18T01:00:00Z', guardadoPor: '', kb: 3.2 },
      ],
    }))

    const { listarSnapshotsNAS } = await import('@/lib/snapshot-store')
    const lista = await listarSnapshotsNAS('11111111-1111-1111-1111-111111111111')

    expect(fetchMock).toHaveBeenCalledWith('/api/nas-snapshots?proyectoId=11111111-1111-1111-1111-111111111111')
    expect(lista).toHaveLength(2)
    expect(lista[0]).toMatchObject({
      id: 's1',
      tipo: 'manual',
      descripcion: 'uno',
      createdAt: '2026-08-19T01:00:00Z',
      guardadoPor: 'a@x.local',
      snapshotCompleto: false,
    })
    expect(lista[1].guardadoPor).toBeUndefined()
    expect(lista[0].snapshot.puntos).toEqual([])
  })

  it('503 o error de red devuelven lista vacia', async () => {
    const { listarSnapshotsNAS } = await import('@/lib/snapshot-store')

    fetchMock.mockResolvedValueOnce(respuesta(503, { error: 'NAS no configurado' }))
    expect(await listarSnapshotsNAS('11111111-1111-1111-1111-111111111111')).toEqual([])

    fetchMock.mockRejectedValueOnce(new Error('fetch failed'))
    expect(await listarSnapshotsNAS('11111111-1111-1111-1111-111111111111')).toEqual([])
  })
})

describe('leerSnapshotNAS', () => {
  it('devuelve el estado completo con el cuerpo del snapshot', async () => {
    fetchMock.mockResolvedValue(respuesta(200, {
      id: 's1',
      tipo: 'manual',
      descripcion: 'uno',
      created_at: '2026-08-19T01:00:00Z',
      guardadoPor: 'a@x.local',
      snapshot: SNAPSHOT,
    }))

    const { leerSnapshotNAS } = await import('@/lib/snapshot-store')
    const estado = await leerSnapshotNAS('11111111-1111-1111-1111-111111111111', 's1')

    expect(fetchMock).toHaveBeenCalledWith('/api/nas-snapshot?proyectoId=11111111-1111-1111-1111-111111111111&id=s1')
    expect(estado).toMatchObject({
      id: 's1',
      tipo: 'manual',
      descripcion: 'uno',
      createdAt: '2026-08-19T01:00:00Z',
      guardadoPor: 'a@x.local',
      snapshotCompleto: true,
    })
    expect(estado?.snapshot.moduloActivo).toBe('analisis')
  })

  it('404 o error de red devuelven null', async () => {
    const { leerSnapshotNAS } = await import('@/lib/snapshot-store')

    fetchMock.mockResolvedValueOnce(respuesta(404, { error: 'snapshot no encontrado' }))
    expect(await leerSnapshotNAS('11111111-1111-1111-1111-111111111111', 's1')).toBeNull()

    fetchMock.mockRejectedValueOnce(new Error('fetch failed'))
    expect(await leerSnapshotNAS('11111111-1111-1111-1111-111111111111', 's1')).toBeNull()
  })
})

describe('snapNASDisponible', () => {
  it('probe con uuid cero: 200 => true, 503 => false, red => false', async () => {
    const { snapNASDisponible } = await import('@/lib/snapshot-store')

    fetchMock.mockResolvedValueOnce(respuesta(200, { updatedAt: null, snapshots: [] }))
    expect(await snapNASDisponible()).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/nas-snapshots?proyectoId=00000000-0000-0000-0000-000000000000')

    fetchMock.mockResolvedValueOnce(respuesta(503, { error: 'NAS no configurado' }))
    expect(await snapNASDisponible()).toBe(false)

    fetchMock.mockRejectedValueOnce(new Error('fetch failed'))
    expect(await snapNASDisponible()).toBe(false)
  })
})
