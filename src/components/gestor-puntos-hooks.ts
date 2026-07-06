import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type TouchEvent, type MouseEvent } from 'react'
import type { PuntoFerroviario } from '@/types'
import type { SortKey } from '@/components/gestor-puntos-logica'
import { procesarCarpetaPunto, buscarExcelEnRaiz, formatearNombreFoto, type DatosPuntoCarpeta } from '@/lib/folder-parser'
import { guardarArchivoSincronizacion } from '@/lib/sync-file-store'
import { generarUUID } from '@/lib/utils'
import {
  consolidarNomenclaturas,
  fusionarNomenclaturas,
  parsearNomenclaturasDesdeTexto,
  type NomenclaturaEntry,
} from '@/lib/nomenclaturas'

export function useSeleccionPuntos(puntos: PuntoFerroviario[]) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSeleccionados((prev) => {
      const idsDisponibles = new Set(puntos.map((p) => p.id))
      const seleccionValida = Array.from(prev).filter((id) => idsDisponibles.has(id))
      if (seleccionValida.length === prev.size) return prev
      return new Set(seleccionValida)
    })
  }, [puntos])

  const togglePunto = useCallback((id: string, checked: boolean) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleTodos = useCallback((idsVisibles: string[], checked: boolean) => {
    setSeleccionados(checked ? new Set(idsVisibles) : new Set())
  }, [])

  const remove = useCallback((id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const clear = useCallback(() => setSeleccionados(new Set()), [])

  return { seleccionados, togglePunto, toggleTodos, remove, clear }
}

export function useEdicionInline(actualizarPunto: (id: string, data: Partial<PuntoFerroviario>) => void) {
  const [puntoEditando, setPuntoEditando] = useState<string | null>(null)
  const [nombreEditado, setNombreEditado] = useState('')

  const handleDobleClic = (punto: PuntoFerroviario) => {
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

  const handleKeyDownEdicion = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleGuardarEdicion(id)
    } else if (e.key === 'Escape') {
      handleCancelarEdicion()
    }
  }

  return { puntoEditando, nombreEditado, setNombreEditado, handleDobleClic, handleGuardarEdicion, handleCancelarEdicion, handleKeyDownEdicion }
}

interface EditForm {
  numeroSerie: string
  nombre: string
  descripcion: string
  carpetaPath: string
  cadenamiento: string
  coordenadas: { lat: string; lng: string }
}

export function useEdicionModal({
  puntos,
  puntoActivo,
  moverPunto,
  actualizarPunto,
  setPuntoActivo,
  setDialogoBloquear,
}: {
  puntos: PuntoFerroviario[]
  puntoActivo: PuntoFerroviario | null
  moverPunto: (id: string, posicion: number) => void
  actualizarPunto: (id: string, data: Partial<PuntoFerroviario>) => void
  setPuntoActivo: (punto: PuntoFerroviario) => void
  setDialogoBloquear: (id: string | null) => void
}) {
  const [puntoEditandoModal, setPuntoEditandoModal] = useState<string | null>(null)
  const [editarPuntoCreado, setEditarPuntoCreado] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({
    numeroSerie: '1',
    nombre: '',
    descripcion: '',
    carpetaPath: '',
    cadenamiento: '',
    coordenadas: { lat: '', lng: '' },
  })

  const abrirEdicionModal = (punto: PuntoFerroviario) => {
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
      cadenamiento: punto.cadenamiento || '',
      coordenadas: {
        lat: punto.coordenadas?.lat?.toString() || '',
        lng: punto.coordenadas?.lng?.toString() || '',
      },
    })
  }

  useEffect(() => {
    if (!editarPuntoCreado || !puntoActivo) return
    abrirEdicionModal(puntoActivo)
    setEditarPuntoCreado(false)
  }, [editarPuntoCreado, puntoActivo])

  const guardarEdicionModal = () => {
    if (!puntoEditandoModal) return
    const puntoActual = puntos.find((p) => p.id === puntoEditandoModal)
    const numeroSerieEditado = Number(editForm.numeroSerie)
    const nuevaPosicion = Number.isFinite(numeroSerieEditado)
      ? Math.max(1, Math.min(Math.trunc(numeroSerieEditado), puntos.length))
      : puntoActual?.numeroSerie

    if (puntoActual && nuevaPosicion && nuevaPosicion !== puntoActual.numeroSerie) {
      moverPunto(puntoEditandoModal, nuevaPosicion)
    }

    const updates: Partial<PuntoFerroviario> = {
      nombre: editForm.nombre.trim(),
      descripcion: editForm.descripcion.trim() || undefined,
      carpetaPath: editForm.carpetaPath.trim() || undefined,
      cadenamiento: editForm.cadenamiento.trim() || undefined,
    }
    if (editForm.coordenadas.lat && editForm.coordenadas.lng) {
      updates.coordenadas = {
        lat: parseFloat(editForm.coordenadas.lat),
        lng: parseFloat(editForm.coordenadas.lng),
      }
    }
    actualizarPunto(puntoEditandoModal, updates)
    setPuntoEditandoModal(null)
  }

  const handleEditarPunto = (punto: PuntoFerroviario) => {
    if (punto.bloqueado) {
      setDialogoBloquear(punto.id)
      return
    }
    setPuntoActivo(punto)
    abrirEdicionModal(punto)
  }

  return {
    puntoEditandoModal,
    setPuntoEditandoModal,
    editForm,
    setEditForm,
    guardarEdicionModal,
    handleEditarPunto,
    editarPuntoCreado,
    setEditarPuntoCreado,
  }
}

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

export function useReordenarPuntos({
  puntosOrdenados,
  moverPunto,
  setSortKey,
}: {
  puntosOrdenados: PuntoFerroviario[]
  moverPunto: (id: string, posicion: number) => void
  setSortKey: (key: SortKey) => void
}) {
  const clickStartTimeRef = useRef<number>(0)
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

  const handlePointerDown = useCallback((e: TouchEvent | MouseEvent, puntoId: string, index: number) => {
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
      const orderedIds = puntosOrdenados.map((p) => p.id)
      const fallbackIndex = orderedIds.findIndex((id) => id === dragState.id)

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

      setDragState((prev) => ({
        ...prev,
        currentY: clientY,
        currentIndex: targetIndex,
        hasMoved: prev.hasMoved || hasMoved,
      }))
    }

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      event.preventDefault()
      handleMove(event.clientX, event.clientY)
    }

    const handleTouchMove = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      event.preventDefault()
      handleMove(touch.clientX, touch.clientY)
    }

    const handleEnd = () => {
      setDragState((prev) => {
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

  const getSwipeOffset = (puntoId: string) => {
    if (swipeState.id !== puntoId || !swipeState.isSwiping) return 0
    const diff = swipeState.startX - swipeState.currentX
    return Math.max(-diff, 0)
  }

  const shouldIgnoreDragStart = (target: EventTarget | null) => {
    return target instanceof HTMLElement && Boolean(target.closest('button, input, textarea, [role="checkbox"]'))
  }

  return { swipeState, dragState, itemRefs, handlePointerDown, getSwipeOffset, shouldIgnoreDragStart }
}

interface FileRouting {
  kmz: boolean
  txt: boolean
  excel: boolean
  fotos: number
}

export function usePuntoCarpeta({
  puntoActivo,
  nomenclaturasGlobales,
  agregarPunto,
  actualizarPunto,
  setNomenclaturasGlobales,
  setEditarPuntoCreado,
}: {
  puntoActivo: PuntoFerroviario | null
  nomenclaturasGlobales: NomenclaturaEntry[]
  agregarPunto: (posicion: number, punto: Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'>) => void
  actualizarPunto: (id: string, data: Partial<PuntoFerroviario>) => void
  setNomenclaturasGlobales: (nomenclaturas: NomenclaturaEntry[]) => void
  setEditarPuntoCreado: (valor: boolean) => void
}) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [nuevaPosicion, setNuevaPosicion] = useState('1')
  const [nombrePunto, setNombrePunto] = useState('')
  const [descripcionPunto, setDescripcionPunto] = useState('')
  const [carpetaPath, setCarpetaPath] = useState('')
  const [procesandoCarpeta, setProcesandoCarpeta] = useState(false)
  const [datosCarpetaPreview, setDatosCarpetaPreview] = useState<DatosPuntoCarpeta | null>(null)
  const [mostrarRouting, setMostrarRouting] = useState(false)
  const [routingActual, setRoutingActual] = useState<FileRouting | null>(null)

  const handleSeleccionarCarpeta = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setProcesandoCarpeta(true)

    try {
      const datos = await procesarCarpetaPunto(files)

      const excelEnRaiz = buscarExcelEnRaiz(files)
      if (excelEnRaiz) {
        datos.excel = excelEnRaiz
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

      if (!puntoActivo) {
        alert('Selecciona un punto primero para asignarle los archivos')
        setProcesandoCarpeta(false)
        return
      }

      const moduloDataActual = puntoActivo.moduloData || {}
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
          nomenclaturasGlobales,
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
            ...datos.fotos.map((f) => ({
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

      const excelEnRaiz = buscarExcelEnRaiz(files)
      if (excelEnRaiz && puntoActivo) {
        const archivoId = (nuevoModuloData.sincronizacion as { archivoId?: string } | undefined)?.archivoId || generarUUID()
        await guardarArchivoSincronizacion(archivoId, excelEnRaiz)
        nuevoModuloData.sincronizacion = {
          ...(nuevoModuloData.sincronizacion as Record<string, unknown> || {}),
          archivoNombre: excelEnRaiz.name,
          archivoId,
          ruta: excelEnRaiz.webkitRelativePath || excelEnRaiz.name,
          cargadoEn: new Date().toISOString(),
        }
      }

      actualizarPunto(puntoActivo.id, {
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
        const nomenclaturasActuales = consolidarNomenclaturas([nomenclaturasGlobales])
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
          fotosIndexadas: datosCarpetaPreview.fotos.map((f) => ({
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

  return {
    mostrarFormulario,
    setMostrarFormulario,
    nuevaPosicion,
    setNuevaPosicion,
    nombrePunto,
    setNombrePunto,
    descripcionPunto,
    setDescripcionPunto,
    carpetaPath,
    setCarpetaPath,
    procesandoCarpeta,
    datosCarpetaPreview,
    setDatosCarpetaPreview,
    mostrarRouting,
    setMostrarRouting,
    routingActual,
    setRoutingActual,
    handleSeleccionarCarpeta,
    handleRoutingManual,
    handleAgregarPunto,
  }
}
