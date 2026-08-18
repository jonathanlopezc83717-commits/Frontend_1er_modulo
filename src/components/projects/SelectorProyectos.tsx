import { useMemo, useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useAuth } from '@/context/AuthContext'
import { proyectosCollection } from '@/lib/collections'
import { etiquetaRol } from '@/lib/roles'
import { SeccionMiembros } from '@/components/projects/SeccionMiembros'
import { PanelUsuarios } from '@/components/projects/PanelUsuarios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FolderOpen, LogOut, Plus, HardHat, Pencil, Trash2, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import type { Proyecto } from '@/types'

type Vista = 'proyectos' | 'usuarios'

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
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState<Vista>('proyectos')
  const [enfocadoId, setEnfocadoId] = useState<string | null>(null)
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
  const [confirmacionTexto, setConfirmacionTexto] = useState('')

  const puedeCrear = perfil?.rol === 'administrador' || perfil?.rol === 'general'
  const esAdmin = perfil?.rol === 'administrador'

  const puedeGestionar = (proyecto: Proyecto) =>
    esAdmin || (Boolean(session?.user.id) && proyecto.creado_por === session?.user.id)

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    if (!termino) return proyectos
    return proyectos.filter(
      (proyecto) =>
        proyecto.nombre.toLowerCase().includes(termino) ||
        (proyecto.descripcion ?? '').toLowerCase().includes(termino),
    )
  }, [proyectos, busqueda])

  const enfocado = enfocadoId ? (proyectos.find((p) => p.id === enfocadoId) ?? null) : null

  const enfocarProyecto = (id: string) => {
    setEnfocadoId(id)
    setVista('proyectos')
  }

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
      if (eliminarId === enfocadoId) setEnfocadoId(null)
      setEliminarId(null)
    } catch (error) {
      toast.error(mensajeErrorAccion(error, 'No se pudo eliminar el proyecto'))
    }
    setEliminando(false)
  }

  const proyectoAEliminar = proyectos.find((p) => p.id === eliminarId) ?? null
  const textoConfirmacion = proyectoAEliminar ? `BORRAR "${proyectoAEliminar.nombre}"` : ''

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <HardHat className="size-5 shrink-0" />
        <h1 className="hidden min-w-0 truncate text-sm font-medium md:block">
          Analizador de Imágenes Ferroviarias
        </h1>
        <div className="flex-1" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar proyectos…"
          aria-label="Buscar proyectos"
          className="w-48 sm:w-64"
        />
        {puedeCrear && (
          <Button onClick={abrirDialogo}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">Proyecto nuevo</span>
          </Button>
        )}
        {esAdmin && (
          <Button
            variant={vista === 'usuarios' ? 'secondary' : 'outline'}
            onClick={() => setVista(vista === 'usuarios' ? 'proyectos' : 'usuarios')}
          >
            <UserCog className="size-4" />
            <span className="hidden sm:inline">Usuarios y roles</span>
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Proyectos
            </p>
            <Badge variant="secondary">{proyectos.length}</Badge>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {proyectos.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">Todavía no hay proyectos.</p>
            ) : filtrados.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                Ningún proyecto coincide con la búsqueda.
              </p>
            ) : (
              filtrados.map((proyecto) => (
                <button
                  key={proyecto.id}
                  type="button"
                  onClick={() => enfocarProyecto(proyecto.id)}
                  data-testid={`proyecto-${proyecto.id}`}
                  className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent ${
                    enfocado?.id === proyecto.id ? 'border-border bg-accent' : 'border-transparent'
                  }`}
                >
                  <FolderOpen className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{proyecto.nombre}</span>
                    {proyecto.descripcion && (
                      <span className="block truncate text-muted-foreground">
                        {proyecto.descripcion}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {vista === 'usuarios' && esAdmin ? (
            <div className="p-4 sm:p-6">
              <PanelUsuarios />
            </div>
          ) : proyectos.length === 0 ? (
            puedeCrear ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-muted-foreground">Todavía no hay proyectos.</p>
                <Button onClick={abrirDialogo}>
                  <Plus className="size-4" />
                  Proyecto nuevo
                </Button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div className="space-y-2 rounded-md border border-border p-4 text-center">
                  <p className="font-medium">No tenés proyectos asignados</p>
                  <p className="text-muted-foreground">
                    Contactá a un administrador para que te asigne un proyecto.
                  </p>
                </div>
              </div>
            )
          ) : !enfocado ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <FolderOpen className="size-8 text-muted-foreground" />
              <p className="text-muted-foreground">
                Elegí un proyecto de la lista para ver su detalle.
              </p>
            </div>
          ) : (
            <div className="space-y-6 p-4 sm:p-6">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{enfocado.nombre}</h2>
                  {typeof enfocado.miembros_count === 'number' && (
                    <Badge
                      variant="outline"
                      title={(enfocado.miembros_emails ?? []).join(', ')}
                    >
                      {enfocado.miembros_count}{' '}
                      {enfocado.miembros_count === 1 ? 'miembro' : 'miembros'}
                    </Badge>
                  )}
                </div>
                {enfocado.descripcion && (
                  <p className="text-muted-foreground">{enfocado.descripcion}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Creada {formatearFecha(enfocado.created_at)} · Actividad{' '}
                  {formatearHace(enfocado.updated_at ?? enfocado.created_at)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => cambiarProyecto(enfocado.id)} data-testid="abrir-proyecto">
                  <FolderOpen className="size-4" />
                  Abrir proyecto
                </Button>
                {puedeGestionar(enfocado) && (
                  <>
                    <Button variant="outline" title="Editar" onClick={() => abrirEdicion(enfocado)}>
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      title="Eliminar"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setEliminarId(enfocado.id)}
                    >
                      <Trash2 className="size-4" />
                      Eliminar
                    </Button>
                  </>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Miembros
                </h3>
                <SeccionMiembros
                  proyectoId={enfocado.id}
                  soloLectura={!puedeGestionar(enfocado)}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-border px-4">
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {perfil?.nombre || perfil?.email}
        </span>
        {perfil && <Badge variant="secondary">{etiquetaRol(perfil.rol)}</Badge>}
        <div className="flex-1" />
        <Button variant="ghost" className="text-muted-foreground" onClick={logout}>
          <LogOut className="size-4" />
          Cerrar sesión
        </Button>
      </footer>

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

      <Dialog open={eliminarId !== null} onOpenChange={(abierto) => { if (!abierto) { setEliminarId(null); setConfirmacionTexto('') } }}>
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
          {proyectoAEliminar && (
            <div className="space-y-2">
              <Label htmlFor="confirmar-eliminacion">
                Escribí <span className="font-mono font-semibold">{textoConfirmacion}</span> para confirmar
              </Label>
              <Input
                id="confirmar-eliminacion"
                value={confirmacionTexto}
                onChange={(e) => setConfirmacionTexto(e.target.value)}
                onPaste={(e) => e.preventDefault()}
                onCopy={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
                autoComplete="off"
                spellCheck={false}
                data-testid="confirmar-eliminacion-input"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEliminarId(null); setConfirmacionTexto('') }}
              disabled={eliminando}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => { setConfirmacionTexto(''); void confirmarEliminacion() }}
              disabled={eliminando || confirmacionTexto !== textoConfirmacion}
              data-testid="confirmar-eliminacion"
            >
              {eliminando ? 'Eliminando...' : 'Eliminar proyecto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
