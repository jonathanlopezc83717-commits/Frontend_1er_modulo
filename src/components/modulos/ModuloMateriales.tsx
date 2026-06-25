import { useApp } from '@/context/AppContext'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import {
  Eraser,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  MapPin,
  RefreshCw,
  Save,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

// =====================================================
// TIPOS
// =====================================================

/** Datos del módulo Formato almacenados en punto.moduloData.materiales */
export interface FichaFormatoData {
  /** Valores indexados por coordenada fila-columna, ej. "0-F", "1-B". */
  valores: Record<string, string>
  /** Imágenes indexadas por clave: "croquis", "evid-0", "evid-1", "evid-2". */
  imagenes: Record<string, string>
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

const EVIDENCIAS = [
  { key: 'evid-0', label: 'Foto 1' },
  { key: 'evid-1', label: 'Foto 2' },
  { key: 'evid-2', label: 'Foto 3' },
]

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

export function exportarPdfFicha(
  valores: Record<string, string>,
  imagenes: Record<string, string>,
  nombreArchivo = 'Ficha_LMT-T11-02',
) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const d = valores

  const ML = 8
  const MT = 8
  const PW = 210 - ML * 2
  const PH = 297 - MT * 2

  // 6 columnas (total 194mm)
  const C = [30, 24, 28, 24, 40, 48]
  const CX: number[] = [ML]
  for (let i = 1; i <= 6; i++) CX.push(CX[i - 1] + C[i - 1])

  // Alturas de fila
  const Htitle = 11
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

    if (opts.vcenter) {
      const lineH = fs * 0.3528
      const totalH = lines.length * lineH
      const startY = yy + h / 2 - totalH / 2 + lineH
      doc.text(lines, x + px, startY, { align })
    } else {
      doc.text(lines, x + px, yy + (opts.py || 2.5), { align })
    }
  }

  // 1. Título (fondo negro, texto blanco centrado)
  cell(ML, Ytitle, PW, Htitle, [26, 26, 26])
  txt('FICHA DE IDENTIFICACIÓN DE INFRAESTRUCTURA EXISTENTE', ML, Ytitle, PW, {
    fs: 11, bold: true, color: [255, 255, 255], align: 'center', vcenter: true, py: 0, h: Htitle,
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
      doc.addImage(imagenes.croquis, formatoImagen(imagenes.croquis), ML + 1.5, YcrVal + 1.5, crW - 3, HcrVal - 3)
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

  // 9. Evidencia — 3 slots
  const evSlotW = PW / 3
  for (let i = 0; i < 3; i++) {
    const ex = ML + i * evSlotW
    cell(ex, YevVal, evSlotW, HevVal)
    const imgKey = `evid-${i}`
    if (imagenes[imgKey]) {
      try {
        doc.addImage(imagenes[imgKey], formatoImagen(imagenes[imgKey]), ex + 1.5, YevVal + 1.5, evSlotW - 3, HevVal - 3)
      } catch {
        doc.setFontSize(7)
        doc.setTextColor(190, 190, 190)
        doc.text(`[Foto ${i + 1}]`, ex + evSlotW / 2 - 8, YevVal + HevVal / 2)
        doc.setTextColor(0, 0, 0)
      }
    } else {
      doc.setFontSize(7)
      doc.setTextColor(190, 190, 190)
      doc.text(`[Foto ${i + 1}]`, ex + evSlotW / 2 - 8, YevVal + HevVal / 2)
      doc.setTextColor(0, 0, 0)
    }
    if (i < 2) {
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.4)
      doc.line(ex + evSlotW, YevVal, ex + evSlotW, YevVal + HevVal)
    }
  }

  doc.save(`${nombreArchivo}.pdf`)
}

// =====================================================
// EXPORTACIÓN EXCEL (XLSX/SheetJS) — réplica del HTML
// =====================================================

export function exportarExcelFicha(
  valores: Record<string, string>,
  imagenes: Record<string, string>,
  nombreArchivo = 'Ficha_LMT-T11-02',
) {
  const d = valores
  const ws: Record<string, unknown> = {}
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 11, c: 5 } })

  const sc = (r: number, c: number, v: string, b?: boolean) => {
    const ref = XLSX.utils.encode_cell({ r, c })
    ws[ref] = { v: v || '', t: 's', s: b ? { font: { bold: true } } : {} }
  }

  sc(0, 0, 'FICHA DE IDENTIFICACIÓN DE INFRAESTRUCTURA EXISTENTE', true)
  sc(1, 0, 'Tren de Pasajeros Saltillo - Nuevo Laredo Segmentos 16 y 17')
  sc(1, 4, 'Clave:', true)
  sc(1, 5, d['0-F'] || '')

  const rows = [
    [['Fecha:', true], ['1-B', false], ['Segmento:', true], ['1-D', false], ['Tramo:', true], ['1-F', false]],
    [['Servicio:', true], ['2-B', false], ['Infraestructura:', true], ['2-D', false], ['Altura:', true], ['2-F', false]],
    [['Tensión:', true], ['3-B', false], ['Tipo de instalación:', true], ['3-D', false], ['Ubicación respecto al eje de proyecto:', true], ['3-F', false]],
    [['Elementos afectos:', true], ['4-B', false], ['Número de Fases:', true], ['4-D', false], ['Número de hilos:', true], ['4-F', false]],
    [['Cadenamiento inicio:', true], ['5-B', false], ['Cadenamiento fin:', true], ['5-D', false], ['Estado físico:', true], ['5-F', false]],
    [['Coordenada "X":', true], ['6-B', false], ['Coordenada "Y":', true], ['6-D', false], ['Operador:', true], ['6-F', false]],
  ]
  rows.forEach((row, ri) => {
    row.forEach((cellData, ci) => {
      const [refOrLabel, isLabel] = cellData as [string, boolean]
      const val = isLabel ? refOrLabel : (d[refOrLabel] || '')
      sc(ri + 2, ci, val, isLabel)
    })
  })

  sc(8, 0, 'Estado actual y descripción del estado del elemento. Lado Izquierdo', true)
  sc(8, 3, 'Lado derecho', true)
  sc(9, 0, d['7-D'] || '')
  sc(9, 3, d['7-F'] || '')
  sc(10, 0, 'CROQUIS DE LOCALIZACIÓN:', true)
  sc(10, 3, 'Observaciones:', true)
  sc(11, 0, imagenes.croquis ? '[Ver croquis adjunto]' : '')
  sc(11, 3, d['8-F'] || '')

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 2 } },
    { s: { r: 8, c: 3 }, e: { r: 8, c: 5 } },
    { s: { r: 9, c: 0 }, e: { r: 9, c: 2 } },
    { s: { r: 9, c: 3 }, e: { r: 9, c: 5 } },
    { s: { r: 10, c: 0 }, e: { r: 10, c: 2 } },
    { s: { r: 10, c: 3 }, e: { r: 10, c: 5 } },
    { s: { r: 11, c: 0 }, e: { r: 11, c: 2 } },
    { s: { r: 11, c: 3 }, e: { r: 11, c: 5 } },
  ]
  ws['!cols'] = [{ wch: 34 }, { wch: 22 }, { wch: 28 }, { wch: 22 }, { wch: 36 }, { wch: 30 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'LMT-T11-02')
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  descargarArchivo(
    new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
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
  const [imagenes, setImagenes] = useState<Record<string, string>>({})
  const [coordActiva, setCoordActiva] = useState<string | null>(null)
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const [exportandoExcel, setExportandoExcel] = useState(false)

  useEffect(() => {
    const data = punto?.moduloData?.materiales as FichaFormatoData | undefined
    setValores(data?.valores || {})
    setImagenes(data?.imagenes || {})
  }, [punto?.id])

  const camposLlenos = useMemo(
    () => Object.values(valores).filter(v => v && v.trim()).length,
    [valores],
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
          updatedAt: new Date().toISOString(),
        },
      },
    })
    toast.success('Ficha guardada')
  }

  const handleExportarPdf = async () => {
    setExportandoPdf(true)
    try {
      exportarPdfFicha(valores, imagenes, `Ficha_LMT-T11-02-${punto?.nombre || 'punto'}`)
      toast.success('PDF exportado')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error PDF:', err)
      toast.error('Error al exportar PDF: ' + String(err))
    } finally {
      setExportandoPdf(false)
    }
  }

  const handleExportarExcel = async () => {
    setExportandoExcel(true)
    try {
      exportarExcelFicha(valores, imagenes, `Ficha_LMT-T11-02-${punto?.nombre || 'punto'}`)
      toast.success('Excel exportado')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error Excel:', err)
      toast.error('Error al exportar Excel: ' + String(err))
    } finally {
      setExportandoExcel(false)
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
                <Button variant="outline" size="sm" onClick={autocompletarDesdeModulos}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Autocompletar
                </Button>
                <Button variant="outline" size="sm" onClick={limpiarFicha}>
                  <Eraser className="mr-2 h-4 w-4" />
                  Limpiar
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportarExcel} disabled={exportandoExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
                  {exportandoExcel ? 'Exportando...' : 'Excel'}
                </Button>
                <Button size="sm" onClick={handleExportarPdf} disabled={exportandoPdf}>
                  <FileText className="mr-2 h-4 w-4" />
                  {exportandoPdf ? 'Exportando...' : 'PDF'}
                </Button>
                <Button size="sm" onClick={guardar}>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Título + clave */}
            <div className="rounded-lg border">
              <div className="border-b bg-neutral-900 p-3">
                <Input
                  value="FICHA DE IDENTIFICACIÓN DE INFRAESTRUCTURA EXISTENTE"
                  readOnly
                  className="border-0 bg-transparent px-0 text-center font-semibold text-white"
                />
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
                  {fila.map(({ etiqueta, coord }) => (
                    <div key={coord} className="space-y-1">
                      <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                        <span>{etiqueta}</span>
                        <span className="font-mono text-[10px] text-emerald-600">{coord}</span>
                      </label>
                      <CoordInput
                        coord={coord}
                        value={valores[coord] || ''}
                        onChange={v => actualizarValor(coord, v)}
                        onFocus={setCoordActiva}
                        placeholder={etiqueta}
                      />
                    </div>
                  ))}
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
                <label className="text-xs font-medium text-muted-foreground">
                  Croquis de localización <span className="font-mono text-[10px] text-emerald-600">img-croquis</span>
                </label>
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
                <CardTitle className="text-base">Evidencia fotográfica</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-3">
                  {EVIDENCIAS.map(({ key, label }) => (
                    <EvidenciaSlot
                      key={key}
                      label={label}
                      coordBadge={`img-${key}`}
                      image={imagenes[key] || ''}
                      onUpload={file => cargarImagen(key, file)}
                      onClear={() => limpiarImagen(key)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Mapa de coordenadas (referencia) */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-500" />
                  <CardTitle className="text-sm">Mapa de coordenadas</CardTitle>
                </div>
              </CardHeader>
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
                        <td className="p-2"><code className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600">img-evid-0/1/2</code></td>
                        <td className="p-2">Evidencia fotográfica</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
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
