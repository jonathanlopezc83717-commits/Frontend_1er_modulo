/**
 * Subida de imágenes a Storage con deduplicación por contenido.
 * El nombre del objeto es `${prefix}/${sha256}.${ext}`, por lo que los
 * mismos bytes siempre producen el mismo objeto (upsert idempotente).
 */

import { supabase } from './supabase'

async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function subirImagenDedup(dataUrl: string, prefix = 'imagenes'): Promise<string> {
  if (!dataUrl.startsWith('data:image')) return dataUrl

  try {
    const mime = dataUrl.match(/^data:([^;]+)/)?.[1] || 'image/jpeg'
    const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
    const base64 = dataUrl.split(',')[1] ?? ''
    const fileName = `${prefix}/${await sha256Hex(base64)}.${extension}`

    const blob = await (await fetch(dataUrl)).blob()

    const { error } = await supabase.storage
      .from('images')
      .upload(fileName, blob, {
        contentType: mime,
        upsert: true,
      })

    if (error) {
      console.warn('No se pudo subir imagen a Storage:', error)
      return ''
    }

    const { data } = supabase.storage.from('images').getPublicUrl(fileName)
    return data.publicUrl
  } catch (error) {
    console.warn('Error procesando data URL para Storage:', error)
    return ''
  }
}
