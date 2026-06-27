/**
 * Almacenamiento en IndexedDB para archivos Excel de sincronización.
 * Separa el contenido base64 (posiblemente grande) del estado principal.
 */

const DB_NAME = 'ferroviario_sync_files'
const STORE_NAME = 'sync_files'
const DB_VERSION = 1

type SyncFileRecord = {
  id: string
  archivoBase64?: string
  archivoComprimido?: ArrayBuffer
  compression?: 'gzip-base64' | 'none'
  updatedAt: string
}

async function comprimirBase64(base64: string): Promise<Pick<SyncFileRecord, 'archivoBase64' | 'archivoComprimido' | 'compression'>> {
  const CompressionStreamApi = globalThis.CompressionStream
  if (!CompressionStreamApi) {
    return { archivoBase64: base64, compression: 'none' }
  }

  const stream = new Blob([base64])
    .stream()
    .pipeThrough(new CompressionStreamApi('gzip'))
  const archivoComprimido = await new Response(stream).arrayBuffer()
  return { archivoComprimido, compression: 'gzip-base64' }
}

async function descomprimirBase64(record: SyncFileRecord): Promise<string | undefined> {
  if (record.archivoBase64) return record.archivoBase64
  if (!record.archivoComprimido || record.compression !== 'gzip-base64') return undefined

  const DecompressionStreamApi = globalThis.DecompressionStream
  if (!DecompressionStreamApi) return undefined

  const stream = new Blob([record.archivoComprimido])
    .stream()
    .pipeThrough(new DecompressionStreamApi('gzip'))
  return new Response(stream).text()
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

async function usarStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await abrirDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    const request = callback(store)

    transaction.oncomplete = () => {
      db.close()
      resolve(request ? request.result : undefined)
    }
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

function arrayBufferABase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

export async function guardarArchivoSincronizacion(id: string, archivo: File | ArrayBuffer): Promise<void> {
  const buffer = archivo instanceof File ? await archivo.arrayBuffer() : archivo
  const base64 = arrayBufferABase64(buffer)
  const record: SyncFileRecord = {
    id,
    ...(await comprimirBase64(base64)),
    updatedAt: new Date().toISOString(),
  }

  await usarStore('readwrite', (store) => {
    store.put(record)
  })
}

export async function cargarArchivoSincronizacion(id: string): Promise<ArrayBuffer | undefined> {
  const record = await usarStore('readonly', (store) => store.get(id)) as SyncFileRecord | undefined
  if (!record) return undefined

  const base64 = await descomprimirBase64(record)
  if (!base64) return undefined

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

export async function eliminarArchivoSincronizacion(id: string): Promise<void> {
  await usarStore('readwrite', (store) => {
    store.delete(id)
  })
}
