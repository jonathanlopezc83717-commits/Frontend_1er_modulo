import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type TouchEvent, type MouseEvent } from 'react'
import type { PuntoFerroviario } from '@/types'
import type { SortKey } from '@/components/gestor-puntos-logica'
import { procesarCarpetaPunto, buscarExcelEnRaiz, formatearNombreFoto, extraerCoordenadasKMZ, leerArchivoTXT, type DatosPuntoCarpeta } from '@/lib/folder-parser'
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

interface ResumenCarpeta extends FileRouting {
  nombre: string
}

function filtrarPorCarpetaRaiz(files: FileList, raiz: string): FileList {
  const dt = new DataTransfer()
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    if ((f.webkitRelativePath || f.name).split('/')[0] === raiz) {
      dt.items.add(f)
    }
  }
  return dt.files
}

export function usePuntoCarpeta({
  puntoActivo,
  nomenclaturasGlobales,
  puntosLength,
  agregarPunto,
  actualizarPunto,
  setNomenclaturasGlobales,
  setEditarPuntoCreado,
}: {
  puntoActivo: PuntoFerroviario | null
  nomenclaturasGlobales: NomenclaturaEntry[]
  puntosLength: number
  agregarPunto: (posicion: number, punto: Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'>) => void
  actualizarPunto: (id: string, data: Partial<PuntoFerroviario>) => void
  setNomenclaturasGlobales: (nomenclaturas: NomenclaturaEntry[]) => void
  setEditarPuntoCreado: (valor: boolean) => void
}) {
  const [procesandoCarpeta, setProcesandoCarpeta] = useState(false)
  const [datosCarpetaPreview, setDatosCarpetaPreview] = useState<DatosPuntoCarpeta | null>(null)
  const [mostrarRouting, setMostrarRouting] = useState(false)
  const [routingActual, setRoutingActual] = useState<FileRouting | null>(null)
  const [resumenMultiple, setResumenMultiple] = useState<ResumenCarpeta[] | null>(null)

  const handleSeleccionarCarpeta = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setProcesandoCarpeta(true)
    setResumenMultiple(null)
    e.target.value = ''

    const grupos = new Map<string, File[]>()
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const raiz = (f.webkitRelativePath || f.name).split('/')[0]
      if (!grupos.has(raiz)) grupos.set(raiz, [])
      grupos.get(raiz)!.push(f)
    }

    try {
      if (grupos.size <= 1) {
        const datos = await procesarCarpetaPunto(files)
        const excelEnRaiz = buscarExcelEnRaiz(files)
        if (excelEnRaiz) datos.excel = excelEnRaiz

        setDatosCarpetaPreview(datos)
        setRoutingActual({
          kmz: !!datos.coordenadas,
          txt: !!datos.textoDocumento,
          excel: !!datos.excel,
          fotos: datos.fotos.length,
        })

        await agregarDesdeDatos(datos)
        setMostrarRouting(true)
      } else {
        const resumen: ResumenCarpeta[] = []
        let i = 0
        for (const [nombreRaiz] of grupos) {
          const fileListFiltrada = filtrarPorCarpetaRaiz(files, nombreRaiz)
          const datos = await procesarCarpetaPunto(fileListFiltrada)
          const excelEnRaiz = buscarExcelEnRaiz(fileListFiltrada)
          if (excelEnRaiz) datos.excel = excelEnRaiz
          await agregarDesdeDatos(datos, puntosLength + 1 + i)
          resumen.push({
            nombre: datos.nombreCarpeta,
            kmz: !!datos.coordenadas,
            txt: !!datos.textoDocumento,
            excel: !!datos.excel,
            fotos: datos.fotos.length,
          })
          i++
        }
        setRoutingActual(null)
        setResumenMultiple(resumen)
        setMostrarRouting(true)
      }
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

  const agregarDesdeDatos = async (datos: DatosPuntoCarpeta, posicion: number = 1) => {
    const moduloData: Record<string, unknown> = {}

    if (datos.coordenadas) {
      moduloData.georeferencia = {
        coordenadas: datos.coordenadas,
        notas: `Coordenadas extraídas de archivo KMZ/KML`,
        updatedAt: new Date().toISOString(),
      }
    }

    if (datos.textoDocumento) {
      const nomenclaturasActuales = consolidarNomenclaturas([nomenclaturasGlobales])
      const detectadas = parsearNomenclaturasDesdeTexto(datos.textoDocumento)
      const nomenclaturasActualizadas = fusionarNomenclaturas(nomenclaturasActuales, detectadas)
      setNomenclaturasGlobales(nomenclaturasActualizadas)
      moduloData.documentacion = {
        notas: datos.textoDocumento,
        nombreArchivo: datos.nombreCarpeta + '.txt',
        nomenclaturas: nomenclaturasActualizadas,
        updatedAt: new Date().toISOString(),
      }
    }

    if (datos.fotos.length > 0) {
      moduloData.analisis = {
        fotosIndexadas: datos.fotos.map((f) => ({
          id: f.id,
          index: f.index,
          nombre: f.nombre,
          nombreFormateado: formatearNombreFoto(f.nombre, f.index),
          subcarpeta: f.subcarpeta,
          preview: f.preview,
        })),
        fotosCount: datos.fotos.length,
        subcarpetas: datos.subcarpetas,
        updatedAt: new Date().toISOString(),
      }
    }

    if (datos.excel) {
      const archivoId = generarUUID()
      await guardarArchivoSincronizacion(archivoId, datos.excel)
      moduloData.sincronizacion = {
        archivoNombre: datos.excel.name,
        archivoId,
        ruta: datos.excel.webkitRelativePath || datos.excel.name,
        cargadoEn: new Date().toISOString(),
      }
    }

    agregarPunto(posicion, {
      nombre: datos.nombreCarpeta,
      descripcion: undefined,
      carpetaPath: datos.nombreCarpeta,
      coordenadas: datos.coordenadas ? {
        lat: datos.coordenadas.y,
        lng: datos.coordenadas.x,
      } : undefined,
      moduloData,
    })

    setDatosCarpetaPreview(null)
    setEditarPuntoCreado(true)
  }

  const cargarArchivoIndividual = async (tipo: 'kmz' | 'txt' | 'excel', file: File) => {
    if (!puntoActivo) return
    const now = new Date().toISOString()
    const moduloDataActual = puntoActivo.moduloData || {}

    if (tipo === 'kmz') {
      const coords = await extraerCoordenadasKMZ(file)
      if (!coords) return
      actualizarPunto(puntoActivo.id, {
        coordenadas: { lat: coords.y, lng: coords.x },
        moduloData: {
          ...moduloDataActual,
          georeferencia: {
            coordenadas: coords,
            notas: `Coordenadas cargadas desde ${file.name}`,
            updatedAt: now,
          },
        },
      })
      setRoutingActual((prev) => (prev ? { ...prev, kmz: true } : prev))
    } else if (tipo === 'txt') {
      const texto = await leerArchivoTXT(file)
      const detectadas = parsearNomenclaturasDesdeTexto(texto)
      const documentacionActual = (moduloDataActual.documentacion as { nomenclaturas?: NomenclaturaEntry[] } | undefined) || {}
      const nomenclaturasActualizadas = fusionarNomenclaturas(
        consolidarNomenclaturas([nomenclaturasGlobales, documentacionActual.nomenclaturas || []]),
        detectadas
      )
      setNomenclaturasGlobales(nomenclaturasActualizadas)
      actualizarPunto(puntoActivo.id, {
        moduloData: {
          ...moduloDataActual,
          documentacion: {
            ...documentacionActual,
            notas: texto,
            nombreArchivo: file.name,
            nomenclaturas: nomenclaturasActualizadas,
            updatedAt: now,
          },
        },
      })
      setRoutingActual((prev) => (prev ? { ...prev, txt: true } : prev))
    } else if (tipo === 'excel') {
      const archivoId = (moduloDataActual.sincronizacion as { archivoId?: string } | undefined)?.archivoId || generarUUID()
      await guardarArchivoSincronizacion(archivoId, file)
      actualizarPunto(puntoActivo.id, {
        moduloData: {
          ...moduloDataActual,
          sincronizacion: {
            ...(moduloDataActual.sincronizacion as Record<string, unknown> || {}),
            archivoNombre: file.name,
            archivoId,
            ruta: file.name,
            cargadoEn: now,
          },
        },
      })
      setRoutingActual((prev) => (prev ? { ...prev, excel: true } : prev))
    }
  }

  const cargarFotos = async (files: File[]) => {
    if (!puntoActivo || files.length === 0) return
    const now = new Date().toISOString()
    const moduloDataActual = puntoActivo.moduloData || {}
    const analisisActual = (moduloDataActual.analisis as { fotosIndexadas?: Array<{ id: string; index: number; nombre: string; nombreFormateado: string; subcarpeta: string; preview: string }>; subcarpetas?: string[] } | undefined) || {}
    const fotosExistentes = analisisActual.fotosIndexadas || []
    const nuevas = await Promise.all(files.map(async (file, i) => {
      const preview = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.readAsDataURL(file)
      })
      const index = fotosExistentes.length + i + 1
      return {
        id: generarUUID(),
        index,
        nombre: file.name,
        nombreFormateado: formatearNombreFoto(file.name, index),
        subcarpeta: 'raiz',
        preview,
      }
    }))
    const todas = [...fotosExistentes, ...nuevas]
    actualizarPunto(puntoActivo.id, {
      moduloData: {
        ...moduloDataActual,
        analisis: {
          ...(moduloDataActual.analisis as Record<string, unknown> || {}),
          fotosIndexadas: todas,
          fotosCount: todas.length,
          subcarpetas: analisisActual.subcarpetas || [],
          updatedAt: now,
        },
      },
    })
    setRoutingActual((prev) => (prev ? { ...prev, fotos: todas.length } : prev))
  }

  return {
    procesandoCarpeta,
    datosCarpetaPreview,
    setDatosCarpetaPreview,
    mostrarRouting,
    setMostrarRouting,
    routingActual,
    setRoutingActual,
    resumenMultiple,
    setResumenMultiple,
    handleSeleccionarCarpeta,
    handleRoutingManual,
    cargarArchivoIndividual,
    cargarFotos,
  }
}
