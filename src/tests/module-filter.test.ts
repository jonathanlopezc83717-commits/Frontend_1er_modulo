/**
 * Verificación de la lógica de visibilidad de módulos en ModuleTabs (tarea 2.5).
 *
 * El módulo "ficha" debe ocultarse por defecto y revelarse de forma condicional,
 * replicando el patrón de "nomenclaturas". El predicado de filtro vive dentro del
 * useMemo de ModuleTabs.tsx; aquí se replica de forma aislada para testear el
 * comportamiento sin montar el componente.
 *
 * Ejecutar: bunx vitest run src/tests/module-filter.test.ts
 */
import { describe, it, expect } from 'vitest'
import { MODULOS } from '@/types'

// Réplica exacta del predicado de visibilidad usado en ModuleTabs.tsx
function modulosVisibles(mostrarNomenclaturas: boolean, mostrarFicha: boolean) {
  return MODULOS.filter(
    (modulo) =>
      (modulo.id !== 'nomenclaturas' || mostrarNomenclaturas) &&
      (modulo.id !== 'ficha' || mostrarFicha)
  )
}

describe('Filtro de módulos visibles — módulo Ficha condicional (tarea 2.5)', () => {
  const siempreVisibles = [
    'analisis',
    'georeferencia',
    'documentacion',
    'reportes',
    'sincronizacion',
    'materiales',
  ]

  it('oculta ficha y nomenclaturas por defecto (ambos flags en false)', () => {
    const ids = modulosVisibles(false, false).map((m) => m.id)
    expect(ids).not.toContain('ficha')
    expect(ids).not.toContain('nomenclaturas')
  })

  it('muestra ficha solo cuando mostrarFicha=true', () => {
    expect(modulosVisibles(false, false).map((m) => m.id)).not.toContain('ficha')
    expect(modulosVisibles(false, true).map((m) => m.id)).toContain('ficha')
  })

  it('nomenclaturas respeta su propio flag, independiente de mostrarFicha', () => {
    expect(modulosVisibles(false, true).map((m) => m.id)).not.toContain('nomenclaturas')
    expect(modulosVisibles(true, false).map((m) => m.id)).toContain('nomenclaturas')
    expect(modulosVisibles(true, true).map((m) => m.id)).toContain('nomenclaturas')
  })

  it('los módulos comunes siempre están visibles sin importar los flags', () => {
    for (const flagNom of [false, true]) {
      for (const flagFicha of [false, true]) {
        const ids = modulosVisibles(flagNom, flagFicha).map((m) => m.id)
        for (const id of siempreVisibles) {
          expect(ids).toContain(id)
        }
      }
    }
  })

  it('al activar ambos flags se ven los 8 módulos completos', () => {
    expect(modulosVisibles(true, true)).toHaveLength(MODULOS.length)
  })

  it('MODULOS incluye ficha y nomenclaturas (no se eliminaron del catálogo)', () => {
    const ids = MODULOS.map((m) => m.id)
    expect(ids).toContain('ficha')
    expect(ids).toContain('nomenclaturas')
  })
})
