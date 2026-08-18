import { useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useAuth } from '@/context/AuthContext'
import { proyectosCollection } from '@/lib/collections'
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
import { FolderOpen, LogOut, Plus, HardHat } from 'lucide-react'

export function SelectorProyectos() {
  const { perfil, crearProyecto, cambiarProyecto, logout } = useAuth()
  const { data } = useLiveQuery((q) => q.from({ proyectos: proyectosCollection }))
  const proyectos = data ?? []
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  const puedeCrear = perfil?.rol === 'administrador' || perfil?.rol === 'general'

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
            {perfil && <Badge variant="secondary" className="ml-2">{perfil.rol}</Badge>}
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
                  <button
                    key={proyecto.id}
                    type="button"
                    onClick={() => cambiarProyecto(proyecto.id)}
                    className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-accent"
                    data-testid={`proyecto-${proyecto.id}`}
                  >
                    <FolderOpen className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{proyecto.nombre}</span>
                      {proyecto.descripcion && (
                        <span className="block truncate text-muted-foreground">{proyecto.descripcion}</span>
                      )}
                    </span>
                  </button>
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
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={logout}>
            <LogOut className="size-4" />
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>

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
    </div>
  )
}
