import {
  type ModelId,
  type ProgressCallback,
  type ImageAnalysisResult,
  type ImageToAnalyze,
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  type OpenRouterResponse,
  type OpenRouterError,
} from '@/types'

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Re-exportar tipos y constantes para compatibilidad
export { AVAILABLE_MODELS, DEFAULT_MODEL }
export type { ModelId, ProgressCallback, ImageAnalysisResult, ImageToAnalyze }

export function getEstimatedTime(modelId: ModelId, imageCount: number): number {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
  if (!model) return 10 * imageCount
  return model.estimatedTimePerImage * imageCount
}

// Prompt simplificado para análisis de obras ferroviarias
function getRailwayAnalysisPrompt(imageCount: number): string {
  return `Eres un experto en ingeniería civil ferroviaria. Analiza ${imageCount > 1 ? 'estas imágenes' : 'esta imagen'} de obra civil relacionada con vías férreas.

FORMATO DE RESPUESTA (JSON estricto):

{
  "description": "Descripción técnica detallada de la obra. Incluye: tipo de obra (puente, túnel, terraplén, explanada, etc.), estado de avance, materiales visibles, condiciones del terreno y entorno.",
  "objects": ["rieles", "durmientes", "balasto", "terraplén", "hormigón", "acero", "maquinaria pesada"],
  "mood": "Ambiente de la zona: rural/urbano, clima, condiciones meteorológicas",
  "quality": "Evaluación técnica: estado de materiales, nivel de compactación, señales de erosión, drenaje"
}

Responde ÚNICAMENTE con el JSON válido, sin texto adicional.`
}

async function urlToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        if (result && result.startsWith('data:image')) {
          resolve(result)
        } else {
          resolve(null)
        }
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function analyzeImages(
  images: ImageToAnalyze[],
  modelId: ModelId = DEFAULT_MODEL,
  onProgress?: ProgressCallback
): Promise<ImageAnalysisResult[]> {
  // Verificar API Key
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'tu-api-key-de-openrouter') {
    throw new Error(
      'API Key de OpenRouter no configurada. Verifica el archivo .env'
    )
  }

  // Verificar que hay imágenes
  if (!images || images.length === 0) {
    throw new Error('No hay imágenes para analizar')
  }

  // Verificar modelo
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
  if (!model) {
    throw new Error(`Modelo no encontrado: ${modelId}`)
  }

  if (!model.supportsVision) {
    throw new Error(
      `El modelo ${model.name} no soporta análisis de imágenes`
    )
  }

  const estimatedTotalTime = getEstimatedTime(modelId, images.length)

  // Reportar inicio
  onProgress?.(5, 'Preparando imágenes...', estimatedTotalTime, 'Inicializando')

  // Preparar imágenes: data URLs se usan directamente, URLs externas se descargan y convierten
  const preparedImages = await Promise.all(
    images.map(async (img) => {
      if (!img.preview) return null
      if (img.preview.startsWith('data:image')) {
        return { ...img, preview: img.preview }
      }
      if (img.preview.startsWith('http')) {
        const base64 = await urlToBase64(img.preview)
        if (base64) {
          return { ...img, preview: base64 }
        }
      }
      return null
    })
  )

  const validImages = preparedImages.filter((img): img is ImageToAnalyze => img !== null)

  if (validImages.length === 0) {
    throw new Error('Las imágenes no tienen formato válido o no se pudieron descargar')
  }

  // Simular progreso de preparación
  await new Promise((resolve) => setTimeout(resolve, 300))
  onProgress?.(15, 'Enviando a OpenRouter...', estimatedTotalTime * 0.9, 'Enviando')

  // Construir el contenido con todas las imágenes
  // OpenRouter requiere base64 sin el prefijo data:image/xxx;base64,
  const imageContents = validImages.map((img) => {
    const base64Data = img.preview.split(',')[1] || img.preview
    return {
      type: 'image_url' as const,
      image_url: {
        url: `data:image/jpeg;base64,${base64Data}`,
      },
    }
  })

  onProgress?.(30, 'Procesando con IA...', estimatedTotalTime * 0.8, 'Analizando')

  try {
    const requestBody = {
      model: modelId,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: getRailwayAnalysisPrompt(validImages.length),
            },
            ...imageContents,
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': window.location.origin || 'http://localhost:5173',
        'X-Title': 'Image Analyzer - Railway Analysis',
      },
      body: JSON.stringify(requestBody),
    })

    onProgress?.(70, 'Procesando respuesta...', estimatedTotalTime * 0.3, 'Procesando')

    // Manejar errores HTTP
    if (!response.ok) {
      let errorMessage = `Error HTTP ${response.status}: ${response.statusText}`
      
      try {
        const errorData: OpenRouterError = await response.json()
        
        if (errorData.error?.message) {
          errorMessage = errorData.error.message
        } else if (errorData.message) {
          errorMessage = errorData.message
        }

        if (errorMessage.includes('image') || errorMessage.includes('vision')) {
          errorMessage = `El modelo ${model.name} no soporta imágenes. Intenta con GPT-4o.`
        }
        
        if (response.status === 401) {
          errorMessage = 'API Key inválida. Verifica tu archivo .env'
        }
        
        if (response.status === 429) {
          errorMessage = 'Límite de solicitudes excedido. Espera un momento.'
        }
        
        if (response.status === 402) {
          errorMessage = 'Créditos insuficientes en OpenRouter.'
        }
      } catch {
        // Si no se puede parsear el error
      }

      throw new Error(errorMessage)
    }

    onProgress?.(85, 'Analizando resultados...', estimatedTotalTime * 0.1, 'Analizando')

    const data: OpenRouterResponse = await response.json()

    if (!data.choices || data.choices.length === 0) {
      throw new Error('La respuesta no contiene resultados válidos')
    }

    const content = data.choices[0]?.message?.content || ''

    if (!content) {
      throw new Error('El modelo no generó contenido')
    }

    onProgress?.(95, 'Finalizando...', 1, 'Finalizando')

    try {
      // Intentar extraer JSON de la respuesta
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        
        onProgress?.(100, 'Completado', 0, 'Completado')
        
        return [
          {
            description: parsed.description || 'No se generó descripción',
            objects: Array.isArray(parsed.objects) ? parsed.objects : [],
            mood: parsed.mood || '',
            quality: parsed.quality || '',
            rawResponse: content,
            modelUsed: model.name,
          },
        ]
      }
    } catch {
      // Si no se pudo parsear JSON
    }

    // Si no se pudo parsear JSON, devolver el texto como descripción
    onProgress?.(100, 'Completado', 0, 'Completado')

    return [
      {
        description: content,
        objects: [],
        mood: '',
        quality: '',
        rawResponse: content,
        modelUsed: model.name,
      },
    ]
  } catch (error) {
    onProgress?.(0, 'Error', 0, 'Error')
    
    if (error instanceof Error) {
      throw error
    }
    
    throw new Error('Error desconocido durante el análisis')
  }
}

// Función para analizar imágenes individualmente
export async function analyzeImage(
  imageBase64: string,
  modelId: ModelId = DEFAULT_MODEL,
  onProgress?: ProgressCallback
): Promise<ImageAnalysisResult> {
  const results = await analyzeImages(
    [
      {
        id: 'single',
        file: new File([], 'image.jpg'),
        preview: imageBase64,
        result: null,
        isAnalyzing: false,
        error: null,
      },
    ],
    modelId,
    onProgress
  )
  return results[0]
}
