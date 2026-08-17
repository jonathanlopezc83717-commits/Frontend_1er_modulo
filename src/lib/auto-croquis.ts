/**
 * Cliente batch del endpoint de croquis via Civil 3D COM (server/api_croquis.py).
 *
 * Contrato esperado del backend:
 *   POST ${VITE_DWG_API_URL}/batch   multipart/form-data
 *   - file:   archivo .dwg (binario, uno solo para todo el batch)
 *   - puntos: JSON string [{clave, x, y, size?}]
 *
 *   Response 200 (JSON):
 *   { "croquis": { "<clave>": "data:image/png;base64,..." },
 *     "errores": [ { "clave": "...", "error": "..." } ] }
 *
 *   GET {origin de VITE_DWG_API_URL}/api/health
 *   -> { ok, hostname, civil3d } para saber que maquina renderiza.
 */

import { DwgError } from './dwg-croquis'

const DWG_API_URL = import.meta.env.VITE_DWG_API_URL

export interface PuntoCroquis {
  clave: string
  x: number
  y: number
  size?: number
}

export function agruparPorDwg<T extends { dwg: File }>(items: T[]): Map<File, T[]> {
  const grupos = new Map<File, T[]>()
  for (const item of items) {
    const actual = grupos.get(item.dwg)
    if (actual) actual.push(item)
    else grupos.set(item.dwg, [item])
  }
  return grupos
}

/**
 * Envia un DWG + varios puntos al endpoint batch y devuelve un Map
 * clave -> dataURL. Las claves ausentes fallaron en el servidor.
 * Lanza DwgError si el endpoint responde con error o la respuesta es invalida.
 */
export async function generarCroquisBatch(
  dwgFile: File,
  puntos: PuntoCroquis[],
): Promise<Map<string, string>> {
  if (!DWG_API_URL) {
    throw new DwgError('Falta configurar VITE_DWG_API_URL')
  }
  if (!/\.dwg$/i.test(dwgFile.name)) {
    throw new DwgError('El archivo debe tener extension .dwg')
  }

  const base = DWG_API_URL.replace(/\/$/, '')
  const form = new FormData()
  form.append('file', dwgFile)
  form.append('puntos', JSON.stringify(puntos))

  let response: Response
  try {
    response = await fetch(`${base}/batch`, { method: 'POST', body: form })
  } catch {
    throw new DwgError('No se pudo conectar con el endpoint DWG', undefined)
  }

  if (!response.ok) {
    let detalle = response.statusText
    try {
      const body = (await response.json()) as { detail?: string }
      if (body?.detail) detalle = body.detail
    } catch {
      detalle = response.statusText
    }
    throw new DwgError(`Endpoint DWG ${response.status}: ${detalle}`, response.status)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new DwgError('Respuesta del endpoint DWG no es JSON valido', response.status)
  }

  const croquis = (body as { croquis?: Record<string, string> } | null)?.croquis || {}
  return new Map(Object.entries(croquis))
}

/**
 * Salud del endpoint: hostname de la maquina que renderiza y si Civil 3D
 * responde por COM. Lanza DwgError si el endpoint no esta disponible.
 */
export async function saludCroquis(): Promise<{ hostname: string; civil3d: boolean }> {
  if (!DWG_API_URL) {
    throw new DwgError('Falta configurar VITE_DWG_API_URL')
  }
  const origin = new URL(DWG_API_URL).origin
  let response: Response
  try {
    response = await fetch(`${origin}/api/health`)
  } catch {
    throw new DwgError('No se pudo conectar con el endpoint DWG', undefined)
  }
  if (!response.ok) {
    throw new DwgError(`Endpoint DWG ${response.status}: ${response.statusText}`, response.status)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new DwgError('Respuesta del endpoint DWG no es JSON valido', response.status)
  }
  const salud = (body as { hostname?: string; civil3d?: boolean } | null) || {}
  return { hostname: salud.hostname || '', civil3d: !!salud.civil3d }
}
