import type { AppState, AppAction } from '@/types'

export interface Store<S, A> {
  getState: () => S
  getSnapshot: () => S
  subscribe: (listener: () => void) => () => void
  dispatch: (action: A) => void
}

export function createStore<S, A>(
  reducer: (state: S, action: A) => S,
  initialState: S
): Store<S, A> {
  let state = initialState
  const listeners = new Set<() => void>()

  return {
    getState: () => state,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispatch: (action: A) => {
      const next = reducer(state, action)
      if (next !== state) {
        state = next
        listeners.forEach((l) => l())
      }
    },
  }
}

export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false
  }
  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    const av = (a as Record<string, unknown>)[key]
    const bv = (b as Record<string, unknown>)[key]
    if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(av, bv)) {
      return false
    }
  }
  return true
}

export type AppStore = Store<AppState, AppAction>
