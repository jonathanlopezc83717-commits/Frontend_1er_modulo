import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  leerPendientes,
  procesarPendientes,
  ackPendientes,
  aprobarPunto,
  deshacerPunto,
  marcarRevisado,
  confirmarSobrescritura,
  detectarCambiosPuntosExistentes,
  recargarPuntoDesdeNAS,
  type NasPendingEvent,
  type ResultadoProcesamiento,
  type CambioPuntoExistente,
} from '@/lib/nas-approval'
import type { FilaSincronizacion } from '@/lib/excel-sync'
import { MAX_VERSIONES_PUNTO } from '@/types'
import { ClipboardCheck, RefreshCw, Check, Undo2, AlertTriangle, FolderSync, Plus, Pencil, Trash2, ArrowRight } from 'lucide-react'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'

const POLL_MS = 20000

interface ConflictoPendiente {
  puntoId: string
  fila: FilaSincronizacion
  sourcePath: string
}

export function ModuloAprobacion() {
  const { state, dispatch, agregarPunto } = useApp()
  const [eventos, setEventos] = useState<NasPendingEvent[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoProcesamiento | null>(null)
  const [conflictos, setConflictos] = useState<ConflictoPendiente[]>([])
  const [draftsCadenamiento, setDraftsCadenamiento] = useState<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)

  const cargar = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const r = await leerPendientes(ac.signal)
      setEventos(r.pending)
      setUpdatedAt(r.updatedAt)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        // silencioso: endpoint puede no estar disponible
      }
    }
  }, [])

  useEffect(() => {
    // NAS watcher solo corre en local; en Vercel el endpoint no existe y ensucia
    // la consola con 404 por cada tick del interval.
    if (!import.meta.env.DEV) return
    cargar()
    const id = setInterval(cargar, POLL_MS)
    return () => {
      clearInterval(id)
      abortRef.current?.abort()
    }
  }, [cargar])

  const puntosPendientes = state.puntos.filter((p) => p.estadoAprobacion !== 'aprobado')

  const cambiosPuntosExistentes = useMemo(
    () => detectarCambiosPuntosExistentes(eventos, state.puntos),
    [eventos, state.puntos]
  )

  const handleRecargar = async (cambio: CambioPuntoExistente) => {
    const punto = state.puntos.find((p) => p.id === cambio.puntoId)
    if (!punto) return
    setProcesando(true)
    try {
      const res = await recargarPuntoDesdeNAS(punto, cambio.eventos, dispatch)
      await ackPendientes(cambio.eventos.map((e) => e.eventId))
      await cargar()
      if (res.errores.length > 0) {
        toast.warning(`Recargado con ${res.errores.length} error(es)`)
      } else {
        toast.success(`${punto.nombre}: ${res.actualizados} archivo(s) actualizado(s)`)
      }
    } catch (e) {
      toast.error('Error recargando: ' + String(e))
    } finally {
      setProcesando(false)
    }
  }

  const handleProcesar = async () => {
    if (procesando || eventos.length === 0) return
    setProcesando(true)
    try {
      const res = await procesarPendientes(eventos, {
        puntos: state.puntos,
        nomenclaturas: state.nomenclaturasGlobales,
        onPuntoNuevo: (punto) => {
          agregarPunto(state.puntos.length + 1, punto)
        },
        onConflicto: (punto, fila, sourcePath) => {
          setConflictos((prev) => [...prev, { puntoId: punto.id, fila, sourcePath }])
        },
      })
      setResultado(res)
      if (res.eventosProcesados.length > 0) {
        await ackPendientes(res.eventosProcesados)
        await cargar()
      }
      toast.success(`${res.puntosNuevos} nuevos · ${res.conflictos} conflictos · ${res.errores.length} errores`)
    } catch (e) {
      toast.error('Error procesando: ' + String(e))
    } finally {
      setProcesando(false)
    }
  }

  const handleEditar = (id: string, campo: 'nombre' | 'descripcion' | 'cadenamiento', valor: string) => {
    dispatch({ type: 'ACTUALIZAR_PUNTO', payload: { id, data: { [campo]: valor } } })
    marcarRevisado(id, dispatch)
  }

  const handleGuardarCadenamiento = (id: string, valorActual: string | undefined) => {
    const draft = draftsCadenamiento[id] ?? valorActual ?? ''
    if (draft === (valorActual ?? '')) {
      toast.info('Cadenamiento sin cambios')
      return
    }
    handleEditar(id, 'cadenamiento', draft)
    setDraftsCadenamiento((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    toast.success('Cadenamiento guardado. Revisa el orden en el Gestor de Puntos.')
  }

  const handleAprobar = (id: string) => {
    aprobarPunto(id, dispatch)
    toast.success('Punto aprobado. Ya puedes exportar PDF y Excel.')
  }

  const handleDeshacer = (id: string) => {
    deshacerPunto(id, dispatch)
    toast.info('Cambio deshecho')
  }

  const handleSobrescribir = (conflicto: ConflictoPendiente) => {
    confirmarSobrescritura(conflicto.puntoId, conflicto.fila, dispatch)
    setConflictos((prev) => prev.filter((c) => c !== conflicto))
    toast.info('Datos sobrescritos. Revisa antes de aprobar.')
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-4 pr-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                <CardTitle>Cambios pendientes del NAS</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={cargar} disabled={procesando}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refrescar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Última actualización: {updatedAt ? new Date(updatedAt).toLocaleString('es-ES') : '—'}
              </span>
              <Badge variant={eventos.length > 0 ? 'default' : 'secondary'}>
                {eventos.length} eventos
              </Badge>
            </div>
            <Button onClick={handleProcesar} disabled={procesando || eventos.length === 0} className="w-full">
              <ClipboardCheck className="mr-2 h-4 w-4" />
              {procesando ? 'Procesando…' : `Procesar ${eventos.length} cambio(s)`}
            </Button>
            {resultado && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Último: {resultado.puntosNuevos} nuevos · {resultado.conflictos} conflictos · {resultado.errores.length} errores</p>
                {resultado.errores.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-destructive">
                    {resultado.errores.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {conflictos.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <CardTitle>Conflictos: {conflictos.length}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {conflictos.map((c, i) => {
                const p = state.puntos.find((x) => x.id === c.puntoId)
                if (!p) return null
                return (
                  <div key={i} className="rounded-md border border-amber-500/30 bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">#{p.numeroSerie} {p.nombre}</p>
                        <p className="text-xs text-muted-foreground">Origen: {c.sourcePath}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setConflictos((prev) => prev.filter((x) => x !== c))}>
                          Ignorar
                        </Button>
                        <Button size="sm" onClick={() => handleSobrescribir(c)}>
                          Sobrescribir
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs font-mono">
                      Nuevo: X={c.fila.x} Y={c.fila.y} Z={c.fila.z} · {c.fila.codigo}
                    </p>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {cambiosPuntosExistentes.length > 0 && (
          <Card className="border-blue-500/40 bg-blue-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FolderSync className="h-5 w-5 text-blue-600" />
                <CardTitle>Cambios detectados en puntos existentes ({cambiosPuntosExistentes.length})</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {cambiosPuntosExistentes.map((c) => {
                const agregados = c.eventos.filter((e) => e.type === 'created')
                const modificados = c.eventos.filter((e) => e.type === 'modified')
                const eliminados = c.eventos.filter((e) => e.type === 'deleted')
                const movidos = c.eventos.filter((e) => e.type === 'moved')
                return (
                  <div key={c.puntoId} className="rounded-md border border-blue-500/30 bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{c.puntoNombre}</p>
                        <p className="text-xs text-muted-foreground truncate font-mono">{c.nasPath}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleRecargar(c)}
                        disabled={procesando}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Recargar
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {agregados.length > 0 && (
                        <div className="flex items-start gap-1.5">
                          <Plus className="w-3 h-3 text-green-600 mt-0.5 shrink-0" />
                          <span className="text-xs text-green-700">
                            <span className="font-medium">Agregados ({agregados.length}):</span>{' '}
                            {agregados.map((e) => e.path.split('/').pop()).join(', ')}
                          </span>
                        </div>
                      )}
                      {modificados.length > 0 && (
                        <div className="flex items-start gap-1.5">
                          <Pencil className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />
                          <span className="text-xs text-amber-700">
                            <span className="font-medium">Modificados ({modificados.length}):</span>{' '}
                            {modificados.map((e) => e.path.split('/').pop()).join(', ')}
                          </span>
                        </div>
                      )}
                      {eliminados.length > 0 && (
                        <div className="flex items-start gap-1.5">
                          <Trash2 className="w-3 h-3 text-red-600 mt-0.5 shrink-0" />
                          <span className="text-xs text-red-700">
                            <span className="font-medium">Eliminados ({eliminados.length}):</span>{' '}
                            {eliminados.map((e) => e.path.split('/').pop()).join(', ')}
                          </span>
                        </div>
                      )}
                      {movidos.length > 0 && (
                        <div className="flex items-start gap-1.5">
                          <ArrowRight className="w-3 h-3 text-blue-600 mt-0.5 shrink-0" />
                          <span className="text-xs text-blue-700">
                            <span className="font-medium">Movidos/Renombrados ({movidos.length}):</span>{' '}
                            {movidos.map((e) => e.path.split('/').pop()).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Puntos pendientes ({puntosPendientes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {puntosPendientes.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No hay puntos pendientes de aprobación.
              </p>
            )}
            {puntosPendientes.map((p) => (
              <div key={p.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{p.numeroSerie}</Badge>
                    <Badge variant={p.estadoAprobacion === 'pendiente' ? 'secondary' : 'default'}>
                      {p.estadoAprobacion ?? 'pendiente'}
                    </Badge>
                    {p.versiones && p.versiones.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <Undo2 className="mr-1 h-3 w-3" />
                        {p.versiones.length}/{MAX_VERSIONES_PUNTO}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeshacer(p.id)}
                      disabled={!p.versiones || p.versiones.length === 0}
                    >
                      <Undo2 className="mr-1 h-3 w-3" />
                      Deshacer
                    </Button>
                    <Button size="sm" onClick={() => handleAprobar(p.id)}>
                      <Check className="mr-1 h-3 w-3" />
                      Aprobar
                    </Button>
                  </div>
                </div>
                <label className="text-xs space-y-1 block">
                  <span className="text-muted-foreground">Nombre</span>
                  <Input
                    defaultValue={p.nombre}
                    onBlur={(e) => {
                      if (e.target.value !== p.nombre) handleEditar(p.id, 'nombre', e.target.value)
                    }}
                  />
                </label>
                <label className="text-xs space-y-1 block">
                  <span className="text-muted-foreground">Cadenamiento (afecta el orden en Gestor de Puntos)</span>
                  <div className="flex gap-2">
                    <Input
                      value={draftsCadenamiento[p.id] ?? p.cadenamiento ?? ''}
                      onChange={(e) => setDraftsCadenamiento((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleGuardarCadenamiento(p.id, p.cadenamiento)
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleGuardarCadenamiento(p.id, p.cadenamiento)}
                      disabled={(draftsCadenamiento[p.id] ?? p.cadenamiento ?? '') === (p.cadenamiento ?? '')}
                    >
                      Guardar
                    </Button>
                  </div>
                </label>
                <label className="text-xs space-y-1 block">
                  <span className="text-muted-foreground">Descripción</span>
                  <Textarea
                    rows={2}
                    defaultValue={p.descripcion ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (p.descripcion ?? '')) handleEditar(p.id, 'descripcion', e.target.value)
                    }}
                  />
                </label>
                {p.moduloData?.georeferencia?.coordenadas && (
                  <p className="text-xs font-mono text-muted-foreground">
                    X={p.moduloData.georeferencia.coordenadas.x} · Y={p.moduloData.georeferencia.coordenadas.y} · Z={p.moduloData.georeferencia.coordenadas.z}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
