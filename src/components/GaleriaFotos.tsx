import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, ChevronLeft, ChevronRight, Maximize2, CheckSquare, Square, ChevronDown, ChevronRight as ChevronRightIcon, Folder, FolderOpen } from 'lucide-react'

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
  // Por defecto todas las carpetas están retraídas para ocupar menos espacio
  const [carpetasAbiertas, setCarpetasAbiertas] = useState<Record<string, boolean>>({})
  const [expandirTodas, setExpandirTodas] = useState(false)

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

  // ponytail: toggle por carpeta. Reusa fotosSeleccionadas + onSeleccionChange,
  // sin tocar ModuloAnalisis. Union al seleccionar, diferencia al quitar.
  const toggleSeleccionCarpeta = (fotosGrupo: FotoIndexada[]) => {
    const idsGrupo = fotosGrupo.map(f => f.id)
    const todasSeleccionadas = idsGrupo.every(id => fotosSeleccionadas.includes(id))
    if (todasSeleccionadas) {
      onSeleccionChange(fotosSeleccionadas.filter(id => !idsGrupo.includes(id)))
    } else {
      onSeleccionChange(Array.from(new Set([...fotosSeleccionadas, ...idsGrupo])))
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

  // Extraer número natural del nombre del archivo para ordenar correctamente
  // Si es un solo dígito se trata como 05 (dos dígitos), si son 2 o más se toman los primeros 2
  const extraerNumero = (foto: FotoIndexada): number => {
    // Buscar el primer número en el nombre (original o formateado)
    const fuentes = [foto.nombre, foto.nombreFormateado]
    for (const texto of fuentes) {
      if (!texto) continue
      const match = texto.match(/(\d+)/)
      if (match) {
        const numeroCompleto = match[1]
        // Si es un solo dígito (ej: 5), tratarlo como 05
        // Si son 2 o más dígitos, tomar solo los primeros 2
        if (numeroCompleto.length === 1) {
          return parseInt('0' + numeroCompleto, 10) // 5 -> 05
        } else {
          return parseInt(numeroCompleto.substring(0, 2), 10) // 123 -> 12
        }
      }
    }
    return Number.MAX_SAFE_INTEGER // Sin número va al final
  }

  // Ordenar fotos por el número natural del nombre (ascendente: 1, 2, 3, ..., n)
  const fotosOrdenadas = [...fotos].sort((a, b) => extraerNumero(a) - extraerNumero(b))

  // Agrupar por subcarpeta respetando el orden ascendente
  const grupos = fotosOrdenadas.reduce((acc, foto) => {
    const key = foto.subcarpeta === 'raiz' ? 'Fotos principales' : foto.subcarpeta
    if (!acc[key]) acc[key] = []
    acc[key].push(foto)
    return acc
  }, {} as Record<string, FotoIndexada[]>)

  // Ordenar las carpetas por el menor número natural que contienen (ascendente)
  const gruposOrdenados = Object.entries(grupos).sort(([, a], [, b]) => {
    const minA = Math.min(...a.map(extraerNumero))
    const minB = Math.min(...b.map(extraerNumero))
    return minA - minB
  })

  const toggleCarpeta = (key: string) => {
    setCarpetasAbiertas(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const estaAbierta = (key: string) => expandirTodas || !!carpetasAbiertas[key]

  const toggleExpandirTodas = () => {
    if (expandirTodas) {
      setExpandirTodas(false)
      setCarpetasAbiertas({})
    } else {
      setExpandirTodas(true)
      setCarpetasAbiertas({})
    }
  }

  return (
    <div className="space-y-4">
      {/* Barra de herramientas */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleExpandirTodas}
            title={expandirTodas ? 'Retraer todas las carpetas' : 'Expandir todas las carpetas'}
          >
            {expandirTodas ? (
              <><ChevronDown className="w-4 h-4 mr-1" /> Retraer todas</>
            ) : (
              <><ChevronRightIcon className="w-4 h-4 mr-1" /> Expandir todas</>
            )}
          </Button>
          {fotosSeleccionadas.length > 0 && (
            <Button
              size="sm"
              onClick={handleCargarSeleccionadas}
            >
              Cargar {fotosSeleccionadas.length} para análisis
            </Button>
          )}
        </div>
      </div>

      {/* Grid de fotos */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {gruposOrdenados.map(([subcarpeta, fotosGrupo]) => {
            const abierta = estaAbierta(subcarpeta)
            const seleccionadasEnGrupo = fotosGrupo.filter(f => fotosSeleccionadas.includes(f.id)).length
            
            return (
              <div key={subcarpeta} className="border border-border rounded-lg overflow-hidden">
                {/* Header clicable de la carpeta */}
                <div
                  onClick={() => toggleCarpeta(subcarpeta)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {abierta ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    {abierta ? (
                      <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm font-medium text-foreground truncate">{subcarpeta}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant={seleccionadasEnGrupo === fotosGrupo.length && fotosGrupo.length > 0 ? "default" : "outline"}
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSeleccionCarpeta(fotosGrupo)
                      }}
                      title={
                        seleccionadasEnGrupo === fotosGrupo.length
                          ? 'Quitar esta carpeta de la selección'
                          : 'Seleccionar toda la carpeta'
                      }
                    >
                      {seleccionadasEnGrupo === fotosGrupo.length && fotosGrupo.length > 0 ? (
                        <CheckSquare className="w-3.5 h-3.5" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                      {seleccionadasEnGrupo === fotosGrupo.length ? 'Quitar' : 'Carpeta'}
                    </Button>
                    {seleccionadasEnGrupo > 0 && seleccionadasEnGrupo < fotosGrupo.length && (
                      <Badge variant="secondary" className="text-[10px]">
                        {seleccionadasEnGrupo}/{fotosGrupo.length}
                      </Badge>
                    )}
                    {seleccionadasEnGrupo === 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {fotosGrupo.length} {fotosGrupo.length === 1 ? 'foto' : 'fotos'}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Contenido de la carpeta (solo cuando está abierta) */}
                {abierta && (
                  <div className="p-2">
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
                )}
              </div>
            )
          })}
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
