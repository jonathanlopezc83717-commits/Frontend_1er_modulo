import type { PlantillaFormato, PlantillaCampoFormato, PlantillaImagenFormato } from '@/types'

export interface CampoFicha {
  etiqueta: string
  valor: string
}

export interface FichaFormato {
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

export interface MapeoPlantilla {
  campos: Record<string, PlantillaCampoFormato>
  imagenes: Record<string, PlantillaImagenFormato>
}

export const CAMPOS_DATOS = [
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

export const ALIAS_CAMPOS: Record<string, string> = {
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

export const ETIQUETAS_A_CAMPO: Record<string, string> = {
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

export const IMAGENES_PREDETERMINADAS: Record<string, PlantillaImagenFormato> = {
  croquis: { sheet: '', cell: 'A10', range: 'A10:C10' },
  evidencia_1: { sheet: '', cell: 'd', range: 'A11:C11' },
  evidencia_2: { sheet: '', cell: 'A12', range: 'A12:C12' },
  evidencia_3: { sheet: '', cell: 'D11', range: 'D11:F11' },
  evidencia_4: { sheet: '', cell: 'D12', range: 'D12:F12' },
}

export function crearFichaVacia(): FichaFormato {
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

export function normalizarTexto(valor: unknown): string {
  return String(valor ?? '').replace(/\r\n/g, '\n').trim()
}

export function normalizarClave(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function limpiarEtiqueta(valor: string): string {
  return valor.replace(/:$/g, '').trim()
}

export function indiceColumnaALetra(index: number): string {
  let value = index + 1
  let result = ''

  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }

  return result
}

export function celda(rowIndex: number, colIndex: number): string {
  return `${indiceColumnaALetra(colIndex)}${rowIndex + 1}`
}

export function rangoImagenDesdeCelda(cell: string): string {
  const match = cell.match(/^([A-Z]+)(\d+)$/)
  if (!match) return `${cell}:${cell}`

  const col = match[1].split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1
  const row = Number(match[2])
  const endCol = indiceColumnaALetra(col + 2)
  return `${cell}:${endCol}${row + 1}`
}

export function arrayBufferABase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

export function base64AArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes.buffer
}

export function descargarArchivo(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombre
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function obtenerValoresFicha(ficha: FichaFormato): Record<string, string> {
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

export function obtenerImagenesFicha(ficha: FichaFormato): Record<string, string> {
  return {
    croquis: ficha.croquis,
    evidencia_1: ficha.evidencias[0] || '',
    evidencia_2: ficha.evidencias[1] || '',
    evidencia_3: ficha.evidencias[2] || '',
    evidencia_4: ficha.evidencias[3] || '',
  }
}

export function obtenerCamposPlantilla(plantilla: PlantillaFormato): Record<string, PlantillaCampoFormato> {
  return plantilla.campos && typeof plantilla.campos === 'object' ? plantilla.campos : {}
}

export function obtenerImagenesPlantilla(plantilla: PlantillaFormato): Record<string, PlantillaImagenFormato> {
  return plantilla.imagenes && typeof plantilla.imagenes === 'object' ? plantilla.imagenes : {}
}

export function detectarMapeo(rows: unknown[][], sheetName: string): MapeoPlantilla {
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

export function normalizarFicha(valor: unknown): FichaFormato {
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

export function asignarCampo(datos: CampoFicha[], etiqueta: string, valor: unknown) {
  const etiquetaNormalizada = limpiarEtiqueta(etiqueta).toLowerCase()
  const campo = datos.find(item => item.etiqueta.toLowerCase() === etiquetaNormalizada)
  if (campo) campo.valor = normalizarTexto(valor)
}

export function extraerNombreCarpeta(ruta?: string): string {
  return (ruta || '').split(/[\\/]/).filter(Boolean).pop() || ruta || ''
}

export function extraerFechaDeCarpeta(nombreCarpeta: string): string {
  const match = nombreCarpeta.match(/(\d{2})_(\d{2})_(\d{4})/)
  if (!match) return ''
  return `${match[1]}/${match[2]}/${match[3]}`
}

export function extraerOperadorDeCarpeta(nombreCarpeta: string): string {
  return nombreCarpeta.replace(/\s*\d{2}_\d{2}_\d{4}.*$/, '').trim()
}

export function extraerDescripcionAnalisis(analisis: unknown): string {
  if (!analisis || typeof analisis !== 'object') return ''
  const data = analisis as {
    descripcionGeneral?: string
    results?: Array<{ description?: string }>
  }
  return data.descripcionGeneral || data.results?.[0]?.description || ''
}

export function extraerEvidenciasAnalisis(analisis: unknown): string[] {
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

export async function leerImagen(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function convertirImagenADataUrl(image: string): Promise<string> {
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

export async function extraerImagenesExcel(file: File): Promise<Record<string, string>> {
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
