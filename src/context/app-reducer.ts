import type { AppState, AppAction, PuntoFerroviario } from '@/types'
import { MAX_VERSIONES_PUNTO } from '@/types'
import { generarUUID } from '@/lib/utils'
import { consolidarNomenclaturas } from '@/lib/nomenclaturas'

export const MAX_ESTADOS_GUARDADOS = 24

function generarId(): string {
  return generarUUID()
}

export function reenumerarPuntos(puntos: PuntoFerroviario[]): PuntoFerroviario[] {
  return puntos
    .sort((a, b) => a.numeroSerie - b.numeroSerie)
    .map((punto, index) => ({
      ...punto,
      numeroSerie: index + 1,
      updatedAt: new Date().toISOString(),
    }))
}

// SLICE: puntos (gestión de puntos + punto activo)
function puntosSlice(state: AppState, action: AppAction): AppState | undefined {
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

    case 'AGREGAR_PUNTO': {
      const { posicion, punto, id: idExplicito } = action.payload
      const nuevoPunto: PuntoFerroviario = {
        ...punto,
        id: idExplicito || generarId(),
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

    case 'PUSH_VERSION_PUNTO': {
      const now = new Date().toISOString()
      const puntosActualizados = state.puntos.map(p => {
        if (p.id !== action.payload) return p
        const snapshotPunto = { ...p }
        delete snapshotPunto.versiones
        const versiones = [...(p.versiones || []), { snapshot: snapshotPunto, timestamp: now }]
          .slice(-MAX_VERSIONES_PUNTO)
        return { ...p, versiones }
      })
      return {
        ...state,
        puntos: puntosActualizados,
        puntoActivo: state.puntoActivo?.id === action.payload
          ? puntosActualizados.find(p => p.id === action.payload) || null
          : state.puntoActivo,
      }
    }

    case 'DESHACER_PUNTO': {
      const puntosActualizados = state.puntos.map(p => {
        if (p.id !== action.payload) return p
        const versiones = p.versiones || []
        if (versiones.length === 0) return p
        const ultimo = versiones[versiones.length - 1]
        return {
          ...ultimo.snapshot,
          versiones: versiones.slice(0, -1),
          updatedAt: new Date().toISOString(),
        }
      })
      return {
        ...state,
        puntos: puntosActualizados,
        puntoActivo: state.puntoActivo?.id === action.payload
          ? puntosActualizados.find(p => p.id === action.payload) || null
          : state.puntoActivo,
      }
    }

    default:
      return undefined
  }
}

// SLICE: historial / estados guardados (RESTAURAR es cross-slice por diseño)
function historialSlice(state: AppState, action: AppAction): AppState | undefined {
  switch (action.type) {
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
        modulosOrden: action.payload.modulosOrden ?? state.modulosOrden,
        nomenclaturasGlobales: consolidarNomenclaturas([action.payload.nomenclaturasGlobales]),
        plantillasFormato: action.payload.plantillasFormato || state.plantillasFormato,
        plantillasPdfFormato: action.payload.plantillasPdfFormato || state.plantillasPdfFormato,
        plantillasFicha: action.payload.plantillasFicha || state.plantillasFicha,
      }
    }

    default:
      return undefined
  }
}

// SLICE: configuración (nomenclaturas, plantillas, módulos activos)
function configSlice(state: AppState, action: AppAction): AppState | undefined {
  switch (action.type) {
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

    case 'SET_MODULO_ACTIVO':
      return {
        ...state,
        moduloActivo: action.payload,
      }

    case 'REORDENAR_MODULOS':
      return {
        ...state,
        modulosOrden: action.payload,
      }

    default:
      return undefined
  }
}

export function appReducer(state: AppState, action: AppAction): AppState {
  return puntosSlice(state, action)
    ?? historialSlice(state, action)
    ?? configSlice(state, action)
    ?? state
}
