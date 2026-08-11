export const LABELS_DEFAULT: Record<string, string> = {
  '1-B': 'Fecha',
  '1-D': 'Segmento',
  '1-F': 'Tramo',
  'sec:titulo': 'FICHA DE IDENTIFICACIÓN DE INFRAESTRUCTURA EXISTENTE',
  'sec:proyecto': 'Tren de Pasajeres Saltillo - Nuevo Laredo Segmentos 16 y 17',
  'sec:clave': 'Clave:',
  'sec:estado-izq': 'Estado actual y descripción del estado del elemento. Lado Izquierdo',
  'sec:estado-der': 'Lado derecho',
  'sec:croquis': 'CROQUIS DE LOCALIZACIÓN:',
  'sec:observaciones': 'Observaciones:',
  'sec:evidencias': 'EVIDENCIA FOTOGRÁFICA',
}

export function resolverLabel(key: string, override: Record<string, string> | undefined): string {
  return override?.[key] ?? LABELS_DEFAULT[key] ?? key
}

export interface ParesCoord { x?: string; y?: string }
export interface CoordenadasValor { lado: string; pares: Record<string, ParesCoord> }

export function parseCoordenadas(raw: string): CoordenadasValor | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as unknown
    if (p && typeof p === 'object' && typeof (p as CoordenadasValor).lado === 'string' && (p as CoordenadasValor).pares && typeof (p as CoordenadasValor).pares === 'object') {
      return { lado: (p as CoordenadasValor).lado, pares: (p as CoordenadasValor).pares as Record<string, ParesCoord> }
    }
    return null
  } catch {
    return null
  }
}

export function formatearCoordenadas(raw: string): string {
  const v = parseCoordenadas(raw)
  if (!v || !v.lado) return ''
  const tokens = v.lado.split('-')
  return tokens.map(t => {
    const p = v.pares[t] ?? {}
    return `${t}: ${p.x ?? ''}, ${p.y ?? ''}`
  }).join(' | ')
}

export const MAX_EVIDENCIAS = 12

export function calcularDistribucionEvidencias(n: number): { cols: number; rows: number } {
  const total = Math.max(0, Math.min(n, MAX_EVIDENCIAS))
  if (total === 0) return { cols: 0, rows: 0 }
  if (total <= 3) return { cols: total, rows: 1 }
  if (total === 4) return { cols: 2, rows: 2 }
  return { cols: 3, rows: Math.ceil(total / 3) }
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

export function formatoImagen(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
}

export function obtenerDimensionesImagen(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
    img.onerror = () => resolve({ w: 1, h: 1 })
    img.src = dataUrl
  })
}

export function calcularAjusteContain(
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

export async function recortarImagenCover(dataUrl: string, targetRatio: number): Promise<string> {
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
      cropH = ih
      cropW = ih * targetRatio
      sx = (iw - cropW) / 2
      sy = 0
    } else {
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

export async function procesarLogo(dataUrl: string, quitarFondo: boolean, umbral = 235): Promise<string> {
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

export interface TxtOpts {
  fs?: number
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  color?: number[]
  vcenter?: boolean
  px?: number
  py?: number
  h?: number
}
