import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  TreePine, 
  Upload, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  Type, 
  Save,
  Plus,
  Trash2,
  Eye
} from 'lucide-react'
import { useState, useRef } from 'react'

interface CampoPlantilla {
  id: string
  tipo: 'texto' | 'imagen'
  etiqueta: string
  valor: string
  imagenPreview?: string
}

interface Plantilla {
  id: string
  nombre: string
  descripcion: string
  campos: CampoPlantilla[]
}

const PLANTILLAS_PREDEFINIDAS: Plantilla[] = [
  {
    id: 'estudio-impacto',
    nombre: 'Estudio de Impacto Ambiental',
    descripcion: 'Evaluación de impactos y medidas de mitigación',
    campos: [
      { id: '1', tipo: 'texto', etiqueta: 'Descripción del área', valor: '' },
      { id: '2', tipo: 'imagen', etiqueta: 'Foto panorámica del sitio', valor: '' },
      { id: '3', tipo: 'texto', etiqueta: 'Tipo de ecosistema', valor: '' },
      { id: '4', tipo: 'imagen', etiqueta: 'Foto de vegetación', valor: '' },
      { id: '5', tipo: 'texto', etiqueta: 'Especies identificadas', valor: '' },
      { id: '6', tipo: 'texto', etiqueta: 'Impactos potenciales', valor: '' },
      { id: '7', tipo: 'imagen', etiqueta: 'Foto de fauna', valor: '' },
      { id: '8', tipo: 'texto', etiqueta: 'Medidas de mitigación', valor: '' },
    ]
  }
]

export function ModuloAmbiental() {
  const { state, actualizarPunto } = useApp()
  const punto = state.puntoActivo
  
  const [plantillaActiva, setPlantillaActiva] = useState<Plantilla | null>(null)
  const [campos, setCampos] = useState<CampoPlantilla[]>([])
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const [mostrarSelector, setMostrarSelector] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [campoImagenActivo, setCampoImagenActivo] = useState<string | null>(null)

  // Cargar datos guardados
  const cargarPlantilla = (plantilla: Plantilla) => {
    // Si hay datos guardados para esta plantilla, usarlos
    const datosGuardados = punto?.moduloData?.ambiental?.plantillas?.[plantilla.id]
    
    if (datosGuardados?.campos) {
      setCampos(datosGuardados.campos)
    } else {
      // Crear copia nueva de los campos
      setCampos(plantilla.campos.map(c => ({ ...c, valor: '', imagenPreview: undefined })))
    }
    
    setPlantillaActiva(plantilla)
    setNombrePlantilla(plantilla.nombre)
    setMostrarSelector(false)
  }

  const actualizarCampo = (id: string, valor: string) => {
    setCampos(prev => prev.map(c => c.id === id ? { ...c, valor } : c))
  }

  const seleccionarImagenParaCampo = (campoId: string) => {
    setCampoImagenActivo(campoId)
    fileInputRef.current?.click()
  }

  const handleImagenSeleccionada = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !campoImagenActivo) return

    const reader = new FileReader()
    reader.onloadend = () => {
      const preview = reader.result as string
      setCampos(prev => prev.map(c => 
        c.id === campoImagenActivo 
          ? { ...c, valor: file.name, imagenPreview: preview } 
          : c
      ))
      setCampoImagenActivo(null)
    }
    reader.readAsDataURL(file)
  }

  // Cargar imagen desde las fotos del punto
  const usarFotoDelPunto = (campoId: string, fotoPreview: string, fotoNombre: string) => {
    setCampos(prev => prev.map(c => 
      c.id === campoId 
        ? { ...c, valor: fotoNombre, imagenPreview: fotoPreview } 
        : c
    ))
  }

  const handleGuardar = () => {
    if (!punto || !plantillaActiva) return
    
    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        ambiental: {
          ...punto.moduloData?.ambiental,
          plantillas: {
            ...(punto.moduloData?.ambiental?.plantillas || {}),
            [plantillaActiva.id]: {
              nombre: nombrePlantilla,
              campos: campos,
              updatedAt: new Date().toISOString(),
            }
          }
        },
      },
    })
    alert('Plantilla ambiental guardada')
  }

  const agregarCampoPersonalizado = () => {
    const nuevoCampo: CampoPlantilla = {
      id: `custom-${Date.now()}`,
      tipo: 'texto',
      etiqueta: 'Nuevo campo',
      valor: '',
    }
    setCampos(prev => [...prev, nuevoCampo])
  }

  const eliminarCampo = (id: string) => {
    setCampos(prev => prev.filter(c => c.id !== id))
  }

  const cambiarTipoCampo = (id: string, tipo: 'texto' | 'imagen') => {
    setCampos(prev => prev.map(c => 
      c.id === id ? { ...c, tipo, valor: '', imagenPreview: undefined } : c
    ))
  }

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <TreePine className="w-12 h-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-muted-foreground">Selecciona un punto para estudio ambiental</p>
        </CardContent>
      </Card>
    )
  }

  // Obtener fotos disponibles del punto
  const fotosDisponibles = punto.moduloData?.analisis?.fotosIndexadas || []

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-4 pr-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">{punto.numeroSerie}</span>
            </div>
            <div className="flex-1">
              <p className="font-medium">{punto.nombre}</p>
              {plantillaActiva && (
                <p className="text-xs text-muted-foreground">{plantillaActiva.nombre}</p>
              )}
            </div>
            {plantillaActiva && (
              <Button variant="outline" size="sm" onClick={() => {
                setMostrarSelector(true)
                setPlantillaActiva(null)
              }}>
                Cambiar plantilla
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Selector de plantillas */}
        {mostrarSelector && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                <CardTitle>Plantillas Ambientales</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PLANTILLAS_PREDEFINIDAS.map((plantilla) => (
                  <Card 
                    key={plantilla.id} 
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => cargarPlantilla(plantilla)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <TreePine className="w-5 h-5 text-primary" />
                        <h3 className="font-medium">{plantilla.nombre}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">{plantilla.descripcion}</p>
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="secondary">{plantilla.campos.length} campos</Badge>
                        <Badge variant="outline">
                          {plantilla.campos.filter(c => c.tipo === 'imagen').length} imágenes
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Editor de plantilla */}
        {plantillaActiva && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImagenSeleccionada}
              className="hidden"
            />

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-primary" />
                    <CardTitle>{plantillaActiva.nombre}</CardTitle>
                  </div>
                  <Button variant="outline" size="sm" onClick={agregarCampoPersonalizado}>
                    <Plus className="w-4 h-4 mr-1" />
                    Agregar campo
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nombre del documento</label>
                  <Input
                    value={nombrePlantilla}
                    onChange={(e) => setNombrePlantilla(e.target.value)}
                    placeholder="Nombre del documento ambiental"
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  {campos.map((campo, index) => (
                    <div key={campo.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">#{index + 1}</Badge>
                          <Input
                            value={campo.etiqueta}
                            onChange={(e) => {
                              setCampos(prev => prev.map(c => 
                                c.id === campo.id ? { ...c, etiqueta: e.target.value } : c
                              ))
                            }}
                            className="w-64 h-8"
                            placeholder="Etiqueta del campo"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant={campo.tipo === 'texto' ? 'default' : 'outline'}
                            size="sm"
                            className="h-7"
                            onClick={() => cambiarTipoCampo(campo.id, 'texto')}
                          >
                            <Type className="w-3 h-3" />
                          </Button>
                          <Button
                            variant={campo.tipo === 'imagen' ? 'default' : 'outline'}
                            size="sm"
                            className="h-7"
                            onClick={() => cambiarTipoCampo(campo.id, 'imagen')}
                          >
                            <ImageIcon className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => eliminarCampo(campo.id)}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {campo.tipo === 'texto' ? (
                        <Textarea
                          value={campo.valor}
                          onChange={(e) => actualizarCampo(campo.id, e.target.value)}
                          placeholder={`Ingrese ${campo.etiqueta.toLowerCase()}...`}
                          rows={3}
                        />
                      ) : (
                        <div className="space-y-2">
                          {campo.imagenPreview ? (
                            <div className="relative inline-block">
                              <img
                                src={campo.imagenPreview}
                                alt={campo.etiqueta}
                                className="max-h-[200px] rounded-lg border"
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                className="absolute top-2 right-2"
                                onClick={() => seleccionarImagenParaCampo(campo.id)}
                              >
                                Cambiar
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                onClick={() => seleccionarImagenParaCampo(campo.id)}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                Subir imagen
                              </Button>
                              
                              {fotosDisponibles.length > 0 && (
                                <div className="flex gap-1">
                                  {fotosDisponibles.slice(0, 3).map((foto) => (
                                    <button
                                      key={foto.id}
                                      onClick={() => usarFotoDelPunto(campo.id, foto.preview, foto.nombreFormateado)}
                                      className="w-12 h-12 rounded border overflow-hidden hover:border-primary transition-colors"
                                      title={foto.nombreFormateado}
                                    >
                                      <img
                                        src={foto.preview}
                                        alt={foto.nombreFormateado}
                                        className="w-full h-full object-cover"
                                      />
                                    </button>
                                  ))}
                                  {fotosDisponibles.length > 3 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-12 h-12"
                                      onClick={() => {
                                        // Mostrar selector de fotos
                                        const foto = fotosDisponibles[0]
                                        if (foto) usarFotoDelPunto(campo.id, foto.preview, foto.nombreFormateado)
                                      }}
                                    >
                                      +{fotosDisponibles.length - 3}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="flex gap-2">
                  <Button onClick={handleGuardar}>
                    <Save className="w-4 h-4 mr-2" />
                    Guardar plantilla
                  </Button>
                  <Button variant="outline">
                    <Eye className="w-4 h-4 mr-2" />
                    Vista previa
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ScrollArea>
  )
}