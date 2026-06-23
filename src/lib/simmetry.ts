export interface SimetriaResultado {
  horizontal: number
  vertical: number
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = src
  })
}

function redimensionarCanvas(canvas: HTMLCanvasElement, ancho: number, alto: number): ImageData {
  const temp = document.createElement('canvas')
  temp.width = ancho
  temp.height = alto
  const ctx = temp.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear contexto 2D')
  ctx.drawImage(canvas, 0, 0, ancho, alto)
  return ctx.getImageData(0, 0, ancho, alto)
}

export async function analizarSimetria(src: string, tamañoMuestra = 120): Promise<SimetriaResultado> {
  const img = await cargarImagen(src)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear contexto 2D')
  ctx.drawImage(img, 0, 0)

  const ancho = tamañoMuestra
  const alto = Math.round(tamañoMuestra * (img.naturalHeight / img.naturalWidth))
  const imageData = redimensionarCanvas(canvas, ancho, alto)
  const datos = imageData.data

  const getPixel = (x: number, y: number) => {
    const i = (y * ancho + x) * 4
    return [datos[i], datos[i + 1], datos[i + 2]]
  }

  const diffPromedio = (a: number[], b: number[]) => {
    return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3
  }

  // Simetría vertical: comparar mitad izquierda con mitad derecha reflejada
  let diffVertical = 0
  let countVertical = 0
  const centroX = Math.floor(ancho / 2)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < centroX; x++) {
      const izq = getPixel(x, y)
      const der = getPixel(ancho - 1 - x, y)
      diffVertical += diffPromedio(izq, der)
      countVertical++
    }
  }

  // Simetría horizontal: comparar mitad superior con mitad inferior reflejada
  let diffHorizontal = 0
  let countHorizontal = 0
  const centroY = Math.floor(alto / 2)
  for (let y = 0; y < centroY; y++) {
    for (let x = 0; x < ancho; x++) {
      const sup = getPixel(x, y)
      const inf = getPixel(x, alto - 1 - y)
      diffHorizontal += diffPromedio(sup, inf)
      countHorizontal++
    }
  }

  const score = (diff: number, count: number) => {
    if (count === 0) return 100
    const promedio = diff / count
    return Math.max(0, Math.min(100, 100 - (promedio / 255) * 100))
  }

  return {
    horizontal: Math.round(score(diffHorizontal, countHorizontal)),
    vertical: Math.round(score(diffVertical, countVertical)),
  }
}
