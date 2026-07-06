/**
 * Script de prueba para validar la lógica de puntos del AppContext (reducer + helpers).
 * Ejecutar con: npx tsx src/tests/puntos-logic.test.ts
 * O con Node: node --loader ts-node/esm src/tests/puntos-logic.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { appReducer as realAppReducer } from '@/context/app-reducer'
import type { AppState as RealAppState, AppAction as RealAppAction } from '@/types'

// ============ TIPOS ============
interface PuntoFerroviario {
  id: string
  numeroSerie: number
  nombre: string
  descripcion?: string
  carpetaPath?: string
  coordenadas?: { lat: number; lng: number }
  bloqueado?: boolean
  moduloData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface AppState {
  puntos: PuntoFerroviario[]
  puntoActivo: PuntoFerroviario | null
  moduloActivo: string
}

type AppAction =
  | { type: 'SET_PUNTOS'; payload: PuntoFerroviario[] }
  | { type: 'AGREGAR_PUNTO'; payload: { posicion: number; punto: Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'> } }
  | { type: 'ELIMINAR_PUNTO'; payload: string }
  | { type: 'SET_PUNTO_ACTIVO'; payload: PuntoFerroviario | null }
  | { type: 'ACTUALIZAR_PUNTO'; payload: { id: string; data: Partial<PuntoFerroviario> } }
  | { type: 'REORDENAR_PUNTOS'; payload: PuntoFerroviario[] }
  | { type: 'BLOQUEAR_PUNTO'; payload: string }
  | { type: 'RENUMERAR_PUNTOS'; payload: string[] }

// ============ HELPERS ============
function generarUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// appReducer delega al reducer real (slices en app-reducer.ts) — el test guarda código de producción.
// El cast es necesario porque el estado del test es un subconjunto del AppState real.
function appReducer(state: AppState, action: AppAction): AppState {
  return realAppReducer(state as unknown as RealAppState, action as unknown as RealAppAction) as unknown as AppState
}

// ============ HELPERS DEL GESTOR DE PUNTOS ============
function moverPunto(state: AppState, id: string, nuevaPosicion: number): AppState {
  const punto = state.puntos.find(p => p.id === id)
  if (!punto) return state

  const otrosPuntos = state.puntos.filter(p => p.id !== id)
  // Insertar el punto en la posicion deseada, luego reenumerar
  const nuevosPuntos = [
    ...otrosPuntos.slice(0, nuevaPosicion - 1),
    { ...punto, numeroSerie: nuevaPosicion },
    ...otrosPuntos.slice(nuevaPosicion - 1),
  ]

  return appReducer(state, { type: 'REORDENAR_PUNTOS', payload: nuevosPuntos })
}

function handleMoverArriba(state: AppState, puntoId: string): AppState {
  const puntosPorSerie = [...state.puntos].sort((a, b) => a.numeroSerie - b.numeroSerie)
  const idx = puntosPorSerie.findIndex(p => p.id === puntoId)
  if (idx <= 0) return state
  const puntoDestino = puntosPorSerie[idx - 1]
  return moverPunto(state, puntoId, puntoDestino.numeroSerie)
}

function handleMoverAbajo(state: AppState, puntoId: string): AppState {
  const puntosPorSerie = [...state.puntos].sort((a, b) => a.numeroSerie - b.numeroSerie)
  const idx = puntosPorSerie.findIndex(p => p.id === puntoId)
  if (idx < 0 || idx >= puntosPorSerie.length - 1) return state
  const puntoDestino = puntosPorSerie[idx + 1]
  return moverPunto(state, puntoId, puntoDestino.numeroSerie)
}

function handleReasignarNumeros(state: AppState, idsEnOrdenVisual: string[]): AppState {
  if (state.puntos.length === 0) return state
  // Usar RENUMERAR_PUNTOS para reordenar y reenumerar correctamente
  return appReducer(state, { type: 'RENUMERAR_PUNTOS', payload: idsEnOrdenVisual })
}

// ============ FIXTURES ============
function crearPuntoBase(overrides: Partial<PuntoFerroviario> = {}): PuntoFerroviario {
  return {
    id: generarUUID(),
    numeroSerie: overrides.numeroSerie ?? 1,
    nombre: overrides.nombre ?? 'Punto Test',
    descripcion: overrides.descripcion,
    carpetaPath: overrides.carpetaPath,
    coordenadas: overrides.coordenadas,
    bloqueado: overrides.bloqueado ?? false,
    moduloData: overrides.moduloData || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function crearEstadoConPuntos(cantidad: number): AppState {
  const puntos = Array.from({ length: cantidad }, (_, i) =>
    crearPuntoBase({ numeroSerie: i + 1, nombre: `Punto ${i + 1}` })
  )
  return {
    puntos,
    puntoActivo: puntos[0] || null,
    moduloActivo: 'analisis',
  }
}

// ============ TESTS ============
describe('AppReducer - Agregar Punto', () => {
  let estadoInicial: AppState

  beforeEach(() => {
    estadoInicial = { puntos: [], puntoActivo: null, moduloActivo: 'analisis' }
  })

  it('agrega el primer punto en posicion 1', () => {
    const nuevo = { nombre: 'A', moduloData: {} }
    const state = appReducer(estadoInicial, { type: 'AGREGAR_PUNTO', payload: { posicion: 1, punto: nuevo } })
    expect(state.puntos).toHaveLength(1)
    expect(state.puntos[0].numeroSerie).toBe(1)
    expect(state.puntos[0].nombre).toBe('A')
    expect(state.puntoActivo?.nombre).toBe('A')
  })

  it('agrega punto al inicio y reenumera los existentes', () => {
    let state = appReducer(estadoInicial, { type: 'AGREGAR_PUNTO', payload: { posicion: 1, punto: { nombre: 'A', moduloData: {} } } })
    state = appReducer(state, { type: 'AGREGAR_PUNTO', payload: { posicion: 1, punto: { nombre: 'B', moduloData: {} } } })
    expect(state.puntos.map(p => ({ n: p.numeroSerie, name: p.nombre }))).toEqual([
      { n: 1, name: 'B' },
      { n: 2, name: 'A' },
    ])
  })

  it('agrega punto en medio y reenumera', () => {
    let state = crearEstadoConPuntos(3)
    state = appReducer(state, { type: 'AGREGAR_PUNTO', payload: { posicion: 2, punto: { nombre: 'Nuevo', moduloData: {} } } })
    const series = state.puntos.map(p => p.numeroSerie)
    expect(series).toEqual([1, 2, 3, 4])
    expect(state.puntos.find(p => p.nombre === 'Nuevo')?.numeroSerie).toBe(2)
  })
})

describe('AppReducer - Eliminar Punto', () => {
  it('elimina un punto y reenumera', () => {
    const state = crearEstadoConPuntos(3)
    const idEliminar = state.puntos[1].id
    const newState = appReducer(state, { type: 'ELIMINAR_PUNTO', payload: idEliminar })
    expect(newState.puntos).toHaveLength(2)
    expect(newState.puntos.map(p => p.numeroSerie)).toEqual([1, 2])
  })

  it('si elimina el punto activo, selecciona el primero', () => {
    const state = crearEstadoConPuntos(3)
    const idEliminar = state.puntos[0].id
    const newState = appReducer(state, { type: 'ELIMINAR_PUNTO', payload: idEliminar })
    expect(newState.puntoActivo?.id).toBe(newState.puntos[0].id)
  })
})

describe('AppReducer - Actualizar Punto', () => {
  it('actualiza nombre y updatedAt', async () => {
    const state = crearEstadoConPuntos(2)
    const id = state.puntos[0].id
    const oldUpdatedAt = state.puntos[0].updatedAt
    // Pequeno delay para asegurar que updatedAt cambie
    await new Promise(r => setTimeout(r, 10))
    const newState = appReducer(state, { type: 'ACTUALIZAR_PUNTO', payload: { id, data: { nombre: 'Renombrado' } } })
    expect(newState.puntos.find(p => p.id === id)?.nombre).toBe('Renombrado')
    expect(newState.puntos.find(p => p.id === id)?.updatedAt).not.toBe(oldUpdatedAt)
  })

  it('actualiza coordenadas', () => {
    const state = crearEstadoConPuntos(1)
    const id = state.puntos[0].id
    const newState = appReducer(state, { type: 'ACTUALIZAR_PUNTO', payload: { id, data: { coordenadas: { lat: -33.5, lng: -70.6 } } } })
    expect(newState.puntos[0].coordenadas).toEqual({ lat: -33.5, lng: -70.6 })
  })
})

describe('AppReducer - Bloquear/Desbloquear Punto', () => {
  it('bloquea un punto', () => {
    const state = crearEstadoConPuntos(1)
    const id = state.puntos[0].id
    const newState = appReducer(state, { type: 'BLOQUEAR_PUNTO', payload: id })
    expect(newState.puntos[0].bloqueado).toBe(true)
  })

  it('desbloquea un punto bloqueado', () => {
    let state = crearEstadoConPuntos(1)
    const id = state.puntos[0].id
    state = appReducer(state, { type: 'BLOQUEAR_PUNTO', payload: id })
    state = appReducer(state, { type: 'BLOQUEAR_PUNTO', payload: id })
    expect(state.puntos[0].bloqueado).toBe(false)
  })
})

describe('AppReducer - Reordenar Puntos (Drag & Drop)', () => {
  it('mueve punto al inicio', () => {
    const state = crearEstadoConPuntos(3)
    const idMover = state.puntos[2].id // Punto 3
    const newState = moverPunto(state, idMover, 1)
    expect(newState.puntos[0].nombre).toBe('Punto 3')
    expect(newState.puntos.map(p => p.numeroSerie)).toEqual([1, 2, 3])
  })

  it('mueve punto al final', () => {
    const state = crearEstadoConPuntos(3)
    const idMover = state.puntos[0].id // Punto 1
    const newState = moverPunto(state, idMover, 3)
    expect(newState.puntos[2].nombre).toBe('Punto 1')
    expect(newState.puntos.map(p => p.numeroSerie)).toEqual([1, 2, 3])
  })

  it('mueve punto al medio', () => {
    const state = crearEstadoConPuntos(4)
    const idMover = state.puntos[3].id // Punto 4
    const newState = moverPunto(state, idMover, 2)
    expect(newState.puntos[1].nombre).toBe('Punto 4')
    expect(newState.puntos.map(p => p.numeroSerie)).toEqual([1, 2, 3, 4])
  })
})

describe('GestorPuntos - Mover Arriba/Abajo', () => {
  it('mueve punto hacia arriba (intercambia con el anterior)', () => {
    const state = crearEstadoConPuntos(3)
    const id = state.puntos[1].id // Punto 2
    const newState = handleMoverArriba(state, id)
    expect(newState.puntos[0].nombre).toBe('Punto 2')
    expect(newState.puntos[1].nombre).toBe('Punto 1')
    expect(newState.puntos.map(p => p.numeroSerie)).toEqual([1, 2, 3])
  })

  it('no mueve el primer punto hacia arriba', () => {
    const state = crearEstadoConPuntos(3)
    const id = state.puntos[0].id
    const newState = handleMoverArriba(state, id)
    expect(newState.puntos[0].nombre).toBe('Punto 1')
  })

  it('mueve punto hacia abajo (intercambia con el siguiente)', () => {
    const state = crearEstadoConPuntos(3)
    const id = state.puntos[1].id // Punto 2
    const newState = handleMoverAbajo(state, id)
    expect(newState.puntos[1].nombre).toBe('Punto 3')
    expect(newState.puntos[2].nombre).toBe('Punto 2')
    expect(newState.puntos.map(p => p.numeroSerie)).toEqual([1, 2, 3])
  })

  it('no mueve el ultimo punto hacia abajo', () => {
    const state = crearEstadoConPuntos(3)
    const id = state.puntos[2].id
    const newState = handleMoverAbajo(state, id)
    expect(newState.puntos[2].nombre).toBe('Punto 3')
  })
})

describe('GestorPuntos - Reasignar Numeros de Serie', () => {
  it('reasigna numeros segun orden visual', () => {
    const state = crearEstadoConPuntos(3)
    // Orden visual invertido: 3, 2, 1
    const idsInvertidos = [state.puntos[2].id, state.puntos[1].id, state.puntos[0].id]
    const newState = handleReasignarNumeros(state, idsInvertidos)
    expect(newState.puntos[0].numeroSerie).toBe(1)
    expect(newState.puntos[1].numeroSerie).toBe(2)
    expect(newState.puntos[2].numeroSerie).toBe(3)
    expect(newState.puntos[0].nombre).toBe('Punto 3')
    expect(newState.puntos[2].nombre).toBe('Punto 1')
  })
})

describe('AppReducer - SET_PUNTOS', () => {
  it('carga puntos desde fuente externa y reenumera', () => {
    const puntosDesordenados = [
      crearPuntoBase({ numeroSerie: 5, nombre: 'C' }),
      crearPuntoBase({ numeroSerie: 2, nombre: 'A' }),
      crearPuntoBase({ numeroSerie: 10, nombre: 'B' }),
    ]
    const state = appReducer(estadoInicial, { type: 'SET_PUNTOS', payload: puntosDesordenados })
    expect(state.puntos.map(p => p.numeroSerie)).toEqual([1, 2, 3])
    // reenumerarPuntos ordena primero por numeroSerie ascendente:
    // serie 2(A), serie 5(C), serie 10(B) -> renumerados a 1,2,3
    expect(state.puntos.map(p => p.nombre)).toEqual(['A', 'C', 'B'])
  })
})

describe('AppReducer - RENUMERAR_PUNTOS', () => {
  it('renumera segun array de IDs', () => {
    const state = crearEstadoConPuntos(3)
    const idsOrdenados = [state.puntos[2].id, state.puntos[0].id, state.puntos[1].id]
    const newState = appReducer(state, { type: 'RENUMERAR_PUNTOS', payload: idsOrdenados })
    expect(newState.puntos[0].nombre).toBe('Punto 3')
    expect(newState.puntos[1].nombre).toBe('Punto 1')
    expect(newState.puntos[2].nombre).toBe('Punto 2')
    expect(newState.puntos.map(p => p.numeroSerie)).toEqual([1, 2, 3])
  })
})

// Estado inicial para tests que lo necesiten
const estadoInicial: AppState = { puntos: [], puntoActivo: null, moduloActivo: 'analisis' }
