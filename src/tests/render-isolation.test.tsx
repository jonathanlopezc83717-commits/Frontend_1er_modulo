// @vitest-environment jsdom
//
// Regression / approval test for the slice-scoped re-render invariant
// (spec: perf-modulo-render, "Slice-Scoped Re-render").
//
// It proves the MECHANISM end-to-end through the REAL store + REAL reducer:
// a dispatch that changes a nested `moduloData` sub-key re-renders ONLY the
// consumer selecting that sub-key. A consumer selecting a different sub-key
// renders 0 additional times, because `ACTUALIZAR_PUNTO` rebuilds the
// `puntoActivo` ref but preserves sibling `moduloData` sub-key refs.
//
// This is an approval test: the store already isolates (PR 1), so it goes
// GREEN on first run. Its job is to GUARD the PR 2 call-site migration: if a
// future change makes the store re-render every consumer again, this fails.
import { describe, it, expect, beforeEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { createElement } from 'react'
import { createStore, AppStoreContext, useAppSelector, shallow, type AppStore } from '@/context/app-store'
import { appReducer } from '@/context/app-reducer'
import type { AppState, PuntoFerroviario } from '@/types'

function makePunto(): PuntoFerroviario {
  return {
    id: 'p1',
    numeroSerie: 1,
    nombre: 'Punto uno',
    moduloData: {
      materiales: { valores: { a: '1' } },
      ficha: { contenido: 'ficha-inicial' },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const baseState: AppState = {
  puntos: [],
  puntoActivo: makePunto(),
  moduloActivo: 'materiales',
  modulosOrden: null,
  nomenclaturasGlobales: [],
  plantillasFormato: [],
  plantillasPdfFormato: [],
  plantillasFicha: [],
  estadosGuardados: [],
}

function renderWithStore(ui: React.ReactNode) {
  const store = createStore(appReducer, baseState)
  const utils = render(createElement(AppStoreContext.Provider, { value: store }, ui))
  return { ...utils, store }
}

// Mimics exactly what a migrated module does on save: spread the CURRENT
// moduloData so sibling sub-keys keep their refs, then update only its own key.
function actualizarModuloKey(
  store: AppStore,
  puntoId: string,
  key: string,
  value: unknown
) {
  const live = store.getState().puntoActivo
  act(() => {
    store.dispatch({
      type: 'ACTUALIZAR_PUNTO',
      payload: {
        id: puntoId,
        data: { moduloData: { ...(live?.moduloData || {}), [key]: value } },
      },
    })
  })
}

beforeEach(() => {
  cleanup()
})

describe('render-isolation: slice-scoped re-render (moduloData sub-keys)', () => {
  it('editar materiales re-renderiza solo al consumidor de materiales, no al de ficha', () => {
    let materialesRenders = 0
    let fichaRenders = 0
    function MaterialesProbe() {
      materialesRenders++
      const mat = useAppSelector((s) => s.puntoActivo?.moduloData?.materiales)
      return createElement('div', { 'data-testid': 'mat' }, String((mat as { valores?: Record<string, string> } | undefined)?.valores?.a ?? ''))
    }
    function FichaProbe() {
      fichaRenders++
      const ficha = useAppSelector((s) => s.puntoActivo?.moduloData?.ficha)
      return createElement('div', { 'data-testid': 'fic' }, String((ficha as { contenido?: string } | undefined)?.contenido ?? ''))
    }
    const { store, getByTestId } = renderWithStore(
      createElement('div', null, createElement(MaterialesProbe), createElement(FichaProbe))
    )
    // Baseline after mount.
    expect(getByTestId('mat').textContent).toBe('1')
    expect(getByTestId('fic').textContent).toBe('ficha-inicial')
    const matBefore = materialesRenders
    const ficBefore = fichaRenders

    actualizarModuloKey(store, 'p1', 'materiales', { valores: { a: '2' } })

    // Materiales changed -> its consumer re-renders exactly once with the new value.
    expect(materialesRenders).toBe(matBefore + 1)
    expect(getByTestId('mat').textContent).toBe('2')
    // Ficha's sub-key ref was preserved by the spread -> its consumer renders 0 extra times.
    expect(fichaRenders).toBe(ficBefore)
    expect(getByTestId('fic').textContent).toBe('ficha-inicial')
  })

  it('triangula a la inversa: editar ficha no re-renderiza al consumidor de materiales', () => {
    let materialesRenders = 0
    let fichaRenders = 0
    function MaterialesProbe() {
      materialesRenders++
      useAppSelector((s) => s.puntoActivo?.moduloData?.materiales)
      return null
    }
    function FichaProbe() {
      fichaRenders++
      const ficha = useAppSelector((s) => s.puntoActivo?.moduloData?.ficha)
      return createElement('div', { 'data-testid': 'fic' }, String((ficha as { contenido?: string } | undefined)?.contenido ?? ''))
    }
    const { store, getByTestId } = renderWithStore(
      createElement('div', null, createElement(MaterialesProbe), createElement(FichaProbe))
    )
    expect(getByTestId('fic').textContent).toBe('ficha-inicial')
    const matBefore = materialesRenders
    const ficBefore = fichaRenders

    actualizarModuloKey(store, 'p1', 'ficha', { contenido: 'ficha-editada' })

    expect(fichaRenders).toBe(ficBefore + 1)
    expect(getByTestId('fic').textContent).toBe('ficha-editada')
    expect(materialesRenders).toBe(matBefore)
  })

  it('un selector derivado multi-clave con shallow no hace bucle cuando nada relevante cambia', () => {
    let renders = 0
    function HeaderProbe() {
      renders++
      const info = useAppSelector(
        (s) => ({
          id: s.puntoActivo?.id,
          numeroSerie: s.puntoActivo?.numeroSerie,
          nombre: s.puntoActivo?.nombre,
        }),
        shallow
      )
      return createElement('div', { 'data-testid': 'h' }, `${info.numeroSerie}-${info.nombre}`)
    }
    const { store, getByTestId } = renderWithStore(createElement(HeaderProbe))
    expect(getByTestId('h').textContent).toBe('1-Punto uno')
    const before = renders

    // Edit materiales: the header fields are untouched -> shallow bailout -> 0 extra renders.
    actualizarModuloKey(store, 'p1', 'materiales', { valores: { a: '99' } })
    expect(renders).toBe(before)

    // Renombrar el punto SI cambia nombre -> el header re-renderiza una vez.
    act(() => {
      store.dispatch({ type: 'ACTUALIZAR_PUNTO', payload: { id: 'p1', data: { nombre: 'Otro' } } })
    })
    expect(renders).toBe(before + 1)
    expect(getByTestId('h').textContent).toBe('1-Otro')
  })

  it('no genera bucle de render ("Maximum update depth exceeded" ausente) con selector de sub-clave', () => {
    // Si getSnapshot devolviera un ref nuevo en cada llamada, useSyncExternalStore
    // entraria en bucle infinito. Este test falla (timeout / error de React) si eso pasa.
    let renders = 0
    function SafeProbe() {
      renders++
      useAppSelector((s) => s.puntoActivo?.moduloData?.ficha)
      return null
    }
    renderWithStore(createElement(SafeProbe))
    // Un montaje sano renderiza exactamente una vez; no cientos.
    expect(renders).toBe(1)
  })
})
