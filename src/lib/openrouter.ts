import {
  type ModelId,
  type ProgressCallback,
  type ImageAnalysisResult,
  type ResultadoAnalisisIA,
  type ContextoAnalisis,
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
} from '@/types'
import { supabase } from './supabase'

// Re-exportar tipos y constantes para compatibilidad de imports existentes
export { AVAILABLE_MODELS, DEFAULT_MODEL }
export type { ModelId, ProgressCallback, ImageAnalysisResult, ResultadoAnalisisIA, ContextoAnalisis }

export function getEstimatedTime(modelId: ModelId, imageCount: number): number {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
  if (!model) return 10 * imageCount
  return model.estimatedTimePerImage * imageCount
}

interface EdgeFunctionResponse {
  resultados_por_imagen: Array<{ descripcion: string; objetos: string[]; mood: string; quality: string }>
  descripcion_general: string
  modelo_usado: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface AnalyzeImagesOptions {
  modelo?: ModelId
  contexto?: ContextoAnalisis
  onProgress?: ProgressCallback
  signal?: AbortSignal
}

export async function analyzeImages(
  imageUrls: string[],
  options?: AnalyzeImagesOptions
): Promise<ResultadoAnalisisIA> {
  if (!imageUrls || imageUrls.length === 0) {
    throw new Error('No hay imágenes para analizar')
  }

  const estimatedTotalTime = getEstimatedTime(options?.modelo ?? DEFAULT_MODEL, imageUrls.length)
  options?.onProgress?.(5, 'Enviando a IA…', estimatedTotalTime, 'Enviando')

  let data: EdgeFunctionResponse | null = null

  try {
    const result = await supabase.functions.invoke<EdgeFunctionResponse>(
      'analyze-railway-images',
      {
        body: {
          image_urls: imageUrls,
          modelo: options?.modelo ?? DEFAULT_MODEL,
          contexto: options?.contexto,
        },
        signal: options?.signal,
      }
    )
    data = result.data
    if (result.error) {
      throw result.error
    }
  } catch (err) {
    if (options?.signal?.aborted) {
      const abort = new Error('Análisis cancelado por el usuario')
      abort.name = 'AbortError'
      throw abort
    }
    const ctx = (err as { context?: Response } | null)?.context
    if (ctx) {
      let serverMsg: string | undefined
      try {
        const body = (await ctx.json()) as { error?: string }
        serverMsg = body?.error
      } catch {
        // context not JSON or already consumed — fall through
      }
      if (serverMsg) throw new Error(serverMsg)
    }
    throw err instanceof Error ? err : new Error('Error al invocar la función de análisis')
  }

  if (!data) {
    throw new Error('La función no devolvió resultados')
  }

  options?.onProgress?.(55, 'Analizando imágenes…', estimatedTotalTime * 0.5, 'Analizando')
  options?.onProgress?.(90, 'Consolidando…', estimatedTotalTime * 0.1, 'Consolidando')

  const mapped: ResultadoAnalisisIA = {
    resultadosPorImagen: data.resultados_por_imagen.map((r) => ({
      descripcion: r.descripcion,
      objetos: r.objetos,
      mood: r.mood,
      quality: r.quality,
    })),
    descripcionGeneral: data.descripcion_general,
    modeloUsado: data.modelo_usado,
    usage: data.usage,
  }

  options?.onProgress?.(100, 'Completado', 0, 'Completado')
  return mapped
}
