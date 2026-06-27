/**
 * Utilidades para sincronizar puntos desde un Excel con formato:
 * Columna A: número de punto
 * Columnas B, C, D: coordenadas X, Y, Z (decimales)
 * Columna E: código de nomenclatura a comparar con la base global
 */

import type { PuntoFerroviario } from '@/types'
import type { NomenclaturaEntry } from './nomenclaturas'

export interface FilaSincronizacion {
  /** Valor crudo del número de punto leído del Excel */
  numeroPunto: string
  /** Coordenada X */
  x: number
  /** Coordenada Y */
  y: number
  /** Coordenada Z */
  z: number
  /** Código de nomenclatura leído de la columna E */
  codigo: string
}

export interface ResultadoSincronizacion {
  fila: FilaSincronizacion
  /** Índice de fila original en el Excel (0-based, sin contar encabezados) */
  filaIndex: number
  /** Id del punto coincidente, si se encontró */
  puntoId?: string
  /** Nombre del punto coincidente, si se encontró */
  puntoNombre?: string
  /** Nomenclatura coincidente en la base global, si existe */
  nomenclatura?: NomenclaturaEntry
  /** Estado resultante de la comparación */
  estado:
    | 'ok'
    | 'punto_no_encontrado'
    | 'nomenclatura_no_encontrada'
    | 'coordenadas_invalidas'
    | 'codigo_vacio'
}

export type CriterioCoincidencia = 'numeroSerie' | 'nombre'

function normalizarNumero(valor: unknown): number | null {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null
    return valor
  }
  if (valor === null || valor === undefined) return null
  const limpio = String(valor).replace(/,/g, '').trim()
  if (limpio === '') return null
  const numero = Number(limpio)
  return Number.isFinite(numero) ? numero : null
}

function normalizarTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  return String(valor).replace(/\s+/g, ' ').trim()
}

export interface OpcionesParseoSincronizacion {
  /** Si es true, omite la primera fila del Excel */
  saltarEncabezado?: boolean
}

/**
 * Lee un buffer de Excel y extrae las filas de sincronización.
 * Se asume que la primera fila contiene datos (no encabezado) a menos que
 * se indique lo contrario.
 */
export async function parsearExcelSincronizacion(
  buffer: ArrayBuffer,
  opciones: OpcionesParseoSincronizacion = {}
): Promise<FilaSincronizacion[]> {
  const { saltarEncabezado = false } = opciones
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' })

  const filas: FilaSincronizacion[] = []
  const inicio = saltarEncabezado ? 1 : 0

  for (let index = inicio; index < rows.length; index++) {
    const row = rows[index]
    if (!Array.isArray(row) || row.length < 5) continue

    const numeroPunto = normalizarTexto(row[0])
    if (!numeroPunto) continue

    const x = normalizarNumero(row[1])
    const y = normalizarNumero(row[2])
    const z = normalizarNumero(row[3])
    const codigo = normalizarTexto(row[4]).toUpperCase()

    // Si no hay coordenadas válidas ni código, se ignora la fila
    if (x === null && y === null && z === null && !codigo) continue

    filas.push({
      numeroPunto,
      x: x ?? 0,
      y: y ?? 0,
      z: z ?? 0,
      codigo,
    })
  }

  return filas
}

function puntoCoincide(punto: PuntoFerroviario, fila: FilaSincronizacion, criterio: CriterioCoincidencia): boolean {
  if (criterio === 'numeroSerie') {
    return String(punto.numeroSerie).trim() === fila.numeroPunto.trim()
  }
  return punto.nombre.trim().toLowerCase() === fila.numeroPunto.trim().toLowerCase()
}

function buscarNomenclatura(codigo: string, nomenclaturas: NomenclaturaEntry[]): NomenclaturaEntry | undefined {
  if (!codigo) return undefined
  return nomenclaturas.find(item => item.codigo.toUpperCase() === codigo.toUpperCase())
}

/**
 * Compara las filas del Excel contra los puntos existentes y la base de nomenclaturas.
 */
export function compararSincronizacion(
  filas: FilaSincronizacion[],
  puntos: PuntoFerroviario[],
  nomenclaturas: NomenclaturaEntry[],
  criterio: CriterioCoincidencia = 'numeroSerie'
): ResultadoSincronizacion[] {
  return filas.map((fila, filaIndex) => {
    const punto = puntos.find(p => puntoCoincide(p, fila, criterio))
    const coordenadasInvalidas =
      !Number.isFinite(fila.x) || !Number.isFinite(fila.y) || !Number.isFinite(fila.z)

    if (!fila.codigo) {
      return {
        fila,
        filaIndex,
        puntoId: punto?.id,
        puntoNombre: punto?.nombre,
        estado: coordenadasInvalidas ? 'coordenadas_invalidas' : 'codigo_vacio',
      }
    }

    const nomenclatura = buscarNomenclatura(fila.codigo, nomenclaturas)

    if (!punto) {
      return {
        fila,
        filaIndex,
        nomenclatura,
        estado: 'punto_no_encontrado',
      }
    }

    if (!nomenclatura) {
      return {
        fila,
        filaIndex,
        puntoId: punto.id,
        puntoNombre: punto.nombre,
        estado: 'nomenclatura_no_encontrada',
      }
    }

    if (coordenadasInvalidas) {
      return {
        fila,
        filaIndex,
        puntoId: punto.id,
        puntoNombre: punto.nombre,
        nomenclatura,
        estado: 'coordenadas_invalidas',
      }
    }

    return {
      fila,
      filaIndex,
      puntoId: punto.id,
      puntoNombre: punto.nombre,
      nomenclatura,
      estado: 'ok',
    }
  })
}

export interface AplicacionSincronizacion {
  puntosActualizados: number
  puntosNoEncontrados: number
  nomenclaturasAgregadas: number
}

/**
 * Aplica la sincronización: actualiza coordenadas de puntos existentes y
 * agrega a la base global las nomenclaturas que no existan.
 *
 * Devuelve un resumen de cambios aplicados y un array con los puntos modificados.
 */
export function aplicarSincronizacion(
  resultados: ResultadoSincronizacion[],
  puntos: PuntoFerroviario[],
  nomenclaturas: NomenclaturaEntry[],
  opciones: {
    actualizarCoordenadas?: boolean
    agregarNomenclaturasFaltantes?: boolean
    definicionPorDefecto?: string
  } = {}
): { resumen: AplicacionSincronizacion; puntosModificados: PuntoFerroviario[]; nomenclaturasActualizadas: NomenclaturaEntry[] } {
  const { actualizarCoordenadas = true, agregarNomenclaturasFaltantes = true, definicionPorDefecto = 'Nomenclatura sincronizada desde Excel' } = opciones

  const resumen: AplicacionSincronizacion = {
    puntosActualizados: 0,
    puntosNoEncontrados: 0,
    nomenclaturasAgregadas: 0,
  }

  const puntosModificadosMap = new Map<string, PuntoFerroviario>()
  const nuevasNomenclaturas = [...nomenclaturas]
  const codigosExistentes = new Set(nuevasNomenclaturas.map(item => item.codigo.toUpperCase()))

  for (const resultado of resultados) {
    const { fila, puntoId } = resultado

    if (!puntoId) {
      resumen.puntosNoEncontrados++
      continue
    }

    const punto = puntos.find(p => p.id === puntoId)
    if (!punto) {
      resumen.puntosNoEncontrados++
      continue
    }

    let puntoModificado = puntosModificadosMap.get(puntoId) ?? { ...punto, moduloData: { ...punto.moduloData } }

    if (actualizarCoordenadas && resultado.estado !== 'coordenadas_invalidas') {
      puntoModificado = {
        ...puntoModificado,
        coordenadas: {
          lat: fila.y,
          lng: fila.x,
        },
        moduloData: {
          ...puntoModificado.moduloData,
          georeferencia: {
            ...(puntoModificado.moduloData?.georeferencia as Record<string, unknown> | undefined),
            coordenadas: { x: fila.x, y: fila.y, z: fila.z },
            notas: `Coordenadas sincronizadas desde Excel el ${new Date().toISOString()}`,
            updatedAt: new Date().toISOString(),
          },
        },
      }
      resumen.puntosActualizados++
    }

    puntosModificadosMap.set(puntoId, puntoModificado)

    if (agregarNomenclaturasFaltantes && fila.codigo && !codigosExistentes.has(fila.codigo.toUpperCase())) {
      nuevasNomenclaturas.push({
        id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        codigo: fila.codigo.toUpperCase(),
        definicion: definicionPorDefecto,
      })
      codigosExistentes.add(fila.codigo.toUpperCase())
      resumen.nomenclaturasAgregadas++
    }
  }

  return {
    resumen,
    puntosModificados: Array.from(puntosModificadosMap.values()),
    nomenclaturasActualizadas: nuevasNomenclaturas,
  }
}

/**
 * Busca un archivo Excel dentro de un FileList obtenido de <input webkitdirectory>.
 */
export function buscarExcelEnCarpeta(files: FileList): File | null {
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'xlsx' || ext === 'xls') {
      return file
    }
  }
  return null
}
