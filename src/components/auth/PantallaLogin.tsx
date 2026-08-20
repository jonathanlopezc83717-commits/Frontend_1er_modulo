import { useState, type FormEvent } from 'react'
import { KeyRound, LogIn, TrainFront } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export type ModoLogin = 'login' | 'primer-acceso'

export interface PantallaLoginProps {
  modo?: ModoLogin
}

const PASSWORD_MIN = 6

const CLAVE_ULTIMO_EMAIL = 'ultimo-email'
const CLAVE_RECORDAR = 'recordar-sesion'

/**
 * Pantalla de acceso. Modo "login": email + contraseña, todo error de
 * credenciales muestra el mismo mensaje genérico (anti-enumeración).
 * Modo "primer-acceso":Define la contraseña definitiva y limpia el flag
 * debe_cambiar_password (el gate cambia solo al refrescar el perfil).
 */
export function PantallaLogin({ modo = 'login' }: PantallaLoginProps) {
  const { login, refrescarPerfil, session } = useAuth()
  const [recordar, setRecordar] = useState(() => localStorage.getItem(CLAVE_RECORDAR) !== 'false')
  const [email, setEmail] = useState(() =>
    recordar ? localStorage.getItem(CLAVE_ULTIMO_EMAIL) ?? '' : '',
  )
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function manejarLogin(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    const { error: errorLogin } = await login(email, password)
    setEnviando(false)
    // Mensaje genérico no enumerable (spec: Email/Password Login)
    if (errorLogin) setError(errorLogin)
    else if (recordar) {
      localStorage.setItem(CLAVE_RECORDAR, 'true')
      localStorage.setItem(CLAVE_ULTIMO_EMAIL, email)
    } else {
      localStorage.setItem(CLAVE_RECORDAR, 'false')
      localStorage.removeItem(CLAVE_ULTIMO_EMAIL)
      // El cliente ya persistió en localStorage: purgar para que la sesión
      // viva solo en memoria de esta pestaña (storage real: sessionStorage
      // en el próximo arranque).
      for (const clave of Object.keys(localStorage)) {
        if (clave.endsWith('-auth-token')) localStorage.removeItem(clave)
      }
    }
  }

  async function manejarPrimerAcceso(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < PASSWORD_MIN) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`)
      return
    }
    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden')
      return
    }
    setEnviando(true)
    const { error: errorUpdate } = await supabase.auth.updateUser({ password })
    if (errorUpdate) {
      setEnviando(false)
      setError('No se pudo actualizar la contraseña')
      return
    }
    const { error: errorFlag } = await supabase
      .from('perfiles')
      .update({ debe_cambiar_password: false })
      .eq('id', session?.user.id ?? '')
    if (errorFlag) {
      setEnviando(false)
      setError('No se pudo registrar el cambio de contraseña')
      return
    }
    await refrescarPerfil()
    setEnviando(false)
    toast.success('Contraseña actualizada')
  }

  const esPrimerAcceso = modo === 'primer-acceso'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            {esPrimerAcceso ? (
              <KeyRound className="size-6 text-primary" />
            ) : (
              <TrainFront className="size-6 text-primary" />
            )}
          </div>
          <CardTitle>{esPrimerAcceso ? 'Establezca su contraseña' : 'Iniciar sesión'}</CardTitle>
          <CardDescription>
            {esPrimerAcceso
              ? 'Por seguridad, defina una nueva contraseña para su cuenta.'
              : 'Analizador de Imágenes Ferroviarias'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={esPrimerAcceso ? manejarPrimerAcceso : manejarLogin} className="space-y-4">
            {!esPrimerAcceso && (
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@correo.com"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">{esPrimerAcceso ? 'Nueva contraseña' : 'Contraseña'}</Label>
              <Input
                id="password"
                type="password"
                autoComplete={esPrimerAcceso ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {esPrimerAcceso && (
              <div className="space-y-2">
                <Label htmlFor="confirmacion">Confirmar contraseña</Label>
                <Input
                  id="confirmacion"
                  type="password"
                  autoComplete="new-password"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  required
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {!esPrimerAcceso && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={recordar}
                  onChange={(e) => setRecordar(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Recordar sesión en este equipo
              </label>
            )}
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? 'Procesando…' : esPrimerAcceso ? 'Guardar contraseña' : 'Ingresar'}
              {!esPrimerAcceso && !enviando && <LogIn className="size-4" />}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
