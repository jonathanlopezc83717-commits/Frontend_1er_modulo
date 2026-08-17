import { describe, it, expect } from 'vitest'
import { hayEventosNuevos, parseNasEvento } from '@/lib/nas-live'
import { eventosDePuntos } from '@/lib/nas-approval'
import type { NasPendingEvent } from '@/lib/nas-approval'
import type { PuntoFerroviario } from '@/types'

const evento = (path: string, detectedAt = '2026-01-01T00:00:00Z', eventId = `id-${path}`): NasPendingEvent => ({
  eventId,
  type: 'modified',
  path,
  ext: '.csv',
  size: 10,
  mtimeMs: 0,
  detectedAt,
})

const punto = (id: string, nasPath?: string): PuntoFerroviario => ({
  id,
  numeroSerie: 1,
  nombre: id,
  nasPath,
  moduloData: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

describe('eventosDePuntos', () => {
  it('devuelve solo los eventos de rutas hijas del nasPath', () => {
    const res = eventosDePuntos(
      [evento('obra/PK-001/datos.csv'), evento('obra/PK-999/datos.csv')],
      [punto('p1', 'obra/PK-001')]
    )
    expect(res.map((e) => e.eventId)).toEqual(['id-obra/PK-001/datos.csv'])
  })

  it('incluye el evento cuya ruta es exactamente el nasPath', () => {
    const res = eventosDePuntos([evento('obra/PK-001')], [punto('p1', 'obra/PK-001')])
    expect(res).toHaveLength(1)
  })

  it('no matchea carpetas hermanas con prefijo similar', () => {
    const res = eventosDePuntos([evento('obra/PK-0010/datos.csv')], [punto('p1', 'obra/PK-001')])
    expect(res).toHaveLength(0)
  })

  it('deja fuera los eventos de rutas sin punto asociado (imports manuales futuros)', () => {
    const res = eventosDePuntos(
      [evento('obra/Nueva/hoja.csv')],
      [punto('p1', 'obra/PK-001'), punto('p2')]
    )
    expect(res).toHaveLength(0)
  })
})

describe('parseNasEvento (payload SSE de /api/nas-stream)', () => {
  it('parsea el payload del servidor {updatedAt, pendientes}', () => {
    expect(parseNasEvento('{"updatedAt":"2026-01-01T00:00:00Z","pendientes":3}')).toEqual({
      updatedAt: '2026-01-01T00:00:00Z',
      pendientes: 3,
    })
  })

  it('normaliza updatedAt ausente a null y pendientes ausente a 0', () => {
    expect(parseNasEvento('{"pendientes":5}')).toEqual({ updatedAt: null, pendientes: 5 })
    expect(parseNasEvento('{"updatedAt":"x"}')).toEqual({ updatedAt: 'x', pendientes: 0 })
  })

  it('devuelve null ante JSON invalido o no-objeto', () => {
    expect(parseNasEvento('no-json')).toBeNull()
    expect(parseNasEvento('42')).toBeNull()
  })
})

describe('hayEventosNuevos', () => {
  it('con marca 0 cualquier evento es nuevo', () => {
    expect(hayEventosNuevos([evento('a.csv')], 0)).toBe(true)
  })

  it('sin eventos no hay nada nuevo', () => {
    expect(hayEventosNuevos([], 0)).toBe(false)
  })

  it('eventos ya cubiertos por la marca no son nuevos', () => {
    const evs = [evento('a.csv', '2026-01-01T00:00:05Z'), evento('b.csv', '2026-01-01T00:00:10Z')]
    expect(hayEventosNuevos(evs, Date.parse('2026-01-01T00:00:10Z'))).toBe(false)
  })

  it('un evento posterior a la marca es nuevo', () => {
    const evs = [evento('a.csv', '2026-01-01T00:00:05Z'), evento('b.csv', '2026-01-01T00:00:10Z')]
    expect(hayEventosNuevos(evs, Date.parse('2026-01-01T00:00:09Z'))).toBe(true)
  })
})
