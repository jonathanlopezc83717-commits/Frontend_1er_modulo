/**
 * Cliente del endpoint que procesa DWG via MCP y devuelve una captura PNG.
 *
 * Contrato esperado del backend:
 *   POST ${VITE_DWG_API_URL}
 *   Content-Type: multipart/form-data
 *   - file:        archivo .dwg (binario)
 *   - x, y:        coordenadas del punto central (numeros)
 *   - ancho, alto: tamano del area de captura en unidades del DWG (default 100)
 *
 *   Response 200 (JSON):
 *   { "imagen": "data:image/png;base64,...." }
 *
 *   Response != 200: { "error": "mensaje" }
 *
 * El backend (MCP + REST API) es responsabilidad del usuario; este modulo
 * solo consume el contrato de arriba.
 */

const DWG_API_URL = import.meta.env.VITE_DWG_API_URL

if (!DWG_API_URL) {
  // Aviso en runtime si falta la config; no rompe el build.
  console.warn('[dwg-croquis] VITE_DWG_API_URL no esta definida. El boton DWG fallara hasta configurarla.')
}

export interface CapturaDwgParams {
  x: number
  y: number
  ancho?: number
  alto?: number
}

export class DwgError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'DwgError'
  }
}

/**
 * Sube un DWG al endpoint y devuelve la captura centrada en (x, y) como dataURL.
 * Lanza DwgError si el endpoint responde con error o la respuesta es invalida.
 */
export async function generarCroquisDesdeDwg(
  file: File,
  params: CapturaDwgParams,
): Promise<string> {
  if (!DWG_API_URL) {
    throw new DwgError('Falta configurar VITE_DWG_API_URL')
  }
  if (!/\.dwg$/i.test(file.name)) {
    throw new DwgError('El archivo debe tener extension .dwg')
  }
  if (!Number.isFinite(params.x) || !Number.isFinite(params.y)) {
    throw new DwgError('Las coordenadas X e Y deben ser numeros validos')
  }

  const ancho = params.ancho ?? 100
  const alto = params.alto ?? 100

  const form = new FormData()
  form.append('file', file)
  form.append('x', String(params.x))
  form.append('y', String(params.y))
  form.append('ancho', String(ancho))
  form.append('alto', String(alto))

  let response: Response
  try {
    response = await fetch(DWG_API_URL, { method: 'POST', body: form })
  } catch (cause) {
    throw new DwgError('No se pudo conectar con el endpoint DWG', undefined)
  }

  if (!response.ok) {
    let detalle = response.statusText
    try {
      const body = (await response.json()) as { error?: string }
      if (body?.error) detalle = body.error
    } catch {
      // respuesta sin JSON, mantenemos statusText
    }
    throw new DwgError(`Endpoint DWG ${response.status}: ${detalle}`, response.status)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new DwgError('Respuesta del endpoint DWG no es JSON valido', response.status)
  }

  const imagen = (body as { imagen?: string } | null)?.imagen
  if (typeof imagen !== 'string' || !imagen.startsWith('data:image/')) {
    throw new DwgError('Respuesta del endpoint DWG no contiene "imagen" como dataURL', response.status)
  }

  return imagen
}
