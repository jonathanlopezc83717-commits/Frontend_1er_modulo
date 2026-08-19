// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { createStore, AppStoreContext, useAppSelector, shallow } from '@/context/app-store'
import { appReducer } from '@/context/app-reducer'
import type { AppState, PuntoFerroviario } from '@/types'

vi.mock('@/lib/supabase-service', () => ({
  cargarPuntosDesdeDB: vi.fn().mockResolvedValue([]),
  sincronizarPuntos: vi.fn().mockResolvedValue({ success: true, guardados: 0 }),
  guardarCoordenadas: vi.fn().mockResolvedValue(undefined),
  guardarDocumentacion: vi.fn().mockResolvedValue(undefined),
  guardarAnalisis: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/snapshot-store', () => ({
  guardarSnapshotNAS: vi.fn().mockResolvedValue({ success: true }),
  listarSnapshotsNAS: vi.fn().mockResolvedValue([]),
  leerSnapshotNAS: vi.fn().mockResolvedValue(null),
  snapNASDisponible: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ proyectoActivoId: 'proyecto-test', perfil: null }),
}))
vi.mock('@/lib/storage', () => ({
  guardarEstado: vi.fn(),
  cargarEstado: vi.fn().mockReturnValue(null),
  cargarEstadoCompleto: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/template-file-store', () => ({
  cargarArchivosPlantilla: vi.fn().mockResolvedValue([]),
  guardarArchivosPlantilla: vi.fn(),
}))

const baseState: AppState = {
  puntos: [],
  puntoActivo: null,
  moduloActivo: 'analisis',
  modulosOrden: ['analisis', 'ficha'],
  nomenclaturasGlobales: [],
  plantillasFormato: [],
  plantillasPdfFormato: [],
  estadosGuardados: [],
  haExportadoPlantilla: false,
}

function makePunto(id: string, numeroSerie: number): PuntoFerroviario {
  return {
    id,
    numeroSerie,
    nombre: `Punto ${id}`,
    moduloData: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function renderWithStore(ui: ReactNode, state: Partial<AppState> = {}) {
  const store = createStore(appReducer, { ...baseState, ...state })
  const utils = render(createElement(AppStoreContext.Provider, { value: store }, ui))
  return { ...utils, store }
}

beforeEach(() => {
  cleanup()
})

describe('useAppSelector', () => {
  it('no genera bucle de render con selector de clave tope (render unico en montaje)', () => {
    const spy = vi.fn()
    function PuntosLen() {
      spy()
      const puntos = useAppSelector((s) => s.puntos)
      return createElement('div', { 'data-testid': 'p' }, puntos.length)
    }
    const { getByTestId } = renderWithStore(createElement(PuntosLen))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(getByTestId('p').textContent).toBe('0')
  })

  it('aislamiento de slice: dispatch en un slice no re-renderiza al consumidor de otro', () => {
    let moduloRenders = 0
    let puntosRenders = 0
    function ModuloC() {
      moduloRenders++
      const m = useAppSelector((s) => s.moduloActivo)
      return createElement('div', { 'data-testid': 'm' }, m)
    }
    function PuntosC() {
      puntosRenders++
      const p = useAppSelector((s) => s.puntos)
      return createElement('div', { 'data-testid': 'pc' }, p.length)
    }
    const { store } = renderWithStore(
      createElement('div', null, createElement(ModuloC), createElement(PuntosC))
    )
    const moduloBefore = moduloRenders
    const puntosBefore = puntosRenders

    act(() => {
      store.dispatch({ type: 'SET_MODULO_ACTIVO', payload: 'ficha' })
    })

    expect(moduloRenders).toBe(moduloBefore + 1)
    expect(puntosRenders).toBe(puntosBefore)
  })

  it('triangula a la inversa: dispatch en puntos re-renderiza solo al consumidor de puntos', () => {
    let moduloRenders = 0
    let puntosRenders = 0
    function ModuloC() {
      moduloRenders++
      useAppSelector((s) => s.moduloActivo)
      return null
    }
    function PuntosC() {
      puntosRenders++
      const p = useAppSelector((s) => s.puntos)
      return createElement('div', { 'data-testid': 'pc' }, p.length)
    }
    const { store, getByTestId } = renderWithStore(
      createElement('div', null, createElement(ModuloC), createElement(PuntosC))
    )
    expect(getByTestId('pc').textContent).toBe('0')
    const moduloBefore = moduloRenders
    const puntosBefore = puntosRenders

    act(() => {
      store.dispatch({ type: 'SET_PUNTOS', payload: [makePunto('a', 1), makePunto('b', 2)] })
    })

    expect(puntosRenders).toBe(puntosBefore + 1)
    expect(moduloRenders).toBe(moduloBefore)
    expect(getByTestId('pc').textContent).toBe('2')
  })

  it('shallow evita re-render cuando el selector derivado no cambia y detecta cuando cambia', () => {
    let renders = 0
    function Derived() {
      renders++
      const val = useAppSelector(
        (s) => ({ modulo: s.moduloActivo, orden: s.modulosOrden }),
        shallow
      )
      return createElement('div', { 'data-testid': 'd' }, val.modulo)
    }
    const { store } = renderWithStore(createElement(Derived))
    const before = renders

    act(() => {
      store.dispatch({ type: 'SET_PUNTOS', payload: [makePunto('a', 1)] })
    })
    expect(renders).toBe(before)

    act(() => {
      store.dispatch({ type: 'SET_MODULO_ACTIVO', payload: 'materiales' })
    })
    expect(renders).toBe(before + 1)
  })
})

describe('useAppActions y useApp (compat) con AppProvider', () => {
  it('useAppActions mantiene identidad estable a traves de re-renders por dispatch', async () => {
    const { AppProvider, useAppActions } = await import('@/context/AppContext')
    const actionsSeen: unknown[] = []
    function Probe() {
      const a = useAppActions()
      actionsSeen.push(a)
      const m = useAppSelector((s) => s.moduloActivo)
      return createElement(
        'button',
        { 'data-testid': 'b', onClick: () => a.setModuloActivo('ficha') },
        m
      )
    }
    const { getByTestId } = render(createElement(AppProvider, null, createElement(Probe)))

    await act(async () => {
      await Promise.resolve()
    })
    const afterMount = actionsSeen.length

    await act(async () => {
      fireEvent.click(getByTestId('b'))
    })

    expect(actionsSeen.length).toBeGreaterThan(afterMount)
    const first = actionsSeen[0]
    expect(actionsSeen.every((a) => a === first)).toBe(true)
  })

  it('useApp (compat) lee estado completo y dispatch muta el store', async () => {
    const { AppProvider, useApp } = await import('@/context/AppContext')
    function AppProbe() {
      const { state, dispatch } = useApp()
      return createElement(
        'div',
        null,
        createElement('span', { 'data-testid': 'mod' }, state.moduloActivo),
        createElement('button', {
          'data-testid': 'set',
          onClick: () => dispatch({ type: 'SET_MODULO_ACTIVO', payload: 'ficha' }),
        })
      )
    }
    const { getByTestId } = render(createElement(AppProvider, null, createElement(AppProbe)))

    await act(async () => {
      await Promise.resolve()
    })
    expect(getByTestId('mod').textContent).toBe('analisis')

    await act(async () => {
      fireEvent.click(getByTestId('set'))
    })
    expect(getByTestId('mod').textContent).toBe('ficha')
  })
})
