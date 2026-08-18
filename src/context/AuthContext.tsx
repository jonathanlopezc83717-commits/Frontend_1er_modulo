import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Perfil, Proyecto } from '@/types'

export interface AuthContextValue {
  session: Session | null
  perfil: Perfil | null
  proyectos: Proyecto[]
  proyectoActivoId: string | null
  cargando: boolean
  login: (email: string, password: string) => Promise<{ error: string | null }>
  logout: () => Promise<void>
  refrescarPerfil: () => Promise<void>
  crearProyecto: (nombre: string, descripcion?: string) => Promise<{ success: boolean; error?: string }>
  cambiarProyecto: (proyectoId: string | null) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const claveProyectoActivo = (userId: string) => `proyecto-activo:${userId}`

async function obtenerPerfil(userId: string): Promise<Perfil | null> {
  const { data } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return (data as Perfil | null) ?? null
}

async function obtenerProyectos(): Promise<Proyecto[]> {
  const { data, error } = await supabase.from('proyectos').select('id,nombre,descripcion,creado_por,created_at')
  if (error || !data) return []
  const proyectos = (data as Proyecto[]).slice()
  proyectos.sort((a, b) => a.nombre.localeCompare(b.nombre))
  return proyectos
}

function leerProyectoActivoValidado(userId: string, proyectos: Proyecto[]): string | null {
  const guardado = localStorage.getItem(claveProyectoActivo(userId))
  if (!guardado) return null
  if (!proyectos.some(p => p.id === guardado)) {
    localStorage.removeItem(claveProyectoActivo(userId))
    return null
  }
  return guardado
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [proyectoActivoId, setProyectoActivoId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    let ignore = false

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nuevaSession) => {
      if (ignore) return
      setSession(nuevaSession)
      if (!nuevaSession) {
        if (userIdRef.current) {
          localStorage.removeItem(claveProyectoActivo(userIdRef.current))
          userIdRef.current = null
        }
        setPerfil(null)
        setProyectos([])
        setProyectoActivoId(null)
        setCargando(false)
        return
      }
      userIdRef.current = nuevaSession.user.id
      // cargando se mantiene true hasta resolver perfil y proyectos: evita que
      // el gate muestre login un frame con sesión viva (o el picker sin datos).
      const perfilCargado = await obtenerPerfil(nuevaSession.user.id)
      if (ignore) return
      setPerfil(perfilCargado)
      if (!perfilCargado) {
        setProyectos([])
        setProyectoActivoId(null)
        setCargando(false)
        return
      }
      const proyectosCargados = await obtenerProyectos()
      if (ignore) return
      setProyectos(proyectosCargados)
      setProyectoActivoId(leerProyectoActivoValidado(nuevaSession.user.id, proyectosCargados))
      setCargando(false)
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

  const cambiarProyecto = useCallback((proyectoId: string | null) => {
    setProyectoActivoId(proyectoId)
    const userId = userIdRef.current
    if (!userId) return
    if (proyectoId) {
      localStorage.setItem(claveProyectoActivo(userId), proyectoId)
    } else {
      localStorage.removeItem(claveProyectoActivo(userId))
    }
  }, [])

  const crearProyecto = useCallback(async (nombre: string, descripcion?: string) => {
    const id = crypto.randomUUID()
    const { error } = await supabase
      .from('proyectos')
      .insert({ id, nombre: nombre.trim(), descripcion: descripcion?.trim() || null })
    if (error) return { success: false, error: error.message }

    const proyectosActualizados = await obtenerProyectos()
    setProyectos(proyectosActualizados)
    const creado = proyectosActualizados.find(p => p.id === id)
    if (creado) {
      cambiarProyecto(creado.id)
    }
    return { success: true }
  }, [cambiarProyecto])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      perfil,
      proyectos,
      proyectoActivoId,
      cargando,
      login,
      logout,
      refrescarPerfil,
      crearProyecto,
      cambiarProyecto,
    }),
    [session, perfil, proyectos, proyectoActivoId, cargando, login, logout, refrescarPerfil, crearProyecto, cambiarProyecto],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
