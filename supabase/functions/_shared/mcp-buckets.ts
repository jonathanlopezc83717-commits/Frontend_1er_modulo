export const BUCKETS = {
  EVIDENCIA: 'mcp-evidencia',
  FICHAS: 'mcp-fichas',
  REFERENCIAS: 'mcp-referencias',
} as const

export type McpBucket = typeof BUCKETS[keyof typeof BUCKETS]

export type McpUploadKind = 'foto' | 'croquis' | 'documento' | 'referencia'

export const FIELD_TO_BUCKET_KIND: Record<string, { bucket: McpBucket; kind: McpUploadKind }> = {
  fotos: { bucket: BUCKETS.EVIDENCIA, kind: 'foto' },
  croquis: { bucket: BUCKETS.EVIDENCIA, kind: 'croquis' },
  documentos: { bucket: BUCKETS.EVIDENCIA, kind: 'documento' },
  referencias: { bucket: BUCKETS.REFERENCIAS, kind: 'referencia' },
}

export const ACCEPTED_MIME: Record<McpUploadKind, readonly string[]> = {
  foto: ['image/jpeg', 'image/png', 'image/webp'],
  croquis: ['image/jpeg', 'image/png', 'image/webp', 'image/vnd.dwg'],
  documento: ['application/pdf', 'image/jpeg', 'image/png'],
  referencia: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
}

export const MAX_FILE_SIZE = 50 * 1024 * 1024
export const MAX_FILES_PER_REQUEST = 20
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24
