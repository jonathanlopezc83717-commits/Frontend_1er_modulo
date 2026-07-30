import { describe, it, expect } from 'vitest'
import { checklistCompleto } from '@/components/gestor-puntos-logica'
import { appReducer, MAX_MANUALES } from '@/context/app-reducer'
import type { AppState, EstadoGuardado, PuntoFerroviario } from '@/types'

function punto(modulos: string[]): PuntoFerroviario {
  const moduloData: Record<string, unknown> = {}
  for (const m of modulos) moduloData[m] = { valores: {} }
  return {
    id: 'p1',
    numeroSerie: 1,
    nombre: 'P',
    moduloData,
    createdAt: '',
    updatedAt: '',
  } as PuntoFerroviario
}

const baseState: AppState = {
  puntos: [],
  puntoActivo: null,
  moduloActivo: 'analisis',
  modulosOrden: null,
  nomenclaturasGlobales: [],
  plantillasFormato: [],
  plantillasPdfFormato: [],
  estadosGuardados: [],
  haExportadoPlantilla: false,
}

function estado(tipo: 'manual' | 'automatico', n: number): EstadoGuardado {
  return {
    id: `${tipo}-${n}`,
    tipo,
    descripcion: `${tipo} ${n}`,
    createdAt: `2026-01-${String(n).padStart(2, '0')}T00:00:00Z`,
    snapshotCompleto: true,
    snapshot: {
      puntos: [],
      puntoActivoId: null,
      moduloActivo: 'analisis',
      nomenclaturasGlobales: [],
    },
  }
}

describe('checklistCompleto', () => {
  it('es true cuando los 4 módulos están presentes', () => {
    expect(checklistCompleto(punto(['analisis', 'georeferencia', 'documentacion', 'materiales']))).toBe(true)
  })

  it('es false si falta alguno', () => {
    expect(checklistCompleto(punto(['analisis', 'georeferencia', 'documentacion']))).toBe(false)
  })

  it('acepta el alias georeferenciacion', () => {
    expect(checklistCompleto(punto(['analisis', 'georeferenciacion', 'documentacion', 'materiales']))).toBe(true)
  })
})

describe('tope de respaldos (solo manuales cuentan para 3)', () => {
  it('conserva solo MAX_MANUALES respaldos manuales', () => {
    let s = baseState
    for (let i = 1; i <= MAX_MANUALES + 1; i++) {
      s = appReducer(s, { type: 'AGREGAR_ESTADO_GUARDADO', payload: estado('manual', i) })
    }
    const manuales = s.estadosGuardados.filter((e) => e.tipo === 'manual')
    expect(manuales).toHaveLength(MAX_MANUALES)
  })

  it('un automático no desplaza a los manuales recientes', () => {
    let s = baseState
    s = appReducer(s, { type: 'AGREGAR_ESTADO_GUARDADO', payload: estado('manual', 1) })
    s = appReducer(s, { type: 'AGREGAR_ESTADO_GUARDADO', payload: estado('manual', 2) })
    s = appReducer(s, { type: 'AGREGAR_ESTADO_GUARDADO', payload: estado('automatico', 9) })
    const manuales = s.estadosGuardados.filter((e) => e.tipo === 'manual')
    expect(manuales.map((m) => m.id)).toEqual(['manual-2', 'manual-1'])
  })
})
