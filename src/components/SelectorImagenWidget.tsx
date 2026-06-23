import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, ImageIcon, FolderOpen, ChevronDown, ChevronRight, X } from 'lucide-react'

interface FotoIndexada {
  id: string
  index: number
  nombre: string
  nombreFormateado: string
  subcarpeta: string
  preview: string
}

interface SelectorImagenWidgetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  punto: unknown
  onSeleccionar: (src: string) => void
}

function extraerFotosPunto(punto: unknown): FotoIndexada[] {
  if (!punto || typeof punto !== 'object') return []
  const p = punto as Record<string, unknown>
  const moduloData = p.moduloData as Record<string, unknown> | undefined
  const analisis = moduloData?.analisis as Record<string, unknown> | undefined
  return (analisis?.fotosIndexadas as FotoIndexada[]) || []
}

function leerArchivoComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function extraerNumero(nombre: string): number {
  const match = nombre.match(/(\d+)/)
  if (!match) return Number.MAX_SAFE_INTEGER
  const numero = match[1]
  if (numero.length === 1) return parseInt(`0${numero}`, 10)
  return parseInt(numero.substring(0, 2), 10)
}

export function SelectorImagenWidget({ open, onOpenChange, punto, onSeleccionar }: SelectorImagenWidgetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fotos = extraerFotosPunto(punto)
  const [carpetasAbiertas, setCarpetasAbiertas] = useState<Record<string, boolean>>({})
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await leerArchivoComoDataUrl(file)
      onSeleccionar(dataUrl)
      onOpenChange(false)
    } catch {
      // Ignorar errores de lectura.
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const toggleCarpeta = (key: string) => {
    setCarpetasAbiertas(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSeleccionarFoto = (preview: string) => {
    onSeleccionar(preview)
    onOpenChange(false)
  }

  const grupos = fotos
    .slice()
    .sort((a, b) => extraerNumero(a.nombre) - extraerNumero(b.nombre))
    .reduce((acc, foto) => {
      const key = foto.subcarpeta === 'raiz' ? 'Fotos principales' : foto.subcarpeta
      if (!acc[key]) acc[key] = []
      acc[key].push(foto)
      return acc
    }, {} as Record<string, FotoIndexada[]>)

  const gruposOrdenados = Object.entries(grupos).sort(([, a], [, b]) => {
    const minA = Math.min(...a.map(f => extraerNumero(f.nombre)))
    const minB = Math.min(...b.map(f => extraerNumero(f.nombre)))
    return minA - minB
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Seleccionar imagen</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="archivo" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="archivo" className="text-xs">
              <Upload className="mr-1.5 h-3 w-3" />
              Desde archivo
            </TabsTrigger>
            <TabsTrigger value="fotos" className="text-xs">
              <ImageIcon className="mr-1.5 h-3 w-3" />
              Fotos del punto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="archivo" className="py-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              className="h-24 w-full flex-col gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6" />
              <span className="text-xs">Haz clic para subir una imagen</span>
            </Button>
          </TabsContent>

          <TabsContent value="fotos" className="py-2">
            {fotos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <FolderOpen className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-xs">No hay fotos importadas en este punto.</p>
                <p className="text-[10px]">Importa una carpeta desde el gestor de puntos.</p>
              </div>
            ) : (
              <ScrollArea className="h-[320px] pr-2">
                <div className="space-y-2">
                  {gruposOrdenados.map(([subcarpeta, fotosGrupo]) => {
                    const abierta = !!carpetasAbiertas[subcarpeta]
                    return (
                      <div key={subcarpeta} className="rounded-md border border-border overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleCarpeta(subcarpeta)}
                          className="flex w-full items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/70"
                        >
                          <span className="text-xs font-medium">{subcarpeta}</span>
                          {abierta ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                        {abierta && (
                          <div className="grid grid-cols-4 gap-1 p-2">
                            {fotosGrupo.map(foto => (
                              <button
                                key={foto.id}
                                type="button"
                                className="group relative aspect-square overflow-hidden rounded border hover:border-primary"
                                onClick={() => handleSeleccionarFoto(foto.preview)}
                                title={foto.nombreFormateado}
                              >
                                <img
                                  src={foto.preview}
                                  alt={foto.nombreFormateado}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 hidden items-center justify-center bg-black/30 group-hover:flex">
                                  <span className="text-[10px] font-medium text-white">Usar</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        {imagenAmpliada && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setImagenAmpliada(null)}
          >
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full bg-background/90 p-1"
              onClick={() => setImagenAmpliada(null)}
            >
              <X className="h-4 w-4" />
            </button>
            <img src={imagenAmpliada} alt="Vista previa" className="max-h-full max-w-full rounded" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
