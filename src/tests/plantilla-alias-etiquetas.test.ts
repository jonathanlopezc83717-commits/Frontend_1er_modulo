import { describe, it, expect } from 'vitest'
import {
  crearFichaVacia,
  etiquetaBaseDe,
  construirAliasEtiquetas,
  reescribirEtiquetaLabel,
  type CampoFicha,
} from '@/components/modulos/ficha-helpers'

describe('plantilla-alias-etiquetas', () => {
  describe('etiquetaBaseDe', () => {
    it('returns etiqueta when etiquetaBase absent', () => {
      expect(etiquetaBaseDe({ etiqueta: 'X' } as CampoFicha)).toBe('X')
    })
    it('returns etiquetaBase when present', () => {
      expect(etiquetaBaseDe({ etiqueta: 'Día', etiquetaBase: 'Fecha' })).toBe('Fecha')
    })
    it('works on legacy entries with only etiqueta', () => {
      expect(etiquetaBaseDe({ etiqueta: 'Fecha' })).toBe('Fecha')
    })
  })

  describe('crearFichaVacia sets etiquetaBase', () => {
    it('every datos entry has etiquetaBase === etiqueta', () => {
      const f = crearFichaVacia()
      expect(f.datos.length).toBeGreaterThan(0)
      expect(f.datos.every(c => c.etiquetaBase === c.etiqueta)).toBe(true)
    })
    it('suffixed coordenadas also carry etiquetaBase', () => {
      const f = crearFichaVacia('Izquierda-Derecha')
      const xizq = f.datos.find(c => c.etiqueta === 'Coordenada "X" (Izq)')
      expect(xizq?.etiquetaBase).toBe('Coordenada "X" (Izq)')
    })
  })

  describe('construirAliasEtiquetas', () => {
    it('captures renamed field keyed by internal key', () => {
      const datos: CampoFicha[] = [
        { etiqueta: 'Día de inspección', valor: '', etiquetaBase: 'Fecha' },
        { etiqueta: 'Segmento', valor: '', etiquetaBase: 'Segmento' },
      ]
      expect(construirAliasEtiquetas(datos)).toEqual({ fecha: 'Día de inspección' })
    })
    it('omits fields where etiqueta equals default', () => {
      const datos: CampoFicha[] = [
        { etiqueta: 'Fecha', valor: '', etiquetaBase: 'Fecha' },
        { etiqueta: 'Segmento', valor: '', etiquetaBase: 'Segmento' },
      ]
      expect(construirAliasEtiquetas(datos)).toEqual({})
    })
    it('falls back to normalizarClave when no ETIQUETAS_A_CAMPO entry', () => {
      const datos: CampoFicha[] = [
        { etiqueta: 'Custom Display', valor: '', etiquetaBase: 'Custom Field' },
      ]
      expect(construirAliasEtiquetas(datos)).toEqual({ custom_field: 'Custom Display' })
    })
    it('handles legacy entries without etiquetaBase (no alias)', () => {
      const datos: CampoFicha[] = [
        { etiqueta: 'Fecha', valor: '' },
      ]
      expect(construirAliasEtiquetas(datos)).toEqual({})
    })
  })

  describe('reescribirEtiquetaLabel', () => {
    it('preserves trailing colon when original had one', () => {
      expect(reescribirEtiquetaLabel('Fecha:', 'Día de inspección')).toBe('Día de inspección:')
    })
    it('writes raw alias when original has no colon', () => {
      expect(reescribirEtiquetaLabel('Fecha', 'Día')).toBe('Día')
    })
    it('handles empty original cell', () => {
      expect(reescribirEtiquetaLabel('', 'Día')).toBe('Día')
    })
    it('detects colon after trailing whitespace', () => {
      expect(reescribirEtiquetaLabel('Fecha : ', 'Día')).toBe('Día:')
    })
  })
})
