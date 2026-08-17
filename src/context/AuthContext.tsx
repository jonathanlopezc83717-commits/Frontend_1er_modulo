import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Perfil } from '@/types'

export interface AuthContextValue {
  session: Session | null
  perfil: Perfil | null
  cargando: boolean
  login: (email: string, password: string) => Promise<{ error: string | null }>
  logout: () => Promise<void>
  refrescarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function obtenerPerfil(userId: string): Promise<Perfil | null> {
  const { data } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return (data as Perfil | null) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let ignore = false

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nuevaSession) => {
      if (ignore) return
      setSession(nuevaSession)
      setCargando(false)
      if (!nuevaSession) {
        setPerfil(null)
        return
      }
      const perfilCargado = await obtenerPerfil(nuevaSession.user.id)
      if (!ignore) setPerfil(perfilCargado)
    })

    return () => {
      ignore = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // Mensaje genérico y no enumerable (spec: Email/Password Login)
    return { error: error ? 'Credenciales inválidas' : null }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const refrescarPerfil = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      setPerfil(await obtenerPerfil(data.session.user.id))
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, perfil, cargando, login, logout, refrescarPerfil }),
    [session, perfil, cargando, login, logout, refrescarPerfil],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
