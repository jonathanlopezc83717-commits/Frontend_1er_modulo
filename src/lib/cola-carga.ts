// Cola de carga de carpetas: persiste qué carpetas faltan procesar para que
// una recarga/conexión perdida no pierda el progreso. Los File no se guardan
// (son pesados); el usuario re-selecciona las carpetas pendientes guiado por
// la lista, y la app ignora las ya completadas.

const COLA_CARGA_KEY = 'ferroviario_cola_carga'
const COLA_VIGENCIA_MS = 24 * 60 * 60 * 1000

export type EstadoCarpeta = 'pendiente' | 'en-proceso' | 'completada' | 'fallida'

export interface EntradaColaCarpeta {
  raiz: string
  estado: EstadoCarpeta
  completadaEn?: number
  error?: string
}

export interface ColaCarga {
  iniciadaEn: number
  total: number
  carpetas: EntradaColaCarpeta[]
}

export function leerCola(): ColaCarga | null {
  try {
    const raw = localStorage.getItem(COLA_CARGA_KEY)
    if (!raw) return null
    const cola = JSON.parse(raw) as ColaCarga
    if (Date.now() - cola.iniciadaEn > COLA_VIGENCIA_MS) {
      limpiarCola()
      return null
    }
    // Resetear 'en-proceso' a 'pendiente': si estamos leyendo, ninguna está
    // realmente en proceso (sobrevive una recarga/interrupción).
    let modificado = false
    for (const c of cola.carpetas) {
      if (c.estado === 'en-proceso') { c.estado = 'pendiente'; modificado = true }
    }
    if (modificado) guardarCola(cola)
    return cola
  } catch { return null }
}

function guardarCola(cola: ColaCarga): void {
  try { localStorage.setItem(COLA_CARGA_KEY, JSON.stringify(cola)) } catch { /* cuota */ }
}

export function iniciarCola(raices: string[]): void {
  guardarCola({
    iniciadaEn: Date.now(),
    total: raices.length,
    carpetas: raices.map(raiz => ({ raiz, estado: 'pendiente' as EstadoCarpeta })),
  })
}

export function marcarCarpeta(raiz: string, estado: EstadoCarpeta, error?: string): void {
  const cola = leerCola()
  if (!cola) return
  const entrada = cola.carpetas.find(c => c.raiz === raiz)
  if (!entrada) return
  entrada.estado = estado
  if (estado === 'completada') entrada.completadaEn = Date.now()
  if (estado === 'fallida' && error) entrada.error = error
  if (estado === 'pendiente') { entrada.error = undefined; entrada.completadaEn = undefined }
  guardarCola(cola)
}

export function limpiarCola(): void {
  try { localStorage.removeItem(COLA_CARGA_KEY) } catch { /* noop */ }
}

export function carpetasPendientes(cola: ColaCarga): EntradaColaCarpeta[] {
  return cola.carpetas.filter(c => c.estado !== 'completada')
}

export function todasCompletadas(cola: ColaCarga): boolean {
  return cola.carpetas.every(c => c.estado === 'completada')
}

// Normaliza el nombre de carpeta para comparar al re-seleccionar: la regex
// quita el prefijo numérico (igual que en agregarDesdeDatos) para tolerar
// diferencias de formato entre la cola y el nuevo FileList.
export function normalizarRaiz(raiz: string): string {
  return raiz.replace(/^\s*\d+[\s._:,)-]+/, '').trim().toLowerCase()
}
