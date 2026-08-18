import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { agregarMiembroProyecto, invitarUsuario } from '@/lib/supabase-service'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, Copy, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { etiquetaRol } from '@/lib/roles'
import type { RolUsuario } from '@/types'

interface DialogoInvitarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proyectoId: string | null
  onInvitado?: () => void
}

const ROLES: RolUsuario[] = ['administrador', 'general', 'usuario']

export function DialogoInvitar({ open, onOpenChange, proyectoId, onInvitado }: DialogoInvitarProps) {
  const { perfil, session } = useAuth()
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<RolUsuario>('usuario')
  const [error, setError] = useState<string | null>(null)
  const [invitando, setInvitando] = useState(false)
  const [resultado, setResultado] = useState<{
    email: string
    passwordTemporal: string
    asignado: boolean
  } | null>(null)

  const esAdmin = perfil?.rol === 'administrador'

  useEffect(() => {
    if (open) {
      setEmail('')
      setRol('usuario')
      setError(null)
      setResultado(null)
    }
  }, [open])

  const confirmar = async () => {
    const emailLimpio = email.trim()
    if (!emailLimpio || invitando) return
    setInvitando(true)
    setError(null)
    const respuesta = await invitarUsuario(emailLimpio, rol)
    if (!respuesta.success || !respuesta.passwordTemporal) {
      setInvitando(false)
      setError(respuesta.error || 'No se pudo invitar al usuario')
      return
    }
    let asignado = false
    if (proyectoId && respuesta.userId) {
      const agregado = await agregarMiembroProyecto(proyectoId, respuesta.userId, session?.user.id ?? '')
      asignado = agregado.success
      if (!agregado.success) {
        toast.warning('Usuario creado, pero no se pudo asignar al proyecto')
      }
    }
    setInvitando(false)
    setResultado({ email: emailLimpio, passwordTemporal: respuesta.passwordTemporal, asignado })
    onInvitado?.()
  }

  const copiar = async () => {
    if (!resultado || !navigator.clipboard) return
    await navigator.clipboard.writeText(resultado.passwordTemporal)
    toast.success('Password copiado')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          {!resultado && (
            <DialogDescription>
              Creás la cuenta y compartís el password temporal con la persona invitada.
            </DialogDescription>
          )}
        </DialogHeader>
        {resultado ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Usuario invitado</p>
              <p className="font-medium" data-testid="email-invitado">{resultado.email}</p>
              {resultado.asignado && (
                <Badge variant="secondary" className="mt-1">Agregado como miembro del proyecto</Badge>
              )}
            </div>
            <div className="space-y-2">
              <Label>Password temporal</Label>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm"
                  data-testid="password-temporal"
                >
                  {resultado.passwordTemporal}
                </code>
                <Button variant="outline" size="icon" onClick={copiar} title="Copiar password">
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="flex items-start gap-1.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Se muestra una sola vez: copialo y compartilo de forma segura. La persona invitada
                deberá cambiarlo al ingresar por primera vez.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Listo</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-invitado-input">Email</Label>
                <Input
                  id="email-invitado-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Rol</Label>
                {esAdmin ? (
                  <Select value={rol} onValueChange={(v) => setRol(v as RolUsuario)}>
                    <SelectTrigger aria-label="Rol inicial">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{etiquetaRol(r)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Se invitará con rol <Badge variant="secondary" className="mx-1">usuario</Badge>
                  </p>
                )}
              </div>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={invitando}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={!email.trim() || invitando}>
                <UserPlus className="size-4" />
                {invitando ? 'Invitando...' : 'Invitar'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
