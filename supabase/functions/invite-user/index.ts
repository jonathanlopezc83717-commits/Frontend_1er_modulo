// Supabase Edge Function: invite-user (service role).
// Crea la cuenta del invitado (password temporal aleatorio de 12 chars,
// email_confirm: true), asigna rol + debe_cambiar_password en perfiles y
// devuelve el password temporal UNA sola vez.
// Guards: administrador (cualquier rol), general (solo rol usuario —
// decisión vinculante), o bootstrap con auth.users vacío (primer usuario).
// La lógica pura vive en ./guard.ts (unit-testeada desde src/tests).

import { decidirInvitacion, generarPasswordTemporal, type RolUsuario } from "./guard.ts"

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

// Decodifica el payload SIN verificar firma: PostgREST valida la firma al
// usar el JWT; si es inválido la consulta a perfiles falla y callerRol queda null.
function decodificarSub(jwt: string): string | null {
  const parte = jwt.split(".")[1]
  if (!parte) return null
  try {
    const b64 = parte.replace(/-/g, "+").replace(/_/g, "/")
    const payload = JSON.parse(atob(b64)) as { sub?: unknown }
    return typeof payload.sub === "string" ? payload.sub : null
  } catch {
    return null
  }
}

interface CuerpoPeticion {
  email?: unknown
  rol?: unknown
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados" }, 500)
  }

  let body: CuerpoPeticion
  try {
    body = (await req.json()) as CuerpoPeticion
  } catch {
    return json({ error: "Cuerpo de la petición no es JSON válido" }, 400)
  }

  // 1. Rol del invocador: PostgREST valida firma/RLS; solo su fila es visible.
  let callerRol: RolUsuario | null = null
  const authHeader = req.headers.get("authorization")
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null
  if (jwt) {
    const sub = decodificarSub(jwt)
    if (sub) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/perfiles?id=eq.${encodeURIComponent(sub)}&select=rol`,
        { headers: { apikey: jwt, Authorization: `Bearer ${jwt}` } }
      )
      if (res.ok) {
        const filas = (await res.json().catch(() => null)) as Array<{ rol: RolUsuario }> | null
        if (filas && filas.length > 0) callerRol = filas[0].rol
      }
    }
  }

  // 2. ¿Bootstrap? perfiles espeja auth.users 1:1 vía trigger.
  let usuariosExisten = false
  {
    const res = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=id&limit=1`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    })
    if (!res.ok) return json({ error: "No se pudo consultar perfiles" }, 500)
    const filas = (await res.json().catch(() => null)) as unknown[] | null
    usuariosExisten = Array.isArray(filas) && filas.length > 0
  }

  // 3. Guard puro.
  const decision = decidirInvitacion({
    callerRol,
    usuariosExisten,
    rolSolicitado: body.rol,
    email: body.email,
  })
  if (!decision.ok) {
    return json({ error: decision.error }, decision.status)
  }

  // 4. Crear usuario con password temporal.
  const email = (body.email as string).trim().toLowerCase()
  const passwordTemporal = generarPasswordTemporal(12)
  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: passwordTemporal, email_confirm: true }),
  })
  const createRaw = (await createRes.json().catch(() => null)) as Record<string, unknown> | null
  if (!createRes.ok) {
    const msg =
      (createRaw?.msg as string | undefined) ||
      (createRaw?.error as string | undefined) ||
      `GoTrue HTTP ${createRes.status}`
    if (createRes.status === 422 || /already exists|already registered/i.test(msg)) {
      return json({ error: "Ya existe un usuario con ese email" }, 409)
    }
    return json({ error: msg }, 502)
  }
  const usuario = (createRaw?.user ?? createRaw) as { id?: string } | null
  const userId = usuario?.id
  if (!userId) {
    return json({ error: "GoTrue no devolvió el id del usuario creado" }, 502)
  }

  // 5. perfiles: flag de cambio + rol asignado.
  //    Bootstrap: no se toca rol (el trigger ya dejó administrador).
  const patch: Record<string, unknown> = { debe_cambiar_password: true }
  if (!decision.bootstrap) patch.rol = decision.rol
  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/perfiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    }
  )
  if (!patchRes.ok) {
    return json({ error: "Usuario creado pero falló la asignación de rol" }, 502)
  }

  return json({
    user_id: userId,
    email,
    rol: decision.bootstrap ? "administrador" : decision.rol,
    password_temporal: passwordTemporal,
  })
})
