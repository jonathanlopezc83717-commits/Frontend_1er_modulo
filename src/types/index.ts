/**
 * Tipos centralizados para el Analizador de Imágenes Ferroviarias
 */

// Tipos de modelo de IA
export type ModelId = 'openai/gpt-4o' | 'openai/gpt-4o-mini'

export interface AIModel {
  id: ModelId
  name: string
  provider: string
  description: string
  maxImages: number
  estimatedTimePerImage: number
  supportsVision: boolean
}

// Tipos para imágenes
export interface ImageItem {
  id: string
  file: File
  preview: string
}

// Tipos para resultados de análisis
export interface ImageAnalysisResult {
  description: string
  objects: string[]
  mood: string
  quality: string
  rawResponse: string
  modelUsed: string
}

// Tipo para imágenes en proceso de análisis
export interface ImageToAnalyze extends ImageItem {
  result: ImageAnalysisResult | null
  isAnalyzing: boolean
  error: string | null
}

// Tipos para el historial de Supabase
export interface AnalysisHistory {
  id: string
  image_urls: string[]  // Array de URLs (nuevo campo)
  image_url?: string    // Campo antiguo para compatibilidad con datos existentes
  description: string
  objects: string[]
  mood: string
  quality: string
  model_used: string
  created_at: string
}

// Tipos para progreso de análisis
export interface AnalysisProgress {
  progress: number
  status: string
  estimatedTimeRemaining: number
  stepName: string
}

// Callback para actualización de progreso
export type ProgressCallback = (
  progress: number,
  status: string,
  estimatedTimeRemaining?: number,
  stepName?: string
) => void

// Tipos para respuesta de OpenRouter
export interface OpenRouterResponse {
  id: string
  choices: Array<{
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  model: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface OpenRouterError {
  error?: {
    message: string
    type?: string
    code?: string
  }
  message?: string
}

// Tipos para props de componentes
export interface ImageUploaderProps {
  onImagesSelect: (images: ImageItem[]) => void
  selectedImages: ImageItem[]
  onClear: () => void
  onRemoveImage: (id: string) => void
  maxImages?: number
  isAnalyzing?: boolean
}

export interface AnalysisResultProps {
  results: ImageAnalysisResult[]
  imageUrls?: string[]  // URLs de las imágenes analizadas
  isLoading: boolean
  onResultChange?: (index: number, result: ImageAnalysisResult) => void
}

export interface ModelSelectorProps {
  selectedModel: ModelId
  onModelChange: (model: ModelId) => void
}

export interface ProgressBarProps {
  progress: number
  status: string
  estimatedTimeRemaining: number
  stepName: string
}

// ============ NUEVOS TIPOS PARA SISTEMA DE PUNTOS ============

export interface PuntoFerroviario {
  id: string
  numeroSerie: number
  nombre: string
  descripcion?: string
  carpetaPath?: string
  /** Cadenamiento (prefijo separado de una coordenada X/Y/Z al sincronizar) */
  cadenamiento?: string
  coordenadas?: {
    lat: number
    lng: number
  }
  bloqueado?: boolean
  estadoAprobacion?: 'pendiente' | 'revisado' | 'aprobado'
  versiones?: Array<{ snapshot: PuntoFerroviario; timestamp: string }>
  moduloData: Record<string, unknown> & {
    analisis?: {
      results?: ImageAnalysisResult[]
      imageUrls?: string[]
      imageItems?: Array<{ file: File; preview: string; id: string }>
      fotosIndexadas?: Array<{
        id: string
        index: number
        nombre: string
        nombreFormateado: string
        subcarpeta: string
        preview: string
      }>
      fotosCount?: number
      subcarpetas?: string[]
      modelUsed?: string
      analyzedAt?: string
      updatedAt?: string
      resultadosPorImagen?: Array<{
        fotoId: string
        fotoNombre: string
        descripcion: string
        objetos: string[]
      }>
      descripcionGeneral?: string
    }
    georeferencia?: {
      coordenadas?: { x: number; y: number; z: number }
      notas?: string
      updatedAt?: string
    }
    // Compatibilidad con datos antiguos
    georeferenciacion?: {
      coordenadas?: { x: number; y: number; z: number }
      notas?: string
      updatedAt?: string
    }
    documentacion?: {
      notas?: string
      nombreArchivo?: string
      nomenclaturas?: Array<{
        id: string
        codigo: string
        definicion: string
      }>
      updatedAt?: string
    }
    ambiental?: {
      impacto?: string
      medidas?: string
      vegetacion?: string
      fauna?: string
      updatedAt?: string
      plantillas?: Record<string, {
        nombre: string
        campos: Array<{
          id: string
          tipo: 'texto' | 'imagen'
          etiqueta: string
          valor: string
          imagenPreview?: string
        }>
        updatedAt: string
      }>
    }
    ficha?: Record<string, unknown>
  }
  createdAt: string
  updatedAt: string
}

export interface ModuloConfig {
  id: string
  nombre: string
  descripcion: string
  icono: string
  componente: string
}

export interface AppState {
  puntos: PuntoFerroviario[]
  puntoActivo: PuntoFerroviario | null
  moduloActivo: string
  modulosOrden: string[] | null
  nomenclaturasGlobales: Array<{
    id: string
    codigo: string
    definicion: string
  }>
  plantillasFormato: PlantillaFormato[]
  plantillasPdfFormato: PlantillaPdfFormato[]
  plantillasFicha: PlantillaFormato[]
  estadosGuardados: EstadoGuardado[]
}

export interface PlantillaCampoFormato {
  sheet: string
  cell: string
}

export interface PlantillaImagenFormato extends PlantillaCampoFormato {
  range: string
}

export interface PlantillaFormato {
  id: string
  nombre: string
  archivoNombre: string
  archivoBase64?: string
  createdAt: string
  campos: Record<string, PlantillaCampoFormato>
  imagenes: Record<string, PlantillaImagenFormato>
}

export interface PlantillaPdfCampoFormato {
  id: string
  campo: string
  etiqueta: string
  tipo: 'texto' | 'imagen'
  page: number
  x: number
  y: number
  fontSize?: number
  width?: number
  height?: number
}

export interface PlantillaPdfFormato {
  id: string
  nombre: string
  archivoNombre: string
  archivoBase64?: string
  createdAt: string
  tipo?: 'imagen' | 'pdf' | 'excel'
  campos: PlantillaPdfCampoFormato[]
}

export interface EstadoGuardado {
  id: string
  tipo: 'manual' | 'automatico'
  descripcion: string
  createdAt: string
  snapshotCompleto?: boolean
  snapshot: {
    puntos: PuntoFerroviario[]
    puntoActivoId: string | null
    moduloActivo: string
    modulosOrden?: string[] | null
    nomenclaturasGlobales: AppState['nomenclaturasGlobales']
    plantillasFormato?: PlantillaFormato[]
    plantillasPdfFormato?: PlantillaPdfFormato[]
    plantillasFicha?: PlantillaFormato[]
  }
}

export type AppAction =
  | { type: 'SET_PUNTOS'; payload: PuntoFerroviario[] }
  | { type: 'SET_NOMENCLATURAS_GLOBALES'; payload: AppState['nomenclaturasGlobales'] }
  | { type: 'SET_PLANTILLAS_FORMATO'; payload: PlantillaFormato[] }
  | { type: 'SET_PLANTILLAS_PDF_FORMATO'; payload: PlantillaPdfFormato[] }
  | { type: 'SET_PLANTILLAS_FICHA'; payload: PlantillaFormato[] }
  | { type: 'SET_ESTADOS_GUARDADOS'; payload: EstadoGuardado[] }
  | { type: 'AGREGAR_ESTADO_GUARDADO'; payload: EstadoGuardado }
  | { type: 'RESTAURAR_ESTADO_GUARDADO'; payload: EstadoGuardado['snapshot'] }
  | { type: 'AGREGAR_PUNTO'; payload: { posicion: number; punto: Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'> } }
  | { type: 'ELIMINAR_PUNTO'; payload: string }
  | { type: 'SET_PUNTO_ACTIVO'; payload: PuntoFerroviario | null }
  | { type: 'SET_MODULO_ACTIVO'; payload: string }
  | { type: 'REORDENAR_MODULOS'; payload: string[] }
  | { type: 'ACTUALIZAR_PUNTO'; payload: { id: string; data: Partial<PuntoFerroviario> } }
  | { type: 'REORDENAR_PUNTOS'; payload: PuntoFerroviario[] }
  | { type: 'BLOQUEAR_PUNTO'; payload: string }
  | { type: 'RENUMERAR_PUNTOS'; payload: string[] }
  | { type: 'PUSH_VERSION_PUNTO'; payload: string }
  | { type: 'DESHACER_PUNTO'; payload: string }

// Constantes
export const AVAILABLE_MODELS: AIModel[] = [
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    description: 'Máxima calidad para análisis detallado',
    maxImages: 4,
    estimatedTimePerImage: 8,
    supportsVision: true,
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    description: 'Rápido y económico',
    maxImages: 4,
    estimatedTimePerImage: 4,
    supportsVision: true,
  },
]

export const MODULOS: ModuloConfig[] = [
  { id: 'analisis', nombre: 'Análisis de Imágenes', descripcion: 'Análisis visual con IA', icono: 'Wand2', componente: 'ModuloAnalisis' },
  { id: 'georeferencia', nombre: 'Georeferencia', descripcion: 'Ubicación GPS y coordenadas', icono: 'MapPin', componente: 'ModuloGeoreferencia' },
  { id: 'documentacion', nombre: 'Documentación', descripcion: 'Documentos técnicos y planos', icono: 'FileText', componente: 'ModuloDocumentacion' },
  { id: 'ficha', nombre: 'Ficha', descripcion: 'Ficha editable desde Excel', icono: 'FileSpreadsheet', componente: 'ModuloFicha' },
  { id: 'reportes', nombre: 'Checklist', descripcion: 'Verificación de módulos completados', icono: 'BarChart3', componente: 'ModuloReportes' },
  { id: 'sincronizacion', nombre: 'Sincronización', descripcion: 'Sincronizar puntos desde Excel con nomenclaturas', icono: 'RefreshCw', componente: 'ModuloSincronizacion' },
  { id: 'materiales', nombre: 'Formato', descripcion: 'Formato editable desde Excel', icono: 'Package', componente: 'ModuloMateriales' },
  { id: 'nomenclaturas', nombre: 'Nomenclaturas', descripcion: 'Códigos y nomenclaturas registradas', icono: 'Tag', componente: 'ModuloNomenclaturas' },
]

export const DEFAULT_MODEL: ModelId = 'openai/gpt-4o'
export const MAX_IMAGES = 4
export const DEBOUNCE_MS = 500
export const MAX_VERSIONES_PUNTO = 3
