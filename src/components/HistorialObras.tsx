import { useState, useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { obtenerHistorialCompleto, type HistorialDB } from '@/lib/supabase-service'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Archive, Clock, MapPin, FileText, Shield, ClipboardCheck, Package, TreePine, BarChart3, Wand2, RotateCcw, AlertTriangle, MapPinned } from 'lucide-react'

const iconosModulo: Record<string, React.ReactNode> = {
  analisis: <Wand2 className="w-4 h-4" />,
  georeferencia: <MapPin className="w-4 h-4" />,
  documentacion: <FileText className="w-4 h-4" />,
  inspeccion: <ClipboardCheck className="w-4 h-4" />,
  materiales: <Package className="w-4 h-4" />,
  seguridad: <Shield className="w-4 h-4" />,
  ambiental: <TreePine className="w-4 h-4" />,
  reportes: <BarChart3 className="w-4 h-4" />,
}

const coloresEvento: Record<string, string> = {
  creacion: 'bg-green-100 text-green-800 border-green-300',
  actualizacion: 'bg-blue-100 text-blue-800 border-blue-300',
  eliminacion: 'bg-red-100 text-red-800 border-red-300',
  analisis: 'bg-purple-100 text-purple-800 border-purple-300',
  backup_auto: 'bg-amber-100 text-amber-800 border-amber-300',
  backup_manual: 'bg-emerald-100 text-emerald-800 border-emerald-300',
}

export function HistorialObras() {
  const { state, restaurarEstadoGuardado } = useApp()
  const [historial, setHistorial] = useState<HistorialDB[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargarHistorial()
  }, [])

  const cargarHistorial = async () => {
    try {
      setCargando(true)
      const data = await obtenerHistorialCompleto()
      setHistorial(data)
    } catch (error) {
      console.error('Error cargando historial:', error)
    } finally {
      setCargando(false)
    }
  }

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const handleRestaurar = async (id: string) => {
    const confirmar = window.confirm('Se reemplazara el estado actual por esta copia guardada. ¿Deseas continuar?')
    if (!confirmar) return

    const restaurado = await restaurarEstadoGuardado(id)
    if (restaurado) {
      alert('Estado restaurado correctamente')
    } else {
      alert('No se pudo restaurar el estado seleccionado')
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-8">
        <Clock className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Cargando historial...</span>
      </div>
    )
  }

  if (historial.length === 0 && state.estadosGuardados.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>No hay registros en el historial</p>
        <p className="text-xs mt-1">Las actividades se registrarán automáticamente</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-4">
        {state.estadosGuardados.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Archive className="h-4 w-4 text-primary" />
                Estados guardados
              </div>
              <Badge variant="secondary">{state.estadosGuardados.length}</Badge>
            </div>

            {state.estadosGuardados.map((estado) => (
              <Card key={estado.id} className="border-l-4 border-l-amber-500">
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={estado.tipo === 'automatico' ? coloresEvento.backup_auto : coloresEvento.backup_manual}
                        >
                          {estado.tipo === 'automatico' ? 'backup automatico' : 'estado manual'}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          <MapPinned className="mr-1 h-3 w-3" />
                          {estado.snapshotCompleto === false ? 'puntos en nube' : `${estado.snapshot.puntos.length} punto${estado.snapshot.puntos.length === 1 ? '' : 's'}`}
                        </Badge>
                      </div>
                      {estado.tipo === 'automatico' && (
                        <div className="mb-2 flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>Copia de seguridad automática generada cada 2 horas</span>
                        </div>
                      )}
                      <p className="text-sm font-medium">{estado.descripcion}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatearFecha(estado.createdAt)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleRestaurar(estado.id)}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restaurar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {historial.length > 0 && state.estadosGuardados.length > 0 && <Separator />}

        {historial.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-primary" />
              Actividad registrada
            </div>
        {historial.map((registro) => (
          <Card key={registro.id} className="border-l-4 border-l-primary">
            <CardContent className="py-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge 
                      variant="outline" 
                      className={coloresEvento[registro.tipo_evento] || 'bg-gray-100 text-gray-800'}
                    >
                      {registro.tipo_evento}
                    </Badge>
                    
                    {registro.modulo && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {iconosModulo[registro.modulo] || <Clock className="w-3 h-3" />}
                        <span>{registro.modulo}</span>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-sm">{registro.descripcion}</p>
                  
                  {registro.puntos_ferroviarios && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Punto: {registro.puntos_ferroviarios.nombre || 'Desconocido'}
                    </p>
                  )}
                </div>
                
                <div className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                  {formatearFecha(registro.created_at)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
