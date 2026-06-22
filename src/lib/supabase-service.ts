/**
 * Servicio de Supabase para persistencia de Puntos Ferroviarios
 * CRUD completo con todas las tablas relacionadas
 */

import { supabase } from './supabase'
import type { PuntoFerroviario, ImageAnalysisResult, EstadoGuardado } from '@/types'

// =====================================================
// TIPOS PARA SUPABASE
// =====================================================

export interface PuntoDB {
  id: string
  numero_serie: number
  nombre: string
  descripcion: string | null
  carpeta_path: string | null
  coordenada_lat: number | null
  coordenada_lng: number | null
  coordenada_z: number | null
  estado: string
  created_at: string
  updated_at: string
}

export interface CoordenadasDB {
  punto_id: string
  latitud: number
  longitud: number
  altitud: number | null
  notas: string | null
}

export interface DocumentoDB {
  id: string
  punto_id: string
  nombre_archivo: string | null
  contenido: string | null
  tipo_documento: string
}

export interface AnalisisDB {
  id: string
  punto_id: string
  image_url: string | null
  image_urls: string[]
  description: string | null
  objects: string[]
  mood: string | null
  quality: string | null
  model_used: string | null
}

export interface FotoDB {
  id: string
  punto_id: string
  indice: number
  nombre_archivo: string
  nombre_formateado: string | null
  subcarpeta: string
  preview_url: string | null
}

export interface HistorialDB {
  id: string
  punto_id: string
  tipo_evento: string
  modulo: string | null
  descripcion: string | null
  datos_anteriores: Record<string, unknown> | null
  datos_nuevos: Record<string, unknown> | null
  created_at: string
  puntos_ferroviarios?: { nombre?: string; numero_serie?: number }
}

interface EstadoAppSnapshotDB {
  id: string
  tipo: EstadoGuardado['tipo']
  descripcion: string
  snapshot?: EstadoGuardado['snapshot']
  created_at: string
}

// =====================================================
// CONVERSORES: Frontend <-> Base de Datos
// =====================================================

function puntoToDB(punto: Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'> & { id: string; numeroSerie: number }): Partial<PuntoDB> {
  return {
    id: punto.id,
    numero_serie: punto.numeroSerie,
    nombre: punto.nombre,
    descripcion: punto.descripcion || null,
    carpeta_path: punto.carpetaPath || null,
    coordenada_lat: punto.coordenadas?.lat || null,
    coordenada_lng: punto.coordenadas?.lng || null,
    coordenada_z: (punto.moduloData?.georeferencia?.coordenadas?.z || punto.moduloData?.georeferenciacion?.coordenadas?.z) || null,
    estado: 'activo',
  }
}

function puntoFromDB(db: PuntoDB & { coordenadas_gps?: CoordenadasDB[], documentos_punto?: DocumentoDB[], analisis_imagenes?: AnalisisDB[], fotos_punto?: FotoDB[] }): PuntoFerroviario {
  const punto: PuntoFerroviario = {
    id: db.id,
    numeroSerie: db.numero_serie,
    nombre: db.nombre,
    descripcion: db.descripcion || undefined,
    carpetaPath: db.carpeta_path || undefined,
    coordenadas: db.coordenada_lat && db.coordenada_lng ? {
      lat: db.coordenada_lat,
      lng: db.coordenada_lng,
    } : undefined,
    moduloData: {},
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  }

  // Coordenadas
  if (db.coordenadas_gps && db.coordenadas_gps.length > 0) {
    const coord = db.coordenadas_gps[0]
    punto.moduloData.georeferencia = {
      coordenadas: {
        x: coord.longitud,
        y: coord.latitud,
        z: coord.altitud || 0,
      },
      notas: coord.notas || '',
      updatedAt: db.updated_at,
    }
  }
  
  // Coordenadas desde punto principal (fallback)
  if (!punto.moduloData.georeferencia && db.coordenada_lat && db.coordenada_lng) {
    punto.moduloData.georeferencia = {
      coordenadas: {
        x: db.coordenada_lng,
        y: db.coordenada_lat,
        z: db.coordenada_z || 0,
      },
      notas: '',
      updatedAt: db.updated_at,
    }
  }

  // Documentos
  if (db.documentos_punto && db.documentos_punto.length > 0) {
    const doc = db.documentos_punto[0]
    punto.moduloData.documentacion = {
      notas: doc.contenido || '',
      nombreArchivo: doc.nombre_archivo || undefined,
      updatedAt: db.updated_at,
    }
  }

  // Análisis
  if (db.analisis_imagenes && db.analisis_imagenes.length > 0) {
    const analisis = db.analisis_imagenes[0]
    punto.moduloData.analisis = {
      results: [{
        description: analisis.description || '',
        objects: analisis.objects || [],
        mood: analisis.mood || '',
        quality: analisis.quality || '',
        rawResponse: '',
        modelUsed: analisis.model_used || 'GPT-4o',
      }],
      imageUrls: analisis.image_urls || [],
      modelUsed: analisis.model_used || undefined,
      analyzedAt: db.created_at,
    }
  }

  // Fotos
  if (db.fotos_punto && db.fotos_punto.length > 0) {
    punto.moduloData.analisis = {
      ...punto.moduloData.analisis,
      fotosIndexadas: db.fotos_punto.map(f => ({
        id: f.id,
        index: f.indice,
        nombre: f.nombre_archivo,
        nombreFormateado: f.nombre_formateado || f.nombre_archivo,
        subcarpeta: f.subcarpeta,
        preview: f.preview_url || '',
      })),
      fotosCount: db.fotos_punto.length,
    }
  }

  return punto
}

// =====================================================
// CRUD: PUNTOS FERROVIARIOS
// =====================================================

/**
 * Guarda o actualiza un punto completo con todas sus relaciones
 */
export async function guardarPuntoCompleto(punto: PuntoFerroviario): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Guardar punto principal
    const puntoData = puntoToDB(punto)
    const { data: puntoExistente, error: existeError } = await supabase
      .from('puntos_ferroviarios')
      .select('id')
      .eq('id', punto.id)
      .maybeSingle()

    if (existeError) throw existeError

    const { error: puntoError } = await supabase
      .from('puntos_ferroviarios')
      .upsert({
        ...puntoData,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (puntoError) throw puntoError

    // 2. Guardar coordenadas
    const geoData = punto.moduloData?.georeferencia || punto.moduloData?.georeferenciacion
    if (geoData?.coordenadas) {
      const coords = geoData.coordenadas
      await supabase.from('coordenadas_gps').upsert({
        punto_id: punto.id,
        coordenada_x: coords.x,
        coordenada_y: coords.y,
        coordenada_z: coords.z,
        notas: geoData.notas || '',
      }, { onConflict: 'punto_id' })
    }

    // 3. Guardar documentación
    if (punto.moduloData?.documentacion?.notas) {
      await supabase.from('documentos_punto').upsert({
        punto_id: punto.id,
        nombre_archivo: punto.moduloData.documentacion.nombreArchivo || 'documento.txt',
        contenido: punto.moduloData.documentacion.notas,
      }, { onConflict: 'punto_id' })
    }

    // 4. Guardar fotos
    if (punto.moduloData?.analisis?.fotosIndexadas) {
      // Eliminar fotos anteriores
      await supabase.from('fotos_punto').delete().eq('punto_id', punto.id)
      
      // Insertar nuevas
      const fotosDB = await Promise.all(
        punto.moduloData.analisis.fotosIndexadas.map(async f => ({
          punto_id: punto.id,
          indice: f.index,
          nombre_archivo: f.nombre,
          nombre_formateado: f.nombreFormateado,
          subcarpeta: f.subcarpeta,
          preview_url: f.preview?.startsWith('data:image')
            ? await dataUrlAArchivoStorage(f.preview, `puntos/${punto.id}/fotos`)
            : f.preview,
        }))
      )
      
      await supabase.from('fotos_punto').insert(fotosDB)
    }

    // 5. Guardar análisis
    if (punto.moduloData?.analisis?.results && punto.moduloData.analisis.results.length > 0) {
      const result = punto.moduloData.analisis.results[0]
      await supabase.from('analisis_imagenes').upsert({
        punto_id: punto.id,
        image_urls: punto.moduloData.analisis.imageUrls || [],
        description: result.description,
        objects: result.objects,
        mood: result.mood,
        quality: result.quality,
        model_used: result.modelUsed,
      }, { onConflict: 'punto_id' })
    }

    // 6. Registrar en historial
    const tipoEvento = puntoExistente ? 'actualizacion' : 'creacion'
    const descripcion = puntoExistente
      ? `Punto ${punto.nombre} actualizado`
      : `Punto ${punto.nombre} creado`
    await registrarHistorial(punto.id, tipoEvento, 'general', descripcion)

    return { success: true }
  } catch (error) {
    console.error('Error guardando punto:', error)
    const errorMsg = error && typeof error === 'object'
      ? (error as { message?: string }).message || JSON.stringify(error)
      : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Carga todos los puntos con sus relaciones
 * Usa consultas separadas para evitar el error PGRST200 cuando
 * no hay foreign keys definidas en Supabase
 */
export async function cargarPuntosCompletos(): Promise<PuntoFerroviario[]> {
  try {
    // 1. Cargar puntos principales
    const { data: puntosData, error: puntosError } = await supabase
      .from('puntos_ferroviarios')
      .select('*')
      .eq('estado', 'activo')
      .order('numero_serie', { ascending: true })

    if (puntosError) throw puntosError
    if (!puntosData || puntosData.length === 0) return []

    // 2. Cargar coordenadas
    const { data: coordsData } = await supabase
      .from('coordenadas_gps')
      .select('*')

    const coordsMap = new Map<string, any>()
    if (coordsData) {
      for (const c of coordsData) {
        coordsMap.set(c.punto_id, c)
      }
    }

    // 3. Cargar documentos
    const { data: docsData } = await supabase
      .from('documentos_punto')
      .select('*')

    const docsMap = new Map<string, any>()
    if (docsData) {
      for (const d of docsData) {
        docsMap.set(d.punto_id, d)
      }
    }

    // 4. Cargar análisis
    const { data: analisisData } = await supabase
      .from('analisis_imagenes')
      .select('*')

    const analisisMap = new Map<string, any>()
    if (analisisData) {
      for (const a of analisisData) {
        analisisMap.set(a.punto_id, a)
      }
    }

    // 5. Cargar fotos
    const { data: fotosData } = await supabase
      .from('fotos_punto')
      .select('*')
      .order('indice', { ascending: true })

    const fotosMap = new Map<string, any[]>()
    if (fotosData) {
      for (const f of fotosData) {
        if (!fotosMap.has(f.punto_id)) {
          fotosMap.set(f.punto_id, [])
        }
        fotosMap.get(f.punto_id)!.push(f)
      }
    }

    // 6. Combinar todo
    const puntosCompletos = puntosData.map(p => {
      const punto: any = { ...p }
      if (coordsMap.has(p.id)) {
        punto.coordenadas_gps = [coordsMap.get(p.id)]
      }
      if (docsMap.has(p.id)) {
        punto.documentos_punto = [docsMap.get(p.id)]
      }
      if (analisisMap.has(p.id)) {
        punto.analisis_imagenes = [analisisMap.get(p.id)]
      }
      if (fotosMap.has(p.id)) {
        punto.fotos_punto = fotosMap.get(p.id)
      }
      return punto
    })

    return puntosCompletos.map(puntoFromDB)
  } catch (error) {
    console.error('Error cargando puntos:', error)
    return []
  }
}

/**
 * Elimina un punto (soft delete - cambia estado)
 */
export async function eliminarPuntoDB(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('puntos_ferroviarios')
      .update({ estado: 'eliminado', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    await registrarHistorial(id, 'eliminacion', 'general', 'Punto eliminado')

    return { success: true }
  } catch (error) {
    console.error('Error eliminando punto:', error)
    return { success: false, error: String(error) }
  }
}

// =====================================================
// HISTORIAL
// =====================================================

function estadoGuardadoFromDB(db: EstadoAppSnapshotDB): EstadoGuardado {
  return {
    id: db.id,
    tipo: db.tipo,
    descripcion: db.descripcion,
    createdAt: db.created_at,
    snapshotCompleto: Boolean(db.snapshot),
    snapshot: db.snapshot || {
      puntos: [],
      puntoActivoId: null,
      moduloActivo: 'analisis',
      nomenclaturasGlobales: [],
      plantillasFormato: [],
      plantillasPdfFormato: [],
      plantillasFicha: [],
    },
  }
}

async function dataUrlAArchivoStorage(dataUrl: string, prefix = 'snapshots'): Promise<string> {
  if (!dataUrl.startsWith('data:image')) return dataUrl

  const [header, base64] = dataUrl.split(',')
  if (!base64) return ''

  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
  const extension = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }

  const fileName = `${prefix}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage
    .from('images')
    .upload(fileName, new Blob([bytes], { type: mime }), {
      contentType: mime,
      upsert: false,
    })

  if (error) {
    console.warn('No se pudo subir imagen a Storage:', error)
    return ''
  }

  const { data } = supabase.storage.from('images').getPublicUrl(fileName)
  return data.publicUrl
}

async function prepararValorParaNube(valor: unknown): Promise<unknown> {
  if (typeof valor === 'string') {
    if (valor.startsWith('data:image')) return dataUrlAArchivoStorage(valor)
    if (valor.startsWith('data:') || valor.length > 10000) return ''
    return valor
  }

  if (Array.isArray(valor)) return Promise.all(valor.map(prepararValorParaNube))
  if (!valor || typeof valor !== 'object') return valor

  const limpio: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(valor as Record<string, unknown>)) {
    if (key === 'file' || key === 'archivoBase64') continue
    limpio[key] = await prepararValorParaNube(item)
  }
  return limpio
}

/**
 * Guarda una copia restaurable completa del estado en Supabase.
 */
export async function guardarEstadoAppEnNube(estado: EstadoGuardado): Promise<{ success: boolean; error?: string }> {
  try {
    const snapshot = await prepararValorParaNube(estado.snapshot)
    const { error } = await supabase
      .from('app_state_snapshots')
      .upsert({
        id: estado.id,
        tipo: estado.tipo,
        descripcion: estado.descripcion,
        snapshot,
        created_at: estado.createdAt,
      }, { onConflict: 'id' })

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error('Error guardando snapshot en nube:', error)
    const errorMsg = error && typeof error === 'object'
      ? (error as { message?: string }).message || JSON.stringify(error)
      : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Obtiene los estados restaurables guardados en Supabase.
 */
export async function obtenerEstadosAppDesdeNube(limit = 24): Promise<EstadoGuardado[]> {
  try {
    const { data, error } = await supabase
      .from('app_state_snapshots')
      .select('id,tipo,descripcion,created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return (data || []).map(estadoGuardadoFromDB)
  } catch (error) {
    console.error('Error obteniendo snapshots desde nube:', error)
    return []
  }
}

export async function obtenerEstadoAppDesdeNube(id: string): Promise<EstadoGuardado | null> {
  try {
    const { data, error } = await supabase
      .from('app_state_snapshots')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    return data ? estadoGuardadoFromDB(data as EstadoAppSnapshotDB) : null
  } catch (error) {
    console.error('Error obteniendo snapshot desde nube:', error)
    return null
  }
}

/**
 * Obtiene el snapshot mas reciente guardado en Supabase.
 */
export async function obtenerUltimoEstadoAppDesdeNube(): Promise<EstadoGuardado | null> {
  try {
    const { data, error } = await supabase
      .from('app_state_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) throw error

    return data ? estadoGuardadoFromDB(data as EstadoAppSnapshotDB) : null
  } catch (error) {
    console.error('Error obteniendo ultimo snapshot desde nube:', error)
    return null
  }
}

/**
 * Registra un evento en el historial
 */
export async function registrarHistorial(
  puntoId: string,
  tipoEvento: string,
  modulo: string,
  descripcion: string,
  datosAnteriores?: Record<string, unknown>,
  datosNuevos?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from('historial_obras').insert({
      punto_id: puntoId,
      tipo_evento: tipoEvento,
      modulo,
      descripcion,
      datos_anteriores: datosAnteriores || null,
      datos_nuevos: datosNuevos || null,
    })

    if (error) throw error
  } catch (error) {
    console.error('Error registrando historial:', error)
  }
}

/**
 * Obtiene el historial de un punto
 */
export async function obtenerHistorialPunto(puntoId: string): Promise<HistorialDB[]> {
  try {
    const { data, error } = await supabase
      .from('historial_obras')
      .select('*')
      .eq('punto_id', puntoId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error obteniendo historial:', error)
    return []
  }
}

/**
 * Obtiene todo el historial de obras
 */
export async function obtenerHistorialCompleto(): Promise<HistorialDB[]> {
  try {
    const { data, error } = await supabase
      .from('historial_obras')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    if (!data || data.length === 0) return []

    const puntoIds = [...new Set(data.map(registro => registro.punto_id))]
    const { data: puntosData, error: puntosError } = await supabase
      .from('puntos_ferroviarios')
      .select('id, nombre, numero_serie')
      .in('id', puntoIds)

    if (puntosError) throw puntosError

    const puntosMap = new Map(
      (puntosData || []).map(punto => [
        punto.id,
        { nombre: punto.nombre, numero_serie: punto.numero_serie },
      ])
    )

    return data.map(registro => ({
      ...registro,
      puntos_ferroviarios: puntosMap.get(registro.punto_id),
    }))
  } catch (error) {
    console.error('Error obteniendo historial completo:', error)
    return []
  }
}

// =====================================================
// MÓDULOS ESPECÍFICOS
// =====================================================

/**
 * Guarda coordenadas GPS
 */
export async function guardarCoordenadas(
  puntoId: string,
  x: number,
  y: number,
  z: number,
  notas?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('coordenadas_gps').upsert({
      punto_id: puntoId,
      latitud: y,
      longitud: x,
      altitud: z,
      notas: notas || '',
    }, { onConflict: 'punto_id' })

    if (error) throw error

    // Actualizar punto principal
    await supabase.from('puntos_ferroviarios').update({
      coordenada_lat: y,
      coordenada_lng: x,
      coordenada_z: z,
      updated_at: new Date().toISOString(),
    }).eq('id', puntoId)

    await registrarHistorial(puntoId, 'actualizacion', 'georeferencia', `Coordenadas actualizadas: X=${x}, Y=${y}, Z=${z}`)

    return { success: true }
  } catch (error) {
    console.error('Error guardando coordenadas:', error)
    const errorMsg = error && typeof error === 'object'
      ? (error as { message?: string }).message || JSON.stringify(error)
      : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Guarda documentación
 */
export async function guardarDocumentacion(
  puntoId: string,
  contenido: string,
  nombreArchivo?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('documentos_punto').upsert({
      punto_id: puntoId,
      nombre_archivo: nombreArchivo || 'documento.txt',
      contenido,
    }, { onConflict: 'punto_id' })

    if (error) throw error

    await registrarHistorial(puntoId, 'actualizacion', 'documentacion', 'Documentación actualizada')

    return { success: true }
  } catch (error) {
    console.error('Error guardando documentación:', error)
    const errorMsg = error && typeof error === 'object'
      ? (error as { message?: string }).message || JSON.stringify(error)
      : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Guarda resultado de análisis de imágenes
 */
export async function guardarAnalisis(
  puntoId: string,
  result: ImageAnalysisResult,
  imageUrls: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('analisis_imagenes').upsert({
      punto_id: puntoId,
      image_urls: imageUrls,
      description: result.description,
      objects: result.objects,
      mood: result.mood,
      quality: result.quality,
      model_used: result.modelUsed,
    }, { onConflict: 'punto_id' })

    if (error) throw error

    await registrarHistorial(puntoId, 'analisis', 'analisis', `Análisis completado con ${result.modelUsed}`)

    return { success: true }
  } catch (error) {
    console.error('Error guardando análisis:', error)
    const errorMsg = error && typeof error === 'object'
      ? (error as { message?: string }).message || JSON.stringify(error)
      : String(error)
    return { success: false, error: errorMsg }
  }
}

// =====================================================
// SINCRONIZACIÓN
// =====================================================

/**
 * Sincroniza todos los puntos del estado con Supabase
 */
export async function sincronizarPuntos(puntos: PuntoFerroviario[]): Promise<{
  success: boolean;
  guardados: number;
  errores: number;
  error?: string
}> {
  let guardados = 0
  let errores = 0

  for (const punto of puntos) {
    try {
      const result = await guardarPuntoCompleto(punto)
      if (result.success) {
        guardados++
      } else {
        errores++
        console.error(`Error guardando punto ${punto.numeroSerie}:`, result.error)
      }
    } catch (err) {
      errores++
      console.error(`Error excepción punto ${punto.numeroSerie}:`, err)
    }
  }

  return {
    success: errores === 0,
    guardados,
    errores,
    error: errores > 0 ? `${errores} puntos no pudieron guardarse` : undefined,
  }
}

/**
 * Carga puntos desde Supabase y los convierte al formato del frontend
 */
export async function cargarPuntosDesdeDB(): Promise<PuntoFerroviario[]> {
  return await cargarPuntosCompletos()
}
