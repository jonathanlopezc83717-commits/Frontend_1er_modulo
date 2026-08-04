// Supabase Edge Function: batch save of railway puntos via `guardar_punto_completo` RPC.
// Receives pre-built payloads (foto data-URLs already resolved to Storage URLs client-side),
// fans out the RPC calls server-side at controlled concurrency, forwarding the caller's
// identity for RLS. Replaces N client→DB round-trips with one client→Edge invoke.

const RPC_TIMEOUT_MS = 60_000
const RPC_CONCURRENCY = 5

interface CoordenadasPayload {
  coordenada_x: number
  coordenada_y: number
  coordenada_z: number
  notas: string
}
interface DocumentosPayload {
  nombre_archivo: string
  contenido: string
}
interface AnalisisPayload {
  image_urls: string[]
  description: string
  objects: string[]
  mood: string
  quality: string
  model_used: string
}
interface FotoPayload {
  indice: number
  nombre_archivo: string
  nombre_formateado: string
  subcarpeta: string
  preview_url: string
}
interface PuntoPayload {
  punto: Record<string, unknown>
  coordenadas: CoordenadasPayload | null
  documentos: DocumentosPayload | null
  analisis: AnalisisPayload | null
  fotos: FotoPayload[] | null
}
interface RequestBody {
  puntos: PuntoPayload[]
}
interface RpcResponse {
  success?: boolean
  error?: string
}
interface Detalle {
  success: boolean
  error?: string
}
interface Agregado {
  guardados: number
  errores: number
  detalles: Detalle[]
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
  })
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

async function invokeGuardarPunto(
  supabaseUrl: string,
  payload: PuntoPayload,
  jwt: string
): Promise<Detalle> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/guardar_punto_completo`, {
      method: "POST",
      headers: {
        apikey: jwt,
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_payload: payload }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    })

    const raw = (await res.json().catch(() => null)) as RpcResponse | null

    if (!res.ok) {
      const apiMsg =
        raw?.error ||
        (raw as Record<string, unknown> | null)?.message as string | undefined ||
        `RPC HTTP ${res.status}`
      return { success: false, error: apiMsg }
    }

    if (raw && raw.success === false) {
      return { success: false, error: raw.error || "RPC reportó fallo sin mensaje" }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error invocando guardar_punto_completo"
    return { success: false, error: message }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  if (!supabaseUrl) {
    return json({ error: "SUPABASE_URL no configurada en secrets" }, 500)
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: "Cuerpo de la petición no es JSON válido" }, 400)
  }

  if (!Array.isArray(body.puntos) || body.puntos.length === 0) {
    return json({ error: "puntos debe ser un arreglo no vacío" }, 400)
  }

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
  const jwt = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null
  if (!jwt) {
    return json({ error: "Falta header Authorization: Bearer <jwt> para reenviar a PostgREST (RLS)" }, 401)
  }

  try {
    const detalles = await pool(body.puntos, RPC_CONCURRENCY, (p) =>
      invokeGuardarPunto(supabaseUrl, p, jwt as string)
    )

    let guardados = 0
    let errores = 0
    for (const d of detalles) {
      if (d.success) guardados++
      else errores++
    }

    const agregado: Agregado = { guardados, errores, detalles }
    return json(agregado)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido en la función"
    return json({ error: message }, 500)
  }
})
