import { useAuth } from '@/context/AuthContext'
import { SeccionMiembros } from '@/components/projects/SeccionMiembros'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface GestionMiembrosProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proyectoId?: string
  nombreProyecto?: string
}

export function GestionMiembros({ open, onOpenChange, proyectoId, nombreProyecto }: GestionMiembrosProps) {
  const { perfil, proyectoActivoId } = useAuth()
  const proyectoIdEfectivo = proyectoId ?? proyectoActivoId
  const abierto = open && perfil?.rol !== 'usuario'

  if (!abierto || !proyectoIdEfectivo) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {nombreProyecto ? `Miembros · ${nombreProyecto}` : 'Miembros del proyecto'}
          </DialogTitle>
          <DialogDescription>
            Gestioná quién accede a este proyecto. Los cambios aplican de inmediato.
          </DialogDescription>
        </DialogHeader>
        <SeccionMiembros proyectoId={proyectoIdEfectivo} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
