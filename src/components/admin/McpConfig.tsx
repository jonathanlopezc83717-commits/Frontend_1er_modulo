import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Settings2, Save, AlertTriangle, Loader2 } from 'lucide-react'
import type { McpConfigRow } from '@/types'

export function McpConfig() {
  const { perfil, proyectoActivoId, session } = useAuth()
  const [config, setConfig] = useState<McpConfigRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toggleValue, setToggleValue] = useState(false)
  const [cronValue, setCronValue] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    if (!proyectoActivoId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const cargar = async () => {
      const { data, error } = await supabase
        .from('mcp_config')
        .select('*')
        .eq('proyecto_id', proyectoActivoId)
        .maybeSingle()
      if (cancelado) return
      if (error) {
        toast.error('No se pudo cargar la configuración MCP', { description: error.message })
        setLoading(false)
        return
      }
      const fila = data as McpConfigRow | null
      setConfig(fila)
      setToggleValue(fila?.auto_trigger_on_upload ?? false)
      setCronValue(fila?.cron_schedule ?? null)
      setLoading(false)
    }
    cargar()
    return () => { cancelado = true }
  }, [proyectoActivoId])

  if (perfil?.rol !== 'administrador') {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No tiene permiso para ver la configuración MCP.
        </CardContent>
      </Card>
    )
  }

  if (!proyectoActivoId) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Selecciona un proyecto activo para configurar MCP.
        </CardContent>
      </Card>
    )
  }

  const guardar = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('mcp_config')
        .upsert({
          proyecto_id: proyectoActivoId,
          auto_trigger_on_upload: toggleValue,
          cron_schedule: cronValue,
          updated_at: new Date().toISOString(),
          updated_by: session?.user.id ?? null,
        }, { onConflict: 'proyecto_id' })
      if (error) throw error
      toast.success('Configuración MCP guardada')
      const { data } = await supabase
        .from('mcp_config')
        .select('*')
        .eq('proyecto_id', proyectoActivoId)
        .maybeSingle()
      setConfig((data as McpConfigRow | null) ?? null)
    } catch (err) {
      toast.error('No se pudo guardar la configuración MCP', {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          Configuración MCP — proyecto activo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando configuración...
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="auto-trigger"
                checked={toggleValue}
                onCheckedChange={(checked) => setToggleValue(checked === true)}
                disabled={saving}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <Label htmlFor="auto-trigger" className="cursor-pointer">
                  Disparo automático al subir archivos
                </Label>
                <p className="text-xs text-muted-foreground">
                  Marca este toggle para registrar intención de cron futuro. Hoy NO dispara análisis.
                </p>
              </div>
            </div>

            {toggleValue && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-xs">
                  El toggle está guardado pero NO dispara análisis automáticamente. El admin debe
                  usar “Analizar ahora” en la pestaña de pendientes.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="cron">Cron schedule (futuro)</Label>
              <Input
                id="cron"
                value={cronValue ?? ''}
                placeholder="Sin cron (PR futuro)"
                disabled
                readOnly
              />
              <p className="text-xs text-muted-foreground">
                Editor de cron disponible en un PR futuro. Hoy solo se persiste el toggle.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="text-xs text-muted-foreground space-y-0.5">
                {config?.updated_at && (
                  <p>Última actualización: {new Date(config.updated_at).toLocaleString('es-CL')}</p>
                )}
                {perfil?.email && <p>Sesión actual: {perfil.email}</p>}
              </div>
              <Button onClick={guardar} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}