import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useAuth } from '@/context/AuthContext'
import { proyectosCollection } from '@/lib/collections'
import {
  agregarMiembroProyecto,
  listarProyectosDeUsuario,
  quitarMiembroProyecto,
} from '@/lib/supabase-service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ProyectosDeUsuarioProps {
  userId: string
  email: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function mensajeErrorAccion(error: unknown, fallback: string): string {
  const mensaje = error instanceof Error ? error.message : ''
  if (/duplicate key/i.test(mensaje)) return 'El usuario ya es miembro del proyecto'
  if (/row-level security|permission denied/i.test(mensaje)) return 'No tenés permiso para esta acción'
  return mensaje || fallback
}

export function ProyectosDeUsuario({ userId, email, open, onOpenChange }: ProyectosDeUsuarioProps) {
  const { session } = useAuth()
  const [membresias, setMembresias] = useState<string[]>([])
  const [cargandoMembresias, setCargandoMembresias] = useState(false)
  const [pendiente, setPendiente] = useState<string | null>(null)

  const proyectosQuery = useLiveQuery((q) => q.from({ proyectos: proyectosCollection }), [])
  const proyectos = proyectosQuery.data ?? []

  const cargarMembresias = useCallback(async () => {
    setCargandoMembresias(true)
    try {
      setMembresias(await listarProyectosDeUsuario(userId))
    } finally {
      setCargandoMembresias(false)
    }
  }, [userId])

  useEffect(() => {
    if (open) {
      void cargarMembresias()
      void proyectosCollection.utils.refetch()
    }
  }, [open, cargarMembresias])

  const miembroDe = useMemo(() => new Set(membresias), [membresias])

  const alternar = async (proyectoId: string, nombre: string, esMiembro: boolean) => {
    setPendiente(proyectoId)
    try {
      const resultado = esMiembro
        ? await quitarMiembroProyecto(proyectoId, userId)
        : await agregarMiembroProyecto(proyectoId, userId, session?.user.id ?? '')
      if (!resultado.success) throw new Error(resultado.error)
      toast.success(esMiembro ? `Quitado de "${nombre}"` : `Agregado a "${nombre}"`)
      await cargarMembresias()
    } catch (error) {
      toast.error(mensajeErrorAccion(error, 'No se pudo actualizar la membresía'))
    } finally {
      setPendiente(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Proyectos de {email}</DialogTitle>
          <DialogDescription>
            {`Miembro de ${membresias.length} ${membresias.length === 1 ? 'proyecto' : 'proyectos'}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {(proyectosQuery.isLoading || cargandoMembresias) && proyectos.length === 0 && (
            <p className="text-sm text-muted-foreground">Cargando proyectos…</p>
          )}
          {proyectos.map((proyecto) => {
            const esMiembro = miembroDe.has(proyecto.id)
            const ocupado = pendiente === proyecto.id
            return (
              <div
                key={proyecto.id}
                className="flex items-center gap-2 rounded-md border border-border p-2.5"
                data-testid={`proyecto-${proyecto.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${esMiembro ? '' : 'text-muted-foreground'}`}>
                    {proyecto.nombre}
                  </p>
                  {proyecto.descripcion && (
                    <p className="truncate text-xs text-muted-foreground">{proyecto.descripcion}</p>
                  )}
                </div>
                {esMiembro && <Badge variant="secondary">Miembro</Badge>}
                {esMiembro ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive hover:text-destructive"
                    disabled={ocupado}
                    onClick={() => alternar(proyecto.id, proyecto.nombre, true)}
                  >
                    {ocupado ? <Loader2 className="size-4 animate-spin" /> : 'Quitar'}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    disabled={ocupado}
                    onClick={() => alternar(proyecto.id, proyecto.nombre, false)}
                  >
                    {ocupado ? <Loader2 className="size-4 animate-spin" /> : 'Agregar'}
                  </Button>
                )}
              </div>
            )
          })}
          {!proyectosQuery.isLoading && proyectos.length === 0 && (
            <div className="space-y-1 py-2">
              <p className="text-sm text-muted-foreground">Todavía no hay proyectos.</p>
              <p className="text-xs text-muted-foreground">
                Creá uno desde el selector de proyectos.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
