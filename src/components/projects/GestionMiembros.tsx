import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  agregarMiembroProyecto,
  listarMiembrosProyecto,
  listarPerfiles,
  quitarMiembroProyecto,
  type MiembroProyecto,
} from '@/lib/supabase-service'
import { DialogoInvitar } from '@/components/projects/DialogoInvitar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { Perfil } from '@/types'

interface GestionMiembrosProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GestionMiembros({ open, onOpenChange }: GestionMiembrosProps) {
  const { perfil, session, proyectoActivoId } = useAuth()
  const [miembros, setMiembros] = useState<MiembroProyecto[]>([])
  const [candidatos, setCandidatos] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(false)
  const [seleccionado, setSeleccionado] = useState('')
  const [dialogoInvitar, setDialogoInvitar] = useState(false)

  const esAdmin = perfil?.rol === 'administrador'

  const cargar = useCallback(async () => {
    if (!proyectoActivoId) return
    setCargando(true)
    const lista = await listarMiembrosProyecto(proyectoActivoId)
    setMiembros(lista)
    if (perfil?.rol === 'administrador') {
      const ids = new Set(lista.map((m) => m.user_id))
      const perfiles = await listarPerfiles()
      setCandidatos(perfiles.filter((p) => !ids.has(p.id)))
    }
    setCargando(false)
  }, [proyectoActivoId, perfil?.rol])

  useEffect(() => {
    if (open && perfil?.rol !== 'usuario') void cargar()
  }, [open, cargar, perfil?.rol])

  if (!open || perfil?.rol === 'usuario' || !proyectoActivoId) return null

  const quitar = async (userId: string) => {
    const respuesta = await quitarMiembroProyecto(proyectoActivoId, userId)
    if (respuesta.success) {
      toast.success('Miembro quitado del proyecto')
      void cargar()
    } else {
      toast.error(respuesta.error || 'No se pudo quitar al miembro')
    }
  }

  const agregar = async () => {
    if (!seleccionado) return
    const respuesta = await agregarMiembroProyecto(proyectoActivoId, seleccionado, session?.user.id ?? '')
    if (respuesta.success) {
      toast.success('Miembro agregado al proyecto')
      setSeleccionado('')
      void cargar()
    } else {
      toast.error(respuesta.error || 'No se pudo agregar al miembro')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Miembros del proyecto</DialogTitle>
            <DialogDescription>
              Gestioná quién accede a este proyecto. Los cambios aplican de inmediato.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              {cargando && miembros.length === 0 && (
                <p className="text-sm text-muted-foreground">Cargando miembros…</p>
              )}
              {miembros.map((miembro) => (
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
                  {miembro.rol && <Badge variant="secondary">{miembro.rol}</Badge>}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => quitar(miembro.user_id)}
                    title="Quitar del proyecto"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {!cargando && miembros.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay miembros.</p>
              )}
            </div>
            {esAdmin && (
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button onClick={() => setDialogoInvitar(true)}>
              <UserPlus className="size-4" />
              Invitar usuario nuevo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DialogoInvitar
        open={dialogoInvitar}
        onOpenChange={setDialogoInvitar}
        proyectoId={proyectoActivoId}
        onInvitado={() => void cargar()}
      />
    </>
  )
}
