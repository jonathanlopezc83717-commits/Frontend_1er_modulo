/**
 * Utilidades para persistir datos.
 * El estado completo vive comprimido en IndexedDB; localStorage conserva
 * una copia ligera para evitar QuotaExceededError.
 */

import { guardarArchivosPlantilla } from '@/lib/template-file-store'
import type { PlantillaFormato } from '@/types'

const STORAGE_KEY = 'ferroviario_app_state'
const EXPIRATION_DAYS = 3
const DB_NAME = 'ferroviario_app_storage'
const STORE_NAME = 'state'
const DB_VERSION = 1
const FULL_STATE_KEY = 'latest'

export interface StoredState {
  puntos: unknown[]
  puntoActivoId: string | null
  moduloActivo: string
  nomenclaturasGlobales?: unknown[]
  plantillasFormato?: unknown[]
  plantillasPdfFormato?: unknown[]
  plantillasFicha?: unknown[]
  estadosGuardados?: unknown[]
  timestamp: number
}

type FullStateRecord = {
  id: string
  compressed?: ArrayBuffer
  json?: string
  compression: 'gzip-json' | 'none'
  timestamp: number
}

function quitarArchivosPlantilla(plantillas: unknown[] = []): unknown[] {
  return plantillas.map((plantilla) => {
    if (!plantilla || typeof plantilla !== 'object') return plantilla
    const copia = { ...(plantilla as Record<string, unknown>) }
    delete copia.archivoBase64
    return copia
  })
}

function quitarArchivosDeSnapshots(estadosGuardados: unknown[] = []): unknown[] {
  return estadosGuardados.map((estado) => {
    if (!estado || typeof estado !== 'object') return estado

    const estadoRecord = estado as Record<string, unknown>
    const snapshot = estadoRecord.snapshot
    if (!snapshot || typeof snapshot !== 'object') return estado

    const snapshotRecord = snapshot as Record<string, unknown>
    const plantillasFormato = Array.isArray(snapshotRecord.plantillasFormato)
      ? quitarArchivosPlantilla(snapshotRecord.plantillasFormato)
      : snapshotRecord.plantillasFormato
    const plantillasPdfFormato = Array.isArray(snapshotRecord.plantillasPdfFormato)
      ? quitarArchivosPlantilla(snapshotRecord.plantillasPdfFormato)
      : snapshotRecord.plantillasPdfFormato
    const plantillasFicha = Array.isArray(snapshotRecord.plantillasFicha)
      ? quitarArchivosPlantilla(snapshotRecord.plantillasFicha)
      : snapshotRecord.plantillasFicha

    return {
      ...estadoRecord,
      snapshot: {
        ...snapshotRecord,
        plantillasFormato,
        plantillasPdfFormato,
        plantillasFicha,
      },
    }
  })
}

function reducirValorParaLocalStorage(valor: unknown): unknown {
  if (typeof valor === 'string') {
    if (valor.startsWith('data:') || valor.length > 10000) return ''
    return valor
  }

  if (Array.isArray(valor)) return valor.map(reducirValorParaLocalStorage)
  if (!valor || typeof valor !== 'object') return valor

  const reducido: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(valor as Record<string, unknown>)) {
    if (key === 'file') continue
    reducido[key] = reducirValorParaLocalStorage(item)
  }
  return reducido
}

function crearEstadoLigero(state: StoredState): StoredState {
  return reducirValorParaLocalStorage({
    ...state,
    plantillasFormato: quitarArchivosPlantilla(state.plantillasFormato),
    plantillasPdfFormato: quitarArchivosPlantilla(state.plantillasPdfFormato),
    plantillasFicha: quitarArchivosPlantilla(state.plantillasFicha),
    estadosGuardados: quitarArchivosDeSnapshots(state.estadosGuardados),
  }) as StoredState
}

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function comprimirJson(json: string): Promise<Pick<FullStateRecord, 'compressed' | 'json' | 'compression'>> {
  const CompressionStreamApi = globalThis.CompressionStream
  if (!CompressionStreamApi) return { json, compression: 'none' }

  const stream = new Blob([json]).stream().pipeThrough(new CompressionStreamApi('gzip'))
  const compressed = await new Response(stream).arrayBuffer()
  return { compressed, compression: 'gzip-json' }
}

async function descomprimirJson(record: FullStateRecord): Promise<string | undefined> {
  if (record.json) return record.json
  if (!record.compressed || record.compression !== 'gzip-json') return undefined

  const DecompressionStreamApi = globalThis.DecompressionStream
  if (!DecompressionStreamApi) return undefined

  const stream = new Blob([record.compressed]).stream().pipeThrough(new DecompressionStreamApi('gzip'))
  return new Response(stream).text()
}

async function guardarEstadoCompletoIndexedDB(state: StoredState): Promise<void> {
  const db = await abrirDB()
  const payload = await comprimirJson(JSON.stringify(state))

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.put({
      id: FULL_STATE_KEY,
      ...payload,
      timestamp: state.timestamp,
    } satisfies FullStateRecord)

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

export async function cargarEstadoCompleto(): Promise<StoredState | null> {
  try {
    const db = await abrirDB()
    const record = await new Promise<FullStateRecord | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(FULL_STATE_KEY)

      request.onsuccess = () => resolve(request.result as FullStateRecord | undefined)
      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => db.close()
      transaction.onerror = () => db.close()
    })

    if (!record) return null

    const expirationMs = EXPIRATION_DAYS * 24 * 60 * 60 * 1000
    if (Date.now() - record.timestamp > expirationMs) return null

    const json = await descomprimirJson(record)
    return json ? JSON.parse(json) as StoredState : null
  } catch (error) {
    console.error('Error cargando estado completo:', error)
    return null
  }
}

export function guardarEstado(
  puntos: unknown[],
  puntoActivoId: string | null,
  moduloActivo: string,
  nomenclaturasGlobales: unknown[] = [],
  plantillasFormato: unknown[] = [],
  plantillasPdfFormato: unknown[] = [],
  plantillasFicha: unknown[] = [],
  estadosGuardados: unknown[] = []
): void {
  const state: StoredState = {
    puntos,
    puntoActivoId,
    moduloActivo,
    nomenclaturasGlobales,
    plantillasFormato: quitarArchivosPlantilla(plantillasFormato),
    plantillasPdfFormato: quitarArchivosPlantilla(plantillasPdfFormato),
    plantillasFicha: quitarArchivosPlantilla(plantillasFicha),
    estadosGuardados: quitarArchivosDeSnapshots(estadosGuardados),
    timestamp: Date.now(),
  }

  guardarArchivosPlantilla([
    ...(plantillasFormato as PlantillaFormato[]),
    ...(plantillasPdfFormato as PlantillaFormato[]),
    ...(plantillasFicha as PlantillaFormato[]),
  ]).catch(error => {
    console.error('Error guardando archivos de plantilla:', error)
  })

  guardarEstadoCompletoIndexedDB({
    ...state,
    plantillasFormato,
    plantillasPdfFormato,
    plantillasFicha,
    estadosGuardados,
  }).catch(error => {
    console.error('Error guardando estado completo:', error)
  })

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(crearEstadoLigero(state)))
  } catch (error) {
    console.error('Error guardando estado ligero:', error)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        puntos: [],
        puntoActivoId,
        moduloActivo,
        nomenclaturasGlobales,
        plantillasFormato: quitarArchivosPlantilla(plantillasFormato),
        plantillasPdfFormato: quitarArchivosPlantilla(plantillasPdfFormato),
        plantillasFicha: quitarArchivosPlantilla(plantillasFicha),
        estadosGuardados: [],
        timestamp: Date.now(),
      } satisfies StoredState))
    } catch (fallbackError) {
      console.error('Error guardando estado minimo:', fallbackError)
    }
  }
}

export function cargarEstado(): StoredState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null

    const state: StoredState = JSON.parse(stored)
    const expirationMs = EXPIRATION_DAYS * 24 * 60 * 60 * 1000

    if (Date.now() - state.timestamp > expirationMs) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }

    return state
  } catch (error) {
    console.error('Error cargando estado:', error)
    return null
  }
}

export function limpiarEstado(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function hayEstadoAlmacenado(): boolean {
  return cargarEstado() !== null
}
