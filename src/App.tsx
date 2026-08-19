import { useAppSelector, useAppActions } from '@/context/AppContext'
import { GestorPuntos } from '@/components/GestorPuntos'
import { ModuleTabs } from '@/components/ModuleTabs'
import { HistorialObras } from '@/components/HistorialObras'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { LayoutDashboard, Settings, HardHat, History, Save, Cloud, AlertTriangle, LogOut, Archive, FolderInput, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { GestionMiembros } from '@/components/projects/GestionMiembros'
import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { guardarPuntoCompleto } from '@/lib/supabase-service'
import { listarSnapshotsNAS, snapNASDisponible } from '@/lib/snapshot-store'
import { MODULOS, type EstadoGuardado, type PuntoFerroviario } from '@/types'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { ThinkingLoader } from '@/components/ThinkingLoader'
import { IndicadorNas } from '@/components/IndicadorNas'

function App() {
  const { logout, perfil, proyectoActivoId, cambiarProyecto } = useAuth()
  const puntosLength = useAppSelector((s) => s.puntos.length)
  const puntos = useAppSelector((s) => s.puntos)
  const puntoActivoId = useAppSelector((s) => s.puntoActivo?.id)
  const puntoActivoNombre = useAppSelector((s) => s.puntoActivo?.nombre)
  const { sincronizarConSupabase, cargarEstadoPorIdDesdeSupabase, setModuloActivo, actualizarPunto } = useAppActions()
  const [mostrarConfig, setMostrarConfig] = useState(false)
  const [mostrarMiembros, setMostrarMiembros] = useState(false)
  const [mostrarHistorial, setMostrarHistorial] = useState(false)
  const [mostrarNomenclaturas, setMostrarNomenclaturas] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [compactando, setCompactando] = useState(false)

  // Estados para el diálogo de guardado en la nube (con título)
  const [mostrarDialogoGuardar, setMostrarDialogoGuardar] = useState(false)
  const [tituloEstado, setTituloEstado] = useState('')

  // Estados para el diálogo de confirmación de recarga
  const [mostrarDialogoRecarga, setMostrarDialogoRecarga] = useState(false)
  const [estadoNubeCargando, setEstadoNubeCargando] = useState(false)
  const [estadosNubeLista, setEstadosNubeLista] = useState<EstadoGuardado[]>([])
  const [estadoNubeSeleccionado, setEstadoNubeSeleccionado] = useState<string | null>(null)

  const handleRecargarClick = async () => {
    setMostrarDialogoRecarga(true)
    setEstadoNubeCargando(true)
    setEstadoNubeSeleccionado(null)
    try {
      if (!(await snapNASDisponible())) {
        toast.info('Servidor de archivos no disponible')
        setEstadosNubeLista([])
        return
      }
      const lista = await listarSnapshotsNAS(proyectoActivoId ?? '')
      setEstadosNubeLista(lista)
      setEstadoNubeSeleccionado(lista[0]?.id || null)
    } finally {
      setEstadoNubeCargando(false)
    }
  }

  const cancelarRecarga = () => {
    setMostrarDialogoRecarga(false)
    setEstadosNubeLista([])
    setEstadoNubeSeleccionado(null)
  }

  const confirmarRecarga = async () => {
    if (!estadoNubeSeleccionado) return
    const id = estadoNubeSeleccionado
    const nombre = estadosNubeLista.find((e) => e.id === id)?.descripcion?.trim()
    setMostrarDialogoRecarga(false)
    setEstadosNubeLista([])
    setEstadoNubeSeleccionado(null)
    const ok = await cargarEstadoPorIdDesdeSupabase(id)
    if (ok) {
      toast.success(nombre ? `Estado “${nombre}” cargado` : 'Estado cargado desde la nube')
    } else {
      toast.error('No se pudo cargar el estado seleccionado')
    }
  }

  const handleSincronizar = () => {
    setTituloEstado('')
    setMostrarDialogoGuardar(true)
  }

  const confirmarGuardado = async () => {
    const titulo = tituloEstado.trim()
    setMostrarDialogoGuardar(false)
    setSincronizando(true)
    try {
      // El feedback de progreso y resultado lo gestiona el contexto vía toasts.
      await sincronizarConSupabase(titulo || undefined)
    } catch {
      toast.error('Error al sincronizar')
    } finally {
      setSincronizando(false)
      setTituloEstado('')
    }
  }

  const cancelarGuardado = () => {
    setMostrarDialogoGuardar(false)
    setTituloEstado('')
  }

  const handleCompactarEspacio = async () => {
    if (puntos.length === 0) {
      toast.info('No hay puntos para compactar')
      return
    }
    setCompactando(true)
    const toastId = 'compactar-espacio'
    let exitosos = 0
    let fallidos = 0
    const aCompactar = [...puntos]
    try {
      for (let i = 0; i < aCompactar.length; i++) {
        const punto = aCompactar[i]
        toast.loading(`Compactando ${i + 1}/${aCompactar.length}...`, { id: toastId })
        const resultado = await guardarPuntoCompleto(punto, proyectoActivoId ?? '')
        if (resultado.success) {
          exitosos++
          if (resultado.moduloData) {
            actualizarPunto(punto.id, { moduloData: resultado.moduloData as PuntoFerroviario['moduloData'] })
          }
        } else {
          fallidos++
        }
      }
      if (fallidos === 0) {
        toast.success(`Compactación completa: ${exitosos} punto(s) re-guardados con imágenes en Storage`, { id: toastId })
      } else {
        toast.warning(`Compactación terminada: ${exitosos} OK, ${fallidos} con error`, { id: toastId })
      }
    } finally {
      setCompactando(false)
    }
  }

  // Atajos de teclado desktop: Ctrl/Cmd+S guarda, Ctrl/Cmd+1..9 salta a cada módulo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const conMod = e.metaKey || e.ctrlKey
      if (!conMod) return
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        handleSincronizar()
        return
      }
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= MODULOS.length) {
        e.preventDefault()
        setModuloActivo(MODULOS[n - 1].id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSincronizar, setModuloActivo])

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="border-b bg-card shadow-sm shrink-0">
        <div className="w-full px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <LayoutDashboard className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-foreground truncate">Obras Ferroviarias</h1>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] h-4">
                  {puntosLength} pts
                </Badge>
                {puntoActivoId && (
                  <>
                    <Separator orientation="vertical" className="h-2.5" />
                    <span className="truncate max-w-[120px] sm:max-w-[200px]">{puntoActivoNombre}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <IndicadorNas />
            <Button
              variant="ghost"
              className="h-9 px-2 md:gap-1.5 shrink-0"
              onClick={handleSincronizar}
              disabled={sincronizando}
              title="Guardar en la nube (Ctrl+S)"
            >
              <Save className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline text-xs">Guardar</span>
            </Button>
            <Button
              variant="ghost"
              className="h-9 px-2 md:gap-1.5 shrink-0"
              onClick={handleRecargarClick}
              disabled={estadoNubeCargando}
              title="Recargar desde la nube"
            >
              <Cloud className="w-4 h-4" />
              <span className="hidden md:inline text-xs">Recargar</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setMostrarHistorial(true)}
              title="Historial de Obras"
            >
              <History className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-primary hover:text-primary/80 shrink-0"
              onClick={() => {
                setMostrarNomenclaturas(true)
                setModuloActivo('nomenclaturas')
              }}
              title="Panel de obra: módulos y ficha"
            >
              <HardHat className="w-4 h-4" />
            </Button>
            {perfil?.rol !== 'usuario' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setMostrarMiembros(true)}
                title="Miembros del proyecto"
              >
                <Users className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => cambiarProyecto(null)}
              title="Cambiar de proyecto"
            >
              <FolderInput className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setMostrarConfig(true)}
              title="Configuración"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full px-4 py-3 overflow-hidden relative isolate">
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
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
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
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground">
                  Espacio: re-guarda cada punto moviendo las imágenes incrustadas a Storage (deduplicadas) y deja en el estado local su versión en URL.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCompactarEspacio}
                  disabled={compactando || sincronizando}
                  className="w-full mt-2"
                >
                  <Archive className="w-4 h-4 mr-2" />
                  {compactando ? 'Compactando...' : 'Compactar espacio'}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3">
                <p className="text-xs text-muted-foreground truncate">
                  Sesión: {perfil?.email || '—'}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => logout()}
                  className="w-full mt-2 text-destructive hover:text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Cerrar sesión
                </Button>
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

      {/* Diálogo para definir título al guardar en la nube */}
      <Dialog open={mostrarDialogoGuardar} onOpenChange={(open) => { if (!open) cancelarGuardado() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="w-5 h-5" />
              Guardar estado en la nube
            </DialogTitle>
            <DialogDescription>
              Asigne un título descriptivo para identificar este estado. Puede dejarlo vacío para usar el valor por defecto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="titulo-estado">Título del estado</Label>
            <Input
              id="titulo-estado"
              value={tituloEstado}
              onChange={(e) => setTituloEstado(e.target.value)}
              placeholder="Ej: Revisión trimestral, Backup previo a entrega..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmarGuardado()
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelarGuardado}>
              Cancelar
            </Button>
            <Button onClick={confirmarGuardado} disabled={sincronizando}>
              <Save className="w-4 h-4 mr-2" />
              {sincronizando ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
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
            <div className="py-6 flex flex-col items-center gap-3">
              <ThinkingLoader
                variant="compact"
                size={48}
                message="Cargando estados desde la nube"
                rotatingMessages={[
                  'Cargando estados desde la nube',
                  'Consultando Supabase',
                  'Preparando lista de estados',
                ]}
              />
            </div>
          ) : estadosNubeLista.length > 0 ? (
            <div className="space-y-3">
              <Alert variant="destructive" className="border-red-200 bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800">Advertencia</AlertTitle>
                <AlertDescription className="text-red-700">
                  Se perderán todos los datos no guardados en curso. Esta acción no se puede deshacer.
                </AlertDescription>
              </Alert>

              <div className="text-sm font-medium">Seleccione un estado para recargar:</div>
              <div className="max-h-[40vh] overflow-y-auto space-y-1.5 pr-1">
                {estadosNubeLista.map((estado) => {
                  const seleccionado = estadoNubeSeleccionado === estado.id
                  return (
                    <button
                      key={estado.id}
                      type="button"
                      onClick={() => setEstadoNubeSeleccionado(estado.id)}
                      className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                        seleccionado
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            seleccionado ? 'border-primary' : 'border-muted-foreground/40'
                          }`}
                        >
                          {seleccionado && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{estado.descripcion || 'Sin descripción'}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] h-4 ${
                                estado.tipo === 'automatico'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              }`}
                            >
                              {estado.tipo === 'automatico' ? 'auto' : 'manual'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(estado.createdAt).toLocaleString('es-ES')}
                            {estado.guardadoPor ? ` · por ${estado.guardadoPor}` : ''}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
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
            {estadosNubeLista.length > 0 && estadoNubeSeleccionado && (
              <Button variant="default" onClick={confirmarRecarga}>
                Confirmar Recarga
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GestionMiembros open={mostrarMiembros} onOpenChange={setMostrarMiembros} />
    </div>
  )
}

export default App
