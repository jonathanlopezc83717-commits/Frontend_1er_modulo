import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import {
  CORS_HEADERS,
  authError,
  json,
  requireMcpUser,
} from '../_shared/mcp-auth.ts'
import {
  ACCEPTED_MIME,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  FIELD_TO_BUCKET_KIND,
  MAX_FILE_SIZE,
  MAX_FILES_PER_REQUEST,
  type McpBucket,
  type McpUploadKind,
} from '../_shared/mcp-buckets.ts'
import {
  buildPath,
  fullPathToStoragePath,
  getExtension,
  pathBelongsToProyecto,
  signUrl,
  uploadObject,
  validateMime,
} from '../_shared/mcp-storage.ts'

interface UploadResult {
  slug: string
  path: string
  bucket: McpBucket
  kind: McpUploadKind
  signedUrl: string
  size: number
  mimeType: string
}

interface UploadError {
  fieldName: string
  fileName: string
  reason: string
}

interface UploadResponse {
  uploads: UploadResult[]
  errores: UploadError[]
}

interface MetadataPayload {
  proyecto_id: string
  slug_prefix?: string
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function buildSlug(
  base: string,
  duplicateIndex: number,
  totalDuplicates: number
): string {
  if (totalDuplicates <= 1) return base
  return `${base}_${duplicateIndex}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405)
  }

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return json({ error: 'Se esperaba multipart/form-data' }, 400)
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return json({ error: 'Cuerpo multipart inválido' }, 400)
  }

  const metadataEntry = formData.get('metadata')
  if (!metadataEntry) {
    return json({ error: 'Falta campo "metadata" en el form-data' }, 400)
  }
  let metadata: MetadataPayload
  try {
    const raw = typeof metadataEntry === 'string'
      ? metadataEntry
      : await (metadataEntry as File).text()
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) throw new Error('metadata no es objeto')
    const obj = parsed as Record<string, unknown>
    if (typeof obj.proyecto_id !== 'string' || !isUuid(obj.proyecto_id)) {
      throw new Error('proyecto_id requerido y debe ser UUID')
    }
    if (obj.slug_prefix !== undefined && typeof obj.slug_prefix !== 'string') {
      throw new Error('slug_prefix debe ser string')
    }
    metadata = {
      proyecto_id: obj.proyecto_id,
      slug_prefix: typeof obj.slug_prefix === 'string' && obj.slug_prefix.length > 0
        ? obj.slug_prefix
        : undefined,
    }
  } catch (err) {
    return json({ error: `metadata inválido: ${err instanceof Error ? err.message : 'parse error'}` }, 400)
  }

  const auth = await requireMcpUser(req, metadata.proyecto_id)
  if ('response' in auth) return auth.response

  const serviceEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const
  const envValues: Record<string, string> = {}
  for (const key of serviceEnv) {
    const value = Deno.env.get(key)
    if (!value) return authError(`Variable de entorno faltante: ${key}`, 500)
    envValues[key] = value
  }

  const admin = createClient(envValues.SUPABASE_URL, envValues.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const knownFields = new Set(Object.keys(FIELD_TO_BUCKET_KIND))
  const filesByField = new Map<string, File[]>()
  for (const [fieldName, entry] of formData.entries()) {
    if (fieldName === 'metadata') continue
    if (!(entry instanceof File)) continue
    if (!filesByField.has(fieldName)) filesByField.set(fieldName, [])
    filesByField.get(fieldName)!.push(entry)
  }

  const uploads: UploadResult[] = []
  const errores: UploadError[] = []

  let totalSeen = 0
  for (const [fieldName, files] of filesByField.entries()) {
    if (!knownFields.has(fieldName)) {
      for (const f of files) {
        errores.push({
          fieldName,
          fileName: f.name,
          reason: `unknown field '${fieldName}', supported: ${[...knownFields].join(', ')}`,
        })
      }
      continue
    }
    totalSeen += files.length
  }

  if (totalSeen > MAX_FILES_PER_REQUEST) {
    return json(
      {
        error: 'demasiados_archivos',
        max: MAX_FILES_PER_REQUEST,
        received: totalSeen,
      },
      413
    )
  }

  for (const [fieldName, files] of filesByField.entries()) {
    if (!knownFields.has(fieldName)) continue
    const mapping = FIELD_TO_BUCKET_KIND[fieldName]
    const { bucket, kind } = mapping

    const entries = files.map((file) => {
      const fallbackBase = file.name.replace(/\.[^.]+$/, '') || 'file'
      const base = metadata.slug_prefix ?? fallbackBase
      return { file, base }
    })

    const baseCounts = new Map<string, number>()
    for (const e of entries) {
      baseCounts.set(e.base, (baseCounts.get(e.base) ?? 0) + 1)
    }

    const baseCounters = new Map<string, number>()

    for (const { file, base } of entries) {
      const totalDuplicates = baseCounts.get(base) ?? 1
      const counter = baseCounters.get(base) ?? 0
      baseCounters.set(base, counter + 1)
      const slug = buildSlug(base, counter, totalDuplicates)

      const mimeType = file.type || 'application/octet-stream'
      if (!validateMime(kind, mimeType)) {
        errores.push({
          fieldName,
          fileName: file.name,
          reason: `mime '${mimeType}' no permitido para kind '${kind}' (acepta: ${ACCEPTED_MIME[kind].join(', ')})`,
        })
        continue
      }

      if (file.size > MAX_FILE_SIZE) {
        errores.push({
          fieldName,
          fileName: file.name,
          reason: `archivo excede ${MAX_FILE_SIZE} bytes (size=${file.size})`,
        })
        continue
      }

      const ext = getExtension(file.name) || mimeType.split('/')[1] || 'bin'
      const fullPath = buildPath({
        bucket,
        kind,
        slug,
        ext,
        proyectoId: metadata.proyecto_id,
      })

      if (!pathBelongsToProyecto(fullPath, bucket, metadata.proyecto_id)) {
        errores.push({
          fieldName,
          fileName: file.name,
          reason: `path inválido (no pertenece al proyecto)`,
        })
        continue
      }

      const storagePath = fullPathToStoragePath(fullPath, bucket)

      let bytes: Uint8Array
      try {
        bytes = new Uint8Array(await file.arrayBuffer())
      } catch (err) {
        errores.push({
          fieldName,
          fileName: file.name,
          reason: `error leyendo archivo: ${err instanceof Error ? err.message : 'unknown'}`,
        })
        continue
      }

      try {
        await uploadObject(admin, bucket, storagePath, bytes, mimeType)
      } catch (err) {
        errores.push({
          fieldName,
          fileName: file.name,
          reason: `upload falló: ${err instanceof Error ? err.message : 'unknown'}`,
        })
        continue
      }

      let signedUrlStr: string
      try {
        signedUrlStr = await signUrl(admin, bucket, storagePath, DEFAULT_SIGNED_URL_TTL_SECONDS)
      } catch (err) {
        errores.push({
          fieldName,
          fileName: file.name,
          reason: `sign url falló: ${err instanceof Error ? err.message : 'unknown'}`,
        })
        continue
      }

      uploads.push({
        slug,
        path: fullPath,
        bucket,
        kind,
        signedUrl: signedUrlStr,
        size: file.size,
        mimeType,
      })
    }
  }

  const response: UploadResponse = { uploads, errores }
  return json(response, 200)
})
