// @vitest-environment jsdom
/**
 * Smoke test de GestorPuntos: monta el componente aislado (mock de useApp)
 * para tener una red de seguridad durante la descomposición estructural.
 * Ejecutar: npx vitest run src/tests/gestor-puntos.smoke.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const { stateRef, actions } = vi.hoisted(() => ({
  stateRef: {
    current: {
      puntos: [] as Array<Record<string, unknown>>,
      puntoActivo: null as Record<string, unknown> | null,
      nomenclaturasGlobales: [] as unknown[],
      moduloActivo: 'analisis',
      modulosOrden: [] as unknown[],
      plantillasFormato: [] as unknown[],
      plantillasPdfFormato: [] as unknown[],
      plantillasFicha: [] as unknown[],
      estadosGuardados: [] as unknown[],
    },
  },
  actions: {
    agregarPunto: vi.fn(),
    eliminarPunto: vi.fn(),
    setPuntoActivo: vi.fn(),
    actualizarPunto: vi.fn(),
    setNomenclaturasGlobales: vi.fn(),
    moverPunto: vi.fn(),
    toggleBloquearPunto: vi.fn(),
  },
}))

vi.mock('@/context/AppContext', () => ({
  useApp: () => ({ state: stateRef.current, ...actions }),
}))

const { GestorPuntos } = await import('@/components/GestorPuntos')

function makePunto(id: string, numeroSerie: number, nombre: string) {
  return {
    id,
    numeroSerie,
    nombre,
    descripcion: '',
    moduloData: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('GestorPuntos — smoke (render aislado)', () => {
  beforeEach(() => {
    stateRef.current.puntos = []
    stateRef.current.puntoActivo = null
    Object.values(actions).forEach((fn) => fn.mockReset())
  })

  afterEach(() => cleanup())

  it('monta sin puntos sin romper', () => {
    render(<GestorPuntos />)
    expect(screen.queryByLabelText(/Seleccionar /)).toBeNull()
  })

  it('renderiza los puntos de la lista', () => {
    stateRef.current.puntos = [makePunto('1', 1, 'Puente Río A'), makePunto('2', 2, 'Túnel Norte')]
    render(<GestorPuntos />)
    expect(screen.getByLabelText('Seleccionar Puente Río A')).toBeTruthy()
    expect(screen.getByLabelText('Seleccionar Túnel Norte')).toBeTruthy()
  })

  it('al hacer clic en el número de serie activa setPuntoActivo', () => {
    stateRef.current.puntos = [makePunto('1', 1, 'Puente Río A')]
    render(<GestorPuntos />)
    fireEvent.click(screen.getByTitle(/Seleccionar punto 1: Puente Río A/))
    expect(actions.setPuntoActivo).toHaveBeenCalledTimes(1)
  })

  it('alterna la selección al hacer clic en el checkbox del punto', () => {
    stateRef.current.puntos = [makePunto('1', 1, 'Puente Río A')]
    render(<GestorPuntos />)
    const checkbox = screen.getByRole('checkbox', { name: 'Seleccionar Puente Río A' })
    expect(checkbox.getAttribute('data-state')).toBe('unchecked')
    fireEvent.click(checkbox)
    expect(checkbox.getAttribute('data-state')).toBe('checked')
  })
})
