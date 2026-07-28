import { describe, it, expect } from 'vitest'
import { esCampoRemovible, type CampoFicha } from '@/components/modulos/ficha-helpers'

describe('esCampoRemovible', () => {
  it('false for built-in "Segmento"', () => {
    expect(esCampoRemovible({ etiqueta: 'Segmento', valor: '', etiquetaBase: 'Segmento' })).toBe(false)
  })

  it('false for "Ubicacion respecto al eje de proyecto"', () => {
    expect(esCampoRemovible({
      etiqueta: 'Ubicacion respecto al eje de proyecto',
      valor: '',
      etiquetaBase: 'Ubicacion respecto al eje de proyecto',
    })).toBe(false)
  })

  it('false for "Coordenada "X"" (base, sufijo-none)', () => {
    expect(esCampoRemovible({
      etiqueta: 'Coordenada "X"',
      valor: '',
      etiquetaBase: 'Coordenada "X"',
    })).toBe(false)
  })

  it('false for "Coordenada "X" (Izq)" (sufijada)', () => {
    expect(esCampoRemovible({
      etiqueta: 'Coordenada "X" (Izq)',
      valor: '',
      etiquetaBase: 'Coordenada "X" (Izq)',
    })).toBe(false)
  })

  it('true for custom field with etiquetaBase "custom_123"', () => {
    const campo: CampoFicha = { etiqueta: 'Inspector', valor: 'Juan', etiquetaBase: 'custom_123' }
    expect(esCampoRemovible(campo)).toBe(true)
  })

  it('true for custom field without etiquetaBase that is not built-in', () => {
    const campo: CampoFicha = { etiqueta: 'Inspector', valor: 'Juan' }
    expect(esCampoRemovible(campo)).toBe(true)
  })

  it('false for built-in "Fecha" even when renamed', () => {
    expect(esCampoRemovible({ etiqueta: 'Día', valor: '', etiquetaBase: 'Fecha' })).toBe(false)
  })
})
