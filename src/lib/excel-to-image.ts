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
}

export interface ExcelRenderResult {
  dataUrl: string
  width: number
  height: number
  sheetName: string
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
    pageWidthPx = 1000,
    sheetName: requestedSheet,
    backgroundColor = '#ffffff',
  } = options

  const XLSX = await import('xlsx')
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const sheetName = requestedSheet || workbook.SheetNames[0]

  if (!sheetName) {
    throw new Error('El archivo Excel no contiene hojas')
  }

  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) {
    throw new Error(`No se encontró la hoja "${sheetName}"`)
  }

  // Generar HTML de la hoja.
  const html = XLSX.utils.sheet_to_html(worksheet, {
    id: 'excel-render-sheet',
    editable: false,
    header: '',
    footer: '',
  })

  // Contenedor fuera de pantalla.
  const wrapper = document.createElement('div')
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-9999px'
  wrapper.style.top = '0'
  wrapper.style.width = `${pageWidthPx}px`
  wrapper.style.visibility = 'hidden'
  wrapper.style.zIndex = '-1'
  wrapper.innerHTML = html

  // Estilos para que se parezca a una hoja de cálculo imprimible.
  const style = document.createElement('style')
  style.textContent = `
    #excel-render-sheet {
      border-collapse: collapse;
      width: 100%;
      table-layout: fixed;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #000;
      background-color: ${backgroundColor};
    }
    #excel-render-sheet td,
    #excel-render-sheet th {
      border: 1px solid #d0d0d0;
      padding: 3px 5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: middle;
      background-color: ${backgroundColor};
    }
    #excel-render-sheet tr {
      height: 20px;
    }
  `
  wrapper.appendChild(style)
  document.body.appendChild(wrapper)

  try {
    const table = wrapper.querySelector('table') as HTMLTableElement | null
    if (!table) {
      throw new Error('No se pudo generar la representación visual del Excel')
    }

    // Distribuir el ancho disponible entre las columnas visibles.
    const headerCells = table.querySelectorAll('tr:first-child td, tr:first-child th')
    const colCount = Math.max(headerCells.length, 1)
    const baseColWidth = Math.floor(pageWidthPx / colCount)

    headerCells.forEach((cell) => {
      const el = cell as HTMLElement
      el.style.width = `${baseColWidth}px`
      el.style.minWidth = `${baseColWidth}px`
      el.style.maxWidth = `${baseColWidth}px`
    })

    // Forzar elReflow para que html2canvas capture las dimensiones correctas.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    table.offsetHeight
    await new Promise((resolve) => setTimeout(resolve, 60))

    const canvas = await html2canvas(table, {
      scale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor,
    })

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('El renderizado del Excel generó una imagen vacía')
    }

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      sheetName,
    }
  } finally {
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper)
    }
  }
}
