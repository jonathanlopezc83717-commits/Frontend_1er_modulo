const STORAGE_KEY = 'frontend:carpetas-procesadas'

type Registro = Record<string, { nombre: string; ts: number }>

function leerRegistro(): Registro {
  try {
    const raw = localStorage?.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Registro) : {}
  } catch {
    // storage bloqueado o JSON malformado: tratado como registro vacio
    return {}
  }
}

function escribirRegistro(reg: Registro): void {
  try {
    localStorage?.setItem(STORAGE_KEY, JSON.stringify(reg))
  } catch {
    // cuota excedida o storage bloqueado: no-op defensivo
  }
}

export function fingerprintCarpeta(nombre: string, files: FileList | File[]): string {
  let totalBytes = 0
  const arr = files instanceof Array ? files : Array.from(files)
  for (const f of arr) totalBytes += f.size
  return `${nombre}:${totalBytes}`
}

export function carpetaYaProcesada(fp: string): boolean {
  return Boolean(leerRegistro()[fp])
}

export function marcarCarpetaProcesada(fp: string, nombre: string): void {
  const reg = leerRegistro()
  reg[fp] = { nombre, ts: Date.now() }
  escribirRegistro(reg)
}

export function limpiarCarpetasProcesadas(): void {
  escribirRegistro({})
}
