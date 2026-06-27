import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { procesarCarpetaPunto, formatearNombreFoto, buscarExcelPorNombreCarpeta, type DatosPuntoCarpeta } from '@/lib/folder-parser'
import { guardarArchivoSincronizacion } from '@/lib/sync-file-store'
import { generarUUID } from '@/lib/utils'
import {
  consolidarNomenclaturas,
  fusionarNomenclaturas,
  parsearNomenclaturasDesdeTexto,
  type NomenclaturaEntry,
} from '@/lib/nomenclaturas'
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
  FileSpreadsheet,
  Image,
  MapPinned,
  Folder,
  Camera,
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
} from 'lucide-react'

interface SwipeState {
  id: string | null
  startX: number
  currentX: number
  isSwiping: boolean
}

interface DragState {
  id: string | null
  startY: number
  startX: number
  currentY: number
  currentIndex: number
  isDragging: boolean
  hasMoved: boolean
}

interface FileRouting {
  kmz: boolean
  txt: boolean
  excel: boolean
  fotos: number
}

type SortKey = 'manual' | 'nombre-asc' | 'nombre-desc' | 'fecha-asignada-asc' | 'fecha-asignada-desc' | 'fecha-ingreso-asc' | 'fecha-ingreso-desc'

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
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [nuevaPosicion, setNuevaPosicion] = useState('1')
  const [nombrePunto, setNombrePunto] = useState('')
  const [descripcionPunto, setDescripcionPunto] = useState('')
  const [carpetaPath, setCarpetaPath] = useState('')
  const [dialogoEliminar, setDialogoEliminar] = useState<string | null>(null)
  const [dialogoEliminarSeleccionados, setDialogoEliminarSeleccionados] = useState(false)

  const [dialogoBloquear, setDialogoBloquear] = useState<string | null>(null)
  const [puntoEditando, setPuntoEditando] = useState<string | null>(null)
  const [nombreEditado, setNombreEditado] = useState('')
  const [procesandoCarpeta, setProcesandoCarpeta] = useState(false)
  const [datosCarpetaPreview, setDatosCarpetaPreview] = useState<DatosPuntoCarpeta | null>(null)
  const [mostrarRouting, setMostrarRouting] = useState(false)
  const [routingActual, setRoutingActual] = useState<FileRouting | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('manual')
  const [barraBloqueada, setBarraBloqueada] = useState(false)
  const [dialogoReasignar, setDialogoReasignar] = useState(false)
  const [puntosSeleccionados, setPuntosSeleccionados] = useState<Set<string>>(new Set())
  const [editarPuntoCreado, setEditarPuntoCreado] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const routingInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const clickStartTimeRef = useRef<number>(0)

  // Estados para swipe y drag
  const [swipeState, setSwipeState] = useState<SwipeState>({
    id: null,
    startX: 0,
    currentX: 0,
    isSwiping: false,
  })
  const [dragState, setDragState] = useState<DragState>({
    id: null,
    startY: 0,
    startX: 0,
    currentY: 0,
    currentIndex: -1,
    isDragging: false,
    hasMoved: false,
  })
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Puntos ordenados según el filtro activo
  const puntosOrdenados = useMemo(() => {
    const puntos = [...state.puntos]
    switch (sortKey) {
      case 'nombre-asc':
        return puntos.sort((a, b) => a.nombre.localeCompare(b.nombre))
      case 'nombre-desc':
        return puntos.sort((a, b) => b.nombre.localeCompare(a.nombre))
      case 'fecha-asignada-asc':
        return puntos.sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''))
      case 'fecha-asignada-desc':
        return puntos.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      case 'fecha-ingreso-asc':
        return puntos.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
      case 'fecha-ingreso-desc':
        return puntos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      case 'manual':
      default:
        return puntos.sort((a, b) => a.numeroSerie - b.numeroSerie)
    }
  }, [state.puntos, sortKey])

  const todosSeleccionados = puntosOrdenados.length > 0 && puntosOrdenados.every(p => puntosSeleccionados.has(p.id))
  const seleccionadosCount = puntosSeleccionados.size

  useEffect(() => {
    setPuntosSeleccionados(prev => {
      const idsDisponibles = new Set(state.puntos.map(p => p.id))
      const seleccionValida = Array.from(prev).filter(id => idsDisponibles.has(id))

      if (seleccionValida.length === prev.size) {
        return prev
      }

      return new Set(seleccionValida)
    })
  }, [state.puntos])

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

  const handleSeleccionarCarpeta = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setProcesandoCarpeta(true)

    try {
      const datos = await procesarCarpetaPunto(files)

      // Detectar Excel con mismo nombre que la carpeta y precargarlo para sincronización
      const excelPorNombre = buscarExcelPorNombreCarpeta(files, datos.nombreCarpeta)
      if (excelPorNombre) {
        datos.excel = excelPorNombre
      }

      setDatosCarpetaPreview(datos)

      setNombrePunto(datos.nombreCarpeta)
      setDescripcionPunto('')
      setCarpetaPath(datos.nombreCarpeta)

      setRoutingActual({
        kmz: !!datos.coordenadas,
        txt: !!datos.textoDocumento,
        excel: !!datos.excel,
        fotos: datos.fotos.length,
      })

      setMostrarFormulario(true)
    } catch (error) {
      console.error('Error procesando carpeta:', error)
      alert('Error al procesar la carpeta')
    } finally {
      setProcesandoCarpeta(false)
    }
  }

  const handleRoutingManual = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setProcesandoCarpeta(true)

    try {
      const datos = await procesarCarpetaPunto(files)

      if (!state.puntoActivo) {
        alert('Selecciona un punto primero para asignarle los archivos')
        setProcesandoCarpeta(false)
        return
      }

      const moduloDataActual = state.puntoActivo.moduloData || {}
      const nuevoModuloData = { ...moduloDataActual }

      if (datos.coordenadas) {
        nuevoModuloData.georeferencia = {
          coordenadas: datos.coordenadas,
          notas: `Coordenadas extraídas manualmente de archivo KMZ/KML`,
          updatedAt: new Date().toISOString(),
        }
      }

      if (datos.textoDocumento) {
        const documentacionActual = (nuevoModuloData.documentacion as { nomenclaturas?: NomenclaturaEntry[] } | undefined) || {}
        const nomenclaturasActuales = consolidarNomenclaturas([
          state.nomenclaturasGlobales,
          documentacionActual.nomenclaturas || [],
        ])
        const detectadas = parsearNomenclaturasDesdeTexto(datos.textoDocumento)
        const nomenclaturasActualizadas = fusionarNomenclaturas(nomenclaturasActuales, detectadas)
        setNomenclaturasGlobales(nomenclaturasActualizadas)
        nuevoModuloData.documentacion = {
          ...documentacionActual,
          notas: datos.textoDocumento,
          nombreArchivo: datos.nombreCarpeta + '.txt',
          nomenclaturas: nomenclaturasActualizadas,
          updatedAt: new Date().toISOString(),
        }
      }

      if (datos.fotos.length > 0) {
        const fotosExistentes = (nuevoModuloData.analisis as Record<string, unknown>)?.fotosIndexadas || []
        nuevoModuloData.analisis = {
          ...(nuevoModuloData.analisis as Record<string, unknown> || {}),
          fotosIndexadas: [
            ...(Array.isArray(fotosExistentes) ? fotosExistentes : []),
            ...datos.fotos.map(f => ({
              id: f.id,
              index: f.index,
              nombre: f.nombre,
              nombreFormateado: formatearNombreFoto(f.nombre, f.index),
              subcarpeta: f.subcarpeta,
              preview: f.preview,
            })),
          ],
          fotosCount: datos.fotos.length,
          subcarpetas: datos.subcarpetas,
          updatedAt: new Date().toISOString(),
        }
      }

      const excelPorNombre = buscarExcelPorNombreCarpeta(files, datos.nombreCarpeta)
      if (excelPorNombre && state.puntoActivo) {
        const archivoId = (nuevoModuloData.sincronizacion as { archivoId?: string } | undefined)?.archivoId || generarUUID()
        await guardarArchivoSincronizacion(archivoId, excelPorNombre)
        nuevoModuloData.sincronizacion = {
          ...(nuevoModuloData.sincronizacion as Record<string, unknown> || {}),
          archivoNombre: excelPorNombre.name,
          archivoId,
          ruta: excelPorNombre.webkitRelativePath || excelPorNombre.name,
          cargadoEn: new Date().toISOString(),
        }
      }

      actualizarPunto(state.puntoActivo.id, {
        moduloData: nuevoModuloData,
        coordenadas: datos.coordenadas ? {
          lat: datos.coordenadas.y,
          lng: datos.coordenadas.x,
        } : undefined,
      })

      setRoutingActual({
        kmz: !!datos.coordenadas,
        txt: !!datos.textoDocumento,
        excel: !!datos.excel,
        fotos: datos.fotos.length,
      })

      setMostrarRouting(true)
    } catch (error) {
      console.error('Error en routing manual:', error)
      alert('Error al procesar la carpeta')
    } finally {
      setProcesandoCarpeta(false)
    }
  }

  const handleAgregarPunto = async () => {
    if (!nombrePunto.trim()) return

    const moduloData: Record<string, unknown> = {}

    if (datosCarpetaPreview) {
      if (datosCarpetaPreview.coordenadas) {
        moduloData.georeferencia = {
          coordenadas: datosCarpetaPreview.coordenadas,
          notas: `Coordenadas extraídas de archivo KMZ/KML`,
          updatedAt: new Date().toISOString(),
        }
      }

      if (datosCarpetaPreview.textoDocumento) {
        const nomenclaturasActuales = consolidarNomenclaturas([state.nomenclaturasGlobales])
        const detectadas = parsearNomenclaturasDesdeTexto(datosCarpetaPreview.textoDocumento)
        const nomenclaturasActualizadas = fusionarNomenclaturas(nomenclaturasActuales, detectadas)
        setNomenclaturasGlobales(nomenclaturasActualizadas)
        moduloData.documentacion = {
          notas: datosCarpetaPreview.textoDocumento,
          nombreArchivo: datosCarpetaPreview.nombreCarpeta + '.txt',
          nomenclaturas: nomenclaturasActualizadas,
          updatedAt: new Date().toISOString(),
        }
      }

      if (datosCarpetaPreview.fotos.length > 0) {
        moduloData.analisis = {
          fotosIndexadas: datosCarpetaPreview.fotos.map(f => ({
            id: f.id,
            index: f.index,
            nombre: f.nombre,
            nombreFormateado: formatearNombreFoto(f.nombre, f.index),
            subcarpeta: f.subcarpeta,
            preview: f.preview,
          })),
          fotosCount: datosCarpetaPreview.fotos.length,
          subcarpetas: datosCarpetaPreview.subcarpetas,
          updatedAt: new Date().toISOString(),
        }
      }

      if (datosCarpetaPreview.excel) {
        const archivoId = generarUUID()
        await guardarArchivoSincronizacion(archivoId, datosCarpetaPreview.excel)
        moduloData.sincronizacion = {
          archivoNombre: datosCarpetaPreview.excel.name,
          archivoId,
          ruta: datosCarpetaPreview.excel.webkitRelativePath || datosCarpetaPreview.excel.name,
          cargadoEn: new Date().toISOString(),
        }
      }
    }

    agregarPunto(Number(nuevaPosicion), {
      nombre: nombrePunto.trim(),
      descripcion: descripcionPunto.trim() || undefined,
      carpetaPath: carpetaPath.trim() || undefined,
      coordenadas: datosCarpetaPreview?.coordenadas ? {
        lat: datosCarpetaPreview.coordenadas.y,
        lng: datosCarpetaPreview.coordenadas.x,
      } : undefined,
      moduloData,
    })

    setNombrePunto('')
    setDescripcionPunto('')
    setCarpetaPath('')
    setDatosCarpetaPreview(null)
    setMostrarFormulario(false)
    setRoutingActual(null)
    setEditarPuntoCreado(true)
  }

  const handleEliminarPunto = async (id: string) => {
    await eliminarPunto(id)
    setPuntosSeleccionados(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setDialogoEliminar(null)
  }

  const handleEliminarSeleccionados = async () => {
    const ids = Array.from(puntosSeleccionados)
    for (const id of ids) {
      await eliminarPunto(id)
    }
    setPuntosSeleccionados(new Set())
    setDialogoEliminarSeleccionados(false)
  }

  const handleToggleSeleccionPunto = (id: string, checked: boolean) => {
    setPuntosSeleccionados(prev => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleToggleSeleccionTodos = (checked: boolean) => {
    setPuntosSeleccionados(checked ? new Set(puntosOrdenados.map(p => p.id)) : new Set())
  }

  const handleBloquearPunto = (id: string) => {
    toggleBloquearPunto(id)
    setDialogoBloquear(null)
  }

  const handleDobleClic = (punto: typeof state.puntos[0]) => {
    if (punto.bloqueado) return
    setPuntoEditando(punto.id)
    setNombreEditado(punto.nombre)
  }

  const handleGuardarEdicion = (id: string) => {
    if (nombreEditado.trim()) {
      actualizarPunto(id, { nombre: nombreEditado.trim() })
    }
    setPuntoEditando(null)
    setNombreEditado('')
  }

  const handleCancelarEdicion = () => {
    setPuntoEditando(null)
    setNombreEditado('')
  }

  const handleKeyDownEdicion = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleGuardarEdicion(id)
    } else if (e.key === 'Escape') {
      handleCancelarEdicion()
    }
  }

  const [puntoEditandoModal, setPuntoEditandoModal] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    numeroSerie: '1',
    nombre: '',
    descripcion: '',
    carpetaPath: '',
    coordenadas: { lat: '', lng: '' }
  })

  const abrirEdicionModal = (punto: typeof state.puntos[0]) => {
    if (punto.bloqueado) {
      setDialogoBloquear(punto.id)
      return
    }
    setPuntoEditandoModal(punto.id)
    setEditForm({
      numeroSerie: punto.numeroSerie.toString(),
      nombre: punto.nombre,
      descripcion: punto.descripcion || '',
      carpetaPath: punto.carpetaPath || '',
      coordenadas: {
        lat: punto.coordenadas?.lat?.toString() || '',
        lng: punto.coordenadas?.lng?.toString() || ''
      }
    })
  }

  useEffect(() => {
    if (!editarPuntoCreado || !state.puntoActivo) return

    abrirEdicionModal(state.puntoActivo)
    setEditarPuntoCreado(false)
  }, [editarPuntoCreado, state.puntoActivo])

  const guardarEdicionModal = () => {
    if (!puntoEditandoModal) return
    const puntoActual = state.puntos.find(p => p.id === puntoEditandoModal)
    const numeroSerieEditado = Number(editForm.numeroSerie)
    const nuevaPosicion = Number.isFinite(numeroSerieEditado)
      ? Math.max(1, Math.min(Math.trunc(numeroSerieEditado), state.puntos.length))
      : puntoActual?.numeroSerie

    if (puntoActual && nuevaPosicion && nuevaPosicion !== puntoActual.numeroSerie) {
      moverPunto(puntoEditandoModal, nuevaPosicion)
    }

    const updates: Partial<typeof state.puntos[0]> = {
      nombre: editForm.nombre.trim(),
      descripcion: editForm.descripcion.trim() || undefined,
      carpetaPath: editForm.carpetaPath.trim() || undefined,
    }
    if (editForm.coordenadas.lat && editForm.coordenadas.lng) {
      updates.coordenadas = {
        lat: parseFloat(editForm.coordenadas.lat),
        lng: parseFloat(editForm.coordenadas.lng)
      }
    }
    actualizarPunto(puntoEditandoModal, updates)
    setPuntoEditandoModal(null)
  }

  // Handlers mejorados para swipe y drag con umbral de movimiento
  const handlePointerDown = useCallback((e: React.TouchEvent | React.MouseEvent, puntoId: string, index: number) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    clickStartTimeRef.current = Date.now()

    setSwipeState({
      id: puntoId,
      startX: clientX,
      currentX: clientX,
      isSwiping: true,
    })
    setDragState({
      id: puntoId,
      startY: clientY,
      startX: clientX,
      currentY: clientY,
      currentIndex: index,
      isDragging: true,
      hasMoved: false,
    })
  }, [])

  useEffect(() => {
    if (!dragState.isDragging || !dragState.id) return

    const getTargetIndex = (clientY: number) => {
      const orderedIds = puntosOrdenados.map(p => p.id)
      const fallbackIndex = orderedIds.findIndex(id => id === dragState.id)

      for (let index = 0; index < orderedIds.length; index += 1) {
        const element = itemRefs.current.get(orderedIds[index])
        if (!element) continue

        const rect = element.getBoundingClientRect()
        const midpoint = rect.top + rect.height / 2

        if (clientY < midpoint) {
          return index
        }
      }

      return orderedIds.length > 0 ? orderedIds.length - 1 : fallbackIndex
    }

    const handleMove = (clientX: number, clientY: number) => {
      const deltaY = Math.abs(clientY - dragState.startY)
      const deltaX = Math.abs(clientX - dragState.startX)
      const hasMoved = deltaY > 8 || deltaX > 8
      const targetIndex = getTargetIndex(clientY)

      setDragState(prev => ({
        ...prev,
        currentY: clientY,
        currentIndex: targetIndex,
        hasMoved: prev.hasMoved || hasMoved,
      }))
    }

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault()
      handleMove(event.clientX, event.clientY)
    }

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      event.preventDefault()
      handleMove(touch.clientX, touch.clientY)
    }

    const handleEnd = () => {
      setDragState(prev => {
        if (prev.id && prev.hasMoved && prev.currentIndex >= 0) {
          moverPunto(prev.id, prev.currentIndex + 1)
          setSortKey('manual')
        }

        return {
          id: null,
          startY: 0,
          startX: 0,
          currentY: 0,
          currentIndex: -1,
          isDragging: false,
          hasMoved: false,
        }
      })

      setSwipeState({
        id: null,
        startX: 0,
        currentX: 0,
        isSwiping: false,
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleEnd)
    window.addEventListener('touchcancel', handleEnd)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleEnd)
      window.removeEventListener('touchcancel', handleEnd)
    }
  }, [dragState.id, dragState.isDragging, dragState.startX, dragState.startY, moverPunto, puntosOrdenados])

  const handleEditarPunto = (punto: typeof state.puntos[0]) => {
    if (punto.bloqueado) {
      setDialogoBloquear(punto.id)
      return
    }
    setPuntoActivo(punto)
    abrirEdicionModal(punto)
  }

  const getSwipeOffset = (puntoId: string) => {
    if (swipeState.id !== puntoId || !swipeState.isSwiping) return 0
    const diff = swipeState.startX - swipeState.currentX
    return Math.max(-diff, 0)
  }

  const formatFecha = (iso?: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })
  }

  const shouldIgnoreDragStart = (target: EventTarget | null) => {
    return target instanceof HTMLElement && Boolean(target.closest('button, input, textarea, [role="checkbox"]'))
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

            {/* Formulario de punto */}
            {mostrarFormulario && (
              <ScrollArea className="max-h-[300px] overflow-y-auto">
                <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                  {routingActual && (
                    <div className="space-y-1.5 mb-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Archivos detectados:</p>
                      <div className="flex items-center gap-2 text-sm">
                        {routingActual.kmz ? (
                          <><CheckCircle2 className="w-4 h-4 text-green-600" /><span className="text-green-700">KMZ/KML</span></>
                        ) : (
                          <><AlertCircle className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Sin KMZ</span></>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {routingActual.txt ? (
                          <><CheckCircle2 className="w-4 h-4 text-green-600" /><span className="text-green-700">Documento TXT</span></>
                        ) : (
                          <><AlertCircle className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Sin TXT</span></>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {routingActual.excel ? (
                          <><CheckCircle2 className="w-4 h-4 text-green-600" /><span className="text-green-700">Excel de sincronización</span></>
                        ) : (
                          <><AlertCircle className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Sin Excel</span></>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {routingActual.fotos > 0 ? (
                          <><CheckCircle2 className="w-4 h-4 text-green-600" /><span className="text-green-700">{routingActual.fotos} fotos</span></>
                        ) : (
                          <><AlertCircle className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Sin fotos</span></>
                        )}
                      </div>
                    </div>
                  )}

                  {datosCarpetaPreview && (
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FolderOpen className="w-4 h-4" />
                        <span>Datos detectados en carpeta:</span>
                      </div>

                      {datosCarpetaPreview.coordenadas && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPinned className="w-4 h-4 text-green-600" />
                          <span>
                            Coordenadas: {datosCarpetaPreview.coordenadas.x.toFixed(6)},
                            {datosCarpetaPreview.coordenadas.y.toFixed(6)}
                          </span>
                        </div>
                      )}

                      {datosCarpetaPreview.textoDocumento && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="w-4 h-4 text-blue-600" />
                          <span>Documento: {datosCarpetaPreview.textoDocumento.substring(0, 50)}...</span>
                        </div>
                      )}

                      {datosCarpetaPreview.excel && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileSpreadsheet className="w-4 h-4 text-green-600" />
                          <span>Excel: {datosCarpetaPreview.excel.name}</span>
                        </div>
                      )}

                      {datosCarpetaPreview.fotos.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Camera className="w-4 h-4 text-purple-600" />
                            <span>{datosCarpetaPreview.fotos.length} fotos encontradas:</span>
                          </div>
                          <div className="pl-6 space-y-1">
                            {(() => {
                              const grupos = new Map<string, typeof datosCarpetaPreview.fotos>()
                              for (const foto of datosCarpetaPreview.fotos) {
                                const key = foto.subcarpeta === 'raiz' ? 'Fotos principales' : foto.subcarpeta
                                if (!grupos.has(key)) grupos.set(key, [])
                                grupos.get(key)!.push(foto)
                              }

                              return Array.from(grupos).map(([subcarpeta, fotos]) => (
                                <div key={subcarpeta}>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                                    <Folder className="w-3 h-3" />
                                    <span>{subcarpeta}</span>
                                  </div>
                                  <div className="space-y-0.5">
                                    {fotos.map((foto) => (
                                      <div key={foto.id} className="flex items-center gap-2 text-xs">
                                        <Image className="w-3 h-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">{formatearNombreFoto(foto.nombre, foto.index)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <Select
                    value={nuevaPosicion}
                    onValueChange={setNuevaPosicion}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Posición" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: state.puntos.length + 1 }, (_, i) => (
                        <SelectItem key={i} value={String(i + 1)}>
                          {i === 0 ? 'Al inicio' : i === state.puntos.length ? 'Al final' : `Después del ${i}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Nombre del punto"
                    value={nombrePunto}
                    onChange={(e) => setNombrePunto(e.target.value)}
                    className="h-8"
                  />

                  <Textarea
                    placeholder="Descripción (opcional)"
                    value={descripcionPunto}
                    onChange={(e) => setDescripcionPunto(e.target.value)}
                    rows={2}
                    className="min-h-[60px]"
                  />

                  <Input
                    placeholder="Ruta de carpeta"
                    value={carpetaPath}
                    onChange={(e) => setCarpetaPath(e.target.value)}
                    className="h-8"
                  />

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMostrarFormulario(false)
                        setDatosCarpetaPreview(null)
                        setRoutingActual(null)
                      }}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAgregarPunto}
                      disabled={!nombrePunto.trim()}
                      className="flex-1"
                    >
                      Agregar en pos. {nuevaPosicion}
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            )}

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
                      onClick={() => setPuntosSeleccionados(new Set())}
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
            <DialogTitle>Archivos Asignados</DialogTitle>
            <DialogDescription>
              Estado de los archivos asignados al punto {state.puntoActivo?.nombre}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
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
