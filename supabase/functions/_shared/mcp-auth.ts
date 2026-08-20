import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
  })
}

export function authError(message: string, status = 401): Response {
  return json({ error: message }, status)
}

export function extractJwt(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

export async function requireEnv(
  keys: readonly string[]
): Promise<{ ok: true; values: Record<string, string> } | { ok: false; response: Response }> {
  const missing: string[] = []
  const values: Record<string, string> = {}
  for (const key of keys) {
    const value = Deno.env.get(key)
    if (!value) missing.push(key)
    else values[key] = value
  }
  if (missing.length > 0) {
    return {
      ok: false,
      response: authError(
        `Variables de entorno no configuradas: ${missing.join(', ')}`,
        500
      ),
    }
  }
  return { ok: true, values }
}

export async function requireMcpUser(
  req: Request,
  proyectoId: string
): Promise<{ userId: string; email: string; proyectoId: string } | { response: Response }> {
  const jwt = extractJwt(req)
  if (!jwt) return { response: authError('Falta Authorization: Bearer <jwt>') }

  if (!proyectoId || !isUuid(proyectoId)) {
    return { response: json({ error: 'proyecto_id requerido (debe ser UUID)' }, 400) }
  }

  const env = await requireEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (!env.ok) return { response: env.response }

  const anon = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await anon.auth.getUser(jwt)
  if (userError || !userData?.user) {
    return { response: authError('JWT inválido o expirado') }
  }

  const userId = userData.user.id
  const email = userData.user.email ?? ''

  const { data: isMcp, error: rpcError } = await anon.rpc('fn_es_mcp', { uid: userId })
  if (rpcError || isMcp !== true) {
    return { response: authError('rol no autorizado (mcp requerido)') }
  }

  const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: member, error: memberError } = await admin
    .from('proyecto_miembros')
    .select('proyecto_id')
    .eq('proyecto_id', proyectoId)
    .eq('user_id', userId)
    .maybeSingle()
  if (memberError) {
    return { response: json({ error: `Error verificando membresía: ${memberError.message}` }, 500) }
  }
  if (!member) {
    return { response: json({ error: 'mcp_no_miembro_proyecto', proyecto_id: proyectoId }, 403) }
  }

  return { userId, email, proyectoId }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function requireAdminOrGeneral(
  req: Request
): Promise<{ userId: string; email: string; rol: 'administrador' | 'general' } | { response: Response }> {
  const jwt = extractJwt(req)
  if (!jwt) return { response: authError('Falta Authorization: Bearer <jwt>') }

  const env = await requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (!env.ok) return { response: env.response }

  const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await admin.auth.getUser(jwt)
  if (userError || !userData?.user) {
    return { response: authError('JWT inválido o expirado') }
  }

  const userId = userData.user.id
  const email = userData.user.email ?? ''

  const { data: profile, error: profileError } = await admin
    .from('perfiles')
    .select('rol')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    return { response: authError('Perfil no encontrado') }
  }

  if (profile.rol !== 'administrador' && profile.rol !== 'general') {
    return { response: authError('rol no autorizado (administrador o general requerido)', 403) }
  }

  return { userId, email, rol: profile.rol }
}
