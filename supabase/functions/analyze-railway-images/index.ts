// Supabase Edge Function: per-image railway analysis (gpt-4o-mini) + consolidation (gpt-4o).
// The OPENROUTER_API_KEY lives only here, in Deno.env — never shipped to the browser.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const CALL_TIMEOUT_MS = 60_000
const MAX_ATTEMPTS = 3
const BACKOFF_MS = [1000, 2000, 4000]
const PER_IMAGE_CONCURRENCY = 2
const REFERER_FALLBACK = "https://analizador-ferroviario.app"

type ModelId = "openai/gpt-4o" | "openai/gpt-4o-mini"

interface Contexto {
  categoria?: string
  nomenclaturas?: string[]
  materiales?: string
}

interface RequestBody {
  image_urls: string[]
  modelo?: ModelId
  contexto?: Contexto
  punto_id?: string
}

interface PerImageResult {
  descripcion: string
  objetos: string[]
  mood: string
  quality: string
}

interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  if (err instanceof DOMException) {
    return err.name === "TimeoutError" || err.name === "AbortError"
  }
  return false
}

function parseJsonContent(content: string): Record<string, unknown> | null {
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    // fall through to regex
  }
  const match = content.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      return JSON.parse(match[0]) as Record<string, unknown>
    } catch {
      // ignore
    }
  }
  return null
}

// ponytail: presence + private-IP blocklist closes anonymous SSRF + cost abuse.
// Upgrade: full JWT signature verification with Supabase JWT secret if stricter auth needed.
function isPublicHttpUrl(u: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return false
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
  const h = parsed.hostname.toLowerCase()
  return !(
    h === "localhost" ||
    h.endsWith(".localhost") ||
    /^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
    h === "::1" ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("fe8") ||
    h.startsWith("fe9") ||
    h.startsWith("fea") ||
    h.startsWith("feb")
  )
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) })
  if (!res.ok) {
    throw new Error("No se pudo descargar la imagen")
  }
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg"
  const buf = new Uint8Array(await res.arrayBuffer())
  return `data:${contentType};base64,${bytesToBase64(buf)}`
}

async function callOpenRouter(
  payload: Record<string, unknown>,
  apiKey: string,
  referer: string
): Promise<{ json: Record<string, unknown> | null; usage: Usage | null }> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": referer,
          "X-Title": "Analizador Ferroviario",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      })

      const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null

      if (res.ok) {
        const usage = (raw?.usage as Usage | undefined) ?? null
        return { json: raw, usage }
      }

      const retryableStatus = res.status === 429 || res.status >= 500
      if (attempt < MAX_ATTEMPTS - 1 && retryableStatus) {
        await sleep(BACKOFF_MS[attempt])
        continue
      }

      const apiMsg =
        (raw?.error as { message?: string } | undefined)?.message ||
        (raw?.message as string | undefined) ||
        `OpenRouter HTTP ${res.status}`
      throw new Error(apiMsg)
    } catch (err) {
      if (attempt < MAX_ATTEMPTS - 1 && isRetryableError(err)) {
        lastError = err
        await sleep(BACKOFF_MS[attempt])
        continue
      }
      throw err
    }
  }

  throw lastError ?? new Error("OpenRouter falló tras reintentos")
}

function buildPerImagePrompt(contexto?: Contexto): string {
  let prompt =
    "Eres un experto en ingeniería civil ferroviaria. Analiza esta imagen de obra civil relacionada con vías férreas."
  if (contexto) {
    const lines: string[] = []
    if (contexto.categoria) lines.push(`- Categoría de obra: ${contexto.categoria}`)
    if (contexto.nomenclaturas && contexto.nomenclaturas.length > 0) {
      lines.push(`- Nomenclaturas relevantes: ${contexto.nomenclaturas.join(", ")}`)
    }
    if (contexto.materiales) lines.push(`- Materiales esperados: ${contexto.materiales}`)
    if (lines.length > 0) {
      prompt += `\n\nContexto de la obra (úsalos para precisar el análisis):\n${lines.join("\n")}`
    }
  }
  prompt += `\n\nDevuelve ÚNICAMENTE un objeto JSON estricto con esta forma:
{
  "description": "Descripción técnica detallada: tipo de obra, avance, materiales visibles, terreno y entorno.",
  "objects": ["rieles", "durmientes", "balasto", ...],
  "mood": "Ambiente: rural/urbano, clima, condiciones.",
  "quality": "Evaluación técnica: estado de materiales, compactación, erosión, drenaje."
}`
  return prompt
}

function buildConsolidationPrompt(perImage: PerImageResult[]): string {
  const summaries = perImage
    .map(
      (r, i) =>
        `Imagen ${i + 1} — descripción: ${r.descripcion} | objetos: ${r.objetos.join(", ")} | estado: ${r.quality} | ambiente: ${r.mood}`
    )
    .join("\n")
  return `Eres un ingeniero civil ferroviario senior. A partir del análisis individual de ${perImage.length} imagen(es) de una misma obra, redacta una descripción general técnica consolidada.

Resultados por imagen:
${summaries}

Devuelve ÚNICAMENTE un objeto JSON estricto: { "descripcion_general": "..." }
La descripción general debe integrar tipo de obra, avance global, materiales, condiciones del terreno y observaciones transversales.`
}

async function analyzeSingleImage(
  dataUrl: string,
  modelo: ModelId,
  contexto: Contexto | undefined,
  apiKey: string,
  referer: string
): Promise<{ result: PerImageResult; usage: Usage | null }> {
  const payload = {
    model: modelo,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildPerImagePrompt(contexto) },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0.3,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  }

  const { json, usage } = await callOpenRouter(payload, apiKey, referer)
  const choices = (json?.choices as Array<{ message?: { content?: string } }> | undefined) ?? []
  const content = choices[0]?.message?.content ?? ""

  const parsed = parseJsonContent(content)
  const result: PerImageResult = {
    descripcion:
      (parsed?.description as string | undefined) || "No se generó descripción",
    objetos: Array.isArray(parsed?.objects) ? ((parsed!.objects as unknown[]) as string[]) : [],
    mood: (parsed?.mood as string | undefined) ?? "",
    quality: (parsed?.quality as string | undefined) ?? "",
  }
  return { result, usage }
}

async function consolidate(
  perImage: PerImageResult[],
  apiKey: string,
  referer: string
): Promise<{ descripcionGeneral: string; usage: Usage | null }> {
  const payload = {
    model: "openai/gpt-4o",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: buildConsolidationPrompt(perImage) }],
      },
    ],
    temperature: 0.3,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  }

  const { json, usage } = await callOpenRouter(payload, apiKey, referer)
  const choices = (json?.choices as Array<{ message?: { content?: string } }> | undefined) ?? []
  const content = choices[0]?.message?.content ?? ""
  const parsed = parseJsonContent(content)
  const descripcionGeneral =
    (parsed?.descripcion_general as string | undefined) || content || ""
  return { descripcionGeneral, usage }
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

function addUsage(a: Usage | null, b: Usage | null): Usage {
  const base: Usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  for (const u of [a, b]) {
    if (u) {
      base.prompt_tokens += u.prompt_tokens
      base.completion_tokens += u.completion_tokens
      base.total_tokens += u.total_tokens
    }
  }
  return base
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Falta autorización" }, 401)
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY")
  if (!apiKey) {
    return json({ error: "OPENROUTER_API_KEY no configurada en secrets" }, 500)
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: "Cuerpo de la petición no es JSON válido" }, 400)
  }

  const { image_urls, modelo, contexto } = body
  if (!Array.isArray(image_urls) || image_urls.length === 0) {
    return json({ error: "image_urls debe ser un arreglo no vacío" }, 400)
  }
  const validUrls = image_urls.filter((u) => typeof u === "string" && isPublicHttpUrl(u))
  if (validUrls.length !== image_urls.length) {
    return json({ error: "Cada elemento de image_urls debe ser una URL pública http(s) válida" }, 400)
  }

  const perImageModel: ModelId = modelo === "openai/gpt-4o" ? "openai/gpt-4o" : "openai/gpt-4o-mini"
  const referer = req.headers.get("origin") || REFERER_FALLBACK

  try {
    const dataUrls = await pool(image_urls, PER_IMAGE_CONCURRENCY, async (url) => {
      try {
        return await fetchImageAsDataUrl(url)
      } catch {
        return null
      }
    })
    const validDataUrls = dataUrls.filter((d): d is string => d !== null)
    if (validDataUrls.length === 0) {
      return json({ error: "Todas las imágenes fallaron al descargar" }, 502)
    }

    const perImage = await pool(
      validDataUrls,
      PER_IMAGE_CONCURRENCY,
      (dataUrl) => analyzeSingleImage(dataUrl, perImageModel, contexto, apiKey, referer)
    )

    const results: PerImageResult[] = perImage.map((p) => p.result)
    let totalUsage: Usage | null = null
    for (const p of perImage) totalUsage = addUsage(totalUsage, p.usage)

    const { descripcionGeneral, usage: consolidationUsage } = await consolidate(
      results,
      apiKey,
      referer
    )
    totalUsage = addUsage(totalUsage, consolidationUsage)

    return json({
      resultados_por_imagen: results,
      descripcion_general: descripcionGeneral,
      modelo_usado: perImageModel,
      usage: totalUsage,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido en la función"
    return json({ error: message }, 500)
  }
})
