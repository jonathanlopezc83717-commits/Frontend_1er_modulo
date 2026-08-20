import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAppStore } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import {
  ackPendientes,
  detectarCambiosPuntosExistentes,
  eventosDePuntos,
  leerPendientes,
  recargarPuntoDesdeNAS,
} from '@/lib/nas-approval'
import { listarSnapshotsNAS } from '@/lib/snapshot-store'
import { hayEventosNuevos, useNasLive } from '@/lib/nas-live'
import type { PuntoFerroviario } from '@/types'
import { toast } from 'sonner'
import { FileStack, FolderOpen, RefreshCw, WifiOff } from 'lucide-react'

interface DetalleNas {
  watchPath: string | null
  ultimoEscaneo: string | null
  snapshots: number
  ultimoSnapshot: string | null
}

export function IndicadorNas() {
  const store = useAppStore()
  const { proyectoActivoId, proyectos } = useAuth()
  const proyectoActivo = proyectos.find((p) => p.id === proyectoActivoId) ?? null
  const carpetaProyecto = proyectoActivo?.carpeta_nas?.replace(/^[/\\]+|[/\\]+$/g, '') || null
  const [watcherActivo, setWatcherActivo] = useState(true)
  const [pendientes, setPendientes] = useState(0)
  const [recargando, setRecargando] = useState<string | null>(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [detalle, setDetalle] = useState<DetalleNas | null>(null)
  const [detalleCargando, setDetalleCargando] = useState(false)
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

  const conectado = useNasLive((info) => {
    if (info.updatedAt !== null) setWatcherActivo(true)
    setPendientes(info.pendientes)
    void procesar()
  })

  useEffect(() => {
    if (!conectado) return
    void procesar()
  }, [conectado, procesar])

  const abrirDetalle = useCallback(async () => {
    setDetalleAbierto(true)
    setDetalleCargando(true)
    setDetalle(null)
    try {
      const [resp, snaps] = await Promise.all([
        leerPendientes(),
        listarSnapshotsNAS(proyectoActivoId ?? ''),
      ])
      setDetalle({
        watchPath: resp.watchPath ?? null,
        ultimoEscaneo: resp.updatedAt,
        snapshots: snaps.length,
        ultimoSnapshot: snaps[0]?.createdAt ?? null,
      })
    } catch {
      setDetalle(null)
    } finally {
      setDetalleCargando(false)
    }
  }, [proyectoActivoId])

  const sinConexion = !conectado || !watcherActivo
  const titulo = recargando
    ? `Recargando "${recargando}" desde NAS…`
    : sinConexion
      ? 'Watcher NAS no conectado'
      : pendientes > 0
        ? `${pendientes} evento(s) del NAS pendientes de procesar`
        : 'NAS sincronizado'

  return (
    <>
      <Button
        variant="ghost"
        className="flex items-center gap-1.5 h-9 px-1 shrink-0 text-xs"
        title={`${titulo} — clic para verificar la carpeta del proyecto`}
        aria-label="Verificar estado del watcher NAS"
        onClick={() => void abrirDetalle()}
      >
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
      </Button>

      <Dialog open={detalleAbierto} onOpenChange={setDetalleAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FolderOpen className="size-4 text-primary" />
              Verificación del watcher NAS
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Estado del watcher</span>
              {sinConexion ? (
                <span className="font-medium text-destructive">No conectado</span>
              ) : (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  Activo{pendientes > 0 ? ` · ${pendientes} pendiente(s)` : ' · sincronizado'}
                </span>
              )}
            </div>
            {detalleCargando ? (
              <p className="text-muted-foreground">Verificando carpeta…</p>
            ) : detalle ? (
              <>
                <div className="space-y-1">
                  <span className="text-muted-foreground">Raíz vigilada (origen local del NAS)</span>
                  <code className="block rounded bg-muted px-2 py-1.5 text-xs break-all">
                    {detalle.watchPath || 'No informada por el watcher'}
                  </code>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground">
                    Carpeta de este proyecto (solo lectura)
                  </span>
                  {carpetaProyecto && detalle.watchPath ? (
                    <code className="block rounded bg-muted px-2 py-1.5 text-xs break-all">
                      {detalle.watchPath}/{carpetaProyecto}
                    </code>
                  ) : carpetaProyecto ? (
                    <code className="block rounded bg-muted px-2 py-1.5 text-xs break-all">
                      {'<NAS>'}/{carpetaProyecto}
                    </code>
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Sin carpeta definida — editala en el proyecto para acotar las lecturas del NAS.
                    </p>
                  )}
                </div>
                {detalle.ultimoEscaneo && (
                  <p className="text-xs text-muted-foreground">
                    Último escaneo: {new Date(detalle.ultimoEscaneo).toLocaleString()}
                  </p>
                )}
                <div className="space-y-1">
                  <span className="text-muted-foreground">
                    Carpeta de snapshots de este proyecto
                  </span>
                  <code className="block rounded bg-muted px-2 py-1.5 text-xs break-all">
                    {(detalle.watchPath || '<NAS>')}/.snapshots/{proyectoActivoId ?? '—'}
                  </code>
                  {detalle.snapshots > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {detalle.snapshots} snapshot(s) · último{' '}
                      {detalle.ultimoSnapshot
                        ? new Date(detalle.ultimoSnapshot).toLocaleString()
                        : '—'}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Sin snapshots guardados aún para este proyecto
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-destructive">
                No se pudo leer el estado del servidor de archivos (endpoint nas-pending).
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
