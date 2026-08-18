import { useEffect, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useAuth } from '@/context/AuthContext'
import { perfilesCollection } from '@/lib/collections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FolderInput } from 'lucide-react'
import { toast } from 'sonner'
import { etiquetaRol } from '@/lib/roles'
import { ProyectosDeUsuario } from '@/components/projects/ProyectosDeUsuario'
import type { RolUsuario } from '@/types'

const ROLES: RolUsuario[] = ['administrador', 'general', 'usuario']

function mensajeErrorRol(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : ''
  if (/row-level security|permission denied/i.test(mensaje)) return 'No tenés permiso para cambiar roles'
  return mensaje || 'No se pudo cambiar el rol'
}

export function PanelUsuarios() {
  const { perfil, refrescarPerfil } = useAuth()
  const esAdmin = perfil?.rol === 'administrador'
  const [proyectosDe, setProyectosDe] = useState<{ id: string; email: string } | null>(null)
  const [dialogoProyectos, setDialogoProyectos] = useState(false)
  const usuariosQuery = useLiveQuery(
    (q) => (esAdmin ? q.from({ perfiles: perfilesCollection }) : undefined),
    [esAdmin],
  )
  const usuarios = usuariosQuery.data ?? []

  useEffect(() => {
    if (esAdmin) void perfilesCollection.utils.refetch()
  }, [esAdmin])

  if (!esAdmin) return null

  const cambiarRol = async (userId: string, rol: RolUsuario) => {
    const tx = perfilesCollection.update(userId, (draft) => {
      draft.rol = rol
    })
    try {
      await tx.isPersisted.promise
      toast.success('Rol actualizado. Surte efecto en la próxima sesión del usuario.')
      if (userId === perfil.id) await refrescarPerfil()
    } catch (error) {
      toast.error(mensajeErrorRol(error))
    }
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-2 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Usuarios y roles</p>
            <Badge variant="secondary">{usuarios.length}</Badge>
          </div>
          {usuarios.map((usuario) => {
            const esPropio = usuario.id === perfil?.id
            return (
              <div
                key={usuario.id}
                className="flex items-center gap-2 rounded-md border border-border p-2.5"
                data-testid={`usuario-${usuario.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{usuario.email}</p>
                  {esPropio && (
                    <p className="text-xs text-muted-foreground">Vos — no podés cambiar tu propio rol</p>
                  )}
                </div>
                <Select
                  value={usuario.rol}
                  onValueChange={(v) => cambiarRol(usuario.id, v as RolUsuario)}
                  disabled={esPropio}
                >
                  <SelectTrigger className="w-[150px] shrink-0" aria-label={`Rol de ${usuario.email}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{etiquetaRol(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!esPropio && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label={`Proyectos de ${usuario.email}`}
                    title="Proyectos"
                    onClick={() => {
                      setProyectosDe({ id: usuario.id, email: usuario.email })
                      setDialogoProyectos(true)
                    }}
                  >
                    <FolderInput className="size-4" />
                  </Button>
                )}
              </div>
            )
          })}
          {usuariosQuery.isLoading && usuarios.length === 0 && (
            <p className="text-sm text-muted-foreground">Cargando usuarios…</p>
          )}
        </CardContent>
      </Card>
      {proyectosDe && (
        <ProyectosDeUsuario
          userId={proyectosDe.id}
          email={proyectosDe.email}
          open={dialogoProyectos}
          onOpenChange={setDialogoProyectos}
        />
      )}
    </>
  )
}
