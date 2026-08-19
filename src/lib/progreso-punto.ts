import type { PuntoFerroviario } from '@/types'

export type PasoId = 'punto' | 'fotos' | 'analisis' | 'plantilla' | 'campos'
export type EstadoPaso = 'done' | 'current' | 'pending'

export interface PasoProgreso {
  id: PasoId
  etiqueta: string
  hecho: boolean
  estado: EstadoPaso
  tooltip: string
}

export interface ProgresoPunto {
  pasos: PasoProgreso[]
  camposFaltantes: string[]
  plantillaEncontrada: boolean
  resumen: string
}

export const COORDS_BASE_FICHA: readonly string[] = ['0-F', '1-B', '1-D', '1-F', '7-D', '7-F', '8-F']

const ORDEN_PASOS: PasoId[] = ['punto', 'fotos', 'analisis', 'plantilla', 'campos']

const ETIQUETAS: Record<PasoId, string> = {
  punto: 'Punto',
  fotos: 'Fotos',
  analisis: 'Análisis',
  plantilla: 'Plantilla',
  campos: 'Campos',
}

const TOOLTIPS: Record<PasoId, string> = {
  punto: 'Cargar puntos o carpetas',
  fotos: 'Elegir foto o fotos',
  analisis: 'Realizar análisis',
  plantilla: 'Elegir una plantilla guardada',
  campos: 'Completar campos del formato',
}

interface MaterialesLike {
  valores?: Record<string, string>
  plantillaActivaId?: string | null
  camposCustom?: Array<{ coord: string; etiqueta?: string }>
}

interface AnalisisLike {
  fotosIndexadas?: unknown[]
  results?: unknown[]
}

function leerMateriales(punto: PuntoFerroviario): MaterialesLike {
  const md = punto.moduloData as Record<string, unknown> | undefined
  return (md?.materiales as MaterialesLike | undefined) ?? {}
}

function leerAnalisis(punto: PuntoFerroviario): AnalisisLike {
  const md = punto.moduloData as Record<string, unknown> | undefined
  return (md?.analisis as AnalisisLike | undefined) ?? {}
}

export function camposRequeridos(punto: PuntoFerroviario): string[] {
  const coords = new Set<string>(COORDS_BASE_FICHA)
  for (const campo of leerMateriales(punto).camposCustom ?? []) {
    if (!(campo.etiqueta ?? '').trim()) continue
    coords.add(campo.coord)
  }
  return [...coords]
}

export function calcularProgresoPunto(
  punto: PuntoFerroviario,
  plantillas: ReadonlyArray<{ id: string }> = [],
): ProgresoPunto {
  const analisis = leerAnalisis(punto)
  const materiales = leerMateriales(punto)
  const valores = materiales.valores ?? {}
  const requeridos = camposRequeridos(punto)
  const camposFaltantes = requeridos.filter((coord) => !(valores[coord] ?? '').trim())
  const plantillaActivaId = materiales.plantillaActivaId ?? null
  const plantillaEncontrada = !!plantillaActivaId && plantillas.some((p) => p.id === plantillaActivaId)

  const condiciones: Record<PasoId, boolean> = {
    punto: true,
    fotos: (analisis.fotosIndexadas?.length ?? 0) > 0,
    analisis: (analisis.results?.length ?? 0) > 0,
    plantilla: !!plantillaActivaId,
    campos: camposFaltantes.length === 0,
  }

  const indicePendiente = ORDEN_PASOS.findIndex((id) => !condiciones[id])

  const pasos: PasoProgreso[] = ORDEN_PASOS.map((id, i) => ({
    id,
    etiqueta: ETIQUETAS[id],
    hecho: condiciones[id],
    estado: indicePendiente === -1 || i < indicePendiente ? 'done' : i === indicePendiente ? 'current' : 'pending',
    tooltip: TOOLTIPS[id],
  }))

  const llenos = requeridos.length - camposFaltantes.length
  const resumen = pasos
    .map((paso) =>
      paso.id === 'campos'
        ? `${paso.etiqueta} ${llenos}/${requeridos.length}`
        : `${paso.etiqueta} ${paso.hecho ? '✓' : '✗'}`,
    )
    .join(' · ')

  return { pasos, camposFaltantes, plantillaEncontrada, resumen }
}

export function puntosListosParaExportar(
  puntos: ReadonlyArray<PuntoFerroviario>,
  plantillas: ReadonlyArray<{ id: string }> = [],
): string[] {
  return puntos
    .filter((punto) => calcularProgresoPunto(punto, plantillas).pasos.every((paso) => paso.hecho))
    .map((punto) => punto.id)
}
