import { useApp } from '@/context/AppContext'
import { excelFileToImage } from '@/lib/excel-to-image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Calendar,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Italic,
  LayoutTemplate,
  MousePointer2,
  Paintbrush,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'

// =====================================================
// TIPOS
// =====================================================

interface WidgetPosicionado {
  id: string
  campo: string
  etiqueta: string
  tipo: 'texto' | 'imagen'
  x: number
  y: number
  fontSize: number
  fontFamily: string
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  textDecoration: 'none' | 'underline' | 'line-through'
  textAlign: 'left' | 'center' | 'right'
  width: number
  height: number
  color: string
  backgroundColor: string
}

interface PlantillaVisual {
  id: string
  nombre: string
  tipo: 'imagen' | 'pdf' | 'excel'
  archivoNombre: string
  archivoBase64: string
  widgets: WidgetPosicionado[]
  ancho: number
  alto: number
  createdAt: string
}

// =====================================================
// CAMPOS DISPONIBLES (mismos de la ficha)
// =====================================================

const CAMPOS_TEXTO = [
  { key: 'titulo', label: 'Titulo' },
  { key: 'proyecto', label: 'Proyecto' },
  { key: 'clave', label: 'Clave' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'segmento', label: 'Segmento' },
  { key: 'tramo', label: 'Tramo' },
  { key: 'servicio', label: 'Servicio' },
  { key: 'infraestructura', label: 'Infraestructura' },
  { key: 'altura', label: 'Altura' },
  { key: 'tension', label: 'Tension' },
  { key: 'tipo_instalacion', label: 'Tipo de instalacion' },
  { key: 'ubicacion', label: 'Ubicacion respecto al eje' },
  { key: 'elementos_afectos', label: 'Elementos afectos' },
  { key: 'numero_fases', label: 'Numero de Fases' },
  { key: 'numero_hilos', label: 'Numero de hilos' },
  { key: 'cadenamiento_inicio', label: 'Cadenamiento inicio' },
  { key: 'cadenamiento_fin', label: 'Cadenamiento fin' },
  { key: 'estado_fisico', label: 'Estado fisico' },
  { key: 'coordenada_x', label: 'Coordenada X' },
  { key: 'coordenada_y', label: 'Coordenada Y' },
  { key: 'coordenada_z', label: 'Coordenada Z' },
  { key: 'operador', label: 'Operador' },
  { key: 'descripcion_izquierda', label: 'Estado actual izquierdo' },
  { key: 'descripcion_derecha', label: 'Estado actual derecho' },
  { key: 'observaciones', label: 'Observaciones' },
]

const CAMPOS_IMAGEN = [
  { key: 'croquis', label: 'Croquis' },
  { key: 'evidencia_1', label: 'Evidencia 1' },
  { key: 'evidencia_2', label: 'Evidencia 2' },
  { key: 'evidencia_3', label: 'Evidencia 3' },
  { key: 'evidencia_4', label: 'Evidencia 4' },
]

const MAX_PLANTILLAS = 10
const FUENTE_TEXTO_PREDETERMINADA = 'Arial'
const TAMANO_TEXTO_PREDETERMINADO = 14
const LINE_HEIGHT = 1.2

// =====================================================
// UTILIDADES
// =====================================================

function arrayBufferABase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64AArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function descargarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function crearSrcPdfVista(base64: string): string {
  return `data:application/pdf;base64,${base64}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&page=1&view=Fit`
}

function normalizarBusquedaCampo(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizarTextoPlantilla(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function inferirTipoPlantilla(nombre: string, base64?: string): 'imagen' | 'pdf' | 'excel' {
  const lower = nombre.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (/\.(xlsx|xls)$/.test(lower)) return 'excel'
  if (base64) {
    if (base64.startsWith('data:application/pdf')) return 'pdf'
    if (base64.startsWith('data:image/')) return 'imagen'
  }
  return 'imagen'
}

function formatearFechaPlantilla(fecha: string): string {
  if (!fecha) return 'Sin fecha'
  const fechaObj = new Date(fecha)
  if (Number.isNaN(fechaObj.getTime())) return 'Sin fecha'
  return fechaObj.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function obtenerResumenPlantilla(plantilla: PlantillaVisual): string {
  const textos = plantilla.widgets.filter(w => w.tipo === 'texto').length
  const imagenes = plantilla.widgets.filter(w => w.tipo === 'imagen').length
  const partes = [
    textos ? `${textos} texto${textos === 1 ? '' : 's'}` : '',
    imagenes ? `${imagenes} imagen${imagenes === 1 ? '' : 'es'}` : '',
  ].filter(Boolean)

  return partes.length > 0 ? partes.join(' - ') : 'Sin campos'
}

function buscarValorEnFicha(punto: unknown, campo: string): string | undefined {
  if (!punto || typeof punto !== 'object') return undefined
  const moduloData = (punto as Record<string, unknown>).moduloData as Record<string, unknown> | undefined
  const ficha = moduloData?.ficha as {
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

  const campoInfo = CAMPOS_TEXTO.find(c => c.key === campo)
  const etiquetaBuscada = campoInfo ? normalizarBusquedaCampo(campoInfo.label) : normalizarBusquedaCampo(campo)

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

  switch (campo) {
    case 'titulo': return buscarValorEnFicha(punto, campo) || 'FICHA DE IDENTIFICACION DE INFRAESTRUCTURA EXISTENTE'
    case 'proyecto': return String(p.nombre || buscarValorEnFicha(punto, campo) || '')
    case 'clave': return String(p.carpetaPath || '').split(/[\\/]/).filter(Boolean).pop() || buscarValorEnFicha(punto, campo) || ''
    case 'fecha': {
      const nombre = String(p.carpetaPath || '')
      const match = nombre.match(/(\d{2})_(\d{2})_(\d{4})/)
      return match ? `${match[1]}/${match[2]}/${match[3]}` : buscarValorEnFicha(punto, campo) || ''
    }
    case 'coordenada_x': {
      const geo = (p.moduloData as Record<string, unknown>)?.georeferencia as Record<string, unknown> | undefined
      return geo?.coordenadas ? String((geo.coordenadas as Record<string, number>).x || '') : buscarValorEnFicha(punto, campo) || ''
    }
    case 'coordenada_y': {
      const geo = (p.moduloData as Record<string, unknown>)?.georeferencia as Record<string, unknown> | undefined
      return geo?.coordenadas ? String((geo.coordenadas as Record<string, number>).y || '') : buscarValorEnFicha(punto, campo) || ''
    }
    case 'coordenada_z': {
      const geo = (p.moduloData as Record<string, unknown>)?.georeferencia as Record<string, unknown> | undefined
      return geo?.coordenadas ? String((geo.coordenadas as Record<string, number>).z || '') : buscarValorEnFicha(punto, campo) || ''
    }
    case 'operador': {
      const nombre = String(p.carpetaPath || p.nombre || '')
      return nombre.replace(/\s*\d{2}_\d{2}_\d{4}.*$/, '').trim() || buscarValorEnFicha(punto, campo) || ''
    }
    case 'observaciones': {
      const analisis = (p.moduloData as Record<string, unknown>)?.analisis as Record<string, unknown> | undefined
      return String(analisis?.descripcionGeneral || buscarValorEnFicha(punto, campo) || '')
    }
    default: {
      const deFicha = buscarValorEnFicha(punto, campo)
      if (deFicha) return deFicha
      const directo = p[campo]
      if (directo !== undefined) return String(directo)
      return ''
    }
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

function dividirTextoCanvas(ctx: CanvasRenderingContext2D, texto: string, maxWidth: number): string[] {
  const lineas: string[] = []
  const parrafos = String(texto).split(/\r?\n/)

  for (const parrafo of parrafos) {
    const palabras = parrafo.split(/\s+/).filter(Boolean)
    if (palabras.length === 0) {
      lineas.push('')
      continue
    }

    let linea = ''
    for (const palabra of palabras) {
      const candidata = linea ? `${linea} ${palabra}` : palabra
      if (ctx.measureText(candidata).width <= maxWidth || !linea) {
        linea = candidata
      } else {
        lineas.push(linea)
        linea = palabra
      }
    }
    if (linea) lineas.push(linea)
  }

  return lineas
}

function calcularLineasAjustadasCanvas(
  ctx: CanvasRenderingContext2D,
  texto: string,
  widget: WidgetPosicionado
) {
  const maxWidth = Math.max(1, widget.width)
  const maxHeight = Math.max(1, widget.height)

  for (let size = widget.fontSize; size >= 6; size -= 1) {
    ctx.font = `${widget.fontStyle} ${widget.fontWeight} ${size}px ${widget.fontFamily || FUENTE_TEXTO_PREDETERMINADA}`
    const lineHeight = size * LINE_HEIGHT
    const lineas = dividirTextoCanvas(ctx, texto, maxWidth)
    if (lineas.length * lineHeight <= maxHeight) {
      return { lineas, fontSize: size, lineHeight }
    }
  }

  ctx.font = `${widget.fontStyle} ${widget.fontWeight} 6px ${widget.fontFamily || FUENTE_TEXTO_PREDETERMINADA}`
  return { lineas: dividirTextoCanvas(ctx, texto, maxWidth), fontSize: 6, lineHeight: 6 * LINE_HEIGHT }
}

function dividirTextoPdf(font: { widthOfTextAtSize: (text: string, size: number) => number }, texto: string, maxWidth: number, fontSize: number): string[] {
  const lineas: string[] = []
  const parrafos = String(texto).split(/\r?\n/)

  for (const parrafo of parrafos) {
    const palabras = parrafo.split(/\s+/).filter(Boolean)
    if (palabras.length === 0) {
      lineas.push('')
      continue
    }

    let linea = ''
    for (const palabra of palabras) {
      const candidata = linea ? `${linea} ${palabra}` : palabra
      if (font.widthOfTextAtSize(candidata, fontSize) <= maxWidth || !linea) {
        linea = candidata
      } else {
        lineas.push(linea)
        linea = palabra
      }
    }
    if (linea) lineas.push(linea)
  }

  return lineas
}

function alinearTextoX(
  align: WidgetPosicionado['textAlign'],
  baseX: number,
  width: number,
  textWidth: number
) {
  if (align === 'center') return baseX + (width - textWidth) / 2
  if (align === 'right') return baseX + width - textWidth
  return baseX
}

// =====================================================
// EXPORTACIONES
// =====================================================

async function exportarConFondoImagen(
  fondoBase64: string,
  widgets: WidgetPosicionado[],
  punto: unknown
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = fondoBase64
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!

  ctx.drawImage(img, 0, 0)

  for (const w of widgets) {
    const valor = w.tipo === 'texto' ? extraerValor(punto, w.campo) : extraerImagen(punto, w.campo)
    if (!valor) continue

    if (w.tipo === 'texto') {
      if (w.backgroundColor && w.backgroundColor !== 'transparent') {
        ctx.save()
        ctx.fillStyle = w.backgroundColor
        ctx.fillRect(w.x, w.y, w.width, w.height)
        ctx.restore()
      }

      const { lineas, fontSize, lineHeight } = calcularLineasAjustadasCanvas(ctx, valor, w)
      ctx.font = `${w.fontStyle} ${w.fontWeight} ${fontSize}px ${w.fontFamily || FUENTE_TEXTO_PREDETERMINADA}`
      ctx.fillStyle = w.color
      ctx.textBaseline = 'top'

      lineas.forEach((linea, index) => {
        const textWidth = ctx.measureText(linea).width
        const textX = alinearTextoX(w.textAlign, w.x, w.width, textWidth)
        ctx.fillText(linea, textX, w.y + index * lineHeight)
      })

      if (w.textDecoration === 'underline') {
        ctx.beginPath()
        ctx.moveTo(w.x, w.y + lineHeight)
        ctx.lineTo(w.x + w.width, w.y + lineHeight)
        ctx.strokeStyle = w.color
        ctx.stroke()
      } else if (w.textDecoration === 'line-through') {
        ctx.beginPath()
        ctx.moveTo(w.x, w.y + fontSize / 2)
        ctx.lineTo(w.x + w.width, w.y + fontSize / 2)
        ctx.strokeStyle = w.color
        ctx.stroke()
      }
    } else {
      const imgEvidencia = await new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => resolve(null)
        image.src = valor
      })
      if (imgEvidencia) {
        ctx.drawImage(imgEvidencia, w.x, w.y, w.width, w.height)
      }
    }
  }

  return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'))
}

function mapearFuentePdf(fontFamily: string, fontWeight: string, fontStyle: string): string {
  const base = (() => {
    switch (fontFamily) {
      case 'Arial': return 'Helvetica'
      case 'Times New Roman': return 'TimesRoman'
      case 'Courier New': return 'Courier'
      default: return 'Helvetica'
    }
  })()
  const isBold = fontWeight === 'bold'
  const isItalic = fontStyle === 'italic'

  if (base === 'Helvetica') {
    if (isBold && isItalic) return 'HelveticaBoldOblique'
    if (isBold) return 'HelveticaBold'
    if (isItalic) return 'HelveticaOblique'
    return 'Helvetica'
  }
  if (base === 'TimesRoman') {
    if (isBold && isItalic) return 'TimesRomanBoldItalic'
    if (isBold) return 'TimesRomanBold'
    if (isItalic) return 'TimesRomanItalic'
    return 'TimesRoman'
  }
  if (base === 'Courier') {
    if (isBold && isItalic) return 'CourierBoldOblique'
    if (isBold) return 'CourierBold'
    if (isItalic) return 'CourierOblique'
    return 'Courier'
  }
  return base
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0, g: 0, b: 0 }
}

async function exportarConFondoPdf(
  fondoBase64: string,
  widgets: WidgetPosicionado[],
  punto: unknown
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const pdfDoc = await PDFDocument.load(base64AArrayBuffer(fondoBase64))
  const pages = pdfDoc.getPages()
  const page = pages[0]
  const { height } = page.getSize()

  const fuentes: Record<string, Awaited<ReturnType<typeof pdfDoc.embedFont>>> = {}
  const getFont = async (fontFamily: string, fontWeight: string, fontStyle: string) => {
    const key = `${fontFamily || 'Helvetica'}-${fontWeight}-${fontStyle}`
    if (!fuentes[key]) {
      const nombre = mapearFuentePdf(fontFamily || 'Helvetica', fontWeight, fontStyle)
      fuentes[key] = await pdfDoc.embedFont(StandardFonts[nombre as keyof typeof StandardFonts])
    }
    return fuentes[key]
  }

  for (const w of widgets) {
    const valor = w.tipo === 'texto' ? extraerValor(punto, w.campo) : extraerImagen(punto, w.campo)
    if (!valor) continue

    const pdfY = height - w.y - (w.tipo === 'texto' ? w.fontSize : w.height)

    if (w.tipo === 'texto') {
      const font = await getFont(w.fontFamily, w.fontWeight, w.fontStyle)
      if (w.backgroundColor && w.backgroundColor !== 'transparent') {
        const bg = hexToRgb(w.backgroundColor)
        page.drawRectangle({
          x: w.x,
          y: height - w.y - w.height,
          width: w.width,
          height: w.height,
          color: rgb(bg.r, bg.g, bg.b),
        })
      }

      let fittedFontSize = w.fontSize
      let lineHeight = fittedFontSize * LINE_HEIGHT
      let lineas = dividirTextoPdf(font, valor, Math.max(1, w.width), fittedFontSize)
      for (let size = w.fontSize; size >= 6; size -= 1) {
        const candidateLineHeight = size * LINE_HEIGHT
        const candidateLines = dividirTextoPdf(font, valor, Math.max(1, w.width), size)
        if (candidateLines.length * candidateLineHeight <= Math.max(1, w.height)) {
          fittedFontSize = size
          lineHeight = candidateLineHeight
          lineas = candidateLines
          break
        }
      }

      const color = hexToRgb(w.color)
      lineas.forEach((linea, index) => {
        const textWidth = font.widthOfTextAtSize(linea, fittedFontSize)
        page.drawText(linea, {
          x: alinearTextoX(w.textAlign, w.x, w.width, textWidth),
          y: height - w.y - fittedFontSize - index * lineHeight,
          size: fittedFontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        })
      })

      if (w.textDecoration === 'underline') {
        page.drawLine({
          start: { x: w.x, y: height - w.y - fittedFontSize - 2 },
          end: { x: w.x + w.width, y: height - w.y - fittedFontSize - 2 },
          thickness: 1,
          color: rgb(color.r, color.g, color.b),
        })
      } else if (w.textDecoration === 'line-through') {
        page.drawLine({
          start: { x: w.x, y: height - w.y - fittedFontSize / 2 },
          end: { x: w.x + w.width, y: height - w.y - fittedFontSize / 2 },
          thickness: 1,
          color: rgb(color.r, color.g, color.b),
        })
      }
    } else {
      let imageEmbed
      if (valor.startsWith('data:image/png')) {
        imageEmbed = await pdfDoc.embedPng(base64AArrayBuffer(valor.split(',')[1] || valor))
      } else if (valor.startsWith('data:image/jpeg') || valor.startsWith('data:image/jpg')) {
        imageEmbed = await pdfDoc.embedJpg(base64AArrayBuffer(valor.split(',')[1] || valor))
      }
      if (imageEmbed) {
        page.drawImage(imageEmbed, {
          x: w.x,
          y: pdfY,
          width: w.width,
          height: w.height,
        })
      }
    }
  }

  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes], { type: 'application/pdf' })
}

// =====================================================
// PERSISTENCIA DE EDICIÓN
// =====================================================

const EDICION_KEY = 'formato-edicion-v1'

interface EdicionGuardada {
  fondoBase64: string
  fondoTipo: 'imagen' | 'pdf' | 'excel'
  fondoNombre: string
  fondoDimensiones: { ancho: number; alto: number }
  widgets: WidgetPosicionado[]
  zoom: number
  viewport: { x: number; y: number }
}

function guardarEdicionLocal(edicion: EdicionGuardada) {
  try {
    localStorage.setItem(EDICION_KEY, JSON.stringify(edicion))
  } catch (e) {
    console.warn('No se pudo guardar edicion en localStorage:', e)
  }
}

function cargarEdicionLocal(): EdicionGuardada | null {
  try {
    const raw = localStorage.getItem(EDICION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    console.warn('No se pudo cargar edicion de localStorage:', e)
    return null
  }
}

function eliminarEdicionLocal() {
  try {
    localStorage.removeItem(EDICION_KEY)
  } catch (e) {
    console.warn('No se pudo eliminar edicion de localStorage:', e)
  }
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export function ModuloMateriales() {
  const { state, setPlantillasPdfFormato } = useApp()
  const punto = state.puntoActivo

  const [plantillas, setPlantillas] = useState<PlantillaVisual[]>([])
  const [plantillaActiva, setPlantillaActiva] = useState<PlantillaVisual | null>(null)
  const [widgets, setWidgets] = useState<WidgetPosicionado[]>([])
  const [fondoBase64, setFondoBase64] = useState('')
  const [fondoTipo, setFondoTipo] = useState<'imagen' | 'pdf' | 'excel'>('imagen')
  const [fondoNombre, setFondoNombre] = useState('')
  const [fondoDimensiones, setFondoDimensiones] = useState({ ancho: 800, alto: 1120 })

  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const [redimensionando, setRedimensionando] = useState<{
    id: string
    handle: 'br' | 'bl' | 'tr' | 'tl'
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    tipo: 'texto' | 'imagen'
    ratio: number
  } | null>(null)
  const [offsetArrastre, setOffsetArrastre] = useState({ x: 0, y: 0 })
  const [widgetSeleccionado, setWidgetSeleccionado] = useState<string | null>(null)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [masPropiedades, setMasPropiedades] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [viewport, setViewport] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const [startPan, setStartPan] = useState({ x: 0, y: 0 })
  const [toolbarVisible, setToolbarVisible] = useState(true)
  const [camposPersonalizados, setCamposPersonalizados] = useState<Array<{ key: string; label: string; tipo: 'texto' | 'imagen' }>>([])
  const [busquedaPlantillas, setBusquedaPlantillas] = useState('')
  const [filtroPlantillaTipo, setFiltroPlantillaTipo] = useState<'todas' | 'imagen' | 'pdf' | 'excel'>('todas')
  const [posicionPanelPropiedades, setPosicionPanelPropiedades] = useState<{ x: number; y: number } | null>(null)
  const [arrastrandoPanelPropiedades, setArrastrandoPanelPropiedades] = useState(false)

  const areaRef = useRef<HTMLDivElement>(null)
  const padreRef = useRef<HTMLDivElement>(null)
  const panelPropiedadesRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const escalaRef = useRef(1)
  const panStartViewportRef = useRef({ x: 0, y: 0 })
  const huboPanRef = useRef(false)
  const panelDragRef = useRef({
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    startX: 0,
    startY: 0,
  })
  const touchGestureRef = useRef<{
    mode: 'pan' | 'pinch' | null
    startClientX: number
    startClientY: number
    startDistance: number
    startZoom: number
    startViewport: { x: number; y: number }
    startFocal: { x: number; y: number }
    startScale: number
  }>({
    mode: null,
    startClientX: 0,
    startClientY: 0,
    startDistance: 0,
    startZoom: 1,
    startViewport: { x: 0, y: 0 },
    startFocal: { x: 0, y: 0 },
    startScale: 1,
  })

  const calcularEscalaAjuste = useCallback(() => {
    const padre = padreRef.current
    if (!padre) return 1
    return Math.min(
      padre.clientWidth / fondoDimensiones.ancho,
      padre.clientHeight / fondoDimensiones.alto
    )
  }, [fondoDimensiones])

  const limitarViewport = useCallback((x: number, y: number, escalaActual: number) => {
    const padre = padreRef.current
    if (!padre) return { x, y }
    const padreW = padre.clientWidth
    const padreH = padre.clientHeight
    const contentW = fondoDimensiones.ancho * escalaActual
    const contentH = fondoDimensiones.alto * escalaActual

    if (contentW <= padreW && contentH <= padreH) {
      return {
        x: (padreW - contentW) / 2,
        y: (padreH - contentH) / 2,
      }
    }

    return {
      x: contentW <= padreW ? (padreW - contentW) / 2 : Math.min(0, Math.max(padreW - contentW, x)),
      y: contentH <= padreH ? (padreH - contentH) / 2 : Math.min(0, Math.max(padreH - contentH, y)),
    }
  }, [fondoDimensiones])

  const aplicarZoom = useCallback((nuevoZoom: number, focalX?: number, focalY?: number) => {
    const padre = padreRef.current
    if (!padre) {
      setZoom(nuevoZoom)
      return
    }
    const rect = padre.getBoundingClientRect()
    const escalaAjusteLocal = calcularEscalaAjuste()
    const nuevaEscala = escalaAjusteLocal * nuevoZoom
    const fx = focalX ?? rect.width / 2
    const fy = focalY ?? rect.height / 2
    const scaleFactor = nuevoZoom / zoom

    setViewport(prev => {
      const nextX = fx - (fx - prev.x) * scaleFactor
      const nextY = fy - (fy - prev.y) * scaleFactor
      return limitarViewport(nextX, nextY, nuevaEscala)
    })
    setZoom(nuevoZoom)
  }, [calcularEscalaAjuste, zoom, limitarViewport])

  // Restaurar edición guardada al montar
  useEffect(() => {
    const edicion = cargarEdicionLocal()
    if (!edicion) return
    setFondoBase64(edicion.fondoBase64)
    setFondoTipo(edicion.fondoTipo)
    setFondoNombre(edicion.fondoNombre)
    setFondoDimensiones(edicion.fondoDimensiones)
    setWidgets(edicion.widgets)
    setZoom(edicion.zoom)
    setViewport(edicion.viewport || { x: 0, y: 0 })
    setPlantillaActiva(null)
  }, [])

  // Cargar plantillas guardadas
  useEffect(() => {
    const visuales = (state.plantillasPdfFormato || []).map(p => {
      const raw = p as unknown as Record<string, unknown>
      if (raw.widgets && Array.isArray(raw.widgets)) {
        const archivoNombre = String(raw.archivoNombre || '')
        const archivoBase64 = String(raw.archivoBase64 || '')
        const tipoInferido = inferirTipoPlantilla(archivoNombre, archivoBase64)
        const visual = {
          ...raw,
          tipo: (raw.tipo as PlantillaVisual['tipo']) || tipoInferido,
        } as unknown as PlantillaVisual
        return visual
      }
      return null
    }).filter(Boolean) as PlantillaVisual[]

    setPlantillas(visuales)
  }, [state.plantillasPdfFormato])

  const plantillasFiltradas = useMemo(() => {
    const termino = normalizarTextoPlantilla(busquedaPlantillas)

    return plantillas
      .filter(plantilla => filtroPlantillaTipo === 'todas' || plantilla.tipo === filtroPlantillaTipo)
      .filter(plantilla => {
        if (!termino) return true
        const campos = plantilla.widgets.map(widget => `${widget.etiqueta} ${widget.campo}`).join(' ')
        const texto = normalizarTextoPlantilla([
          plantilla.nombre,
          plantilla.archivoNombre,
          plantilla.tipo,
          campos,
        ].join(' '))
        return texto.includes(termino)
      })
  }, [busquedaPlantillas, filtroPlantillaTipo, plantillas])

  const totalPlantillasImagen = useMemo(() => plantillas.filter(p => p.tipo === 'imagen').length, [plantillas])
  const totalPlantillasPdf = useMemo(() => plantillas.filter(p => p.tipo === 'pdf').length, [plantillas])
  const totalPlantillasExcel = useMemo(() => plantillas.filter(p => p.tipo === 'excel').length, [plantillas])

  // Guardar edición automáticamente
  useEffect(() => {
    if (!fondoBase64) return
    guardarEdicionLocal({
      fondoBase64,
      fondoTipo,
      fondoNombre,
      fondoDimensiones,
      widgets,
      zoom,
      viewport,
    })
  }, [fondoBase64, fondoTipo, fondoNombre, fondoDimensiones, widgets, zoom, viewport])

  // Centrar/limitar viewport cuando cambian dimensiones o tamaño del padre
  useEffect(() => {
    if (!fondoBase64 || !padreRef.current) return
    setViewport(prev => limitarViewport(prev.x, prev.y, escala))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fondoBase64, fondoDimensiones, toolbarVisible])

  // Guardar widgets en plantilla activa
  useEffect(() => {
    if (!plantillaActiva) return
    setPlantillaActiva(prev => prev ? { ...prev, widgets } : null)
  }, [widgets])

  // Eliminar widget seleccionado con la tecla Suprimir
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' || !widgetSeleccionado) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      eliminarWidget(widgetSeleccionado)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [widgetSeleccionado])

  const cargarFondo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    const mime = file.type
    const lowerName = file.name.toLowerCase()
    const esPdf = mime === 'application/pdf' || lowerName.endsWith('.pdf')
    const esExcel =
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel' ||
      /\.(xlsx|xls)$/.test(lowerName)

    if (esExcel) {
      try {
        const buffer = await file.arrayBuffer()
        const { dataUrl, width, height } = await excelFileToImage(buffer, {
          scale: 2,
          pageWidthPx: 1200,
        })
        setFondoTipo('excel')
        setFondoBase64(dataUrl)
        setFondoNombre(file.name)
        setFondoDimensiones({ ancho: width, alto: height })
        setWidgets([])
        setPlantillaActiva(null)
        setZoom(1)
        setViewport({ x: 0, y: 0 })
      } catch (err) {
        console.error('Error renderizando Excel:', err)
        alert('No se pudo renderizar el archivo Excel: ' + String(err))
      }
      return
    }

    if (esPdf) {
      const base64 = arrayBufferABase64(await file.arrayBuffer())
      setFondoTipo('pdf')
      setFondoBase64(base64)
      setFondoNombre(file.name)
      setFondoDimensiones({ ancho: 595, alto: 842 }) // A4 en puntos
      setWidgets([])
      setPlantillaActiva(null)
      setZoom(1)
      setViewport({ x: 0, y: 0 })
      return
    }

    if (!mime.startsWith('image/')) {
      alert('Solo se permiten archivos de imagen (JPG, PNG), PDF o Excel')
      return
    }

    const base64 = arrayBufferABase64(await file.arrayBuffer())
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = `data:${mime};base64,${base64}`
    })

    setFondoTipo('imagen')
    setFondoBase64(`data:${mime};base64,${base64}`)
    setFondoNombre(file.name)
    setFondoDimensiones({ ancho: img.naturalWidth, alto: img.naturalHeight })
    setWidgets([])
    setPlantillaActiva(null)
    setZoom(1)
    setViewport({ x: 0, y: 0 })
  }

  const agregarWidget = (campo: string, etiqueta: string, tipo: 'texto' | 'imagen') => {
    const id = crypto.randomUUID()
    const nuevo: WidgetPosicionado = {
      id,
      campo,
      etiqueta,
      tipo,
      x: 50 + (widgets.length * 20) % 200,
      y: 50 + (widgets.length * 20) % 200,
      fontSize: tipo === 'texto' ? TAMANO_TEXTO_PREDETERMINADO : 12,
      fontFamily: FUENTE_TEXTO_PREDETERMINADA,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'left',
      width: tipo === 'imagen' ? 160 : 180,
      height: tipo === 'imagen' ? 110 : 42,
      color: '#000000',
      backgroundColor: 'transparent',
    }
    setWidgets(prev => [...prev, nuevo])
    setWidgetSeleccionado(id)
    setPanelAbierto(true)
  }

  const crearCampoPersonalizado = (tipo: 'texto' | 'imagen') => {
    const nombre = window.prompt(`Nombre del nuevo campo de ${tipo}`)
    if (!nombre?.trim()) return
    const key = `custom_${tipo}_${Date.now()}`
    setCamposPersonalizados(prev => [...prev, { key, label: nombre.trim(), tipo }])
  }

  const actualizarWidget = useCallback((id: string, data: Partial<WidgetPosicionado>) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...data } : w))
  }, [])

  const eliminarWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id))
    if (widgetSeleccionado === id) setWidgetSeleccionado(null)
  }

  const limpiarTodo = () => {
    setFondoBase64('')
    setFondoNombre('')
    setWidgets([])
    setPlantillaActiva(null)
    setWidgetSeleccionado(null)
    setZoom(1)
    setViewport({ x: 0, y: 0 })
    eliminarEdicionLocal()
  }

  const guardarPlantilla = () => {
    if (!fondoBase64) {
      alert('Carga primero una imagen o PDF como fondo')
      return
    }

    const nombreSugerido = fondoNombre.replace(/\.(jpg|jpeg|png|pdf)$/i, '')
    const nombre = window.prompt('Nombre de la plantilla', nombreSugerido)?.trim()
    if (!nombre) return

    const plantilla: PlantillaVisual = {
      id: plantillaActiva?.id || crypto.randomUUID(),
      nombre,
      tipo: fondoTipo,
      archivoNombre: fondoNombre,
      archivoBase64: fondoBase64,
      widgets: [...widgets],
      ancho: fondoDimensiones.ancho,
      alto: fondoDimensiones.alto,
      createdAt: new Date().toISOString(),
    }

    const nuevas = [
      plantilla,
      ...plantillas.filter(p => p.id !== plantilla.id),
    ].slice(0, MAX_PLANTILLAS)

    setPlantillas(nuevas)
    setPlantillaActiva(plantilla)

    // Guardar en el estado global como plantillas PDF (reutilizamos el array)
    const plantillasPdf = nuevas.map(p => ({
      id: p.id,
      nombre: p.nombre,
      archivoNombre: p.archivoNombre,
      archivoBase64: p.archivoBase64,
      createdAt: p.createdAt,
      campos: p.widgets as unknown as Array<Record<string, unknown>>,
      widgets: p.widgets,
      tipo: p.tipo,
      ancho: p.ancho,
      alto: p.alto,
    })) as unknown as typeof state.plantillasPdfFormato

    setPlantillasPdfFormato(plantillasPdf)
    alert('Plantilla guardada')
  }

  const cargarPlantilla = (plantilla: PlantillaVisual) => {
    const ajustar = window.confirm(
      '¿Ajustar la plantilla al área de edición?\n\nAceptar = ajustar al área\nCancelar = mantener zoom actual'
    )
    const tipoEfectivo = plantilla.tipo || inferirTipoPlantilla(plantilla.archivoNombre, plantilla.archivoBase64)
    setPlantillaActiva(plantilla)
    setFondoTipo(tipoEfectivo)
    setFondoBase64(plantilla.archivoBase64)
    setFondoNombre(plantilla.archivoNombre)
    setFondoDimensiones({ ancho: plantilla.ancho, alto: plantilla.alto })
    setWidgets([...plantilla.widgets])
    setWidgetSeleccionado(null)
    if (ajustar) {
      setZoom(1)
      setViewport({ x: 0, y: 0 })
    }
  }

  const eliminarPlantilla = (id: string) => {
    const nuevas = plantillas.filter(p => p.id !== id)
    setPlantillas(nuevas)
    if (plantillaActiva?.id === id) {
      limpiarTodo()
    }

    const plantillasPdf = nuevas.map(p => ({
      id: p.id,
      nombre: p.nombre,
      archivoNombre: p.archivoNombre,
      archivoBase64: p.archivoBase64,
      createdAt: p.createdAt,
      campos: p.widgets as unknown as Array<Record<string, unknown>>,
      widgets: p.widgets,
      tipo: p.tipo,
      ancho: p.ancho,
      alto: p.alto,
    })) as unknown as typeof state.plantillasPdfFormato

    setPlantillasPdfFormato(plantillasPdf)
  }

  const exportar = async () => {
    if (!fondoBase64 || !punto) {
      alert('Carga un fondo y selecciona un punto para exportar')
      return
    }

    setExportando(true)
    try {
      let blob: Blob
      if (fondoTipo === 'pdf') {
        blob = await exportarConFondoPdf(fondoBase64, widgets, punto)
        descargarArchivo(blob, `${fondoNombre.replace(/\.pdf$/i, '')}-${punto.nombre}.pdf`)
      } else {
        blob = await exportarConFondoImagen(fondoBase64, widgets, punto)
        descargarArchivo(blob, `${fondoNombre.replace(/\.(jpg|jpeg|png|xlsx|xls)$/i, '')}-${punto.nombre}.png`)
      }
    } catch (err) {
      console.error('Error exportando:', err)
      alert('Error al exportar: ' + String(err))
    } finally {
      setExportando(false)
    }
  }

  // Drag / resize / pan handlers
  const handleMouseDown = (e: React.MouseEvent, id: string, modo: 'mover' | 'resize-br' | 'resize-bl' | 'resize-tr' | 'resize-tl' = 'mover') => {
    e.preventDefault()
    e.stopPropagation()
    const widget = widgets.find(w => w.id === id)
    if (!widget) return

    if (modo.startsWith('resize-')) {
      const handle = modo.replace('resize-', '') as 'br' | 'bl' | 'tr' | 'tl'
      setRedimensionando({
        id,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: widget.width,
        startHeight: widget.height,
        tipo: widget.tipo,
        ratio: widget.width / widget.height,
      })
      setWidgetSeleccionado(id)
      setPanelAbierto(true)
      return
    }

    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect) return

    setArrastrando(id)
    setWidgetSeleccionado(id)
    setPanelAbierto(true)
    setOffsetArrastre({
      x: e.clientX - rect.left - widget.x * escala,
      y: e.clientY - rect.top - widget.y * escala,
    })
  }

  const iniciarPan = (e: React.MouseEvent) => {
    if (arrastrando || redimensionando || panning) return
    e.preventDefault()
    huboPanRef.current = false
    setPanning(true)
    setStartPan({ x: e.clientX, y: e.clientY })
    panStartViewportRef.current = { ...viewport }
  }

  const handleAreaClick = () => {
    if (huboPanRef.current) {
      huboPanRef.current = false
      return
    }
    setWidgetSeleccionado(null)
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (!e.altKey) return
    e.preventDefault()
    const rect = padreRef.current?.getBoundingClientRect()
    if (!rect) return

    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const nuevoZoom = Math.max(0.25, Math.min(5, Number((zoom + delta).toFixed(2))))
    if (nuevoZoom === zoom) return

    aplicarZoom(nuevoZoom, e.clientX - rect.left, e.clientY - rect.top)
  }

  const obtenerDistanciaToque = (a: React.Touch, b: React.Touch) => {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  const obtenerCentroToque = (a: React.Touch, b: React.Touch) => {
    return {
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!fondoBase64 || !padreRef.current) return

    if (e.touches.length === 2) {
      e.preventDefault()
      const rect = padreRef.current.getBoundingClientRect()
      const centro = obtenerCentroToque(e.touches[0], e.touches[1])
      const escalaAjusteLocal = calcularEscalaAjuste()

      touchGestureRef.current = {
        mode: 'pinch',
        startClientX: 0,
        startClientY: 0,
        startDistance: obtenerDistanciaToque(e.touches[0], e.touches[1]),
        startZoom: zoom,
        startViewport: { ...viewport },
        startFocal: {
          x: centro.x - rect.left,
          y: centro.y - rect.top,
        },
        startScale: escalaAjusteLocal * zoom,
      }
      setPanning(false)
      return
    }

    if (e.touches.length === 1 && !arrastrando && !redimensionando) {
      e.preventDefault()
      huboPanRef.current = false
      touchGestureRef.current = {
        ...touchGestureRef.current,
        mode: 'pan',
        startClientX: e.touches[0].clientX,
        startClientY: e.touches[0].clientY,
        startViewport: { ...viewport },
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const gesto = touchGestureRef.current
    if (!padreRef.current || !fondoBase64) return

    if (gesto.mode === 'pinch' && e.touches.length === 2) {
      e.preventDefault()
      const rect = padreRef.current.getBoundingClientRect()
      const distancia = obtenerDistanciaToque(e.touches[0], e.touches[1])
      const centro = obtenerCentroToque(e.touches[0], e.touches[1])
      const nuevoZoom = Math.max(0.25, Math.min(5, Number((gesto.startZoom * (distancia / gesto.startDistance)).toFixed(2))))
      const nuevaEscala = (gesto.startScale / gesto.startZoom) * nuevoZoom

      const puntoContenidoX = (gesto.startFocal.x - gesto.startViewport.x) / gesto.startScale
      const puntoContenidoY = (gesto.startFocal.y - gesto.startViewport.y) / gesto.startScale
      const focalX = centro.x - rect.left
      const focalY = centro.y - rect.top

      setViewport(limitarViewport(
        focalX - puntoContenidoX * nuevaEscala,
        focalY - puntoContenidoY * nuevaEscala,
        nuevaEscala
      ))
      setZoom(nuevoZoom)
      return
    }

    if (gesto.mode === 'pan' && e.touches.length === 1) {
      e.preventDefault()
      const dx = e.touches[0].clientX - gesto.startClientX
      const dy = e.touches[0].clientY - gesto.startClientY
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) huboPanRef.current = true
      setViewport(limitarViewport(
        gesto.startViewport.x + dx,
        gesto.startViewport.y + dy,
        escalaRef.current
      ))
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      touchGestureRef.current.mode = null
      return
    }

    if (e.touches.length === 1) {
      touchGestureRef.current = {
        ...touchGestureRef.current,
        mode: 'pan',
        startClientX: e.touches[0].clientX,
        startClientY: e.touches[0].clientY,
        startViewport: { ...viewport },
      }
    }
  }

  const limitarPosicionPanel = useCallback((x: number, y: number) => {
    const padre = padreRef.current
    const panel = panelPropiedadesRef.current
    if (!padre || !panel) return { x, y }

    const padding = 8
    const maxX = Math.max(padding, padre.clientWidth - panel.offsetWidth - padding)
    const maxY = Math.max(padding, padre.clientHeight - panel.offsetHeight - padding)

    return {
      x: Math.min(maxX, Math.max(padding, x)),
      y: Math.min(maxY, Math.max(padding, y)),
    }
  }, [])

  const iniciarArrastrePanelPropiedades = (e: React.PointerEvent) => {
    if (!padreRef.current || !panelPropiedadesRef.current) return
    e.preventDefault()
    e.stopPropagation()

    const padreRect = padreRef.current.getBoundingClientRect()
    const panelRect = panelPropiedadesRef.current.getBoundingClientRect()
    const posicionActual = posicionPanelPropiedades || {
      x: panelRect.left - padreRect.left,
      y: panelRect.top - padreRect.top,
    }
    const posicionLimitada = limitarPosicionPanel(posicionActual.x, posicionActual.y)

    panelDragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: posicionLimitada.x,
      startY: posicionLimitada.y,
    }
    setPosicionPanelPropiedades(posicionLimitada)
    setArrastrandoPanelPropiedades(true)
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (panning) {
      const dx = e.clientX - startPan.x
      const dy = e.clientY - startPan.y
      huboPanRef.current = true
      setViewport(limitarViewport(
        panStartViewportRef.current.x + dx,
        panStartViewportRef.current.y + dy,
        escalaRef.current
      ))
      return
    }

    if (redimensionando) {
      const rawDeltaX = (e.clientX - redimensionando.startX) / escalaRef.current
      const rawDeltaY = (e.clientY - redimensionando.startY) / escalaRef.current

      const isRight = redimensionando.handle === 'br' || redimensionando.handle === 'tr'
      const isBottom = redimensionando.handle === 'br' || redimensionando.handle === 'bl'

      // Mantener proporción sin deformar: elegir el delta dominante
      const deltaW = isRight ? rawDeltaX : -rawDeltaX
      const deltaH = isBottom ? rawDeltaY : -rawDeltaY
      const widget = widgets.find(w => w.id === redimensionando.id)
      if (!widget) return

      if (redimensionando.tipo === 'texto') {
        const candidateW = Math.max(30, redimensionando.startWidth + deltaW)
        const candidateH = Math.max(18, redimensionando.startHeight + deltaH)
        const updates: Partial<WidgetPosicionado> = { width: candidateW, height: candidateH }
        if (!isRight) updates.x = widget.x + widget.width - candidateW
        if (!isBottom) updates.y = widget.y + widget.height - candidateH
        actualizarWidget(redimensionando.id, updates)
        return
      }

      const useWidth = Math.abs(deltaW) >= Math.abs(deltaH * redimensionando.ratio)
      const candidateW = useWidth
        ? Math.max(20, redimensionando.startWidth + deltaW)
        : Math.max(20, redimensionando.startWidth + deltaH * redimensionando.ratio)
      const candidateH = candidateW / redimensionando.ratio

      const updates: Partial<WidgetPosicionado> = { width: candidateW, height: candidateH }
      if (!isRight) updates.x = widget.x + widget.width - candidateW
      if (!isBottom) updates.y = widget.y + widget.height - candidateH
      actualizarWidget(redimensionando.id, updates)
      return
    }

    if (!arrastrando || !areaRef.current) return
    const rect = areaRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - offsetArrastre.x
    const y = e.clientY - rect.top - offsetArrastre.y
    actualizarWidget(arrastrando, { x: Math.max(0, x) / escalaRef.current, y: Math.max(0, y) / escalaRef.current })
  }, [arrastrando, offsetArrastre, actualizarWidget, redimensionando, panning, startPan, limitarViewport])

  const handleMouseUp = useCallback(() => {
    setArrastrando(null)
    setRedimensionando(null)
    setPanning(false)
  }, [])

  const handlePanelPointerMove = useCallback((e: PointerEvent) => {
    if (!arrastrandoPanelPropiedades || e.pointerId !== panelDragRef.current.pointerId) return
    const dx = e.clientX - panelDragRef.current.startClientX
    const dy = e.clientY - panelDragRef.current.startClientY
    setPosicionPanelPropiedades(limitarPosicionPanel(
      panelDragRef.current.startX + dx,
      panelDragRef.current.startY + dy
    ))
  }, [arrastrandoPanelPropiedades, limitarPosicionPanel])

  const handlePanelPointerUp = useCallback((e: PointerEvent) => {
    if (e.pointerId !== panelDragRef.current.pointerId) return
    setArrastrandoPanelPropiedades(false)
    panelDragRef.current.pointerId = -1
  }, [])

  useEffect(() => {
    if (arrastrando || redimensionando || panning) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [arrastrando, redimensionando, panning, handleMouseMove, handleMouseUp])

  useEffect(() => {
    if (!arrastrandoPanelPropiedades) return
    window.addEventListener('pointermove', handlePanelPointerMove)
    window.addEventListener('pointerup', handlePanelPointerUp)
    window.addEventListener('pointercancel', handlePanelPointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePanelPointerMove)
      window.removeEventListener('pointerup', handlePanelPointerUp)
      window.removeEventListener('pointercancel', handlePanelPointerUp)
    }
  }, [arrastrandoPanelPropiedades, handlePanelPointerMove, handlePanelPointerUp])

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <MousePointer2 className="mb-3 h-12 w-12 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Selecciona un punto para editar el formato</p>
        </CardContent>
      </Card>
    )
  }

  const escalaAjuste = calcularEscalaAjuste()
  const escala = escalaAjuste * zoom
  escalaRef.current = escala

  return (
    <div className="flex h-[calc(100vh-200px)] gap-3">
      {/* Toolbar lateral */}
      <Card className={`flex shrink-0 flex-col transition-all duration-200 ${toolbarVisible ? 'w-[240px]' : 'w-11'}`}>
        <CardHeader className={`flex flex-row items-center pb-2 ${toolbarVisible ? 'justify-between' : 'justify-center'}`}>
          {toolbarVisible && <CardTitle className="text-sm">Barra de herramientas</CardTitle>}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setToolbarVisible(v => !v)} title={toolbarVisible ? 'Ocultar barra' : 'Mostrar barra'}>
            {toolbarVisible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
        </CardHeader>
        {toolbarVisible && (
          <CardContent className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={cargarFondo} />
            <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Cargar fondo
            </Button>

          {fondoBase64 && (
            <>
              <Button variant="outline" size="sm" className="w-full" onClick={guardarPlantilla}>
                <Save className="mr-2 h-4 w-4" />
                Guardar plantilla
              </Button>
              <Button size="sm" className="w-full" onClick={exportar} disabled={exportando}>
                <Download className="mr-2 h-4 w-4" />
                {exportando ? 'Exportando...' : 'Exportar'}
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={limpiarTodo}>
                <Trash2 className="mr-2 h-4 w-4" />
                Limpiar
              </Button>

              <div className="flex items-center gap-1 rounded border p-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => aplicarZoom(Math.max(0.25, Number((zoom - 0.1).toFixed(2))))}>
                  <ZoomOut className="h-3 w-3" />
                </Button>
                <span className="flex-1 text-center text-xs font-medium">{Math.round(zoom * 100)}%</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => aplicarZoom(Math.min(5, Number((zoom + 0.1).toFixed(2))))}>
                  <ZoomIn className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => aplicarZoom(1)} title="Restablecer zoom">
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </div>
            </>
          )}

          <div className="border-t pt-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Campos de texto</p>
            <ScrollArea className="h-[200px]">
              <div className="grid grid-cols-1 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 justify-start text-xs text-muted-foreground"
                  onClick={() => crearCampoPersonalizado('texto')}
                  disabled={!fondoBase64}
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Crear campo
                </Button>
                {CAMPOS_TEXTO.map(c => (
                  <Button
                    key={c.key}
                    variant="ghost"
                    size="sm"
                    className="h-7 justify-start text-xs"
                    onClick={() => agregarWidget(c.key, c.label, 'texto')}
                    disabled={!fondoBase64}
                  >
                    <Type className="mr-2 h-3 w-3" />
                    {c.label}
                  </Button>
                ))}
                {camposPersonalizados.filter(c => c.tipo === 'texto').map(c => (
                  <Button
                    key={c.key}
                    variant="ghost"
                    size="sm"
                    className="h-7 justify-start text-xs italic"
                    onClick={() => agregarWidget(c.key, c.label, 'texto')}
                    disabled={!fondoBase64}
                  >
                    <Type className="mr-2 h-3 w-3" />
                    {c.label}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="border-t pt-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Campos de imagen</p>
            <div className="grid grid-cols-1 gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 justify-start text-xs text-muted-foreground"
                onClick={() => crearCampoPersonalizado('imagen')}
                disabled={!fondoBase64}
              >
                <Plus className="mr-2 h-3 w-3" />
                Crear campo
              </Button>
              {CAMPOS_IMAGEN.map(c => (
                <Button
                  key={c.key}
                  variant="ghost"
                  size="sm"
                  className="h-7 justify-start text-xs"
                  onClick={() => agregarWidget(c.key, c.label, 'imagen')}
                  disabled={!fondoBase64}
                >
                  <ImagePlus className="mr-2 h-3 w-3" />
                  {c.label}
                </Button>
              ))}
              {camposPersonalizados.filter(c => c.tipo === 'imagen').map(c => (
                <Button
                  key={c.key}
                  variant="ghost"
                  size="sm"
                  className="h-7 justify-start text-xs italic"
                  onClick={() => agregarWidget(c.key, c.label, 'imagen')}
                  disabled={!fondoBase64}
                >
                  <ImagePlus className="mr-2 h-3 w-3" />
                  {c.label}
                </Button>
              ))}
            </div>
          </div>

          {plantillas.length > 0 && (
            <div className="border-t pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">Plantillas guardadas</p>
                </div>
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {plantillas.length}/{MAX_PLANTILLAS}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busquedaPlantillas}
                    onChange={e => setBusquedaPlantillas(e.target.value)}
                    placeholder="Buscar por nombre, archivo o campo"
                    className="h-8 pl-7 text-xs"
                  />
                </div>

                <div className="grid grid-cols-4 gap-1 rounded-md border bg-muted/30 p-1">
                  {([
                    { key: 'todas', label: 'Todas', total: plantillas.length },
                    { key: 'imagen', label: 'Imagen', total: totalPlantillasImagen },
                    { key: 'pdf', label: 'PDF', total: totalPlantillasPdf },
                    { key: 'excel', label: 'Excel', total: totalPlantillasExcel },
                  ] as const).map(opcion => (
                    <Button
                      key={opcion.key}
                      variant={filtroPlantillaTipo === opcion.key ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 px-1 text-[11px]"
                      onClick={() => setFiltroPlantillaTipo(opcion.key)}
                    >
                      {opcion.label}
                      <span className="ml-1 text-[10px] text-muted-foreground">{opcion.total}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <ScrollArea className="mt-2 max-h-[285px] pr-2">
                {plantillasFiltradas.length > 0 ? (
                  <div className="space-y-2">
                    {plantillasFiltradas.map(p => {
                      const activa = plantillaActiva?.id === p.id
                      const IconoTipo =
                        p.tipo === 'pdf' ? FileText :
                        p.tipo === 'excel' ? FileSpreadsheet :
                        FileImage

                      return (
                        <div
                          key={p.id}
                          className={`overflow-hidden rounded-md border bg-background transition-colors ${
                            activa ? 'border-primary ring-1 ring-primary/40' : 'hover:border-primary/50'
                          }`}
                        >
                          <button
                            type="button"
                            className="flex w-full gap-2 p-2 text-left"
                            onClick={() => cargarPlantilla(p)}
                            title={`Cargar ${p.nombre}`}
                          >
                            <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded border bg-muted">
                              {p.tipo === 'pdf' ? (
                                <iframe
                                  src={crearSrcPdfVista(p.archivoBase64)}
                                  title={p.nombre}
                                  className="pointer-events-none h-full w-full border-0 bg-white"
                                />
                              ) : (
                                <img
                                  src={p.archivoBase64}
                                  alt={p.nombre}
                                  className="h-full w-full object-cover"
                                  draggable={false}
                                />
                              )}
                              <div className="absolute left-1 top-1 rounded bg-background/90 p-0.5 shadow-sm">
                                <IconoTipo className="h-3 w-3 text-muted-foreground" />
                              </div>
                            </div>

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="line-clamp-2 text-xs font-medium leading-snug">{p.nombre || 'Plantilla sin nombre'}</p>
                                {activa && <Badge className="px-1.5 py-0 text-[10px]">Activa</Badge>}
                              </div>
                              <p className="truncate text-[11px] text-muted-foreground">{p.archivoNombre || 'Archivo no disponible'}</p>
                              <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                                <span>{obtenerResumenPlantilla(p)}</span>
                                <span>({p.ancho}x{p.alto})</span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>{formatearFechaPlantilla(p.createdAt)}</span>
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center justify-between border-t bg-muted/20 px-2 py-1">
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase">
                              {p.tipo}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                              onClick={() => eliminarPlantilla(p.id)}
                            >
                              <X className="mr-1 h-3 w-3" />
                              Eliminar
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-3 text-center">
                    <Search className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-medium">Sin coincidencias</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Prueba otro nombre, archivo o tipo de plantilla.</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
          </CardContent>
        )}
      </Card>

      {/* Área de edición */}
      <Card className="relative flex-1 overflow-hidden border-0 bg-transparent shadow-none">
        <CardContent
          ref={padreRef}
          className="relative h-full w-full overflow-hidden p-0"
          style={{ touchAction: 'none' }}
          onWheel={handleWheel}
          onMouseDown={e => {
            if (e.target === e.currentTarget) iniciarPan(e)
          }}
          onClick={e => {
            if (e.target === e.currentTarget) handleAreaClick()
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {/* Botones flotantes estáticos */}
          <div className="absolute right-2 top-2 z-30 flex items-center gap-1">
            {fondoBase64 && (
              <div className="flex items-center gap-1 rounded-md border bg-background/90 p-1 shadow-sm backdrop-blur">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => aplicarZoom(Math.max(0.25, Number((zoom - 0.1).toFixed(2))))}
                  title="Alejar lienzo"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="min-w-10 text-center text-xs font-medium">{Math.round(zoom * 100)}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => aplicarZoom(Math.min(5, Number((zoom + 0.1).toFixed(2))))}
                  title="Acercar lienzo"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => aplicarZoom(1)}
                  title="Restablecer zoom del lienzo"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 shadow-sm"
              onClick={() => setToolbarVisible(v => !v)}
              title={toolbarVisible ? 'Ocultar barra' : 'Mostrar barra'}
            >
              {toolbarVisible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
          </div>

          {!fondoBase64 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <MousePointer2 className="mb-3 h-12 w-12 opacity-30" />
              <p className="text-sm">Carga una imagen o PDF como fondo para comenzar</p>
              <p className="mt-1 text-xs">Usa el boton "Cargar fondo" en la barra lateral</p>
            </div>
          ) : (
            <>
              {/* Lienzo virtual: tamaño real, escalado con CSS */}
              <div
                ref={areaRef}
                className={`origin-top-left overflow-hidden bg-white ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: fondoDimensiones.ancho,
                  height: fondoDimensiones.alto,
                  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${escala})`,
                }}
                onMouseDown={iniciarPan}
                onClick={handleAreaClick}
              >
                {/* Fondo */}
                {fondoTipo === 'pdf' ? (
                  <iframe
                    src={crearSrcPdfVista(fondoBase64)}
                    title={fondoNombre}
                    className="pointer-events-none absolute left-0 top-0 h-full w-full border-0"
                  />
                ) : (
                  <img
                    src={fondoBase64}
                    alt="Fondo"
                    className="pointer-events-none absolute left-0 top-0 h-full w-full object-contain"
                    draggable={false}
                  />
                )}

                {/* Widgets */}
                {widgets.map(w => {
                  const seleccionado = widgetSeleccionado === w.id
                  const valorTexto = w.tipo === 'texto' ? extraerValor(punto, w.campo) : ''
                  return (
                    <div
                      key={w.id}
                      className={`absolute cursor-move select-none overflow-hidden rounded border px-2 py-1 text-xs font-medium ${
                        seleccionado
                          ? 'border-primary bg-primary/20 text-primary shadow-[0_0_0_2px_hsl(var(--primary))]'
                          : 'border-blue-300 bg-blue-50/80 text-blue-800 hover:bg-blue-100'
                      } ${w.tipo === 'imagen' ? 'border-dashed border-orange-300 bg-orange-50/80 text-orange-800' : ''}`}
                      style={{
                        left: w.x,
                        top: w.y,
                        width: w.width,
                        height: w.height,
                        fontSize: w.tipo === 'texto' ? w.fontSize : undefined,
                        fontFamily: w.tipo === 'texto' ? w.fontFamily : undefined,
                        fontWeight: w.tipo === 'texto' ? w.fontWeight : undefined,
                        fontStyle: w.tipo === 'texto' ? w.fontStyle : undefined,
                        textDecoration: w.tipo === 'texto' ? w.textDecoration : undefined,
                        textAlign: w.tipo === 'texto' ? w.textAlign : undefined,
                        color: w.tipo === 'texto' ? w.color : undefined,
                        backgroundColor: w.tipo === 'texto' ? w.backgroundColor : undefined,
                      }}
                      onMouseDown={e => handleMouseDown(e, w.id)}
                      onClick={e => e.stopPropagation()}
                      title={`${w.etiqueta} (${Math.round(w.x)}, ${Math.round(w.y)})`}
                    >
                      {w.tipo === 'texto' ? (
                        <span
                          className="block h-full w-full overflow-hidden whitespace-pre-wrap break-words leading-[1.2]"
                          title={valorTexto || w.etiqueta}
                        >
                          {valorTexto || w.etiqueta}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <ImagePlus className="h-3 w-3" />
                          <span>{w.etiqueta}</span>
                        </div>
                      )}
                      {seleccionado && (
                        <>
                          <div
                            className="absolute -bottom-1 -right-1 z-10 h-3 w-3 cursor-se-resize rounded-full border border-white bg-primary shadow"
                            onMouseDown={e => handleMouseDown(e, w.id, 'resize-br')}
                            title="Redimensionar"
                          />
                          <div
                            className="absolute -bottom-1 -left-1 z-10 h-3 w-3 cursor-sw-resize rounded-full border border-white bg-primary shadow"
                            onMouseDown={e => handleMouseDown(e, w.id, 'resize-bl')}
                            title="Redimensionar"
                          />
                          <div
                            className="absolute -top-1 -right-1 z-10 h-3 w-3 cursor-ne-resize rounded-full border border-white bg-primary shadow"
                            onMouseDown={e => handleMouseDown(e, w.id, 'resize-tr')}
                            title="Redimensionar"
                          />
                          <div
                            className="absolute -top-1 -left-1 z-10 h-3 w-3 cursor-nw-resize rounded-full border border-white bg-primary shadow"
                            onMouseDown={e => handleMouseDown(e, w.id, 'resize-tl')}
                            title="Redimensionar"
                          />
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Panel flotante de propiedades */}
              {panelAbierto && (
                <div
                  ref={panelPropiedadesRef}
                  className={`absolute z-30 w-60 rounded-lg border bg-background/90 p-2 shadow-lg backdrop-blur ${
                    posicionPanelPropiedades ? '' : 'bottom-4 right-4'
                  } ${arrastrandoPanelPropiedades ? 'select-none ring-1 ring-primary/40' : ''}`}
                  style={posicionPanelPropiedades ? {
                    left: posicionPanelPropiedades.x,
                    top: posicionPanelPropiedades.y,
                  } : undefined}
                >
                  {(() => {
                    const w = widgetSeleccionado ? widgets.find(x => x.id === widgetSeleccionado) : null
                    if (!w) {
                      return (
                        <div
                          className="flex cursor-move touch-none items-center justify-between rounded px-1 py-0.5"
                          onPointerDown={iniciarArrastrePanelPropiedades}
                          title="Arrastrar panel de propiedades"
                        >
                          <p className="text-xs text-muted-foreground">Selecciona un elemento.</p>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setPanelAbierto(false)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )
                    }
                    return (
                      <div className="space-y-2">
                        {/* Header compacto */}
                        <div className="flex items-center justify-between">
                          <p className="max-w-[140px] truncate text-xs font-semibold">{w.etiqueta}</p>
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => setMasPropiedades(v => !v)}
                              title="Más propiedades"
                            >
                              <Settings2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() => setPanelAbierto(false)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Tamaño: ancho/alto */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">W</span>
                          <input
                            type="number"
                            value={Math.round(w.width)}
                            min={20}
                            max={2000}
                            className="h-6 w-16 rounded border bg-background/80 px-1 text-[10px]"
                            onChange={e => {
                              const newWidth = Number(e.target.value)
                              const updates: Partial<WidgetPosicionado> = { width: newWidth }
                              if (w.tipo === 'imagen') {
                                const ratio = w.width / w.height
                                updates.height = newWidth / ratio
                              }
                              actualizarWidget(w.id, updates)
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">H</span>
                          <input
                            type="number"
                            value={Math.round(w.height)}
                            min={20}
                            max={2000}
                            className="h-6 w-16 rounded border bg-background/80 px-1 text-[10px]"
                            onChange={e => {
                              const newHeight = Number(e.target.value)
                              const updates: Partial<WidgetPosicionado> = { height: newHeight }
                              if (w.tipo === 'imagen') {
                                const ratio = w.width / w.height
                                updates.width = newHeight * ratio
                              }
                              actualizarWidget(w.id, updates)
                            }}
                          />
                        </div>

                        {w.tipo === 'texto' && (
                          <>
                            {/* Fuente y tamaño */}
                            <div className="flex items-center gap-1">
                              <select
                                value={w.fontFamily}
                                className="h-6 flex-1 rounded border bg-background/80 px-1 text-[10px]"
                                onChange={e => actualizarWidget(w.id, { fontFamily: e.target.value })}
                              >
                                <option value="Arial">Arial</option>
                                <option value="Helvetica">Helvetica</option>
                                <option value="Times New Roman">Times</option>
                                <option value="Courier New">Courier</option>
                              </select>
                              <input
                                type="number"
                                value={w.fontSize}
                                min={6}
                                max={120}
                                className="h-6 w-12 rounded border bg-background/80 px-1 text-[10px]"
                                onChange={e => actualizarWidget(w.id, { fontSize: Number(e.target.value) })}
                              />
                            </div>

                            {/* Barra de formato */}
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant={w.fontWeight === 'bold' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => actualizarWidget(w.id, { fontWeight: w.fontWeight === 'bold' ? 'normal' : 'bold' })}
                              >
                                <Bold className="h-3 w-3" />
                              </Button>
                              <Button
                                variant={w.fontStyle === 'italic' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => actualizarWidget(w.id, { fontStyle: w.fontStyle === 'italic' ? 'normal' : 'italic' })}
                              >
                                <Italic className="h-3 w-3" />
                              </Button>
                              <Button
                                variant={w.textDecoration === 'underline' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => actualizarWidget(w.id, { textDecoration: w.textDecoration === 'underline' ? 'none' : 'underline' })}
                              >
                                <Underline className="h-3 w-3" />
                              </Button>
                              <Button
                                variant={w.textDecoration === 'line-through' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => actualizarWidget(w.id, { textDecoration: w.textDecoration === 'line-through' ? 'none' : 'line-through' })}
                              >
                                <Strikethrough className="h-3 w-3" />
                              </Button>
                            </div>

                            {/* Alineación */}
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant={w.textAlign === 'left' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => actualizarWidget(w.id, { textAlign: 'left' })}
                              >
                                <AlignLeft className="h-3 w-3" />
                              </Button>
                              <Button
                                variant={w.textAlign === 'center' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => actualizarWidget(w.id, { textAlign: 'center' })}
                              >
                                <AlignCenter className="h-3 w-3" />
                              </Button>
                              <Button
                                variant={w.textAlign === 'right' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => actualizarWidget(w.id, { textAlign: 'right' })}
                              >
                                <AlignRight className="h-3 w-3" />
                              </Button>
                            </div>

                            {/* Más propiedades */}
                            {masPropiedades && (
                              <div className="space-y-2 rounded border p-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground">Color texto</span>
                                  <div className="flex items-center gap-1">
                                    <Palette className="h-3 w-3 text-muted-foreground" />
                                    <input
                                      type="color"
                                      value={w.color}
                                      className="h-5 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                                      onChange={e => actualizarWidget(w.id, { color: e.target.value })}
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground">Fondo</span>
                                  <div className="flex items-center gap-1">
                                    <Paintbrush className="h-3 w-3 text-muted-foreground" />
                                    <input
                                      type="color"
                                      value={w.backgroundColor === 'transparent' ? '#ffffff' : w.backgroundColor}
                                      className="h-5 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                                      onChange={e => actualizarWidget(w.id, { backgroundColor: e.target.value })}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1 text-[10px]"
                                      onClick={() => actualizarWidget(w.id, { backgroundColor: 'transparent' })}
                                    >
                                      Limpiar
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        <Button variant="destructive" size="sm" className="h-7 w-full text-xs" onClick={() => eliminarWidget(w.id)}>
                          <Trash2 className="mr-2 h-3 w-3" />
                          Eliminar
                        </Button>
                      </div>
                    )
                  })()}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
