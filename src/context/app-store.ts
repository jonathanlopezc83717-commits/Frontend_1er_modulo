import { createContext, useContext, useSyncExternalStore, useRef } from 'react'
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

export const AppStoreContext = createContext<AppStore | null>(null)

// Imperative access to the live store. Needed by consumers that, after
// narrowing their `useAppSelector` reads, still must read the CURRENT state at
// write-time (e.g. spreading `puntoActivo.moduloData` to preserve sibling keys)
// or load data on point-change. Selectors only give a render snapshot, which
// goes stale when a consumer no longer re-renders on sibling edits; reading
// live avoids clobbering a concurrent sibling save.
export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext)
  if (!store) {
    throw new Error('useAppStore debe usarse dentro de un AppProvider')
  }
  return store
}

export function useAppSelector<T>(
  selector: (state: AppState) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  const store = useContext(AppStoreContext)
  if (!store) {
    throw new Error('useAppSelector debe usarse dentro de un AppProvider')
  }
  const cacheRef = useRef<{ value: T } | null>(null)
  const getSelection = () => {
    const next = selector(store.getSnapshot())
    if (cacheRef.current && (equalityFn ?? Object.is)(next, cacheRef.current.value)) {
      return cacheRef.current.value
    }
    cacheRef.current = { value: next }
    return next
  }
  return useSyncExternalStore(store.subscribe, getSelection, getSelection)
}
