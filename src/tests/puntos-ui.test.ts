/**
 * Script de prueba para validar helpers del GestorPuntos (UI / ordenamiento / seleccion).
 * Ejecutar con: npx vitest run src/tests/puntos-ui.test.ts
 */

import { describe, it, expect } from 'vitest'

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

// ============ HELPERS DEL GESTORPUNTOS (extraidos del componente) ============

type SortKey = 'manual' | 'nombre-asc' | 'nombre-desc' | 'fecha-asignada-asc' | 'fecha-asignada-desc' | 'fecha-ingreso-asc' | 'fecha-ingreso-desc'

function ordenarPuntos(puntos: PuntoFerroviario[], sortKey: SortKey): PuntoFerroviario[] {
  const copia = [...puntos]
  switch (sortKey) {
    case 'nombre-asc':
      return copia.sort((a, b) => a.nombre.localeCompare(b.nombre))
    case 'nombre-desc':
      return copia.sort((a, b) => b.nombre.localeCompare(a.nombre))
    case 'fecha-asignada-asc':
      return copia.sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''))
    case 'fecha-asignada-desc':
      return copia.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    case 'fecha-ingreso-asc':
      return copia.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    case 'fecha-ingreso-desc':
      return copia.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    case 'manual':
    default:
      return copia.sort((a, b) => a.numeroSerie - b.numeroSerie)
  }
}

function toggleSeleccionarTodo(puntos: PuntoFerroviario[], selectedIds: Set<string>): Set<string> {
  const todosSeleccionados = puntos.length > 0 && selectedIds.size === puntos.length
  if (todosSeleccionados) {
    return new Set()
  } else {
    return new Set(puntos.map(p => p.id))
  }
}

function toggleSeleccionarPunto(selectedIds: Set<string>, id: string): Set<string> {
  const next = new Set(selectedIds)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function formatFecha(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })
}

// Helpers de validacion de formulario de edicion
function validarCoordenadas(lat: string, lng: string): { valido: boolean; coordenadas?: { lat: number; lng: number }; error?: string } {
  if (!lat && !lng) return { valido: true }
  const latNum = parseFloat(lat)
  const lngNum = parseFloat(lng)
  if (isNaN(latNum) || isNaN(lngNum)) {
    return { valido: false, error: 'Coordenadas invalidas' }
  }
  if (latNum < -90 || latNum > 90) {
    return { valido: false, error: 'Latitud fuera de rango' }
  }
  if (lngNum < -180 || lngNum > 180) {
    return { valido: false, error: 'Longitud fuera de rango' }
  }
  return { valido: true, coordenadas: { lat: latNum, lng: lngNum } }
}

function validarNombre(nombre: string): { valido: boolean; error?: string } {
  if (!nombre.trim()) {
    return { valido: false, error: 'El nombre es obligatorio' }
  }
  if (nombre.trim().length < 2) {
    return { valido: false, error: 'El nombre debe tener al menos 2 caracteres' }
  }
  return { valido: true }
}

// ============ FIXTURES ============
function crearPunto(overrides: Partial<PuntoFerroviario> = {}): PuntoFerroviario {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    numeroSerie: overrides.numeroSerie ?? 1,
    nombre: overrides.nombre ?? 'Punto',
    moduloData: {},
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    ...overrides,
  }
}

// ============ TESTS ============
describe('Ordenamiento de puntos', () => {
  const puntos = [
    crearPunto({ numeroSerie: 1, nombre: 'Zona B', createdAt: '2024-01-15T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z' }),
    crearPunto({ numeroSerie: 2, nombre: 'Zona A', createdAt: '2024-01-10T00:00:00Z', updatedAt: '2024-06-05T00:00:00Z' }),
    crearPunto({ numeroSerie: 3, nombre: 'Central', createdAt: '2024-01-20T00:00:00Z', updatedAt: '2024-05-20T00:00:00Z' }),
  ]

  it('ordena manualmente por numeroSerie', () => {
    const ordenados = ordenarPuntos(puntos, 'manual')
    expect(ordenados.map(p => p.nombre)).toEqual(['Zona B', 'Zona A', 'Central'])
  })

  it('ordena por nombre ascendente', () => {
    const ordenados = ordenarPuntos(puntos, 'nombre-asc')
    expect(ordenados.map(p => p.nombre)).toEqual(['Central', 'Zona A', 'Zona B'])
  })

  it('ordena por nombre descendente', () => {
    const ordenados = ordenarPuntos(puntos, 'nombre-desc')
    expect(ordenados.map(p => p.nombre)).toEqual(['Zona B', 'Zona A', 'Central'])
  })

  it('ordena por fecha asignada descendente', () => {
    const ordenados = ordenarPuntos(puntos, 'fecha-asignada-desc')
    expect(ordenados.map(p => p.nombre)).toEqual(['Zona A', 'Zona B', 'Central'])
  })

  it('ordena por fecha asignada ascendente', () => {
    const ordenados = ordenarPuntos(puntos, 'fecha-asignada-asc')
    expect(ordenados.map(p => p.nombre)).toEqual(['Central', 'Zona B', 'Zona A'])
  })

  it('ordena por fecha ingreso ascendente', () => {
    const ordenados = ordenarPuntos(puntos, 'fecha-ingreso-asc')
    expect(ordenados.map(p => p.nombre)).toEqual(['Zona A', 'Zona B', 'Central'])
  })

  it('ordena por fecha ingreso descendente', () => {
    const ordenados = ordenarPuntos(puntos, 'fecha-ingreso-desc')
    expect(ordenados.map(p => p.nombre)).toEqual(['Central', 'Zona B', 'Zona A'])
  })
})

describe('Seleccion de puntos', () => {
  const puntos = [
    crearPunto({ numeroSerie: 1, nombre: 'P1' }),
    crearPunto({ numeroSerie: 2, nombre: 'P2' }),
    crearPunto({ numeroSerie: 3, nombre: 'P3' }),
  ]

  it('selecciona todos los puntos', () => {
    const selected = toggleSeleccionarTodo(puntos, new Set())
    expect(selected.size).toBe(3)
    expect(selected.has(puntos[0].id)).toBe(true)
  })

  it('deselecciona todos si ya estan todos seleccionados', () => {
    const prev = new Set(puntos.map(p => p.id))
    const selected = toggleSeleccionarTodo(puntos, prev)
    expect(selected.size).toBe(0)
  })

  it('toggle agrega un punto a la seleccion', () => {
    const selected = toggleSeleccionarPunto(new Set(), puntos[0].id)
    expect(selected.has(puntos[0].id)).toBe(true)
  })

  it('toggle quita un punto de la seleccion', () => {
    const prev = new Set([puntos[0].id])
    const selected = toggleSeleccionarPunto(prev, puntos[0].id)
    expect(selected.has(puntos[0].id)).toBe(false)
  })
})

describe('Formato de fechas', () => {
  it('formatea fecha ISO a formato es-CL', () => {
    const resultado = formatFecha('2024-06-15T12:00:00Z')
    // Formato es-CL devuelve algo como "15 jun 24" (con espacios)
    expect(resultado).not.toBe('—')
    expect(resultado).toMatch(/\d{1,2}\s+\w+\s+\d{2}/)
  })

  it('retorna em-dash para fecha undefined', () => {
    expect(formatFecha(undefined)).toBe('—')
  })

  it('retorna em-dash para string vacio', () => {
    expect(formatFecha('')).toBe('—')
  })
})

describe('Validacion de coordenadas', () => {
  it('acepta coordenadas validas', () => {
    const result = validarCoordenadas('-33.4567', '-70.6789')
    expect(result.valido).toBe(true)
    expect(result.coordenadas).toEqual({ lat: -33.4567, lng: -70.6789 })
  })

  it('acepta campos vacios (opcional)', () => {
    const result = validarCoordenadas('', '')
    expect(result.valido).toBe(true)
  })

  it('rechaza latitud fuera de rango', () => {
    const result = validarCoordenadas('95', '-70')
    expect(result.valido).toBe(false)
    expect(result.error).toContain('Latitud')
  })

  it('rechaza longitud fuera de rango', () => {
    const result = validarCoordenadas('-33', '200')
    expect(result.valido).toBe(false)
    expect(result.error).toContain('Longitud')
  })

  it('rechaza texto no numerico', () => {
    const result = validarCoordenadas('abc', 'def')
    expect(result.valido).toBe(false)
    expect(result.error).toContain('invalidas')
  })
})

describe('Validacion de nombre', () => {
  it('acepta nombre valido', () => {
    const result = validarNombre('Punto Central')
    expect(result.valido).toBe(true)
  })

  it('rechaza nombre vacio', () => {
    const result = validarNombre('')
    expect(result.valido).toBe(false)
    expect(result.error).toContain('obligatorio')
  })

  it('rechaza nombre con solo espacios', () => {
    const result = validarNombre('   ')
    expect(result.valido).toBe(false)
  })

  it('rechaza nombre muy corto', () => {
    const result = validarNombre('A')
    expect(result.valido).toBe(false)
    expect(result.error).toContain('2 caracteres')
  })
})

describe('Escenario completo: flujo de edicion', () => {
  it('simula edicion completa de un punto', () => {
    const punto = crearPunto({ nombre: 'Original', descripcion: 'Desc', coordenadas: { lat: 0, lng: 0 } })

    // 1. Validar nuevo nombre
    const nombreValido = validarNombre('Nuevo Nombre')
    expect(nombreValido.valido).toBe(true)

    // 2. Validar nuevas coordenadas
    const coordsValidas = validarCoordenadas('-33.5', '-70.6')
    expect(coordsValidas.valido).toBe(true)

    // 3. Simular actualizacion
    const actualizado = {
      ...punto,
      nombre: 'Nuevo Nombre',
      descripcion: 'Nueva descripcion',
      coordenadas: coordsValidas.coordenadas,
      updatedAt: new Date().toISOString(),
    }

    expect(actualizado.nombre).toBe('Nuevo Nombre')
    expect(actualizado.coordenadas).toEqual({ lat: -33.5, lng: -70.6 })
  })
})

describe('Escenario completo: flujo de seleccion multiple', () => {
  it('selecciona varios puntos y ejecuta accion en bloque', () => {
    const puntos = Array.from({ length: 5 }, (_, i) => crearPunto({ numeroSerie: i + 1, nombre: `P${i + 1}` }))

    // Seleccionar todos
    let selected = toggleSeleccionarTodo(puntos, new Set())
    expect(selected.size).toBe(5)

    // Deseleccionar uno
    selected = toggleSeleccionarPunto(selected, puntos[2].id)
    expect(selected.size).toBe(4)
    expect(selected.has(puntos[2].id)).toBe(false)

    // Verificar que los seleccionados son los correctos
    const nombresSeleccionados = puntos.filter(p => selected.has(p.id)).map(p => p.nombre)
    expect(nombresSeleccionados).toEqual(['P1', 'P2', 'P4', 'P5'])
  })
})
