import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4'
import {
  ACCEPTED_MIME,
  type McpBucket,
  type McpUploadKind,
} from './mcp-buckets.ts'

export interface BuildPathArgs {
  proyectoId: string
  kind: McpUploadKind
  slug: string
  ext: string
  bucket: McpBucket
}

export function buildPath(args: BuildPathArgs): string {
  const now = new Date()
  const yyyyMm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const ext = args.ext.replace(/^\./, '')
  const cleanExt = ext ? `.${ext}` : ''
  return `${args.bucket}/${args.proyectoId}/${yyyyMm}/${dd}/${args.kind}/${args.slug}${cleanExt}`
}

export function validateMime(kind: McpUploadKind, mime: string): boolean {
  if (!mime) return false
  return ACCEPTED_MIME[kind].includes(mime)
}

export function pathBelongsToProyecto(path: string, bucket: McpBucket, proyectoId: string): boolean {
  return path.startsWith(`${bucket}/${proyectoId}/`)
}

export function fullPathToStoragePath(fullPath: string, bucket: McpBucket): string {
  const prefix = `${bucket}/`
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath
}

export async function uploadObject(
  supabase: SupabaseClient,
  bucket: McpBucket,
  storagePath: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
    contentType,
    upsert: false,
  })
  if (error) {
    const status = (error as { statusCode?: string }).statusCode
    if (status === '409' || /already exists/i.test(error.message)) {
      return
    }
    throw error
  }
}

export async function signUrl(
  supabase: SupabaseClient,
  bucket: McpBucket,
  storagePath: string,
  ttlSeconds: number
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, ttlSeconds)
  if (error || !data?.signedUrl) {
    throw error ?? new Error(`No se pudo firmar URL para ${bucket}/${storagePath}`)
  }
  return data.signedUrl
}

export function getExtension(filename: string): string {
  const i = filename.lastIndexOf('.')
  if (i < 0 || i === filename.length - 1) return ''
  return filename.slice(i + 1).toLowerCase()
}
