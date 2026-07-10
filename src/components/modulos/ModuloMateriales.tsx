import { useApp } from '@/context/AppContext'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import {
  Eraser,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  LayoutTemplate,
  MapPin,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CampoCombo, COORDS_CON_OPCIONES, useOpcionesCampos } from './campo-combo'
import { dxfACroquis } from '@/lib/dxf-render'

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
  updatedAt?: string
}

// =====================================================
// DEFINICIÓN DE COORDENADAS (fila-columna)
// Replica exacta del layout del HTML pdf_hacia_html.html
// =====================================================

/** Mapa coordenada -> clave de campo del modelo de datos. */
const COORD_A_CAMPO: Record<string, string> = {
  '0-F': 'clave',
  '1-B': 'fecha',
  '1-D': 'segmento',
  '1-F': 'tramo',
  '2-B': 'servicio',
  '2-D': 'infraestructura',
  '2-F': 'altura',
  '3-B': 'tension',
  '3-D': 'tipo_instalacion',
  '3-F': 'ubicacion',
  '4-B': 'elementos_afectos',
  '4-D': 'numero_fases',
  '4-F': 'numero_hilos',
  '5-B': 'cadenamiento_inicio',
  '5-D': 'cadenamiento_fin',
  '5-F': 'estado_fisico',
  '6-B': 'coordenada_x',
  '6-D': 'coordenada_y',
  '6-F': 'operador',
  '7-D': 'descripcion_izquierda',
  '7-F': 'descripcion_derecha',
  '8-F': 'observaciones',
}

/** Mapa de imágenes. */
const IMAGEN_COORD: Record<string, string> = {
  croquis: 'croquis',
  'evid-0': 'evidencia_1',
  'evid-1': 'evidencia_2',
  'evid-2': 'evidencia_3',
}

/** Filas de datos para el formulario (3 columnas por fila: etiqueta/valor). */
const FILAS_DATOS: Array<Array<{ etiqueta: string; coord: string }>> = [
  [{ etiqueta: 'Fecha', coord: '1-B' }, { etiqueta: 'Segmento', coord: '1-D' }, { etiqueta: 'Tramo', coord: '1-F' }],
  [{ etiqueta: 'Servicio', coord: '2-B' }, { etiqueta: 'Infraestructura', coord: '2-D' }, { etiqueta: 'Altura', coord: '2-F' }],
  [{ etiqueta: 'Tensión', coord: '3-B' }, { etiqueta: 'Tipo de instalación', coord: '3-D' }, { etiqueta: 'Ubicación respecto al eje', coord: '3-F' }],
  [{ etiqueta: 'Elementos afectos', coord: '4-B' }, { etiqueta: 'Número de Fases', coord: '4-D' }, { etiqueta: 'Número de hilos', coord: '4-F' }],
  [{ etiqueta: 'Cadenamiento inicio', coord: '5-B' }, { etiqueta: 'Cadenamiento fin', coord: '5-D' }, { etiqueta: 'Estado físico', coord: '5-F' }],
  [{ etiqueta: 'Coordenada "X"', coord: '6-B' }, { etiqueta: 'Coordenada "Y"', coord: '6-D' }, { etiqueta: 'Operador', coord: '6-F' }],
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

// =====================================================
// PLANTILLAS DE LOGOS
// =====================================================

/** Plantilla que conserva solo los logos del formato. */
interface PlantillaLogos {
  id: string
  nombre: string
  logoIzq?: string
  logoDer?: string
  createdAt: string
}

const PLANTILLAS_LOGOS_KEY = 'ferroviario_formato_logo_templates'

function cargarPlantillasLogos(): PlantillaLogos[] {
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

function normalizarBusquedaCampo(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function buscarValorEnFicha(punto: unknown, campo: string): string | undefined {
  if (!punto || typeof punto !== 'object') return undefined
  const moduloData = (punto as Record<string, unknown>).moduloData as Record<string, unknown> | undefined
  const fichaWrapper = moduloData?.ficha as Record<string, unknown> | undefined
  const ficha = (fichaWrapper?.ficha || fichaWrapper) as {
    datos?: Array<{ etiqueta: string; valor: string }>
    descripcionIzquierda?: string
    descripcionDerecha?: string
    observaciones?: string
    titulo?: string
    proyecto?: string
    clave?: string
  } | undefined
  if (!ficha) return undefined

  switch (campo) {
    case 'titulo': return ficha.titulo
    case 'proyecto': return ficha.proyecto
    case 'clave': return ficha.clave
    case 'descripcion_izquierda': return ficha.descripcionIzquierda
    case 'descripcion_derecha': return ficha.descripcionDerecha
    case 'observaciones': return ficha.observaciones
  }

  const etiquetaBuscada = normalizarBusquedaCampo(campo)
  if (etiquetaBuscada && ficha.datos) {
    const item = ficha.datos.find(d => {
      const normal = normalizarBusquedaCampo(d.etiqueta)
      return normal === etiquetaBuscada || normal.includes(etiquetaBuscada) || etiquetaBuscada.includes(normal)
    })
    if (item?.valor) return item.valor
  }

  return undefined
}

function extraerValor(punto: unknown, campo: string): string {
  if (!punto || typeof punto !== 'object') return ''
  const p = punto as Record<string, unknown>
  const moduloData = p.moduloData as Record<string, unknown> | undefined

  switch (campo) {
    case 'clave':
      return String(p.carpetaPath || '').split(/[\\/]/).filter(Boolean).pop() || buscarValorEnFicha(punto, campo) || ''
    case 'fecha': {
      const nombre = String(p.carpetaPath || '')
      const match = nombre.match(/(\d{2})_(\d{2})_(\d{4})/)
      return match ? `${match[1]}/${match[2]}/${match[3]}` : buscarValorEnFicha(punto, campo) || ''
    }
    case 'coordenada_x': {
      const geo = moduloData?.georeferencia as Record<string, unknown> | undefined
      return geo?.coordenadas ? String((geo.coordenadas as Record<string, number>).x || '') : buscarValorEnFicha(punto, campo) || ''
    }
    case 'coordenada_y': {
      const geo = moduloData?.georeferencia as Record<string, unknown> | undefined
      return geo?.coordenadas ? String((geo.coordenadas as Record<string, number>).y || '') : buscarValorEnFicha(punto, campo) || ''
    }
    case 'operador': {
      const nombre = String(p.carpetaPath || p.nombre || '')
      return nombre.replace(/\s*\d{2}_\d{2}_\d{4}.*$/, '').trim() || buscarValorEnFicha(punto, campo) || ''
    }
    case 'observaciones': {
      const analisis = moduloData?.analisis as Record<string, unknown> | undefined
      const results = (analisis?.results || []) as Array<{ description?: string }>
      const descripcionObra = results[0]?.description
      return String(descripcionObra || analisis?.descripcionGeneral || buscarValorEnFicha(punto, campo) || '')
    }
    default:
      return buscarValorEnFicha(punto, campo) || ''
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
  const Ydata: number[] = []
  for (let i = 0; i < 6; i++) { Ydata.push(y); y += Hdata }
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
  txt('FICHA DE IDENTIFICACIÓN DE INFRAESTRUCTURA EXISTENTE', tituloZoneX, Ytitle, tituloZoneW, {
    fs: 10, bold: true, color: [255, 255, 255], align: 'center', vcenter: true, py: 0, h: Htitle,
  })

  // 2. Subtítulo (proyecto + clave)
  cell(ML, Ysub, CX[4] - ML, Hsub, [45, 45, 45])
  txt('Tren de Pasajeros Saltillo - Nuevo Laredo Segmentos 16 y 17', ML, Ysub, CX[4] - ML, {
    fs: 8, color: [255, 255, 255], vcenter: true, py: 0, h: Hsub,
  })
  cell(CX[4], Ysub, C[4], Hsub, [240, 241, 243])
  txt('Clave:', CX[4], Ysub, C[4], { fs: 7.5, bold: true, align: 'right', vcenter: true, py: 0, h: Hsub })
  cell(CX[5], Ysub, C[5], Hsub)
  txt(d['0-F'] || '', CX[5], Ysub, C[5], { fs: 7.5, vcenter: true, py: 0, h: Hsub })

  // 3. Filas de datos (6 filas × 6 columnas)
  const dataRows = [
    { l: ['Fecha:', 'Segmento:', 'Tramo:'], v: ['1-B', '1-D', '1-F'] },
    { l: ['Servicio:', 'Infraestructura:', 'Altura:'], v: ['2-B', '2-D', '2-F'] },
    { l: ['Tensión:', 'Tipo de instalación:', 'Ubicación respecto al eje de proyecto:'], v: ['3-B', '3-D', '3-F'] },
    { l: ['Elementos afectos:', 'Número de Fases:', 'Número de hilos:'], v: ['4-B', '4-D', '4-F'] },
    { l: ['Cadenamiento inicio:', 'Cadenamiento fin:', 'Estado físico:'], v: ['5-B', '5-D', '5-F'] },
    { l: ['Coordenada "X":', 'Coordenada "Y":', 'Operador:'], v: ['6-B', '6-D', '6-F'] },
  ]

  dataRows.forEach((row, ri) => {
    const yy = Ydata[ri]
    for (let p = 0; p < 3; p++) {
      const lx = CX[p * 2]
      const vx = CX[p * 2 + 1]
      cell(lx, yy, C[p * 2], Hdata, [240, 241, 243])
      const lblFS = row.l[p].length > 28 ? 6.5 : 7.5
      txt(row.l[p], lx, yy, C[p * 2], { fs: lblFS, bold: true, vcenter: true, py: 0, h: Hdata })
      cell(vx, yy, C[p * 2 + 1], Hdata)
      txt(d[row.v[p]] || '', vx, yy, C[p * 2 + 1], { fs: 7.5, vcenter: true, py: 0, h: Hdata })
    }
  })

  // 4. Estado actual — etiquetas
  cell(ML, YestLbl, CX[3] - ML, HestLbl, [240, 241, 243])
  txt('Estado actual y descripción del estado del elemento. Lado Izquierdo', ML, YestLbl, CX[3] - ML, {
    fs: 7, bold: true, vcenter: true, py: 0, h: HestLbl,
  })
  cell(CX[3], YestLbl, CX[6] - CX[3], HestLbl, [240, 241, 243])
  txt('Lado derecho', CX[3], YestLbl, CX[6] - CX[3], {
    fs: 7.5, bold: true, align: 'center', vcenter: true, py: 0, h: HestLbl,
  })

  // 5. Estado actual — valores
  cell(ML, YestVal, CX[3] - ML, HestVal)
  txt(d['7-D'] || '', ML, YestVal, CX[3] - ML, { fs: 7, py: 2.5, h: HestVal })
  cell(CX[3], YestVal, CX[6] - CX[3], HestVal)
  txt(d['7-F'] || '', CX[3], YestVal, CX[6] - CX[3], { fs: 7, py: 2.5, h: HestVal })

  // 6. Croquis / Observaciones — etiquetas
  cell(ML, YcrLbl, CX[3] - ML, HcrLbl, [240, 241, 243])
  txt('CROQUIS DE LOCALIZACIÓN:', ML, YcrLbl, CX[3] - ML, {
    fs: 7.5, bold: true, align: 'center', vcenter: true, py: 0, h: HcrLbl,
  })
  cell(CX[3], YcrLbl, CX[6] - CX[3], HcrLbl, [240, 241, 243])
  txt('Observaciones:', CX[3], YcrLbl, CX[6] - CX[3], {
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
  txt('EVIDENCIA FOTOGRÁFICA', ML, YevLbl, PW, {
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

  doc.save(`${nombreArchivo}.pdf`)
}

// =====================================================
// EXPORTACIÓN EXCEL (XLSX/SheetJS) — réplica del HTML
// =====================================================

export async function exportarExcelFicha(
  valores: Record<string, string>,
  imagenes: Record<string, string>,
  nombreArchivo = 'Ficha_LMT-T11-02',
  opciones: { quitarFondoLogos?: boolean; numEvidencias?: number; imagenesReconocimiento?: string[] } = {},
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
  const fontWhiteBold = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 }
  const fontWhite = { color: { argb: 'FFFFFFFF' }, size: 8 }
  const fontLabelBold = { bold: true, size: 9 }
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
  cellTitulo.value = 'FICHA DE IDENTIFICACIÓN DE INFRAESTRUCTURA EXISTENTE'
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
  cellProy.value = 'Tren de Pasajeros Saltillo - Nuevo Laredo Segmentos 16 y 17'
  cellProy.fill = fillSub
  cellProy.font = fontWhite
  cellProy.alignment = { vertical: 'middle' }
  cellProy.border = thinBorder

  const cellClaveLbl = ws.getCell('E2')
  cellClaveLbl.value = 'Clave:'
  cellClaveLbl.fill = fillLabel
  cellClaveLbl.font = fontLabelBold
  cellClaveLbl.alignment = { horizontal: 'right', vertical: 'middle' }
  cellClaveLbl.border = thinBorder

  const cellClaveVal = ws.getCell('F2')
  cellClaveVal.value = d['0-F'] || ''
  cellClaveVal.border = thinBorder
  cellClaveVal.alignment = { vertical: 'middle' }
  ws.getRow(2).height = 18

  // Filas 3-8: datos (6 filas × 6 columnas)
  const dataRows = [
    { l: ['Fecha:', 'Segmento:', 'Tramo:'], v: ['1-B', '1-D', '1-F'] },
    { l: ['Servicio:', 'Infraestructura:', 'Altura:'], v: ['2-B', '2-D', '2-F'] },
    { l: ['Tensión:', 'Tipo de instalación:', 'Ubicación respecto al eje de proyecto:'], v: ['3-B', '3-D', '3-F'] },
    { l: ['Elementos afectos:', 'Número de Fases:', 'Número de hilos:'], v: ['4-B', '4-D', '4-F'] },
    { l: ['Cadenamiento inicio:', 'Cadenamiento fin:', 'Estado físico:'], v: ['5-B', '5-D', '5-F'] },
    { l: ['Coordenada "X":', 'Coordenada "Y":', 'Operador:'], v: ['6-B', '6-D', '6-F'] },
  ]
  dataRows.forEach((row, ri) => {
    const rowNumber = ri + 3
    ws.getRow(rowNumber).height = 18
    for (let p = 0; p < 3; p++) {
      const lblCol = p * 2 + 1
      const valCol = p * 2 + 2
      const cellLbl = ws.getCell(rowNumber, lblCol)
      cellLbl.value = row.l[p]
      cellLbl.fill = fillLabel
      cellLbl.font = fontLabelBold
      cellLbl.alignment = { vertical: 'middle', wrapText: true }
      cellLbl.border = thinBorder

      const cellVal = ws.getCell(rowNumber, valCol)
      cellVal.value = d[row.v[p]] || ''
      cellVal.border = thinBorder
      cellVal.alignment = { vertical: 'middle', wrapText: true }
    }
  })

  // Fila 9: etiquetas estado actual
  ws.mergeCells('A9:C9')
  const cellEstIzqLbl = ws.getCell('A9')
  cellEstIzqLbl.value = 'Estado actual y descripción del estado del elemento. Lado Izquierdo'
  cellEstIzqLbl.fill = fillLabel
  cellEstIzqLbl.font = fontLabelBold
  cellEstIzqLbl.alignment = { vertical: 'middle', wrapText: true }
  cellEstIzqLbl.border = thinBorder

  ws.mergeCells('D9:F9')
  const cellEstDerLbl = ws.getCell('D9')
  cellEstDerLbl.value = 'Lado derecho'
  cellEstDerLbl.fill = fillLabel
  cellEstDerLbl.font = fontLabelBold
  cellEstDerLbl.alignment = { horizontal: 'center', vertical: 'middle' }
  cellEstDerLbl.border = thinBorder

  // Fila 10: valores estado actual
  ws.mergeCells('A10:C10')
  const cellEstIzqVal = ws.getCell('A10')
  cellEstIzqVal.value = d['7-D'] || ''
  cellEstIzqVal.alignment = { vertical: 'top', wrapText: true }
  cellEstIzqVal.border = thinBorder

  ws.mergeCells('D10:F10')
  const cellEstDerVal = ws.getCell('D10')
  cellEstDerVal.value = d['7-F'] || ''
  cellEstDerVal.alignment = { vertical: 'top', wrapText: true }
  cellEstDerVal.border = thinBorder
  ws.getRow(10).height = 80

  // Fila 11: etiquetas croquis / observaciones
  ws.mergeCells('A11:C11')
  const cellCrLbl = ws.getCell('A11')
  cellCrLbl.value = 'CROQUIS DE LOCALIZACIÓN:'
  cellCrLbl.fill = fillLabel
  cellCrLbl.font = fontLabelBold
  cellCrLbl.alignment = { horizontal: 'center', vertical: 'middle' }
  cellCrLbl.border = thinBorder

  ws.mergeCells('D11:F11')
  const cellObsLbl = ws.getCell('D11')
  cellObsLbl.value = 'Observaciones:'
  cellObsLbl.fill = fillLabel
  cellObsLbl.font = fontLabelBold
  cellObsLbl.alignment = { horizontal: 'center', vertical: 'middle' }
  cellObsLbl.border = thinBorder

  // Fila 12: valores croquis / observaciones
  ws.mergeCells('A12:C12')
  const cellCrVal = ws.getCell('A12')
  cellCrVal.value = imagenes.croquis ? '[Ver croquis adjunto]' : ''
  cellCrVal.alignment = { vertical: 'top', wrapText: true }
  cellCrVal.border = thinBorder

  ws.mergeCells('D12:F12')
  const cellObsVal = ws.getCell('D12')
  cellObsVal.value = d['8-F'] || ''
  cellObsVal.alignment = { vertical: 'top', wrapText: true }
  cellObsVal.border = thinBorder
  ws.getRow(12).height = 120

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

      // Posición del tl en fracciones de celda
      const colWidthPx = (ws.getColumn(col + 1).width || 30) * PX_POR_CARACTER
      const offsetCol = fit.offsetX / colWidthPx
      const offsetRow = fit.offsetY / rowHeightPx

      const id = workbook.addImage({ base64, extension: ext })
      // ext: tamaño EXACTO en píxeles → Excel no estira ni contrae
      ws.addImage(id, {
        tl: { col: col + offsetCol, row: row + offsetRow },
        ext: { width: Math.round(fit.w), height: Math.round(fit.h) },
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

  // --- Croquis (filas 12, columnas A-C) ---
  if (imagenes.croquis) {
    await addImageContain(imagenes.croquis, 0, 11, 3, 1)
  }

  // --- Evidencias fotográficas ---
  if (numEvidencias > 0) {
    const { cols: evCols, rows: evRows } = calcularDistribucionEvidencias(numEvidencias)
    const evStartRow = 13
    const colsPorImagen = 6 / evCols
    const itemsUltimaFila = numEvidencias - (evRows - 1) * evCols
    const offsetUltimaFila = itemsUltimaFila < evCols ? Math.floor((evCols - itemsUltimaFila) / 2) : 0

    // Etiqueta de evidencia
    ws.mergeCells(evStartRow, 1, evStartRow, 6)
    const cellEvLbl = ws.getCell(evStartRow, 1)
    cellEvLbl.value = 'EVIDENCIA FOTOGRÁFICA'
    cellEvLbl.fill = fillLabel
    cellEvLbl.font = fontLabelBold
    cellEvLbl.alignment = { horizontal: 'center', vertical: 'middle' }
    cellEvLbl.border = thinBorder
    ws.getRow(evStartRow).height = 18

    for (let fila = 0; fila < evRows; fila++) {
      const rowNumber = evStartRow + 1 + fila
      ws.getRow(rowNumber).height = 90
      const isUltimaFila = fila === evRows - 1
      const offset = isUltimaFila ? offsetUltimaFila : 0
      for (let col = 0; col < evCols; col++) {
        const idx = fila * evCols + col
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
  descargarArchivo(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${nombreArchivo}.xlsx`,
  )
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function ModuloMateriales() {
  const { state, actualizarPunto } = useApp()
  const punto = state.puntoActivo

  const [valores, setValores] = useState<Record<string, string>>({})
  const { opciones: opcionesCombo, registrar: registrarCombo } = useOpcionesCampos()
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
  const [plantillaSeleccionadaId, setPlantillaSeleccionadaId] = useState<string>('')
  const guardarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cargar datos persistidos al montar o cambiar de punto
  useEffect(() => {
    const data = punto?.moduloData?.materiales as FichaFormatoData | undefined
    const imagenesGuardadas = data?.imagenes || {}
    let imagenesIniciales = { ...imagenesGuardadas }

    // Fallback: el logo derecho (logo 2) se conserva en localStorage porque
    // la copia ligera de localStorage puede descartar data URLs grandes.
    if (punto && !imagenesIniciales['logo-der']) {
      try {
        const guardado = localStorage.getItem(logoDerStorageKey(punto.id))
        if (guardado) {
          imagenesIniciales['logo-der'] = guardado
        }
      } catch {
        // Ignorar errores de localStorage
      }
    }

    setValores(data?.valores || {})
    setImagenes(imagenesIniciales)
    setNumEvidencias(data?.numEvidencias ?? EVIDENCIAS_DEFECTO)
    setQuitarFondoLogos(data?.quitarFondoLogos ?? false)
    setCargado(true)
  }, [punto?.id])

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
  const guardarEnPunto = useCallback(() => {
    if (!punto) return
    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        materiales: {
          valores,
          imagenes,
          numEvidencias,
          quitarFondoLogos,
          updatedAt: new Date().toISOString(),
        },
      },
    })
  }, [actualizarPunto, punto, valores, imagenes, numEvidencias, quitarFondoLogos])

  // Autoguardado: persistir cambios en el punto (con debounce corto)
  useEffect(() => {
    if (!cargado || !punto) return
    if (guardarTimeoutRef.current) clearTimeout(guardarTimeoutRef.current)
    guardarTimeoutRef.current = setTimeout(() => {
      guardarEnPunto()
      guardarTimeoutRef.current = null
    }, 300)
    return () => {
      if (guardarTimeoutRef.current) {
        clearTimeout(guardarTimeoutRef.current)
        guardarTimeoutRef.current = null
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

  // Importa automáticamente las primeras N imágenes disponibles del reconocimiento
  // en los slots de evidencia fotográfica cuando cambia el número de fotos.
  const importarEvidenciasDesdeReconocimiento = useCallback((n: number) => {
    if (!punto) return
    const disponibles = obtenerImagenesDeReconocimiento(punto)
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
  }, [punto])

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
    () => obtenerImagenesDeReconocimiento(punto),
    [punto],
  )

  const actualizarValor = (coord: string, valor: string) => {
    setValores(prev => ({ ...prev, [coord]: valor }))
  }

  const autocompletarDesdeModulos = () => {
    if (!punto) return
    const nuevosValores = { ...valores }
    for (const [coord, campo] of Object.entries(COORD_A_CAMPO)) {
      if (!nuevosValores[coord]) {
        const val = extraerValor(punto, campo)
        if (val) nuevosValores[coord] = val
      }
    }
    const nuevasImagenes = { ...imagenes }
    for (const [key, campo] of Object.entries(IMAGEN_COORD)) {
      if (!nuevasImagenes[key]) {
        const val = extraerImagen(punto, campo)
        if (val) nuevasImagenes[key] = val
      }
    }
    setValores(nuevosValores)
    setImagenes(nuevasImagenes)
    toast.success('Datos autocompletados desde otros módulos')
  }

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

  const guardar = () => {
    if (!punto) return
    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        materiales: {
          valores,
          imagenes,
          numEvidencias,
          quitarFondoLogos,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    toast.success('Ficha guardada')
  }

  const guardarPlantillaLogos = () => {
    const nombre = nombreNuevaPlantilla.trim()
    if (!nombre) {
      toast.error('Escribe un nombre para la plantilla')
      return
    }
    if (!imagenes['logo-izq'] && !imagenes['logo-der']) {
      toast.error('No hay logos cargados para guardar')
      return
    }
    const nuevasPlantillas = [
      ...plantillasLogos,
      {
        id: crypto.randomUUID(),
        nombre,
        logoIzq: imagenes['logo-izq'] || undefined,
        logoDer: imagenes['logo-der'] || undefined,
        createdAt: new Date().toISOString(),
      },
    ]
    setPlantillasLogos(nuevasPlantillas)
    guardarPlantillasLogos(nuevasPlantillas)
    setNombreNuevaPlantilla('')
    toast.success(`Plantilla "${nombre}" guardada`)
  }

  const cargarPlantillaLogos = () => {
    const plantilla = plantillasLogos.find(p => p.id === plantillaSeleccionadaId)
    if (!plantilla) {
      toast.error('Selecciona una plantilla para cargar')
      return
    }
    setImagenes(prev => ({
      ...prev,
      ...(plantilla.logoIzq && { 'logo-izq': plantilla.logoIzq }),
      ...(plantilla.logoDer && { 'logo-der': plantilla.logoDer }),
    }))
    toast.success(`Plantilla "${plantilla.nombre}" cargada`)
    setDialogoPlantillasOpen(false)
  }

  const eliminarPlantillaLogos = (id: string) => {
    const filtradas = plantillasLogos.filter(p => p.id !== id)
    setPlantillasLogos(filtradas)
    guardarPlantillasLogos(filtradas)
    if (plantillaSeleccionadaId === id) setPlantillaSeleccionadaId('')
    toast.info('Plantilla eliminada')
  }

  const handleExportarTodo = async () => {
    if (punto?.estadoAprobacion !== 'aprobado') {
      toast.error('El punto debe estar aprobado en la pestaña Aprobación antes de exportar.')
      return
    }
    setExportando(true)
    const nombre = `Ficha_LMT-T11-02-${punto?.nombre || 'punto'}`
    try {
      await exportarPdfFicha(valores, imagenes, nombre, {
        quitarFondoLogos,
        numEvidencias,
      })
      await exportarExcelFicha(valores, imagenes, nombre, {
        quitarFondoLogos,
        numEvidencias,
        imagenesReconocimiento: imagenesReconocimientoDisponibles,
      })
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

  const importarCroquisDesdeDxf = async (file?: File) => {
    if (!file || !punto) return
    try {
      const texto = await file.text()
      const geo = punto.moduloData?.georeferencia ?? punto.moduloData?.georeferenciacion
      const x = Number(valores['6-B'] ?? geo?.coordenadas?.x ?? '')
      const y = Number(valores['6-D'] ?? geo?.coordenadas?.y ?? '')
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        toast.error('Faltan coordenadas X/Y del punto. Pulsa "Autocompletar" o rellena 6-B/6-D.')
        return
      }
      const dataUrl = dxfACroquis(texto, { x, y, size: 200 })
      setImagenes(prev => ({ ...prev, croquis: dataUrl }))
      toast.success('Croquis generado desde DXF (200×200 cm, ±100 cm del punto)')
    } catch (err) {
      toast.error('No se pudo procesar el DXF: ' + String(err))
    }
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
                <Button variant="outline" size="sm" onClick={autocompletarDesdeModulos}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Autocompletar
                </Button>
                <Button variant="outline" size="sm" onClick={limpiarFicha}>
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
                <Button size="sm" onClick={handleExportarTodo} disabled={exportando || punto?.estadoAprobacion !== 'aprobado'} title={punto?.estadoAprobacion !== 'aprobado' ? 'Aprueba el punto en la pestaña Aprobación' : undefined}>
                  <FileText className="mr-2 h-4 w-4" />
                  {exportando ? 'Exportando...' : 'PDF + Excel'}
                </Button>
                <Dialog open={dialogoPlantillasOpen} onOpenChange={setDialogoPlantillasOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <LayoutTemplate className="mr-2 h-4 w-4" />
                      Plantillas
                    </Button>
                  </DialogTrigger>
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
                            disabled={
                              !nombreNuevaPlantilla.trim() ||
                              (!imagenes['logo-izq'] && !imagenes['logo-der'])
                            }
                          >
                            Guardar
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Cargar plantilla guardada</Label>
                        <div className="flex gap-2">
                          <Select value={plantillaSeleccionadaId} onValueChange={setPlantillaSeleccionadaId}>
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                            <SelectContent>
                              {plantillasLogos.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="secondary"
                            onClick={cargarPlantillaLogos}
                            disabled={!plantillaSeleccionadaId}
                          >
                            Cargar
                          </Button>
                        </div>
                      </div>

                      {plantillasLogos.length > 0 && (
                        <div className="space-y-2">
                          <Label>Plantillas guardadas</Label>
                          <div className="max-h-40 space-y-1 overflow-auto">
                            {plantillasLogos.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between rounded border px-2 py-1"
                              >
                                <span className="text-sm">{p.nombre}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => eliminarPlantillaLogos(p.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
                <Button size="sm" onClick={guardar}>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
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
                    value="FICHA DE IDENTIFICACIÓN DE INFRAESTRUCTURA EXISTENTE"
                    readOnly
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
                  value="Tren de Pasajeros Saltillo - Nuevo Laredo Segmentos 16 y 17"
                  readOnly
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
                  {fila.map(({ etiqueta, coord }) => {
                    const etiquetaCombo = COORDS_CON_OPCIONES[coord]
                    return (
                      <div key={coord} className="space-y-1">
                        <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                          <span>{etiqueta}</span>
                          <span className="font-mono text-[10px] text-emerald-600">{coord}</span>
                        </label>
                        {etiquetaCombo ? (
                          <CampoCombo
                            value={valores[coord] || ''}
                            onChange={v => actualizarValor(coord, v)}
                            onCommit={v => registrarCombo(etiquetaCombo, v)}
                            opciones={opcionesCombo[etiquetaCombo] || []}
                            onFocus={() => setCoordActiva(coord)}
                            placeholder={etiqueta}
                            className="px-2 py-1"
                          />
                        ) : (
                          <CoordInput
                            coord={coord}
                            value={valores[coord] || ''}
                            onChange={v => actualizarValor(coord, v)}
                            onFocus={setCoordActiva}
                            placeholder={etiqueta}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Estado actual */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Estado actual - Lado izquierdo</span>
                  <span className="font-mono text-[10px] text-emerald-600">7-D</span>
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
                <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Estado actual - Lado derecho</span>
                  <span className="font-mono text-[10px] text-emerald-600">7-F</span>
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
                    Croquis de localización <span className="font-mono text-[10px] text-emerald-600">img-croquis</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent"                     title="Genera el croquis recortando ±100 cm (200×200) del DXF en las coordenadas X/Y del punto">
                    <FileText className="h-3 w-3" />
                    Importar DXF
                    <input type="file" accept=".dxf" className="hidden" onChange={e => importarCroquisDesdeDxf(e.target.files?.[0])} />
                  </label>
                </div>
                <ImagePreview
                  image={imagenes.croquis || ''}
                  placeholder="Croquis de localización"
                  onFile={file => cargarImagen('croquis', file)}
                  onClear={() => limpiarImagen('croquis')}
                />
              </div>
              <div className="space-y-1">
                <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Observaciones</span>
                  <span className="font-mono text-[10px] text-emerald-600">8-F</span>
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
    </ScrollArea>
  )
}

// =====================================================
// SUBCOMPONENTES
// =====================================================

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
