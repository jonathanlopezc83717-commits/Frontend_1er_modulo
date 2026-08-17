import type { ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'
import { ThinkingLoader } from '@/components/ThinkingLoader'
import { PantallaLogin } from '@/components/auth/PantallaLogin'

/**
 * Gate de autenticación en la raíz (render condicional, sin router):
 * cargando -> loader · sin sesión -> login · debe_cambiar_password ->
 * primer-acceso · resto -> la app (children: AppProvider + Toaster + App).
 * Si existe sesión pero el perfil no se pudo cargar, se vuelve al login
 * (re-intentar el login re-consulta el perfil).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { cargando, session, perfil } = useAuth()

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <ThinkingLoader message="Verificando sesión..." />
      </div>
    )
  }
  if (!session || perfil === null) {
    return <PantallaLogin />
  }
  if (perfil.debe_cambiar_password) {
    return <PantallaLogin modo="primer-acceso" />
  }
  return <>{children}</>
}
