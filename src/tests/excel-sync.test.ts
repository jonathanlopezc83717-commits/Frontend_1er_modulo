/**
 * Pruebas para la lógica de sincronización de Excel.
 * Ejecutar con: npx vitest run src/tests/excel-sync.test.ts
 */

import { describe, it, expect } from 'vitest'
import type { PuntoFerroviario } from '@/types'
import type { NomenclaturaEntry } from '@/lib/nomenclaturas'
import {
  compararSincronizacion,
  aplicarSincronizacion,
  separarDigitos,
  aplicarSeparacion,
  type FilaSincronizacion,
} from '@/lib/excel-sync'

function crearPunto(overrides: Partial<PuntoFerroviario> = {}): PuntoFerroviario {
  return {
    id: 'punto-1',
    numeroSerie: 1,
    nombre: 'PT-001',
    moduloData: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('compararSincronizacion', () => {
  const puntos: PuntoFerroviario[] = [
    crearPunto({ id: 'p1', numeroSerie: 1, nombre: 'PT-001' }),
    crearPunto({ id: 'p2', numeroSerie: 2, nombre: 'PT-002' }),
  ]

  const nomenclaturas: NomenclaturaEntry[] = [
    { id: 'n1', codigo: 'ABC', definicion: 'Definicion ABC' },
  ]

  it('detecta coincidencia ok de punto y nomenclatura', () => {
    const filas: FilaSincronizacion[] = [
      { numeroPunto: '1', x: 1.1, y: 2.2, z: 3.3, codigo: 'ABC' },
    ]
    const resultados = compararSincronizacion(filas, puntos, nomenclaturas, 'numeroSerie')
    expect(resultados).toHaveLength(1)
    expect(resultados[0].estado).toBe('ok')
    expect(resultados[0].puntoId).toBe('p1')
    expect(resultados[0].nomenclatura?.codigo).toBe('ABC')
  })

  it('detecta punto no encontrado', () => {
    const filas: FilaSincronizacion[] = [
      { numeroPunto: '99', x: 1.1, y: 2.2, z: 3.3, codigo: 'ABC' },
    ]
    const resultados = compararSincronizacion(filas, puntos, nomenclaturas, 'numeroSerie')
    expect(resultados[0].estado).toBe('punto_no_encontrado')
  })

  it('detecta nomenclatura no encontrada', () => {
    const filas: FilaSincronizacion[] = [
      { numeroPunto: '1', x: 1.1, y: 2.2, z: 3.3, codigo: 'XYZ' },
    ]
    const resultados = compararSincronizacion(filas, puntos, nomenclaturas, 'numeroSerie')
    expect(resultados[0].estado).toBe('nomenclatura_no_encontrada')
  })

  it('detecta coordenadas invalidas', () => {
    const filas: FilaSincronizacion[] = [
      { numeroPunto: '1', x: NaN, y: 2.2, z: 3.3, codigo: 'ABC' },
    ]
    const resultados = compararSincronizacion(filas, puntos, nomenclaturas, 'numeroSerie')
    expect(resultados[0].estado).toBe('coordenadas_invalidas')
  })

  it('coincide por nombre', () => {
    const filas: FilaSincronizacion[] = [
      { numeroPunto: 'PT-002', x: 1.1, y: 2.2, z: 3.3, codigo: 'ABC' },
    ]
    const resultados = compararSincronizacion(filas, puntos, nomenclaturas, 'nombre')
    expect(resultados[0].estado).toBe('ok')
    expect(resultados[0].puntoId).toBe('p2')
  })

  it('coincide nomenclatura por prefijo (EUR1 -> EUR)', () => {
    const noms: NomenclaturaEntry[] = [
      { id: 'eur', codigo: 'EUR', definicion: 'Eural' },
      { id: 'adr', codigo: 'ADR', definicion: 'Adherencia' },
    ]
    const filas: FilaSincronizacion[] = [
      { numeroPunto: '1', x: 1, y: 2, z: 3, codigo: 'EUR1' },
      { numeroPunto: '2', x: 1, y: 2, z: 3, codigo: 'ADR70' },
    ]
    const resultados = compararSincronizacion(filas, puntos, noms, 'numeroSerie')
    expect(resultados[0].estado).toBe('ok')
    expect(resultados[0].nomenclatura?.codigo).toBe('EUR')
    expect(resultados[1].estado).toBe('ok')
    expect(resultados[1].nomenclatura?.codigo).toBe('ADR')
  })
})

describe('aplicarSincronizacion', () => {
  const puntos: PuntoFerroviario[] = [
    crearPunto({ id: 'p1', numeroSerie: 1, nombre: 'PT-001' }),
  ]

  const nomenclaturas: NomenclaturaEntry[] = [
    { id: 'n1', codigo: 'ABC', definicion: 'Definicion ABC' },
  ]

  it('actualiza coordenadas del punto coincidente', () => {
    const filas: FilaSincronizacion[] = [
      { numeroPunto: '1', x: 10.5, y: 20.5, z: 30.5, codigo: 'ABC' },
    ]
    const resultados = compararSincronizacion(filas, puntos, nomenclaturas, 'numeroSerie')
    const { resumen, puntosModificados } = aplicarSincronizacion(resultados, puntos, nomenclaturas)

    expect(resumen.puntosActualizados).toBe(1)
    expect(puntosModificados).toHaveLength(1)
    expect(puntosModificados[0].coordenadas?.lat).toBe(20.5)
    expect(puntosModificados[0].coordenadas?.lng).toBe(10.5)
    expect((puntosModificados[0].moduloData.georeferencia as { coordenadas: { x: number; y: number; z: number } }).coordenadas.z).toBe(30.5)
  })

  it('agrega nomenclaturas faltantes cuando se indica', () => {
    const filas: FilaSincronizacion[] = [
      { numeroPunto: '1', x: 10.5, y: 20.5, z: 30.5, codigo: 'NUEVO' },
    ]
    const resultados = compararSincronizacion(filas, puntos, nomenclaturas, 'numeroSerie')
    const { resumen, nomenclaturasActualizadas } = aplicarSincronizacion(
      resultados,
      puntos,
      nomenclaturas,
      { agregarNomenclaturasFaltantes: true }
    )

    expect(resumen.nomenclaturasAgregadas).toBe(1)
    expect(nomenclaturasActualizadas.some(item => item.codigo === 'NUEVO')).toBe(true)
  })

  it('no agrega nomenclaturas si no se indica', () => {
    const filas: FilaSincronizacion[] = [
      { numeroPunto: '1', x: 10.5, y: 20.5, z: 30.5, codigo: 'NUEVO' },
    ]
    const resultados = compararSincronizacion(filas, puntos, nomenclaturas, 'numeroSerie')
    const { resumen, nomenclaturasActualizadas } = aplicarSincronizacion(
      resultados,
      puntos,
      nomenclaturas,
      { agregarNomenclaturasFaltantes: false }
    )

    expect(resumen.nomenclaturasAgregadas).toBe(0)
    expect(nomenclaturasActualizadas).toHaveLength(1)
  })

  it('no duplica nomenclaturas cuando el prefijo ya existe (EUR1 con EUR en base)', () => {
    const noms: NomenclaturaEntry[] = [
      { id: 'eur', codigo: 'EUR', definicion: 'Eural' },
    ]
    const filas: FilaSincronizacion[] = [
      { numeroPunto: '1', x: 1, y: 2, z: 3, codigo: 'EUR1' },
      { numeroPunto: '2', x: 1, y: 2, z: 3, codigo: 'EUR23' },
    ]
    const resultados = compararSincronizacion(filas, puntos, noms, 'numeroSerie')
    const { resumen, nomenclaturasActualizadas } = aplicarSincronizacion(
      resultados,
      puntos,
      noms,
      { agregarNomenclaturasFaltantes: true }
    )

    expect(resumen.nomenclaturasAgregadas).toBe(0)
    expect(nomenclaturasActualizadas).toHaveLength(1)
  })
})

describe('separarDigitos / aplicarSeparacion', () => {
  it('separa los primeros N dígitos del entero (561009.175, N=2 -> 1009.175 / 56)', () => {
    expect(separarDigitos(561009.175, 2)).toEqual({ resto: 1009.175, separado: '56' })
  })

  it('respeta los decimales al separar (N=3)', () => {
    expect(separarDigitos(561009.175, 3)).toEqual({ resto: 9.175, separado: '561' })
  })

  it('no separa cuando N=0', () => {
    expect(separarDigitos(561009.175, 0)).toEqual({ resto: 561009.175, separado: '' })
  })

  it('aplica separación solo a las columnas elegidas', () => {
    const filas: FilaSincronizacion[] = [
      { numeroPunto: '1', x: 561009.175, y: 2090622.274, z: 1816.64, codigo: 'EUR1' },
    ]
    const resultado = aplicarSeparacion(filas, {
      digitos: 2,
      columnas: { x: true, y: false, z: true },
    })
    expect(resultado[0].x).toBe(1009.175)
    expect(resultado[0].sepX).toBe('56')
    expect(resultado[0].y).toBe(2090622.274)
    expect(resultado[0].sepY).toBeUndefined()
    expect(resultado[0].z).toBe(16.64)
    expect(resultado[0].sepZ).toBe('18')
  })
})
