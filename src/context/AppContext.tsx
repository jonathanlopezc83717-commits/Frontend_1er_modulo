import { createContext, useContext, useSyncExternalStore, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { MODULOS } from '@/types'
import type { PuntoFerroviario, AppState, AppAction, EstadoGuardado, ImageAnalysisResult, PlantillaFormato, PlantillaPdfFormato } from '@/types'
import { guardarEstado, cargarEstado, cargarEstadoCompleto } from '@/lib/storage'
import { cargarArchivosPlantilla } from '@/lib/template-file-store'
import { generarUUID } from '@/lib/utils'
import { consolidarNomenclaturas, type NomenclaturaEntry } from '@/lib/nomenclaturas'
import {
  cargarPuntosDesdeDB,
  sincronizarPuntos,
  guardarCoordenadas,
  guardarDocumentacion,
  guardarAnalisis,
} from '@/lib/supabase-service'
import { guardarSnapshotNAS, listarSnapshotsNAS, leerSnapshotNAS } from '@/lib/snapshot-store'
import { appReducer, MAX_ESTADOS_GUARDADOS, reenumerarPuntos } from './app-reducer'
import { createStore, AppStoreContext, useAppSelector, useAppStore, shallow } from './app-store'
import { useAuth } from './AuthContext'

export { useAppSelector, useAppStore, shallow }

const initialState: AppState = {
  puntos: [],
  puntoActivo: null,
  moduloActivo: 'analisis',
  modulosOrden: null,
  nomenclaturasGlobales: [],
  plantillasFormato: [],
  plantillasPdfFormato: [],
  estadosGuardados: [],
  haExportadoPlantilla: false,
}

const BACKUP_INTERVAL_MS = 2 * 60 * 60 * 1000

interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  agregarPunto: (posicion: number, punto: Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'>, id?: string) => void
  eliminarPunto: (id: string) => Promise<void>
  setPuntoActivo: (punto: PuntoFerroviario | null) => void
  setModuloActivo: (modulo: string) => void
  reordenarModulos: (idsOrdenados: string[]) => void
  actualizarPunto: (id: string, data: Partial<PuntoFerroviario>) => void
  setNomenclaturasGlobales: (nomenclaturas: NomenclaturaEntry[]) => void
  setPlantillasFormato: (plantillas: PlantillaFormato[]) => void
  setPlantillasPdfFormato: (plantillas: PlantillaPdfFormato[]) => void
  crearCopiaSeguridad: (tipo: EstadoGuardado['tipo'], descripcion?: string) => EstadoGuardado
  restaurarEstadoGuardado: (id: string) => Promise<boolean>
  moverPunto: (id: string, nuevaPosicion: number) => void
  renumerarPuntos: (idsOrdenados: string[]) => void
  sincronizarConSupabase: (descripcion?: string) => Promise<{ success: boolean; message: string }>
  cargarDesdeSupabase: () => Promise<void>
  cargarEstadoPorIdDesdeSupabase: (id: string) => Promise<boolean>
  guardarCoordenadasDB: (id: string, x: number, y: number, z: number, notas?: string) => Promise<void>
  guardarDocumentacionDB: (id: string, contenido: string, nombreArchivo?: string) => Promise<void>
  guardarAnalisisDB: (id: string, result: unknown, imageUrls: string[]) => Promise<void>
  toggleBloquearPunto: (id: string) => void
}

const AppContext = createContext<AppContextType | null>(null)
const ActionsContext = createContext<Omit<AppContextType, 'state'> | null>(null)

// Cargar estado inicial desde localStorage
function getInitialState(): AppState {
  const stored = cargarEstado()
  if (stored) {
    const puntos = stored.puntos as PuntoFerroviario[]
    const tieneTablaGlobalGuardada = Array.isArray(stored.nomenclaturasGlobales)
    const nomenclaturasGuardadas = (stored.nomenclaturasGlobales || []) as NomenclaturaEntry[]
    const plantillasFormato = (stored.plantillasFormato || []) as PlantillaFormato[]
    const plantillasPdfFormato = (stored.plantillasPdfFormato || []) as PlantillaPdfFormato[]
    const estadosGuardados = (stored.estadosGuardados || []) as EstadoGuardado[]
    const nomenclaturasMigradas = puntos.map(p => p.moduloData?.documentacion?.nomenclaturas || [])
    return {
      puntos,
      puntoActivo: stored.puntoActivoId 
        ? puntos.find(p => p.id === stored.puntoActivoId) || null
        : null,
      moduloActivo: stored.moduloActivo,
      modulosOrden: stored.modulosOrden || null,
      nomenclaturasGlobales: tieneTablaGlobalGuardada
        ? consolidarNomenclaturas([nomenclaturasGuardadas])
        : consolidarNomenclaturas([nomenclaturasGuardadas, ...nomenclaturasMigradas]),
      plantillasFormato,
      plantillasPdfFormato,
      estadosGuardados: estadosGuardados.slice(0, MAX_ESTADOS_GUARDADOS),
      haExportadoPlantilla: stored.haExportadoPlantilla ?? false,
    }
  }
  return initialState
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { proyectoActivoId, perfil } = useAuth()
  const proyectoId = proyectoActivoId ?? ''
  const guardadoPor = perfil?.email || ''
  const [appStore] = useState(() => createStore(appReducer, getInitialState()))
  const state = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot)
  const dispatch = appStore.dispatch
  const [cargadoDesdeDB, setCargadoDesdeDB] = useState(false)
  const [estadoRestaurado, setEstadoRestaurado] = useState(false)

  useEffect(() => {
    let cancelado = false

    cargarEstadoCompleto()
      .then((stored) => {
        if (!stored || cancelado) return

        dispatch({
          type: 'RESTAURAR_ESTADO_GUARDADO',
          payload: {
            puntos: stored.puntos as PuntoFerroviario[],
            puntoActivoId: stored.puntoActivoId,
      moduloActivo: MODULOS.some(m => m.id === stored.moduloActivo) ? stored.moduloActivo : 'analisis',
            modulosOrden: stored.modulosOrden || null,
            nomenclaturasGlobales: (stored.nomenclaturasGlobales || []) as AppState['nomenclaturasGlobales'],
            plantillasFormato: (stored.plantillasFormato || []) as PlantillaFormato[],
            plantillasPdfFormato: (stored.plantillasPdfFormato || []) as PlantillaPdfFormato[],
          },
        })
        dispatch({ type: 'SET_ESTADOS_GUARDADOS', payload: (stored.estadosGuardados || []) as EstadoGuardado[] })
        setEstadoRestaurado(true)
      })
      .catch(error => {
        console.error('Error restaurando estado completo local:', error)
        setEstadoRestaurado(true)
      })

    return () => {
      cancelado = true
    }
  }, [])

  // Cargar desde Supabase al iniciar (solo una vez)
  useEffect(() => {
    if (!cargadoDesdeDB) {
      cargarDesdeSupabase()
      setCargadoDesdeDB(true)
    }
  }, [cargadoDesdeDB])

  useEffect(() => {
    const tienePlantillasSinArchivo = state.plantillasFormato.some(plantilla => !plantilla.archivoBase64)
    if (!tienePlantillasSinArchivo) return

    cargarArchivosPlantilla(state.plantillasFormato)
      .then((plantillas) => {
        const cambio = plantillas.some((plantilla, index) =>
          plantilla.archivoBase64 !== state.plantillasFormato[index]?.archivoBase64
        )
        if (cambio) {
          dispatch({ type: 'SET_PLANTILLAS_FORMATO', payload: plantillas })
        }
      })
      .catch(error => {
        console.error('Error cargando archivos de plantillas:', error)
      })
  }, [state.plantillasFormato])

  useEffect(() => {
    const tienePlantillasSinArchivo = state.plantillasPdfFormato.some(plantilla => !plantilla.archivoBase64)
    if (!tienePlantillasSinArchivo) return

    cargarArchivosPlantilla(state.plantillasPdfFormato as unknown as PlantillaFormato[])
      .then((plantillas) => {
        const plantillasPdf = plantillas as unknown as PlantillaPdfFormato[]
        const cambio = plantillasPdf.some((plantilla, index) =>
          plantilla.archivoBase64 !== state.plantillasPdfFormato[index]?.archivoBase64
        )
        if (cambio) {
          dispatch({ type: 'SET_PLANTILLAS_PDF_FORMATO', payload: plantillasPdf })
        }
      })
      .catch(error => {
        console.error('Error cargando archivos de plantillas PDF de formato:', error)
      })
  }, [state.plantillasPdfFormato])

  // Persistir estado en localStorage/IndexedDB cuando cambie.
  // IMPORTANTE: no guardar hasta que el estado completo se haya restaurado
  // desde IndexedDB, para evitar sobreescribir dataURLs con versiones vacías.
  useEffect(() => {
    if (!estadoRestaurado) return
    guardarEstado(
      state.puntos,
      state.puntoActivo?.id || null,
      state.moduloActivo,
      state.modulosOrden,
      state.nomenclaturasGlobales,
      state.plantillasFormato,
      state.plantillasPdfFormato,
      state.estadosGuardados,
      state.haExportadoPlantilla
    )
  }, [state.puntos, state.puntoActivo, state.moduloActivo, state.modulosOrden, state.nomenclaturasGlobales, state.plantillasFormato, state.plantillasPdfFormato, state.estadosGuardados, state.haExportadoPlantilla, estadoRestaurado])

  const agregarPunto = useCallback((posicion: number, punto: Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'>, id?: string) => {
    dispatch({ type: 'AGREGAR_PUNTO', payload: { posicion, punto, id } })
  }, [])

  const eliminarPunto = useCallback(async (id: string) => {
    // Eliminar solo del estado local. Supabase queda como respaldo para poder recargar.
    dispatch({ type: 'ELIMINAR_PUNTO', payload: id })
  }, [])

  const setPuntoActivo = useCallback((punto: PuntoFerroviario | null) => {
    dispatch({ type: 'SET_PUNTO_ACTIVO', payload: punto })
  }, [])

  const setModuloActivo = useCallback((modulo: string) => {
    dispatch({ type: 'SET_MODULO_ACTIVO', payload: modulo })
  }, [])

  const reordenarModulos = useCallback((idsOrdenados: string[]) => {
    dispatch({ type: 'REORDENAR_MODULOS', payload: idsOrdenados })
  }, [])

  const actualizarPunto = useCallback((id: string, data: Partial<PuntoFerroviario>) => {
    dispatch({ type: 'ACTUALIZAR_PUNTO', payload: { id, data } })
  }, [])

  const setNomenclaturasGlobales = useCallback((nomenclaturas: NomenclaturaEntry[]) => {
    dispatch({ type: 'SET_NOMENCLATURAS_GLOBALES', payload: nomenclaturas })
  }, [])

  const setPlantillasFormato = useCallback((plantillas: PlantillaFormato[]) => {
    dispatch({ type: 'SET_PLANTILLAS_FORMATO', payload: plantillas })
  }, [])

  const setPlantillasPdfFormato = useCallback((plantillas: PlantillaPdfFormato[]) => {
    dispatch({ type: 'SET_PLANTILLAS_PDF_FORMATO', payload: plantillas })
  }, [])

  const crearCopiaSeguridad = useCallback((tipo: EstadoGuardado['tipo'], descripcion?: string) => {
    const s = appStore.getState()
    const estadoGuardado: EstadoGuardado = {
      id: generarUUID(),
      tipo,
      descripcion: descripcion || (tipo === 'automatico' ? 'Copia de seguridad automatica' : 'Estado guardado manualmente'),
      createdAt: new Date().toISOString(),
      snapshotCompleto: true,
      snapshot: {
        puntos: JSON.parse(JSON.stringify(s.puntos)),
        puntoActivoId: s.puntoActivo?.id || null,
        moduloActivo: s.moduloActivo,
        nomenclaturasGlobales: JSON.parse(JSON.stringify(s.nomenclaturasGlobales)),
        plantillasFormato: JSON.parse(JSON.stringify(s.plantillasFormato)),
        plantillasPdfFormato: JSON.parse(JSON.stringify(s.plantillasPdfFormato)),
        haExportadoPlantilla: s.haExportadoPlantilla,
      },
    }

    dispatch({ type: 'AGREGAR_ESTADO_GUARDADO', payload: estadoGuardado })
    return estadoGuardado
  }, [appStore, dispatch])

  const restaurarEstadoGuardado = useCallback(async (id: string) => {
    let estadoGuardado = appStore.getState().estadosGuardados.find(estado => estado.id === id)
    if (!estadoGuardado) return false

    if (estadoGuardado.snapshotCompleto === false) {
      const estadoCompleto = await leerSnapshotNAS(proyectoId, id)
      if (!estadoCompleto) return false
      estadoGuardado = estadoCompleto
    }

    dispatch({ type: 'RESTAURAR_ESTADO_GUARDADO', payload: estadoGuardado.snapshot })
    return true
  }, [appStore, dispatch, proyectoId])

  useEffect(() => {
    const crearSiCorresponde = () => {
      if (state.puntos.length === 0) return

      const ultimoAutomatico = state.estadosGuardados.find(estado => estado.tipo === 'automatico')
      const ultimaFecha = ultimoAutomatico ? new Date(ultimoAutomatico.createdAt).getTime() : 0

      if (Date.now() - ultimaFecha >= BACKUP_INTERVAL_MS) {
        const copia = crearCopiaSeguridad('automatico', 'Copia de seguridad automatica cada 2 horas')
        guardarSnapshotNAS({
          proyectoId,
          tipo: copia.tipo,
          descripcion: copia.descripcion,
          guardadoPor,
          snapshot: copia.snapshot,
        }).catch(error => {
          console.error('Error guardando copia automatica en NAS:', error)
        })
      }
    }

    crearSiCorresponde()
    const intervalId = window.setInterval(crearSiCorresponde, 60 * 1000)
    return () => window.clearInterval(intervalId)
  }, [crearCopiaSeguridad, state.estadosGuardados, state.puntos.length, proyectoId, guardadoPor])

  const moverPunto = useCallback((id: string, nuevaPosicion: number) => {
    const puntos = appStore.getState().puntos
    const punto = puntos.find(p => p.id === id)
    if (!punto) return

    const otrosPuntos = puntos
      .filter(p => p.id !== id)
      .sort((a, b) => a.numeroSerie - b.numeroSerie)
    const posicionFinal = Math.max(1, Math.min(nuevaPosicion, puntos.length))

    const nuevosPuntos = reenumerarPuntos([
      ...otrosPuntos.slice(0, posicionFinal - 1),
      { ...punto, numeroSerie: posicionFinal },
      ...otrosPuntos.slice(posicionFinal - 1),
    ])

    dispatch({ type: 'REORDENAR_PUNTOS', payload: nuevosPuntos })
  }, [appStore, dispatch])

  // NUEVAS FUNCIONES PARA SUPABASE

  const sincronizarConSupabase = useCallback(async (descripcion?: string) => {
    const toastId = toast.loading('Sincronizando con la nube...')
    try {
      const puntos = appStore.getState().puntos
      const titulo = descripcion?.trim() || 'Estado guardado manualmente'
      const total = puntos.length

      toast.loading('Sincronizando con la nube...', {
        id: toastId,
        description: total > 0 ? `0 / ${total} puntos` : 'Guardando estado',
      })

      // 1) Puntos a Supabase. 2) Aplicar el moduloData persistido (URLs de
      // Storage + solo fotos analizadas) para aligerar el estado local.
      // 3) Recién entonces el snapshot NAS, que sale liviano.
      const result = await sincronizarPuntos(puntos, proyectoId, {
        concurrency: 5,
        onLote: (completadas, tot) => {
          toast.loading('Sincronizando con la nube...', {
            id: toastId,
            description: `${completadas} / ${tot} puntos`,
          })
        },
      })

      for (const act of result.actualizaciones ?? []) {
        actualizarPunto(act.puntoId, { moduloData: act.moduloData as PuntoFerroviario['moduloData'] })
      }

      const copiaManual = crearCopiaSeguridad('manual', titulo)
      const snapshotResult = await guardarSnapshotNAS({
        proyectoId,
        tipo: copiaManual.tipo,
        descripcion: copiaManual.descripcion,
        guardadoPor,
        snapshot: copiaManual.snapshot,
      })

      if (!snapshotResult.success) {
        toast.error('No se pudo guardar el snapshot en el servidor de archivos', {
          id: toastId,
          description: snapshotResult.error || 'error desconocido',
        })
        return {
          success: false,
          message: `Puntos sincronizados, pero el snapshot no se guardo en el servidor de archivos: ${snapshotResult.error || 'error desconocido'}`,
        }
      }

      if (result.success) {
        toast.success(`Estado “${titulo}” sincronizado`, {
          id: toastId,
          description: total > 0 ? `${result.guardados} puntos guardados` : 'Estado guardado',
        })
        return { success: true, message: `${result.guardados} puntos sincronizados correctamente` }
      } else {
        toast.warning('Sincronización con errores', {
          id: toastId,
          description: result.error || 'algunos puntos fallaron',
        })
        return { success: false, message: result.error || 'Error en sincronización' }
      }
    } catch (error) {
      toast.error('Error al sincronizar con la nube', {
        id: toastId,
        description: String(error),
      })
      return { success: false, message: String(error) }
    }
  }, [crearCopiaSeguridad, actualizarPunto, appStore, proyectoId, guardadoPor])

  const cargarDesdeSupabase = useCallback(async () => {
    try {
      const estadosNube = await listarSnapshotsNAS(proyectoId)
      const ultimoMeta = estadosNube[0] ?? null

      // La nube es FALLBACK: solo restaura puntos si NO hay estado local.
      // Al recargar, IndexedDB/localStorage ya trae el estado actual (con la
      // plantilla del Formato); pisarlo con un snapshot de nube stale (el
      // auto-backup es cada 2h) reiniciaría la plantilla y los datos.
      if (appStore.getState().puntos.length > 0) return

      if (ultimoMeta) {
        const ultimoEstado = ultimoMeta.snapshotCompleto === false
          ? await leerSnapshotNAS(proyectoId, ultimoMeta.id)
          : ultimoMeta
        if (ultimoEstado) {
          dispatch({ type: 'RESTAURAR_ESTADO_GUARDADO', payload: ultimoEstado.snapshot })
          dispatch({ type: 'SET_ESTADOS_GUARDADOS', payload: estadosNube })
          return
        }
      }

      const puntos = await cargarPuntosDesdeDB(proyectoId)
      dispatch({ type: 'SET_PUNTOS', payload: puntos })
    } catch (error) {
      console.error('Error cargando desde Supabase/NAS:', error)
      throw error
    }
  }, [proyectoId, appStore])

  const cargarEstadoPorIdDesdeSupabase = useCallback(async (id: string): Promise<boolean> => {
    try {
      const estado = await leerSnapshotNAS(proyectoId, id)
      if (!estado) return false

      const estadosNube = await listarSnapshotsNAS(proyectoId)
      dispatch({ type: 'RESTAURAR_ESTADO_GUARDADO', payload: estado.snapshot })
      dispatch({ type: 'SET_ESTADOS_GUARDADOS', payload: estadosNube })
      return true
    } catch (error) {
      console.error('Error cargando estado por id desde NAS:', error)
      return false
    }
  }, [proyectoId])

  const guardarCoordenadasDB = useCallback(async (id: string, x: number, y: number, z: number, notas?: string) => {
    await guardarCoordenadas(id, x, y, z, notas)
  }, [])

  const guardarDocumentacionDB = useCallback(async (id: string, contenido: string, nombreArchivo?: string) => {
    await guardarDocumentacion(id, contenido, nombreArchivo)
  }, [])

  const guardarAnalisisDB = useCallback(async (id: string, result: unknown, imageUrls: string[]) => {
    const analysisResult = result as ImageAnalysisResult
    await guardarAnalisis(id, analysisResult, imageUrls)
  }, [])

  const toggleBloquearPunto = useCallback((id: string) => {
    dispatch({ type: 'BLOQUEAR_PUNTO', payload: id })
  }, [])

  const renumerarPuntos = useCallback((idsOrdenados: string[]) => {
    dispatch({ type: 'RENUMERAR_PUNTOS', payload: idsOrdenados })
  }, [])

  const actions = useMemo<Omit<AppContextType, 'state'>>(() => ({
    dispatch,
    agregarPunto,
    eliminarPunto,
    setPuntoActivo,
    setModuloActivo,
    reordenarModulos,
    actualizarPunto,
    setNomenclaturasGlobales,
    setPlantillasFormato,
    setPlantillasPdfFormato,
    crearCopiaSeguridad,
    restaurarEstadoGuardado,
    moverPunto,
    renumerarPuntos,
    sincronizarConSupabase,
    cargarDesdeSupabase,
    cargarEstadoPorIdDesdeSupabase,
    guardarCoordenadasDB,
    guardarDocumentacionDB,
    guardarAnalisisDB,
    toggleBloquearPunto,
  }), [
    dispatch, agregarPunto, eliminarPunto, setPuntoActivo, setModuloActivo,
    reordenarModulos, actualizarPunto, setNomenclaturasGlobales,
    setPlantillasFormato, setPlantillasPdfFormato,
    crearCopiaSeguridad, restaurarEstadoGuardado, moverPunto, renumerarPuntos,
    sincronizarConSupabase, cargarDesdeSupabase, cargarEstadoPorIdDesdeSupabase,
    guardarCoordenadasDB, guardarDocumentacionDB, guardarAnalisisDB, toggleBloquearPunto,
  ])

  const value = useMemo<AppContextType>(() => ({ state, ...actions }), [state, actions])

  return (
    <AppStoreContext.Provider value={appStore}>
      <ActionsContext.Provider value={actions}>
        <AppContext.Provider value={value}>
          {children}
        </AppContext.Provider>
      </ActionsContext.Provider>
    </AppStoreContext.Provider>
  )
}

export function useAppActions() {
  const context = useContext(ActionsContext)
  if (!context) {
    throw new Error('useAppActions debe usarse dentro de un AppProvider')
  }
  return context
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp debe usarse dentro de un AppProvider')
  }
  return context
}
