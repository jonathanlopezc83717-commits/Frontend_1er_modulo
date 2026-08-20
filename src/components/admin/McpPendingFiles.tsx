import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Loader2,
  Inbox,
  Play,
  Image as ImageIcon,
  FileText,
  Layers,
  MapPin,
} from 'lucide-react'
import type {
  McpPendingArchivo,
  McpTriggerAnalysisInput,
  McpTriggerAnalysisResponse,
} from '@/types'

const POLL_INTERVAL_MS = 30_000
const SIGNED_URL_TTL_SECONDS = 60

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

interface PuntoRow {
  id: string
  slug: string
  nombre: string
  coordenadas_cad: { x: number; y: number; z?: number | null } | null
}

type PuntoJoin = PuntoRow | PuntoRow[] | null

function unwrapPunto(raw: PuntoJoin): PuntoRow | null {
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw ?? null
}

interface ArchivoRaw {
  id: string
  storage_path: string
  bucket: 'mcp-evidencia' | 'mcp-referencias'
  kind: McpPendingArchivo['kind']
  mime_type: string | null
  size_bytes: number | null
  punto_id: string
  created_at: string
  puntos_ferroviarios: PuntoJoin
}

export function McpPendingFiles() {
  const { perfil, proyectoActivoId } = useAuth()
  const [archivos, setArchivos] = useState<McpPendingArchivo[]>([])
  const [loading, setLoading] = useState(true)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [triggering, setTriggering] = useState(false)

  const cargar = useCallback(async () => {
    if (!proyectoActivoId) {
      setArchivos([])
      setLoading(false)
      return
    }
    const { data, error } = await supabase
      .from('puntos_archivos')
      .select(`
        id, storage_path, bucket, kind, mime_type, size_bytes, created_at,
        punto_id,
        puntos_ferroviarios!inner ( id, slug, nombre, coordenadas_cad )
      `)
      .is('analyzed_at', null)
      .in('bucket', ['mcp-evidencia', 'mcp-referencias'])
      .eq('puntos_ferroviarios.proyecto_id', proyectoActivoId)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('No se pudo cargar la lista de pendientes', { description: error.message })
      setLoading(false)
      return
    }

    const filas: McpPendingArchivo[] = ((data ?? []) as unknown as ArchivoRaw[]).map((r) => {
      const p = unwrapPunto(r.puntos_ferroviarios)
      return {
        id: r.id,
        storage_path: r.storage_path,
        bucket: r.bucket,
        kind: r.kind,
        mime_type: r.mime_type,
        size_bytes: r.size_bytes,
        punto_id: r.punto_id,
        punto_slug: p?.slug ?? '—',
        punto_name: p?.nombre ?? '—',
        coordenadas_cad: p?.coordenadas_cad ?? null,
        created_at: r.created_at,
      }
    })
    setArchivos(filas)
    setLoading(false)
  }, [proyectoActivoId])

  useEffect(() => {
    let cancelado = false
    cargar()
    const id = window.setInterval(() => { if (!cancelado) cargar() }, POLL_INTERVAL_MS)
    const onFocus = () => { if (!cancelado) cargar() }
    window.addEventListener('focus', onFocus)
    return () => {
      cancelado = true
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [cargar])

  useEffect(() => {
    let cancelado = false
    const fotos = archivos.filter((a) => a.kind === 'foto' && a.mime_type?.startsWith('image/'))
    if (fotos.length === 0) {
      setSignedUrls({})
      return
    }
    Promise.all(
      fotos.map(async (a) => {
        const { data } = await supabase.storage
          .from(a.bucket)
          .createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS)
        return data?.signedUrl ? ([a.id, data.signedUrl] as const) : null
      }),
    ).then((entries) => {
      if (cancelado) return
      const pares = entries.filter((e): e is readonly [string, string] => e !== null)
      setSignedUrls(Object.fromEntries(pares))
    })
    return () => { cancelado = true }
  }, [archivos])

  const grupos = useMemo(() => {
    const map = new Map<string, {
      punto_slug: string
      punto_name: string
      coordenadas_cad: McpPendingArchivo['coordenadas_cad']
      archivos: McpPendingArchivo[]
    }>()
    for (const a of archivos) {
      const grupo = map.get(a.punto_id) ?? {
        punto_slug: a.punto_slug,
        punto_name: a.punto_name,
        coordenadas_cad: a.coordenadas_cad,
        archivos: [],
      }
      grupo.archivos.push(a)
      map.set(a.punto_id, grupo)
    }
    return Array.from(map.entries()).map(([punto_id, g]) => ({ punto_id, ...g }))
  }, [archivos])

  const pendientesTotal = archivos.length

  const analizarAhora = async (puntoSlug?: string) => {
    if (!proyectoActivoId) return
    setTriggering(true)
    const mensaje = puntoSlug ? `Analizando ${puntoSlug}...` : 'Analizando pendientes del proyecto...'
    const toastId = toast.loading(mensaje)
    try {
      const body: McpTriggerAnalysisInput = { proyecto_id: proyectoActivoId, punto_slug: puntoSlug }
      const { data, error } = await supabase.functions.invoke<McpTriggerAnalysisResponse>(
        'mcp-trigger-analysis',
        { body },
      )
      if (error) throw error
      toast.success(`Análisis completado: ${data?.procesados ?? 0} procesado(s)`, {
        id: toastId,
        description: data?.errores?.length ? `${data.errores.length} con error` : 'Sin errores',
      })
      await cargar()
    } catch (err) {
      toast.error('No se pudo disparar el análisis', {
        id: toastId,
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setTriggering(false)
    }
  }

  if (perfil?.rol !== 'administrador') {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No tiene permiso para ver los archivos pendientes.
        </CardContent>
      </Card>
    )
  }

  if (!proyectoActivoId) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Selecciona un proyecto activo para ver los archivos pendientes.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" />
            Archivos pendientes de análisis
            <Badge variant={pendientesTotal > 0 ? 'destructive' : 'secondary'} className="ml-1">
              {pendientesTotal}
            </Badge>
          </CardTitle>
          <Button onClick={() => analizarAhora(undefined)} disabled={triggering || pendientesTotal === 0}>
            {triggering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Analizar todo el proyecto
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando pendientes...
          </div>
        ) : grupos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">
            <Inbox className="h-10 w-10 opacity-40 mb-2" />
            No hay archivos pendientes. Esperando nuevos uploads del MCP server.
          </div>
        ) : (
          <div className="space-y-3">
            {grupos.map((g) => (
              <div key={g.punto_id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{g.punto_slug}</span>
                      <span className="font-medium truncate">{g.punto_name}</span>
                    </div>
                    {g.coordenadas_cad && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        x={g.coordenadas_cad.x} · y={g.coordenadas_cad.y}
                        {g.coordenadas_cad.z != null ? ` · z=${g.coordenadas_cad.z}` : ''}
                      </p>
                    )}
                    <Badge variant="outline" className="gap-1">
                      <Layers className="h-3 w-3" /> {g.archivos.length} archivo{g.archivos.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  <Button size="sm" onClick={() => analizarAhora(g.punto_slug)} disabled={triggering}>
                    {triggering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                    Analizar ahora
                  </Button>
                </div>
                <Separator />
                <ul className="space-y-1.5">
                  {g.archivos.map((a) => {
                    const isImage = a.mime_type?.startsWith('image/')
                    const signed = signedUrls[a.id]
                    return (
                      <li key={a.id} className="flex items-center gap-3 text-sm">
                        {isImage && signed ? (
                          <img
                            src={signed}
                            alt=""
                            className="h-10 w-10 rounded object-cover border"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center">
                            {isImage
                              ? <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              : <FileText className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs">{a.storage_path}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.kind} · {a.mime_type ?? 'mime?'} · {formatBytes(a.size_bytes)}
                          </p>
                        </div>
                        <Badge variant="secondary">{a.bucket}</Badge>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs">
                Los archivos se quitan de la lista cuando <code className="font-mono">mcp-trigger-analysis</code>{' '}
                marca <code className="font-mono">analyzed_at</code> con éxito. La lista se actualiza cada 30 s.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}