import { useEffect, useMemo, useRef, useState } from 'react'
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
import { FolderOpen, LogOut, Plus, HardHat, Pencil, Trash2, UserCog, Play, ChevronLeft, ChevronRight } from 'lucide-react'
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
  const { perfil, session, proyectoActivoId, ultimoProyectoId, crearProyecto, cambiarProyecto, logout } = useAuth()
  const { data } = useLiveQuery((q) => q.from({ proyectos: proyectosCollection }))
  const proyectos = data ?? []
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState<Vista>('proyectos')
  const [enfocadoId, setEnfocadoId] = useState<string | null>(null)
  const [bannerDescartado] = useState(false)
  const carruselRef = useRef<HTMLDivElement>(null)
  const autohideTimerRef = useRef<number | null>(null)
  const [carruselPagina, setCarruselPagina] = useState(0)
  const [carruselPuedeAntes, setCarruselPuedeAntes] = useState(false)
  const [carruselPuedeDespues, setCarruselPuedeDespues] = useState(false)
  const [carruselTotalPaginas, setCarruselTotalPaginas] = useState(1)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [carpetaNas, setCarpetaNas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [editarId, setEditarId] = useState<string | null>(null)
  const [editarNombre, setEditarNombre] = useState('')
  const [editarDescripcion, setEditarDescripcion] = useState('')
  const [editarCarpetaNas, setEditarCarpetaNas] = useState('')
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
  const ultimoProyecto = ultimoProyectoId
    ? (proyectos.find((p) => p.id === ultimoProyectoId) ?? null)
    : null

  const sincronizarCarrusel = () => {
    const el = carruselRef.current
    if (!el) return
    const anchoPagina = el.clientWidth
    if (anchoPagina === 0) return
    setCarruselPagina(Math.round(el.scrollLeft / anchoPagina))
    setCarruselPuedeAntes(el.scrollLeft > 4)
    setCarruselPuedeDespues(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    setCarruselTotalPaginas(Math.max(1, Math.ceil(el.scrollWidth / anchoPagina)))
  }

  useEffect(() => {
    sincronizarCarrusel()
  }, [filtrados.length])

  useEffect(() => {
    return () => {
      if (autohideTimerRef.current) window.clearTimeout(autohideTimerRef.current)
    }
  }, [])

  const alScrollearCarrusel = () => {
    const el = carruselRef.current
    if (!el) return
    el.classList.add('scrolleando')
    if (autohideTimerRef.current) window.clearTimeout(autohideTimerRef.current)
    autohideTimerRef.current = window.setTimeout(() => {
      el.classList.remove('scrolleando')
    }, 900)
    sincronizarCarrusel()
  }

  const desplazarCarrusel = (direccion: 1 | -1) => {
    const el = carruselRef.current
    if (!el) return
    el.scrollBy({ left: direccion * el.clientWidth, behavior: 'smooth' })
  }

  const enfocarProyecto = (id: string) => {
    setEnfocadoId(id)
    setVista('proyectos')
  }

  const abrirDialogo = () => {
    setNombre('')
    setDescripcion('')
    setCarpetaNas('')
    setError(null)
    setDialogoAbierto(true)
  }

  const confirmarCreacion = async () => {
    if (!nombre.trim() || creando) return
    setCreando(true)
    setError(null)
    const resultado = await crearProyecto(nombre, descripcion, carpetaNas)
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
    setEditarCarpetaNas(proyecto.carpeta_nas ?? '')
    setEditarId(proyecto.id)
  }

  const confirmarEdicion = async () => {
    if (!editarId || !editarNombre.trim() || guardando) return
    setGuardando(true)
    const tx = proyectosCollection.update(editarId, (draft) => {
      draft.nombre = editarNombre.trim()
      draft.descripcion = editarDescripcion.trim() || null
      draft.carpeta_nas = editarCarpetaNas.trim() || null
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
        {ultimoProyecto && (
          <Button
            onClick={() => cambiarProyecto(ultimoProyecto.id)}
            title={`Entrar a "${ultimoProyecto.nombre}"`}
            data-testid="continuar-ultimo"
          >
            <Play className="size-4" />
            <span className="hidden max-w-[140px] truncate lg:inline">{ultimoProyecto.nombre}</span>
          </Button>
        )}
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

      {ultimoProyecto && !bannerDescartado && (
        <section className="shrink-0 border-b border-primary/30 bg-primary/5 px-4 py-3" data-testid="banner-reanudar">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Última sesión — doble clic en un proyecto para abrirlo
              </p>
              <p className="truncate text-lg font-semibold">{ultimoProyecto.nombre}</p>
              {ultimoProyecto.descripcion && (
                <p className="truncate text-sm text-muted-foreground">{ultimoProyecto.descripcion}</p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Proyectos disponibles
          </p>
          <div className="flex items-center gap-2">
            {carruselTotalPaginas > 1 && (
              <div className="flex items-center gap-1" data-testid="carrusel-puntos">
                {Array.from({ length: carruselTotalPaginas }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Página ${i + 1} de proyectos`}
                    onClick={() => {
                      const el = carruselRef.current
                      if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
                    }}
                    className={`h-1.5 rounded-full transition-all ${
                      i === carruselPagina ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70'
                    }`}
                  />
                ))}
              </div>
            )}
            <Badge variant="secondary">{proyectos.length}</Badge>
          </div>
        </div>
        {proyectos.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Todavía no hay proyectos.</p>
        ) : filtrados.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            Ningún proyecto coincide con la búsqueda.
          </p>
        ) : (
          <div className="relative mt-1">
            {carruselPuedeAntes && (
              <button
                type="button"
                aria-label="Proyectos anteriores"
                onClick={() => desplazarCarrusel(-1)}
                className="absolute left-0 top-1/2 z-10 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-md transition-transform hover:scale-105"
                data-testid="carrusel-anterior"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <div
              ref={carruselRef}
              onScroll={alScrollearCarrusel}
              className="auto-hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-1 pb-2"
            >
              {filtrados.map((proyecto) => {
                const seleccionado = enfocado?.id === proyecto.id
                return (
                  <button
                    key={proyecto.id}
                    type="button"
                    onClick={() => enfocarProyecto(proyecto.id)}
                    onDoubleClick={() => cambiarProyecto(proyecto.id)}
                    data-testid={`proyecto-${proyecto.id}`}
                    aria-current={seleccionado ? 'true' : undefined}
                    className={`relative flex h-36 w-64 shrink-0 snap-start flex-col overflow-hidden rounded-xl p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring ${
                      seleccionado
                        ? 'bg-primary text-primary-foreground shadow-md ring-1 ring-primary'
                        : 'bg-card text-card-foreground'
                    }`}
                  >
                    {seleccionado && (
                      <span className="absolute inset-y-0 left-0 w-1.5 bg-primary-foreground/70" />
                    )}
                    <span className="flex items-start gap-2.5 pl-1.5">
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                          seleccionado ? 'bg-primary-foreground/15' : 'bg-primary/10'
                        }`}
                      >
                        <FolderOpen
                          className={`size-5 ${seleccionado ? 'text-primary-foreground' : 'text-primary'}`}
                        />
                      </span>
                      <span className="min-w-0 flex-1 pt-0.5">
                        <span className="block truncate text-base font-semibold leading-tight">
                          {proyecto.nombre}
                        </span>
                        <span
                          className={`block truncate text-[11px] ${
                            seleccionado ? 'text-primary-foreground/70' : 'text-muted-foreground'
                          }`}
                        >
                          {typeof proyecto.miembros_count === 'number'
                            ? `${proyecto.miembros_count} miembro${proyecto.miembros_count === 1 ? '' : 's'}`
                            : 'Creada ' + formatearFecha(proyecto.created_at)}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`mt-2 line-clamp-2 pl-1.5 text-xs leading-snug ${
                        seleccionado ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      }`}
                    >
                      {proyecto.descripcion || 'Sin descripción.'}
                    </span>
                    <span className="mt-auto pl-1.5">
                      <span
                        className={`block truncate border-t pt-1.5 text-[11px] ${
                          seleccionado
                            ? 'border-primary-foreground/25 text-primary-foreground/70'
                            : 'border-border text-muted-foreground/80'
                        }`}
                      >
                        Actividad {formatearHace(proyecto.updated_at ?? proyecto.created_at)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            {carruselPuedeDespues && (
              <button
                type="button"
                aria-label="Proyectos siguientes"
                onClick={() => desplazarCarrusel(1)}
                className="absolute right-0 top-1/2 z-10 flex size-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-md transition-transform hover:scale-105"
                data-testid="carrusel-siguiente"
              >
                <ChevronRight className="size-5" />
              </button>
            )}
          </div>
        )}
      </section>

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
                Elegí un proyecto para ver su detalle — doble clic para abrirlo.
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
            <div className="space-y-2">
              <Label htmlFor="carpeta-proyecto">Carpeta del NAS (opcional)</Label>
              <Input
                id="carpeta-proyecto"
                value={carpetaNas}
                onChange={(e) => setCarpetaNas(e.target.value)}
                placeholder="Subcarpeta relativa a la raíz del NAS, ej: Obras/Norte"
              />
              <p className="text-xs text-muted-foreground">
                Solo lectura: la app lee sus archivos y guarda snapshots, nunca los modifica.
              </p>
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
            <div className="space-y-2">
              <Label htmlFor="editar-carpeta">Carpeta del NAS (opcional)</Label>
              <Input
                id="editar-carpeta"
                value={editarCarpetaNas}
                onChange={(e) => setEditarCarpetaNas(e.target.value)}
                placeholder="Subcarpeta relativa a la raíz del NAS, ej: Obras/Norte"
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
