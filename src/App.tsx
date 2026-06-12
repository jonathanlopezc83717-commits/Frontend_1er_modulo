import { useApp } from '@/context/AppContext'
import { GestorPuntos } from '@/components/GestorPuntos'
import { ModuleTabs } from '@/components/ModuleTabs'
import { HistorialObras } from '@/components/HistorialObras'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { LayoutDashboard, Settings, HardHat, History, Save, Cloud } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

function App() {
  const { state, sincronizarConSupabase, cargarDesdeSupabase, setModuloActivo } = useApp()
  const [mostrarConfig, setMostrarConfig] = useState(false)
  const [mostrarHistorial, setMostrarHistorial] = useState(false)
  const [mostrarNomenclaturas, setMostrarNomenclaturas] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)

  const handleSincronizar = async () => {
    setSincronizando(true)
    try {
      const result = await sincronizarConSupabase()
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('Error al sincronizar')
    } finally {
      setSincronizando(false)
    }
  }

  const handleRecargar = async () => {
    try {
      await cargarDesdeSupabase()
      toast.success('Datos recargados desde la nube')
    } catch (error) {
      toast.error('Error al recargar datos')
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
              onClick={handleRecargar}
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
                    onClick={handleRecargar}
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
    </div>
  )
}

export default App
