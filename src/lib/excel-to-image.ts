import html2canvas from 'html2canvas'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

export interface ExcelRenderOptions {
  /** Escala de renderizado. Valores mayores = imagen más nítida pero más pesada. */
  scale?: number
  /** Ancho lógico del lienzo en píxeles. Una hoja A4 a 96 DPI mide ~794 px de ancho. */
  pageWidthPx?: number
  /** Nombre de la hoja a renderizar; por defecto la primera. */
  sheetName?: string
  /** Color de fondo del lienzo. */
  backgroundColor?: string
  /** Rango de celdas a renderizar, ej. "A1:M40". Si no se indica se usa el rango usado de la hoja. */
  range?: string
  /** Si es true y la primera hoja está vacía, busca la primera hoja con contenido. */
  fallbackAHojaConContenido?: boolean
  /** Si es true imprime información de diagnóstico en la consola. */
  debug?: boolean
}

export interface ExcelRenderResult {
  dataUrl: string
  width: number
  height: number
  sheetName: string
}

function log(debug: boolean, ...args: unknown[]) {
  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[excel-to-image]', ...args)
  }
}

function tieneContenidoVisble(worksheet: unknown): boolean {
  if (!worksheet || typeof worksheet !== 'object') return false
  const ws = worksheet as Record<string, unknown>
  const ref = ws['!ref'] as string | undefined
  if (!ref) return false
  const cells = Object.keys(ws).filter(k => !k.startsWith('!'))
  return cells.some((key) => {
    const cell = ws[key] as { v?: unknown; w?: unknown } | undefined
    if (!cell) return false
    const valor = cell.v ?? cell.w
    return valor !== undefined && valor !== null && String(valor).trim() !== ''
  })
}

function numeroAColumnaExcel(n: number): string {
  let result = ''
  let num = n
  while (num > 0) {
    const rem = (num - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    num = Math.floor((num - 1) / 26)
  }
  return result || 'A'
}

function normalizarRango(input: string): string {
  const limpio = input.trim().toUpperCase()

  // Ya es un rango de celdas tipo A1:M40 o una sola celda A1.
  if (/^[A-Z]+\d+(:[A-Z]+\d+)?$/.test(limpio)) {
    return limpio
  }

  // Formatos tipo "12f x 6c", "12 filas x 6 columnas", "6 columnas x 12 filas".
  const filasMatch = limpio.match(/(\d+)\s*(?:F|FILAS?|FL)/)
  const colsMatch = limpio.match(/(\d+)\s*(?:C|COLUMNAS?|COL)/)

  if (filasMatch && colsMatch) {
    const filas = Number.parseInt(filasMatch[1], 10)
    const cols = Number.parseInt(colsMatch[1], 10)
    if (filas > 0 && cols > 0 && cols <= 16384) {
      return `A1:${numeroAColumnaExcel(cols)}${filas}`
    }
  }

  // Formato simple "12x6" o "12,6" (filas x columnas).
  const simpleMatch = limpio.match(/^(\d+)\s*[X,]\s*(\d+)$/)
  if (simpleMatch) {
    const filas = Number.parseInt(simpleMatch[1], 10)
    const cols = Number.parseInt(simpleMatch[2], 10)
    if (filas > 0 && cols > 0 && cols <= 16384) {
      return `A1:${numeroAColumnaExcel(cols)}${filas}`
    }
  }

  // Si no se reconoce, devolver el input original para que falle con un error claro.
  return input.trim()
}

function obtenerRangoUsado(
  worksheet: unknown,
  rangeOverride?: string,
): string {
  if (rangeOverride) return normalizarRango(rangeOverride)
  const ws = worksheet as Record<string, unknown>
  const ref = ws['!ref'] as string | undefined
  if (!ref) throw new Error('La hoja no tiene un rango definido')
  return ref
}

function esImagenBlanca(canvas: HTMLCanvasElement, debug = false): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return true
  const { width, height } = canvas
  if (width === 0 || height === 0) return true

  const step = Math.max(1, Math.floor(Math.min(width, height) / 30))
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  let noBlancos = 0

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const a = data[idx + 3]
      if (a < 255 || r < 245 || g < 245 || b < 245) {
        noBlancos++
        if (noBlancos > 5) {
          log(debug, `Imagen detectada como NO blanca (${noBlancos} píxeles distintos)`)
          return false
        }
      }
    }
  }

  log(debug, `Imagen detectada como blanca (${noBlancos} píxeles distintos)`)
  return true
}

function crearContenedorTemporal(pageWidthPx: number): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.style.position = 'absolute'
  wrapper.style.left = '-10000px'
  wrapper.style.top = '-10000px'
  wrapper.style.width = `${pageWidthPx}px`
  wrapper.style.zIndex = '-1'
  wrapper.style.opacity = '0'
  return wrapper
}

function aplicarEstilosTabla(wrapper: HTMLDivElement, backgroundColor: string) {
  const style = document.createElement('style')
  style.textContent = `
    #excel-render-sheet {
      border-collapse: collapse;
      width: 100%;
      table-layout: fixed;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #111111;
      background-color: ${backgroundColor};
    }
    #excel-render-sheet td,
    #excel-render-sheet th {
      box-sizing: border-box;
      border: 1px solid #808080;
      padding: 3px 5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: middle;
      background-color: ${backgroundColor};
      color: #111111;
      min-width: 40px;
      height: 20px;
    }
    #excel-render-sheet tr {
      height: 20px;
    }
  `
  wrapper.appendChild(style)
}

// =====================================================
// Renderizado fiel con exceljs (merges, dimensiones, estilos)
// =====================================================

/**
 * Extrae los rangos de celdas combinadas de un worksheet de ExcelJS.
 * Compatible con múltiples versiones: `model.merges` en ExcelJS v4+ y el
 * objeto interno `_merges` cuyos valores contienen la propiedad `.range`.
 */
function obtenerMerges(worksheet: unknown): string[] {
  const ws = worksheet as Record<string, unknown>
  const result: string[] = []

  // 1. model.merges (formato común en ExcelJS v4+)
  const model = ws.model as Record<string, unknown> | undefined
  if (model && Array.isArray(model.merges)) {
    result.push(...(model.merges as string[]))
  }

  // 2. _merges interno de ExcelJS.
  //    Las claves son las celdas maestras ('A1'); los valores son objetos
  //    con la propiedad .range que contiene el rango completo ('A1:C1').
  const internalMerges = ws['_merges'] as Record<string, { range?: string }> | undefined
  if (internalMerges && typeof internalMerges === 'object') {
    for (const merge of Object.values(internalMerges)) {
      if (merge && typeof merge === 'object' && typeof merge.range === 'string') {
        result.push(merge.range)
      }
    }
  }

  return [...new Set(result)]
}

/**
 * Determina si una celda tiene estilos visibles (fondo o bordes) aunque su valor esté vacío.
 */
function tieneEstiloVisible(cell: ExcelJS.Cell): boolean {
  const s = cell.style as Record<string, unknown> | undefined
  if (!s) return false

  const fill = s.fill as Record<string, unknown> | undefined
  if (fill && fill.type === 'pattern' && fill.fgColor) {
    return true
  }

  const border = s.border as Record<string, { style?: string }> | undefined
  if (border) {
    for (const side of ['top', 'left', 'bottom', 'right'] as const) {
      if (border[side]?.style) return true
    }
  }

  return false
}

/**
 * Devuelve el rango real usado en el worksheet, considerando contenido, estilos y merges.
 * Útil porque ExcelJS/SheetJS a veces reportan rangos muy grandes (p. ej. A1:Z1000)
 * cuando solo las primeras filas/columnas tienen contenido real.
 */
function obtenerRangoRealUsadoExcelJS(worksheet: ExcelJS.Worksheet): { startRow: number; startCol: number; endRow: number; endCol: number } {
  let minRow = Infinity
  let minCol = Infinity
  let maxRow = 0
  let maxCol = 0

  const update = (row: number, col: number) => {
    minRow = Math.min(minRow, row)
    minCol = Math.min(minCol, col)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  }

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      const value = cellValueToString(cell.value)
      if (value && value.trim() !== '') {
        update(rowNumber, colNumber)
      } else if (tieneEstiloVisible(cell)) {
        update(rowNumber, colNumber)
      }
    })
  })

  // Considerar merges aunque sus celdas estén vacías.
  for (const mergeRange of obtenerMerges(worksheet)) {
    try {
      const decoded = decodeRange(mergeRange)
      update(decoded.s.r + 1, decoded.s.c + 1)
      update(decoded.e.r + 1, decoded.e.c + 1)
    } catch {
      // Ignorar rangos inválidos.
    }
  }

  return {
    startRow: minRow === Infinity ? 1 : minRow,
    startCol: minCol === Infinity ? 1 : minCol,
    endRow: maxRow === 0 ? worksheet.rowCount : maxRow,
    endCol: maxCol === 0 ? worksheet.columnCount : maxCol,
  }
}

function argbToCss(color?: { argb?: string; theme?: number; tint?: number }): string | undefined {
  if (!color) return undefined
  if (color.argb) {
    const hex = color.argb.replace(/^#/, '').trim()
    if (hex.length === 8) {
      return `#${hex.slice(2)}`
    }
    if (hex.length === 6) {
      return `#${hex}`
    }
  }
  // Fallback para colores de tema cuando no hay argb.
  if (color.theme === 1) return '#000000'
  if (color.theme === 0) return '#ffffff'
  return undefined
}

function borderStyleToCss(style?: string): string {
  switch (style) {
    case 'thin': return '1px solid'
    case 'medium': return '2px solid'
    case 'thick': return '3px solid'
    case 'dashed': return '1px dashed'
    case 'dotted': return '1px dotted'
    case 'double': return '3px double'
    default: return '1px solid'
  }
}

function cellValueToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toLocaleDateString()
  if (Array.isArray(value)) return value.map(cellValueToString).join(' ')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.richText && Array.isArray(obj.richText)) {
      return obj.richText.map((t: { text?: string }) => t.text || '').join('')
    }
    if (obj.text !== undefined) return String(obj.text)
    if (obj.result !== undefined) return String(obj.result)
  }
  return String(value)
}

function decodeRange(range: string): { s: { c: number; r: number }; e: { c: number; r: number } } {
  const [start, end] = range.split(':')
  return {
    s: { c: colToIndex(start), r: rowToIndex(start) },
    e: { c: colToIndex(end || start), r: rowToIndex(end || start) },
  }
}

function colToIndex(col: string): number {
  const letters = col.toUpperCase().replace(/[^A-Z]/g, '')
  let num = 0
  for (const char of letters) {
    num = num * 26 + (char.charCodeAt(0) - 64)
  }
  return Math.max(0, num - 1)
}

function rowToIndex(cell: string): number {
  const match = cell.match(/(\d+)/)
  return match ? Math.max(0, Number(match[1]) - 1) : 0
}

async function renderizarExcelConExceljs(
  buffer: ArrayBuffer,
  options: {
    scale: number
    pageWidthPx: number
    sheetName?: string
    backgroundColor: string
    range?: string
    fallbackAHojaConContenido: boolean
    debug: boolean
  },
): Promise<ExcelRenderResult | null> {
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    if (workbook.worksheets.length === 0) {
      throw new Error('El archivo Excel no contiene hojas')
    }

    let worksheet = options.sheetName
      ? workbook.getWorksheet(options.sheetName)
      : workbook.worksheets[0]

    if (options.fallbackAHojaConContenido && worksheet && worksheet.rowCount === 0) {
      const hojaConContenido = workbook.worksheets.find(ws => ws.rowCount > 0)
      if (hojaConContenido) worksheet = hojaConContenido
    }

    if (!worksheet) {
      throw new Error(`No se encontró la hoja "${options.sheetName || ''}"`)
    }

    if (worksheet.rowCount === 0) {
      throw new Error(`La hoja "${worksheet.name}" está vacía`)
    }

    const usedRange = obtenerRangoRealUsadoExcelJS(worksheet)
    let startCol = usedRange.startCol - 1
    let startRow = usedRange.startRow - 1
    let endCol = usedRange.endCol - 1
    let endRow = usedRange.endRow - 1

    if (options.range) {
      const requested = decodeRange(normalizarRango(options.range))
      startCol = Math.max(startCol, requested.s.c)
      startRow = Math.max(startRow, requested.s.r)
      endCol = Math.min(endCol, requested.e.c)
      endRow = Math.min(endRow, requested.e.r)
    }

    log(options.debug, `Renderizando con exceljs hoja "${worksheet.name}" rango ${numeroAColumnaExcel(startCol + 1)}${startRow + 1}:${numeroAColumnaExcel(endCol + 1)}${endRow + 1}`)

    // Mapa de merges.
    const mergeMap = new Map<string, { rowspan: number; colspan: number; master: boolean }>()
    obtenerMerges(worksheet).forEach((mergeRange: string) => {
      try {
        const decoded = decodeRange(mergeRange)
        // Solo considerar merges dentro del rango a renderizar.
        if (decoded.e.c < startCol || decoded.s.c > endCol || decoded.e.r < startRow || decoded.s.r > endRow) return
        for (let r = decoded.s.r; r <= decoded.e.r; r++) {
          for (let c = decoded.s.c; c <= decoded.e.c; c++) {
            const key = `${r},${c}`
            const isMaster = r === decoded.s.r && c === decoded.s.c
            mergeMap.set(key, {
              rowspan: decoded.e.r - decoded.s.r + 1,
              colspan: decoded.e.c - decoded.s.c + 1,
              master: isMaster,
            })
          }
        }
      } catch {
        // Ignorar rangos inválidos.
      }
    })

    const wrapper = crearContenedorTemporal(options.pageWidthPx)
    const table = document.createElement('table')
    table.id = 'excel-render-sheet'

    const style = document.createElement('style')
    style.textContent = `
      #excel-render-sheet {
        border-collapse: collapse;
        table-layout: fixed;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        color: #111111;
        background-color: ${options.backgroundColor};
      }
      #excel-render-sheet td, #excel-render-sheet th {
        box-sizing: border-box;
        padding: 2px 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `
    wrapper.appendChild(style)
    wrapper.appendChild(table)
    document.body.appendChild(wrapper)

    try {
      const colWidths: number[] = []
      for (let c = startCol; c <= endCol; c++) {
        const col = worksheet.getColumn(c + 1)
        const widthPx = col.width ? Math.round(col.width * 7) : 80
        colWidths.push(widthPx)
      }

      const rowHeights: number[] = []
      for (let r = startRow; r <= endRow; r++) {
        const row = worksheet.getRow(r + 1)
        const heightPx = row.height ? Math.round(row.height * 1.333) : 20
        rowHeights.push(heightPx)
      }

      for (let r = startRow; r <= endRow; r++) {
        const tr = document.createElement('tr')
        tr.style.height = `${rowHeights[r - startRow]}px`

        for (let c = startCol; c <= endCol; c++) {
          const mergeKey = `${r},${c}`
          const merge = mergeMap.get(mergeKey)
          if (merge && !merge.master) continue

          const td = document.createElement('td')
          const cell = worksheet.getCell(r + 1, c + 1)
          td.textContent = cellValueToString(cell.value) || '\u00A0'

          const colspan = merge?.colspan || 1
          const rowspan = merge?.rowspan || 1
          let widthPx = 0
          for (let cc = c; cc < c + colspan && cc <= endCol; cc++) {
            widthPx += colWidths[cc - startCol]
          }
          let heightPx = 0
          for (let rr = r; rr < r + rowspan && rr <= endRow; rr++) {
            heightPx += rowHeights[rr - startRow]
          }

          td.style.width = `${widthPx}px`
          td.style.minWidth = `${widthPx}px`
          td.style.maxWidth = `${widthPx}px`
          td.style.height = `${heightPx}px`

          if (merge?.master) {
            td.rowSpan = merge.rowspan
            td.colSpan = merge.colspan
          }

          const s = cell.style as Record<string, unknown> | undefined
          if (s) {
            const font = s.font as Record<string, unknown> | undefined
            if (font) {
              if (font.bold) td.style.fontWeight = 'bold'
              if (font.italic) td.style.fontStyle = 'italic'
              if (font.underline) td.style.textDecoration = 'underline'
              if (font.size) td.style.fontSize = `${font.size}px`
              const color = argbToCss(font?.color as { argb?: string; theme?: number })
              if (color) td.style.color = color
            }

            const fill = s.fill as Record<string, unknown> | undefined
            if (fill && fill.type === 'pattern' && fill.fgColor) {
              const bgColor = argbToCss(fill.fgColor as { argb?: string; theme?: number })
              if (bgColor && bgColor.toLowerCase() !== '#ffffff') {
                td.style.backgroundColor = bgColor
              }
            }

            const alignment = s.alignment as Record<string, unknown> | undefined
            if (alignment) {
              if (alignment.horizontal) td.style.textAlign = String(alignment.horizontal)
              if (alignment.vertical) td.style.verticalAlign = String(alignment.vertical)
              if (alignment.wrapText) td.style.whiteSpace = 'normal'
            }

            const border = s.border as Record<string, { style?: string; color?: { argb?: string } }> | undefined
            if (border) {
              (['top', 'left', 'bottom', 'right'] as const).forEach((side) => {
                const b = border[side]
                if (b?.style) {
                  const color = argbToCss(b.color) || '#000000'
                  td.style.setProperty(`border-${side}`, `${borderStyleToCss(b.style)} ${color}`)
                }
              })
            }
          }

          tr.appendChild(td)
        }
        table.appendChild(tr)
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      table.offsetHeight
      await new Promise(resolve => setTimeout(resolve, 100))

      const canvas = await html2canvas(table, {
        scale: options.scale,
        useCORS: true,
        allowTaint: true,
        logging: options.debug,
        backgroundColor: options.backgroundColor,
      })

      return {
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
        sheetName: worksheet.name,
      }
    } finally {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper)
    }
  } catch (err) {
    log(options.debug, 'Error en renderizado con exceljs:', err)
    return null
  }
}

async function renderizarTabla(
  table: HTMLTableElement,
  scale: number,
  backgroundColor: string,
  debug: boolean,
): Promise<HTMLCanvasElement> {
  const rows = table.querySelectorAll('tr')
  if (rows.length === 0) {
    throw new Error('La tabla generada no tiene filas')
  }

  // Distribuir ancho entre columnas de la primera fila.
  const firstRowCells = rows[0].querySelectorAll('td, th')
  const colCount = Math.max(firstRowCells.length, 1)
  const wrapperWidth = table.parentElement?.clientWidth || 1200
  const baseColWidth = Math.max(40, Math.floor(wrapperWidth / colCount))

  firstRowCells.forEach((cell) => {
    const el = cell as HTMLElement
    el.style.width = `${baseColWidth}px`
    el.style.minWidth = `${baseColWidth}px`
    el.style.maxWidth = `${baseColWidth}px`
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  table.offsetHeight
  await new Promise((resolve) => setTimeout(resolve, 100))

  log(debug, 'Renderizando con html2canvas:', { width: wrapperWidth, rows: rows.length, cols: colCount })

  return html2canvas(table, {
    scale,
    useCORS: true,
    allowTaint: true,
    logging: debug,
    backgroundColor,
  })
}

async function intentarRenderizadoSheetToHtml(
  XLSX: typeof import('xlsx'),
  worksheet: unknown,
  scale: number,
  pageWidthPx: number,
  backgroundColor: string,
  debug: boolean,
): Promise<HTMLCanvasElement | null> {
  try {
    const html = XLSX.utils.sheet_to_html(worksheet as import('xlsx').WorkSheet, {
      id: 'excel-render-sheet',
      editable: false,
      header: '',
      footer: '',
    })

    const wrapper = crearContenedorTemporal(pageWidthPx)
    wrapper.innerHTML = html
    aplicarEstilosTabla(wrapper, backgroundColor)
    document.body.appendChild(wrapper)

    try {
      const table = wrapper.querySelector('table') as HTMLTableElement | null
      if (!table) {
        log(debug, 'sheet_to_html no generó tabla')
        return null
      }
      return await renderizarTabla(table, scale, backgroundColor, debug)
    } finally {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper)
    }
  } catch (err) {
    log(debug, 'Error en sheet_to_html:', err)
    return null
  }
}

function construirTablaManual(
  XLSX: typeof import('xlsx'),
  worksheet: unknown,
  range: string,
  pageWidthPx: number,
  backgroundColor: string,
  debug: boolean,
): { table: HTMLTableElement; wrapper: HTMLDivElement } {
  const rangeObj = XLSX.utils.decode_range(range)
  log(debug, 'Rango decodificado:', rangeObj)

  const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet as import('xlsx').WorkSheet, {
    header: 1,
    defval: '',
    range,
  }) as unknown[][]

  log(debug, 'Filas leídas con sheet_to_json:', rows.length)

  const wrapper = crearContenedorTemporal(pageWidthPx)
  const table = document.createElement('table')
  table.id = 'excel-render-sheet'

  const colCount = Math.max(rangeObj.e.c - rangeObj.s.c + 1, 1)

  rows.forEach((row) => {
    const tr = document.createElement('tr')
    for (let c = 0; c < colCount; c++) {
      const td = document.createElement('td')
      const val = row[c]
      td.textContent = val !== undefined && val !== null ? String(val) : ''
      if (td.textContent.trim() === '') {
        td.innerHTML = '&nbsp;'
      }
      tr.appendChild(td)
    }
    table.appendChild(tr)
  })

  wrapper.appendChild(table)
  aplicarEstilosTabla(wrapper, backgroundColor)
  document.body.appendChild(wrapper)

  return { table, wrapper }
}

/**
 * Renderiza la primera hoja (o la indicada) de un archivo Excel a una imagen PNG.
 * Útil para usar el Excel como fondo visual en el módulo Formato.
 *
 * Nota: la versión open source de SheetJS no lee estilos avanzados (colores de celda,
 * imágenes incrustadas, celdas combinadas). Se aplica un estilo tabular básico para
 * mantener la legibilidad. Si se requiere fidelidad perfecta, conviene exportar el Excel
 * a PDF de alta calidad desde Excel y subir el PDF directamente.
 */
export async function excelFileToImage(
  buffer: ArrayBuffer,
  options: ExcelRenderOptions = {},
): Promise<ExcelRenderResult> {
  const {
    scale = 2,
    pageWidthPx = 1200,
    sheetName: requestedSheet,
    backgroundColor = '#ffffff',
    range: requestedRange,
    fallbackAHojaConContenido = true,
    debug = false,
  } = options

  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })

  if (!workbook.SheetNames.length) {
    throw new Error('El archivo Excel no contiene hojas')
  }

  log(debug, 'Hojas disponibles:', workbook.SheetNames)

  let sheetName = requestedSheet || workbook.SheetNames[0]
  let worksheet = workbook.Sheets[sheetName]

  if (fallbackAHojaConContenido && !tieneContenidoVisble(worksheet)) {
    const hojaConContenido = workbook.SheetNames.find((name) => {
      const ws = workbook.Sheets[name]
      return tieneContenidoVisble(ws)
    })
    if (hojaConContenido) {
      log(debug, `Primera hoja vacía, usando fallback a "${hojaConContenido}"`)
      sheetName = hojaConContenido
      worksheet = workbook.Sheets[sheetName]
    }
  }

  if (!worksheet) {
    throw new Error(`No se encontró la hoja "${sheetName}"`)
  }

  if (!tieneContenidoVisble(worksheet)) {
    throw new Error(`La hoja "${sheetName}" está vacía. Guarda la plantilla en la primera hoja del Excel.`)
  }

  const range = obtenerRangoUsado(worksheet, requestedRange)
  log(debug, `Renderizando hoja "${sheetName}" con rango ${range}`)

  // Primer intento: renderizado fiel con exceljs (lee merges, dimensiones y estilos básicos).
  const resultadoExceljs = await renderizarExcelConExceljs(buffer, {
    scale,
    pageWidthPx,
    sheetName: requestedSheet,
    backgroundColor,
    range: requestedRange,
    fallbackAHojaConContenido,
    debug,
  })

  if (resultadoExceljs) {
    log(debug, 'Renderizado con exceljs exitoso')
    return resultadoExceljs
  }

  log(debug, 'Renderizado con exceljs no disponible, usando fallback con xlsx')

  // Fallback 1: sheet_to_html (solo si no se indicó un rango explícito,
  // porque sheet_to_html no respeta rangos y renderizaría toda la hoja).
  let canvas: HTMLCanvasElement | null = null
  if (!requestedRange) {
    canvas = await intentarRenderizadoSheetToHtml(
      XLSX,
      worksheet,
      scale,
      pageWidthPx,
      backgroundColor,
      debug,
    )
  } else {
    log(debug, 'Rango explícito proporcionado, se omite sheet_to_html')
  }

  // Fallback 2: reconstrucción manual con sheet_to_json (respeta el rango).
  if (!canvas || esImagenBlanca(canvas, debug)) {
    log(debug, 'sheet_to_html falló o dio imagen blanca, intentando reconstrucción manual')
    const { table, wrapper } = construirTablaManual(
      XLSX,
      worksheet,
      range,
      pageWidthPx,
      backgroundColor,
      debug,
    )
    try {
      canvas = await renderizarTabla(table, scale, backgroundColor, debug)
    } finally {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper)
    }
  }

  if (!canvas) {
    throw new Error('No se pudo renderizar el Excel con ningún método')
  }

  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error('El renderizado del Excel generó una imagen vacía (dimensiones 0x0)')
  }

  if (esImagenBlanca(canvas, debug)) {
    throw new Error(
      'El renderizado del Excel generó una imagen completamente en blanco. ' +
      'Revisa que la primera hoja tenga contenido visible. ' +
      'Si la plantilla está en un rango específico, prueba indicándolo (ej. A1:M40).',
    )
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    sheetName,
  }
}

// =====================================================
// Flujo Excel → HTML editable → Imagen
// =====================================================

export interface ExcelToHtmlResult {
  /** HTML de la tabla con estilos inline, listo para mostrar y editar. */
  html: string
  sheetName: string
}

/**
 * Convierte un archivo Excel a una tabla HTML con estilos (bordes, colores,
 * merges, alineación). Las celdas usan contentEditable para que el usuario
 * pueda modificar el texto antes de renderizar.
 */
export async function excelToEditableHtml(
  buffer: ArrayBuffer,
  options: { sheetName?: string; range?: string } = {},
): Promise<ExcelToHtmlResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  if (workbook.worksheets.length === 0) {
    throw new Error('El archivo Excel no contiene hojas')
  }

  let worksheet = options.sheetName
    ? workbook.getWorksheet(options.sheetName)
    : workbook.worksheets[0]

  if (!worksheet) {
    throw new Error(`No se encontró la hoja "${options.sheetName || ''}"`)
  }

  if (worksheet.rowCount === 0) {
    throw new Error(`La hoja "${worksheet.name}" está vacía`)
  }

  const usedRange = obtenerRangoRealUsadoExcelJS(worksheet)
  let startCol = usedRange.startCol - 1
  let startRow = usedRange.startRow - 1
  let endCol = usedRange.endCol - 1
  let endRow = usedRange.endRow - 1

  if (options.range) {
    const requested = decodeRange(normalizarRango(options.range))
    startCol = Math.max(startCol, requested.s.c)
    startRow = Math.max(startRow, requested.s.r)
    endCol = Math.min(endCol, requested.e.c)
    endRow = Math.min(endRow, requested.e.r)
  }

  // Mapa de merges.
  const mergeMap = new Map<string, { rowspan: number; colspan: number; master: boolean }>()
  obtenerMerges(worksheet).forEach((mergeRange: string) => {
    try {
      const decoded = decodeRange(mergeRange)
      if (decoded.e.c < startCol || decoded.s.c > endCol || decoded.e.r < startRow || decoded.s.r > endRow) return
      for (let r = decoded.s.r; r <= decoded.e.r; r++) {
        for (let c = decoded.s.c; c <= decoded.e.c; c++) {
          const key = `${r},${c}`
          const isMaster = r === decoded.s.r && c === decoded.s.c
          mergeMap.set(key, {
            rowspan: decoded.e.r - decoded.s.r + 1,
            colspan: decoded.e.c - decoded.s.c + 1,
            master: isMaster,
          })
        }
      }
    } catch {
      // Ignorar rangos inválidos.
    }
  })

  const colWidths: number[] = []
  for (let c = startCol; c <= endCol; c++) {
    const col = worksheet.getColumn(c + 1)
    colWidths.push(col.width ? Math.round(col.width * 7) : 80)
  }

  const rowHeights: number[] = []
  for (let r = startRow; r <= endRow; r++) {
    const row = worksheet.getRow(r + 1)
    rowHeights.push(row.height ? Math.round(row.height * 1.333) : 20)
  }

  const rows: string[] = []
  for (let r = startRow; r <= endRow; r++) {
    const tds: string[] = []

    for (let c = startCol; c <= endCol; c++) {
      const mergeKey = `${r},${c}`
      const merge = mergeMap.get(mergeKey)
      if (merge && !merge.master) continue

      const cell = worksheet.getCell(r + 1, c + 1)

      const colspan = merge?.colspan || 1
      const rowspan = merge?.rowspan || 1
      let widthPx = 0
      for (let cc = c; cc < c + colspan && cc <= endCol; cc++) {
        widthPx += colWidths[cc - startCol]
      }
      let heightPx = 0
      for (let rr = r; rr < r + rowspan && rr <= endRow; rr++) {
        heightPx += rowHeights[rr - startRow]
      }

      const text = (cellValueToString(cell.value) || '\u00A0')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      let styleStr = `width:${widthPx}px;min-width:${widthPx}px;max-width:${widthPx}px;height:${heightPx}px;`

      const s = cell.style as Record<string, unknown> | undefined
      if (s) {
        const font = s.font as Record<string, unknown> | undefined
        if (font) {
          if (font.bold) styleStr += 'font-weight:bold;'
          if (font.italic) styleStr += 'font-style:italic;'
          if (font.underline) styleStr += 'text-decoration:underline;'
          if (font.size) styleStr += `font-size:${font.size}px;`
          const color = argbToCss(font?.color as { argb?: string; theme?: number })
          if (color) styleStr += `color:${color};`
        }

        const fill = s.fill as Record<string, unknown> | undefined
        if (fill && fill.type === 'pattern' && fill.fgColor) {
          const bgColor = argbToCss(fill.fgColor as { argb?: string; theme?: number })
          if (bgColor && bgColor.toLowerCase() !== '#ffffff') {
            styleStr += `background-color:${bgColor};`
          }
        }

        const alignment = s.alignment as Record<string, unknown> | undefined
        if (alignment) {
          if (alignment.horizontal) styleStr += `text-align:${alignment.horizontal};`
          if (alignment.vertical) styleStr += `vertical-align:${alignment.vertical};`
          if (alignment.wrapText) styleStr += 'white-space:normal;'
        }

        const border = s.border as Record<string, { style?: string; color?: { argb?: string } }> | undefined
        if (border) {
          (['top', 'left', 'bottom', 'right'] as const).forEach((side) => {
            const b = border[side]
            if (b?.style) {
              const bColor = argbToCss(b.color) || '#000000'
              styleStr += `border-${side}:${borderStyleToCss(b.style)} ${bColor};`
            }
          })
        }
      }

      let attrs = ` style="${styleStr}"`
      if (merge?.master) {
        attrs += ` rowspan="${merge.rowspan}" colspan="${merge.colspan}"`
      }

      tds.push(`<td${attrs}>${text}</td>`)
    }

    rows.push(`<tr style="height:${rowHeights[r - startRow]}px;">${tds.join('')}</tr>`)
  }

  const html = `<table id="excel-editable-table" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;">${rows.join('')}</table>`

  return { html, sheetName: worksheet.name }
}

/**
 * Renderiza un string de tabla HTML a imagen PNG.
 */
export async function htmlTableToImage(
  html: string,
  options: { scale?: number; pageWidthPx?: number; backgroundColor?: string } = {},
): Promise<ExcelRenderResult> {
  const { scale = 2, pageWidthPx = 1200, backgroundColor = '#ffffff' } = options

  const wrapper = crearContenedorTemporal(pageWidthPx)
  wrapper.innerHTML = html

  const style = document.createElement('style')
  style.textContent = `
    #excel-editable-table td {
      box-sizing: border-box;
      border: 1px solid #808080;
      padding: 2px 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background-color: ${backgroundColor};
    }
  `
  wrapper.appendChild(style)
  document.body.appendChild(wrapper)

  try {
    const table = wrapper.querySelector('table') as HTMLTableElement | null
    if (!table) throw new Error('El HTML no contiene una tabla')

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    table.offsetHeight
    await new Promise(resolve => setTimeout(resolve, 100))

    const canvas = await html2canvas(table, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor,
    })

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      sheetName: 'editable',
    }
  } finally {
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper)
  }
}
