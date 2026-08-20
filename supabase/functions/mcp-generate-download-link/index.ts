import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import {
  CORS_HEADERS,
  authError,
  json,
  requireEnv,
  requireAdminOrGeneral,
} from '../_shared/mcp-auth.ts'
import { BUCKETS } from '../_shared/mcp-buckets.ts'
import { signUrl, fullPathToStoragePath } from '../_shared/mcp-storage.ts'

const MIN_TTL_SECONDS = 60
const MAX_TTL_SECONDS = 60 * 60 * 24 * 7
const DEFAULT_TTL_SECONDS = 60 * 60 * 24

interface RequestBody {
  path: string
  ttlSeconds?: number
}

function extractBucketPrefix(path: string): string {
  const i = path.indexOf('/')
  return i < 0 ? path : path.slice(0, i)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405)
  }

  const auth = await requireAdminOrGeneral(req)
  if ('response' in auth) return auth.response

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return authError('Cuerpo de la petición no es JSON válido', 400)
  }

  if (typeof body.path !== 'string' || body.path.trim().length === 0) {
    return json({ error: 'path requerido (string no vacío)' }, 400)
  }

  const trimmedPath = body.path.trim()
  const bucketPrefix = extractBucketPrefix(trimmedPath)
  if (bucketPrefix !== BUCKETS.FICHAS) {
    return json(
      {
        error: 'mcp_download_link_forbidden_bucket',
        message: `Solo mcp-fichas admite signed URL. Recibido: ${bucketPrefix}`,
      },
      403
    )
  }

  if (!trimmedPath.startsWith(`${BUCKETS.FICHAS}/`)) {
    return json(
      {
        error: 'mcp_download_link_invalid_path',
        message: `path debe empezar con ${BUCKETS.FICHAS}/`,
      },
      400
    )
  }

  const proyectoSegment = trimmedPath.slice(`${BUCKETS.FICHAS}/`.length).split('/')[0]
  if (!isUuid(proyectoSegment)) {
    return json(
      {
        error: 'mcp_download_link_invalid_path',
        message: 'primer segmento tras mcp-fichas/ debe ser UUID de proyecto',
      },
      400
    )
  }

  let ttlSeconds = DEFAULT_TTL_SECONDS
  if (body.ttlSeconds !== undefined && body.ttlSeconds !== null) {
    if (typeof body.ttlSeconds !== 'number' || !Number.isFinite(body.ttlSeconds)) {
      return json({ error: 'ttl_fuera_de_rango', min: MIN_TTL_SECONDS, max: MAX_TTL_SECONDS }, 400)
    }
    if (body.ttlSeconds < MIN_TTL_SECONDS || body.ttlSeconds > MAX_TTL_SECONDS) {
      return json({ error: 'ttl_fuera_de_rango', min: MIN_TTL_SECONDS, max: MAX_TTL_SECONDS, received: body.ttlSeconds }, 400)
    }
    ttlSeconds = Math.floor(body.ttlSeconds)
  }

  const env = await requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (!env.ok) return env.response

  const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const storagePath = fullPathToStoragePath(trimmedPath, BUCKETS.FICHAS)

  let signedUrl: string
  try {
    signedUrl = await signUrl(admin, BUCKETS.FICHAS, storagePath, ttlSeconds)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo firmar la URL'
    return json({ error: 'mcp_download_link_sign_failed', detail: message }, 500)
  }

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
  return json({ signedUrl, expiresAt }, 200)
})
