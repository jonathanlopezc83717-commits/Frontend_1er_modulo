import type { PlantillaFormato } from '@/types'

const DB_NAME = 'ferroviario_template_files'
const STORE_NAME = 'formato_templates'
const DB_VERSION = 1

type TemplateFileRecord = {
  id: string
  archivoBase64?: string
  archivoComprimido?: ArrayBuffer
  compression?: 'gzip-base64' | 'none'
  updatedAt: string
}

async function comprimirBase64(base64: string): Promise<Pick<TemplateFileRecord, 'archivoBase64' | 'archivoComprimido' | 'compression'>> {
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

async function descomprimirBase64(record: TemplateFileRecord): Promise<string | undefined> {
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

export async function guardarArchivosPlantilla(plantillas: PlantillaFormato[]): Promise<void> {
  const plantillasConArchivo = plantillas.filter(plantilla => plantilla.id && plantilla.archivoBase64)
  if (plantillasConArchivo.length === 0) return

  const records = await Promise.all(
    plantillasConArchivo.map(async (plantilla) => ({
      id: plantilla.id,
      ...(await comprimirBase64(plantilla.archivoBase64 || '')),
      updatedAt: new Date().toISOString(),
    }))
  )

  await usarStore('readwrite', (store) => {
    for (const record of records) {
      store.put(record)
    }
  })
}

export async function recomprimirArchivosPlantilla(plantillas: PlantillaFormato[]): Promise<void> {
  const plantillasConArchivo = await cargarArchivosPlantilla(plantillas)
  const records = await Promise.all(
    plantillasConArchivo
      .filter(plantilla => plantilla.id && plantilla.archivoBase64)
      .map(async (plantilla) => ({
        id: plantilla.id,
        ...(await comprimirBase64(plantilla.archivoBase64 || '')),
        updatedAt: new Date().toISOString(),
      }))
  )

  if (records.length === 0) return

  await usarStore('readwrite', (store) => {
    for (const record of records) {
      store.put(record)
    }
  })
}

export async function cargarArchivosPlantilla(plantillas: PlantillaFormato[]): Promise<PlantillaFormato[]> {
  if (plantillas.length === 0) return plantillas

  const db = await abrirDB()

  try {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    const plantillasHidratadas = await Promise.all(
      plantillas.map(plantilla => new Promise<PlantillaFormato>((resolve) => {
        if (plantilla.archivoBase64) {
          resolve(plantilla)
          return
        }

        const request = store.get(plantilla.id)
        request.onsuccess = async () => {
          const record = request.result as TemplateFileRecord | undefined
          const archivoBase64 = record ? await descomprimirBase64(record) : undefined
          resolve(archivoBase64 ? { ...plantilla, archivoBase64 } : plantilla)
        }
        request.onerror = () => resolve(plantilla)
      }))
    )

    return plantillasHidratadas
  } finally {
    db.close()
  }
}
