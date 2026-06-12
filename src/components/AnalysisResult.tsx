import type { AnalysisResultProps } from '@/types'
import { Sparkles, Box, Smile, Gauge, Brain, FileText, Images } from 'lucide-react'
import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export function AnalysisResult({ results, imageUrls, isLoading, onResultChange }: AnalysisResultProps) {
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null)
  const validImageUrls = (imageUrls || []).filter(url => typeof url === 'string' && url.trim().length > 0)

  const actualizarDescripcion = (index: number, description: string) => {
    const result = results[index]
    if (!result || !onResultChange) return

    onResultChange(index, {
      ...result,
      description,
    })
  }

  if (isLoading) {
    return (
      <div className="bg-surface rounded-xl border border-border p-8 shadow-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-text">Analizando imágenes...</p>
            <p className="text-sm text-text-muted mt-1">
              Procesando con IA
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!results || results.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Imágenes analizadas - mostrar primero y más grandes */}
      {validImageUrls.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center gap-2 text-text mb-4">
            <Images className="w-5 h-5 text-primary" />
            <h3 className="font-medium">Imágenes Analizadas ({validImageUrls.length})</h3>
          </div>
          <div className={`grid gap-3 ${validImageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {validImageUrls.map((url, idx) => (
              <div 
                key={idx} 
                className="rounded-lg overflow-hidden border border-border cursor-pointer hover:border-primary transition-colors group"
                onClick={() => setImagenAmpliada(url)}
              >
                <img
                  src={url}
                  alt={`Imagen analizada ${idx + 1}`}
                  className="w-full h-[200px] object-cover group-hover:scale-105 transition-transform"
                  onError={(e) => {
                    // Si falla la URL de Supabase, intentar con preview local
                    const target = e.target as HTMLImageElement
                    if (target.src !== url && !target.src.startsWith('data:')) {
                      target.src = url
                    }
                  }}
                />
                <div className="p-2 bg-muted/50 text-center">
                  <span className="text-xs text-muted-foreground">Imagen {idx + 1}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.map((result, index) => (
        <div key={index} className="bg-surface rounded-xl border border-border p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-text">
                Resultado del Análisis
              </h2>
              {result.modelUsed && (
                <div className="flex items-center gap-1 text-xs text-text-muted mt-0.5">
                  <Brain className="w-3 h-3" />
                  <span>{result.modelUsed}</span>
                </div>
              )}
            </div>
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-text">
              <FileText className="w-4 h-4 text-primary" />
              <h3 className="font-medium">Descripción de la Obra</h3>
            </div>
            {onResultChange ? (
              <Textarea
                value={result.description}
                onChange={(event) => actualizarDescripcion(index, event.target.value)}
                className="ml-6 min-h-[140px] resize-y"
              />
            ) : (
              <p className="text-text-muted leading-relaxed pl-6">{result.description}</p>
            )}
          </div>

          {/* Objetos */}
          {result.objects && result.objects.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-text">
                <Box className="w-4 h-4 text-primary" />
                <h3 className="font-medium">Elementos Detectados</h3>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                {result.objects.map((obj, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full"
                  >
                    {obj}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Ambiente */}
          {result.mood && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-text">
                <Smile className="w-4 h-4 text-primary" />
                <h3 className="font-medium">Condiciones del Entorno</h3>
              </div>
              <p className="text-text-muted pl-6">{result.mood}</p>
            </div>
          )}

          {/* Calidad */}
          {result.quality && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-text">
                <Gauge className="w-4 h-4 text-primary" />
                <h3 className="font-medium">Evaluación Técnica</h3>
              </div>
              <p className="text-text-muted pl-6">{result.quality}</p>
            </div>
          )}
        </div>
      ))}

      {/* Dialog para imagen ampliada */}
      <Dialog open={!!imagenAmpliada} onOpenChange={() => setImagenAmpliada(null)}>
        <DialogContent className="max-w-4xl w-[90vw] p-0 overflow-hidden">
          {imagenAmpliada && (
            <div className="flex items-center justify-center bg-black/5 p-4">
              <img
                src={imagenAmpliada}
                alt="Imagen ampliada"
                className="max-w-full max-h-[80vh] object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
