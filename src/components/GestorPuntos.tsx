import { useState, useRef, useMemo } from 'react'
import { useApp } from '@/context/AppContext'
import { ordenarPuntos, type SortKey } from '@/components/gestor-puntos-logica'
import { useSeleccionPuntos, useEdicionInline, useEdicionModal, useReordenarPuntos, usePuntoCarpeta } from '@/components/gestor-puntos-hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FolderOpen,
  MapPin,
  FolderInput,
  FileText,
  Trash2,
  Route,
  CheckCircle2,
  AlertCircle,
  Lock,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ArrowUpDown,
  Calendar,
  Type,
  ListOrdered,
  AlertTriangle,
  Upload,
} from 'lucide-react'

export function GestorPuntos() {
  const {
    state,
    agregarPunto,
    eliminarPunto,
    setPuntoActivo,
    actualizarPunto,
    setNomenclaturasGlobales,
    moverPunto,
    toggleBloquearPunto,
  } = useApp()
  const [expandido, setExpandido] = useState(false)
  const [dialogoEliminar, setDialogoEliminar] = useState<string | null>(null)
  const [dialogoEliminarSeleccionados, setDialogoEliminarSeleccionados] = useState(false)

  const [dialogoBloquear, setDialogoBloquear] = useState<string | null>(null)
  const { puntoEditando, nombreEditado, setNombreEditado, handleDobleClic, handleGuardarEdicion, handleKeyDownEdicion } = useEdicionInline(actualizarPunto)
  const [sortKey, setSortKey] = useState<SortKey>('manual')
  const [barraBloqueada, setBarraBloqueada] = useState(false)
  const [dialogoReasignar, setDialogoReasignar] = useState(false)
  const { seleccionados: puntosSeleccionados, togglePunto, toggleTodos, remove: removeSeleccion, clear: clearSeleccion } = useSeleccionPuntos(state.puntos)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const routingInputRef = useRef<HTMLInputElement>(null)
  const kmzIndividualRef = useRef<HTMLInputElement>(null)
  const txtIndividualRef = useRef<HTMLInputElement>(null)
  const excelIndividualRef = useRef<HTMLInputElement>(null)
  const fotosIndividualRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Puntos ordenados según el filtro activo
  const puntosOrdenados = useMemo(() => ordenarPuntos(state.puntos, sortKey), [state.puntos, sortKey])

  const { swipeState, dragState, itemRefs, handlePointerDown, getSwipeOffset, shouldIgnoreDragStart } = useReordenarPuntos({ puntosOrdenados, moverPunto, setSortKey })

  const todosSeleccionados = puntosOrdenados.length > 0 && puntosOrdenados.every(p => puntosSeleccionados.has(p.id))
  const seleccionadosCount = puntosSeleccionados.size

  const handleToggleSeleccionPunto = togglePunto
  const handleToggleSeleccionTodos = (checked: boolean) => toggleTodos(puntosOrdenados.map(p => p.id), checked)

  const handleReasignarNumeros = () => {
    if (state.puntos.length === 0) return
    const idsEnOrdenVisual = puntosOrdenados.map(p => p.id)
    idsEnOrdenVisual.forEach((id, idx) => {
      const punto = state.puntos.find(p => p.id === id)
      if (punto && punto.numeroSerie !== idx + 1) {
        actualizarPunto(id, { numeroSerie: idx + 1 })
      }
    })
    setSortKey('manual')
    setDialogoReasignar(false)
  }

  const handleEliminarPunto = async (id: string) => {
    await eliminarPunto(id)
    removeSeleccion(id)
    setDialogoEliminar(null)
  }

  const handleEliminarSeleccionados = async () => {
    const ids = Array.from(puntosSeleccionados)
    for (const id of ids) {
      await eliminarPunto(id)
    }
    clearSeleccion()
    setDialogoEliminarSeleccionados(false)
  }

  const handleBloquearPunto = (id: string) => {
    toggleBloquearPunto(id)
    setDialogoBloquear(null)
  }

  const { puntoEditandoModal, setPuntoEditandoModal, editForm, setEditForm, guardarEdicionModal, handleEditarPunto, setEditarPuntoCreado } = useEdicionModal({ puntos: state.puntos, puntoActivo: state.puntoActivo, moverPunto, actualizarPunto, setPuntoActivo, setDialogoBloquear })
  const { procesandoCarpeta, mostrarRouting, setMostrarRouting, routingActual, handleSeleccionarCarpeta, handleRoutingManual, cargarArchivoIndividual, cargarFotos } = usePuntoCarpeta({ puntoActivo: state.puntoActivo, nomenclaturasGlobales: state.nomenclaturasGlobales, agregarPunto, actualizarPunto, setNomenclaturasGlobales, setEditarPuntoCreado })

  // Handlers mejorados para swipe y drag con umbral de movimiento
  const formatFecha = (iso?: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })
  }

  return (
    <>
      {/* Barra lateral desplegable */}
      <div
        ref={containerRef}
        className={`relative h-full bg-card border-r shadow-lg transition-all duration-300 ease-in-out flex flex-col ${
          expandido ? 'w-[420px]' : 'w-[60px]'
        }`}
        style={{ pointerEvents: 'auto' }}
        onMouseEnter={() => { setExpandido(true); setBarraBloqueada(true); }}
        onMouseLeave={() => { if (!barraBloqueada) setExpandido(false); }}
      >
        {/* Header colapsado */}
        <div className={`flex items-center justify-between p-3 border-b shrink-0 ${expandido ? '' : 'flex-col gap-2'}`}>
          <div className={`flex items-center ${expandido ? 'gap-2' : 'flex-col gap-1'}`}>
            <MapPin className="w-5 h-5 text-primary shrink-0" />
            {expandido && (
              <span className="font-semibold text-sm">Puntos</span>
            )}
          </div>
          <Badge variant="secondary" className="text-xs">{state.puntos.length}</Badge>
        </div>

        {/* Botón toggle fijo */}
        <button
          onClick={() => {
            if (expandido) {
              setBarraBloqueada(false)
              setExpandido(false)
            } else {
              setBarraBloqueada(true)
              setExpandido(true)
            }
          }}
          onMouseEnter={(e) => e.stopPropagation()}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-12 bg-primary text-primary-foreground rounded-r-lg shadow-md flex items-center justify-center hover:bg-primary/90 transition-colors"
          style={{ zIndex: 100 }}
          title={expandido ? 'Colapsar' : 'Expandir'}
        >
          {expandido ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Contenido expandible */}
        <div className={`flex-1 overflow-hidden flex flex-col ${expandido ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'} transition-opacity duration-200`}>
          <div className="p-3 space-y-3 overflow-hidden flex flex-col h-full">
            {/* Inputs ocultos */}
            <input
              ref={fileInputRef}
              type="file"
              {...{ webkitdirectory: "true", directory: "true" }}
              onChange={handleSeleccionarCarpeta}
              className="hidden"
            />
            <input
              ref={routingInputRef}
              type="file"
              {...{ webkitdirectory: "true", directory: "true" }}
              onChange={handleRoutingManual}
              className="hidden"
            />

            {/* Botones principales */}
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={procesandoCarpeta}
                size="sm"
              >
                <FolderInput className="w-4 h-4 mr-2" />
                {procesandoCarpeta ? 'Procesando...' : 'Importar Carpeta'}
              </Button>

              {state.puntoActivo && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => routingInputRef.current?.click()}
                  disabled={procesandoCarpeta}
                  size="sm"
                >
                  <Route className="w-4 h-4 mr-2" />
                  Asignar archivos
                </Button>
              )}
            </div>

            <Separator />

            {/* Filtro de ordenamiento */}
            {state.puntos.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <ArrowUpDown className="w-3 h-3" />
                    Ordenar por
                  </label>
                  </div>
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Ordenar por..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">
                      <span className="flex items-center gap-2">
                        <ListOrdered className="w-3 h-3" /> Orden manual
                      </span>
                    </SelectItem>
                    <SelectItem value="nombre-asc">
                      <span className="flex items-center gap-2">
                        <Type className="w-3 h-3" /> Nombre A → Z
                      </span>
                    </SelectItem>
                    <SelectItem value="nombre-desc">
                      <span className="flex items-center gap-2">
                        <Type className="w-3 h-3" /> Nombre Z → A
                      </span>
                    </SelectItem>
                    <SelectItem value="fecha-asignada-desc">
                      <span className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> Fecha asignada: reciente
                      </span>
                    </SelectItem>
                    <SelectItem value="fecha-asignada-asc">
                      <span className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> Fecha asignada: antigua
                      </span>
                    </SelectItem>
                    <SelectItem value="fecha-ingreso-desc">
                      <span className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> Fecha de ingreso: reciente
                      </span>
                    </SelectItem>
                    <SelectItem value="fecha-ingreso-asc">
                      <span className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> Fecha de ingreso: antigua
                      </span>
                    </SelectItem>
                    <SelectItem value="cadenamiento-asc">
                      <span className="flex items-center gap-2">
                        <Type className="w-3 h-3" /> Cadenamiento: menor
                      </span>
                    </SelectItem>
                    <SelectItem value="cadenamiento-desc">
                      <span className="flex items-center gap-2">
                        <Type className="w-3 h-3" /> Cadenamiento: mayor
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Barra de herramientas */}
            {state.puntos.length > 0 && (
              <div className="space-y-2 p-2 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Checkbox
                      checked={todosSeleccionados}
                      onCheckedChange={(checked) => handleToggleSeleccionTodos(checked === true)}
                      aria-label="Seleccionar todos los puntos"
                    />
                    <span>
                      {seleccionadosCount > 0
                        ? `${seleccionadosCount}/${state.puntos.length} seleccionados`
                        : `${state.puntos.length} punto${state.puntos.length === 1 ? '' : 's'}`}
                    </span>
                  </label>

                  {seleccionadosCount > 0 && (
                    <button
                      onClick={() => clearSeleccion()}
                      className="text-xs text-muted-foreground hover:text-foreground"
                      title="Limpiar selección"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {/* Botón Reasignar N° Serie - siempre visible cuando hay puntos */}
                  {seleccionadosCount > 0 && (
                    <button
                      onClick={() => setDialogoEliminarSeleccionados(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-medium"
                      title="Eliminar puntos seleccionados"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar</span>
                    </button>
                  )}

                  <button
                    onClick={() => setDialogoReasignar(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-medium"
                    title="Reasignar números de serie según orden actual (1, 2, 3...)"
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                    <span>Reasignar N°</span>
                  </button>

                  {sortKey !== 'manual' && (
                    <button
                      onClick={() => setSortKey('manual')}
                      className="p-1.5 rounded hover:bg-primary/10 text-primary"
                      title="Volver a orden manual"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Lista de puntos */}
            <ScrollArea className="flex-1 overflow-hidden">
              {state.puntos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay puntos importados</p>
                  <p className="text-xs mt-1">Haz clic en "Importar Carpeta"</p>
                </div>
              ) : (
                <div className="space-y-1 select-none">
                  {puntosOrdenados.map((punto, visualIndex) => {
                    const swipeOffset = getSwipeOffset(punto.id)
                    const isSwipingThis = swipeState.id === punto.id && swipeState.isSwiping
                    const isDraggingThis = dragState.id === punto.id && dragState.isDragging
                    const isBloqueado = punto.bloqueado
                    const isActivo = state.puntoActivo?.id === punto.id
                    const dragOffset = isDraggingThis && dragState.hasMoved ? dragState.currentY - dragState.startY : 0
                    const isDropTarget = dragState.id !== punto.id && dragState.isDragging && dragState.currentIndex === visualIndex

                    return (
                      <div
                        key={punto.id}
                        ref={(el) => {
                          if (el) itemRefs.current.set(punto.id, el)
                        }}
                        className="relative overflow-visible group"
                        style={{ height: '80px' }}
                      >
                        <div
                          className="absolute inset-0 bg-red-500 flex items-center justify-end pr-4 rounded-lg transition-opacity pointer-events-none"
                          style={{ opacity: isSwipingThis && swipeOffset > 30 ? 1 : 0 }}
                        >
                          <Trash2 className="w-5 h-5 text-white" />
                        </div>

                        <div
                          onClick={() => setPuntoActivo(punto)}
                          onMouseDown={(e) => {
                            if (sortKey !== 'manual' || isBloqueado || shouldIgnoreDragStart(e.target)) return
                            const puntosPorSerie = [...state.puntos].sort((a, b) => a.numeroSerie - b.numeroSerie)
                            const realIndex = puntosPorSerie.findIndex(p => p.id === punto.id)
                            handlePointerDown(e, punto.id, realIndex)
                          }}
                          onTouchStart={(e) => {
                            if (sortKey !== 'manual' || isBloqueado || shouldIgnoreDragStart(e.target)) return
                            const puntosPorSerie = [...state.puntos].sort((a, b) => a.numeroSerie - b.numeroSerie)
                            const realIndex = puntosPorSerie.findIndex(p => p.id === punto.id)
                            handlePointerDown(e, punto.id, realIndex)
                          }}
                          className={`relative z-10 flex items-center gap-2 p-2 rounded-lg transition-all duration-150 min-w-0 h-full group cursor-grab active:cursor-grabbing ${
                            isActivo
                              ? 'bg-primary/10 border border-primary/30'
                              : 'hover:bg-muted border border-transparent'
                          } ${isDropTarget ? 'border-primary/60 bg-primary/5' : ''} ${isDraggingThis && dragState.hasMoved ? 'scale-[1.02] shadow-xl z-20 cursor-grabbing bg-card' : ''} ${isBloqueado ? 'opacity-80' : ''}`}
                          style={{
                            transform: isDraggingThis && dragState.hasMoved
                              ? `translateY(${dragOffset}px)`
                              : isSwipingThis ? `translateX(-${swipeOffset}px)` : undefined,
                          }}
                          title={isBloqueado ? 'Punto bloqueado - haz clic para visualizar o usa el botón editar para desbloquear' : 'Haz clic para visualizar · Usa el botón editar para modificar · Arrastra para reordenar · Desliza para eliminar'}
                        >
                          <Checkbox
                            checked={puntosSeleccionados.has(punto.id)}
                            onCheckedChange={(checked) => handleToggleSeleccionPunto(punto.id, checked === true)}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            className="flex-shrink-0"
                            aria-label={`Seleccionar ${punto.nombre}`}
                          />

                          {/* Handle de drag */}
                          {!isBloqueado && sortKey === 'manual' && (
                            <div
                              className="flex-shrink-0 text-muted-foreground/50 cursor-grab active:cursor-grabbing"
                              onMouseDown={(e) => {
                                if (sortKey !== 'manual' || isBloqueado) return
                                const puntosPorSerie = [...state.puntos].sort((a, b) => a.numeroSerie - b.numeroSerie)
                                const realIndex = puntosPorSerie.findIndex(p => p.id === punto.id)
                                handlePointerDown(e, punto.id, realIndex)
                              }}
                              onTouchStart={(e) => {
                                if (sortKey !== 'manual' || isBloqueado) return
                                const puntosPorSerie = [...state.puntos].sort((a, b) => a.numeroSerie - b.numeroSerie)
                                const realIndex = puntosPorSerie.findIndex(p => p.id === punto.id)
                                handlePointerDown(e, punto.id, realIndex)
                              }}
                              title="Arrastra para reordenar"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                          )}

                          {isBloqueado && (
                            <div className="flex-shrink-0" title="Punto bloqueado">
                              <Lock className="w-4 h-4 text-amber-500" />
                            </div>
                          )}

                          {/* Número de serie - clickeable para seleccionar */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setPuntoActivo(punto)
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              handleEditarPunto(punto)
                            }}
                            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:scale-110 transition-transform ${isActivo ? 'ring-2 ring-offset-1 ring-primary' : ''} ${isBloqueado ? 'bg-muted-foreground/30' : 'bg-primary'}`}
                            title={`Seleccionar punto ${punto.numeroSerie}: ${punto.nombre}. Doble clic para editar N°`}
                          >
                            <span className={`text-xs font-bold ${isBloqueado ? 'text-muted-foreground' : 'text-primary-foreground'}`}>
                              {punto.numeroSerie}
                            </span>
                          </button>

                          {/* Área de nombre y datos - clickeable para seleccionar */}
                          <div
                            className="flex-1 min-w-0 overflow-hidden flex flex-col justify-center cursor-pointer"
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              handleDobleClic(punto)
                            }}
                          >
                            {puntoEditando === punto.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={nombreEditado}
                                  onChange={(e) => setNombreEditado(e.target.value)}
                                  onKeyDown={(e) => handleKeyDownEdicion(e, punto.id)}
                                  onBlur={() => handleGuardarEdicion(punto.id)}
                                  autoFocus
                                  className="h-7 text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            ) : (
                              <>
                                <p className={`text-sm font-medium truncate ${isBloqueado ? 'text-muted-foreground' : ''}`}>{punto.nombre}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {punto.carpetaPath && (
                                    <div className="flex items-center gap-1 min-w-0">
                                      <FolderOpen className="w-3 h-3 flex-shrink-0" />
                                      <span className="truncate">{punto.carpetaPath}</span>
                                    </div>
                                  )}
                                  {punto.cadenamiento && (
                                    <span className="flex-shrink-0">· Cad. {punto.cadenamiento}</span>
                                  )}
                                  <span className="flex-shrink-0">· {formatFecha(punto.updatedAt)}</span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Botón editar - SIEMPRE VISIBLE */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditarPunto(punto)
                            }}
                            className="flex-shrink-0 p-1.5 rounded hover:bg-primary/20 hover:text-primary text-muted-foreground transition-colors"
                            title={isBloqueado ? 'Punto bloqueado - haz clic para desbloquear y editar' : 'Editar punto'}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDialogoEliminar(punto.id)
                            }}
                            className="flex-shrink-0 p-1.5 rounded hover:bg-red-100 hover:text-red-700 text-muted-foreground transition-colors"
                            title="Eliminar punto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Vista colapsada - mini lista */}
        {!expandido && (
          <div className="flex-1 overflow-y-auto py-2 pointer-events-auto">
            <div className="flex flex-col items-center gap-1">
              {state.puntos.slice(0, 8).map((punto) => (
                <button
                  key={punto.id}
                  onClick={() => setPuntoActivo(punto)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    state.puntoActivo?.id === punto.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted-foreground/20 text-muted-foreground'
                  } ${punto.bloqueado ? 'opacity-50' : ''}`}
                  title={punto.nombre}
                >
                  {punto.numeroSerie}
                </button>
              ))}
              {state.puntos.length > 8 && (
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                  +{state.puntos.length - 8}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dialog de confirmación eliminar */}
      <Dialog open={!!dialogoEliminar} onOpenChange={() => setDialogoEliminar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Punto</DialogTitle>
            <DialogDescription>
              Se eliminará el punto y se re-enumerarán los puntos restantes.
              ¿Estás seguro?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoEliminar(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => dialogoEliminar && handleEliminarPunto(dialogoEliminar)}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación bloquear/desbloquear */}
      <Dialog open={dialogoEliminarSeleccionados} onOpenChange={setDialogoEliminarSeleccionados}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar puntos seleccionados</DialogTitle>
            <DialogDescription>
              Se eliminarán {seleccionadosCount} punto{seleccionadosCount === 1 ? '' : 's'} y se re-enumerarán los puntos restantes.
              ¿Estás seguro?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoEliminarSeleccionados(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleEliminarSeleccionados}
              disabled={seleccionadosCount === 0}
            >
              Eliminar seleccionados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialogoBloquear} onOpenChange={() => setDialogoBloquear(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {state.puntos.find(p => p.id === dialogoBloquear)?.bloqueado ? 'Desbloquear Punto' : 'Bloquear Punto'}
            </DialogTitle>
            <DialogDescription>
              {state.puntos.find(p => p.id === dialogoBloquear)?.bloqueado
                ? 'Al desbloquear el punto se permitirá editar sus datos y reordenarlo. ¿Continuar?'
                : 'Al bloquear el punto se protegerá contra modificaciones y no se podrá reordenar. ¿Continuar?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoBloquear(null)}>
              Cancelar
            </Button>
            <Button
              variant={state.puntos.find(p => p.id === dialogoBloquear)?.bloqueado ? 'default' : 'secondary'}
              onClick={() => dialogoBloquear && handleBloquearPunto(dialogoBloquear)}
            >
              {state.puntos.find(p => p.id === dialogoBloquear)?.bloqueado ? 'Desbloquear' : 'Bloquear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de edición completa */}
      <Dialog open={!!puntoEditandoModal} onOpenChange={() => setPuntoEditandoModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Punto</DialogTitle>
            <DialogDescription>
              Modifica los datos del punto ferroviario
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">N° de serie / posición</label>
              <Input
                type="number"
                min={1}
                max={state.puntos.length}
                value={editForm.numeroSerie}
                onChange={(e) => setEditForm(prev => ({ ...prev, numeroSerie: e.target.value }))}
                placeholder="1"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre</label>
              <Input
                value={editForm.nombre}
                onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre del punto"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Descripción</label>
              <Textarea
                value={editForm.descripcion}
                onChange={(e) => setEditForm(prev => ({ ...prev, descripcion: e.target.value }))}
                placeholder="Descripción opcional"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Ruta de carpeta</label>
              <Input
                value={editForm.carpetaPath}
                onChange={(e) => setEditForm(prev => ({ ...prev, carpetaPath: e.target.value }))}
                placeholder="Ruta de la carpeta"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cadenamiento</label>
              <Input
                value={editForm.cadenamiento}
                onChange={(e) => setEditForm(prev => ({ ...prev, cadenamiento: e.target.value }))}
                placeholder="Ej: 56 (separado al sincronizar)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Latitud</label>
                <Input
                  type="number"
                  step="any"
                  value={editForm.coordenadas.lat}
                  onChange={(e) => setEditForm(prev => ({
                    ...prev,
                    coordenadas: { ...prev.coordenadas, lat: e.target.value }
                  }))}
                  placeholder="-33.4567"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Longitud</label>
                <Input
                  type="number"
                  step="any"
                  value={editForm.coordenadas.lng}
                  onChange={(e) => setEditForm(prev => ({
                    ...prev,
                    coordenadas: { ...prev.coordenadas, lng: e.target.value }
                  }))}
                  placeholder="-70.6789"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPuntoEditandoModal(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarEdicionModal}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación reasignar números */}
      <Dialog open={dialogoReasignar} onOpenChange={() => setDialogoReasignar(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Reasignar Números de Serie
            </DialogTitle>
            <DialogDescription>
              Se reasignarán los números de serie de todos los puntos según el orden actual en pantalla.
              El primer punto será el N°1, el segundo el N°2, y así sucesivamente.
              ¿Deseas continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoReasignar(false)}>
              Cancelar
            </Button>
            <Button onClick={handleReasignarNumeros}>
              <ListOrdered className="w-4 h-4 mr-2" />
              Reasignar N°
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de routing manual */}
      <Dialog open={mostrarRouting} onOpenChange={() => setMostrarRouting(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Punto agregado: {state.puntoActivo?.nombre}</DialogTitle>
            <DialogDescription>
              Tipos de archivos detectados en la carpeta importada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <input ref={kmzIndividualRef} type="file" accept=".kmz,.kml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) cargarArchivoIndividual('kmz', f); e.target.value = '' }} />
            <input ref={txtIndividualRef} type="file" accept=".txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) cargarArchivoIndividual('txt', f); e.target.value = '' }} />
            <input ref={excelIndividualRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) cargarArchivoIndividual('excel', f); e.target.value = '' }} />
            <input ref={fotosIndividualRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { const fs = e.target.files; if (fs && fs.length > 0) cargarFotos(Array.from(fs)); e.target.value = '' }} />
            {routingActual && (
              <>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted">
                  {routingActual.kmz ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Coordenadas KMZ/KML</p>
                        <p className="text-xs text-muted-foreground">Archivo cargado correctamente</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium">Sin coordenadas</p>
                        <p className="text-xs text-muted-foreground">No se encontró archivo KMZ/KML</p>
                      </div>
                      <Button size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs" onClick={() => kmzIndividualRef.current?.click()}>
                        <Upload className="w-3 h-3 mr-1" />
                        Cargar
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted">
                  {routingActual.txt ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Documento TXT</p>
                        <p className="text-xs text-muted-foreground">Archivo cargado correctamente</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium">Sin documento</p>
                        <p className="text-xs text-muted-foreground">No se encontró archivo TXT</p>
                      </div>
                      <Button size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs" onClick={() => txtIndividualRef.current?.click()}>
                        <Upload className="w-3 h-3 mr-1" />
                        Cargar
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted">
                  {routingActual.excel ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">Excel de sincronización</p>
                        <p className="text-xs text-muted-foreground">Archivo cargado correctamente</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium">Sin Excel</p>
                        <p className="text-xs text-muted-foreground">No se encontró archivo Excel</p>
                      </div>
                      <Button size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs" onClick={() => excelIndividualRef.current?.click()}>
                        <Upload className="w-3 h-3 mr-1" />
                        Cargar
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted">
                  {routingActual.fotos > 0 ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">{routingActual.fotos} fotos</p>
                        <p className="text-xs text-muted-foreground">Imágenes cargadas correctamente</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium">Sin fotos</p>
                        <p className="text-xs text-muted-foreground">No se encontraron imágenes</p>
                      </div>
                      <Button size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs" onClick={() => fotosIndividualRef.current?.click()}>
                        <Upload className="w-3 h-3 mr-1" />
                        Cargar
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setMostrarRouting(false)}>
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
