import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, ChevronLeft, ChevronRight, Maximize2, CheckSquare, Square } from 'lucide-react'

interface FotoIndexada {
  id: string
  index: number
  nombre: string
  nombreFormateado: string
  subcarpeta: string
  preview: string
}

interface GaleriaFotosProps {
  fotos: FotoIndexada[]
  fotosSeleccionadas: string[]
  onSeleccionChange: (ids: string[]) => void
  onCargarParaAnalisis: (fotos: FotoIndexada[]) => void
}

export function GaleriaFotos({ fotos, fotosSeleccionadas, onSeleccionChange, onCargarParaAnalisis }: GaleriaFotosProps) {
  const [imagenAmpliada, setImagenAmpliada] = useState<FotoIndexada | null>(null)
  const [indiceActual, setIndiceActual] = useState(0)

  const toggleSeleccion = (id: string) => {
    if (fotosSeleccionadas.includes(id)) {
      onSeleccionChange(fotosSeleccionadas.filter(fId => fId !== id))
    } else {
      onSeleccionChange([...fotosSeleccionadas, id])
    }
  }

  const seleccionarTodas = () => {
    if (fotosSeleccionadas.length === fotos.length) {
      onSeleccionChange([])
    } else {
      onSeleccionChange(fotos.map(f => f.id))
    }
  }

  const abrirImagen = (foto: FotoIndexada, index: number) => {
    setImagenAmpliada(foto)
    setIndiceActual(index)
  }

  const navegarImagen = (direccion: 'anterior' | 'siguiente') => {
    const nuevoIndice = direccion === 'anterior' ? indiceActual - 1 : indiceActual + 1
    if (nuevoIndice >= 0 && nuevoIndice < fotos.length) {
      setIndiceActual(nuevoIndice)
      setImagenAmpliada(fotos[nuevoIndice])
    }
  }

  const handleCargarSeleccionadas = () => {
    const seleccionadas = fotos.filter(f => fotosSeleccionadas.includes(f.id))
    onCargarParaAnalisis(seleccionadas)
  }

  // Agrupar por subcarpeta
  const grupos = fotos.reduce((acc, foto) => {
    const key = foto.subcarpeta === 'raiz' ? 'Fotos principales' : foto.subcarpeta
    if (!acc[key]) acc[key] = []
    acc[key].push(foto)
    return acc
  }, {} as Record<string, FotoIndexada[]>)

  return (
    <div className="space-y-4">
      {/* Barra de herramientas */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={seleccionarTodas}
          >
            {fotosSeleccionadas.length === fotos.length ? (
              <><CheckSquare className="w-4 h-4 mr-1" /> Ninguna</>
            ) : (
              <><Square className="w-4 h-4 mr-1" /> Todas</>
            )}
          </Button>
          <Badge variant="secondary">
            {fotosSeleccionadas.length} de {fotos.length} seleccionadas
          </Badge>
        </div>
        
        {fotosSeleccionadas.length > 0 && (
          <Button
            size="sm"
            onClick={handleCargarSeleccionadas}
          >
            Cargar {fotosSeleccionadas.length} para análisis
          </Button>
        )}
      </div>

      {/* Grid de fotos */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-4">
          {Object.entries(grupos).map(([subcarpeta, fotosGrupo]) => (
            <div key={subcarpeta}>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">{subcarpeta}</h4>
              <div className="grid grid-cols-3 gap-2">
                {fotosGrupo.map((foto) => {
                  const globalIndex = fotos.findIndex(f => f.id === foto.id)
                  const isSelected = fotosSeleccionadas.includes(foto.id)
                  
                  return (
                    <div
                      key={foto.id}
                      className={`relative group rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => abrirImagen(foto, globalIndex)}
                    >
                      {/* Checkbox */}
                      <div 
                        className="absolute top-2 left-2 z-10"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSeleccion(foto.id)
                        }}
                      >
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => toggleSeleccion(foto.id)}
                        />
                      </div>
                      
                      {/* Imagen */}
                      <div className="aspect-square">
                        {foto.preview ? (
                          <img
                            src={foto.preview}
                            alt={foto.nombreFormateado}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-muted p-2 text-center text-xs text-muted-foreground">
                            {foto.nombreFormateado}
                          </div>
                        )}
                      </div>
                      
                      {/* Overlay con info */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="text-white text-xs truncate">{foto.nombreFormateado}</p>
                          <Badge variant="secondary" className="text-[10px] mt-1">
                            #{foto.index}
                          </Badge>
                        </div>
                        <button
                          className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            abrirImagen(foto, globalIndex)
                          }}
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {/* Indicador de selección */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                          <CheckSquare className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Dialog de imagen ampliada */}
      <Dialog open={!!imagenAmpliada} onOpenChange={() => setImagenAmpliada(null)}>
        <DialogContent className="max-w-4xl w-[90vw] h-[90vh] p-0 overflow-hidden">
          {imagenAmpliada && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={fotosSeleccionadas.includes(imagenAmpliada.id)}
                    onCheckedChange={() => toggleSeleccion(imagenAmpliada.id)}
                  />
                  <div>
                    <p className="font-medium">{imagenAmpliada.nombreFormateado}</p>
                    <p className="text-sm text-muted-foreground">
                      {imagenAmpliada.subcarpeta === 'raiz' ? 'Fotos principales' : imagenAmpliada.subcarpeta}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{indiceActual + 1} / {fotos.length}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => setImagenAmpliada(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              {/* Imagen grande */}
              <div className="flex-1 relative flex items-center justify-center bg-black/5 p-4">
                {imagenAmpliada.preview ? (
                  <img
                    src={imagenAmpliada.preview}
                    alt={imagenAmpliada.nombreFormateado}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="rounded border bg-muted px-4 py-3 text-sm text-muted-foreground">
                    Imagen no disponible
                  </div>
                )}
                
                {/* Navegación */}
                <button
                  className="absolute left-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors disabled:opacity-30"
                  onClick={() => navegarImagen('anterior')}
                  disabled={indiceActual === 0}
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                
                <button
                  className="absolute right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors disabled:opacity-30"
                  onClick={() => navegarImagen('siguiente')}
                  disabled={indiceActual === fotos.length - 1}
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
              
              {/* Footer */}
              <div className="p-4 border-t flex items-center justify-between">
                <Button
                  variant={fotosSeleccionadas.includes(imagenAmpliada.id) ? "default" : "outline"}
                  onClick={() => toggleSeleccion(imagenAmpliada.id)}
                >
                  {fotosSeleccionadas.includes(imagenAmpliada.id) ? 'Quitar selección' : 'Seleccionar para análisis'}
                </Button>
                
                <div className="flex gap-1">
                  {fotos.map((_, idx) => (
                    <button
                      key={idx}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        idx === indiceActual ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                      onClick={() => {
                        setIndiceActual(idx)
                        setImagenAmpliada(fotos[idx])
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
