import { describe, it, expect } from 'vitest'
import { type OpcionUbicacion, OPCIONES_UBICACION } from '@/components/modulos/ubicacion-opciones'

describe('ubicacion-opciones', () => {
  describe('OPCIONES_UBICACION', () => {
    it('tiene exactamente 9 opciones en el orden esperado (3 simples + 6 dobles)', () => {
      expect(OPCIONES_UBICACION).toEqual([
        'Izquierda',
        'Derecha',
        'Centro',
        'Izquierda-Derecha',
        'Izquierda-Centro',
        'Derecha-Izquierda',
        'Derecha-Centro',
        'Centro-Izquierda',
        'Centro-Derecha',
      ])
    })

    it('todas las entradas son OpcionUbicacion válidas (solo lados del catálogo separados por guion)', () => {
      const lados = new Set(['Izquierda', 'Derecha', 'Centro'])
      for (const op of OPCIONES_UBICACION as readonly OpcionUbicacion[]) {
        const partes = op.split('-')
        expect(partes.every(p => lados.has(p))).toBe(true)
      }
    })
  })
})
