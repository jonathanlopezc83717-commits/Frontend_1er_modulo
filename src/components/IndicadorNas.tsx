import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/context/AppContext'
import {
  ackPendientes,
  detectarCambiosPuntosExistentes,
  eventosDePuntos,
  leerPendientes,
  recargarPuntoDesdeNAS,
} from '@/lib/nas-approval'
import { hayEventosNuevos, useNasLive } from '@/lib/nas-live'
import type { PuntoFerroviario } from '@/types'
import { toast } from 'sonner'
import { FileStack, RefreshCw, WifiOff } from 'lucide-react'

export function IndicadorNas() {
  const store = useAppStore()
  const conectado = Boolean(import.meta.hot)
  const [watcherActivo, setWatcherActivo] = useState(true)
  const [pendientes, setPendientes] = useState(0)
  const [recargando, setRecargando] = useState<string | null>(null)
  const marcaRef = useRef(0)
  const procesandoRef = useRef(false)

  const procesar = useCallback(async () => {
    if (procesandoRef.current) return
    procesandoRef.current = true
    try {
      const { pending: eventos, updatedAt } = await leerPendientes()
      setWatcherActivo(updatedAt !== null)
      setPendientes(eventos.length)
      if (eventos.length === 0 || !hayEventosNuevos(eventos, marcaRef.current)) return
      const { puntos } = store.getState()
      const cambios = detectarCambiosPuntosExistentes(eventos, puntos)
      const recargados: PuntoFerroviario[] = []
      for (const cambio of cambios) {
        const punto = puntos.find((p) => p.id === cambio.puntoId)
        if (!punto) continue
        setRecargando(cambio.puntoNombre)
        const { errores } = await recargarPuntoDesdeNAS(punto, cambio.eventos, store.dispatch)
        if (errores.length > 0) {
          toast.error(`Error al recargar "${cambio.puntoNombre}" desde NAS`, {
            description: errores[0],
          })
        } else {
          toast.success(`"${cambio.puntoNombre}" actualizado desde NAS`)
          recargados.push(punto)
        }
      }
      marcaRef.current = eventos.reduce(
        (marca, ev) => Math.max(marca, new Date(ev.detectedAt).getTime() || 0),
        marcaRef.current
      )
      await ackPendientes(eventosDePuntos(eventos, recargados).map((ev) => ev.eventId))
    } catch {
      toast.error('No se pudieron procesar los cambios del NAS')
    } finally {
      procesandoRef.current = false
      setRecargando(null)
    }
  }, [store])

  useNasLive((info) => {
    if (info.updatedAt !== null) setWatcherActivo(true)
    setPendientes(info.pendientes)
    void procesar()
  })

  useEffect(() => {
    if (!conectado) return
    void procesar()
  }, [conectado, procesar])

  const sinConexion = !conectado || !watcherActivo
  const titulo = recargando
    ? `Recargando "${recargando}" desde NAS…`
    : sinConexion
      ? 'Watcher NAS no conectado'
      : pendientes > 0
        ? `${pendientes} evento(s) del NAS pendientes de procesar`
        : 'NAS sincronizado'

  return (
    <div className="flex items-center gap-1.5 h-9 px-1 shrink-0 text-xs" title={titulo}>
      {recargando ? (
        <>
          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
          <span className="hidden md:inline max-w-[140px] truncate text-muted-foreground">
            {recargando}
          </span>
        </>
      ) : sinConexion ? (
        <WifiOff className="w-4 h-4 text-muted-foreground/40" />
      ) : pendientes > 0 ? (
        <Badge
          variant="outline"
          className="gap-1 h-5 px-1.5 text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        >
          <FileStack className="w-3 h-3" />
          {pendientes}
        </Badge>
      ) : (
        <span className="w-2 h-2 rounded-full bg-emerald-500/70" />
      )}
    </div>
  )
}
