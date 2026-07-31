const DB_NAME = 'frontend-import'
const STORE_NAME = 'session'
const RECORD_KEY = 'current'

type SesionImport = { paths: string[]; files: File[] }

let dbPromise: Promise<IDBDatabase> | null = null

function abrirDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open error'))
  }).catch((err) => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrirDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const req = fn(tx.objectStore(STORE_NAME))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export async function guardarSesionImport(files: FileList): Promise<void> {
  try {
    try {
      navigator.storage?.persist?.()
    } catch {
      // best-effort, ignorar
    }
    const paths: string[] = []
    const arr: File[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      paths.push(f.webkitRelativePath || f.name)
      arr.push(f)
    }
    await run<IDBValidKey>('readwrite', (store) => store.put({ paths, files: arr } as unknown, RECORD_KEY))
  } catch {
    // cuota excedida o storage bloqueado: no-op
  }
}

export async function cargarSesionImport(): Promise<FileList | null> {
  try {
    const registro = await run<SesionImport | undefined>('readonly', (store) => store.get(RECORD_KEY))
    if (!registro || !Array.isArray(registro.files) || registro.files.length === 0) return null
    const paths = Array.isArray(registro.paths) ? registro.paths : []
    const dt = new DataTransfer()
    for (let i = 0; i < registro.files.length; i++) {
      const file = registro.files[i]
      const path = paths[i]
      if (path && path !== file.name) {
        const clon = new File([file], file.name, { type: file.type, lastModified: file.lastModified })
        try {
          Object.defineProperty(clon, 'webkitRelativePath', { value: path, configurable: true })
        } catch {
          // si no se puede definir, se usa el clon sin la propiedad
        }
        dt.items.add(clon)
      } else {
        dt.items.add(file)
      }
    }
    return dt.files
  } catch {
    return null
  }
}

export async function haySesionImport(): Promise<boolean> {
  try {
    const registro = await run<SesionImport | undefined>('readonly', (store) => store.get(RECORD_KEY))
    return Boolean(registro && Array.isArray(registro.files) && registro.files.length > 0)
  } catch {
    return false
  }
}

export async function limpiarSesionImport(): Promise<void> {
  try {
    await run<undefined>('readwrite', (store) => store.delete(RECORD_KEY))
  } catch {
    // storage bloqueado: no-op
  }
}
