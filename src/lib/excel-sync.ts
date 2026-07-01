/**
 * Utilidades para sincronizar puntos desde un Excel con formato:
 * Columna A: número de punto
 * Columnas B, C, D: coordenadas X, Y, Z (decimales)
 * Columna E: código de nomenclatura a comparar con la base global
 */

import type { PuntoFerroviario } from '@/types'
import type { NomenclaturaEntry } from './nomenclaturas'

export interface FilaSincronizacion {
  /** Valor crudo del número de punto leído del Excel */
  numeroPunto: string
  /** Coordenada X */
  x: number
  /** Coordenada Y */
  y: number
  /** Coordenada Z */
  z: number
  /** Código de nomenclatura leído de la columna E */
  codigo: string
  /** Dígitos separados del entero de X (prefijo) si se aplicó separación */
  sepX?: string
  sepY?: string
  sepZ?: string
}

export interface ResultadoSincronizacion {
  fila: FilaSincronizacion
  /** Índice de fila original en el Excel (0-based, sin contar encabezados) */
  filaIndex: number
  /** Id del punto coincidente, si se encontró */
  puntoId?: string
  /** Nombre del punto coincidente, si se encontró */
  puntoNombre?: string
  /** Nomenclatura coincidente en la base global, si existe */
  nomenclatura?: NomenclaturaEntry
  /** Estado resultante de la comparación */
  estado:
    | 'ok'
    | 'punto_no_encontrado'
    | 'nomenclatura_no_encontrada'
    | 'coordenadas_invalidas'
    | 'codigo_vacio'
}

export type CriterioCoincidencia = 'numeroSerie' | 'nombre'

function normalizarNumero(valor: unknown): number | null {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null
    return valor
  }
  if (valor === null || valor === undefined) return null
  const limpio = String(valor).replace(/,/g, '').trim()
  if (limpio === '') return null
  const numero = Number(limpio)
  return Number.isFinite(numero) ? numero : null
}

function normalizarTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  return String(valor).replace(/\s+/g, ' ').trim()
}

export interface OpcionesParseoSincronizacion {
  /** Si es true, omite la primera fila del Excel */
  saltarEncabezado?: boolean
}

/**
 * Lee un buffer de Excel y extrae las filas de sincronización.
 * Se asume que la primera fila contiene datos (no encabezado) a menos que
 * se indique lo contrario.
 */
export async function parsearExcelSincronizacion(
  buffer: ArrayBuffer,
  opciones: OpcionesParseoSincronizacion = {}
): Promise<FilaSincronizacion[]> {
  const { saltarEncabezado = false } = opciones
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' })

  const filas: FilaSincronizacion[] = []
  const inicio = saltarEncabezado ? 1 : 0

  for (let index = inicio; index < rows.length; index++) {
    const row = rows[index]
    if (!Array.isArray(row) || row.length < 5) continue

    const numeroPunto = normalizarTexto(row[0])
    if (!numeroPunto) continue

    const x = normalizarNumero(row[1])
    const y = normalizarNumero(row[2])
    const z = normalizarNumero(row[3])
    const codigo = normalizarTexto(row[4]).toUpperCase()

    // Si no hay coordenadas válidas ni código, se ignora la fila
    if (x === null && y === null && z === null && !codigo) continue

    filas.push({
      numeroPunto,
      x: x ?? 0,
      y: y ?? 0,
      z: z ?? 0,
      codigo,
    })
  }

  return filas
}

function puntoCoincide(punto: PuntoFerroviario, fila: FilaSincronizacion, criterio: CriterioCoincidencia): boolean {
  if (criterio === 'numeroSerie') {
    return String(punto.numeroSerie).trim() === fila.numeroPunto.trim()
  }
  return punto.nombre.trim().toLowerCase() === fila.numeroPunto.trim().toLowerCase()
}

/**
 * Devuelve el prefijo de nomenclatura sin el seriado final.
 * La base guarda códigos por prefijo (EUR); el CSV trae prefijo+número (EUR1).
 */
function prefijoDe(codigo: string): string {
  return codigo.toUpperCase().replace(/\d+$/, '')
}

function buscarNomenclatura(codigo: string, nomenclaturas: NomenclaturaEntry[]): NomenclaturaEntry | undefined {
  if (!codigo) return undefined
  const completo = codigo.toUpperCase()
  const prefijo = prefijoDe(completo)
  // 1) coincidencia exacta (algunas bases guardan el código completo)
  const exacta = nomenclaturas.find(item => item.codigo.toUpperCase() === completo)
  if (exacta) return exacta
  // 2) coincidencia por prefijo (EUR1 -> EUR)
  if (prefijo !== completo) {
    return nomenclaturas.find(item => item.codigo.toUpperCase() === prefijo)
  }
  return undefined
}

/**
 * Compara las filas del Excel contra los puntos existentes y la base de nomenclaturas.
 */
export function compararSincronizacion(
  filas: FilaSincronizacion[],
  puntos: PuntoFerroviario[],
  nomenclaturas: NomenclaturaEntry[],
  criterio: CriterioCoincidencia = 'numeroSerie'
): ResultadoSincronizacion[] {
  return filas.map((fila, filaIndex) => {
    const punto = puntos.find(p => puntoCoincide(p, fila, criterio))
    const coordenadasInvalidas =
      !Number.isFinite(fila.x) || !Number.isFinite(fila.y) || !Number.isFinite(fila.z)

    if (!fila.codigo) {
      return {
        fila,
        filaIndex,
        puntoId: punto?.id,
        puntoNombre: punto?.nombre,
        estado: coordenadasInvalidas ? 'coordenadas_invalidas' : 'codigo_vacio',
      }
    }

    const nomenclatura = buscarNomenclatura(fila.codigo, nomenclaturas)

    if (!punto) {
      return {
        fila,
        filaIndex,
        nomenclatura,
        estado: 'punto_no_encontrado',
      }
    }

    if (!nomenclatura) {
      return {
        fila,
        filaIndex,
        puntoId: punto.id,
        puntoNombre: punto.nombre,
        estado: 'nomenclatura_no_encontrada',
      }
    }

    if (coordenadasInvalidas) {
      return {
        fila,
        filaIndex,
        puntoId: punto.id,
        puntoNombre: punto.nombre,
        nomenclatura,
        estado: 'coordenadas_invalidas',
      }
    }

    return {
      fila,
      filaIndex,
      puntoId: punto.id,
      puntoNombre: punto.nombre,
      nomenclatura,
      estado: 'ok',
    }
  })
}

export interface AplicacionSincronizacion {
  puntosActualizados: number
  puntosNoEncontrados: number
  nomenclaturasAgregadas: number
}

/**
 * Aplica la sincronización: actualiza coordenadas de puntos existentes y
 * agrega a la base global las nomenclaturas que no existan.
 *
 * Devuelve un resumen de cambios aplicados y un array con los puntos modificados.
 */
export function aplicarSincronizacion(
  resultados: ResultadoSincronizacion[],
  puntos: PuntoFerroviario[],
  nomenclaturas: NomenclaturaEntry[],
  opciones: {
    actualizarCoordenadas?: boolean
    agregarNomenclaturasFaltantes?: boolean
    definicionPorDefecto?: string
  } = {}
): { resumen: AplicacionSincronizacion; puntosModificados: PuntoFerroviario[]; nomenclaturasActualizadas: NomenclaturaEntry[] } {
  const { actualizarCoordenadas = true, agregarNomenclaturasFaltantes = true, definicionPorDefecto = 'Nomenclatura sincronizada desde Excel' } = opciones

  const resumen: AplicacionSincronizacion = {
    puntosActualizados: 0,
    puntosNoEncontrados: 0,
    nomenclaturasAgregadas: 0,
  }

  const puntosModificadosMap = new Map<string, PuntoFerroviario>()
  const nuevasNomenclaturas = [...nomenclaturas]
  const codigosExistentes = new Set(nuevasNomenclaturas.map(item => item.codigo.toUpperCase()))

  for (const resultado of resultados) {
    const { fila, puntoId } = resultado

    if (!puntoId) {
      resumen.puntosNoEncontrados++
      continue
    }

    const punto = puntos.find(p => p.id === puntoId)
    if (!punto) {
      resumen.puntosNoEncontrados++
      continue
    }

    let puntoModificado = puntosModificadosMap.get(puntoId) ?? { ...punto, moduloData: { ...punto.moduloData } }

    if (actualizarCoordenadas && resultado.estado !== 'coordenadas_invalidas') {
      puntoModificado = {
        ...puntoModificado,
        coordenadas: {
          lat: fila.y,
          lng: fila.x,
        },
        moduloData: {
          ...puntoModificado.moduloData,
          georeferencia: {
            ...(puntoModificado.moduloData?.georeferencia as Record<string, unknown> | undefined),
            coordenadas: { x: fila.x, y: fila.y, z: fila.z },
            notas: `Coordenadas sincronizadas desde Excel el ${new Date().toISOString()}`,
            updatedAt: new Date().toISOString(),
          },
        },
      }
      resumen.puntosActualizados++
    }

    puntosModificadosMap.set(puntoId, puntoModificado)

    if (agregarNomenclaturasFaltantes && fila.codigo) {
      const clave = prefijoDe(fila.codigo)
      if (!codigosExistentes.has(clave)) {
        nuevasNomenclaturas.push({
          id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          codigo: clave,
          definicion: definicionPorDefecto,
        })
        codigosExistentes.add(clave)
        resumen.nomenclaturasAgregadas++
      }
    }
  }

  return {
    resumen,
    puntosModificados: Array.from(puntosModificadosMap.values()),
    nomenclaturasActualizadas: nuevasNomenclaturas,
  }
}

// =====================================================
// SEPARACIÓN DE DÍGITOS EN COLUMNAS X / Y / Z
// =====================================================

export interface ConfigSeparacion {
  /** Número de dígitos del entero a separar (desde la izquierda) */
  digitos: number
  /** Qué columnas aplicar */
  columnas: { x: boolean; y: boolean; z: boolean }
}

/**
 * Separa los primeros `digitos` del entero (desde la izquierda) de un valor.
 * Ej: 561009.175 con digitos=2 -> { resto: 1009.175, separado: '56' }
 */
export function separarDigitos(valor: number, digitos: number): { resto: number; separado: string } {
  if (!Number.isFinite(valor) || digitos <= 0) return { resto: valor, separado: '' }

  const texto = String(valor)
  const signo = texto.startsWith('-') ? '-' : ''
  const sinSigno = signo ? texto.slice(1) : texto
  const [entero, decimal] = sinSigno.split('.')

  if (entero.length <= digitos) {
    const restoStr = decimal !== undefined ? `0.${decimal}` : '0'
    return { resto: Number(`${signo}${restoStr}`), separado: entero }
  }

  const prefijo = entero.slice(0, digitos)
  const restoEntero = entero.slice(digitos)
  const restoStr = decimal !== undefined ? `${restoEntero}.${decimal}` : restoEntero
  return { resto: Number(`${signo}${restoStr}`), separado: prefijo }
}

/**
 * Aplica la separación a las filas según la configuración.
 * Devuelve nuevas filas con X/Y/Z reducidas al resto y sepX/sepY/sepZ con el prefijo.
 */
export function aplicarSeparacion(
  filas: FilaSincronizacion[],
  config: ConfigSeparacion
): FilaSincronizacion[] {
  if (config.digitos <= 0) return filas
  return filas.map((fila) => {
    const nueva = { ...fila }
    if (config.columnas.x) {
      const r = separarDigitos(fila.x, config.digitos)
      nueva.x = r.resto
      nueva.sepX = r.separado
    }
    if (config.columnas.y) {
      const r = separarDigitos(fila.y, config.digitos)
      nueva.y = r.resto
      nueva.sepY = r.separado
    }
    if (config.columnas.z) {
      const r = separarDigitos(fila.z, config.digitos)
      nueva.z = r.resto
      nueva.sepZ = r.separado
    }
    return nueva
  })
}

/**
 * Busca un archivo Excel dentro de un FileList obtenido de <input webkitdirectory>.
 * Soporta extensiones .xlsx, .xls, .xlsm, .xlsb, .csv y .ods.
 */
export function buscarExcelEnCarpeta(files: FileList): File | null {
  const extensionesValidas = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'csv', 'ods'])
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext && extensionesValidas.has(ext)) {
      return file
    }
  }
  return null
}

// =====================================================
// ESCANEO GENÉRICO DE EXCEL
// =====================================================

export interface ColumnaEscaneada {
  /** Índice 0-based de la columna */
  index: number
  /** Encabezado leído de la primera fila (o "Columna N" si está vacío) */
  encabezado: string
  /** Número de filas con datos en esta columna */
  celdasConDatos: number
}

export interface HojaEscaneada {
  /** Nombre de la hoja */
  nombre: string
  /** Índice 0-based de la hoja */
  index: number
  /** Filas completas tal cual están en el Excel (cada celda convertida a string) */
  filas: string[][]
  /** Encabezados detectados (primera fila no vacía) */
  encabezados: string[]
  /** Metadatos de cada columna para ayudar al usuario a elegir */
  columnas: ColumnaEscaneada[]
  /** Número total de filas con datos */
  totalFilas: number
}

export interface ExcelEscaneado {
  hojas: HojaEscaneada[]
  hojaActiva: number
}

function celdaATexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'number') {
    // Evitar notación científica para números grandes y recortar decimales largos
    if (Number.isInteger(valor)) return String(valor)
    return String(parseFloat(valor.toFixed(10)))
  }
  if (valor instanceof Date) {
    return valor.toISOString().split('T')[0]
  }
  return String(valor).replace(/\s+/g, ' ').trim()
}

/**
 * Escanea un Excel completo y devuelve TODAS las hojas con todas sus celdas
 * convertidas a texto, preservando el orden original.
 * A diferencia de parsearExcelSincronizacion, no asume ningún formato de columnas.
 */
export async function escanearExcelCompleto(
  buffer: ArrayBuffer,
  opciones: { saltarEncabezado?: boolean } = {}
): Promise<ExcelEscaneado> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  const hojas: HojaEscaneada[] = workbook.SheetNames.map((nombreHoja, hojaIndex) => {
    const worksheet = workbook.Sheets[nombreHoja]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    })

    const filas: string[][] = rows.map((row) =>
      Array.isArray(row) ? row.map(celdaATexto) : [celdaATexto(row)]
    )

    // Filtrar filas completamente vacías del final
    while (filas.length > 0 && filas[filas.length - 1].every((c) => c === '')) {
      filas.pop()
    }

    // Detectar encabezados en la primera fila con datos
    const primeraFila = filas[0] || []
    const maxCols = filas.reduce((max, r) => Math.max(max, r.length), 0)

    const encabezados: string[] = []
    const columnas: ColumnaEscaneada[] = []

    for (let col = 0; col < maxCols; col++) {
      const encabezado = primeraFila[col] || `Columna ${col + 1}`
      encabezados.push(encabezado)

      // Contar celdas con datos (saltando el encabezado si aplica)
      const inicioDatos = opciones.saltarEncabezado ? 1 : 0
      let celdasConDatos = 0
      for (let f = inicioDatos; f < filas.length; f++) {
        if (filas[f][col] !== '' && filas[f][col] !== undefined) {
          celdasConDatos++
        }
      }
      columnas.push({ index: col, encabezado, celdasConDatos })
    }

    return {
      nombre: nombreHoja,
      index: hojaIndex,
      filas,
      encabezados,
      columnas,
      totalFilas: filas.length,
    }
  })

  return { hojas, hojaActiva: 0 }
}

// =====================================================
// MAPEO POR COLUMNA DE REFERENCIA
// =====================================================

export interface FilaReferencia {
  /** Valor de la columna elegida como referencia */
  valorReferencia: string
  /** Fila completa como array de strings */
  fila: string[]
  /** Índice original en la hoja */
  filaIndex: number
  /** Id del punto coincidente si se encontró */
  puntoId?: string
  /** Nombre del punto coincidente si se encontró */
  puntoNombre?: string
  /** Estado del mapeo */
  estado: 'ok' | 'punto_no_encontrado' | 'valor_vacio'
}

export interface ResultadoMapeoColumna {
  filas: FilaReferencia[]
  coincidencias: number
  noEncontrados: number
  vacios: number
}

/**
 * Toma una columna del Excel escaneado y la usa como referencia para
 * mapear cada fila contra los puntos ferroviarios existentes.
 */
export function mapearColumnaAPuntos(
  hoja: HojaEscaneada,
  columnaIndex: number,
  puntos: PuntoFerroviario[],
  criterio: CriterioCoincidencia,
  opciones: { saltarEncabezado?: boolean } = {}
): ResultadoMapeoColumna {
  const inicio = opciones.saltarEncabezado ? 1 : 0
  let coincidencias = 0
  let noEncontrados = 0
  let vacios = 0

  const filas: FilaReferencia[] = []

  for (let f = inicio; f < hoja.filas.length; f++) {
    const fila = hoja.filas[f]
    const valorReferencia = (fila[columnaIndex] || '').trim()

    if (!valorReferencia) {
      vacios++
      filas.push({ valorReferencia, fila, filaIndex: f, estado: 'valor_vacio' })
      continue
    }

    const punto = puntos.find((p) => {
      if (criterio === 'numeroSerie') {
        return String(p.numeroSerie).trim() === valorReferencia
      }
      return p.nombre.trim().toLowerCase() === valorReferencia.toLowerCase()
    })

    if (punto) {
      coincidencias++
      filas.push({
        valorReferencia,
        fila,
        filaIndex: f,
        puntoId: punto.id,
        puntoNombre: punto.nombre,
        estado: 'ok',
      })
    } else {
      noEncontrados++
      filas.push({ valorReferencia, fila, filaIndex: f, estado: 'punto_no_encontrado' })
    }
  }

  return { filas, coincidencias, noEncontrados, vacios }
}

// =====================================================
// PARSEO DE CSV
// =====================================================

export interface DatosCSV {
  /** Encabezados (primera fila) */
  encabezados: string[]
  /** Filas de datos (sin contar encabezado) */
  filas: string[][]
  /** Número total de filas de datos */
  totalFilas: number
  /** Delimitador detectado */
  delimitador: string
}

/**
 * Detecta el delimitador más probable del CSV analizando la primera línea
 * con datos. Soporta coma, punto y coma y tabulador.
 */
function detectarDelimitador(texto: string): string {
  const primeraLinea = texto.split(/\r?\n/).find((l) => l.trim() !== '') || ''
  const candidatos = [
    { delim: ';', count: (primeraLinea.match(/;/g) || []).length },
    { delim: ',', count: (primeraLinea.match(/,/g) || []).length },
    { delim: '\t', count: (primeraLinea.match(/\t/g) || []).length },
  ]
  candidatos.sort((a, b) => b.count - a.count)
  return candidatos[0].count > 0 ? candidatos[0].delim : ','
}

/**
 * Divide una línea respetando comillas. El separador puede ser ',', ';' o '\t'.
 */
function dividirLineaCSV(linea: string, delimitador: string): string[] {
  const celdas: string[] = []
  let actual = ''
  let dentroComillas = false

  for (let i = 0; i < linea.length; i++) {
    const char = linea[i]

    if (char === '"') {
      // Comilla escapada con doble comilla ("")
      if (dentroComillas && linea[i + 1] === '"') {
        actual += '"'
        i++
      } else {
        dentroComillas = !dentroComillas
      }
    } else if (char === delimitador && !dentroComillas) {
      celdas.push(actual)
      actual = ''
    } else {
      actual += char
    }
  }
  celdas.push(actual)
  return celdas.map((c) => c.trim())
}

/**
 * Parsea un archivo CSV completo.
 * Detecta automáticamente el delimitador (coma, punto y coma o tabulador).
 * Asume que la primera fila contiene los encabezados.
 */
export function parsearCSV(texto: string): DatosCSV {
  // Normalizar saltos de línea y eliminar BOM si existe
  const limpio = texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const delimitador = detectarDelimitador(limpio)

  const lineas = limpio.split('\n').filter((l) => l.trim() !== '')
  if (lineas.length === 0) {
    return { encabezados: [], filas: [], totalFilas: 0, delimitador }
  }

  const encabezados = dividirLineaCSV(lineas[0], delimitador)
  const filas: string[][] = []

  for (let i = 1; i < lineas.length; i++) {
    const fila = dividirLineaCSV(lineas[i], delimitador)
    // Rellenar o recortar para que coincida con el número de encabezados
    while (fila.length < encabezados.length) fila.push('')
    fila.length = encabezados.length
    filas.push(fila)
  }

  return { encabezados, filas, totalFilas: filas.length, delimitador }
}

/**
 * Lee un File/ArrayBuffer CSV y devuelve los datos estructurados.
 */
export async function leerCSV(archivo: File | ArrayBuffer): Promise<DatosCSV> {
  const texto = archivo instanceof File ? await archivo.text() : new TextDecoder().decode(archivo)
  return parsearCSV(texto)
}

/**
 * Procesa un archivo de sincronización (CSV o XLSX/XLS/ODS) y devuelve
 * tanto la vista previa (DatosCSV) como las filas estructuradas.
 * Enruta por extensión: texto plano para CSV, librería xlsx para binarios.
 */
export async function procesarArchivoSincronizacion(
  buffer: ArrayBuffer,
  nombre: string,
  opciones: { saltarEncabezado?: boolean } = {}
): Promise<{ datos: DatosCSV; filas: FilaSincronizacion[] }> {
  const { saltarEncabezado = false } = opciones
  const ext = nombre.toLowerCase().split('.').pop()

  const filas = await parsearExcelSincronizacion(buffer, { saltarEncabezado })

  // CSV / TXT → parseo de texto plano
  if (ext === 'csv' || ext === 'txt' || !ext) {
    const texto = new TextDecoder().decode(buffer)
    return { datos: parsearCSV(texto), filas }
  }

  // XLSX / XLS / XLSM / XLSB / ODS → vista previa desde la primera hoja
  const escaneado = await escanearExcelCompleto(buffer, { saltarEncabezado: false })
  const hoja = escaneado.hojas[escaneado.hojaActiva]
  const todas = hoja?.filas ?? []
  const encabezados = (todas[0] ?? []).map((h, i) => h || `Columna ${i + 1}`)
  const datosFilas = todas.slice(1)

  return {
    datos: { encabezados, filas: datosFilas, totalFilas: datosFilas.length, delimitador: '' },
    filas,
  }
}

// =====================================================
// GENERACIÓN DE HTML DESDE CSV
// =====================================================

function escaparHTML(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Genera un documento HTML completo y autónomo con una tabla que respeta
 * exactamente las columnas del CSV. Pensado para descargar como .html.
 */
export function generarHTMLDesdeCSV(datos: DatosCSV, titulo = 'Datos importados'): string {
  const { encabezados, filas } = datos

  const ths = encabezados
    .map((h) => `          <th>${escaparHTML(h)}</th>`)
    .join('\n')

  const trs = filas
    .map(
      (fila) =>
        `          <tr>\n${fila
          .map((c) => `            <td>${escaparHTML(c)}</td>`)
          .join('\n')}\n          </tr>`
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escaparHTML(titulo)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 24px;
      background: #f8fafc;
      color: #0f172a;
    }
    h1 { font-size: 1.25rem; margin: 0 0 4px; }
    .meta { color: #64748b; font-size: 0.85rem; margin-bottom: 16px; }
    .tabla-wrap { overflow-x: auto; background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
    thead { background: #f1f5f9; }
    th { font-weight: 600; text-align: left; color: #475569; }
    th, td { padding: 10px 14px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
    tbody tr:hover { background: #f8fafc; }
    tbody tr:last-child td { border-bottom: none; }
  </style>
</head>
<body>
  <h1>${escaparHTML(titulo)}</h1>
  <p class="meta">${filas.length} filas · ${encabezados.length} columnas · Generado el ${new Date().toLocaleString('es-ES')}</p>
  <div class="tabla-wrap">
    <table>
      <thead>
        <tr>
${ths}
        </tr>
      </thead>
      <tbody>
${trs}
      </tbody>
    </table>
  </div>
</body>
</html>`
}

/**
 * Dispara la descarga de un archivo HTML en el navegador.
 */
export function descargarHTML(contenido: string, nombreArchivo = 'datos-importados.html'): void {
  const blob = new Blob([contenido], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
