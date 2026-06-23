import { useApp } from '@/context/AppContext'
import { GestorPuntos } from '@/components/GestorPuntos'
import { ModuleTabs } from '@/components/ModuleTabs'
import { HistorialObras } from '@/components/HistorialObras'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { LayoutDashboard, Settings, HardHat, History, Save, Cloud, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { obtenerUltimoEstadoAppDesdeNube } from '@/lib/supabase-service'
import type { EstadoGuardado } from '@/types'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

function App() {
  const { state, sincronizarConSupabase, cargarDesdeSupabase, setModuloActivo } = useApp()
  const [mostrarConfig, setMostrarConfig] = useState(false)
  const [mostrarHistorial, setMostrarHistorial] = useState(false)
  const [mostrarNomenclaturas, setMostrarNomenclaturas] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  // Estados para el diálogo de confirmación de recarga
  const [mostrarDialogoRecarga, setMostrarDialogoRecarga] = useState(false)
  const [estadoNubeCargando, setEstadoNubeCargando] = useState(false)
  const [estadoNubeInfo, setEstadoNubeInfo] = useState<EstadoGuardado | null>(null)

  const handleRecargarClick = async () => {
    setMostrarDialogoRecarga(true)
    setEstadoNubeCargando(true)
    try {
      const ultimo = await obtenerUltimoEstadoAppDesdeNube()
      setEstadoNubeInfo(ultimo)
    } finally {
      setEstadoNubeCargando(false)
    }
  }

  const cancelarRecarga = () => {
    setMostrarDialogoRecarga(false)
    setEstadoNubeInfo(null)
  }

  const confirmarRecarga = async () => {
    setMostrarDialogoRecarga(false)
    setEstadoNubeInfo(null)
    await cargarDesdeSupabase()
  }

  const handleSincronizar = async () => {
    setSincronizando(true)
    try {
      const result = await sincronizarConSupabase()
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('Error al sincronizar')
    } finally {
      setSincronizando(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="border-b bg-card shadow-sm shrink-0">
        <div className="max-w-7xl mx-auto px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <LayoutDashboard className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-foreground truncate">Obras Ferroviarias</h1>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] h-4">
                  {state.puntos.length} pts
                </Badge>
                {state.puntoActivo && (
                  <>
                    <Separator orientation="vertical" className="h-2.5" />
                    <span className="truncate max-w-[120px] sm:max-w-[200px]">{state.puntoActivo.nombre}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleSincronizar}
              disabled={sincronizando}
              title="Guardar en la nube"
            >
              <Save className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRecargarClick}
              disabled={estadoNubeCargando}
              title="Recargar desde la nube"
            >
              <Cloud className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMostrarHistorial(true)}
              title="Historial de Obras"
            >
              <History className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary hover:text-primary/80"
              onClick={() => {
                setMostrarNomenclaturas(true)
                setModuloActivo('nomenclaturas')
              }}
              title="Obras Ferroviarias"
            >
              <HardHat className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMostrarConfig(true)}
              title="Configuración"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full px-3 py-3 overflow-hidden relative isolate">
        <div className="flex gap-3 h-full">
          {/* Sidebar desplegable - capa inferior */}
          <div className="shrink-0 z-10">
            <GestorPuntos />
          </div>

          {/* Main Area - capa superior para evitar interferencia con sidebar */}
          <div className="flex-1 h-full overflow-hidden min-w-0 z-20 relative">
            <ModuleTabs mostrarNomenclaturas={mostrarNomenclaturas} />
          </div>
        </div>
      </main>

      {/* Config Dialog */}
      <Dialog open={mostrarConfig} onOpenChange={setMostrarConfig}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configuración</DialogTitle>
            <DialogDescription>
              Configuración del sistema de obras ferroviarias
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Card>
              <CardContent className="py-3">
                <p className="text-sm text-muted-foreground">
                  Versión 1.0 · Sistema de gestión de obras ferroviarias
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Los datos se guardan automáticamente en localStorage (3 días) y en Supabase (nube).
                </p>
                <div className="flex gap-2 mt-3">
                  <Button 
                    size="sm" 
                    onClick={handleSincronizar}
                    disabled={sincronizando}
                    className="flex-1"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {sincronizando ? 'Sincronizando...' : 'Sincronizar'}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleRecargarClick}
                    className="flex-1"
                  >
                    <Cloud className="w-4 h-4 mr-2" />
                    Recargar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Historial Dialog */}
      <Dialog open={mostrarHistorial} onOpenChange={setMostrarHistorial}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de Obras</DialogTitle>
            <DialogDescription>
              Registro de todas las actividades realizadas
            </DialogDescription>
          </DialogHeader>
          <HistorialObras />
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación de recarga */}
      <Dialog open={mostrarDialogoRecarga} onOpenChange={setMostrarDialogoRecarga}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5" />
              Recargar desde la nube
            </DialogTitle>
            <DialogDescription>
              Está a punto de cargar un estado guardado desde la nube.
            </DialogDescription>
          </DialogHeader>

          {estadoNubeCargando ? (
            <div className="py-4 text-center text-muted-foreground">
              Cargando información del estado...
            </div>
          ) : estadoNubeInfo ? (
            <div className="space-y-3">
              <Alert variant="destructive" className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800">Advertencia</AlertTitle>
                <AlertDescription className="text-red-700">
                  Se perderán todos los datos no guardados en curso. Esta acción no se puede deshacer.
                </AlertDescription>
              </Alert>

              <div className="bg-muted rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estado:</span>
                  <span className="font-medium">{estadoNubeInfo.descripcion || 'Sin descripción'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tipo:</span>
                  <span className="font-medium capitalize">{estadoNubeInfo.tipo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Puntos:</span>
                  <span className="font-medium">{estadoNubeInfo.snapshot?.puntos?.length || 0} puntos</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Guardado:</span>
                  <span className="font-medium">{new Date(estadoNubeInfo.createdAt).toLocaleString('es-ES')}</span>
                </div>
              </div>
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No se encontró estado</AlertTitle>
              <AlertDescription>
                No hay ningún estado guardado en la nube para recargar.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelarRecarga}>
              Cancelar
            </Button>
            {estadoNubeInfo && (
              <Button variant="default" onClick={confirmarRecarga}>
                Confirmar Recarga
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
