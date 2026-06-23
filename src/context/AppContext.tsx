import { createContext, useContext, useReducer, useCallback, useEffect, useState, type ReactNode } from 'react'
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
  guardarEstadoAppEnNube,
  obtenerEstadosAppDesdeNube,
  obtenerEstadoAppDesdeNube,
  obtenerUltimoEstadoAppDesdeNube,
} from '@/lib/supabase-service'

const initialState: AppState = {
  puntos: [],
  puntoActivo: null,
  moduloActivo: 'analisis',
  nomenclaturasGlobales: [],
  plantillasFormato: [],
  plantillasPdfFormato: [],
  plantillasFicha: [],
  estadosGuardados: [],
}

const BACKUP_INTERVAL_MS = 2 * 60 * 60 * 1000
const MAX_ESTADOS_GUARDADOS = 24

function generarId(): string {
  return generarUUID()
}

function reenumerarPuntos(puntos: PuntoFerroviario[]): PuntoFerroviario[] {
  return puntos
    .sort((a, b) => a.numeroSerie - b.numeroSerie)
    .map((punto, index) => ({
      ...punto,
      numeroSerie: index + 1,
      updatedAt: new Date().toISOString(),
    }))
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PUNTOS': {
      const puntosOrdenados = reenumerarPuntos(action.payload)
      return {
        ...state,
        puntos: puntosOrdenados,
        puntoActivo: state.puntoActivo
          ? puntosOrdenados.find(p => p.id === state.puntoActivo!.id) || puntosOrdenados[0] || null
          : puntosOrdenados[0] || null,
      }
    }

    case 'SET_NOMENCLATURAS_GLOBALES':
      return {
        ...state,
        nomenclaturasGlobales: consolidarNomenclaturas([action.payload]),
      }

    case 'SET_PLANTILLAS_FORMATO':
      return {
        ...state,
        plantillasFormato: action.payload,
      }

    case 'SET_PLANTILLAS_PDF_FORMATO':
      return {
        ...state,
        plantillasPdfFormato: action.payload,
      }

    case 'SET_PLANTILLAS_FICHA':
      return {
        ...state,
        plantillasFicha: action.payload,
      }

    case 'SET_ESTADOS_GUARDADOS':
      return {
        ...state,
        estadosGuardados: action.payload.slice(0, MAX_ESTADOS_GUARDADOS),
      }

    case 'AGREGAR_ESTADO_GUARDADO': {
      const estadosGuardados = [action.payload, ...state.estadosGuardados]
        .slice(0, MAX_ESTADOS_GUARDADOS)
      return {
        ...state,
        estadosGuardados,
      }
    }

    case 'RESTAURAR_ESTADO_GUARDADO': {
      const puntosOrdenados = reenumerarPuntos(action.payload.puntos)
      return {
        ...state,
        puntos: puntosOrdenados,
        puntoActivo: action.payload.puntoActivoId
          ? puntosOrdenados.find(p => p.id === action.payload.puntoActivoId) || puntosOrdenados[0] || null
          : puntosOrdenados[0] || null,
        moduloActivo: action.payload.moduloActivo,
        nomenclaturasGlobales: consolidarNomenclaturas([action.payload.nomenclaturasGlobales]),
        plantillasFormato: action.payload.plantillasFormato || state.plantillasFormato,
        plantillasPdfFormato: action.payload.plantillasPdfFormato || state.plantillasPdfFormato,
        plantillasFicha: action.payload.plantillasFicha || state.plantillasFicha,
      }
    }

    case 'AGREGAR_PUNTO': {
      const { posicion, punto } = action.payload
      const nuevoPunto: PuntoFerroviario = {
        ...punto,
      id: generarId(),
      numeroSerie: posicion,
      moduloData: punto.moduloData || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      }

      const puntosAntes = state.puntos.filter(p => p.numeroSerie < posicion)
      const puntosDespues = state.puntos.filter(p => p.numeroSerie >= posicion)

      const nuevosPuntos = reenumerarPuntos([
        ...puntosAntes,
        nuevoPunto,
        ...puntosDespues,
      ])

      return {
        ...state,
        puntos: nuevosPuntos,
        puntoActivo: nuevoPunto,
      }
    }

    case 'ELIMINAR_PUNTO': {
      const puntosFiltrados = state.puntos.filter(p => p.id !== action.payload)
      const puntosReenumerados = reenumerarPuntos(puntosFiltrados)
      
      return {
        ...state,
        puntos: puntosReenumerados,
        puntoActivo: state.puntoActivo?.id === action.payload
          ? puntosReenumerados[0] || null
          : state.puntoActivo,
      }
    }

    case 'SET_PUNTO_ACTIVO':
      return {
        ...state,
        puntoActivo: action.payload,
      }

    case 'SET_MODULO_ACTIVO':
      return {
        ...state,
        moduloActivo: action.payload,
      }

    case 'ACTUALIZAR_PUNTO': {
      const { id, data } = action.payload
      const puntosActualizados = state.puntos.map(p =>
        p.id === id
          ? { ...p, ...data, updatedAt: new Date().toISOString() }
          : p
      )
      
      return {
        ...state,
        puntos: puntosActualizados,
        puntoActivo: state.puntoActivo?.id === id
          ? { ...state.puntoActivo, ...data, updatedAt: new Date().toISOString() }
          : state.puntoActivo,
      }
    }

    case 'REORDENAR_PUNTOS': {
      const puntosReenumerados = reenumerarPuntos(action.payload)
      return {
        ...state,
        puntos: puntosReenumerados,
        puntoActivo: state.puntoActivo
          ? puntosReenumerados.find(p => p.id === state.puntoActivo!.id) || puntosReenumerados[0] || null
          : puntosReenumerados[0] || null,
      }
    }

    case 'BLOQUEAR_PUNTO': {
      const puntosActualizados = state.puntos.map(p =>
        p.id === action.payload
          ? { ...p, bloqueado: !p.bloqueado, updatedAt: new Date().toISOString() }
          : p
      )
      return {
        ...state,
        puntos: puntosActualizados,
        puntoActivo: state.puntoActivo?.id === action.payload
          ? { ...state.puntoActivo, bloqueado: !state.puntoActivo.bloqueado }
          : state.puntoActivo,
      }
    }

    case 'RENUMERAR_PUNTOS': {
      // Recibe el array de IDs en el orden visual deseado
      const idsOrdenados = action.payload
      const puntosRenumerados = idsOrdenados.map((id, index) => {
        const punto = state.puntos.find(p => p.id === id)
        if (!punto) return null
        return {
          ...punto,
          numeroSerie: index + 1,
          updatedAt: new Date().toISOString(),
        }
      }).filter((p): p is PuntoFerroviario => p !== null)
      return {
        ...state,
        puntos: puntosRenumerados,
        puntoActivo: state.puntoActivo
          ? puntosRenumerados.find(p => p.id === state.puntoActivo!.id) || puntosRenumerados[0] || null
          : puntosRenumerados[0] || null,
      }
    }

    default:
      return state
  }
}

interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  agregarPunto: (posicion: number, punto: Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'>) => void
  eliminarPunto: (id: string) => Promise<void>
  setPuntoActivo: (punto: PuntoFerroviario | null) => void
  setModuloActivo: (modulo: string) => void
  actualizarPunto: (id: string, data: Partial<PuntoFerroviario>) => void
  setNomenclaturasGlobales: (nomenclaturas: NomenclaturaEntry[]) => void
  setPlantillasFormato: (plantillas: PlantillaFormato[]) => void
  setPlantillasPdfFormato: (plantillas: PlantillaPdfFormato[]) => void
  setPlantillasFicha: (plantillas: PlantillaFormato[]) => void
  crearCopiaSeguridad: (tipo: EstadoGuardado['tipo'], descripcion?: string) => EstadoGuardado
  restaurarEstadoGuardado: (id: string) => Promise<boolean>
  moverPunto: (id: string, nuevaPosicion: number) => void
  renumerarPuntos: (idsOrdenados: string[]) => void
  sincronizarConSupabase: (descripcion?: string) => Promise<{ success: boolean; message: string }>
  cargarDesdeSupabase: () => Promise<void>
  guardarCoordenadasDB: (id: string, x: number, y: number, z: number, notas?: string) => Promise<void>
  guardarDocumentacionDB: (id: string, contenido: string, nombreArchivo?: string) => Promise<void>
  guardarAnalisisDB: (id: string, result: unknown, imageUrls: string[]) => Promise<void>
  toggleBloquearPunto: (id: string) => void
}

const AppContext = createContext<AppContextType | null>(null)

// Cargar estado inicial desde localStorage
function getInitialState(): AppState {
  const stored = cargarEstado()
  if (stored) {
    const puntos = stored.puntos as PuntoFerroviario[]
    const tieneTablaGlobalGuardada = Array.isArray(stored.nomenclaturasGlobales)
    const nomenclaturasGuardadas = (stored.nomenclaturasGlobales || []) as NomenclaturaEntry[]
    const plantillasFormato = (stored.plantillasFormato || []) as PlantillaFormato[]
    const plantillasPdfFormato = (stored.plantillasPdfFormato || []) as PlantillaPdfFormato[]
    const plantillasFicha = (stored.plantillasFicha || []) as PlantillaFormato[]
    const estadosGuardados = (stored.estadosGuardados || []) as EstadoGuardado[]
    const nomenclaturasMigradas = puntos.map(p => p.moduloData?.documentacion?.nomenclaturas || [])
    return {
      puntos,
      puntoActivo: stored.puntoActivoId 
        ? puntos.find(p => p.id === stored.puntoActivoId) || null
        : null,
      moduloActivo: stored.moduloActivo,
      nomenclaturasGlobales: tieneTablaGlobalGuardada
        ? consolidarNomenclaturas([nomenclaturasGuardadas])
        : consolidarNomenclaturas([nomenclaturasGuardadas, ...nomenclaturasMigradas]),
      plantillasFormato,
      plantillasPdfFormato,
      plantillasFicha,
      estadosGuardados: estadosGuardados.slice(0, MAX_ESTADOS_GUARDADOS),
    }
  }
  return initialState
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, getInitialState())
  const [cargadoDesdeDB, setCargadoDesdeDB] = useState(false)

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
            moduloActivo: stored.moduloActivo,
            nomenclaturasGlobales: (stored.nomenclaturasGlobales || []) as AppState['nomenclaturasGlobales'],
            plantillasFormato: (stored.plantillasFormato || []) as PlantillaFormato[],
            plantillasPdfFormato: (stored.plantillasPdfFormato || []) as PlantillaPdfFormato[],
            plantillasFicha: (stored.plantillasFicha || []) as PlantillaFormato[],
          },
        })
        dispatch({ type: 'SET_ESTADOS_GUARDADOS', payload: (stored.estadosGuardados || []) as EstadoGuardado[] })
      })
      .catch(error => {
        console.error('Error restaurando estado completo local:', error)
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

  useEffect(() => {
    const tienePlantillasSinArchivo = state.plantillasFicha.some(plantilla => !plantilla.archivoBase64)
    if (!tienePlantillasSinArchivo) return

    cargarArchivosPlantilla(state.plantillasFicha)
      .then((plantillas) => {
        const cambio = plantillas.some((plantilla, index) =>
          plantilla.archivoBase64 !== state.plantillasFicha[index]?.archivoBase64
        )
        if (cambio) {
          dispatch({ type: 'SET_PLANTILLAS_FICHA', payload: plantillas })
        }
      })
      .catch(error => {
        console.error('Error cargando archivos de plantillas de ficha:', error)
      })
  }, [state.plantillasFicha])

  // Persistir estado en localStorage cuando cambie
  useEffect(() => {
    guardarEstado(
      state.puntos,
      state.puntoActivo?.id || null,
      state.moduloActivo,
      state.nomenclaturasGlobales,
      state.plantillasFormato,
      state.plantillasPdfFormato,
      state.plantillasFicha,
      state.estadosGuardados
    )
  }, [state.puntos, state.puntoActivo, state.moduloActivo, state.nomenclaturasGlobales, state.plantillasFormato, state.plantillasPdfFormato, state.plantillasFicha, state.estadosGuardados])

  const agregarPunto = useCallback((posicion: number, punto: Omit<PuntoFerroviario, 'id' | 'numeroSerie' | 'createdAt' | 'updatedAt'>) => {
    dispatch({ type: 'AGREGAR_PUNTO', payload: { posicion, punto } })
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

  const setPlantillasFicha = useCallback((plantillas: PlantillaFormato[]) => {
    dispatch({ type: 'SET_PLANTILLAS_FICHA', payload: plantillas })
  }, [])

  const crearCopiaSeguridad = useCallback((tipo: EstadoGuardado['tipo'], descripcion?: string) => {
    const estadoGuardado: EstadoGuardado = {
      id: generarUUID(),
      tipo,
      descripcion: descripcion || (tipo === 'automatico' ? 'Copia de seguridad automatica' : 'Estado guardado manualmente'),
      createdAt: new Date().toISOString(),
      snapshotCompleto: true,
      snapshot: {
        puntos: JSON.parse(JSON.stringify(state.puntos)),
        puntoActivoId: state.puntoActivo?.id || null,
        moduloActivo: state.moduloActivo,
        nomenclaturasGlobales: JSON.parse(JSON.stringify(state.nomenclaturasGlobales)),
        plantillasFormato: JSON.parse(JSON.stringify(state.plantillasFormato)),
        plantillasPdfFormato: JSON.parse(JSON.stringify(state.plantillasPdfFormato)),
        plantillasFicha: JSON.parse(JSON.stringify(state.plantillasFicha)),
      },
    }

    dispatch({ type: 'AGREGAR_ESTADO_GUARDADO', payload: estadoGuardado })
    return estadoGuardado
  }, [state.puntos, state.puntoActivo, state.moduloActivo, state.nomenclaturasGlobales, state.plantillasFormato, state.plantillasPdfFormato, state.plantillasFicha])

  const restaurarEstadoGuardado = useCallback(async (id: string) => {
    let estadoGuardado = state.estadosGuardados.find(estado => estado.id === id)
    if (!estadoGuardado) return false

    if (estadoGuardado.snapshotCompleto === false) {
      const estadoCompleto = await obtenerEstadoAppDesdeNube(id)
      if (!estadoCompleto) return false
      estadoGuardado = estadoCompleto
    }

    dispatch({ type: 'RESTAURAR_ESTADO_GUARDADO', payload: estadoGuardado.snapshot })
    return true
  }, [state.estadosGuardados])

  useEffect(() => {
    const crearSiCorresponde = () => {
      if (state.puntos.length === 0) return

      const ultimoAutomatico = state.estadosGuardados.find(estado => estado.tipo === 'automatico')
      const ultimaFecha = ultimoAutomatico ? new Date(ultimoAutomatico.createdAt).getTime() : 0

      if (Date.now() - ultimaFecha >= BACKUP_INTERVAL_MS) {
        const copia = crearCopiaSeguridad('automatico', 'Copia de seguridad automatica cada 2 horas')
        guardarEstadoAppEnNube(copia).catch(error => {
          console.error('Error guardando copia automatica en nube:', error)
        })
      }
    }

    crearSiCorresponde()
    const intervalId = window.setInterval(crearSiCorresponde, 60 * 1000)
    return () => window.clearInterval(intervalId)
  }, [crearCopiaSeguridad, state.estadosGuardados, state.puntos.length])

  const moverPunto = useCallback((id: string, nuevaPosicion: number) => {
    const punto = state.puntos.find(p => p.id === id)
    if (!punto) return

    const otrosPuntos = state.puntos
      .filter(p => p.id !== id)
      .sort((a, b) => a.numeroSerie - b.numeroSerie)
    const posicionFinal = Math.max(1, Math.min(nuevaPosicion, state.puntos.length))

    const nuevosPuntos = reenumerarPuntos([
      ...otrosPuntos.slice(0, posicionFinal - 1),
      { ...punto, numeroSerie: posicionFinal },
      ...otrosPuntos.slice(posicionFinal - 1),
    ])

    dispatch({ type: 'REORDENAR_PUNTOS', payload: nuevosPuntos })
  }, [state.puntos])

  // NUEVAS FUNCIONES PARA SUPABASE

  const sincronizarConSupabase = useCallback(async () => {
    try {
      const copiaManual = crearCopiaSeguridad('manual', 'Estado guardado manualmente')
      const result = await sincronizarPuntos(state.puntos)
      const snapshotResult = await guardarEstadoAppEnNube(copiaManual)

      if (!snapshotResult.success) {
        return {
          success: false,
          message: `Puntos sincronizados, pero el estado completo no se guardo en nube: ${snapshotResult.error || 'error desconocido'}`,
        }
      }

      if (result.success) {
        return { success: true, message: `${result.guardados} puntos sincronizados correctamente` }
      } else {
        return { success: false, message: result.error || 'Error en sincronización' }
      }
    } catch (error) {
      return { success: false, message: String(error) }
    }
  }, [crearCopiaSeguridad, state.puntos])

  const cargarDesdeSupabase = useCallback(async () => {
    try {
      const [ultimoEstado, estadosNube] = await Promise.all([
        obtenerUltimoEstadoAppDesdeNube(),
        obtenerEstadosAppDesdeNube(MAX_ESTADOS_GUARDADOS),
      ])

      if (ultimoEstado) {
        dispatch({ type: 'RESTAURAR_ESTADO_GUARDADO', payload: ultimoEstado.snapshot })
        dispatch({ type: 'SET_ESTADOS_GUARDADOS', payload: estadosNube })
        console.log(`Estado completo cargado desde Supabase: ${ultimoEstado.snapshot.puntos.length} puntos`)
        return
      }

      const puntos = await cargarPuntosDesdeDB()
      dispatch({ type: 'SET_PUNTOS', payload: puntos })
        console.log(`📂 ${puntos.length} puntos cargados desde Supabase`)
    } catch (error) {
      console.error('Error cargando desde Supabase:', error)
      throw error
    }
  }, [])

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

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        agregarPunto,
        eliminarPunto,
        setPuntoActivo,
        setModuloActivo,
        actualizarPunto,
        setNomenclaturasGlobales,
        setPlantillasFormato,
        setPlantillasPdfFormato,
        setPlantillasFicha,
        crearCopiaSeguridad,
        restaurarEstadoGuardado,
        moverPunto,
        renumerarPuntos,
        sincronizarConSupabase,
        cargarDesdeSupabase,
        guardarCoordenadasDB,
        guardarDocumentacionDB,
        guardarAnalisisDB,
        toggleBloquearPunto,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp debe usarse dentro de un AppProvider')
  }
  return context
}
