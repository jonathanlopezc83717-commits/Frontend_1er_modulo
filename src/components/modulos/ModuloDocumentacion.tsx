import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, FileText, Upload, Save, FileCheck } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import {
  fusionarNomenclaturas,
  obtenerDiscrepanciasNomenclaturas,
  parsearNomenclaturasDesdeTexto,
  normalizarDefinicion,
  type NomenclaturaEntry,
} from '@/lib/nomenclaturas'

export function ModuloDocumentacion() {
  const { state, actualizarPunto, setNomenclaturasGlobales } = useApp()
  const punto = state.puntoActivo
  const [notas, setNotas] = useState('')
  const [nombreArchivo, setNombreArchivo] = useState('')

  const nomenclaturasBase = useMemo<NomenclaturaEntry[]>(() => {
    return state.nomenclaturasGlobales
  }, [state.nomenclaturasGlobales])

  const nomenclaturasDetectadas = useMemo(() => {
    return parsearNomenclaturasDesdeTexto(notas)
  }, [notas])

  const discrepancias = useMemo(() => {
    return obtenerDiscrepanciasNomenclaturas(nomenclaturasBase, nomenclaturasDetectadas)
  }, [nomenclaturasBase, nomenclaturasDetectadas])

  const codigosConDiscrepancia = useMemo(() => {
    return new Set(discrepancias.map(item => item.codigo))
  }, [discrepancias])

  const definicionesBaseMap = useMemo(() => {
    return new Map(nomenclaturasBase.map(item => [item.codigo, item.definicion]))
  }, [nomenclaturasBase])

  // Cargar datos del punto
  useEffect(() => {
    if (punto?.moduloData?.documentacion) {
      const docData = punto.moduloData.documentacion as { 
        notas?: string; 
        nombreArchivo?: string;
      }
      setNotas(docData.notas || '')
      setNombreArchivo(docData.nombreArchivo || '')
    } else {
      setNotas('')
      setNombreArchivo('')
    }
    // ponytail: depender de punto?.id (ver ModuloFicha). [punto] pisaba edits sin guardar.
  }, [punto?.id])

  const handleGuardar = () => {
    if (!punto) return
    if (discrepancias.length > 0) {
      const continuar = window.confirm(
        `Se detectaron ${discrepancias.length} discrepancias con la base de nomenclaturas. Revisa los elementos marcados en rojo antes de guardar.\n\n¿Deseas guardar de todos modos?`
      )
      if (!continuar) return
    }

    const nomenclaturasActualizadas = fusionarNomenclaturas(nomenclaturasBase, nomenclaturasDetectadas)
    setNomenclaturasGlobales(nomenclaturasActualizadas)

    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        documentacion: {
          ...punto.moduloData?.documentacion,
          notas: notas || '',
          nombreArchivo: nombreArchivo || 'documento.txt',
          nomenclaturas: nomenclaturasActualizadas,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    alert('Documentación guardada')
  }

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="w-12 h-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-muted-foreground">Selecciona un punto para ver documentación</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-4 pr-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">{punto.numeroSerie}</span>
            </div>
            <p className="font-medium">{punto.nombre}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <CardTitle>Documento Técnico</CardTitle>
            </div>
          </CardHeader>        
          <CardContent className="space-y-4">
            {notas ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <FileCheck className="w-4 h-4 text-green-600" />
                  <Badge variant="secondary">
                    {nombreArchivo ? `Archivo: ${nombreArchivo}` : 'Documento importado de la carpeta'}
                  </Badge>
                </div>
                <div className="bg-muted/50 p-4 rounded-lg max-h-[300px] overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{notas}</p>
                </div>
                <Separator />
              </>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No hay documento importado</p>
                <p className="text-xs text-muted-foreground mt-1">Importa una carpeta con archivo .txt en la raíz</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notas-doc">Notas adicionales / Editar contenido</Label>
              <Textarea
                id="notas-doc"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Contenido del documento o notas adicionales..."
                rows={8}
              />
            </div>

            {nomenclaturasDetectadas.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Nomenclaturas detectadas</Label>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Badge variant="secondary">{nomenclaturasDetectadas.length} detectadas</Badge>
                    {discrepancias.length > 0 && (
                      <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
                        {discrepancias.length} discrepancias
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  {nomenclaturasDetectadas.map((item) => {
                    const definicionBase = definicionesBaseMap.get(item.codigo)
                    const tieneBase = Boolean(definicionBase)
                    const coincide = definicionBase
                      ? normalizarDefinicion(definicionBase) === normalizarDefinicion(item.definicion)
                      : false
                    const tieneDiscrepancia = codigosConDiscrepancia.has(item.codigo)
                    const estadoClass = tieneDiscrepancia
                      ? 'border-red-300 bg-red-50 text-red-900'
                      : coincide
                        ? 'border-green-300 bg-green-50 text-green-900'
                        : 'border-blue-300 bg-blue-50 text-blue-900'

                    return (
                      <div key={`${item.codigoOriginal}-${item.seriado}`} className={`rounded-md border p-3 ${estadoClass}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="bg-white/70">
                            {item.codigo}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            detectado como {item.codigoOriginal}
                          </span>
                          {tieneDiscrepancia && <AlertTriangle className="h-4 w-4 text-red-600" />}
                        </div>
                        <p className="mt-2 text-sm">{item.definicion}</p>
                        {tieneDiscrepancia && definicionBase && (
                          <p className="mt-2 text-xs">Base registrada: {definicionBase}</p>
                        )}
                        {!tieneBase && (
                          <p className="mt-2 text-xs">Nueva nomenclatura; se agregara a la base al guardar.</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <Button onClick={handleGuardar}>
              <Save className="w-4 h-4 mr-2" />
              Guardar documentación
            </Button>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
