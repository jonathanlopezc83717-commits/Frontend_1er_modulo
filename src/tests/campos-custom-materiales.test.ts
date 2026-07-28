import { describe, it, expect } from 'vitest'
import { nuevaCoordCustom } from '@/components/modulos/EditarEtiquetasMateriales'

describe('nuevaCoordCustom', () => {
  it('empieza en custom-1', () => {
    expect(nuevaCoordCustom([])).toBe('custom-1')
  })
  it('salta coords ya usadas', () => {
    expect(nuevaCoordCustom([{ coord: 'custom-1' }])).toBe('custom-2')
    expect(nuevaCoordCustom([{ coord: 'custom-1' }, { coord: 'custom-2' }])).toBe('custom-3')
  })
  it('rellena huecos', () => {
    expect(nuevaCoordCustom([{ coord: 'custom-1' }, { coord: 'custom-3' }])).toBe('custom-2')
  })
})
