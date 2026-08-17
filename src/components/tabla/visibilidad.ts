import { createAtom } from '@tanstack/store'
import type { ColumnVisibilityState } from '@tanstack/react-table'

const CLAVE_VISIBILIDAD = 'sincronizacion:columnas:v1'

export function cargarVisibilidadColumnas(): ColumnVisibilityState {
  try {
    const crudo = localStorage.getItem(CLAVE_VISIBILIDAD)
    if (!crudo) return {}
    const parseado: unknown = JSON.parse(crudo)
    if (!parseado || typeof parseado !== 'object' || Array.isArray(parseado)) return {}
    const entradas = Object.entries(parseado as Record<string, unknown>)
    if (!entradas.every(([, valor]) => typeof valor === 'boolean')) return {}
    return Object.fromEntries(entradas) as ColumnVisibilityState
  } catch (error) {
    console.error('Error cargando visibilidad de columnas:', error)
    return {}
  }
}

export function guardarVisibilidadColumnas(estado: ColumnVisibilityState): void {
  try {
    localStorage.setItem(CLAVE_VISIBILIDAD, JSON.stringify(estado))
  } catch (error) {
    console.error('Error guardando visibilidad de columnas:', error)
  }
}

export const atomColumnVisibility = createAtom<ColumnVisibilityState>(cargarVisibilidadColumnas())

atomColumnVisibility.subscribe((estado) => guardarVisibilidadColumnas(estado))
