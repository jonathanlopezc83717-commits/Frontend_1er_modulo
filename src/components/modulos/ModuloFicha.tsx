import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { PlantillaFormato, PlantillaCampoFormato, PlantillaImagenFormato } from '@/types'
import { Download, FileSpreadsheet, ImagePlus, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

interface CampoFicha {
  etiqueta: string
  valor: string
}

interface FichaFormato {
  titulo: string
  proyecto: string
  clave: string
  datos: CampoFicha[]
  descripcionIzquierda: string
  descripcionDerecha: string
  croquis: string
  observaciones: string
  evidencias: string[]
}

interface MapeoPlantilla {
  campos: Record<string, PlantillaCampoFormato>
  imagenes: Record<string, PlantillaImagenFormato>
}

const CAMPOS_DATOS = [
  'Fecha',
  'Segmento',
  'Tramo',
  'Servicio',
  'Infraestructura',
  'Altura',
  'Tension',
  'Tipo de instalacion',
  'Ubicacion respecto al eje de proyecto',
  'Elementos afectos',
  'Numero de Fases',
  'Numero de hilos',
  'Cadenamiento inicio',
  'Cadenamiento fin',
  'Estado fisico',
  'Coordenada "X"',
  'Coordenada "Y"',
  'Coordenada "Z"',
  'Operador',
]

const MAX_PLANTILLAS_FICHA = 8

// Campos de la ficha con autocompletado: lo escrito se guarda en localStorage
// para volver a elegirlo despues (globales por etiqueta, reutilizables entre puntos).
const CAMPOS_CON_OPCIONES = new Set([
  'Tipo de instalacion',
  'Ubicacion respecto al eje de proyecto',
  'Estado fisico',
])

const ALIAS_CAMPOS: Record<string, string> = {
  titulo: 'titulo',
  proyecto: 'proyecto',
  clave: 'clave',
  fecha: 'fecha',
  segmento: 'segmento',
  tramo: 'tramo',
  servicio: 'servicio',
  infraestructura: 'infraestructura',
  altura: 'altura',
  tension: 'tension',
  tipo_instalacion: 'tipo_instalacion',
  ubicacion: 'ubicacion',
  ubicacion_respecto_al_eje_de_proyecto: 'ubicacion',
  elementos_afectos: 'elementos_afectos',
  numero_fases: 'numero_fases',
  numero_de_fases: 'numero_fases',
  numero_hilos: 'numero_hilos',
  numero_de_hilos: 'numero_hilos',
  cadenamiento_inicio: 'cadenamiento_inicio',
  cadenamiento_fin: 'cadenamiento_fin',
  estado_fisico: 'estado_fisico',
  coordenada_x: 'coordenada_x',
  coordenada_y: 'coordenada_y',
  coordenada_z: 'coordenada_z',
  operador: 'operador',
  descripcion_izquierda: 'descripcion_izquierda',
  estado_actual_izquierdo: 'descripcion_izquierda',
  descripcion_derecha: 'descripcion_derecha',
  estado_actual_derecho: 'descripcion_derecha',
  observaciones: 'observaciones',
  croquis: 'croquis',
  croquis_de_localizacion: 'croquis',
  evidencia_1: 'evidencia_1',
  evidencia_2: 'evidencia_2',
  evidencia_3: 'evidencia_3',
  evidencia_4: 'evidencia_4',
}

const ETIQUETAS_A_CAMPO: Record<string, string> = {
  fecha: 'fecha',
  segmento: 'segmento',
  tramo: 'tramo',
  servicio: 'servicio',
  infraestructura: 'infraestructura',
  altura: 'altura',
  tension: 'tension',
  tipo_de_instalacion: 'tipo_instalacion',
  tipo_instalacion: 'tipo_instalacion',
  ubicacion_respecto_al_eje_de_proyecto: 'ubicacion',
  elementos_afectos: 'elementos_afectos',
  numero_de_fases: 'numero_fases',
  numero_fases: 'numero_fases',
  numero_de_hilos: 'numero_hilos',
  numero_hilos: 'numero_hilos',
  cadenamiento_inicio: 'cadenamiento_inicio',
  cadenamiento_fin: 'cadenamiento_fin',
  estado_fisico: 'estado_fisico',
  coordenada_x: 'coordenada_x',
  coordenada_y: 'coordenada_y',
  coordenada_z: 'coordenada_z',
  operador: 'operador',
}

const IMAGENES_PREDETERMINADAS: Record<string, PlantillaImagenFormato> = {
  croquis: { sheet: '', cell: 'A10', range: 'A10:C10' },
  evidencia_1: { sheet: '', cell: 'd', range: 'A11:C11' },
  evidencia_2: { sheet: '', cell: 'A12', range: 'A12:C12' },
  evidencia_3: { sheet: '', cell: 'D11', range: 'D11:F11' },
  evidencia_4: { sheet: '', cell: 'D12', range: 'D12:F12' },
}

function crearFichaVacia(): FichaFormato {
  return {
    titulo: 'FICHA DE IDENTIFICACION DE INFRAESTRUCTURA EXISTENTE',
    proyecto: '',
    clave: '',
    datos: CAMPOS_DATOS.map(etiqueta => ({ etiqueta, valor: '' })),
    descripcionIzquierda: '',
    descripcionDerecha: '',
    croquis: '',
    observaciones: '',
    evidencias: ['', '', '', ''],
  }
}

function normalizarTexto(valor: unknown): string {
  return String(valor ?? '').replace(/\r\n/g, '\n').trim()
}

function normalizarClave(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function limpiarEtiqueta(valor: string): string {
  return valor.replace(/:$/g, '').trim()
}

function indiceColumnaALetra(index: number): string {
  let value = index + 1
  let result = ''

  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }

  return result
}

function celda(rowIndex: number, colIndex: number): string {
  return `${indiceColumnaALetra(colIndex)}${rowIndex + 1}`
}

function rangoImagenDesdeCelda(cell: string): string {
  const match = cell.match(/^([A-Z]+)(\d+)$/)
  if (!match) return `${cell}:${cell}`

  const col = match[1].split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1
  const row = Number(match[2])
  const endCol = indiceColumnaALetra(col + 2)
  return `${cell}:${endCol}${row + 1}`
}

function arrayBufferABase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

function base64AArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes.buffer
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

function obtenerValoresFicha(ficha: FichaFormato): Record<string, string> {
  const valores: Record<string, string> = {
    titulo: ficha.titulo,
    proyecto: ficha.proyecto,
    clave: ficha.clave,
    descripcion_izquierda: ficha.descripcionIzquierda,
    descripcion_derecha: ficha.descripcionDerecha,
    observaciones: ficha.observaciones,
  }

  for (const campo of ficha.datos) {
    const key = ETIQUETAS_A_CAMPO[normalizarClave(campo.etiqueta)] || normalizarClave(campo.etiqueta)
    valores[key] = campo.valor
  }

  return valores
}

function obtenerImagenesFicha(ficha: FichaFormato): Record<string, string> {
  return {
    croquis: ficha.croquis,
    evidencia_1: ficha.evidencias[0] || '',
    evidencia_2: ficha.evidencias[1] || '',
    evidencia_3: ficha.evidencias[2] || '',
    evidencia_4: ficha.evidencias[3] || '',
  }
}

function obtenerCamposPlantilla(plantilla: PlantillaFormato): Record<string, PlantillaCampoFormato> {
  return plantilla.campos && typeof plantilla.campos === 'object' ? plantilla.campos : {}
}

function obtenerImagenesPlantilla(plantilla: PlantillaFormato): Record<string, PlantillaImagenFormato> {
  return plantilla.imagenes && typeof plantilla.imagenes === 'object' ? plantilla.imagenes : {}
}

function detectarMapeo(rows: unknown[][], sheetName: string): MapeoPlantilla {
  const mapeo: MapeoPlantilla = { campos: {}, imagenes: {} }

  rows.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const texto = normalizarTexto(value)
      if (!texto) return

      for (const match of texto.matchAll(/{{\s*([a-zA-Z0-9_\- ]+)\s*}}/g)) {
        const key = ALIAS_CAMPOS[normalizarClave(match[1])] || normalizarClave(match[1])
        const cell = celda(rowIndex, colIndex)

        if (key === 'croquis' || key.startsWith('evidencia_')) {
          mapeo.imagenes[key] = { sheet: sheetName, cell, range: rangoImagenDesdeCelda(cell) }
        } else {
          mapeo.campos[key] = { sheet: sheetName, cell }
        }
      }

      const etiqueta = texto.split('\n')[0].replace(/:$/g, '')
      const keyEtiqueta = ETIQUETAS_A_CAMPO[normalizarClave(etiqueta)]
      if (keyEtiqueta && !mapeo.campos[keyEtiqueta]) {
        mapeo.campos[keyEtiqueta] = { sheet: sheetName, cell: celda(rowIndex, Math.min(colIndex + 1, 5)) }
      }
    })
  })

  mapeo.campos.titulo ||= { sheet: sheetName, cell: 'A1' }
  mapeo.campos.proyecto ||= { sheet: sheetName, cell: 'A2' }
  mapeo.campos.clave ||= { sheet: sheetName, cell: 'F2' }
  mapeo.campos.descripcion_izquierda ||= { sheet: sheetName, cell: 'A9' }
  mapeo.campos.descripcion_derecha ||= { sheet: sheetName, cell: 'D9' }
  mapeo.campos.observaciones ||= { sheet: sheetName, cell: 'D10' }

  for (const [key, imagen] of Object.entries(IMAGENES_PREDETERMINADAS)) {
    mapeo.imagenes[key] ||= { ...imagen, sheet: sheetName }
  }

  return mapeo
}

function normalizarFicha(valor: unknown): FichaFormato {
  const base = crearFichaVacia()
  if (!valor || typeof valor !== 'object') return base

  const ficha = valor as Partial<FichaFormato>
  return {
    titulo: typeof ficha.titulo === 'string' ? ficha.titulo : base.titulo,
    proyecto: typeof ficha.proyecto === 'string' ? ficha.proyecto : base.proyecto,
    clave: typeof ficha.clave === 'string' ? ficha.clave : base.clave,
    datos: base.datos.map((campo, index) => {
      const item = ficha.datos?.[index]
      return {
        etiqueta: typeof item?.etiqueta === 'string' ? item.etiqueta : campo.etiqueta,
        valor: typeof item?.valor === 'string' ? item.valor : '',
      }
    }),
    descripcionIzquierda: typeof ficha.descripcionIzquierda === 'string' ? ficha.descripcionIzquierda : '',
    descripcionDerecha: typeof ficha.descripcionDerecha === 'string' ? ficha.descripcionDerecha : '',
    croquis: typeof ficha.croquis === 'string' ? ficha.croquis : '',
    observaciones: typeof ficha.observaciones === 'string' ? ficha.observaciones : '',
    evidencias: [0, 1, 2, 3].map(index =>
      typeof ficha.evidencias?.[index] === 'string' ? ficha.evidencias[index] : ''
    ),
  }
}

function asignarCampo(datos: CampoFicha[], etiqueta: string, valor: unknown) {
  const etiquetaNormalizada = limpiarEtiqueta(etiqueta).toLowerCase()
  const campo = datos.find(item => item.etiqueta.toLowerCase() === etiquetaNormalizada)
  if (campo) campo.valor = normalizarTexto(valor)
}

function extraerNombreCarpeta(ruta?: string): string {
  return (ruta || '').split(/[\\/]/).filter(Boolean).pop() || ruta || ''
}

function extraerFechaDeCarpeta(nombreCarpeta: string): string {
  const match = nombreCarpeta.match(/(\d{2})_(\d{2})_(\d{4})/)
  if (!match) return ''
  return `${match[1]}/${match[2]}/${match[3]}`
}

function extraerOperadorDeCarpeta(nombreCarpeta: string): string {
  return nombreCarpeta.replace(/\s*\d{2}_\d{2}_\d{4}.*$/, '').trim()
}

function extraerDescripcionAnalisis(analisis: unknown): string {
  if (!analisis || typeof analisis !== 'object') return ''
  const data = analisis as {
    descripcionGeneral?: string
    results?: Array<{ description?: string }>
  }
  return data.descripcionGeneral || data.results?.[0]?.description || ''
}

function extraerEvidenciasAnalisis(analisis: unknown): string[] {
  if (!analisis || typeof analisis !== 'object') return ['', '', '', '']
  const data = analisis as {
    imageUrls?: string[]
    fotosIndexadas?: Array<{ preview?: string }>
  }
  const imagenes = [
    ...(data.imageUrls || []),
    ...((data.fotosIndexadas || []).map(foto => foto.preview || '')),
  ].filter(Boolean)

  return [0, 1, 2, 3].map(index => imagenes[index] || '')
}

async function leerImagen(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function convertirImagenADataUrl(image: string): Promise<string> {
  if (!image || image.startsWith('data:image')) return image

  try {
    const response = await fetch(image)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.warn('No se pudo preparar la imagen para Excel:', error)
    return ''
  }
}

async function extraerImagenesExcel(file: File): Promise<Record<string, string>> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const drawing = zip.file('xl/drawings/drawing1.xml')
  const relsFile = zip.file('xl/drawings/_rels/drawing1.xml.rels')
  if (!drawing || !relsFile) return {}

  const [drawingXml, relsXml] = await Promise.all([drawing.async('text'), relsFile.async('text')])
  const rels = new Map<string, string>()

  for (const match of relsXml.matchAll(/Id="([^"]+)".*?Target="\.\.\/media\/([^"]+)"/g)) {
    rels.set(match[1], `xl/media/${match[2]}`)
  }

  const imagenes: Record<string, string> = {}
  const anchors = [...drawingXml.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)[\s\S]*?<\/xdr:\1>/g)]

  for (const anchor of anchors) {
    const xml = anchor[0]
    const from = xml.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<\/xdr:from>/)
    const rel = xml.match(/r:embed="([^"]+)"/)
    if (!from || !rel) continue

    const mediaPath = rels.get(rel[1])
    const media = mediaPath ? zip.file(mediaPath) : null
    if (!media) continue

    const extension = mediaPath?.split('.').pop()?.toLowerCase()
    const mime = extension === 'png' ? 'image/png' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'image/*'
    const base64 = await media.async('base64')
    imagenes[`${Number(from[1])}:${Number(from[2])}`] = `data:${mime};base64,${base64}`
  }

  return imagenes
}

export function ModuloFicha() {
  const { state, actualizarPunto, setPlantillasFicha } = useApp()
  const punto = state.puntoActivo
  const [ficha, setFicha] = useState<FichaFormato>(crearFichaVacia)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [archivoPlantillaBase64, setArchivoPlantillaBase64] = useState('')
  const [mapeoPlantilla, setMapeoPlantilla] = useState<MapeoPlantilla>({ campos: {}, imagenes: {} })
  const [exportandoId, setExportandoId] = useState<string | null>(null)
  const excelInputRef = useRef<HTMLInputElement>(null)

  // Opciones guardadas para los campos con autocompletado.
  const [opcionesGuardadas, setOpcionesGuardadas] = useState<Record<string, string[]>>({})

  useEffect(() => {
    const cargadas: Record<string, string[]> = {}
    for (const etiqueta of CAMPOS_CON_OPCIONES) {
      try {
        const raw = localStorage.getItem(`ficha-opciones:${etiqueta}`)
        cargadas[etiqueta] = raw ? (JSON.parse(raw) as string[]) : []
      } catch {
        cargadas[etiqueta] = []
      }
    }
    setOpcionesGuardadas(cargadas)
  }, [])

  // Al salir del campo, si hay texto, lo agrega al historial de opciones (dedup sin distincion de mayusculas).
  const registrarOpcion = (etiqueta: string, valor: string) => {
    const valorLimpio = valor.trim()
    if (!valorLimpio) return
    setOpcionesGuardadas(prev => {
      const actuales = prev[etiqueta] || []
      if (actuales.some(op => op.toLowerCase() === valorLimpio.toLowerCase())) return prev
      const nuevas = [...actuales, valorLimpio]
      try {
        localStorage.setItem(`ficha-opciones:${etiqueta}`, JSON.stringify(nuevas))
      } catch {
        // ponytail: cuota de localStorage agotada, se ignora
      }
      return { ...prev, [etiqueta]: nuevas }
    })
  }

  const camposLlenos = useMemo(
    () => ficha.datos.filter(campo => campo.valor.trim()).length,
    [ficha.datos]
  )

  const completarDesdeModulos = (baseFicha: FichaFormato, sobrescribir = false): FichaFormato => {
    if (!punto) return baseFicha

    const nombreCarpeta = extraerNombreCarpeta(punto.carpetaPath || punto.nombre)
    const fecha = extraerFechaDeCarpeta(nombreCarpeta)
    const operador = extraerOperadorDeCarpeta(nombreCarpeta)
    const geoData = punto.moduloData?.georeferencia || punto.moduloData?.georeferenciacion
    const coordenadas = geoData?.coordenadas
    const observaciones = extraerDescripcionAnalisis(punto.moduloData?.analisis)
    const evidencias = extraerEvidenciasAnalisis(punto.moduloData?.analisis)

    const datos = baseFicha.datos.map(campo => {
      if (!sobrescribir && campo.valor.trim()) return campo

      switch (campo.etiqueta) {
        case 'Fecha':
          return { ...campo, valor: fecha }
        case 'Coordenada "X"':
          return { ...campo, valor: coordenadas?.x !== undefined ? String(coordenadas.x) : '' }
        case 'Coordenada "Y"':
          return { ...campo, valor: coordenadas?.y !== undefined ? String(coordenadas.y) : '' }
        case 'Coordenada "Z"':
          return { ...campo, valor: coordenadas?.z !== undefined ? String(coordenadas.z) : '' }
        case 'Operador':
          return { ...campo, valor: operador }
        default:
          return campo
      }
    })

    return {
      ...baseFicha,
      datos,
      observaciones: !sobrescribir && baseFicha.observaciones.trim() ? baseFicha.observaciones : observaciones,
      evidencias: baseFicha.evidencias.map((image, index) =>
        !sobrescribir && image ? image : evidencias[index] || image || ''
      ),
    }
  }

  useEffect(() => {
    const data = punto?.moduloData?.ficha as {
      ficha?: FichaFormato
      nombreArchivo?: string
    } | undefined

    setFicha(completarDesdeModulos(normalizarFicha(data?.ficha)))
    setNombreArchivo(data?.nombreArchivo || '')
    // ponytail: depender de punto?.id, no del objeto punto entero.
    // El reducer ACTUALIZAR_PUNTO crea una nueva ref de puntoActivo en cada update,
    // lo que re-disparaba este reset y pisaba los edits locales sin guardar.
  }, [punto?.id])

  const actualizarFicha = (data: Partial<FichaFormato>) => {
    setFicha(prev => ({ ...prev, ...data }))
  }

  const actualizarDato = (index: number, valor: string) => {
    setFicha(prev => ({
      ...prev,
      datos: prev.datos.map((campo, itemIndex) =>
        itemIndex === index ? { ...campo, valor } : campo
      ),
    }))
  }

  const actualizarDesdeModulos = () => {
    setFicha(prev => completarDesdeModulos(prev, true))
  }

  const cargarExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const buffer = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'array' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' })
    const nuevaFicha = crearFichaVacia()
    const sheetName = workbook.SheetNames[0]

    nuevaFicha.titulo = normalizarTexto(rows[0]?.[0]) || nuevaFicha.titulo
    nuevaFicha.proyecto = normalizarTexto(rows[1]?.[0])
    nuevaFicha.clave = normalizarTexto(rows[1]?.[5] || rows[1]?.[4]).replace(/^Clave:\s*/i, '')

    for (let rowIndex = 2; rowIndex <= 7; rowIndex++) {
      const row = rows[rowIndex] || []
      asignarCampo(nuevaFicha.datos, normalizarTexto(row[0]), row[1])
      asignarCampo(nuevaFicha.datos, normalizarTexto(row[2]), row[3])
      asignarCampo(nuevaFicha.datos, normalizarTexto(row[4]), row[5])
    }

    nuevaFicha.descripcionIzquierda = normalizarTexto(rows[8]?.[0]).replace(/^Estado actual.*?\n/i, '').trim()
    nuevaFicha.descripcionDerecha = normalizarTexto(rows[8]?.[3])
    nuevaFicha.observaciones = normalizarTexto(rows[9]?.[3]).replace(/^Observaciones:\s*/i, '').trim()

    try {
      const imagenes = await extraerImagenesExcel(file)
      nuevaFicha.croquis = imagenes['0:9'] || imagenes['0:10'] || ''
      nuevaFicha.evidencias = [
        imagenes['0:10'] || '',
        imagenes['0:11'] || '',
        imagenes['3:10'] || '',
        imagenes['3:11'] || '',
      ]
    } catch (error) {
      console.warn('No se pudieron extraer imagenes del Excel:', error)
    }

    setFicha(nuevaFicha)
    setNombreArchivo(file.name)
    setArchivoPlantillaBase64(arrayBufferABase64(buffer))
    setMapeoPlantilla(detectarMapeo(rows, sheetName))
    event.target.value = ''
  }

  const guardarComoPlantilla = () => {
    if (!archivoPlantillaBase64 || !nombreArchivo) {
      alert('Carga primero un archivo Excel para guardarlo como plantilla')
      return
    }

    const nombreSugerido = nombreArchivo.replace(/\.(xlsx|xls)$/i, '')
    const nombre = window.prompt('Nombre de la plantilla', nombreSugerido)?.trim()
    if (!nombre) return

    const plantilla: PlantillaFormato = {
      id: crypto.randomUUID(),
      nombre,
      archivoNombre: nombreArchivo,
      archivoBase64: archivoPlantillaBase64,
      createdAt: new Date().toISOString(),
      campos: mapeoPlantilla.campos,
      imagenes: mapeoPlantilla.imagenes,
    }

    const plantillas = [
      plantilla,
      ...state.plantillasFicha.filter(item => item.nombre.toLowerCase() !== nombre.toLowerCase()),
    ].slice(0, MAX_PLANTILLAS_FICHA)

    setPlantillasFicha(plantillas)
    alert('Plantilla guardada')
  }

  const eliminarPlantilla = (id: string) => {
    setPlantillasFicha(state.plantillasFicha.filter(plantilla => plantilla.id !== id))
  }

  const exportarPlantilla = async (plantilla: PlantillaFormato) => {
    if (!plantilla.archivoBase64) {
      alert('Esta plantilla no tiene el archivo Excel disponible. Vuelve a cargarla y guardarla como plantilla.')
      return
    }

    setExportandoId(plantilla.id)
    try {
      const ExcelJSModule = await import('exceljs')
      const ExcelJS = ((ExcelJSModule as unknown as { default?: unknown }).default || ExcelJSModule) as typeof ExcelJSModule
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(base64AArrayBuffer(plantilla.archivoBase64))
      const valores = obtenerValoresFicha(ficha)
      const imagenes = obtenerImagenesFicha(ficha)
      const camposPlantilla = obtenerCamposPlantilla(plantilla)
      const imagenesPlantilla = obtenerImagenesPlantilla(plantilla)

      for (const [key, destino] of Object.entries(camposPlantilla)) {
        const worksheet = workbook.getWorksheet(destino.sheet)
        if (!worksheet) continue
        const valor = valores[key] ?? ''
        worksheet.getCell(destino.cell).value = valor
      }

      for (const [key, destino] of Object.entries(imagenesPlantilla)) {
        const image = await convertirImagenADataUrl(imagenes[key])
        const worksheet = workbook.getWorksheet(destino.sheet)
        if (!image || !worksheet) continue

        const extension = image.startsWith('data:image/png') ? 'png' : 'jpeg'
        const imageId = workbook.addImage({ base64: image, extension })
        worksheet.getCell(destino.cell).value = null
        worksheet.addImage(imageId, destino.range)
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const nombreSeguro = `${plantilla.nombre || 'ficha'}-${punto?.nombre || 'punto'}`.replace(/[\\/:*?"<>|]+/g, '-')
      descargarArchivo(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${nombreSeguro}.xlsx`
      )
    } catch (error) {
      console.error('Error exportando plantilla:', error)
      alert(`No se pudo exportar la plantilla: ${String(error)}`)
    } finally {
      setExportandoId(null)
    }
  }

  const cargarImagen = async (tipo: 'croquis' | 'evidencia', file?: File, index = 0) => {
    if (!file) return
    const preview = await leerImagen(file)

    if (tipo === 'croquis') {
      actualizarFicha({ croquis: preview })
      return
    }

    setFicha(prev => ({
      ...prev,
      evidencias: prev.evidencias.map((item, itemIndex) => (itemIndex === index ? preview : item)),
    }))
  }

  const limpiarImagen = (tipo: 'croquis' | 'evidencia', index = 0) => {
    if (tipo === 'croquis') {
      actualizarFicha({ croquis: '' })
      return
    }

    setFicha(prev => ({
      ...prev,
      evidencias: prev.evidencias.map((item, itemIndex) => (itemIndex === index ? '' : item)),
    }))
  }

  const handleGuardar = () => {
    if (!punto) return

    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        ficha: {
          ficha,
          nombreArchivo,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    alert('Ficha guardada')
  }

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileSpreadsheet className="mb-3 h-12 w-12 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Selecciona un punto para editar la ficha</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-4 pr-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <span className="text-sm font-bold text-primary-foreground">{punto.numeroSerie}</span>
              </div>
              <p className="font-medium">{punto.nombre}</p>
            </div>
            <Badge variant="secondary">{camposLlenos} campos</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <CardTitle>Ficha</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {nombreArchivo && <Badge variant="outline">{nombreArchivo}</Badge>}
                <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={cargarExcel} />
                <Button variant="outline" size="sm" onClick={() => excelInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Cargar Excel
                </Button>
                <Button variant="outline" size="sm" onClick={actualizarDesdeModulos}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Actualizar desde módulos
                </Button>
                <Button variant="outline" size="sm" onClick={guardarComoPlantilla} disabled={!archivoPlantillaBase64}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Guardar plantilla
                </Button>
                <Button size="sm" onClick={handleGuardar}>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border">
              <div className="border-b bg-muted/60 p-3">
                <Input value={ficha.titulo} onChange={(event) => actualizarFicha({ titulo: event.target.value })} className="px-0 py-0 text-center font-semibold" />
              </div>
              <div className="grid gap-2 p-3 md:grid-cols-[1fr_220px]">
                <Input value={ficha.proyecto} onChange={(event) => actualizarFicha({ proyecto: event.target.value })} placeholder="Proyecto" className="px-0 py-0" />
                <Input value={ficha.clave} onChange={(event) => actualizarFicha({ clave: event.target.value })} placeholder="Clave" className="px-0 py-0" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {ficha.datos.map((campo, index) => {
                const esCombo = CAMPOS_CON_OPCIONES.has(campo.etiqueta)
                const listId = `ficha-opciones-${index}`
                return (
                  <div key={campo.etiqueta} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{campo.etiqueta}</label>
                    <Input
                      value={campo.valor}
                      onChange={(event) => actualizarDato(index, event.target.value)}
                      onBlur={esCombo ? (event) => registrarOpcion(campo.etiqueta, event.target.value) : undefined}
                      list={esCombo ? listId : undefined}
                      className="px-0 py-0"
                    />
                    {esCombo && (
                      <datalist id={listId}>
                        {(opcionesGuardadas[campo.etiqueta] || []).map(op => (
                          <option key={op} value={op} />
                        ))}
                      </datalist>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Estado actual - Lado izquierdo</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={ficha.descripcionIzquierda} onChange={(event) => actualizarFicha({ descripcionIzquierda: event.target.value })} rows={8} className="px-0 py-0" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Estado actual - Lado derecho</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={ficha.descripcionDerecha} onChange={(event) => actualizarFicha({ descripcionDerecha: event.target.value })} rows={8} className="px-0 py-0" />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ImageSlot title="Croquis de localizacion" image={ficha.croquis} onImage={(file) => cargarImagen('croquis', file)} onClear={() => limpiarImagen('croquis')} />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Observaciones</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={ficha.observaciones} onChange={(event) => actualizarFicha({ observaciones: event.target.value })} rows={10} className="px-0 py-0" />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evidencia fotografica</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {ficha.evidencias.map((image, index) => (
                    <ImageSlot
                      key={index}
                      title={`Evidencia ${index + 1}`}
                      image={image}
                      onImage={(file) => cargarImagen('evidencia', file, index)}
                      onClear={() => limpiarImagen('evidencia', index)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Plantillas guardadas</CardTitle>
                  <Badge variant="secondary">{state.plantillasFicha.length}/{MAX_PLANTILLAS_FICHA}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {state.plantillasFicha.length > 0 ? (
                  <div className="space-y-2">
                    {state.plantillasFicha.map((plantilla) => {
                      const camposPlantilla = obtenerCamposPlantilla(plantilla)
                      const imagenesPlantilla = obtenerImagenesPlantilla(plantilla)

                      return (
                        <div key={plantilla.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{plantilla.nombre || 'Plantilla sin nombre'}</p>
                            <p className="text-xs text-muted-foreground">
                              {plantilla.archivoNombre || 'Archivo no disponible'} - {Object.keys(camposPlantilla).length} campos - {Object.keys(imagenesPlantilla).length} imagenes
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => exportarPlantilla(plantilla)}
                              disabled={exportandoId === plantilla.id || !plantilla.archivoBase64}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              {exportandoId === plantilla.id ? 'Exportando' : 'Exportar'}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => eliminarPlantilla(plantilla.id)} aria-label="Eliminar plantilla">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Carga un Excel y guardalo como plantilla para exportar esta ficha.
                  </p>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}

function ImageSlot({
  title,
  image,
  onImage,
  onClear,
}: {
  title: string
  image: string
  onImage: (file?: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActivo, setDragActivo] = useState(false)

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActivo(false)

    const file = Array.from(event.dataTransfer.files).find(item => item.type.startsWith('image/'))
    if (file) onImage(file)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => onImage(event.target.files?.[0])} />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="mr-2 h-4 w-4" />
            Imagen
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {image ? (
          <div
            className={`relative overflow-hidden rounded-lg border bg-muted/30 ${dragActivo ? 'ring-2 ring-primary' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActivo(true)
            }}
            onDragLeave={() => setDragActivo(false)}
            onDrop={handleDrop}
          >
            <img src={image} alt={title} className="h-[260px] w-full object-contain" />
            <Button variant="destructive" size="icon" className="absolute right-2 top-2 h-8 w-8" onClick={onClear}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div
            className={`flex h-[260px] items-center justify-center rounded-lg border border-dashed bg-muted/20 text-sm text-muted-foreground transition-colors ${
              dragActivo ? 'border-primary bg-primary/10 text-primary' : ''
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActivo(true)
            }}
            onDragLeave={() => setDragActivo(false)}
            onDrop={handleDrop}
          >
            Arrastra una imagen aqui o usa el boton Imagen
          </div>
        )}
      </CardContent>
    </Card>
  )
}

