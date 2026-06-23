import html2canvas from 'html2canvas'

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

  const XLSX = await import('xlsx')
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

  // Primer intento: sheet_to_html (solo si no se indicó un rango explícito,
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

  // Segundo intento: reconstrucción manual con sheet_to_json (respeta el rango).
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
