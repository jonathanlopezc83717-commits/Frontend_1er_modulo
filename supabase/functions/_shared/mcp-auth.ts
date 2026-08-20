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
  req: Request
): Promise<{ userId: string; email: string } | { response: Response }> {
  const jwt = extractJwt(req)
  if (!jwt) return { response: authError('Falta Authorization: Bearer <jwt>') }

  const env = await requireEnv(['SUPABASE_URL', 'SUPABASE_ANON_KEY'])
  if (!env.ok) return { response: env.response }

  const supabase = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
  if (userError || !userData?.user) {
    return { response: authError('JWT inválido o expirado') }
  }

  const userId = userData.user.id
  const email = userData.user.email ?? ''

  const { data: isMcp, error: rpcError } = await supabase.rpc('fn_es_mcp', { uid: userId })
  if (rpcError || isMcp !== true) {
    return { response: authError('rol no autorizado (mcp requerido)') }
  }

  return { userId, email }
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
