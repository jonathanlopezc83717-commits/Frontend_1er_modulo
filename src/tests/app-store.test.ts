import { describe, it, expect } from 'vitest'
import { createStore, shallow } from '@/context/app-store'

type CounterState = { count: number; label: string }
type CounterAction =
  | { type: 'INC' }
  | { type: 'SET_LABEL'; label: string }
  | { type: 'NOOP' }

function counterReducer(state: CounterState, action: CounterAction): CounterState {
  switch (action.type) {
    case 'INC':
      return { ...state, count: state.count + 1 }
    case 'SET_LABEL':
      return { ...state, label: action.label }
    case 'NOOP':
      return state
    default:
      return state
  }
}

describe('createStore', () => {
  it('devuelve el estado inicial por getState', () => {
    const store = createStore(counterReducer, { count: 0, label: 'a' })
    expect(store.getState()).toEqual({ count: 0, label: 'a' })
  })

  it('dispatch INC incrementa el contador en getState', () => {
    const store = createStore(counterReducer, { count: 0, label: 'a' })
    store.dispatch({ type: 'INC' })
    expect(store.getState().count).toBe(1)
  })

  it('triangula: multiples INC acumulan correctamente', () => {
    const store = createStore(counterReducer, { count: 10, label: 'a' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    expect(store.getState().count).toBe(13)
  })

  it('subscribe notifica al listener en cada dispatch con cambio', () => {
    const store = createStore(counterReducer, { count: 0, label: 'a' })
    let calls = 0
    const unsub = store.subscribe(() => { calls++ })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'SET_LABEL', label: 'b' })
    expect(calls).toBe(2)
    unsub()
  })

  it('subscribe unsubscribe detiene las notificaciones', () => {
    const store = createStore(counterReducer, { count: 0, label: 'a' })
    let calls = 0
    const unsub = store.subscribe(() => { calls++ })
    unsub()
    store.dispatch({ type: 'INC' })
    expect(calls).toBe(0)
  })

  it('getSnapshot devuelve la misma referencia mientras el estado no cambia (===)', () => {
    const store = createStore(counterReducer, { count: 0, label: 'a' })
    const before = store.getSnapshot()
    store.dispatch({ type: 'NOOP' })
    const after = store.getSnapshot()
    expect(after).toBe(before)
  })

  it('getSnapshot cambia de referencia cuando el reducer devuelve estado nuevo', () => {
    const store = createStore(counterReducer, { count: 0, label: 'a' })
    const before = store.getSnapshot()
    store.dispatch({ type: 'INC' })
    const after = store.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.count).toBe(1)
  })

  it('un dispatch que no cambia el estado (misma ref) no notifica listeners', () => {
    const store = createStore(counterReducer, { count: 0, label: 'a' })
    let calls = 0
    store.subscribe(() => { calls++ })
    store.dispatch({ type: 'NOOP' })
    expect(calls).toBe(0)
  })

  it('varios listeners son todos notificados', () => {
    const store = createStore(counterReducer, { count: 0, label: 'a' })
    let a = 0
    let b = 0
    store.subscribe(() => { a++ })
    store.subscribe(() => { b++ })
    store.dispatch({ type: 'INC' })
    expect(a).toBe(1)
    expect(b).toBe(1)
  })
})

describe('shallow', () => {
  it('iguales en mismas claves y valores', () => {
    expect(shallow({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
  })

  it('diferentes por valor de una clave', () => {
    expect(shallow({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('diferentes por cantidad de claves', () => {
    expect(shallow({ a: 1, b: 2 }, { a: 1 })).toBe(false)
    expect(shallow({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('primitivas iguales por Object.is', () => {
    expect(shallow(1, 1)).toBe(true)
    expect(shallow('x', 'x')).toBe(true)
    expect(shallow(1, 2)).toBe(false)
  })

  it('null e identificadores especiales', () => {
    expect(shallow(null, null)).toBe(true)
    expect(shallow(null, {})).toBe(false)
    expect(shallow({}, null)).toBe(false)
  })

  it('arrays iguales shallowmente', () => {
    expect(shallow([1, 2], [1, 2])).toBe(true)
    expect(shallow([1, 2], [1, 3])).toBe(false)
    expect(shallow([1, 2], [1, 2, 3])).toBe(false)
  })

  it('objetos anidados se comparan por identidad, no profundo', () => {
    const nested = { x: 1 }
    expect(shallow({ a: nested }, { a: nested })).toBe(true)
    expect(shallow({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false)
  })
})
