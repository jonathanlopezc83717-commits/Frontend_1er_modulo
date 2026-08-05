import { useAppSelector, useAppActions, useAppStore, shallow } from '@/context/AppContext'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import {
  ChevronDown,
  Eraser,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  LayoutTemplate,
  Link2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CampoCombo, COORDS_CON_OPCIONES, useOpcionesCampos } from './campo-combo'
import { EditarEtiquetasMateriales } from './EditarEtiquetasMateriales'
import { latLngToUtmEasting, latLngToUtmNorthing } from '@/lib/utm'

// =====================================================
// TIPOS
// =====================================================

/** Datos del módulo Formato almacenados en punto.moduloData.materiales */
export interface FichaFormatoData {
  /** Valores indexados por coordenada fila-columna, ej. "0-F", "1-B". */
  valores: Record<string, string>
  /** Imágenes indexadas por clave: "croquis", "evid-0", "evid-1", "evid-2". */
  imagenes: Record<string, string>
  /** Número de evidencias configurado. */
  numEvidencias?: number
  /** Indica si se debe quitar el fondo blanco de los logos. */
  quitarFondoLogos?: boolean
  /** Configuración de la plantilla del Formato (persistida para sobrevivir recargas). */
  camposCustom?: Array<{ coord: string; etiqueta: string; origen?: string; combo?: boolean; coordenadas?: boolean; lados?: string[] }>
  etiquetas?: Record<string, string>
  origenCoords?: Record<string, string>
  plantillaActivaId?: string | null
  /** Coordenadas rellenadas a mano; un apply global nunca las sobrescribe. */
  coordsManuales?: string[]
  updatedAt?: string
}

// =====================================================
// DEFINICIÓN DE COORDENADAS (fila-columna)
// Replica exacta del layout del HTML pdf_hacia_html.html
// =====================================================

/** Mapa coordenada -> clave de campo del modelo de datos. */
export const COORD_A_CAMPO: Record<string, string> = {
  '0-F': 'clave',
  '1-B': 'fecha',
  '1-D': 'segmento',
  '1-F': 'tramo',
  '7-D': 'descripcion_izquierda',
  '7-F': 'descripcion_derecha',
  '8-F': 'observaciones',
}

/**
 * Catálogo de elementos que pueden usarse como origen de un campo personalizado.
 * El valor `'__ninguno__'` es un centinela: Radix Select no permite items con
 * value vacío, así que se mapea a `origen === ''` en el límite del componente.
 */
export const ELEMENTOS_DISPONIBLES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '__ninguno__', label: 'Ninguno (manual)' },
  { value: 'clave', label: 'Clave (de carpeta)' },
  { value: 'fecha', label: 'Fecha (de carpeta)' },
  { value: 'coordenada_x', label: 'Coordenada GPS X (UTM)' },
  { value: 'coordenada_y', label: 'Coordenada GPS Y (UTM)' },
  { value: 'coordenada_z', label: 'Coordenada GPS Z (Elevación)' },
  { value: 'observaciones', label: 'Descripción de la obra' },
  { value: 'cadenamiento_inicio', label: 'Cadenamiento inicio' },
  { value: 'cadenamiento_fin', label: 'Cadenamiento fin' },
  { value: 'cadenamiento', label: 'Cadenamiento (del punto)' },
]


/** Mapa de imágenes. */
const IMAGEN_COORD: Record<string, string> = {
  croquis: 'croquis',
  'evid-0': 'evidencia_1',
  'evid-1': 'evidencia_2',
  'evid-2': 'evidencia_3',
}

// Source of truth para labels visibles y exportados.
// Claves: coord (filas del grid) + 'sec:<id>' (headers de sección en exporters).
// Editable via EditarEtiquetasMateriales; override persiste en PlantillaLogos.
const LABELS_DEFAULT: Record<string, string> = {
  // Filas del grid (coords)
  '1-B': 'Fecha',
  '1-D': 'Segmento',
  '1-F': 'Tramo',
  // Headers de sección (exporters)
  'sec:titulo': 'FICHA DE IDENTIFICACIÓN DE INFRAESTRUCTURA EXISTENTE',
  'sec:proyecto': 'Tren de Pasajeros Saltillo - Nuevo Laredo Segmentos 16 y 17',
  'sec:clave': 'Clave:',
  'sec:estado-izq': 'Estado actual y descripción del estado del elemento. Lado Izquierdo',
  'sec:estado-der': 'Lado derecho',
  'sec:croquis': 'CROQUIS DE LOCALIZACIÓN:',
  'sec:observaciones': 'Observaciones:',
  'sec:evidencias': 'EVIDENCIA FOTOGRÁFICA',
}

function resolverLabel(key: string, override: Record<string, string> | undefined): string {
  return override?.[key] ?? LABELS_DEFAULT[key] ?? key
}

interface ParesCoord { x?: string; y?: string }
interface CoordenadasValor { lado: string; pares: Record<string, ParesCoord> }

function parseCoordenadas(raw: string): CoordenadasValor | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as unknown
    if (p && typeof p === 'object' && typeof (p as CoordenadasValor).lado === 'string' && (p as CoordenadasValor).pares && typeof (p as CoordenadasValor).pares === 'object') {
      return { lado: (p as CoordenadasValor).lado, pares: (p as CoordenadasValor).pares as Record<string, ParesCoord> }
    }
    return null
  } catch {
    return null
  }
}

function formatearCoordenadas(raw: string): string {
  const v = parseCoordenadas(raw)
  if (!v || !v.lado) return ''
  const tokens = v.lado.split('-')
  return tokens.map(t => {
    const p = v.pares[t] ?? {}
    return `${t}: ${p.x ?? ''}, ${p.y ?? ''}`
  }).join(' | ')
}

/** Filas editables derivadas de LABELS_DEFAULT: coords → grupo 'fila', sec:* → 'seccion'. */
const FILAS_EDITABLES = Object.entries(LABELS_DEFAULT).map(([key, defaultLabel]) => ({
  key,
  defaultLabel,
  grupo: (key.startsWith('sec:') ? 'seccion' : 'fila') as 'fila' | 'seccion',
}))

/** Filas de datos para el formulario (3 columnas por fila: etiqueta/valor). */
const FILAS_DATOS: Array<Array<{ etiqueta: string; coord: string }>> = [
  [{ etiqueta: LABELS_DEFAULT['1-B'], coord: '1-B' }, { etiqueta: LABELS_DEFAULT['1-D'], coord: '1-D' }, { etiqueta: LABELS_DEFAULT['1-F'], coord: '1-F' }],
]

/** Número máximo de evidencias permitidas. */
const MAX_EVIDENCIAS = 12
/** Número por defecto de evidencias. */
const EVIDENCIAS_DEFECTO = 3

/** Prefijo para persistir el logo derecho (logo 2) en localStorage por punto. */
const LOGO_DER_STORAGE_PREFIX = 'ferroviario_formato_logo_der'

function logoDerStorageKey(puntoId: string): string {
  return `${LOGO_DER_STORAGE_PREFIX}_${puntoId}`
}

/**
 * Cache local SINCRÓNICO por punto de los datos del Formato (valores + config,
 * SIN imágenes). Se escribe directo en localStorage en cada guardado para que
 * sobreviva a recargas incluso si el effect de persistencia global no alcanza
 * a correr antes del unload (caso típico: editar y recargar rápido).
 */
const MATERIALES_STORAGE_PREFIX = 'ferroviario_formato_materiales'
function materialesStorageKey(puntoId: string): string {
  return `${MATERIALES_STORAGE_PREFIX}_${puntoId}`
}

// =====================================================
// PLANTILLAS DE LOGOS
// =====================================================

/** Plantilla que conserva logos + etiquetas editadas del formato. */
export interface PlantillaLogos {
  id: string
  nombre: string
  logoIzq?: string
  logoDer?: string
  etiquetas?: Record<string, string>
  camposCustom?: Array<{ coord: string; etiqueta: string; origen?: string; combo?: boolean; coordenadas?: boolean; lados?: string[] }>
  origenCoords?: Record<string, string>
  createdAt: string
}

const PLANTILLAS_LOGOS_KEY = 'ferroviario_formato_logo_templates'

export function cargarPlantillasLogos(): PlantillaLogos[] {
  try {
    const raw = localStorage.getItem(PLANTILLAS_LOGOS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((p): p is PlantillaLogos =>
      !!p && typeof p === 'object' && 'id' in p && 'nombre' in p
    ) : []
  } catch {
    return []
  }
}

function guardarPlantillasLogos(plantillas: PlantillaLogos[]): void {
  try {
    localStorage.setItem(PLANTILLAS_LOGOS_KEY, JSON.stringify(plantillas))
  } catch {
    // Ignorar errores de cuota
  }
}

export function buildMaterialesFromPlantilla(plantilla: PlantillaLogos): FichaFormatoData {
  const imagenes: Record<string, string> = {}
  if (plantilla.logoIzq) imagenes['logo-izq'] = plantilla.logoIzq
  if (plantilla.logoDer) imagenes['logo-der'] = plantilla.logoDer
  return {
    valores: {},
    imagenes,
    etiquetas: plantilla.etiquetas ?? {},
    camposCustom: plantilla.camposCustom ?? [],
    origenCoords: plantilla.origenCoords ?? {},
    plantillaActivaId: plantilla.id,
    numEvidencias: 3,
    quitarFondoLogos: false,
    coordsManuales: [],
    updatedAt: new Date().toISOString(),
  }
}

/** Genera la lista de evidencias según el número indicado. */
function generarEvidencias(n: number) {
  const total = Math.max(0, Math.min(n, MAX_EVIDENCIAS))
  return Array.from({ length: total }, (_, i) => ({
    key: `evid-${i}`,
    label: `Foto ${i + 1}`,
  }))
}

/**
 * Calcula la distribución de evidencias fotográficas según el número de imágenes.
 * - 1 imagen: 1 fila × 1 columna (centrada)
 * - 2 imágenes: 1 fila × 2 columnas
 * - 3 imágenes: 1 fila × 3 columnas
 * - 4 imágenes: 2 filas × 2 columnas
 * - 5+ imágenes: filas de hasta 3 columnas, centrando la última fila incompleta
 */
function calcularDistribucionEvidencias(n: number): { cols: number; rows: number } {
  const total = Math.max(0, Math.min(n, MAX_EVIDENCIAS))
  if (total === 0) return { cols: 0, rows: 0 }
  if (total <= 3) return { cols: total, rows: 1 }
  if (total === 4) return { cols: 2, rows: 2 }
  return { cols: 3, rows: Math.ceil(total / 3) }
}

// =====================================================
// UTILIDADES DE EXTRACCIÓN (autocompletado desde otros módulos)
// =====================================================

export function extraerValor(punto: unknown, campo: string): string {
  if (!punto || typeof punto !== 'object') return ''
  const p = punto as Record<string, unknown>
  const moduloData = p.moduloData as Record<string, unknown> | undefined

  switch (campo) {
    case 'clave':
      return String(p.carpetaPath || '').split(/[\\/]/).filter(Boolean).pop() || ''
    case 'fecha': {
      const nombre = String(p.carpetaPath || '')
      const match = nombre.match(/(\d{2})_(\d{2})_(\d{4})/)
      return match ? `${match[1]}/${match[2]}/${match[3]}` : ''
    }
    case 'coordenada_x': {
      const geo = moduloData?.georeferencia as Record<string, unknown> | undefined
      const c = geo?.coordenadas as { x?: number; y?: number } | undefined
      if (c && c.x !== undefined && c.y !== undefined) {
        return latLngToUtmEasting(c.y, c.x) ?? ''
      }
      return ''
    }
    case 'coordenada_y': {
      const geo = moduloData?.georeferencia as Record<string, unknown> | undefined
      const c = geo?.coordenadas as { x?: number; y?: number } | undefined
      if (c && c.x !== undefined && c.y !== undefined) {
        return latLngToUtmNorthing(c.y, c.x) ?? ''
      }
      return ''
    }
    case 'coordenada_z': {
      const geo = moduloData?.georeferencia as Record<string, unknown> | undefined
      const c = geo?.coordenadas as { x?: number; y?: number; z?: number } | undefined
      return c?.z !== undefined ? String(c.z) : ''
    }
    case 'cadenamiento': {
      return String(p.cadenamiento || '')
    }
    case 'observaciones': {
      const analisis = moduloData?.analisis as Record<string, unknown> | undefined
      const results = (analisis?.results || []) as Array<{ description?: string }>
      const descripcionObra = results[0]?.description
      return String(descripcionObra || analisis?.descripcionGeneral || '')
    }
    default:
      return ''
  }
}

// Cadenamiento inicio/fin se definen desde los puntos: el del punto 1 (primero
// por numeroSerie) es "inicio", y el del último punto registrado es "fin".
function calcularRangoCadenamiento(puntos: ReadonlyArray<{ cadenamiento?: string }>): { inicio: string; fin: string } {
  if (puntos.length === 0) return { inicio: '', fin: '' }
  return {
    inicio: puntos[0]?.cadenamiento || '',
    fin: puntos[puntos.length - 1]?.cadenamiento || '',
  }
}

function extraerImagen(punto: unknown, campo: string): string {
  if (!punto || typeof punto !== 'object') return ''
  const p = punto as Record<string, unknown>
  const moduloData = p.moduloData as Record<string, unknown> | undefined

  if (campo === 'croquis') {
    return String((moduloData?.georeferencia as Record<string, unknown>)?.croquis || '')
  }

  const evidenciaIndex = ['evidencia_1', 'evidencia_2', 'evidencia_3', 'evidencia_4'].indexOf(campo)
  if (evidenciaIndex >= 0) {
    const analisis = moduloData?.analisis as Record<string, unknown> | undefined
    const urls = (analisis?.imageUrls || []) as string[]
    const fotos = (analisis?.fotosIndexadas || []) as Array<{ preview?: string }>
    const todas = [...urls, ...fotos.map(f => f.preview || '')].filter(Boolean)
    return todas[evidenciaIndex] || ''
  }
  return ''
}

/** Devuelve todas las URLs/previews de imágenes disponibles en el módulo de reconocimiento. */
function obtenerImagenesDeReconocimiento(punto: unknown): string[] {
  if (!punto || typeof punto !== 'object') return []
  const p = punto as Record<string, unknown>
  const moduloData = p.moduloData as Record<string, unknown> | undefined
  const analisis = moduloData?.analisis as Record<string, unknown> | undefined
  const urls = (analisis?.imageUrls || []) as string[]
  const fotos = (analisis?.fotosIndexadas || []) as Array<{ preview?: string }>
  return [...urls, ...fotos.map(f => f.preview || '')].filter(Boolean)
}

/**
 * Busca el croquis de localización entre las fotos ya importadas del punto.
 * El batch genera el PNG como `{nombrePunto}_{label}.png`, así que coincide
 * por prefijo: nombre de archivo (sin extensión) igual al punto o que empiece
 * con `{nombrePunto}_`. Preferencia PNG. Devuelve el dataURL/preview o ''.
 */
function buscarCroquisEnFotos(punto: unknown): string {
  if (!punto || typeof punto !== 'object') return ''
  const p = punto as Record<string, unknown>
  const nombre = typeof p.nombre === 'string' ? p.nombre.trim() : ''
  if (!nombre) return ''
  const fotos = ((p.moduloData as Record<string, unknown> | undefined)?.analisis as
    Record<string, unknown> | undefined)?.fotosIndexadas as
    Array<{ nombre?: string; preview?: string }> | undefined
  if (!Array.isArray(fotos)) return ''
  const sinExt = (n: string) => n.replace(/\.[^/.]+$/, '')
  const coincide = (f: { nombre?: string }) => {
    const base = f.nombre ? sinExt(f.nombre) : ''
    return base === nombre || base.startsWith(nombre + '_')
  }
  const png = fotos.find(f => coincide(f) && f.nombre?.toLowerCase().endsWith('.png'))
  const cualquiera = fotos.find(f => coincide(f))
  return (png || cualquiera || {}).preview || ''
}

async function leerImagen(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function descargarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombre
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function formatoImagen(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
}

/**
 * Obtiene las dimensiones naturales (ancho, alto) de una imagen dataURL.
 */
function obtenerDimensionesImagen(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
    img.onerror = () => resolve({ w: 1, h: 1 })
    img.src = dataUrl
  })
}

/**
 * Calcula el tamaño (w, h) que ocupa una imagen dentro de un recuadro máximo,
 * MANTENIENDO la relación de aspecto (sin deformar).
 * El resultado se centra dentro del recuadro.
 */
function calcularAjusteContain(
  imgW: number,
  imgH: number,
  maxW: number,
  maxH: number,
): { w: number; h: number; offsetX: number; offsetY: number } {
  const ratio = imgW / imgH
  let w = maxW
  let h = w / ratio
  if (h > maxH) {
    h = maxH
    w = h * ratio
  }
  return {
    w,
    h,
    offsetX: (maxW - w) / 2,
    offsetY: (maxH - h) / 2,
  }
}

/**
 * Recorta una imagen (dataURL) al aspect ratio objetivo, centrada.
 * Devuelve un nuevo dataURL PNG que llena exactamente el ratio objetivo.
 * Esto garantiza que TODAS las imágenes ocupen el mismo espacio visual.
 */
async function recortarImagenCover(dataUrl: string, targetRatio: number): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = dataUrl
    })
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const imgRatio = iw / ih

    let cropW: number, cropH: number, sx: number, sy: number
    if (imgRatio > targetRatio) {
      // Imagen más ancha: recortar lados
      cropH = ih
      cropW = ih * targetRatio
      sx = (iw - cropW) / 2
      sy = 0
    } else {
      // Imagen más alta: recortar arriba/abajo
      cropW = iw
      cropH = iw / targetRatio
      sx = 0
      sy = (ih - cropH) / 2
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(cropW)
    canvas.height = Math.round(cropH)
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return dataUrl
  }
}

/**
 * Procesa una imagen dataURL: si `quitarFondo` es true, convierte los píxeles
 * cercanos al blanco (umbral) en transparentes y devuelve un PNG dataURL.
 */
async function procesarLogo(dataUrl: string, quitarFondo: boolean, umbral = 235): Promise<string> {
  if (!dataUrl || !quitarFondo) return dataUrl
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = dataUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] >= umbral && data[i + 1] >= umbral && data[i + 2] >= umbral) {
        data[i + 3] = 0
      }
    }
    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return dataUrl
  }
}

// =====================================================
// EXPORTACIÓN PDF (jsPDF) — réplica exacta del HTML
// =====================================================

interface TxtOpts {
  fs?: number
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  color?: number[]
  vcenter?: boolean
  px?: number
  py?: number
  h?: number
}

export async function exportarPdfFicha(
  valores: Record<string, string>,
  imagenes: Record<string, string>,
  nombreArchivo = 'Ficha_LMT-T11-02',
  opciones: { quitarFondoLogos?: boolean; numEvidencias?: number } = {},
  etiquetas?: Record<string, string>,
  camposCustom: ReadonlyArray<{ coord: string; etiqueta: string; origen?: string; combo?: boolean; coordenadas?: boolean; lados?: string[] }> = [],
  escribirEn?: (nombre: string, blob: Blob) => Promise<void>,
) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const d = valores
  const quitarFondo = opciones.quitarFondoLogos ?? false
  const numEvidencias = opciones.numEvidencias ?? 3

  const ML = 8
  const MT = 8
  const PW = 210 - ML * 2
  const PH = 297 - MT * 2

  // 6 columnas (total 194mm)
  const C = [30, 24, 28, 24, 40, 48]
  const CX: number[] = [ML]
  for (let i = 1; i <= 6; i++) CX.push(CX[i - 1] + C[i - 1])

  // Alturas de fila
  const Htitle = 20
  const Hsub = 8
  const Hdata = 8
  const HestLbl = 7
  const HestVal = 35
  const HcrLbl = 7
  const HcrVal = 55
  const HevLbl = 7
  const HevVal = 65

  // Y de cada sección
  let y = MT
  const Ytitle = y; y += Htitle
  const Ysub = y; y += Hsub
  const dataRows = [
    { v: ['1-B', '1-D', '1-F'] },
  ]
  const Ydata: number[] = []
  for (let i = 0; i < dataRows.length; i++) { Ydata.push(y); y += Hdata }
  const filasCustom = Math.ceil(camposCustom.length / 3)
  const Ycustom: number[] = []
  for (let i = 0; i < filasCustom; i++) { Ycustom.push(y); y += Hdata }
  const YestLbl = y; y += HestLbl
  const YestVal = y; y += HestVal
  const YcrLbl = y; y += HcrLbl
  const YcrVal = y; y += HcrVal
  const YevLbl = y; y += HevLbl
  const YevVal = y; y += HevVal

  if (y > MT + PH + 2) {
    // eslint-disable-next-line no-console
    console.warn('El contenido del formato excede una página A4')
  }

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)

  const cell = (x: number, yy: number, w: number, h: number, bg?: number[]) => {
    if (bg) {
      doc.setFillColor(bg[0], bg[1], bg[2])
      doc.rect(x, yy, w, h, 'FD')
    } else {
      doc.rect(x, yy, w, h)
    }
  }

  const txt = (text: string, x: number, yy: number, w: number, opts: TxtOpts = {}) => {
    if (!text) return
    const fs = opts.fs || 7.5
    const style = opts.bold ? 'bold' : 'normal'
    const align = opts.align || 'left'
    const color = opts.color || [0, 0, 0]
    const px = opts.px || 2
    const h = opts.h || Hdata

    doc.setFontSize(fs)
    doc.setFont('helvetica', style)
    doc.setTextColor(color[0], color[1], color[2])

    const lines = doc.splitTextToSize(String(text), w - px * 2)

    // Calcular posición X según alineación:
    // - left:   esquina izquierda + padding
    // - center: centro exacto del recuadro
    // - right:  esquina derecha - padding
    let textX: number
    if (align === 'center') {
      textX = x + w / 2
    } else if (align === 'right') {
      textX = x + w - px
    } else {
      textX = x + px
    }

    if (opts.vcenter) {
      const lineH = fs * 0.3528
      const totalH = lines.length * lineH
      const startY = yy + h / 2 - totalH / 2 + lineH
      doc.text(lines, textX, startY, { align })
    } else {
      doc.text(lines, textX, yy + (opts.py || 2.5), { align })
    }
  }

  // 1. Título (fondo negro, texto blanco centrado) + logos
  cell(ML, Ytitle, PW, Htitle, [26, 26, 26])

  // Disposición simétrica en 3 zonas equilibradas:
  //  [logo izq (25%)] [título (50%)] [logo der (25%)]
  // El título siempre tiene ancho garantizado para que no desaparezca.
  const logoZoneW = PW * 0.25
  const tituloZoneX = ML + logoZoneW
  const tituloZoneW = PW * 0.5
  const logoMaxH = Htitle - 4

  // Logo izquierdo: centrado en su zona [ML, ML + logoZoneW]
  if (imagenes['logo-izq']) {
    try {
      const logoIzq = await procesarLogo(imagenes['logo-izq'], quitarFondo)
      const dim = await obtenerDimensionesImagen(logoIzq)
      const fit = calcularAjusteContain(dim.w, dim.h, logoZoneW, logoMaxH)
      doc.addImage(
        logoIzq,
        formatoImagen(logoIzq),
        ML + (logoZoneW - fit.w) / 2,
        Ytitle + (Htitle - fit.h) / 2,
        fit.w,
        fit.h,
      )
    } catch { /* ignorar */ }
  }

  // Logo derecho: centrado en su zona [ML + PW - logoZoneW, ML + PW]
  if (imagenes['logo-der']) {
    try {
      const logoDer = await procesarLogo(imagenes['logo-der'], quitarFondo)
      const dim = await obtenerDimensionesImagen(logoDer)
      const fit = calcularAjusteContain(dim.w, dim.h, logoZoneW, logoMaxH)
      const derZoneX = ML + PW - logoZoneW
      doc.addImage(
        logoDer,
        formatoImagen(logoDer),
        derZoneX + (logoZoneW - fit.w) / 2,
        Ytitle + (Htitle - fit.h) / 2,
        fit.w,
        fit.h,
      )
    } catch { /* ignorar */ }
  }

  // Título: centrado en la zona central (siempre visible)
  txt(resolverLabel('sec:titulo', etiquetas), tituloZoneX, Ytitle, tituloZoneW, {
    fs: 10, bold: true, color: [255, 255, 255], align: 'center', vcenter: true, py: 0, h: Htitle,
  })

  // 2. Subtítulo (proyecto + clave)
  cell(ML, Ysub, CX[4] - ML, Hsub, [45, 45, 45])
  txt(resolverLabel('sec:proyecto', etiquetas), ML, Ysub, CX[4] - ML, {
    fs: 8, color: [255, 255, 255], vcenter: true, py: 0, h: Hsub,
  })
  cell(CX[4], Ysub, C[4], Hsub, [240, 241, 243])
  txt(resolverLabel('sec:clave', etiquetas), CX[4], Ysub, C[4], { fs: 7.5, bold: true, align: 'right', vcenter: true, py: 0, h: Hsub })
  cell(CX[5], Ysub, C[5], Hsub)
  txt(d['0-F'] || '', CX[5], Ysub, C[5], { fs: 7.5, vcenter: true, py: 0, h: Hsub })

  // 3. Filas de datos (1 fila × 3 pares etiqueta/valor)
  dataRows.forEach((row, ri) => {
    const yy = Ydata[ri]
    for (let p = 0; p < 3; p++) {
      const lx = CX[p * 2]
      const vx = CX[p * 2 + 1]
      const lbl = resolverLabel(row.v[p], etiquetas) + ':'
      cell(lx, yy, C[p * 2], Hdata, [240, 241, 243])
      const lblFS = lbl.length > 28 ? 6.5 : 7.5
      txt(lbl, lx, yy, C[p * 2], { fs: lblFS, bold: true, vcenter: true, py: 0, h: Hdata })
      cell(vx, yy, C[p * 2 + 1], Hdata)
      txt(d[row.v[p]] || '', vx, yy, C[p * 2 + 1], { fs: 7.5, vcenter: true, py: 0, h: Hdata })
    }
  })

  // 3b. Campos personalizados. La última fila con M < 3 redistribuye el ancho
  // proporcionalmente en vez de dejar celdas vacías a la derecha.
  for (let fi = 0; fi < filasCustom; fi++) {
    const yy = Ycustom[fi]
    const chunk = camposCustom.slice(fi * 3, fi * 3 + 3)
    const M = chunk.length
    if (M === 3) {
      for (let p = 0; p < 3; p++) {
        const lx = CX[p * 2]
        const vx = CX[p * 2 + 1]
        cell(lx, yy, C[p * 2], Hdata, [240, 241, 243])
        cell(vx, yy, C[p * 2 + 1], Hdata)
        const campo = chunk[p]
        const lbl = campo.etiqueta + ':'
        const lblFS = lbl.length > 28 ? 6.5 : 7.5
        txt(lbl, lx, yy, C[p * 2], { fs: lblFS, bold: true, vcenter: true, py: 0, h: Hdata })
        txt(campo.coordenadas ? formatearCoordenadas(d[campo.coord] || '') : (d[campo.coord] || ''), vx, yy, C[p * 2 + 1], { fs: 7.5, vcenter: true, py: 0, h: Hdata })
      }
    } else {
      const cellW = PW / M
      const labelW = cellW * 0.4
      const valorW = cellW * 0.6
      for (let p = 0; p < M; p++) {
        const lx = ML + p * cellW
        const vx = lx + labelW
        cell(lx, yy, labelW, Hdata, [240, 241, 243])
        cell(vx, yy, valorW, Hdata)
        const campo = chunk[p]
        const lbl = campo.etiqueta + ':'
        const lblFS = lbl.length > 28 ? 6.5 : 7.5
        txt(lbl, lx, yy, labelW, { fs: lblFS, bold: true, vcenter: true, py: 0, h: Hdata })
        txt(campo.coordenadas ? formatearCoordenadas(d[campo.coord] || '') : (d[campo.coord] || ''), vx, yy, valorW, { fs: 7.5, vcenter: true, py: 0, h: Hdata })
      }
    }
  }

  // 4. Estado actual — etiquetas
  cell(ML, YestLbl, CX[3] - ML, HestLbl, [240, 241, 243])
  txt(resolverLabel('sec:estado-izq', etiquetas), ML, YestLbl, CX[3] - ML, {
    fs: 7, bold: true, vcenter: true, py: 0, h: HestLbl,
  })
  cell(CX[3], YestLbl, CX[6] - CX[3], HestLbl, [240, 241, 243])
  txt(resolverLabel('sec:estado-der', etiquetas), CX[3], YestLbl, CX[6] - CX[3], {
    fs: 7.5, bold: true, align: 'center', vcenter: true, py: 0, h: HestLbl,
  })

  // 5. Estado actual — valores
  cell(ML, YestVal, CX[3] - ML, HestVal)
  txt(d['7-D'] || '', ML, YestVal, CX[3] - ML, { fs: 7, py: 2.5, h: HestVal })
  cell(CX[3], YestVal, CX[6] - CX[3], HestVal)
  txt(d['7-F'] || '', CX[3], YestVal, CX[6] - CX[3], { fs: 7, py: 2.5, h: HestVal })

  // 6. Croquis / Observaciones — etiquetas
  cell(ML, YcrLbl, CX[3] - ML, HcrLbl, [240, 241, 243])
  txt(resolverLabel('sec:croquis', etiquetas), ML, YcrLbl, CX[3] - ML, {
    fs: 7.5, bold: true, align: 'center', vcenter: true, py: 0, h: HcrLbl,
  })
  cell(CX[3], YcrLbl, CX[6] - CX[3], HcrLbl, [240, 241, 243])
  txt(resolverLabel('sec:observaciones', etiquetas), CX[3], YcrLbl, CX[6] - CX[3], {
    fs: 7.5, bold: true, align: 'center', vcenter: true, py: 0, h: HcrLbl,
  })

  // 7. Croquis / Observaciones — valores
  const crW = CX[3] - ML
  const obsW = CX[6] - CX[3]
  cell(ML, YcrVal, crW, HcrVal)
  if (imagenes.croquis) {
    try {
      const dim = await obtenerDimensionesImagen(imagenes.croquis)
      const fit = calcularAjusteContain(dim.w, dim.h, crW - 3, HcrVal - 3)
      doc.addImage(
        imagenes.croquis,
        formatoImagen(imagenes.croquis),
        ML + 1.5 + fit.offsetX,
        YcrVal + 1.5 + fit.offsetY,
        fit.w,
        fit.h,
      )
    } catch {
      doc.setFontSize(7)
      doc.setTextColor(180, 180, 180)
      doc.text('[Imagen de croquis]', ML + crW / 2 - 12, YcrVal + HcrVal / 2)
      doc.setTextColor(0, 0, 0)
    }
  } else {
    doc.setFontSize(7)
    doc.setTextColor(190, 190, 190)
    doc.text('[Sin imagen]', ML + crW / 2 - 10, YcrVal + HcrVal / 2)
    doc.setTextColor(0, 0, 0)
  }
  cell(CX[3], YcrVal, obsW, HcrVal)
  txt(d['8-F'] || '', CX[3], YcrVal, obsW, { fs: 7, py: 2.5, h: HcrVal })

  // 8. Evidencia fotográfica — etiqueta
  cell(ML, YevLbl, PW, HevLbl, [240, 241, 243])
  txt(resolverLabel('sec:evidencias', etiquetas), ML, YevLbl, PW, {
    fs: 7.5, bold: true, align: 'center', vcenter: true, py: 0, h: HevLbl,
  })

  // 9. Evidencia fotográfica — distribución simétrica según cantidad de imágenes
  const evTotal = Math.max(0, Math.min(numEvidencias, 12))
  const { cols: evCols, rows: evRows } = calcularDistribucionEvidencias(evTotal)
  const evSlotW = evCols > 0 ? PW / evCols : PW
  const evSlotH = evRows > 0 ? HevVal / evRows : HevVal
  const itemsUltimaFila = evTotal - (evRows - 1) * evCols
  const offsetUltimaFila = itemsUltimaFila < evCols ? Math.floor((evCols - itemsUltimaFila) / 2) : 0

  for (let i = 0; i < evTotal; i++) {
    const fila = Math.floor(i / evCols)
    const col = i % evCols
    const isUltimaFila = fila === evRows - 1
    const offset = isUltimaFila ? offsetUltimaFila : 0
    const ex = ML + (offset + col) * evSlotW
    const ey = YevVal + fila * evSlotH
    cell(ex, ey, evSlotW, evSlotH)
    const imgKey = `evid-${i}`
    if (imagenes[imgKey]) {
      try {
        // Mostrar la imagen COMPLETA sin recortar, ajustada con contain.
        const dim = await obtenerDimensionesImagen(imagenes[imgKey])
        const fit = calcularAjusteContain(dim.w, dim.h, evSlotW - 3, evSlotH - 3)
        doc.addImage(
          imagenes[imgKey],
          formatoImagen(imagenes[imgKey]),
          ex + 1.5 + fit.offsetX,
          ey + 1.5 + fit.offsetY,
          fit.w,
          fit.h,
        )
      } catch {
        doc.setFontSize(7)
        doc.setTextColor(190, 190, 190)
        doc.text(`[Foto ${i + 1}]`, ex + evSlotW / 2 - 8, ey + evSlotH / 2)
        doc.setTextColor(0, 0, 0)
      }
    } else {
      doc.setFontSize(7)
      doc.setTextColor(190, 190, 190)
      doc.text(`[Foto ${i + 1}]`, ex + evSlotW / 2 - 8, ey + evSlotH / 2)
      doc.setTextColor(0, 0, 0)
    }
    // Línea divisoria vertical entre columnas
    if (col < evCols - 1 && i < evTotal - 1) {
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.4)
      doc.line(ex + evSlotW, ey, ex + evSlotW, ey + evSlotH)
    }
    // Línea divisoria horizontal entre filas
    if (fila < evRows - 1) {
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.4)
      doc.line(ML, ey + evSlotH, ML + PW, ey + evSlotH)
    }
  }

  const nombrePdf = `${nombreArchivo}.pdf`
  if (escribirEn) {
    await escribirEn(nombrePdf, doc.output('blob'))
  } else {
    doc.save(nombrePdf)
  }
}

// =====================================================
// EXPORTACIÓN EXCEL (XLSX/SheetJS) — réplica del HTML
// =====================================================

export async function exportarExcelFicha(
  valores: Record<string, string>,
  imagenes: Record<string, string>,
  nombreArchivo = 'Ficha_LMT-T11-02',
  opciones: { quitarFondoLogos?: boolean; numEvidencias?: number; imagenesReconocimiento?: string[] } = {},
  etiquetas?: Record<string, string>,
  camposCustom: ReadonlyArray<{ coord: string; etiqueta: string; origen?: string; combo?: boolean; coordenadas?: boolean; lados?: string[] }> = [],
  escribirEn?: (nombre: string, blob: Blob) => Promise<void>,
) {
  const d = valores
  const quitarFondo = opciones.quitarFondoLogos ?? false
  const numEvidencias = Math.max(0, Math.min(opciones.numEvidencias ?? 3, 12))
  const imagenesReconocimiento = opciones.imagenesReconocimiento || []
  void XLSX // se conserva para compatibilidad, pero la escritura usa ExcelJS

  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('LMT-T11-02')
  ws.properties.showGridLines = false
  ws.views = [{ showGridLines: false }]

  // Anchos de columna IGUALES para que las evidencias fotográficas
  // tengan todas el mismo tamaño al agruparse de a 2 (o más) columnas.
  const colWidths = [30, 30, 30, 30, 30, 30]
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  // Estilos reutilizables
  const fillLabel = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F1F3' } }
  const fillDark = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1A1A1A' } }
  const fillSub = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2D2D2D' } }
  // Parámetros de texto AJUSTABLES (alineados al PDF: título 10, subtítulo 8, etiquetas/valores 7.5).
  // Modificá estos valores para cambiar el tamaño de todo el texto del Excel de una vez.
  const FS_TITULO = 10
  const FS_SUBTITULO = 8
  const FS_ETIQUETA = 7.5
  const FS_VALOR = 7.5
  const fontWhiteBold = { color: { argb: 'FFFFFFFF' }, bold: true, size: FS_TITULO }
  const fontWhite = { color: { argb: 'FFFFFFFF' }, size: FS_SUBTITULO }
  const fontLabelBold = { bold: true, size: FS_ETIQUETA }
  const fontValor = { size: FS_VALOR }
  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FF000000' } },
    left: { style: 'thin' as const, color: { argb: 'FF000000' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
    right: { style: 'thin' as const, color: { argb: 'FF000000' } },
  }

  // Fila 1: Logo izquierdo (A1) | Título (B1:E1) | Logo derecho (F1)
  // Con 6 columnas iguales: 1/6 logo, 4/6 título, 1/6 logo
  const cellLogoIzq = ws.getCell('A1')
  cellLogoIzq.fill = fillDark
  cellLogoIzq.border = thinBorder

  ws.mergeCells('B1:E1')
  const cellTitulo = ws.getCell('B1')
  cellTitulo.value = resolverLabel('sec:titulo', etiquetas)
  cellTitulo.fill = fillDark
  cellTitulo.font = fontWhiteBold
  cellTitulo.alignment = { horizontal: 'center', vertical: 'middle' }
  cellTitulo.border = thinBorder

  const cellLogoDer = ws.getCell('F1')
  cellLogoDer.fill = fillDark
  cellLogoDer.border = thinBorder
  ws.getRow(1).height = 60

  // Fila 2: Proyecto (A2:D2) + Clave (E2) + valor clave (F2)
  ws.mergeCells('A2:D2')
  const cellProy = ws.getCell('A2')
  cellProy.value = resolverLabel('sec:proyecto', etiquetas)
  cellProy.fill = fillSub
  cellProy.font = fontWhite
  cellProy.alignment = { vertical: 'middle' }
  cellProy.border = thinBorder

  const cellClaveLbl = ws.getCell('E2')
  cellClaveLbl.value = resolverLabel('sec:clave', etiquetas)
  cellClaveLbl.fill = fillLabel
  cellClaveLbl.font = fontLabelBold
  cellClaveLbl.alignment = { horizontal: 'right', vertical: 'middle' }
  cellClaveLbl.border = thinBorder

  const cellClaveVal = ws.getCell('F2')
  cellClaveVal.value = d['0-F'] || ''
  cellClaveVal.border = thinBorder
  cellClaveVal.font = fontValor
  cellClaveVal.alignment = { vertical: 'middle' }
  ws.getRow(2).height = 23

  // Fila 3: datos (1 fila × 3 pares etiqueta/valor)
  const dataRows = [
    { v: ['1-B', '1-D', '1-F'] },
  ]
  dataRows.forEach((row, ri) => {
    const rowNumber = ri + 3
    ws.getRow(rowNumber).height = 23
    for (let p = 0; p < 3; p++) {
      const lblCol = p * 2 + 1
      const valCol = p * 2 + 2
      const cellLbl = ws.getCell(rowNumber, lblCol)
      cellLbl.value = resolverLabel(row.v[p], etiquetas) + ':'
      cellLbl.fill = fillLabel
      cellLbl.font = fontLabelBold
      cellLbl.alignment = { vertical: 'middle', wrapText: true }
      cellLbl.border = thinBorder

      const cellVal = ws.getCell(rowNumber, valCol)
      cellVal.value = d[row.v[p]] || ''
      cellVal.border = thinBorder
      cellVal.font = fontValor
      cellVal.alignment = { vertical: 'middle', wrapText: true }
    }
  })

  // Filas adicionales: campos personalizados. Misma grilla que la fila de datos
  // (Fecha/Segmento/Tramo): 3 casillas de 1/3 c/u (etiqueta + valor). Solo se
  // dibujan las casillas definidas; las que falten en la última fila quedan libres.
  let fila = 3 + dataRows.length
  const filasCustom = Math.ceil(camposCustom.length / 3)
  for (let fi = 0; fi < filasCustom; fi++) {
    ws.getRow(fila).height = 23
    const chunk = camposCustom.slice(fi * 3, fi * 3 + 3)
    for (let p = 0; p < 3; p++) {
      const campo = chunk[p]
      if (!campo) continue
      const lblCol = p * 2 + 1
      const valCol = p * 2 + 2
      const cellLbl = ws.getCell(fila, lblCol)
      cellLbl.value = campo.etiqueta + ':'
      cellLbl.fill = fillLabel
      cellLbl.font = fontLabelBold
      cellLbl.alignment = { vertical: 'middle', wrapText: true }
      cellLbl.border = thinBorder
      const cellVal = ws.getCell(fila, valCol)
      cellVal.value = campo.coordenadas ? formatearCoordenadas(d[campo.coord] || '') : (d[campo.coord] || '')
      cellVal.font = fontValor
      cellVal.alignment = { vertical: 'middle', wrapText: true }
      cellVal.border = thinBorder
    }
    fila++
  }

  // Fila estado actual: etiquetas
  ws.mergeCells(`A${fila}:C${fila}`)
  const cellEstIzqLbl = ws.getCell(`A${fila}`)
  cellEstIzqLbl.value = resolverLabel('sec:estado-izq', etiquetas)
  cellEstIzqLbl.fill = fillLabel
  cellEstIzqLbl.font = fontLabelBold
  cellEstIzqLbl.alignment = { vertical: 'middle', wrapText: true }
  cellEstIzqLbl.border = thinBorder

  ws.mergeCells(`D${fila}:F${fila}`)
  const cellEstDerLbl = ws.getCell(`D${fila}`)
  cellEstDerLbl.value = resolverLabel('sec:estado-der', etiquetas)
  cellEstDerLbl.fill = fillLabel
  cellEstDerLbl.font = fontLabelBold
  cellEstDerLbl.alignment = { horizontal: 'center', vertical: 'middle' }
  cellEstDerLbl.border = thinBorder
  fila++

  // Estado actual: valores
  ws.mergeCells(`A${fila}:C${fila}`)
  const cellEstIzqVal = ws.getCell(`A${fila}`)
  cellEstIzqVal.value = d['7-D'] || ''
  cellEstIzqVal.font = fontValor
  cellEstIzqVal.alignment = { vertical: 'top', wrapText: true }
  cellEstIzqVal.border = thinBorder

  ws.mergeCells(`D${fila}:F${fila}`)
  const cellEstDerVal = ws.getCell(`D${fila}`)
  cellEstDerVal.value = d['7-F'] || ''
  cellEstDerVal.font = fontValor
  cellEstDerVal.alignment = { vertical: 'top', wrapText: true }
  cellEstDerVal.border = thinBorder
  ws.getRow(fila).height = 99
  fila++

  // Croquis / Observaciones: etiquetas
  ws.mergeCells(`A${fila}:C${fila}`)
  const cellCrLbl = ws.getCell(`A${fila}`)
  cellCrLbl.value = resolverLabel('sec:croquis', etiquetas)
  cellCrLbl.fill = fillLabel
  cellCrLbl.font = fontLabelBold
  cellCrLbl.alignment = { horizontal: 'center', vertical: 'middle' }
  cellCrLbl.border = thinBorder

  ws.mergeCells(`D${fila}:F${fila}`)
  const cellObsLbl = ws.getCell(`D${fila}`)
  cellObsLbl.value = resolverLabel('sec:observaciones', etiquetas)
  cellObsLbl.fill = fillLabel
  cellObsLbl.font = fontLabelBold
  cellObsLbl.alignment = { horizontal: 'center', vertical: 'middle' }
  cellObsLbl.border = thinBorder
  fila++

  // Croquis / Observaciones: valores
  const crValRow = fila
  ws.mergeCells(`A${crValRow}:C${crValRow}`)
  const cellCrVal = ws.getCell(`A${crValRow}`)
  cellCrVal.value = imagenes.croquis ? '[Ver croquis adjunto]' : ''
  cellCrVal.font = fontValor
  cellCrVal.alignment = { vertical: 'top', wrapText: true }
  cellCrVal.border = thinBorder

  ws.mergeCells(`D${crValRow}:F${crValRow}`)
  const cellObsVal = ws.getCell(`D${crValRow}`)
  cellObsVal.value = d['8-F'] || ''
  cellObsVal.font = fontValor
  cellObsVal.alignment = { vertical: 'top', wrapText: true }
  cellObsVal.border = thinBorder
  ws.getRow(crValRow).height = 156
  fila++

  // === Imágenes en Excel ===
  // Usamos el formato { tl: {col, row}, br: {col, row} } que es el más
  // compatible con TODAS las versiones de Excel.
  // Para que la imagen NO se deforme, calculamos el br de forma que
  // el rango de celdas tenga el mismo aspect ratio que la imagen.

  /** Extrae el base64 puro del dataURL */
  const extraerBase64 = (dataUrl: string): string => {
    const idx = dataUrl.indexOf('base64,')
    return idx >= 0 ? dataUrl.substring(idx + 7) : dataUrl
  }

  /** Convierte una URL remota o dataURL a dataURL. */
  async function normalizarSrcADataUrl(src: string): Promise<string> {
    if (src.startsWith('data:')) return src
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const response = await fetch(src)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(String(reader.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }
    return src
  }

  // Constantes de conversión aproximada para ExcelJS
  const PX_POR_CARACTER = 7
  const PX_POR_PUNTO_FILA = 4 / 3

  /** Suma el ancho en píxeles de un rango de columnas (base 0). */
  const anchoSegmentoPx = (col: number, colSpan: number): number => {
    let total = 0
    for (let c = col; c < col + colSpan; c++) {
      total += (ws.getColumn(c + 1).width || 0) * PX_POR_CARACTER
    }
    return total
  }

  /**
   * Añade una imagen con aspect ratio conservado.
   * Usa { tl, ext } para que Excel NO estire la imagen: tl ancla la posición
   * y ext define el tamaño exacto en píxeles.
   */
  const addImageContain = async (
    src: string,
    col: number, row: number,
    colSpan: number, rowSpan: number,
    coverRatio?: number,
  ) => {
    try {
      let dataUrl = await normalizarSrcADataUrl(src)
      if (coverRatio) {
        dataUrl = await recortarImagenCover(dataUrl, coverRatio)
      }
      const base64 = extraerBase64(dataUrl)
      const ext = dataUrl.startsWith('data:image/png') ? 'png' : 'jpeg'
      const dim = await obtenerDimensionesImagen(dataUrl)

      const segWpx = anchoSegmentoPx(col, colSpan)
      const rowHeightPx = (ws.getRow(row + 1).height || 15) * PX_POR_PUNTO_FILA
      const segHpx = rowHeightPx * rowSpan
      const fit = calcularAjusteContain(dim.w, dim.h, segWpx, segHpx)
      // Escalado AJUSTABLE: la imagen se agranda y se re-centra, sin deformarla
      // (w y h escalan igual → se conserva la relación de aspecto).
      const ESCALA_IMAGEN = 1.2
      const imgW = fit.w * ESCALA_IMAGEN
      const imgH = fit.h * ESCALA_IMAGEN

      // Re-centrado dentro del recuadro para el nuevo tamaño
      const colWidthPx = (ws.getColumn(col + 1).width || 30) * PX_POR_CARACTER
      const offsetCol = (segWpx - imgW) / 2 / colWidthPx
      const offsetRow = (segHpx - imgH) / 2 / rowHeightPx

      const id = workbook.addImage({ base64, extension: ext })
      ws.addImage(id, {
        tl: { col: col + offsetCol, row: row + offsetRow },
        ext: { width: Math.round(imgW), height: Math.round(imgH) },
        editAs: 'oneCell',
      } as never)
    } catch (e) {
      console.error('Error al insertar imagen en Excel:', e)
    }
  }

  // --- Logos en la cabecera (fila 1) ---
  // Logo izquierdo en A1 (1 col), logo derecho en F1 (1 col).
  // El título ocupa B1:E1 (4 cols).
  if (imagenes['logo-izq']) {
    const logo = await procesarLogo(imagenes['logo-izq'], quitarFondo)
    await addImageContain(logo, 0, 0, 1, 0.9)
  }
  if (imagenes['logo-der']) {
    const logo = await procesarLogo(imagenes['logo-der'], quitarFondo)
    await addImageContain(logo, 5, 0, 1, 0.9)
  }

  // --- Croquis (fila valores croquis, columnas A-C) ---
  if (imagenes.croquis) {
    await addImageContain(imagenes.croquis, 0, crValRow - 1, 3, 1)
  }

  // --- Evidencias fotográficas ---
  if (numEvidencias > 0) {
    const { cols: evCols, rows: evRows } = calcularDistribucionEvidencias(numEvidencias)
    const evStartRow = fila
    const colsPorImagen = 6 / evCols
    const itemsUltimaFila = numEvidencias - (evRows - 1) * evCols
    const offsetUltimaFila = itemsUltimaFila < evCols ? Math.floor((evCols - itemsUltimaFila) / 2) : 0

    // Etiqueta de evidencia
    ws.mergeCells(evStartRow, 1, evStartRow, 6)
    const cellEvLbl = ws.getCell(evStartRow, 1)
    cellEvLbl.value = resolverLabel('sec:evidencias', etiquetas)
    cellEvLbl.fill = fillLabel
    cellEvLbl.font = fontLabelBold
    cellEvLbl.alignment = { horizontal: 'center', vertical: 'middle' }
    cellEvLbl.border = thinBorder
    ws.getRow(evStartRow).height = 18

    for (let evFila = 0; evFila < evRows; evFila++) {
      const rowNumber = evStartRow + 1 + evFila
      ws.getRow(rowNumber).height = 90
      const isUltimaFila = evFila === evRows - 1
      const offset = isUltimaFila ? offsetUltimaFila : 0
      for (let col = 0; col < evCols; col++) {
        const idx = evFila * evCols + col
        if (idx >= numEvidencias) break
        const imgKey = `evid-${idx}`
        // Preferir imágenes del módulo de reconocimiento cuando se exporta a Excel.
        const imgSrc = imagenesReconocimiento[idx] || imagenes[imgKey]
        const startCol = Math.round(offset * colsPorImagen + col * colsPorImagen)
        const endCol = Math.round(startCol + colsPorImagen)

        // Combinar celdas para que la imagen ocupe todo el segmento, como la fila 12 del croquis.
        ws.mergeCells(rowNumber, startCol + 1, rowNumber, endCol)
        const cellEv = ws.getCell(rowNumber, startCol + 1)
        cellEv.value = imgSrc ? '' : `[Foto ${idx + 1}]`
        cellEv.alignment = { horizontal: 'center', vertical: 'middle' }
        cellEv.border = thinBorder

        if (imgSrc) {
          // Sin coverRatio: la imagen se muestra COMPLETA sin recortar.
          // calcularAjusteContain dentro de addImageContain garantiza que
          // se vea entera sin deformarse, ajustándose al recuadro disponible.
          await addImageContain(imgSrc, startCol, rowNumber - 1, colsPorImagen, 1)
        }
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const nombreXlsx = `${nombreArchivo}.xlsx`
  if (escribirEn) {
    await escribirEn(nombreXlsx, blob)
  } else {
    descargarArchivo(blob, nombreXlsx)
  }
}

// =====================================================
// DIARIO DE OPERACIONES (resumibilidad tras recarga)
// =====================================================

const DIARIO_OPERACIONES_KEY = 'ferroviario_formato_diario'
const DIARIO_VIGENCIA_MS = 10 * 60 * 1000

interface EntradaDiario {
  tipo: 'aplicar-plantilla' | 'rellenar-todos'
  inicio: number
  fin: number | null
  completada: boolean
}

function leerDiario(): EntradaDiario | null {
  try {
    const raw = localStorage.getItem(DIARIO_OPERACIONES_KEY)
    if (!raw) return null
    return JSON.parse(raw) as EntradaDiario
  } catch { return null }
}

function escribirDiario(entrada: EntradaDiario | null): void {
  try {
    if (entrada) localStorage.setItem(DIARIO_OPERACIONES_KEY, JSON.stringify(entrada))
    else localStorage.removeItem(DIARIO_OPERACIONES_KEY)
  } catch { /* cuota llena: se ignora */ }
}

function registrarInicioOperacion(tipo: EntradaDiario['tipo']): void {
  escribirDiario({ tipo, inicio: Date.now(), fin: null, completada: false })
}

function registrarFinOperacion(): void {
  const actual = leerDiario()
  if (actual && !actual.completada) escribirDiario({ ...actual, fin: Date.now(), completada: true })
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function ModuloMateriales() {
  const punto = useAppSelector((s) => {
    const p = s.puntoActivo
    return p ? { id: p.id, numeroSerie: p.numeroSerie, nombre: p.nombre } : null
  }, shallow)
  // Las evidencias/croquis se alimentan del análisis (otro slice). Suscripción
  // estrecha: solo re-renderiza cuando cambia el análisis, no en cada edición.
  const analisis = useAppSelector((s) => s.puntoActivo?.moduloData?.analisis)
  const { actualizarPunto, dispatch } = useAppActions()
  const store = useAppStore()

  const [valores, setValores] = useState<Record<string, string>>({})
  const { opciones: opcionesCombo, registrar: registrarCombo, eliminarOpcion: eliminarOpcionCombo } = useOpcionesCampos()
  const [imagenes, setImagenes] = useState<Record<string, string>>({})
  const [coordActiva, setCoordActiva] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [mapaAbierto, setMapaAbierto] = useState(false)
  const [quitarFondoLogos, setQuitarFondoLogos] = useState(false)
  const [numEvidencias, setNumEvidencias] = useState(EVIDENCIAS_DEFECTO)
  const [cargado, setCargado] = useState(false)
  const [plantillasLogos, setPlantillasLogos] = useState<PlantillaLogos[]>([])
  const [dialogoPlantillasOpen, setDialogoPlantillasOpen] = useState(false)
  const [nombreNuevaPlantilla, setNombreNuevaPlantilla] = useState('')
  const [plantillaActivaId, setPlantillaActivaId] = useState<string | null>(null)
  // Flag para encadenar aplicar+rellenar global tras cargar plantilla, cuando el estado ya flushó.
  const [cadenaPlantillaPendiente, setCadenaPlantillaPendiente] = useState(false)
  const [etiquetas, setEtiquetas] = useState<Record<string, string>>({})
  const [origenCoords, setOrigenCoords] = useState<Record<string, string>>({})
  const [editarEtiquetasAbierto, setEditarEtiquetasAbierto] = useState(false)
  const [camposCustom, setCamposCustom] = useState<Array<{ coord: string; etiqueta: string; origen?: string; combo?: boolean; coordenadas?: boolean; lados?: string[] }>>([])
  const [coordsManuales, setCoordsManuales] = useState<string[]>([])
  const [aplicandoGlobal, setAplicandoGlobal] = useState(false)
  const guardarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const puntoIdAnteriorRef = useRef<string | null>(null)
  const autocompletarPrevRef = useRef<string | null>(null)

  // Cargar datos persistidos al montar o cambiar de punto. Lee estado live
  // (selector estrecho sin moduloData); depende solo del id del punto.
  useEffect(() => {
    const livePunto = store.getState().puntoActivo
    const data = livePunto?.moduloData?.materiales as FichaFormatoData | undefined

    // Cache local sincrónico: respaldo confiable de valores+config ante recargas.
    let cache: Partial<FichaFormatoData> = {}
    if (livePunto) {
      try {
        const raw = localStorage.getItem(materialesStorageKey(livePunto.id))
        if (raw) cache = JSON.parse(raw) as Partial<FichaFormatoData>
      } catch {
        // cache corrupto: se ignora
      }
    }

    const imagenesGuardadas = data?.imagenes || {}
    let imagenesIniciales = { ...imagenesGuardadas }

    // Fallback: el logo derecho (logo 2) se conserva en localStorage porque
    // la copia ligera de localStorage puede descartar data URLs grandes.
    if (livePunto && !imagenesIniciales['logo-der']) {
      try {
        const guardado = localStorage.getItem(logoDerStorageKey(livePunto.id))
        if (guardado) {
          imagenesIniciales['logo-der'] = guardado
        }
      } catch {
        // Ignorar errores de localStorage
      }
    }

    // Croquis de localización: se busca entre las fotos importadas del punto
    // (el batch lo deja como {nombrePunto}_{label}.png en la carpeta).
    if (!imagenesIniciales['croquis']) {
      const croquis = buscarCroquisEnFotos(livePunto)
      if (croquis) imagenesIniciales['croquis'] = croquis
    }

    // Fuente de verdad: el store (data). El cache local es respaldo solo si el
    // store aún no tiene materiales para este punto. Evita mostrar datos de otra
    // carpeta cuando el cache localStorage quedó stale tras aplicar plantilla.
    const valoresSrc = data?.valores ?? cache.valores ?? {}
    const camposSrc = data?.camposCustom ?? cache.camposCustom
    const etiquetasSrc = data?.etiquetas ?? cache.etiquetas
    const origenSrc = data?.origenCoords ?? cache.origenCoords
    const coordsManualesSrc = data?.coordsManuales ?? cache.coordsManuales ?? []

    setValores(valoresSrc)
    setImagenes(imagenesIniciales)
    setNumEvidencias(cache.numEvidencias ?? data?.numEvidencias ?? EVIDENCIAS_DEFECTO)
    setQuitarFondoLogos(cache.quitarFondoLogos ?? data?.quitarFondoLogos ?? false)
    setCamposCustom(camposSrc ? camposSrc.map(c => ({ ...c })) : [])
    setEtiquetas(etiquetasSrc ? { ...etiquetasSrc } : {})
    setOrigenCoords(origenSrc ? { ...origenSrc } : {})
    setPlantillaActivaId(cache.plantillaActivaId ?? data?.plantillaActivaId ?? null)
    setCoordsManuales(coordsManualesSrc)
    setCargado(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto?.id, store])

  // Al montar: resetear flags transitorios que pueden quedar trabados tras recarga
  // y avisar si una operación global quedó interrumpida.
  useEffect(() => {
    setAplicandoGlobal(false)
    setCadenaPlantillaPendiente(false)
    const diario = leerDiario()
    if (diario && !diario.completada && (Date.now() - diario.inicio) < DIARIO_VIGENCIA_MS) {
      const hace = Math.max(1, Math.round((Date.now() - diario.inicio) / 60000))
      const etiqueta = diario.tipo === 'aplicar-plantilla' ? 'aplicar plantilla a todos' : 'rellenar todos los puntos'
      toast(`Operación interrumpida: "${etiqueta}" hace ${hace} min. Usá "Re-aplicar última" en el menú Plantillas si necesitás completarla.`)
    } else if (diario) {
      escribirDiario(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!cargado || !punto) return
    // Al cambiar de punto la carga ya trae los valores del store del nuevo
    // punto; el autocompletar silencioso NO debe correr en el ciclo de cambio
    // (competiría con la carga y pisaría con state stale del punto anterior).
    if (autocompletarPrevRef.current !== null && autocompletarPrevRef.current !== punto.id) {
      autocompletarPrevRef.current = punto.id
      return
    }
    autocompletarPrevRef.current = punto.id
    autocompletarDesdeModulos({ silencioso: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargado, punto?.id])

  // Persistir el logo derecho (logo 2) en localStorage como respaldo ante recargas.
  useEffect(() => {
    if (!cargado || !punto) return
    const logoDer = imagenes['logo-der']
    const key = logoDerStorageKey(punto.id)
    try {
      if (logoDer) {
        localStorage.setItem(key, logoDer)
      } else {
        localStorage.removeItem(key)
      }
    } catch {
      // Ignorar errores de cuota de localStorage
    }
  }, [imagenes['logo-der'], punto?.id, cargado])

  // Cargar plantillas de logos guardadas.
  useEffect(() => {
    setPlantillasLogos(cargarPlantillasLogos())
  }, [])

  // Ref para poder acceder a la función de guardado más reciente desde el cleanup de desmontaje.
  const guardarRef = useRef<() => void>(() => {})

  // Guarda inmediatamente en el punto; se usa para autoguardado y flush al desmontar.
  // Lee moduloData live: el selector de render es estrecho, y dispersar un snapshot
  // stale clobberia los datos que otro modulo guardó concurrentemente.
  const guardarEnPunto = useCallback(() => {
    if (!punto) return
    actualizarPunto(punto.id, {
      moduloData: {
        ...(store.getState().puntoActivo?.moduloData),
        materiales: {
          valores,
          imagenes,
          numEvidencias,
          quitarFondoLogos,
          camposCustom,
          etiquetas,
          origenCoords,
          plantillaActivaId,
          coordsManuales,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    // Cache local sincrónico (valores + config, sin imágenes): sobrevive a recargas
    // aunque el effect global de persistencia no llegue a correr antes del unload.
    try {
      localStorage.setItem(materialesStorageKey(punto.id), JSON.stringify({
        valores, camposCustom, etiquetas, origenCoords, plantillaActivaId, numEvidencias, quitarFondoLogos, coordsManuales,
      }))
    } catch {
      // Cuota llena: se ignora; el guardado del punto (store) queda como respaldo.
    }
  }, [actualizarPunto, store, punto, valores, imagenes, numEvidencias, quitarFondoLogos, camposCustom, etiquetas, origenCoords, plantillaActivaId, coordsManuales])

  // Autoguardado: persistir cambios en el punto (con debounce corto).
  // Al cambiar de punto NO programamos guardado: el state local aún retiene los
  // valores del punto anterior y flush-earía al punto nuevo, pisando sus datos
  // propios (bug: todas las carpetas mostraban los datos de la última editada).
  // El useEffect de carga se encarga de setear los valores del punto nuevo.
  useEffect(() => {
    const puntoIdActual = punto?.id ?? null
    const cambioDePunto = puntoIdAnteriorRef.current !== null && puntoIdAnteriorRef.current !== puntoIdActual
    puntoIdAnteriorRef.current = puntoIdActual
    if (!cargado || !punto) return
    if (cambioDePunto) return
    if (guardarTimeoutRef.current) clearTimeout(guardarTimeoutRef.current)
    guardarTimeoutRef.current = setTimeout(() => {
      guardarEnPunto()
      guardarTimeoutRef.current = null
    }, 300)
    return () => {
      if (guardarTimeoutRef.current) {
        clearTimeout(guardarTimeoutRef.current)
        guardarTimeoutRef.current = null
        // Flush del guardado pendiente: este closure cierra sobre el punto que
        // se está dejando (punto.id y valores correctos). Sin esto, cambiar de
        // punto antes del debounce pierde la edición del punto de origen.
        guardarEnPunto()
      }
    }
  }, [valores, imagenes, numEvidencias, quitarFondoLogos, cargado, punto?.id, guardarEnPunto])

  // Mantiene actualizada la referencia de guardado sin disparar re-suscripciones.
  guardarRef.current = guardarEnPunto

  // Al desmontar el módulo, fuerza el guardado pendiente para no perder datos al cambiar de tab.
  useEffect(() => {
    return () => {
      if (guardarTimeoutRef.current) {
        clearTimeout(guardarTimeoutRef.current)
        guardarTimeoutRef.current = null
      }
      guardarRef.current()
    }
  }, [])

  // Flush del guardado al recargar/cerrar la página: el cleanup de unmount no se
  // ejecuta de forma confiable en beforeunload, así que forzamos el flush acá
  // para no perder los datos ingresados en los últimos 300ms (debounce del autoguardado).
  useEffect(() => {
    const flush = () => guardarRef.current()
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  // Importa automáticamente las primeras N imágenes disponibles del reconocimiento
  // en los slots de evidencia fotográfica cuando cambia el número de fotos.
  const importarEvidenciasDesdeReconocimiento = useCallback((n: number) => {
    if (!punto) return
    const disponibles = obtenerImagenesDeReconocimiento(analisis ? { moduloData: { analisis } } : null)
    if (disponibles.length === 0) return
    setImagenes(prev => {
      const copia = { ...prev }
      const total = Math.max(0, Math.min(n, MAX_EVIDENCIAS))
      for (let i = 0; i < total; i++) {
        const key = `evid-${i}`
        // Solo llenar slots vacíos para no sobrescribir imágenes cargadas manualmente.
        if (!copia[key] && disponibles[i]) {
          copia[key] = disponibles[i]
        }
      }
      return copia
    })
  }, [punto, analisis])

  useEffect(() => {
    if (!cargado || !punto) return
    importarEvidenciasDesdeReconocimiento(numEvidencias)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numEvidencias, cargado, punto?.id, importarEvidenciasDesdeReconocimiento])

  const camposLlenos = useMemo(
    () => Object.values(valores).filter(v => v && v.trim()).length,
    [valores],
  )

  const imagenesReconocimientoDisponibles = useMemo(
    () => obtenerImagenesDeReconocimiento(analisis ? { moduloData: { analisis } } : null),
    [analisis],
  )

  const actualizarValor = (coord: string, valor: string) => {
    setValores(prev => ({ ...prev, [coord]: valor }))
    setCoordsManuales(prev => prev.includes(coord) ? prev : [...prev, coord])
  }

  const handleGuardarCamposCustom = (nuevos: Array<{ coord: string; etiqueta: string; origen?: string; combo?: boolean; coordenadas?: boolean; lados?: string[] }>) => {
    const coordsNuevos = new Set(nuevos.map(c => c.coord))
    const removidos = camposCustom.filter(c => !coordsNuevos.has(c.coord)).map(c => c.coord)
    setCamposCustom(nuevos)
    if (removidos.length > 0) {
      setValores(prev => {
        const copia = { ...prev }
        for (const coord of removidos) delete copia[coord]
        return copia
      })
    }
  }

  const handleGuardarOrigenCoords = async (nuevoOverride: Record<string, string>) => {
    const coordsCambiadas = Object.keys(COORD_A_CAMPO).filter(coord => {
      const viejo = origenCoords[coord] ?? COORD_A_CAMPO[coord]
      const nuevo = nuevoOverride[coord] ?? COORD_A_CAMPO[coord]
      return viejo !== nuevo
    })
    setOrigenCoords(nuevoOverride)
    if (coordsCambiadas.length === 0) return
    const livePunto = store.getState().puntoActivo
    if (!livePunto) return
    try {
      const rango = calcularRangoCadenamiento(store.getState().puntos)
      setValores(prev => {
        const copia = { ...prev }
        for (const coord of coordsCambiadas) {
          const campo = nuevoOverride[coord] ?? COORD_A_CAMPO[coord]
          let val = ''
          if (campo === 'cadenamiento_inicio') {
            val = rango.inicio
          } else if (campo === 'cadenamiento_fin') {
            val = rango.fin
          } else {
            val = extraerValor(livePunto, campo)
          }
          copia[coord] = val
        }
        return copia
      })
    } catch { /* ignorar */ }
  }

  const autocompletarDesdeModulos = async (opciones?: { silencioso?: boolean; forzar?: boolean }) => {
    const livePunto = store.getState().puntoActivo
    if (!livePunto) return
    const forzar = opciones?.forzar ?? false
    const liveMat = livePunto?.moduloData?.materiales as FichaFormatoData | undefined
    // forzar=false (silencioso, dispara al cambiar de punto): base desde el STORE
    // del punto activo, no desde el state local (que aún retiene valores del
    // punto anterior y pisaría la carga). forzar=true (botón "Rellenar este
    // punto"): base desde el state local (incluye ediciones en curso).
    const baseValores = forzar ? valores : (liveMat?.valores ?? {})
    const baseOrigen = forzar ? origenCoords : (liveMat?.origenCoords ?? {})
    const baseCampos = forzar ? camposCustom : (liveMat?.camposCustom ?? [])
    const baseImagenes = forzar ? imagenes : (liveMat?.imagenes ?? {})
    try {
      const rango = calcularRangoCadenamiento(store.getState().puntos)
      const resolver = (campo: string): string => {
        if (campo === 'cadenamiento_inicio') return rango.inicio
        if (campo === 'cadenamiento_fin') return rango.fin
        return extraerValor(livePunto, campo)
      }
      const nuevosValores = { ...baseValores }
      // forzar=true (botón "Rellenar") sobrescribe los campos con origen asignado;
      // forzar=false (autocompletar silencioso) solo llena huecos vacíos.
      for (const coord of Object.keys(COORD_A_CAMPO)) {
        const campo = baseOrigen[coord] ?? COORD_A_CAMPO[coord]
        if (campo === '__ninguno__') continue
        if (!forzar && nuevosValores[coord]) continue
        const val = resolver(campo)
        // forzar limpia valores stale (ej: coordenadas del punto anterior);
        // sin forzar solo llena huecos vacíos.
        if (forzar) nuevosValores[coord] = val
        else if (val) nuevosValores[coord] = val
      }
      // Campos personalizados con origen asignado: misma regla (usa resolver
      // para que cadenamiento_inicio/fin tomen el rango calculado de los puntos).
      for (const campo of baseCampos) {
        if (!campo.origen || campo.origen === '__ninguno__') continue
        if (!forzar && nuevosValores[campo.coord]) continue
        const val = resolver(campo.origen)
        if (forzar) nuevosValores[campo.coord] = val
        else if (val) nuevosValores[campo.coord] = val
      }
      const nuevasImagenes = { ...baseImagenes }
      for (const [key, campo] of Object.entries(IMAGEN_COORD)) {
        if (!forzar && nuevasImagenes[key]) continue
        const val = extraerImagen(livePunto, campo)
        if (val) nuevasImagenes[key] = val
      }
      setValores(nuevosValores)
      setImagenes(nuevasImagenes)
      if (!opciones?.silencioso) {
        toast.success(forzar ? 'Datos rellenados desde los módulos' : 'Datos autocompletados desde otros módulos')
      }
    } catch (e) {
      if (!opciones?.silencioso) toast.error('No se pudo rellenar: ' + String(e))
    }
  }

  const rellenarGlobal = async () => {
    if (!punto) return
    setAplicandoGlobal(true)
    registrarInicioOperacion('rellenar-todos')
    try {
      guardarRef.current()
      await new Promise(r => setTimeout(r, 0))
      const rango = calcularRangoCadenamiento(store.getState().puntos)
      let count = 0
      let activeValores: Record<string, string> | null = null
      let activeImagenes: Record<string, string> | null = null
      for (const p of store.getState().puntos) {
        const mat = p.moduloData?.materiales as FichaFormatoData | undefined
        const valores = { ...(mat?.valores) }
        const imagenes = { ...(mat?.imagenes) }
        const manuales = mat?.coordsManuales ?? []
        const pOrigen = mat?.origenCoords ?? {}
        const pCampos = mat?.camposCustom ?? []
        const resolver = (campo: string): string => {
          if (campo === 'cadenamiento_inicio') return rango.inicio
          if (campo === 'cadenamiento_fin') return rango.fin
          return extraerValor(p, campo)
        }
        for (const coord of Object.keys(COORD_A_CAMPO)) {
          if (manuales.includes(coord)) continue
          const campo = pOrigen[coord] ?? COORD_A_CAMPO[coord]
          if (campo === '__ninguno__') continue
          // siempre asignar: limpia valores stale de otra carpeta.
          valores[coord] = resolver(campo)
        }
        for (const campo of pCampos) {
          if (!campo.origen || campo.origen === '__ninguno__') continue
          if (manuales.includes(campo.coord)) continue
          valores[campo.coord] = resolver(campo.origen)
        }
        for (const [key, imgCampo] of Object.entries(IMAGEN_COORD)) {
          const val = extraerImagen(p, imgCampo)
          if (val) imagenes[key] = val
        }
        actualizarPunto(p.id, {
          moduloData: {
            ...p.moduloData,
            materiales: { ...mat, valores, imagenes, updatedAt: new Date().toISOString() },
          },
        })
        count++
        if (p.id === punto.id) {
          activeValores = valores
          activeImagenes = imagenes
        }
      }
      if (activeValores) setValores(activeValores)
      if (activeImagenes) setImagenes(activeImagenes)
      registrarFinOperacion()
      toast.success(`Rellenados ${count} puntos`)
    } catch (e) {
      toast.error('No se pudo rellenar todos los puntos: ' + String(e))
    } finally {
      setAplicandoGlobal(false)
    }
  }

  const aplicarPlantillaGlobal = async () => {
    if (!punto) return
    setAplicandoGlobal(true)
    registrarInicioOperacion('aplicar-plantilla')
    try {
      guardarRef.current()
      await new Promise(r => setTimeout(r, 0))
      // Valores del punto origen: los NO vinculados viajan a todos (defaults F/B/D);
      // los vinculados se re-extraen por punto en rellenarGlobal.
      const sourceValores = { ...valores }
      // Logos del punto origen: viajan a todos los destinos (conservando evidencias/croquis propios).
      const sourceLogos: Record<string, string> = {}
      if (imagenes['logo-izq']) sourceLogos['logo-izq'] = imagenes['logo-izq']
      if (imagenes['logo-der']) sourceLogos['logo-der'] = imagenes['logo-der']
      // Coords vinculadas a módulos: sus valores NO se propagan (se re-extraen por punto).
      const vinculados = new Set<string>()
      for (const [coord, origen] of Object.entries(origenCoords)) {
        if (origen && origen !== '__ninguno__') vinculados.add(coord)
      }
      for (const c of camposCustom) {
        if (c.origen && c.origen !== '__ninguno__') vinculados.add(c.coord)
      }
      const esVinculado = (coord: string): boolean => {
        if (vinculados.has(coord)) return true
        const base = coord.split('-')[0]
        return base !== coord && vinculados.has(base)
      }
      let count = 0
      for (const p of store.getState().puntos) {
        const mat = p.moduloData?.materiales as FichaFormatoData | undefined
        const targetValores = mat?.valores ?? {}
        const targetManuales = mat?.coordsManuales ?? []
        // merged: NO vinculados = de la plantilla (defaults F/B/D);
        // vinculados = del destino (preserva lo extraído de su carpeta, rellenar lo refresca).
        const merged: Record<string, string> = {}
        for (const [coord, val] of Object.entries(sourceValores)) {
          if (esVinculado(coord)) continue
          merged[coord] = val
        }
        for (const [coord, val] of Object.entries(targetValores)) {
          if (esVinculado(coord)) merged[coord] = val
        }
        const targetImagenes = { ...(mat?.imagenes ?? {}) }
        for (const [k, v] of Object.entries(sourceLogos)) targetImagenes[k] = v
        actualizarPunto(p.id, {
          moduloData: {
            ...p.moduloData,
            materiales: {
              ...mat,
              camposCustom,
              etiquetas,
              origenCoords,
              plantillaActivaId,
              quitarFondoLogos,
              numEvidencias,
              valores: merged,
              coordsManuales: targetManuales,
              imagenes: targetImagenes,
              updatedAt: new Date().toISOString(),
            },
          },
        })
        // El cache localStorage del destino queda stale (la carga usa `cache ?? data`,
        // y `??` no descarta []) y ocultaría campos custom/etiquetas nuevos: invalidarlo.
        try { localStorage.removeItem(materialesStorageKey(p.id)) } catch { /* cuota/modo privado */ }
        // El logo derecho tiene respaldo en localStorage por punto (copia ligera del store).
        if (sourceLogos['logo-der']) {
          try { localStorage.setItem(logoDerStorageKey(p.id), sourceLogos['logo-der']) } catch { /* cuota */ }
        }
        count++
      }
      registrarFinOperacion()
      toast.success(`Plantilla aplicada a ${count} puntos`)
    } catch (e) {
      toast.error('No se pudo aplicar la plantilla: ' + String(e))
    } finally {
      setAplicandoGlobal(false)
    }
  }

  // Encadena aplicar+rellenar global después de cargar una plantilla guardada,
  // cuando el estado del componente ya reflejó los setters de cargarPlantillaPorId.
  useEffect(() => {
    if (!cadenaPlantillaPendiente) return
    setCadenaPlantillaPendiente(false)
    void (async () => {
      await aplicarPlantillaGlobal()
      await rellenarGlobal()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadenaPlantillaPendiente])

  const limpiarFicha = () => {
    setValores({})
    setImagenes({})
    if (punto) {
      try {
        localStorage.removeItem(logoDerStorageKey(punto.id))
      } catch {
        // Ignorar errores de localStorage
      }
    }
    toast.info('Formulario limpiado')
  }

  const guardarPlantillaLogos = () => {
    const nombre = nombreNuevaPlantilla.trim()
    if (!nombre) {
      toast.error('Escribe un nombre para la plantilla')
      return
    }
    const nuevaPlantilla: PlantillaLogos = {
      id: crypto.randomUUID(),
      nombre,
      logoIzq: imagenes['logo-izq'] || undefined,
      logoDer: imagenes['logo-der'] || undefined,
      etiquetas: { ...etiquetas },
      camposCustom: camposCustom.map(c => ({ ...c })),
      origenCoords: { ...origenCoords },
      createdAt: new Date().toISOString(),
    }
    const nuevasPlantillas = [...plantillasLogos, nuevaPlantilla]
    setPlantillasLogos(nuevasPlantillas)
    guardarPlantillasLogos(nuevasPlantillas)
    setPlantillaActivaId(nuevaPlantilla.id)
    setNombreNuevaPlantilla('')
    toast.success(`Plantilla "${nombre}" guardada`)
  }

  const cargarPlantillaPorId = (id: string) => {
    const plantilla = plantillasLogos.find(p => p.id === id)
    if (!plantilla) return
    if (!window.confirm(`Cargar la plantilla "${plantilla.nombre}", aplicarla a TODOS los puntos y rellenar cada uno desde los módulos. ¿Continuar?`)) return
    setImagenes(prev => ({
      ...prev,
      ...(plantilla.logoIzq && { 'logo-izq': plantilla.logoIzq }),
      ...(plantilla.logoDer && { 'logo-der': plantilla.logoDer }),
    }))
    setEtiquetas(plantilla.etiquetas ? { ...plantilla.etiquetas } : {})
    setCamposCustom(plantilla.camposCustom ? plantilla.camposCustom.map(c => ({ ...c })) : [])
    setOrigenCoords(plantilla.origenCoords ? { ...plantilla.origenCoords } : {})
    setPlantillaActivaId(id)
    toast.success(`Plantilla "${plantilla.nombre}" cargada`)
    setDialogoPlantillasOpen(false)
    // Dispara aplicar+rellenar global tras el re-render (useEffect sobre el flag).
    setCadenaPlantillaPendiente(true)
  }

  const eliminarPlantillaLogos = (id: string) => {
    const filtradas = plantillasLogos.filter(p => p.id !== id)
    setPlantillasLogos(filtradas)
    guardarPlantillasLogos(filtradas)
    if (id === plantillaActivaId) setPlantillaActivaId(null)
    toast.info('Plantilla eliminada')
  }

  const actualizarPlantillaActiva = () => {
    if (!plantillaActivaId) return
    const encontrada = plantillasLogos.find(p => p.id === plantillaActivaId)
    if (!encontrada) {
      setDialogoPlantillasOpen(true)
      return
    }
    const nuevas = plantillasLogos.map(p => p.id === plantillaActivaId ? {
      id: p.id,
      nombre: p.nombre,
      logoIzq: imagenes['logo-izq'] || undefined,
      logoDer: imagenes['logo-der'] || undefined,
      etiquetas: { ...etiquetas },
      camposCustom: camposCustom.map(c => ({ ...c })),
      origenCoords: { ...origenCoords },
      createdAt: p.createdAt,
    } : p)
    setPlantillasLogos(nuevas)
    guardarPlantillasLogos(nuevas)
    toast.success(`Plantilla "${encontrada.nombre}" actualizada`)
  }

  const handleGuardarPrincipal = () => {
    if (plantillaActivaId) actualizarPlantillaActiva()
    else setDialogoPlantillasOpen(true)
  }

  const handleExportarTodo = async () => {
    setExportando(true)
    const nombreCarpeta = (punto?.nombre || 'punto').replace(/^\s*\d+[\s._:,)-]+/, '').trim()
    const nombre = `${punto?.numeroSerie ?? ''}. ${nombreCarpeta}`.replace(/[\\/:*?"<>|]/g, '').trim()
    try {
      await exportarPdfFicha(valores, imagenes, nombre, {
        quitarFondoLogos,
        numEvidencias,
      }, etiquetas, camposCustom)
      await exportarExcelFicha(valores, imagenes, nombre, {
        quitarFondoLogos,
        numEvidencias,
        imagenesReconocimiento: imagenesReconocimientoDisponibles,
      }, etiquetas, camposCustom)
      dispatch({ type: 'SET_HA_EXPORTADO_PLANTILLA', payload: true })
      toast.success('PDF y Excel exportados')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error exportando:', err)
      toast.error('Error al exportar: ' + String(err))
    } finally {
      setExportando(false)
    }
  }

  const cargarImagen = async (key: string, file?: File) => {
    if (!file) return
    const preview = await leerImagen(file)
    setImagenes(prev => ({ ...prev, [key]: preview }))
  }

  const limpiarImagen = (key: string) => {
    setImagenes(prev => {
      const copia = { ...prev }
      delete copia[key]
      return copia
    })
  }

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileSpreadsheet className="mb-3 h-12 w-12 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Selecciona un punto para editar el formato</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-4 pr-2">
        {/* Encabezado */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <span className="text-sm font-bold text-primary-foreground">{punto.numeroSerie}</span>
              </div>
              <p className="font-medium">{punto.nombre}</p>
            </div>
            <div className="flex items-center gap-2">
              {coordActiva && (
                <Badge className="bg-emerald-500/20 text-emerald-600 font-mono">
                  <MapPin className="mr-1 h-3 w-3" />
                  {coordActiva}
                </Badge>
              )}
              <Badge variant="secondary">{camposLlenos} campos</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Barra de acciones */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <CardTitle>Formato LMT-T11-02</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MenuAcciones label="Más acciones">
                  {close => (
                    <>
                      <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { limpiarFicha(); close() }}>
                        <Eraser className="mr-2 h-4 w-4" />
                        Limpiar
                      </Button>
                      <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                        <input
                          type="checkbox"
                          checked={quitarFondoLogos}
                          onChange={e => setQuitarFondoLogos(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <Eraser className="h-4 w-4" />
                        <span>Quitar fondo</span>
                      </label>
                      <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { setEditarEtiquetasAbierto(true); close() }}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      <Button size="sm" className="w-full justify-start" onClick={() => { handleExportarTodo(); close() }} disabled={exportando}>
                        <FileText className="mr-2 h-4 w-4" />
                        {exportando ? 'Exportando...' : 'PDF + Excel'}
                      </Button>
                    </>
                  )}
                </MenuAcciones>
                <MenuAcciones label="Rellenar" icon={<RefreshCw className="mr-2 h-4 w-4" />}>
                  {close => (
                    <>
                      <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { autocompletarDesdeModulos({ forzar: true }); close() }}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Rellenar este punto
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full justify-start"
                        disabled={aplicandoGlobal}
                        onClick={() => {
                          if (window.confirm('¿Rellenar TODOS los puntos desde los módulos? Se conservan los campos escritos manualmente.')) rellenarGlobal()
                          close()
                        }}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {aplicandoGlobal ? 'Aplicando...' : 'Rellenar todos'}
                      </Button>
                    </>
                  )}
                </MenuAcciones>
                <MenuAcciones label="Plantillas" icon={<LayoutTemplate className="mr-2 h-4 w-4" />}>
                  {close => (
                    <>
                      <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { setNombreNuevaPlantilla(''); setDialogoPlantillasOpen(true); close() }}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nueva plantilla
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { setDialogoPlantillasOpen(true); close() }}>
                        <LayoutTemplate className="mr-2 h-4 w-4" />
                        Plantillas guardadas
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full justify-start"
                        disabled={aplicandoGlobal}
                        onClick={() => {
                          if (window.confirm('¿Aplicar la plantilla actual a TODOS los puntos? Se conservan los campos escritos manualmente y las fotos de cada punto.')) aplicarPlantillaGlobal()
                          close()
                        }}
                      >
                        <LayoutTemplate className="mr-2 h-4 w-4" />
                        {aplicandoGlobal ? 'Aplicando...' : 'Plantilla a todos'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                          const diario = leerDiario()
                          if (!diario) { toast.info('No hay operación reciente para re-aplicar'); return }
                          if (diario.tipo === 'aplicar-plantilla') aplicarPlantillaGlobal()
                          else if (diario.tipo === 'rellenar-todos') rellenarGlobal()
                          close()
                        }}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Re-aplicar última
                      </Button>
                    </>
                  )}
                </MenuAcciones>
                <Button size="sm" onClick={handleGuardarPrincipal} title="Guardar plantilla en curso">
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
                <Dialog open={dialogoPlantillasOpen} onOpenChange={setDialogoPlantillasOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Plantillas de logos</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="nombre-plantilla">Nombre de la plantilla</Label>
                        <div className="flex gap-2">
                          <Input
                            id="nombre-plantilla"
                            value={nombreNuevaPlantilla}
                            onChange={e => setNombreNuevaPlantilla(e.target.value)}
                            placeholder="Ej. Cliente A"
                            className="flex-1"
                          />
                          <Button
                            onClick={guardarPlantillaLogos}
                            disabled={!nombreNuevaPlantilla.trim()}
                          >
                            Guardar
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Guarda logos, etiquetas editadas y campos personalizados.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Plantillas guardadas</Label>
                        {plantillasLogos.length === 0 ? (
                          <p className="py-4 text-center text-sm text-muted-foreground">
                            Sin plantillas guardadas. Crea una arriba.
                          </p>
                        ) : (
                          <div className="max-h-60 space-y-1 overflow-auto">
                            {plantillasLogos.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => cargarPlantillaPorId(p.id)}
                                className="flex w-full items-center justify-between rounded border px-3 py-2 text-left transition-colors hover:bg-accent"
                              >
                                <span className="text-sm font-medium">{p.nombre}</span>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); eliminarPlantillaLogos(p.id) }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); eliminarPlantillaLogos(p.id) } }}
                                  className="cursor-pointer text-muted-foreground hover:text-destructive"
                                  aria-label={`Eliminar plantilla ${p.nombre}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Título + clave con logos — disposición simétrica 25/50/25 */}
            <div className="rounded-lg border">
              <div className="bg-neutral-900 p-3">
                <div className="flex items-center gap-2">
                  <div className="w-1/4 shrink-0">
                    <LogoSlot
                      label="Logo izquierdo"
                      image={imagenes['logo-izq'] || ''}
                      onFile={file => cargarImagen('logo-izq', file)}
                      onClear={() => limpiarImagen('logo-izq')}
                    />
                  </div>
                  <Input
                    value={resolverLabel('sec:titulo', etiquetas)}
                    onChange={e => setEtiquetas(prev => ({ ...prev, 'sec:titulo': e.target.value }))}
                    className="min-w-0 flex-1 border-0 bg-transparent px-0 text-center font-semibold text-white"
                  />
                  <div className="w-1/4 shrink-0">
                    <LogoSlot
                      label="Logo derecho"
                      image={imagenes['logo-der'] || ''}
                      onFile={file => cargarImagen('logo-der', file)}
                      onClear={() => limpiarImagen('logo-der')}
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-2 p-3 md:grid-cols-[1fr_220px]">
                <Input
                  value={resolverLabel('sec:proyecto', etiquetas)}
                  onChange={e => setEtiquetas(prev => ({ ...prev, 'sec:proyecto': e.target.value }))}
                  className="border-0 px-0 py-0 text-sm"
                />
                <CoordInput
                  coord="0-F"
                  value={valores['0-F'] || ''}
                  onChange={v => actualizarValor('0-F', v)}
                  onFocus={setCoordActiva}
                  placeholder="Clave"
                />
              </div>
            </div>

            {/* Filas de datos con coordenadas */}
            <div className="space-y-2">
              {FILAS_DATOS.map((fila, filaIndex) => (
                <div key={filaIndex} className="grid gap-2 md:grid-cols-3">
                  {fila.map(({ coord }) => {
                    const etiquetaCombo = COORDS_CON_OPCIONES[coord]
                    const etiquetaResuelta = resolverLabel(coord, etiquetas)
                    return (
                      <div key={coord} className="space-y-1">
                        <label className="block text-xs font-medium text-muted-foreground">
                          {etiquetaResuelta}
                        </label>
                        {etiquetaCombo ? (
                          <CampoCombo
                            value={valores[coord] || ''}
                            onChange={v => actualizarValor(coord, v)}
                            onCommit={v => registrarCombo(etiquetaCombo, v)}
                            opciones={opcionesCombo[etiquetaCombo] || []}
                            onFocus={() => setCoordActiva(coord)}
                            placeholder={etiquetaResuelta}
                            className="px-2 py-1"
                            onEliminarOpcion={v => eliminarOpcionCombo(etiquetaCombo, v)}
                          />
                        ) : (
                          <CoordInput
                            coord={coord}
                            value={valores[coord] || ''}
                            onChange={v => actualizarValor(coord, v)}
                            onFocus={setCoordActiva}
                            placeholder={etiquetaResuelta}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
              {camposCustom.length > 0 && (() => {
                const grupos: Array<typeof camposCustom> = []
                for (let i = 0; i < camposCustom.length; i += 3) {
                  grupos.push(camposCustom.slice(i, i + 3))
                }
                return grupos.map((grupo, gi) => (
                  <div
                    key={gi}
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${grupo.length}, minmax(0, 1fr))` }}
                  >
                    {grupo.map(campo => {
                      return (
                      <div key={campo.coord} className="space-y-1">
                        <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                          <span className="flex items-center gap-1">
                            {campo.etiqueta}
                            {campo.origen && !campo.combo && !campo.coordenadas && (
                              <span title={`Trae valor desde: ${ELEMENTOS_DISPONIBLES.find(e => e.value === campo.origen)?.label || campo.origen}`}>
                                <Link2 className="h-3 w-3 text-blue-500" />
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-[10px] text-emerald-600">{campo.coord}</span>
                        </label>
                        {campo.coordenadas ? (
                          <CoordenadasDuales
                            value={valores[campo.coord] || ''}
                            lados={campo.lados || []}
                            onChange={v => actualizarValor(campo.coord, v)}
                            onFocus={() => setCoordActiva(campo.coord)}
                            onCommit={guardarEnPunto}
                            placeholder={campo.etiqueta}
                          />
                        ) : campo.combo ? (
                          <CampoCombo
                            value={valores[campo.coord] || ''}
                            onChange={v => actualizarValor(campo.coord, v)}
                            onCommit={v => { registrarCombo(campo.etiqueta, v); guardarEnPunto() }}
                            opciones={opcionesCombo[campo.etiqueta] || []}
                            onFocus={() => setCoordActiva(campo.coord)}
                            placeholder={campo.etiqueta}
                            className="px-2 py-1"
                            onEliminarOpcion={v => eliminarOpcionCombo(campo.etiqueta, v)}
                          />
                        ) : (
                          <Input
                            value={valores[campo.coord] || ''}
                            onChange={e => actualizarValor(campo.coord, e.target.value)}
                            onFocus={() => setCoordActiva(campo.coord)}
                            onKeyDown={e => { if (e.key === 'Enter') guardarEnPunto() }}
                            placeholder={campo.etiqueta}
                            className="px-2 py-1"
                          />
                        )}
                      </div>
                      )
                    })}
                  </div>
                ))
              })()}
            </div>

            {/* Estado actual */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Estado actual - Lado izquierdo
                </label>
                <Textarea
                  value={valores['7-D'] || ''}
                  onChange={e => actualizarValor('7-D', e.target.value)}
                  onFocus={() => setCoordActiva('7-D')}
                  rows={6}
                  className="px-2 py-1"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Estado actual - Lado derecho
                </label>
                <Textarea
                  value={valores['7-F'] || ''}
                  onChange={e => actualizarValor('7-F', e.target.value)}
                  onFocus={() => setCoordActiva('7-F')}
                  rows={6}
                  className="px-2 py-1"
                />
              </div>
            </div>

            {/* Croquis + observaciones */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Croquis de localización
                  </label>
                  <span className="text-[10px] text-muted-foreground">Auto: {punto.nombre}_*.png</span>
                </div>
                <ImagePreview
                  image={imagenes.croquis || ''}
                  placeholder="Croquis de localización"
                  onFile={file => cargarImagen('croquis', file)}
                  onClear={() => limpiarImagen('croquis')}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Observaciones
                </label>
                <Textarea
                  value={valores['8-F'] || ''}
                  onChange={e => actualizarValor('8-F', e.target.value)}
                  onFocus={() => setCoordActiva('8-F')}
                  rows={9}
                  className="px-2 py-1"
                />
              </div>
            </div>

            {/* Evidencia fotográfica */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base">Evidencia fotográfica</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    {imagenesReconocimientoDisponibles.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {imagenesReconocimientoDisponibles.length} en reconocimiento
                      </Badge>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={imagenesReconocimientoDisponibles.length === 0}
                      onClick={() => importarEvidenciasDesdeReconocimiento(numEvidencias)}
                      title="Importa las imágenes disponibles del módulo de reconocimiento para este punto"
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Importar del reconocimiento
                    </Button>
                    <label htmlFor="num-evidencias" className="text-xs font-medium text-muted-foreground">
                      Nº de fotos:
                    </label>
                    <input
                      id="num-evidencias"
                      type="number"
                      min={0}
                      max={MAX_EVIDENCIAS}
                      value={numEvidencias}
                      onChange={e => {
                        const n = Number.parseInt(e.target.value, 10)
                        setNumEvidencias(Number.isNaN(n) ? 0 : Math.max(0, Math.min(n, MAX_EVIDENCIAS)))
                      }}
                      className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const evidencias = generarEvidencias(numEvidencias)
                  const { cols, rows } = calcularDistribucionEvidencias(numEvidencias)
                  const filas: Array<Array<{ key: string; label: string }>> = []
                  for (let r = 0; r < rows; r++) {
                    filas.push(evidencias.slice(r * cols, (r + 1) * cols))
                  }
                  const itemsUltimaFila = evidencias.length - (rows - 1) * cols
                  const offsetUltimaFila = itemsUltimaFila < cols ? Math.floor((cols - itemsUltimaFila) / 2) : 0
                  return (
                    <div className="space-y-3">
                      {filas.map((fila, r) => {
                        const isUltima = r === rows - 1
                        const offset = isUltima ? offsetUltimaFila : 0
                        return (
                          <div
                            key={r}
                            className="grid gap-3"
                            style={{ gridTemplateColumns: cols > 0 ? `repeat(${cols}, minmax(0, 1fr))` : undefined }}
                          >
                            {fila.map(({ key, label }, idx) => (
                              <div key={key} style={{ gridColumnStart: offset + idx + 1 }}>
                                <EvidenciaSlot
                                  label={label}
                                  coordBadge={`img-${key}`}
                                  image={imagenes[key] || ''}
                                  onUpload={file => cargarImagen(key, file)}
                                  onClear={() => limpiarImagen(key)}
                                />
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>

            {/* Mapa de coordenadas (referencia, colapsable) */}
            <Card>
              <CardHeader className="pb-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2"
                  onClick={() => setMapaAbierto(v => !v)}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-500" />
                    <CardTitle className="text-sm">Mapa de coordenadas</CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {mapaAbierto ? 'Ocultar' : 'Mostrar'}
                  </span>
                </button>
              </CardHeader>
              {mapaAbierto && (
                <CardContent>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Cada campo tiene una coordenada <strong>fila-columna</strong>. Al enfocar un campo aparece el badge con su coordenada arriba.
                  </p>
                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-emerald-500/10 text-emerald-600">
                          <th className="p-2 text-left font-semibold">Coord</th>
                          <th className="p-2 text-left font-semibold">Campo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(COORD_A_CAMPO).map(([coord, campo]) => (
                          <tr key={coord} className="border-t hover:bg-muted/40">
                            <td className="p-2"><code className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600">{coord}</code></td>
                            <td className="p-2 capitalize">{campo.replace(/_/g, ' ')}</td>
                          </tr>
                        ))}
                        <tr className="border-t hover:bg-muted/40">
                          <td className="p-2"><code className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600">img-croquis</code></td>
                          <td className="p-2">Croquis de localización</td>
                        </tr>
                        <tr className="border-t hover:bg-muted/40">
                          <td className="p-2"><code className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600">img-evid-0...N</code></td>
                          <td className="p-2">Evidencia fotográfica (configurable)</td>
                        </tr>
                        <tr className="border-t hover:bg-muted/40">
                          <td className="p-2"><code className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600">img-logo-izq/der</code></td>
                          <td className="p-2">Logos izquierdo / derecho</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          </CardContent>
        </Card>
      </div>
      <EditarEtiquetasMateriales
        open={editarEtiquetasAbierto}
        onOpenChange={setEditarEtiquetasAbierto}
        filas={FILAS_EDITABLES}
        overrideInicial={etiquetas}
        onSave={setEtiquetas}
        camposCustomInicial={camposCustom}
        onSaveCamposCustom={handleGuardarCamposCustom}
        origenCoordsInicial={origenCoords}
        onSaveOrigenCoords={handleGuardarOrigenCoords}
      />
    </ScrollArea>
  )
}

// =====================================================
// SUBCOMPONENTES
// =====================================================

function MenuAcciones({ label, icon, children }: {
  label: string
  icon?: ReactNode
  children: (close: () => void) => ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const handler = (evento: MouseEvent) => {
      if (ref.current && !ref.current.contains(evento.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [abierto])
  const close = () => setAbierto(false)
  return (
    <div ref={ref} className="relative inline-block">
      <Button variant="outline" size="sm" onClick={() => setAbierto(v => !v)}>
        {icon}
        {label}
        <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </Button>
      {abierto && (
        <div className="absolute right-0 top-full z-50 mt-1 flex w-56 flex-col gap-2 rounded-md border bg-popover p-2 shadow-md">
          {children(close)}
        </div>
      )}
    </div>
  )
}

function CoordInput({
  coord,
  value,
  onChange,
  onFocus,
  placeholder,
}: {
  coord: string
  value: string
  onChange: (value: string) => void
  onFocus: (coord: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => onFocus(coord)}
        onBlur={() => onFocus('')}
        placeholder={placeholder}
        className="px-2 py-1"
      />
    </div>
  )
}

function CoordenadasDuales({
  value,
  lados,
  onChange,
  onFocus,
  onCommit,
  placeholder,
}: {
  value: string
  lados: string[]
  onChange: (json: string) => void
  onFocus: () => void
  onCommit: () => void
  placeholder?: string
}) {
  const parsed = parseCoordenadas(value)
  const ladoFijo = lados.length === 1 ? lados[0] : null
  const ladoActual = ladoFijo ?? parsed?.lado ?? ''
  const pares = parsed?.pares ?? {}

  const escribir = (nuevo: CoordenadasValor) => {
    onChange(JSON.stringify(nuevo))
  }

  const cambiarLadoValor = (nuevoLado: string) => {
    const tokens = nuevoLado ? nuevoLado.split('-') : []
    const nuevosPares: Record<string, ParesCoord> = {}
    for (const tok of tokens) {
      nuevosPares[tok] = pares[tok] ? { ...pares[tok] } : { x: '', y: '' }
    }
    escribir({ lado: nuevoLado, pares: nuevosPares })
    onCommit()
  }

  const cambiarPar = (token: string, eje: 'x' | 'y', val: string) => {
    const actual = pares[token] ?? { x: '', y: '' }
    escribir({ lado: ladoActual, pares: { ...pares, [token]: { ...actual, [eje]: val } } })
  }

  useEffect(() => {
    if (!ladoFijo) return
    if (parsed?.lado) return
    const tokens = ladoFijo.split('-').map(t => t.trim()).filter(t => t !== '')
    const paresInit: Record<string, ParesCoord> = {}
    for (const tok of tokens) paresInit[tok] = { x: '', y: '' }
    onChange(JSON.stringify({ lado: ladoFijo, pares: paresInit }))
  }, [ladoFijo, parsed?.lado, onChange])

  if (lados.length === 0) {
    return <p className="px-1 py-1 text-xs text-muted-foreground">Sin lados configurados.</p>
  }

  const tokens = ladoActual ? ladoActual.split('-') : []

  return (
    <div className="space-y-1" onFocus={onFocus}>
      {!ladoFijo && (
        <Select value={ladoActual} onValueChange={cambiarLadoValor}>
          <SelectTrigger className="h-8 px-2 py-1">
            <SelectValue placeholder={placeholder ?? 'Lado'} />
          </SelectTrigger>
          <SelectContent>
            {lados.map(l => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {tokens.length === 0 ? (
        <p className="text-xs text-muted-foreground">Elegí un lado.</p>
      ) : (
        <div className="space-y-1">
          {tokens.map(tok => {
            const p = pares[tok] ?? { x: '', y: '' }
            return (
              <div key={tok} className="flex items-center gap-1">
                <span className="w-20 shrink-0 truncate text-[10px] text-muted-foreground" title={tok}>{tok}</span>
                <Input
                  value={p.x ?? ''}
                  onChange={e => cambiarPar(tok, 'x', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') onCommit() }}
                  placeholder="X"
                  className="h-7 px-1 py-0"
                />
                <Input
                  value={p.y ?? ''}
                  onChange={e => cambiarPar(tok, 'y', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') onCommit() }}
                  placeholder="Y"
                  className="h-7 px-1 py-0"
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ImagePreview({
  image,
  placeholder,
  onFile,
  onClear,
}: {
  image: string
  placeholder: string
  onFile: (file?: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActivo, setDragActivo] = useState(false)

  return (
    <div
      className={`relative flex h-[200px] items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors ${
        dragActivo ? 'border-primary bg-primary/10 text-primary' : 'bg-muted/20 text-muted-foreground'
      }`}
      onDragOver={e => {
        e.preventDefault()
        setDragActivo(true)
      }}
      onDragLeave={() => setDragActivo(false)}
      onDrop={e => {
        e.preventDefault()
        setDragActivo(false)
        const file = Array.from(e.dataTransfer.files).find(item => item.type.startsWith('image/'))
        if (file) onFile(file)
      }}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      {image ? (
        <>
          <img src={image} alt={placeholder} className="h-full w-full object-contain" />
          <Button variant="destructive" size="icon" className="absolute right-2 top-2 h-8 w-8" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <button type="button" className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs" onClick={() => inputRef.current?.click()}>
          <ImagePlus className="h-6 w-6 opacity-50" />
          <span>{placeholder}</span>
          <span className="text-[10px] opacity-70">Clic o arrastra una imagen</span>
        </button>
      )}
    </div>
  )
}

function EvidenciaSlot({
  label,
  coordBadge,
  image,
  onUpload,
  onClear,
}: {
  label: string
  coordBadge: string
  image: string
  onUpload: (file?: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActivo, setDragActivo] = useState(false)

  return (
    <div
      className={`relative flex h-[180px] items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors ${
        dragActivo ? 'border-primary bg-primary/10 text-primary' : 'bg-muted/20 text-muted-foreground'
      }`}
      onDragOver={e => {
        e.preventDefault()
        setDragActivo(true)
      }}
      onDragLeave={() => setDragActivo(false)}
      onDrop={e => {
        e.preventDefault()
        setDragActivo(false)
        const file = Array.from(e.dataTransfer.files).find(item => item.type.startsWith('image/'))
        if (file) onUpload(file)
      }}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => onUpload(e.target.files?.[0])} />
      <span className="absolute left-1 top-1 rounded bg-emerald-500/15 px-1 py-0.5 font-mono text-[9px] text-emerald-600">{coordBadge}</span>
      {image ? (
        <>
          <img src={image} alt={label} className="h-full w-full object-contain" />
          <Button variant="destructive" size="icon" className="absolute right-2 top-2 h-8 w-8" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <button type="button" className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs" onClick={() => inputRef.current?.click()}>
          <ImagePlus className="h-5 w-5 opacity-50" />
          <span>{label}</span>
        </button>
      )}
    </div>
  )
}

function LogoSlot({
  label,
  image,
  onFile,
  onClear,
}: {
  label: string
  image: string
  onFile: (file?: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="group relative flex h-20 w-full items-center justify-center overflow-hidden rounded-md border border-white/20 bg-white/10"
        onClick={() => !image && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
        {image ? (
          <>
            <img src={image} alt={label} className="h-full w-full object-contain" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute right-0.5 top-0.5 h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={e => { e.stopPropagation(); onClear() }}
            >
              <X className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center text-white/50">
            <ImagePlus className="h-4 w-4" />
            <span className="text-[8px]">Logo</span>
          </div>
        )}
      </div>
      <span className="text-[8px] text-white/60">{label}</span>
    </div>
  )
}
