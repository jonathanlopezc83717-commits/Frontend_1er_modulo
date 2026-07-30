import { describe, it, expect } from 'vitest'
import { extraerValor } from '@/components/modulos/ModuloMateriales'

describe('extraerValor — coordenada_z', () => {
  it('devuelve el valor de georeferencia.coordenadas.z como string', () => {
    const punto = { moduloData: { georeferencia: { coordenadas: { x: 1, y: 2, z: 30.5 } } } }
    expect(extraerValor(punto, 'coordenada_z')).toBe('30.5')
  })

  it('devuelve string vacío si no hay coordenada z', () => {
    expect(extraerValor({ moduloData: { georeferencia: { coordenadas: { x: 1, y: 2 } } } }, 'coordenada_z')).toBe('')
    expect(extraerValor({ moduloData: {} }, 'coordenada_z')).toBe('')
    expect(extraerValor({}, 'coordenada_z')).toBe('')
    expect(extraerValor(null, 'coordenada_z')).toBe('')
  })
})

describe('extraerValor — cadenamiento (del punto)', () => {
  it('devuelve el cadenamiento del punto', () => {
    expect(extraerValor({ cadenamiento: '56' }, 'cadenamiento')).toBe('56')
  })

  it('devuelve string vacío si no hay cadenamiento', () => {
    expect(extraerValor({}, 'cadenamiento')).toBe('')
    expect(extraerValor({ cadenamiento: '' }, 'cadenamiento')).toBe('')
  })
})
