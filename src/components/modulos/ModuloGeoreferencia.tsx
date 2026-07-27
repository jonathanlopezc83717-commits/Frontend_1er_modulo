import { useAppSelector, useAppActions, useAppStore, shallow } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { MapPin, Navigation, Save, Globe, Upload } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { extraerCoordenadasKMZ } from '@/lib/folder-parser'
import { latLngToUtmEasting, latLngToUtmNorthing } from '@/lib/utm'
import { ScrollArea } from '@/components/ui/scroll-area'

export function ModuloGeoreferencia() {
  const punto = useAppSelector((s) => {
    const p = s.puntoActivo
    return p ? { id: p.id, numeroSerie: p.numeroSerie, nombre: p.nombre, coordenadas: p.coordenadas } : null
  }, shallow)
  const { actualizarPunto, guardarCoordenadasDB } = useAppActions()
  const store = useAppStore()
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [z, setZ] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [tieneCoordenadasKMZ, setTieneCoordenadasKMZ] = useState(false)
  const [cargandoKMZ, setCargandoKMZ] = useState(false)
  const [nombreArchivoKMZ, setNombreArchivoKMZ] = useState('')
  const kmzInputRef = useRef<HTMLInputElement>(null)

  // Cargar coordenadas del punto si existen. Lee estado live: el selector de
  // render es estrecho (sin moduloData), asi que aqui tomamos el punto actual.
  // Depende solo del id del punto para no pisar edits locales sin guardar en
  // cada cambio no relacionado del punto activo.
  useEffect(() => {
    const live = store.getState().puntoActivo
    if (!live) {
      setLat('')
      setLng('')
      setZ('')
      setNotas('')
      setTieneCoordenadasKMZ(false)
      return
    }

    let coordsFound = false

    // PRIORIDAD 1: Coordenadas del punto principal (si ya fueron guardadas)
    if (live.coordenadas?.lat !== undefined && live.coordenadas?.lng !== undefined) {
      setLat(live.coordenadas.lat.toString())
      setLng(live.coordenadas.lng.toString())
      coordsFound = true
    }
    
    // PRIORIDAD 2: Coordenadas del KMZ en moduloData.georeferencia
    if (live.moduloData?.georeferencia?.coordenadas) {
      const geoData = live.moduloData.georeferencia as {
        coordenadas?: { x: number; y: number; z: number }
        notas?: string
      }
      
      // Si no hay coordenadas guardadas aún, usar las del KMZ
      if (!coordsFound) {
        if (geoData.coordenadas?.y !== undefined) {
          setLat(geoData.coordenadas.y.toString())
        }
        if (geoData.coordenadas?.x !== undefined) {
          setLng(geoData.coordenadas.x.toString())
        }
      }
      
      if (geoData.coordenadas?.z !== undefined) {
        setZ(geoData.coordenadas.z.toString())
      }
      
      if (geoData.notas) {
        setNotas(geoData.notas)
      }
      
      setTieneCoordenadasKMZ(true)
    } 
    // PRIORIDAD 3: Compatibilidad con datos antiguos (georeferenciacion)
    else if (live.moduloData?.georeferenciacion?.coordenadas) {
      const geoData = live.moduloData.georeferenciacion as {
        coordenadas?: { x: number; y: number; z: number }
        notas?: string
      }
      
      if (!coordsFound) {
        if (geoData.coordenadas?.y !== undefined) {
          setLat(geoData.coordenadas.y.toString())
        }
        if (geoData.coordenadas?.x !== undefined) {
          setLng(geoData.coordenadas.x.toString())
        }
      }
      
      if (geoData.coordenadas?.z !== undefined) {
        setZ(geoData.coordenadas.z.toString())
      }
      
      if (geoData.notas) {
        setNotas(geoData.notas)
      }
      
      setTieneCoordenadasKMZ(true)
    } else {
      setTieneCoordenadasKMZ(false)
    }
  }, [punto?.id, store])

  const handleCargarKMZ = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !punto) return

    setCargandoKMZ(true)
    setNombreArchivoKMZ(file.name)

    try {
      const coords = await extraerCoordenadasKMZ(file)
      if (coords) {
        setLat(coords.y.toString())
        setLng(coords.x.toString())
        setZ(coords.z.toString())
        setTieneCoordenadasKMZ(true)

        // Actualizar punto con datos del KMZ
        actualizarPunto(punto.id, {
          moduloData: {
            ...(store.getState().puntoActivo?.moduloData || {}),
            georeferencia: {
              coordenadas: coords,
              notas: `Coordenadas extraídas de ${file.name}`,
              updatedAt: new Date().toISOString(),
            },
          },
          coordenadas: {
            lat: coords.y,
            lng: coords.x,
          },
        })

        alert(`Coordenadas cargadas desde ${file.name}`)
      } else {
        alert('No se pudieron extraer coordenadas del archivo. Verifica que sea un KMZ/KML válido.')
        setTieneCoordenadasKMZ(false)
      }
    } catch (error) {
      console.error('Error cargando KMZ:', error)
      alert('Error al procesar el archivo KMZ')
    } finally {
      setCargandoKMZ(false)
    }
  }

  const handleGuardar = async () => {
    if (!punto) return
    
    setGuardando(true)
    
    try {
      const latValue = parseFloat(lat)
      const lngValue = parseFloat(lng)
      const zValue = parseFloat(z)
      
      // Actualizar estado local
      actualizarPunto(punto.id, {
        coordenadas: {
          lat: isNaN(latValue) ? 0 : latValue,
          lng: isNaN(lngValue) ? 0 : lngValue,
        },
        moduloData: {
          ...(store.getState().puntoActivo?.moduloData || {}),
          georeferencia: {
            coordenadas: {
              x: isNaN(lngValue) ? 0 : lngValue,
              y: isNaN(latValue) ? 0 : latValue,
              z: isNaN(zValue) ? 0 : zValue,
            },
            notas: notas || '',
            updatedAt: new Date().toISOString(),
          },
        },
      })

      // Guardar en Supabase
      await guardarCoordenadasDB(
        punto.id,
        isNaN(lngValue) ? 0 : lngValue,
        isNaN(latValue) ? 0 : latValue,
        isNaN(zValue) ? 0 : zValue,
        notas || ''
      )
      
      alert('Coordenadas guardadas en la nube')
    } catch (error) {
      console.error('Error guardando coordenadas:', error)
      alert('Error al guardar coordenadas')
    } finally {
      setGuardando(false)
    }
  }

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <MapPin className="w-12 h-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-muted-foreground">Selecciona un punto para ver coordenadas</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-3 pr-2">
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="flex items-center gap-3 py-3">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-sm font-bold text-primary-foreground">{punto.numeroSerie}</span>
          </div>
          <p className="font-medium">{punto.nombre}</p>
        </CardContent>
      </Card>
      {punto.coordenadas && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium">Coordenadas guardadas</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">X: </span>
                <span className="font-mono">{punto.coordenadas.lng}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Y: </span>
                <span className="font-mono">{punto.coordenadas.lat}</span>
              </div>
              {z && (
                <div>
                  <span className="text-muted-foreground">Z: </span>
                  <span className="font-mono">{z}</span>
                </div>
              )}
            </div>
            {(() => {
              const latNum = punto.coordenadas!.lat
              const lngNum = punto.coordenadas!.lng
              if (typeof latNum !== 'number' || typeof lngNum !== 'number') return null
              const utmE = latLngToUtmEasting(latNum, lngNum)
              const utmN = latLngToUtmNorthing(latNum, lngNum)
              if (utmE === null || utmN === null) return null
              return (
                <div className="grid grid-cols-2 gap-3 text-sm border-t mt-2 pt-2">
                  <div>
                    <span className="text-muted-foreground">UTM E: </span>
                    <span className="font-mono">{utmE}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">UTM N: </span>
                    <span className="font-mono">{utmN}</span>
                  </div>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}


      {/* Cargar archivo KMZ */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Cargar archivo KMZ/KML</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              ref={kmzInputRef}
              type="file"
              accept=".kmz,.kml"
              onChange={handleCargarKMZ}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => kmzInputRef.current?.click()}
              disabled={cargandoKMZ}
            >
              <Upload className="w-4 h-4 mr-2" />
              {cargandoKMZ ? 'Procesando...' : 'Seleccionar archivo KMZ (.kmz)'}
            </Button>
            {nombreArchivoKMZ && (
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                {nombreArchivoKMZ}
              </span>
            )}
          </div>
          
          {tieneCoordenadasKMZ && (
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 p-2 rounded">
              <Globe className="w-4 h-4 text-blue-600" />
              <span>Coordenadas detectadas del archivo KMZ/KML</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Coordenadas GPS</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lat" className="text-sm">Latitud (Y)</Label>
              <Input
                id="lat"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="-33.4567"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lng" className="text-sm">Longitud (X)</Label>
              <Input
                id="lng"
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-70.6789"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="z" className="text-sm">Altitud (Z)</Label>
              <Input
                id="z"
                type="number"
                step="any"
                value={z}
                onChange={(e) => setZ(e.target.value)}
                placeholder="0.00"
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notas-geo" className="text-sm">Notas de ubicación</Label>
            <Textarea
              id="notas-geo"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Descripción de la ubicación, referencias, accesos..."
              rows={2}
              className="min-h-[60px]"
            />
          </div>

          <Button onClick={handleGuardar} disabled={guardando} size="sm">
            <Save className="w-4 h-4 mr-2" />
            {guardando ? 'Guardando...' : 'Guardar coordenadas'}
          </Button>
        </CardContent>
      </Card>
    </div>
    </ScrollArea>
  )
}

