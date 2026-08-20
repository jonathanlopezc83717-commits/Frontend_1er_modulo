import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import {
  CORS_HEADERS,
  authError,
  json,
  requireEnv,
  requireAdminOrGeneral,
} from '../_shared/mcp-auth.ts'
import {
  BUCKETS,
  type McpBucket,
} from '../_shared/mcp-buckets.ts'
import { signUrl } from '../_shared/mcp-storage.ts'

const ANALYZE_TIMEOUT_MS = 60_000
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24
const PUNTO_CONCURRENCY = 5

interface RequestBody {
  proyecto_id: string
  punto_slug?: string
}

interface PuntoRow {
  id: string
  slug: string | null
  name: string
}

interface ArchivoPendiente {
  id: string
  storage_path: string
  bucket: McpBucket
  kind: string
  mime_type: string | null
  size_bytes: number | null
  punto_id: string
  puntos_ferroviarios: PuntoRow
}

interface PendingGroup {
  punto: PuntoRow
  archivos: ArchivoPendiente[]
}

interface AnalyzePerImageResult {
  descripcion: string
  objetos: string[]
  mood: string
  quality: string
}

interface AnalyzeResponse {
  resultados_por_imagen?: AnalyzePerImageResult[]
  descripcion_general?: string
  modelo_usado?: string
  error?: string
}

type GroupResult =
  | { ok: true; slug: string | null; archiveCount: number }
  | { ok: false; slug: string | null; reason: string; detail?: string }

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
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

function groupByPunto(rows: ArchivoPendiente[]): PendingGroup[] {
  const map = new Map<string, PendingGroup>()
  for (const row of rows) {
    const existing = map.get(row.punto_id)
    if (existing) {
      existing.archivos.push(row)
    } else {
      map.set(row.punto_id, { punto: row.puntos_ferroviarios, archivos: [row] })
    }
  }
  return Array.from(map.values())
}

async function invokeAnalyzeRailwayImages(
  supabaseUrl: string,
  adminJwt: string,
  payload: Record<string, unknown>
): Promise<AnalyzeResponse> {
  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-railway-images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
  })
  const raw = (await res.json().catch(() => null)) as AnalyzeResponse | null
  if (!res.ok) {
    return { error: raw?.error ?? `HTTP ${res.status}` }
  }
  return raw ?? {}
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

  if (!isUuid(body.proyecto_id)) {
    return json({ error: 'proyecto_id requerido (debe ser UUID)' }, 400)
  }

  const env = await requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (!env.ok) return env.response

  const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let query = admin
    .from('puntos_archivos')
    .select(
      `id, storage_path, bucket, kind, mime_type, size_bytes, punto_id,
       puntos_ferroviarios!inner (id, slug, name)`
    )
    .is('analyzed_at', null)
    .eq('puntos_ferroviarios.proyecto_id', body.proyecto_id)
    .in('bucket', [BUCKETS.EVIDENCIA, BUCKETS.REFERENCIAS])

  if (body.punto_slug && body.punto_slug.trim().length > 0) {
    query = query.eq('puntos_ferroviarios.slug', body.punto_slug.trim())
  }

  const { data: pendientes, error: queryError } = await query
  if (queryError) {
    return json({ error: 'mcp_trigger_query_failed', detail: queryError.message }, 500)
  }

  if (!pendientes || pendientes.length === 0) {
    return json({ procesados: 0, errores: [] }, 200)
  }

  const rows = pendientes as unknown as ArchivoPendiente[]
  const groups = groupByPunto(rows)

  const jwtHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
  const adminJwt = jwtHeader?.startsWith('Bearer ')
    ? jwtHeader.slice('Bearer '.length).trim()
    : null
  if (!adminJwt) {
    return authError('JWT desapareció tras requireAdminOrGeneral (inesperado)', 401)
  }

  const resultados = await pool(groups, PUNTO_CONCURRENCY, async (group): Promise<GroupResult> => {
    const slug = group.punto.slug

    const signedUrls: string[] = []
    const archiveIds: string[] = []
    for (const archivo of group.archivos) {
      try {
        const signedUrl = await signUrl(
          admin,
          archivo.bucket,
          archivo.storage_path,
          SIGNED_URL_TTL_SECONDS
        )
        signedUrls.push(signedUrl)
        archiveIds.push(archivo.id)
      } catch (signErr) {
        return {
          ok: false,
          slug,
          reason: 'sign_url_failed',
          detail: signErr instanceof Error ? signErr.message : 'sign error',
        }
      }
    }

    const analysis = await invokeAnalyzeRailwayImages(env.values.SUPABASE_URL, adminJwt, {
      image_urls: signedUrls,
      contexto: { categoria: 'ferrocarril' },
      punto_id: group.punto.id,
    })

    if (analysis.error || !analysis.resultados_por_imagen) {
      return {
        ok: false,
        slug,
        reason: 'analyze_failed',
        detail: analysis.error ?? 'respuesta sin resultados_por_imagen',
      }
    }

    const firstPerImage = analysis.resultados_por_imagen[0] ?? {
      descripcion: '',
      objetos: [],
      mood: '',
      quality: '',
    }

    const { error: persistError } = await admin
      .from('analisis_imagenes')
      .upsert(
        {
          punto_id: group.punto.id,
          image_urls: signedUrls,
          description: analysis.descripcion_general ?? firstPerImage.descripcion,
          objects: firstPerImage.objetos,
          mood: firstPerImage.mood,
          quality: firstPerImage.quality,
          model_used: analysis.modelo_usado ?? null,
          raw_response: JSON.stringify(analysis),
        },
        { onConflict: 'punto_id' }
      )

    if (persistError) {
      return {
        ok: false,
        slug,
        reason: 'persist_failed',
        detail: persistError.message,
      }
    }

    const stampIso = new Date().toISOString()
    const { error: stampError } = await admin
      .from('puntos_archivos')
      .update({ analyzed_at: stampIso })
      .in('id', archiveIds)

    if (stampError) {
      return {
        ok: false,
        slug,
        reason: 'stamp_failed',
        detail: stampError.message,
      }
    }

    return { ok: true, slug, archiveCount: archiveIds.length }
  })

  let procesados = 0
  const errores: Array<{ punto_slug?: string; reason: string; detail?: string }> = []
  for (const r of resultados) {
    if (r.ok) {
      procesados++
    } else {
      const entry: { punto_slug?: string; reason: string; detail?: string } = {
        reason: r.reason,
      }
      if (r.slug !== null) entry.punto_slug = r.slug
      if (r.detail !== undefined) entry.detail = r.detail
      errores.push(entry)
    }
  }

  return json({ procesados, errores }, 200)
})
