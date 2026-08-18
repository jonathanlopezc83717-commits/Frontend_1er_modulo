import { useEffect, useMemo, useState } from 'react'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useAuth } from '@/context/AuthContext'
import { getMiembrosCollection, perfilesCollection, proyectosCollection } from '@/lib/collections'
import { etiquetaRol } from '@/lib/roles'
import type { MiembroProyecto } from '@/lib/supabase-service'
import { DialogoInvitar } from '@/components/projects/DialogoInvitar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

interface SeccionMiembrosProps {
  proyectoId: string
  soloLectura?: boolean
}

function mensajeErrorAccion(error: unknown, fallback: string): string {
  const mensaje = error instanceof Error ? error.message : ''
  if (/duplicate key/i.test(mensaje)) return 'El usuario ya es miembro del proyecto'
  if (/row-level security|permission denied/i.test(mensaje)) return 'No tenés permiso para esta acción'
  return mensaje || fallback
}

export function SeccionMiembros({ proyectoId, soloLectura = false }: SeccionMiembrosProps) {
  const { perfil, session } = useAuth()
  const [seleccionado, setSeleccionado] = useState('')
  const [dialogoInvitar, setDialogoInvitar] = useState(false)

  const esAdmin = perfil?.rol === 'administrador'
  const miembrosCollection = getMiembrosCollection(proyectoId)

  const miembrosQuery = useLiveQuery(
    (q) => q.from({ miembros: miembrosCollection }),
    [miembrosCollection],
  )
  const perfilesQuery = useLiveQuery(
    (q) => (esAdmin ? q.from({ perfiles: perfilesCollection }) : undefined),
    [esAdmin],
  )
  const joinQuery = useLiveQuery(
    (q) =>
      esAdmin
        ? q
            .from({ miembros: miembrosCollection })
            .join({ perfiles: perfilesCollection }, ({ miembros, perfiles }) => eq(miembros.user_id, perfiles.id))
            .select(({ miembros, perfiles }) => ({
              user_id: miembros.user_id,
              creado_por: miembros.creado_por,
              creado_en: miembros.creado_en,
              email: perfiles.email,
              nombre: perfiles.nombre,
              rol: perfiles.rol,
            }))
        : undefined,
    [miembrosCollection, esAdmin],
  )

  useEffect(() => {
    void miembrosCollection.utils.refetch()
    if (esAdmin) void perfilesCollection.utils.refetch()
  }, [miembrosCollection, esAdmin])

  const miembros = useMemo(() => miembrosQuery.data ?? [], [miembrosQuery.data])
  const filas: MiembroProyecto[] =
    esAdmin && joinQuery.data
      ? joinQuery.data.map((f) => ({
          user_id: f.user_id,
          creado_por: f.creado_por ?? '',
          creado_en: f.creado_en ?? '',
          email: f.email ?? null,
          nombre: f.nombre ?? null,
          rol: f.rol ?? null,
        }))
      : miembros
  const candidatos = useMemo(() => {
    const ids = new Set(miembros.map((m) => m.user_id))
    return (perfilesQuery.data ?? []).filter((p) => !ids.has(p.id))
  }, [miembros, perfilesQuery.data])

  const refrescarCondados = () => {
    void proyectosCollection.utils.refetch()
    if (esAdmin) void perfilesCollection.utils.refetch()
  }

  const quitar = async (userId: string) => {
    const tx = miembrosCollection.delete(userId)
    try {
      await tx.isPersisted.promise
      toast.success('Miembro quitado del proyecto')
      refrescarCondados()
    } catch (error) {
      toast.error(mensajeErrorAccion(error, 'No se pudo quitar al miembro'))
    }
  }

  const agregar = async () => {
    if (!seleccionado) return
    const elegido = (perfilesQuery.data ?? []).find((p) => p.id === seleccionado)
    const tx = miembrosCollection.insert({
      user_id: seleccionado,
      creado_por: session?.user.id ?? '',
      creado_en: new Date().toISOString(),
      email: elegido?.email ?? null,
      nombre: elegido?.nombre ?? null,
      rol: elegido?.rol ?? null,
    })
    try {
      await tx.isPersisted.promise
      toast.success('Miembro agregado al proyecto')
      setSeleccionado('')
      refrescarCondados()
    } catch (error) {
      toast.error(mensajeErrorAccion(error, 'No se pudo agregar al miembro'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {miembrosQuery.isLoading && filas.length === 0 && (
          <p className="text-sm text-muted-foreground">Cargando miembros…</p>
        )}
        {filas.map((miembro) => (
          <div
            key={miembro.user_id}
            className="flex items-center gap-2 rounded-md border border-border p-2.5"
            data-testid={`miembro-${miembro.user_id}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {miembro.email || `Miembro ${miembro.user_id.slice(0, 8)}`}
              </p>
              {miembro.nombre && (
                <p className="truncate text-xs text-muted-foreground">{miembro.nombre}</p>
              )}
            </div>
            {miembro.rol && <Badge variant="secondary">{etiquetaRol(miembro.rol)}</Badge>}
            {!soloLectura && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-destructive hover:text-destructive"
                onClick={() => quitar(miembro.user_id)}
                title="Quitar del proyecto"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        ))}
        {!miembrosQuery.isLoading && filas.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay miembros.</p>
        )}
      </div>
      {esAdmin && !soloLectura && (
        <div className="space-y-2">
          <Label>Agregar usuario existente</Label>
          <div className="flex gap-2">
            <Select value={seleccionado} onValueChange={setSeleccionado}>
              <SelectTrigger className="flex-1" aria-label="Usuario a agregar">
                <SelectValue
                  placeholder={
                    candidatos.length === 0
                      ? 'Todos los usuarios ya son miembros'
                      : 'Elegir usuario'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {candidatos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={agregar} disabled={!seleccionado}>
              Agregar
            </Button>
          </div>
        </div>
      )}
      {!soloLectura && (
        <Button variant="outline" onClick={() => setDialogoInvitar(true)}>
          <UserPlus className="size-4" />
          Invitar usuario nuevo
        </Button>
      )}
      <DialogoInvitar
        open={dialogoInvitar}
        onOpenChange={setDialogoInvitar}
        proyectoId={proyectoId}
        onInvitado={() => {
          void miembrosCollection.utils.refetch()
          refrescarCondados()
        }}
      />
    </div>
  )
}
