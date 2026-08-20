import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import {
  CORS_HEADERS,
  authError,
  json,
  requireEnv,
  requireMcpUser,
} from '../_shared/mcp-auth.ts'
import {
  BUCKETS,
  type McpBucket,
  type McpUploadKind,
} from '../_shared/mcp-buckets.ts'

const RPC_TIMEOUT_MS = 60_000
const RPC_CONCURRENCY = 5
const MAX_PHOTO_REFS = 50
const MAX_NAME_LENGTH = 500
const MAX_SLUG_LENGTH = 200
const MAX_BATCH_SIZE = 100
const VALID_KINDS: readonly McpUploadKind[] = ['foto', 'croquis', 'documento', 'referencia']

interface McpPuntoInput {
  name: string
  slug: string
  x: number
  y: number
  z?: number | null
  photo_refs?: string[]
  croquis_ref?: string | null
}

interface RequestBody {
  proyecto_id: string
  puntos: McpPuntoInput[]
}

interface PuntoError {
  slug?: string
  ref?: string
  reason: string
  detail?: string
}

interface PuntoResult {
  id: string
  slug: string
  created: boolean
}

type PuntoTaskResult =
  | { ok: true; result: PuntoResult }
  | { ok: false; error: PuntoError }

interface RpcRow {
  id: string
  created: boolean
  slug_out: string
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseBucket(path: string): McpBucket | null {
  for (const b of [BUCKETS.EVIDENCIA, BUCKETS.FICHAS, BUCKETS.REFERENCIAS] as McpBucket[]) {
    if (path.startsWith(`${b}/`)) return b
  }
  return null
}

function parseKindFromPath(path: string): McpUploadKind | null {
  const bucket = parseBucket(path)
  if (!bucket) return null
  const parts = path.slice(`${bucket}/`.length).split('/')
  if (parts.length < 5) return null
  const candidate = parts[3]
  return VALID_KINDS.includes(candidate as McpUploadKind) ? (candidate as McpUploadKind) : null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

async function pool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

async function invokeUpsertPunto(
  supabaseUrl: string,
  payload: Record<string, unknown>,
  jwt: string
): Promise<{ id: string; created: boolean; slug_out: string }> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/mcp_upsert_punto_por_slug`, {
    method: 'POST',
    headers: {
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_payload: payload }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  })
  const raw = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const apiMsg =
      (raw as { message?: string } | null)?.message ??
      (raw as { error?: string } | null)?.error ??
      `RPC HTTP ${res.status}`
    throw new Error(typeof apiMsg === 'string' ? apiMsg : JSON.stringify(apiMsg))
  }
  const rows = Array.isArray(raw) ? (raw as RpcRow[]) : null
  if (!rows || rows.length === 0 || typeof rows[0]?.id !== 'string') {
    throw new Error('RPC no devolvió filas')
  }
  return {
    id: rows[0].id,
    created: rows[0].created === true,
    slug_out: typeof rows[0].slug_out === 'string' ? rows[0].slug_out : '',
  }
}

interface PuntoProcessArgs {
  admin: ReturnType<typeof createClient>
  supabaseUrl: string
  jwt: string
  punto: McpPuntoInput
  proyectoId: string
  userId: string
}

async function processPunto(args: PuntoProcessArgs): Promise<PuntoTaskResult> {
  const { admin, supabaseUrl, jwt, punto, proyectoId, userId } = args
  let rpcResult: { id: string; created: boolean; slug_out: string }
  try {
    rpcResult = await invokeUpsertPunto(
      supabaseUrl,
      {
        slug: punto.slug,
        name: punto.name,
        x: punto.x,
        y: punto.y,
        z: punto.z ?? null,
        proyecto_id: proyectoId,
      },
      jwt
    )
  } catch (err) {
    return {
      ok: false,
      error: {
        slug: punto.slug,
        reason: 'rpc_failed',
        detail: err instanceof Error ? err.message : 'unknown',
      },
    }
  }

  const linkRefs: string[] = [
    ...(punto.photo_refs ?? []),
    ...(punto.croquis_ref ? [punto.croquis_ref] : []),
  ]
  if (linkRefs.length === 0) {
    return {
      ok: true,
      result: { id: rpcResult.id, slug: rpcResult.slug_out || punto.slug, created: rpcResult.created },
    }
  }

  const linkRows: Array<Record<string, unknown>> = []
  for (const ref of linkRefs) {
    const bucket = parseBucket(ref)
    const kind = parseKindFromPath(ref)
    if (!bucket || !kind) {
      return {
        ok: false,
        error: {
          slug: punto.slug,
          ref,
          reason: 'ref_path_invalido',
          detail: 'no se pudo derivar bucket/kind del path',
        },
      }
    }
    let mimeType: string | null = null
    let sizeBytes: number | null = null
    try {
      const { data: meta, error: metaError } = await admin.storage.from(bucket).getMetadata(ref)
      if (!metaError && meta) {
        mimeType = (meta as { mimetype?: string | null }).mimetype ?? null
        sizeBytes = (meta as { size?: number | null }).size ?? null
      }
    } catch (metaErr) {
      console.warn('getMetadata failed for', bucket, ref, metaErr)
    }
    linkRows.push({
      punto_id: rpcResult.id,
      storage_path: ref,
      bucket,
      kind,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      subido_por: userId,
    })
  }

  const { error: linkError } = await admin.from('puntos_archivos').insert(linkRows)
  if (linkError) {
    return {
      ok: false,
      error: {
        slug: punto.slug,
        reason: 'puntos_archivos_insert_failed',
        detail: linkError.message,
      },
    }
  }

  return {
    ok: true,
    result: { id: rpcResult.id, slug: rpcResult.slug_out || punto.slug, created: rpcResult.created },
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405)
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: 'Cuerpo de la petición no es JSON válido' }, 400)
  }

  if (!isUuid(body?.proyecto_id)) {
    return json({ error: 'proyecto_id requerido (debe ser UUID)' }, 400)
  }
  if (!Array.isArray(body.puntos) || body.puntos.length === 0) {
    return json({ error: 'puntos debe ser un arreglo no vacío' }, 400)
  }
  if (body.puntos.length > MAX_BATCH_SIZE) {
    return json(
      { error: 'demasiados_puntos', max: MAX_BATCH_SIZE, received: body.puntos.length },
      413
    )
  }

  const auth = await requireMcpUser(req, body.proyecto_id)
  if ('response' in auth) return auth.response

  const errores: PuntoError[] = []
  const validPuntos: McpPuntoInput[] = []

  for (const [idx, raw] of body.puntos.entries()) {
    if (!raw || typeof raw !== 'object') {
      errores.push({ reason: 'punto no es objeto', detail: `index=${idx}` })
      continue
    }
    const p = raw as Record<string, unknown>
    if (!isNonEmptyString(p.slug) || p.slug.length > MAX_SLUG_LENGTH) {
      errores.push({ reason: 'slug inválido', detail: `index=${idx}: 1..${MAX_SLUG_LENGTH} chars` })
      continue
    }
    if (p.slug.includes('/') || p.slug.includes(' ') || p.slug.includes('\\')) {
      errores.push({ slug: p.slug, reason: 'slug contiene caracteres no permitidos (/, espacio, \\)' })
      continue
    }
    if (!isNonEmptyString(p.name) || p.name.length > MAX_NAME_LENGTH) {
      errores.push({ slug: p.slug, reason: 'name inválido', detail: `1..${MAX_NAME_LENGTH} chars` })
      continue
    }
    if (!isFiniteNumber(p.x)) {
      errores.push({ slug: p.slug, reason: 'x debe ser número finito' })
      continue
    }
    if (!isFiniteNumber(p.y)) {
      errores.push({ slug: p.slug, reason: 'y debe ser número finito' })
      continue
    }
    if (p.z !== undefined && p.z !== null && !isFiniteNumber(p.z)) {
      errores.push({ slug: p.slug, reason: 'z debe ser número finito o null' })
      continue
    }
    let photoRefs: string[] | undefined
    if (p.photo_refs !== undefined) {
      if (!Array.isArray(p.photo_refs)) {
        errores.push({ slug: p.slug, reason: 'photo_refs debe ser array' })
        continue
      }
      if (p.photo_refs.length > MAX_PHOTO_REFS) {
        errores.push({ slug: p.slug, reason: `photo_refs excede ${MAX_PHOTO_REFS} elementos` })
        continue
      }
      const refs: string[] = []
      let badRef = false
      for (const ref of p.photo_refs) {
        if (!isNonEmptyString(ref) || !parseBucket(ref)) {
          errores.push({ slug: p.slug, ref: String(ref), reason: 'photo_ref inválido (debe empezar con mcp-evidencia/ o mcp-referencias/)' })
          badRef = true
          break
        }
        refs.push(ref)
      }
      if (badRef) continue
      photoRefs = refs
    }
    let croquisRef: string | null | undefined
    if (p.croquis_ref !== undefined && p.croquis_ref !== null) {
      if (!isNonEmptyString(p.croquis_ref) || !p.croquis_ref.startsWith(`${BUCKETS.EVIDENCIA}/`)) {
        errores.push({ slug: p.slug, reason: 'croquis_ref debe ser string con prefijo mcp-evidencia/' })
        continue
      }
      croquisRef = p.croquis_ref
    } else if (p.croquis_ref === null) {
      croquisRef = null
    }

    validPuntos.push({
      name: p.name,
      slug: p.slug,
      x: p.x,
      y: p.y,
      z: p.z === undefined ? undefined : (p.z as number | null),
      photo_refs: photoRefs,
      croquis_ref: croquisRef,
    })
  }

  if (validPuntos.length === 0) {
    return json({ creados: 0, actualizados: 0, errores, ids: [] }, 200)
  }

  const env = await requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (!env.ok) return env.response
  const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const allRefs: string[] = []
  const refBuckets = new Map<string, McpBucket>()
  for (const p of validPuntos) {
    const refs = [
      ...(p.photo_refs ?? []),
      ...(p.croquis_ref ? [p.croquis_ref] : []),
    ]
    for (const ref of refs) {
      const bucket = parseBucket(ref)
      if (!bucket) continue
      if (!allRefs.includes(ref)) {
        allRefs.push(ref)
        refBuckets.set(ref, bucket)
      }
    }
  }

  const refExists = new Map<string, boolean>()
  if (allRefs.length > 0) {
    const byBucket = new Map<McpBucket, string[]>()
    for (const ref of allRefs) {
      const bucket = refBuckets.get(ref)!
      if (!byBucket.has(bucket)) byBucket.set(bucket, [])
      byBucket.get(bucket)!.push(ref)
    }
    for (const [bucket, paths] of byBucket.entries()) {
      const { data, error } = await admin.storage.from(bucket).exists(paths)
      if (error || !Array.isArray(data)) {
        for (const path of paths) refExists.set(path, false)
        continue
      }
      for (let i = 0; i < paths.length; i++) {
        refExists.set(paths[i], data[i] === true)
      }
    }
  }

  const puntosToProcess: McpPuntoInput[] = []
  for (const p of validPuntos) {
    const refs = [
      ...(p.photo_refs ?? []),
      ...(p.croquis_ref ? [p.croquis_ref] : []),
    ]
    let anyMissing = false
    let firstMissingRef = ''
    for (const ref of refs) {
      if (refExists.get(ref) === false) {
        anyMissing = true
        firstMissingRef = ref
        break
      }
    }
    if (anyMissing) {
      errores.push({
        slug: p.slug,
        ref: firstMissingRef,
        reason: 'storage_path_not_found',
      })
    } else {
      puntosToProcess.push(p)
    }
  }

  if (puntosToProcess.length === 0) {
    return json({ creados: 0, actualizados: 0, errores, ids: [] }, 200)
  }

  const jwtHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
  const jwt = jwtHeader?.startsWith('Bearer ')
    ? jwtHeader.slice('Bearer '.length).trim()
    : null
  if (!jwt) return authError('JWT desapareció tras requireMcpUser (inesperado)')

  const taskResults = await pool(puntosToProcess, RPC_CONCURRENCY, (p) =>
    processPunto({
      admin,
      supabaseUrl: env.values.SUPABASE_URL,
      jwt,
      punto: p,
      proyectoId: auth.proyectoId,
      userId: auth.userId,
    })
  )

  let creados = 0
  let actualizados = 0
  const ids: string[] = []
  for (const r of taskResults) {
    if (r.ok) {
      if (r.result.created) creados++
      else actualizados++
      ids.push(r.result.id)
    } else {
      errores.push(r.error)
    }
  }

  return json({ creados, actualizados, errores, ids }, 200)
})
