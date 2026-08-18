import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { cambiarRolUsuario, listarPerfiles } from '@/lib/supabase-service'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { Perfil, RolUsuario } from '@/types'

const ROLES: RolUsuario[] = ['administrador', 'general', 'usuario']

export function PanelUsuarios() {
  const { perfil, refrescarPerfil } = useAuth()
  const [usuarios, setUsuarios] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    setUsuarios(await listarPerfiles())
    setCargando(false)
  }, [])

  useEffect(() => {
    if (perfil?.rol === 'administrador') void cargar()
  }, [cargar, perfil?.rol])

  if (perfil?.rol !== 'administrador') return null

  const cambiarRol = async (userId: string, rol: RolUsuario) => {
    const respuesta = await cambiarRolUsuario(userId, rol)
    if (respuesta.success) {
      toast.success('Rol actualizado. Surte efecto en la próxima sesión del usuario.')
      if (userId === perfil.id) await refrescarPerfil()
      void cargar()
    } else {
      toast.error(respuesta.error || 'No se pudo cambiar el rol')
    }
  }

  return (
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
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        })}
        {cargando && usuarios.length === 0 && (
          <p className="text-sm text-muted-foreground">Cargando usuarios…</p>
        )}
      </CardContent>
    </Card>
  )
}
