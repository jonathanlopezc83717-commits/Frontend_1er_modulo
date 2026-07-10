import type { PuntoFerroviario } from '@/types'
import { separarDigitos } from '@/lib/excel-sync'

export type SortKey =
  | 'manual'
  | 'nombre-asc'
  | 'nombre-desc'
  | 'fecha-asignada-asc'
  | 'fecha-asignada-desc'
  | 'fecha-ingreso-asc'
  | 'fecha-ingreso-desc'
  | 'cadenamiento-asc'
  | 'cadenamiento-desc'
  | 'cadenamiento-coordenada'

/** Compara dos cadenamientos: numérico si ambos son números, sino lexicográfico. Vacíos al final. */
export function compararCadenamiento(a: string | undefined, b: string | undefined): number {
  const va = (a ?? '').trim()
  const vb = (b ?? '').trim()
  if (!va && !vb) return 0
  if (!va) return 1
  if (!vb) return -1
  const na = Number(va)
  const nb = Number(vb)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return va.localeCompare(vb)
}

function extraerRestoX(punto: PuntoFerroviario): number {
  const geo = punto.moduloData?.georeferencia ?? punto.moduloData?.georeferenciacion
  const x = geo?.coordenadas?.x
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0
  return separarDigitos(x, 2).resto
}

export function ordenarPuntos(puntos: PuntoFerroviario[], sortKey: SortKey): PuntoFerroviario[] {
  const copia = [...puntos]
  switch (sortKey) {
    case 'nombre-asc':
      return copia.sort((a, b) => a.nombre.localeCompare(b.nombre))
    case 'nombre-desc':
      return copia.sort((a, b) => b.nombre.localeCompare(a.nombre))
    case 'fecha-asignada-asc':
      return copia.sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''))
    case 'fecha-asignada-desc':
      return copia.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    case 'fecha-ingreso-asc':
      return copia.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
    case 'fecha-ingreso-desc':
      return copia.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    case 'cadenamiento-asc':
      return copia.sort((a, b) => compararCadenamiento(a.cadenamiento, b.cadenamiento))
    case 'cadenamiento-desc':
      return copia.sort((a, b) => compararCadenamiento(b.cadenamiento, a.cadenamiento))
    case 'cadenamiento-coordenada':
      return copia.sort((a, b) => {
        const cadComp = compararCadenamiento(a.cadenamiento, b.cadenamiento)
        if (cadComp !== 0) return cadComp
        return extraerRestoX(b) - extraerRestoX(a)
      })
    case 'manual':
    default:
      return copia.sort((a, b) => a.numeroSerie - b.numeroSerie)
  }
}
