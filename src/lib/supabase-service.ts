/**
 * Servicio de Supabase para persistencia de Puntos Ferroviarios
 * CRUD completo con todas las tablas relacionadas
 */

import { supabase } from './supabase'
import { subirImagenDedup } from './storage-dedup'
import type { PuntoFerroviario, ImageAnalysisResult, Perfil, Proyecto, RolUsuario } from '@/types'

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
  modulo_data?: Record<string, unknown> | null
  proyecto_id?: string
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

function combinarModuloData(
  guardado: Record<string, unknown> | null | undefined,
  construido: Record<string, unknown>
): Record<string, unknown> {
  if (!guardado) return construido
  const combinado: Record<string, unknown> = { ...guardado }
  for (const [key, valor] of Object.entries(construido)) {
    const previo = guardado[key]
    const ambosObjetos =
      previo && typeof previo === 'object' && !Array.isArray(previo) &&
      valor && typeof valor === 'object' && !Array.isArray(valor)
    combinado[key] = ambosObjetos
      ? { ...(previo as Record<string, unknown>), ...(valor as Record<string, unknown>) }
      : valor
  }
  return combinado
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

  if (db.modulo_data) {
    punto.moduloData = combinarModuloData(db.modulo_data, punto.moduloData) as PuntoFerroviario['moduloData']
  }

  return punto
}

// =====================================================
// CRUD: PUNTOS FERROVIARIOS
// =====================================================

export interface PuntoPayload {
  punto: Partial<PuntoDB>
  coordenadas: { coordenada_x: number; coordenada_y: number; coordenada_z: number; notas: string } | null
  documentos: { nombre_archivo: string; contenido: string } | null
  analisis: { image_urls: string[]; description: string; objects: string[]; mood: string; quality: string; model_used: string } | null
  fotos: Array<{ indice: number; nombre_archivo: string; nombre_formateado: string; subcarpeta: string; preview_url: string }> | null
}

const CLAVES_PESADAS = new Set(['file', 'archivoBase64'])

export async function sustituirDataUrlsEnArbol(
  valor: unknown,
  subir: (dataUrl: string) => Promise<string>,
  omitir: string[] = []
): Promise<unknown> {
  if (typeof valor === 'string') {
    return valor.startsWith('data:image') ? subir(valor) : valor
  }
  if (Array.isArray(valor)) {
    return Promise.all(valor.map(item => sustituirDataUrlsEnArbol(item, subir, omitir)))
  }
  if (!valor || typeof valor !== 'object') return valor

  const omitidos = new Set([...CLAVES_PESADAS, ...omitir])
  const resultado: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(valor as Record<string, unknown>)) {
    if (omitidos.has(key)) continue
    resultado[key] = await sustituirDataUrlsEnArbol(item, subir, omitir)
  }
  return resultado
}

type FotoIndexadaAnalisis = NonNullable<NonNullable<PuntoFerroviario['moduloData']['analisis']>['fotosIndexadas']>[number]

/**
 * Construye el payload `{ punto, coordenadas, documentos, analisis, fotos }`
 * esperado por el RPC `guardar_punto_completo`, más el `moduloDataPersistido`
 * (data URLs resueltas a URLs de Storage). Solo se persisten las fotos que
 * pasaron por reconocimiento (`resultadosPorImagen`); las demás se descartan
 * del estado guardado sin tocar la carpeta origen. Comparte lógica entre
 * `guardarPuntoCompleto` y `sincronizarPuntos` (E2).
 */
export async function construirPayloadPunto(
  punto: PuntoFerroviario,
  proyectoId: string
): Promise<{ payload: PuntoPayload; moduloDataPersistido: Record<string, unknown> }> {
  const puntoDb = puntoToDB(punto)
  puntoDb.proyecto_id = proyectoId

  const geoData = punto.moduloData?.georeferencia || punto.moduloData?.georeferenciacion
  let coordenadas: PuntoPayload['coordenadas'] = null
  if (geoData?.coordenadas) {
    coordenadas = {
      coordenada_x: geoData.coordenadas.x,
      coordenada_y: geoData.coordenadas.y,
      coordenada_z: geoData.coordenadas.z,
      notas: geoData.notas || '',
    }
  }

  const documentacion = punto.moduloData?.documentacion
  let documentos: PuntoPayload['documentos'] = null
  if (documentacion?.notas) {
    documentos = {
      nombre_archivo: documentacion.nombreArchivo || 'documento.txt',
      contenido: documentacion.notas,
    }
  }

  const analisisModulo = punto.moduloData?.analisis
  let analisis: PuntoPayload['analisis'] = null
  if (analisisModulo?.results && analisisModulo.results.length > 0) {
    const result = analisisModulo.results[0]
    analisis = {
      image_urls: analisisModulo.imageUrls || [],
      description: result.description,
      objects: result.objects,
      mood: result.mood,
      quality: result.quality,
      model_used: result.modelUsed,
    }
  }

  let fotosAnalizadas: FotoIndexadaAnalisis[] = []
  if (analisisModulo?.fotosIndexadas && analisisModulo.fotosIndexadas.length > 0) {
    const analizadas = new Set((analisisModulo.resultadosPorImagen ?? []).map(r => r.fotoId))
    fotosAnalizadas = await Promise.all(
      analisisModulo.fotosIndexadas
        .filter(f => analizadas.has(f.id))
        .map(async f => ({
          ...f,
          preview: f.preview.startsWith('data:image')
            ? await dataUrlAArchivoStorage(f.preview, `puntos/${punto.id}/fotos`)
            : f.preview,
        })),
    )
  }

  let fotos: PuntoPayload['fotos'] = null
  if (fotosAnalizadas.length > 0) {
    fotos = fotosAnalizadas.map(f => ({
      indice: f.index,
      nombre_archivo: f.nombre,
      nombre_formateado: f.nombreFormateado,
      subcarpeta: f.subcarpeta,
      preview_url: f.preview,
    }))
  }

  puntoDb.modulo_data = await sustituirDataUrlsEnArbol(
    punto.moduloData || {},
    dataUrl => subirImagenDedup(dataUrl, `puntos/${punto.id}/modulo`),
    ['fotosIndexadas']
  ) as Record<string, unknown>

  // Vista para el estado local (no para DB): igual al modulo_data persistido
  // pero con analisis.fotosIndexadas solo con las fotos que pasaron por
  // reconocimiento, previews resueltas a URLs de Storage.
  const moduloDataPersistido: Record<string, unknown> = { ...puntoDb.modulo_data }
  if (analisisModulo) {
    moduloDataPersistido.analisis = {
      ...((puntoDb.modulo_data.analisis ?? {}) as Record<string, unknown>),
      fotosIndexadas: fotosAnalizadas,
      fotosCount: fotosAnalizadas.length,
    }
  }

  return { payload: { punto: puntoDb, coordenadas, documentos, analisis, fotos }, moduloDataPersistido }
}

/**
 * Guarda o actualiza un punto completo con todas sus relaciones.
 * Un único RPC transaccional (`guardar_punto_completo`). Devuelve el
 * `moduloData` ya persistido (imágenes resueltas a URLs) para que el
 * llamador pueda sincronizar su estado local.
 */
export async function guardarPuntoCompleto(punto: PuntoFerroviario, proyectoId: string): Promise<{ success: boolean; error?: string; moduloData?: Record<string, unknown> }> {
  try {
    const { payload, moduloDataPersistido } = await construirPayloadPunto(punto, proyectoId)
    const { data, error } = await supabase.rpc('guardar_punto_completo', { p_payload: payload })
    if (error) throw error

    const resultado = data as { success?: boolean; error?: string } | null
    if (resultado && resultado.success === false) {
      return { success: false, error: resultado.error || 'Error desconocido guardando el punto' }
    }

    return { success: true, moduloData: moduloDataPersistido }
  } catch (error) {
    console.error('Error guardando punto:', error)
    const errorMsg = error && typeof error === 'object'
      ? (error as { message?: string }).message || JSON.stringify(error)
      : String(error)
    return { success: false, error: errorMsg }
  }
}

/**
 * Carga todos los puntos con sus relaciones en una sola llamada RPC
 * (cargar_puntos_completos). El join server-side reemplaza las 5 consultas
 * separadas previas y evita el error PGRST200 sin workarounds del cliente.
 */
export async function cargarPuntosCompletos(proyectoId: string): Promise<PuntoFerroviario[]> {
  try {
    const { data, error } = await supabase.rpc('cargar_puntos_completos', { p_proyecto: proyectoId })
    if (error) throw error
    if (!data || !Array.isArray(data) || data.length === 0) return []
    return (data as PuntoDB[]).map(puntoFromDB)
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

    return { success: true }
  } catch (error) {
    console.error('Error eliminando punto:', error)
    return { success: false, error: String(error) }
  }
}

// =====================================================
// HISTORIAL
// =====================================================

async function dataUrlAArchivoStorage(dataUrl: string, prefix = 'snapshots'): Promise<string> {
  return subirImagenDedup(dataUrl, prefix)
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
 * Sincroniza todos los puntos del estado con Supabase.
 *
 * Modelo batch (E2): un único `supabase.functions.invoke('sincronizar-puntos')`
 * en vez de N RPCs cliente→DB. El Edge Function invoca el RPC
 * `guardar_punto_completo` para cada punto server-side con concurrencia 5.
 *
 * LIMITACIÓN de progreso: como todo el lote viaja en una sola invocación,
 * `onLote` ahora solo dispara al inicio (0, total) y al fin (total, total).
 * El progreso fino por-lote anterior (cada pocos puntos) se pierde — inherente
 * al modelo batch. `opciones.concurrency` se ignora client-side (la
 * concurrencia es server-side fija en 5).
 */
export async function sincronizarPuntos(
  puntos: PuntoFerroviario[],
  proyectoId: string,
  opciones?: { concurrency?: number; onLote?: (guardados: number, total: number) => void }
): Promise<{
  success: boolean;
  guardados: number;
  errores: number;
  error?: string;
  actualizaciones?: Array<{ puntoId: string; moduloData: Record<string, unknown> }>
}> {
  if (puntos.length === 0) {
    return { success: true, guardados: 0, errores: 0 }
  }

  opciones?.onLote?.(0, puntos.length)

  try {
    const construidos = await Promise.all(puntos.map(punto => construirPayloadPunto(punto, proyectoId)))
    const payloads = construidos.map(c => c.payload)

    const { data, error } = await supabase.functions.invoke<{
      guardados: number
      errores: number
      detalles: Array<{ success: boolean; error?: string }>
    }>('sincronizar-puntos', {
      body: { puntos: payloads },
    })

    if (error) throw error

    const guardados = data?.guardados ?? 0
    const errores = data?.errores ?? 0
    const fallidos = data?.detalles?.filter((d) => !d.success) ?? []
    if (fallidos.length > 0) {
      console.error('sincronizarPuntos: puntos que fallaron:', fallidos)
    }
    opciones?.onLote?.(puntos.length, puntos.length)

    // moduloData persistido (URLs + solo fotos analizadas) de los puntos que
    // el servidor guardó bien, para que el llamador aligere su estado local.
    const actualizaciones = (data?.detalles ?? [])
      .map((d, i) => (d?.success && puntos[i]
        ? { puntoId: puntos[i].id, moduloData: construidos[i].moduloDataPersistido }
        : null))
      .filter((x): x is { puntoId: string; moduloData: Record<string, unknown> } => x !== null)

    const primerError = fallidos[0]?.error
    return {
      success: errores === 0,
      guardados,
      errores,
      error: errores > 0
        ? `${errores} punto(s) no pudieron guardarse${primerError ? `: ${primerError}` : ''}`
        : undefined,
      actualizaciones,
    }
  } catch (error) {
    opciones?.onLote?.(puntos.length, puntos.length)
    console.error('Error en sincronizarPuntos (batch):', error)
    const errorMsg = error && typeof error === 'object'
      ? (error as { message?: string; context?: Response }).message ||
        ((error as { context?: Response }).context ? `Edge Function HTTP ${((error as { context: Response }).context).status}` : JSON.stringify(error))
      : String(error)
    return { success: false, guardados: 0, errores: puntos.length, error: errorMsg }
  }
}

/**
 * Carga puntos desde Supabase y los convierte al formato del frontend
 */
export async function cargarPuntosDesdeDB(proyectoId: string): Promise<PuntoFerroviario[]> {
  return await cargarPuntosCompletos(proyectoId)
}

// =====================================================
// PROYECTOS
// =====================================================

export async function listarProyectos(): Promise<Proyecto[]> {
  const { data, error } = await supabase.rpc('listar_proyectos_con_meta')
  if (error || !data) return []
  const proyectos = (data as Proyecto[]).filter((p) => p.estado !== 'eliminado')
  proyectos.sort((a, b) => a.nombre.localeCompare(b.nombre))
  return proyectos
}

export async function crearProyecto(proyecto: Proyecto): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('proyectos')
    .insert({ id: proyecto.id, nombre: proyecto.nombre, descripcion: proyecto.descripcion })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function actualizarProyecto(
  id: string,
  cambios: { nombre?: string; descripcion?: string | null },
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('proyectos').update(cambios).eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function eliminarProyecto(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('eliminar_proyecto', { p_id: id })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// =====================================================
// MIEMBROS Y ROLES
// =====================================================

export interface MiembroProyecto {
  user_id: string
  creado_por: string
  creado_en: string
  email: string | null
  nombre: string | null
  rol: RolUsuario | null
}

export async function listarMiembrosProyecto(proyectoId: string): Promise<MiembroProyecto[]> {
  const { data, error } = await supabase.rpc('listar_miembros', { p_proyecto: proyectoId })
  if (error) {
    console.error('listarMiembrosProyecto:', error.message)
    return []
  }
  const filas = (data ?? []) as Array<{
    user_id: string
    email: string | null
    nombre: string | null
    rol: RolUsuario | null
    creado_por: string
    creado_en: string
  }>
  return filas.map((fila) => ({
    user_id: fila.user_id,
    creado_por: fila.creado_por,
    creado_en: fila.creado_en,
    email: fila.email ?? null,
    nombre: fila.nombre ?? null,
    rol: fila.rol ?? null,
  }))
}

export async function agregarMiembroProyecto(
  proyectoId: string,
  userId: string,
  creadoPor: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('proyecto_miembros').insert({
    proyecto_id: proyectoId,
    user_id: userId,
    creado_por: creadoPor,
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function quitarMiembroProyecto(
  proyectoId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('proyecto_miembros')
    .delete()
    .eq('proyecto_id', proyectoId)
    .eq('user_id', userId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function listarProyectosDeUsuario(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('proyecto_miembros')
    .select('proyecto_id')
    .eq('user_id', userId)
  if (error) {
    console.error('listarProyectosDeUsuario:', error.message)
    return []
  }
  return ((data ?? []) as Array<{ proyecto_id: string }>).map((fila) => fila.proyecto_id)
}

export async function listarPerfiles(): Promise<Perfil[]> {
  const { data, error } = await supabase.from('perfiles').select('*')
  if (error || !data) return []
  const perfiles = (data as Perfil[]).slice()
  perfiles.sort((a, b) => a.email.localeCompare(b.email))
  return perfiles
}

export async function cambiarRolUsuario(
  userId: string,
  rol: RolUsuario
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('perfiles').update({ rol }).eq('id', userId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

interface RespuestaInvitacion {
  user_id: string
  email: string
  rol: RolUsuario
  password_temporal: string
}

export async function invitarUsuario(
  email: string,
  rol: RolUsuario
): Promise<{ success: boolean; passwordTemporal?: string; userId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke<RespuestaInvitacion>('invite-user', {
      body: { email, rol },
    })
    if (error) throw error
    if (!data?.password_temporal) {
      return { success: false, error: 'La función no devolvió el password temporal' }
    }
    return { success: true, passwordTemporal: data.password_temporal, userId: data.user_id }
  } catch (err) {
    const contexto = (err as { context?: Response } | null)?.context
    if (contexto) {
      let mensajeServidor: string | undefined
      try {
        const cuerpo = (await contexto.json()) as { error?: string }
        mensajeServidor = cuerpo?.error
      } catch {
        mensajeServidor = undefined
      }
      const mensaje =
        mensajeServidor ||
        (contexto.status === 409 ? 'Ya existe un usuario con ese email' : undefined) ||
        (contexto.status === 403 ? 'No tenés permiso para invitar usuarios' : undefined) ||
        'No se pudo invitar al usuario'
      return { success: false, error: mensaje }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo invitar al usuario',
    }
  }
}
