// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const { actions } = vi.hoisted(() => ({
  actions: {
    setModuloActivo: vi.fn(),
    setPuntoActivo: vi.fn(),
  },
}))

vi.mock('@/context/AppContext', () => ({
  useAppActions: () => actions,
  useAppSelector: (selector: (s: unknown) => unknown) => selector({}),
}))

const { BarraProgresoPunto } = await import('@/components/BarraProgresoPunto')
const { COORDS_BASE_FICHA } = await import('@/lib/progreso-punto')
const { EVENTO_FOCO_CAMPO } = await import('@/lib/foco-campo')
import type { PuntoFerroviario } from '@/types'

const valores = Object.fromEntries(COORDS_BASE_FICHA.slice(0, 3).map(c => [c, 'x']))

const punto = {
  id: 'p1',
  numeroSerie: 1,
  nombre: 'Puente Río A',
  moduloData: {
    analisis: { fotosIndexadas: [{ id: 'f1' }], results: [{ id: 'r1' }] },
    materiales: { valores, plantillaActivaId: 'pl-1' },
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as PuntoFerroviario

function botones() {
  return screen.getAllByRole('button')
}

describe('BarraProgresoPunto', () => {
  beforeEach(() => {
    Object.values(actions).forEach(fn => fn.mockReset())
  })

  afterEach(() => cleanup())

  it('renderiza 5 segmentos con aria-label y clases done/current/pending', () => {
    render(<BarraProgresoPunto punto={punto} plantillas={[{ id: 'pl-1' }]} esActivo={false} />)
    const segmentos = botones()
    expect(segmentos).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Punto: Cargar puntos o carpetas' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fotos: Elegir foto o fotos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Análisis: Realizar análisis' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Plantilla: Elegir una plantilla guardada' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Campos: Completar campos del formato' })).toBeTruthy()
    expect(segmentos[0].className).toContain('bg-primary')
    expect(segmentos[1].className).toContain('bg-primary')
    expect(segmentos[2].className).toContain('bg-primary')
    expect(segmentos[3].className).toContain('bg-primary')
    expect(segmentos[4].className).toContain('bg-primary/40')
    expect(segmentos[4].className).toContain('animate-pulse')
  })

  it('punto sin datos: primer paso done, segundo current y el resto pending con bg-muted', () => {
    const vacio = { ...punto, moduloData: {} } as unknown as PuntoFerroviario
    render(<BarraProgresoPunto punto={vacio} plantillas={[]} esActivo />)
    const segmentos = botones()
    expect(segmentos[0].className).toContain('bg-primary')
    expect(segmentos[1].className).toContain('animate-pulse')
    expect(segmentos[2].className).toContain('bg-muted')
    expect(segmentos[3].className).toContain('bg-muted')
    expect(segmentos[4].className).toContain('bg-muted')
  })

  it('el title del grupo resume el estado de los pasos', () => {
    render(<BarraProgresoPunto punto={punto} plantillas={[{ id: 'pl-1' }]} esActivo={false} />)
    const grupo = screen.getByRole('group')
    expect(grupo.getAttribute('title')).toBe('Punto ✓ · Fotos ✓ · Análisis ✓ · Plantilla ✓ · Campos 3/7')
  })

  it('clic en Análisis navega al módulo analisis y selecciona el punto si no está activo', () => {
    render(<BarraProgresoPunto punto={punto} plantillas={[{ id: 'pl-1' }]} esActivo={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Análisis: Realizar análisis' }))
    expect(actions.setModuloActivo).toHaveBeenCalledWith('analisis')
    expect(actions.setPuntoActivo).toHaveBeenCalledTimes(1)
  })

  it('no re-selecciona el punto cuando ya está activo', () => {
    render(<BarraProgresoPunto punto={punto} plantillas={[{ id: 'pl-1' }]} esActivo />)
    fireEvent.click(screen.getByRole('button', { name: 'Fotos: Elegir foto o fotos' }))
    expect(actions.setPuntoActivo).not.toHaveBeenCalled()
    expect(actions.setModuloActivo).toHaveBeenCalledWith('analisis')
  })

  it('clic en Campos con campos faltantes navega a materiales y emite foco-campo-faltante con el primer coord', () => {
    const eventos: Array<{ puntoId: string; coord: string }> = []
    const listener = (e: Event) => {
      eventos.push((e as CustomEvent<{ puntoId: string; coord: string }>).detail)
    }
    window.addEventListener(EVENTO_FOCO_CAMPO, listener)
    render(<BarraProgresoPunto punto={punto} plantillas={[{ id: 'pl-1' }]} esActivo />)
    fireEvent.click(screen.getByRole('button', { name: 'Campos: Completar campos del formato' }))
    window.removeEventListener(EVENTO_FOCO_CAMPO, listener)
    expect(actions.setModuloActivo).toHaveBeenCalledWith('materiales')
    expect(eventos).toEqual([{ puntoId: 'p1', coord: '1-F' }])
  })

  it('clic en Campos sin campos faltantes navega sin emitir el evento de foco', () => {
    const listener = vi.fn()
    window.addEventListener(EVENTO_FOCO_CAMPO, listener)
    const completo = {
      ...punto,
      moduloData: {
        ...punto.moduloData,
        materiales: {
          valores: Object.fromEntries(COORDS_BASE_FICHA.map(c => [c, 'x'])),
          plantillaActivaId: 'pl-1',
        },
      },
    } as PuntoFerroviario
    render(<BarraProgresoPunto punto={completo} plantillas={[{ id: 'pl-1' }]} esActivo />)
    fireEvent.click(screen.getByRole('button', { name: 'Campos: Completar campos del formato' }))
    window.removeEventListener(EVENTO_FOCO_CAMPO, listener)
    expect(actions.setModuloActivo).toHaveBeenCalledWith('materiales')
    expect(listener).not.toHaveBeenCalled()
  })
})
