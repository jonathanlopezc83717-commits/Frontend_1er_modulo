import { useState, useCallback, useEffect, useRef } from 'react'
import { useApp } from '@/context/AppContext'
import { ImageUploader, type ImageItem } from '@/components/ImageUploader'
import { AnalysisResult } from '@/components/AnalysisResult'
import { ModelSelector } from '@/components/ModelSelector'
import { ProgressBar } from '@/components/ProgressBar'
import { GaleriaFotos } from '@/components/GaleriaFotos'
import {
  analyzeImages,
  type ImageAnalysisResult,
  type ModelId,
  DEFAULT_MODEL,
  getEstimatedTime,
} from '@/lib/openrouter'
import { supabase } from '@/lib/supabase'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Images, Brain, AlertCircle, Trash2, Camera, Play, Square, Eye, FileText } from 'lucide-react'
import type { AnalysisProgress } from '@/types'

export function ModuloAnalisis() {
  const { state, actualizarPunto, guardarAnalisisDB } = useApp()
  const punto = state.puntoActivo

  const [selectedImages, setSelectedImages] = useState<ImageItem[]>([])
  const [analysisResults, setAnalysisResults] = useState<ImageAnalysisResult[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL)
  const [progress, setProgress] = useState<AnalysisProgress>({
    progress: 0,
    status: '',
    estimatedTimeRemaining: 0,
    stepName: '',
  })
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [fotosIndexadas, setFotosIndexadas] = useState<Array<{
    id: string
    index: number
    nombre: string
    nombreFormateado: string
    subcarpeta: string
    preview: string
  }>>([])
  const [fotosSeleccionadas, setFotosSeleccionadas] = useState<string[]>([])
  const [resultadosPorImagen, setResultadosPorImagen] = useState<Array<{
    fotoId: string
    fotoNombre: string
    descripcion: string
    objetos: string[]
  }>>([])
  const [descripcionGeneral, setDescripcionGeneral] = useState('')
  const [mostrarGaleria, setMostrarGaleria] = useState(false)
  const isAnalyzingRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Verificar si ya existe análisis guardado
  const tieneAnalisisGuardado = punto?.moduloData?.analisis?.results && punto.moduloData.analisis.results.length > 0
  const nombreCarpeta = punto?.carpetaPath
    ? punto.carpetaPath.split(/[\\/]/).filter(Boolean).pop() || punto.carpetaPath
    : ''
  const fotosConPreview = fotosIndexadas.filter(foto => foto.preview && foto.preview.trim().length > 0)

  // Cargar datos guardados del punto
  useEffect(() => {
    if (punto?.moduloData?.analisis) {
      const data = punto.moduloData.analisis
      setAnalysisResults(data.results || [])
      setImageUrls(
        data.imageUrls && data.imageUrls.length > 0
          ? data.imageUrls
          : data.fotosIndexadas?.map(foto => foto.preview) || []
      )
      
      // Cargar fotos indexadas
      if (data.fotosIndexadas) {
        setFotosIndexadas(data.fotosIndexadas)
      }
      
      // Cargar resultados por imagen si existen
      if (data.resultadosPorImagen) {
        setResultadosPorImagen(data.resultadosPorImagen)
      }
      
      // Cargar descripción general
      if (data.descripcionGeneral) {
        setDescripcionGeneral(data.descripcionGeneral)
      }
    } else {
      setSelectedImages([])
      setAnalysisResults([])
      setImageUrls([])
      setFotosIndexadas([])
      setFotosSeleccionadas([])
      setResultadosPorImagen([])
      setDescripcionGeneral('')
      setError(null)
    }
  }, [punto])

  const handleProgressUpdate = useCallback(
    (
      progressValue: number,
      status: string,
      estimatedTimeRemaining?: number,
      stepName?: string
    ) => {
      setProgress({
        progress: progressValue,
        status,
        estimatedTimeRemaining: estimatedTimeRemaining || 0,
        stepName: stepName || '',
      })
    },
    []
  )

  const performAnalysis = useCallback(
    async (images: ImageItem[]) => {
      if (images.length === 0 || !punto) return

      isAnalyzingRef.current = true
      setIsAnalyzing(true)
      setError(null)
      setAnalysisResults([])

      // Crear AbortController para poder cancelar
      abortControllerRef.current = new AbortController()

      const estimatedTime = getEstimatedTime(selectedModel, images.length)
      handleProgressUpdate(0, 'Iniciando análisis...', estimatedTime, 'Preparando')

      try {
        handleProgressUpdate(
          5,
          'Subiendo imágenes...',
          estimatedTime * 0.95,
          'Subiendo a Supabase'
        )

        const uploadPromises = images.map(async (image) => {
          const fileExt = image.file.name.split('.').pop()
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

          const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(fileName, image.file)

          if (uploadError) {
            console.warn('Storage upload failed:', uploadError)
            return null
          }

          const { data: { publicUrl } } = supabase.storage
            .from('images')
            .getPublicUrl(fileName)

          return publicUrl
        })

        const uploadedUrls = await Promise.all(uploadPromises)
        const displayUrls = images.map((image, index) => image.preview || uploadedUrls[index] || '')
          .filter(Boolean)
        setImageUrls(displayUrls)

        handleProgressUpdate(
          20,
          'Enviando a IA...',
          estimatedTime * 0.8,
          'Enviando a OpenRouter'
        )


        const results = await analyzeImages(
          images.map((img) => ({
            ...img,
            result: null,
            isAnalyzing: false,
            error: null,
          })),
          selectedModel,
          handleProgressUpdate
        )

        setAnalysisResults(results)

        // Guardar automáticamente en el punto
        if (results.length > 0) {
          const result = results[0]
          
          // Guardar en el estado local del punto
          actualizarPunto(punto.id, {
            moduloData: {
              ...punto.moduloData,
              analisis: {
                ...punto.moduloData?.analisis,
                results: results,
                imageUrls: displayUrls,
                modelUsed: selectedModel,
                analyzedAt: new Date().toISOString(),
              },
            },
          })

          // Guardar en Supabase
          try {
            await guardarAnalisisDB(punto.id, result, displayUrls)
          } catch (dbError) {
            console.error('Error guardando análisis en DB:', dbError)
          }
        }

        handleProgressUpdate(100, 'Completado', 0, 'Finalizado')
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setError('Análisis cancelado por el usuario')
          handleProgressUpdate(0, 'Cancelado', 0, 'Cancelado')
        } else {
          setError(err instanceof Error ? err.message : 'Error desconocido')
          handleProgressUpdate(0, 'Error', 0, 'Error')
        }
      } finally {
        isAnalyzingRef.current = false
        setIsAnalyzing(false)
        abortControllerRef.current = null
      }
    },
    [selectedModel, handleProgressUpdate, punto, actualizarPunto, guardarAnalisisDB]
  )

  const handleDetenerAnalisis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    isAnalyzingRef.current = false
    setIsAnalyzing(false)
    setError('Análisis detenido por el usuario')
    handleProgressUpdate(0, 'Detenido', 0, 'Detenido')
  }

  const handleImagesSelect = (images: ImageItem[]) => {
    setSelectedImages(images)
    setError(null)
  }

  const handleRemoveImage = (id: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== id))
    setAnalysisResults([])
    setError(null)
  }

  const handleClear = () => {
    setSelectedImages([])
    setAnalysisResults([])
    setError(null)
    setImageUrls([])
    setProgress({
      progress: 0,
      status: '',
      estimatedTimeRemaining: 0,
      stepName: '',
    })
  }

  const handleResultChange = (index: number, result: ImageAnalysisResult) => {
    if (!punto) return

    const nuevosResultados = analysisResults.map((item, itemIndex) =>
      itemIndex === index ? result : item
    )

    setAnalysisResults(nuevosResultados)
    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        analisis: {
          ...punto.moduloData?.analisis,
          results: nuevosResultados,
          imageUrls,
          modelUsed: selectedModel,
          updatedAt: new Date().toISOString(),
        },
      },
    })
  }

  // Cargar fotos desde la carpeta importada
  const handleCargarFotosDeCarpeta = async (fotosSeleccionadas?: typeof fotosIndexadas) => {
    const fotosACargar = fotosSeleccionadas || fotosIndexadas
    if (fotosACargar.length === 0) return
    
    // Convertir fotos indexadas a ImageItem
    const items: ImageItem[] = fotosACargar.map((foto) => {
      // Si ya es data URL, usarla directamente
      if (foto.preview.startsWith('data:')) {
        // Crear un File dummy para compatibilidad
        const mimeMatch = foto.preview.match(/data:([^;]+)/)
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
        return {
          id: foto.id,
          file: new File([], foto.nombre, { type: mimeType }),
          preview: foto.preview,
        }
      }
      
      // Si no es data URL, asumir que es una URL normal
      return {
        id: foto.id,
        file: new File([], foto.nombre, { type: 'image/jpeg' }),
        preview: foto.preview,
      }
    })
    
    setSelectedImages(items)
  }

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="w-12 h-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-muted-foreground">Selecciona un punto para comenzar el análisis</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-3 pr-2">
        {/* Info del punto */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">{punto.numeroSerie}</span>
              </div>
              <div>
                <p className="font-medium">{punto.nombre}</p>
                {nombreCarpeta && (
                  <p className="text-sm text-muted-foreground">{nombreCarpeta}</p>
                )}
              </div>
            </div>
            {tieneAnalisisGuardado && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Análisis completado
              </Badge>
            )}
          </CardContent>
        </Card>
        {/* Results */}
        <AnalysisResult
          results={analysisResults}
          imageUrls={imageUrls}
          isLoading={isAnalyzing}
          onResultChange={handleResultChange}
        />
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error en el análisis</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Resultados por imagen */}
        {resultadosPorImagen.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Images className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Descripción por Imagen</CardTitle>
              </div>
            </CardHeader>            
            <CardContent className="space-y-4">
              {resultadosPorImagen.map((resultado, idx) => (
                <div key={resultado.fotoId} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Imagen {idx + 1}</Badge>
                    <span className="text-sm font-medium">{resultado.fotoNombre}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{resultado.descripcion}</p>
                  {resultado.objetos.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {resultado.objetos.map((obj, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{obj}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              
              {descripcionGeneral && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      <CardTitle className="text-base">Descripción General</CardTitle>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{descripcionGeneral}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}



        {/* Galería de fotos indexadas */}
        {fotosIndexadas.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base">Galería de Fotos</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{fotosIndexadas.length} fotos</Badge>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setMostrarGaleria(!mostrarGaleria)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    {mostrarGaleria ? 'Ocultar' : 'Ver todas'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {mostrarGaleria ? (
                <GaleriaFotos
                  fotos={fotosIndexadas}
                  fotosSeleccionadas={fotosSeleccionadas}
                  onSeleccionChange={setFotosSeleccionadas}
                  onCargarParaAnalisis={(fotos) => {
                    handleCargarFotosDeCarpeta(fotos)
                    setFotosSeleccionadas(fotos.map(f => f.id))
                  }}
                />
              ) : (
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {fotosConPreview.slice(0, 6).map((foto) => (
                    <div 
                      key={foto.id} 
                      className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border cursor-pointer hover:border-primary transition-colors"
                      onClick={() => setMostrarGaleria(true)}
                    >
                      <img
                        src={foto.preview}
                        alt={foto.nombreFormateado}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {fotosConPreview.length > 6 && (
                    <div 
                      className="flex-shrink-0 w-16 h-16 rounded-lg border flex items-center justify-center bg-muted cursor-pointer hover:border-primary transition-colors"
                      onClick={() => setMostrarGaleria(true)}
                    >
                      <span className="text-sm font-medium">+{fotosConPreview.length - 6}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Upload Area */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Images className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">
                Imágenes ({selectedImages.length}/4)
              </CardTitle>
              {isAnalyzing && (
                <Badge variant="secondary" className="ml-2">Analizando...</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ImageUploader
              onImagesSelect={handleImagesSelect}
              selectedImages={selectedImages}
              onClear={handleClear}
              onRemoveImage={handleRemoveImage}
              maxImages={4}
              isAnalyzing={isAnalyzing}
            />
          </CardContent>
        </Card>

        {/* Botones de acción */}
        {selectedImages.length > 0 && (
          <div className="flex gap-2">
            {!isAnalyzing ? (
              <Button
                onClick={() => performAnalysis(selectedImages)}
                disabled={tieneAnalisisGuardado && analysisResults.length > 0}
                className="flex-1"
                size="sm"
              >
                <Play className="w-4 h-4 mr-2" />
                {tieneAnalisisGuardado && analysisResults.length > 0
                  ? 'Análisis ya realizado'
                  : 'Realizar reconocimiento'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleDetenerAnalisis}
                className="flex-1"
                size="sm"
              >
                <Square className="w-4 h-4 mr-2" />
                Detener reconocimiento
              </Button>
            )}
            
            {(analysisResults.length > 0 || selectedImages.length > 0) && (
              <Button
                variant="outline"
                onClick={handleClear}
                size="sm"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Limpiar
              </Button>
            )}
          </div>
        )}

        {/* Progress */}
        {isAnalyzing && progress.status && (
          <ProgressBar
            progress={progress.progress}
            status={progress.status}
            estimatedTimeRemaining={progress.estimatedTimeRemaining}
            stepName={progress.stepName}
          />
        )}

        {/* Error */}

        {/* Model */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Modelo de IA</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
            />
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}


