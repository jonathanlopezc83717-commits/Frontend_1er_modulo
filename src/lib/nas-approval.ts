import type { AppAction, PuntoFerroviario } from '@/types'
import { procesarArchivoSincronizacion, compararSincronizacion, type FilaSincronizacion } from '@/lib/excel-sync'
import type { NomenclaturaEntry } from '@/lib/nomenclaturas'
import { generarUUID } from '@/lib/utils'

const API_BASE = '/api'

export interface NasPendingEvent {
  eventId: string
  type: 'created' | 'modified' | 'deleted' | 'moved'
  path: string
  ext: string
  size: number
  mtimeMs: number
  detectedAt: string
}

export interface NasPendingResponse {
  pending: NasPendingEvent[]
  updatedAt: string | null
}

const EXCEL_EXTS = new Set(['.xlsx', '.xls', '.csv'])

export function esEventoProcesable(ev: NasPendingEvent): boolean {
  return EXCEL_EXTS.has(ev.ext) && ev.type !== 'deleted'
}

export async function leerPendientes(signal?: AbortSignal): Promise<NasPendingResponse> {
  const r = await fetch(`${API_BASE}/nas-pending`, { signal })
  if (!r.ok) throw new Error(`nas-pending: ${r.status}`)
  return r.json()
}

export async function ackPendientes(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return
  await fetch(`${API_BASE}/nas-pending/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventIds }),
  })
}

async function descargarArchivoNas(relPath: string): Promise<{ buffer: ArrayBuffer; nombre: string }> {
  const r = await fetch(`${API_BASE}/nas-file?path=${encodeURIComponent(relPath)}`)
  if (!r.ok) throw new Error(`nas-file ${relPath}: ${r.status}`)
  const buffer = await r.arrayBuffer()
  const nombre = relPath.split(/[\\/]/).pop() || 'archivo'
  return { buffer, nombre }
}

export interface ResultadoProcesamiento {
  eventosProcesados: string[]
  eventosIgnorados: NasPendingEvent[]
  puntosNuevos: number
  conflictos: number
  errores: string[]
}

function crearPuntoDesdeFila(fila: FilaSincronizacion, sourcePath: string): Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'> {
  const now = new Date().toISOString()
  const directorioPadre = sourcePath.includes('/')
    ? sourcePath.split('/').slice(0, -1).join('/')
    : sourcePath
  return {
    nombre: fila.codigo || fila.numeroPunto || `Punto ${sourcePath}`,
    descripcion: `Importado de ${sourcePath}`,
    cadenamiento: fila.cadenamiento || fila.numeroPunto || undefined,
    nasPath: directorioPadre,
    estadoAprobacion: 'pendiente',
    moduloData: {
      georeferencia: {
        coordenadas: { x: fila.x, y: fila.y, z: fila.z },
        notas: fila.codigo ? `Código: ${fila.codigo}` : '',
        updatedAt: now,
      },
      documentacion: {
        nomenclaturas: fila.codigo
          ? [{ id: generarUUID(), codigo: fila.codigo, definicion: '' }]
          : [],
        updatedAt: now,
      },
    },
  }
}

export async function procesarPendientes(
  eventos: NasPendingEvent[],
  ctx: {
    puntos: PuntoFerroviario[]
    nomenclaturas: NomenclaturaEntry[]
    onPuntoNuevo: (punto: Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'>) => void
    onConflicto: (punto: PuntoFerroviario, fila: FilaSincronizacion, sourcePath: string) => void
  }
): Promise<ResultadoProcesamiento> {
  const resultado: ResultadoProcesamiento = {
    eventosProcesados: [],
    eventosIgnorados: [],
    puntosNuevos: 0,
    conflictos: 0,
    errores: [],
  }

  const procesables = eventos.filter(esEventoProcesable)
  resultado.eventosIgnorados = eventos.filter((e) => !esEventoProcesable(e))

  for (const ev of procesables) {
    try {
      const { buffer, nombre } = await descargarArchivoNas(ev.path)
      const { filas } = await procesarArchivoSincronizacion(buffer, nombre)
      const comparativa = compararSincronizacion(filas, ctx.puntos, ctx.nomenclaturas)

      for (const r of comparativa) {
        if (r.puntoId) {
          const existente = ctx.puntos.find((p) => p.id === r.puntoId)
          if (existente) {
            ctx.onConflicto(existente, r.fila, ev.path)
            resultado.conflictos++
            continue
          }
        }
        ctx.onPuntoNuevo(crearPuntoDesdeFila(r.fila, ev.path))
        resultado.puntosNuevos++
      }
      resultado.eventosProcesados.push(ev.eventId)
    } catch (err) {
      resultado.errores.push(`${ev.path}: ${String(err)}`)
    }
  }

  return resultado
}

export type DispatchFn = (action: AppAction) => void

export interface CambioPuntoExistente {
  puntoId: string
  puntoNombre: string
  nasPath: string
  eventos: NasPendingEvent[]
}

export function detectarCambiosPuntosExistentes(
  eventos: NasPendingEvent[],
  puntos: PuntoFerroviario[]
): CambioPuntoExistente[] {
  const resultado: CambioPuntoExistente[] = []
  for (const punto of puntos) {
    if (!punto.nasPath) continue
    const prefijo = punto.nasPath + '/'
    const eventosPunto = eventos.filter(
      (ev) => ev.path === punto.nasPath || ev.path.startsWith(prefijo)
    )
    if (eventosPunto.length > 0) {
      resultado.push({
        puntoId: punto.id,
        puntoNombre: punto.nombre,
        nasPath: punto.nasPath,
        eventos: eventosPunto,
      })
    }
  }
  return resultado
}

export async function recargarPuntoDesdeNAS(
  punto: PuntoFerroviario,
  eventos: NasPendingEvent[],
  dispatch: DispatchFn
): Promise<{ actualizados: number; errores: string[] }> {
  const errores: string[] = []
  let actualizados = 0
  const now = new Date().toISOString()
  const nuevoModuloData = { ...(punto.moduloData || {}) }

  for (const ev of eventos) {
    if (ev.type === 'deleted') continue
    try {
      const { buffer, nombre } = await descargarArchivoNas(ev.path)
      const ext = (nombre.split('.').pop() || '').toLowerCase()

      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const { filas } = await procesarArchivoSincronizacion(buffer, nombre)
        const comparativa = compararSincronizacion(filas, [punto], [])
        const fila = comparativa.find((r) => r.puntoId === punto.id)?.fila
        if (fila) {
          nuevoModuloData.georeferencia = {
            coordenadas: { x: fila.x, y: fila.y, z: fila.z },
            notas: `Recargado desde NAS: ${ev.path}`,
            updatedAt: now,
          }
          if (fila.cadenamiento) {
            dispatch({
              type: 'ACTUALIZAR_PUNTO',
              payload: { id: punto.id, data: { cadenamiento: fila.cadenamiento } },
            })
          }
          actualizados++
        }
      } else if (ext === 'txt') {
        const texto = new TextDecoder().decode(buffer)
        const documentacionActual = (nuevoModuloData.documentacion as { nomenclaturas?: Array<{ id: string; codigo: string; definicion: string }>; notas?: string } | undefined) || {}
        nuevoModuloData.documentacion = {
          ...documentacionActual,
          notas: texto,
          nombreArchivo: nombre,
          updatedAt: now,
        }
        actualizados++
      } else if (ext === 'kmz' || ext === 'kml') {
        // coordenadas KMZ requieren parser zip; se maneja en el flujo de carpeta
      }
    } catch (err) {
      errores.push(`${ev.path}: ${String(err)}`)
    }
  }

  if (actualizados > 0) {
    dispatch({
      type: 'PUSH_VERSION_PUNTO',
      payload: punto.id,
    })
    dispatch({
      type: 'ACTUALIZAR_PUNTO',
      payload: {
        id: punto.id,
        data: {
          moduloData: nuevoModuloData,
          estadoAprobacion: 'pendiente',
        },
      },
    })
  }

  return { actualizados, errores }
}

export function pushVersion(puntoId: string, dispatch: DispatchFn): void {
  dispatch({ type: 'PUSH_VERSION_PUNTO', payload: puntoId })
}

export function deshacerPunto(puntoId: string, dispatch: DispatchFn): void {
  dispatch({ type: 'DESHACER_PUNTO', payload: puntoId })
}

export function aprobarPunto(puntoId: string, dispatch: DispatchFn): void {
  dispatch({
    type: 'ACTUALIZAR_PUNTO',
    payload: { id: puntoId, data: { estadoAprobacion: 'aprobado' } },
  })
}

export function marcarRevisado(puntoId: string, dispatch: DispatchFn): void {
  dispatch({
    type: 'ACTUALIZAR_PUNTO',
    payload: { id: puntoId, data: { estadoAprobacion: 'revisado' } },
  })
}

export function confirmarSobrescritura(
  puntoId: string,
  fila: FilaSincronizacion,
  dispatch: DispatchFn
): void {
  dispatch({ type: 'PUSH_VERSION_PUNTO', payload: puntoId })
  dispatch({
    type: 'ACTUALIZAR_PUNTO',
    payload: {
      id: puntoId,
      data: {
        estadoAprobacion: 'pendiente',
        moduloData: {
          georeferencia: {
            coordenadas: { x: fila.x, y: fila.y, z: fila.z },
            notas: `Sobrescrito desde Excel: ${fila.codigo}`,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    },
  })
}
