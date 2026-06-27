/**
 * Utilidades para leer y procesar archivos de carpetas ferroviarias
 * con soporte para subcarpetas indexadas
 */

import JSZip from 'jszip'

export interface FotoIndexada {
  id: string
  index: number
  nombre: string
  ruta: string
  subcarpeta: string
  file: File
  preview: string
}

export interface ArchivosCarpeta {
  kmz?: File
  txt?: File
  excel?: File
  fotos: FotoIndexada[]
  nombreCarpeta: string
  subcarpetas: string[]
}

export interface CoordenadasKMZ {
  x: number
  y: number
  z: number
  nombre?: string
  descripcion?: string
}

export interface DatosPuntoCarpeta {
  nombreCarpeta: string
  coordenadas?: CoordenadasKMZ
  textoDocumento?: string
  excel?: File
  fotos: FotoIndexada[]
  subcarpetas: string[]
}

/**
 * Extrae el índice numérico del nombre de archivo
 * Ej: "1.foto.jpg" → 1, "2-nombre.jpg" → 2, "10_foto.jpg" → 10
 */
function extraerIndice(nombreArchivo: string): number {
  // Buscar número al inicio del nombre
  const match = nombreArchivo.match(/^(\d+)/)
  if (match) {
    return parseInt(match[1], 10)
  }
  return Infinity // Sin índice va al final
}

/**
 * Lee los archivos de una carpeta seleccionada por el usuario
 * incluyendo subcarpetas con fotos indexadas
 */
export async function leerCarpeta(files: FileList): Promise<ArchivosCarpeta> {
  const archivos: ArchivosCarpeta = {
    fotos: [],
    nombreCarpeta: '',
    subcarpetas: [],
  }

  // Mapa para almacenar fotos por subcarpeta
  const fotosPorSubcarpeta = new Map<string, File[]>()

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    // webkitRelativePath solo existe cuando se usa <input webkitdirectory>
    // Fallback: usar file.name directamente si no hay path
    const pathParts = file.webkitRelativePath 
      ? file.webkitRelativePath.split('/') 
      : [file.name]
    
    if (pathParts.length > 0 && !archivos.nombreCarpeta) {
      archivos.nombreCarpeta = pathParts[0] || file.name.replace(/\.[^/.]+$/, '')
    }

    const ext = file.name.toLowerCase().split('.').pop()
    
    if (ext === 'kmz' || ext === 'kml') {
      archivos.kmz = file
    } else if (ext === 'txt') {
      archivos.txt = file
    } else if (ext === 'xlsx' || ext === 'xls') {
      archivos.excel = file
    } else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'].includes(ext || '')) {
      // Determinar subcarpeta (solo si hay path relativo)
      const subcarpeta = (pathParts.length > 2 && file.webkitRelativePath) 
        ? pathParts[pathParts.length - 2] 
        : 'raiz'
      
      if (!fotosPorSubcarpeta.has(subcarpeta)) {
        fotosPorSubcarpeta.set(subcarpeta, [])
        if (subcarpeta !== 'raiz') {
          archivos.subcarpetas.push(subcarpeta)
        }
      }
      
      fotosPorSubcarpeta.get(subcarpeta)!.push(file)
    }
  }

  // Procesar y ordenar fotos por índice
  let contadorGlobal = 0
  
  // Primero procesar fotos de la raíz
  if (fotosPorSubcarpeta.has('raiz')) {
    const fotosRaiz = fotosPorSubcarpeta.get('raiz')!
    fotosRaiz.sort((a, b) => extraerIndice(a.name) - extraerIndice(b.name))
    
    for (const file of fotosRaiz) {
      contadorGlobal++
      const preview = await fileToDataURL(file)
      archivos.fotos.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        index: contadorGlobal,
        nombre: file.name,
        ruta: file.webkitRelativePath,
        subcarpeta: 'raiz',
        file,
        preview,
      })
    }
  }
  
  // Luego procesar fotos de subcarpetas
  for (const [subcarpeta, fotos] of fotosPorSubcarpeta) {
    if (subcarpeta === 'raiz') continue
    
    fotos.sort((a, b) => extraerIndice(a.name) - extraerIndice(b.name))
    
    for (const file of fotos) {
      contadorGlobal++
      const preview = await fileToDataURL(file)
      archivos.fotos.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        index: contadorGlobal,
        nombre: file.name,
        ruta: file.webkitRelativePath,
        subcarpeta,
        file,
        preview,
      })
    }
  }

  return archivos
}

/**
 * Convierte un File a DataURL
 */
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.readAsDataURL(file)
  })
}

/**
 * Extrae coordenadas de un archivo KMZ/KML
 * KMZ es un ZIP que contiene un KML (XML)
 */
export async function extraerCoordenadasKMZ(file: File): Promise<CoordenadasKMZ | null> {
  try {
    const ext = file.name.toLowerCase().split('.').pop()
    
    if (ext === 'kml') {
      // Es un KML directo (XML)
      const text = await file.text()
      return parsearKML(text)
    }
    
    if (ext === 'kmz') {
      // KMZ es un ZIP, necesitamos extraer el doc.kml
      const zipData = await file.arrayBuffer()
      const kmlText = await extraerKMLDeKMZ(zipData)
      if (kmlText) {
        return parsearKML(kmlText)
      }
    }
    
    return null
  } catch (error) {
    console.error('Error extrayendo coordenadas KMZ:', error)
    return null
  }
}

/**
 * Extrae el archivo doc.kml de un KMZ (ZIP) usando JSZip
 */
async function extraerKMLDeKMZ(zipData: ArrayBuffer): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(zipData)

    const kmlEntry = Object.entries(zip.files).find(([path]) =>
      path.toLowerCase().endsWith('.kml')
    )

    if (!kmlEntry) {
      console.error('No se encontró archivo .kml dentro del KMZ')
      return null
    }

    const kmlText = await kmlEntry[1].async('text')
    return kmlText
  } catch (error) {
    console.error('Error extrayendo KML de KMZ:', error)
    return null
  }
}

/**
 * Parsea un string KML y extrae coordenadas
 * Soporta múltiples formatos: Point, Placemark, coord, LookAt
 */
function parsearKML(kmlText: string): CoordenadasKMZ | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(kmlText, 'text/xml')

    // Verificar errores de parseo
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      console.error('Error parseando XML:', parseError.textContent)
      return null
    }

    // Extraer nombre/descripción del primer Placemark si existe
    let nombre: string | undefined
    let descripcion: string | undefined
    const placemark = doc.querySelector('Placemark')
    if (placemark) {
      nombre = placemark.querySelector('name')?.textContent?.trim() || undefined
      descripcion = placemark.querySelector('description, Description, Snippet, snippet')?.textContent?.trim() || undefined
    }

    // Formato 1: <coordinates>lon,lat,alt</coordinates> (dentro de Point, LineString, etc.)
    const coordsElements = doc.querySelectorAll('coordinates')
    for (const coordsElement of Array.from(coordsElements)) {
      const coordsText = coordsElement.textContent?.trim()
      if (coordsText) {
        // Puede haber múltiples coordenadas separadas por espacios o saltos de línea
        const firstCoord = coordsText.split(/\s+/)[0]
        const parts = firstCoord.split(',')
        if (parts.length >= 2) {
          const x = parseFloat(parts[0]) // Longitud
          const y = parseFloat(parts[1]) // Latitud
          const z = parts.length >= 3 ? parseFloat(parts[2]) : 0 // Altitud (opcional)
          if (!isNaN(x) && !isNaN(y)) {
            return { x, y, z: isNaN(z) ? 0 : z, nombre, descripcion }
          }
        }
      }
    }

    // Formato 2: <coord><X>...</X><Y>...</Y><Z>...</Z></coord>
    const coordElement = doc.querySelector('coord')
    if (coordElement) {
      const x = coordElement.querySelector('X')?.textContent
      const y = coordElement.querySelector('Y')?.textContent
      const z = coordElement.querySelector('Z')?.textContent

      if (x && y) {
        const nx = parseFloat(x)
        const ny = parseFloat(y)
        const nz = z ? parseFloat(z) : 0
        if (!isNaN(nx) && !isNaN(ny)) {
          return { x: nx, y: ny, z: isNaN(nz) ? 0 : nz, nombre, descripcion }
        }
      }
    }

    // Formato 3: <LookAt><longitude>...</longitude><latitude>...</latitude><altitude>...</altitude></LookAt>
    const lookAt = doc.querySelector('LookAt, Camera')
    if (lookAt) {
      const lon = lookAt.querySelector('longitude, lon')?.textContent
      const lat = lookAt.querySelector('latitude, lat')?.textContent
      const alt = lookAt.querySelector('altitude, alt')?.textContent

      if (lon && lat) {
        const x = parseFloat(lon)
        const y = parseFloat(lat)
        const z = alt ? parseFloat(alt) : 0
        if (!isNaN(x) && !isNaN(y)) {
          return { x, y, z: isNaN(z) ? 0 : z, nombre, descripcion }
        }
      }
    }

    console.warn('No se encontraron coordenadas válidas en el KML')
    return null
  } catch (error) {
    console.error('Error parseando KML:', error)
    return null
  }
}

/**
 * Lee el contenido de un archivo TXT
 */
export async function leerArchivoTXT(file: File): Promise<string> {
  try {
    return await file.text()
  } catch (error) {
    console.error('Error leyendo TXT:', error)
    return ''
  }
}

/**
 * Procesa una carpeta completa y devuelve los datos estructurados
 */
export async function procesarCarpetaPunto(files: FileList): Promise<DatosPuntoCarpeta> {
  const archivos = await leerCarpeta(files)
  
  const datos: DatosPuntoCarpeta = {
    nombreCarpeta: archivos.nombreCarpeta,
    fotos: archivos.fotos,
    subcarpetas: archivos.subcarpetas,
    excel: archivos.excel,
  }
  
  // Extraer coordenadas del KMZ
  if (archivos.kmz) {
    const coords = await extraerCoordenadasKMZ(archivos.kmz)
    if (coords) {
      datos.coordenadas = coords
    }
  }
  
  // Leer texto del documento
  if (archivos.txt) {
    datos.textoDocumento = await leerArchivoTXT(archivos.txt)
  }
  
  return datos
}

/**
 * Formatea el nombre de una foto con guion según su índice
 * Ej: "1.foto.jpg" → "1 - foto.jpg"
 */
export function formatearNombreFoto(nombre: string, index: number): string {
  // Remover extensión
  const sinExtension = nombre.replace(/\.[^/.]+$/, '')
  
  // Remover número inicial si existe
  const nombreLimpio = sinExtension.replace(/^\d+\.?\s*/, '').replace(/^\d+[-_]?\s*/, '')
  
  return `${index} - ${nombreLimpio}`
}

/**
 * Agrupa fotos por subcarpeta
 */
export function agruparFotosPorSubcarpeta(fotos: FotoIndexada[]): Map<string, FotoIndexada[]> {
  const grupos = new Map<string, FotoIndexada[]>()
  
  for (const foto of fotos) {
    if (!grupos.has(foto.subcarpeta)) {
      grupos.set(foto.subcarpeta, [])
    }
    grupos.get(foto.subcarpeta)!.push(foto)
  }
  
  return grupos
}

/**
 * Busca un archivo Excel dentro de un FileList obtenido de <input webkitdirectory>.
 */
export function buscarExcelEnCarpeta(files: FileList): File | null {
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'xlsx' || ext === 'xls') {
      return file
    }
  }
  return null
}

function quitarExtension(nombre: string): string {
  return nombre.replace(/\.[^/.]+$/, '')
}

function normalizarNombreParaCoincidencia(nombre: string): string {
  return quitarExtension(nombre)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Calcula la similitud entre dos textos usando la subsecuencia común más larga (LCS).
 * Devuelve un valor entre 0 y 1.
 */
function similitudTexto(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0

  const matriz: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  )

  let maximo = 0
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matriz[i][j] = matriz[i - 1][j - 1] + 1
        maximo = Math.max(maximo, matriz[i][j])
      }
    }
  }

  return maximo / Math.max(a.length, b.length)
}

const SIMILITUD_MINIMA = 0.8

/**
 * Busca un archivo Excel en la raíz de la carpeta cuyo nombre coincida con el
 * nombre de la carpeta seleccionada, permitiendo coincidencia parcial.
 * Ej: carpeta "01_PT-001" → "PT-001.xlsx".
 * Solo considera archivos que estén directamente en la raíz (sin subcarpeta).
 */
export function buscarExcelPorNombreCarpeta(files: FileList, nombreCarpeta: string): File | null {
  const nombreNormalizado = normalizarNombreParaCoincidencia(nombreCarpeta)
  let mejorArchivo: File | null = null
  let mejorSimilitud = 0

  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    const pathParts = file.webkitRelativePath
      ? file.webkitRelativePath.split('/')
      : [file.name]

    // Solo archivos en la raíz de la carpeta seleccionada
    if (pathParts.length > 2) continue

    const ext = file.name.toLowerCase().split('.').pop()
    if (ext !== 'xlsx' && ext !== 'xls') continue

    const nombreSinExtension = normalizarNombreParaCoincidencia(file.name)

    // Coincidencia exacta tiene prioridad máxima
    if (nombreSinExtension === nombreNormalizado) {
      return file
    }

    const similitud = similitudTexto(nombreNormalizado, nombreSinExtension)
    if (similitud >= SIMILITUD_MINIMA && similitud > mejorSimilitud) {
      mejorSimilitud = similitud
      mejorArchivo = file
    }
  }

  return mejorArchivo
}
