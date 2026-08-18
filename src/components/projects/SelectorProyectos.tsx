import { useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useAuth } from '@/context/AuthContext'
import { proyectosCollection } from '@/lib/collections'
import { etiquetaRol } from '@/lib/roles'
import { GestionMiembros } from '@/components/projects/GestionMiembros'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FolderOpen, LogOut, Plus, HardHat, Pencil, Trash2, Users, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { PanelUsuarios } from '@/components/projects/PanelUsuarios'
import type { Proyecto } from '@/types'

function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  })
}

function formatearHace(fecha: string): string {
  const ms = Date.now() - new Date(fecha).getTime()
  if (ms < 60_000) return 'hace instantes'
  const minutos = Math.floor(ms / 60_000)
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias < 30) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`
  const meses = Math.floor(dias / 30)
  return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
}

function mensajeErrorAccion(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function SelectorProyectos() {
  const { perfil, session, proyectoActivoId, crearProyecto, cambiarProyecto, logout } = useAuth()
  const { data } = useLiveQuery((q) => q.from({ proyectos: proyectosCollection }))
  const proyectos = data ?? []
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [editarId, setEditarId] = useState<string | null>(null)
  const [editarNombre, setEditarNombre] = useState('')
  const [editarDescripcion, setEditarDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [eliminarId, setEliminarId] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [miembrosId, setMiembrosId] = useState<string | null>(null)
  const [panelUsuarios, setPanelUsuarios] = useState(false)

  const puedeCrear = perfil?.rol === 'administrador' || perfil?.rol === 'general'
  const esAdmin = perfil?.rol === 'administrador'

  const puedeGestionar = (proyecto: Proyecto) =>
    esAdmin || (Boolean(session?.user.id) && proyecto.creado_por === session?.user.id)

  const abrirDialogo = () => {
    setNombre('')
    setDescripcion('')
    setError(null)
    setDialogoAbierto(true)
  }

  const confirmarCreacion = async () => {
    if (!nombre.trim() || creando) return
    setCreando(true)
    setError(null)
    const resultado = await crearProyecto(nombre, descripcion)
    setCreando(false)
    if (!resultado.success) {
      setError(resultado.error || 'No se pudo crear el proyecto')
      return
    }
    setDialogoAbierto(false)
  }

  const abrirEdicion = (proyecto: Proyecto) => {
    setEditarNombre(proyecto.nombre)
    setEditarDescripcion(proyecto.descripcion ?? '')
    setEditarId(proyecto.id)
  }

  const confirmarEdicion = async () => {
    if (!editarId || !editarNombre.trim() || guardando) return
    setGuardando(true)
    const tx = proyectosCollection.update(editarId, (draft) => {
      draft.nombre = editarNombre.trim()
      draft.descripcion = editarDescripcion.trim() || null
    })
    try {
      await tx.isPersisted.promise
      toast.success('Proyecto actualizado')
      setEditarId(null)
    } catch (error) {
      toast.error(mensajeErrorAccion(error, 'No se pudo actualizar el proyecto'))
    }
    setGuardando(false)
  }

  const confirmarEliminacion = async () => {
    if (!eliminarId || eliminando) return
    setEliminando(true)
    const tx = proyectosCollection.delete(eliminarId)
    try {
      await tx.isPersisted.promise
      toast.success('Proyecto eliminado')
      if (eliminarId === proyectoActivoId) cambiarProyecto(null)
      setEliminarId(null)
    } catch (error) {
      toast.error(mensajeErrorAccion(error, 'No se pudo eliminar el proyecto'))
    }
    setEliminando(false)
  }

  const proyectoAEliminar = proyectos.find((p) => p.id === eliminarId) ?? null

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardHat className="size-6" />
            <CardTitle className="text-xl">Analizador de Imágenes Ferroviarias</CardTitle>
          </div>
          <CardDescription>
            {perfil?.nombre || perfil?.email}
            {perfil && <Badge variant="secondary" className="ml-2">{etiquetaRol(perfil.rol)}</Badge>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {proyectos.length === 0 ? (
            puedeCrear ? (
              <div className="space-y-3 text-center">
                <p className="text-muted-foreground">Todavía no hay proyectos.</p>
                <Button onClick={abrirDialogo}>
                  <Plus className="size-4" />
                  Proyecto nuevo
                </Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border border-border p-4 text-center">
                <p className="font-medium">No tenés proyectos asignados</p>
                <p className="text-muted-foreground">
                  Contactá a un administrador para que te asigne un proyecto.
                </p>
              </div>
            )
          ) : (
            <>
              <div className="space-y-2">
                {proyectos.map((proyecto) => (
                  <div
                    key={proyecto.id}
                    className="flex items-center gap-2 rounded-md border border-border p-3 transition-colors hover:bg-accent"
                  >
                    <button
                      type="button"
                      onClick={() => cambiarProyecto(proyecto.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      data-testid={`proyecto-${proyecto.id}`}
                    >
                      <FolderOpen className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{proyecto.nombre}</span>
                        {proyecto.descripcion && (
                          <span className="block truncate text-muted-foreground">{proyecto.descripcion}</span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          Creada {formatearFecha(proyecto.created_at)} · Actividad{' '}
                          {formatearHace(proyecto.updated_at ?? proyecto.created_at)}
                        </span>
                      </span>
                    </button>
                    {typeof proyecto.miembros_count === 'number' && (
                      <Badge
                        variant="outline"
                        className="shrink-0"
                        title={(proyecto.miembros_emails ?? []).join(', ')}
                      >
                        {proyecto.miembros_count} miembros
                      </Badge>
                    )}
                    {puedeGestionar(proyecto) && (
                      <span className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Editar"
                          onClick={() => abrirEdicion(proyecto)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Miembros"
                          onClick={() => setMiembrosId(proyecto.id)}
                        >
                          <Users className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          title="Eliminar"
                          onClick={() => setEliminarId(proyecto.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {puedeCrear && (
                <Button variant="outline" className="w-full" onClick={abrirDialogo}>
                  <Plus className="size-4" />
                  Proyecto nuevo
                </Button>
              )}
            </>
          )}
          {esAdmin && (
            <Button variant="outline" className="w-full" onClick={() => setPanelUsuarios(true)}>
              <UserCog className="size-4" />
              Usuarios y roles
            </Button>
          )}
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={logout}>
            <LogOut className="size-4" />
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>

      <Dialog open={panelUsuarios} onOpenChange={setPanelUsuarios}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Usuarios y roles</DialogTitle>
            <DialogDescription>
              Asigná puestos globales: Administrador, Administrador de equipo o Usuario.
            </DialogDescription>
          </DialogHeader>
          <PanelUsuarios />
        </DialogContent>
      </Dialog>

      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proyecto nuevo</DialogTitle>
            <DialogDescription>
              Creá un proyecto para organizar los puntos ferroviarios. Vas a ser su primer miembro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre-proyecto">Nombre</Label>
              <Input
                id="nombre-proyecto"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre del proyecto"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descripcion-proyecto">Descripción (opcional)</Label>
              <Input
                id="descripcion-proyecto"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Descripción del proyecto"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoAbierto(false)} disabled={creando}>
              Cancelar
            </Button>
            <Button onClick={confirmarCreacion} disabled={!nombre.trim() || creando}>
              {creando ? 'Creando...' : 'Crear proyecto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editarId !== null} onOpenChange={(abierto) => !abierto && setEditarId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar proyecto</DialogTitle>
            <DialogDescription>
              Actualizá el nombre o la descripción del proyecto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editar-nombre">Nombre</Label>
              <Input
                id="editar-nombre"
                value={editarNombre}
                onChange={(e) => setEditarNombre(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editar-descripcion">Descripción (opcional)</Label>
              <Input
                id="editar-descripcion"
                value={editarDescripcion}
                onChange={(e) => setEditarDescripcion(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditarId(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={confirmarEdicion} disabled={!editarNombre.trim() || guardando}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={eliminarId !== null} onOpenChange={(abierto) => !abierto && setEliminarId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar proyecto</DialogTitle>
            <DialogDescription>
              {proyectoAEliminar && (
                <>
                  Se ocultará el proyecto con sus {proyectoAEliminar.puntos_count ?? 0} puntos. Los
                  datos no se destruyen — un administrador puede recuperarlo.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEliminarId(null)} disabled={eliminando}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarEliminacion}
              disabled={eliminando}
              data-testid="confirmar-eliminacion"
            >
              {eliminando ? 'Eliminando...' : 'Eliminar proyecto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GestionMiembros
        open={miembrosId !== null}
        onOpenChange={(abierto) => !abierto && setMiembrosId(null)}
        proyectoId={miembrosId ?? undefined}
      />
    </div>
  )
}
