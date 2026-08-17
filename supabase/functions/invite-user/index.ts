// Supabase Edge Function: invite-user (service role).
// Crea la cuenta del invitado (password temporal aleatorio de 12 chars,
// email_confirm: true), asigna rol + debe_cambiar_password en perfiles y
// devuelve el password temporal UNA sola vez.
// Guards: administrador (cualquier rol), general (solo rol usuario —
// decisión vinculante), o bootstrap con perfiles vacío (primer admin;
// cubre también usuarios pre-existentes reseteando su password).
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

  // 4. Crear usuario con password temporal. Si ya existe (DB cloud con
  //    usuarios previos) y estamos en bootstrap, se resetea su password.
  const email = (body.email as string).trim().toLowerCase()
  const passwordTemporal = generarPasswordTemporal(12)
  let userId: string | null = null
  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: passwordTemporal, email_confirm: true }),
  })
  if (createRes.ok) {
    const createRaw = (await createRes.json().catch(() => null)) as Record<string, unknown> | null
    const usuario = (createRaw?.user ?? createRaw) as { id?: string } | null
    userId = usuario?.id ?? null
  } else {
    const createRaw = (await createRes.json().catch(() => null)) as Record<string, unknown> | null
    const msg =
      (createRaw?.msg as string | undefined) ||
      (createRaw?.error as string | undefined) ||
      `GoTrue HTTP ${createRes.status}`
    const yaExiste = createRes.status === 422 || /already exists|already registered/i.test(msg)
    if (!yaExiste || !decision.bootstrap) {
      return json({ error: yaExiste ? "Ya existe un usuario con ese email" : msg }, yaExiste ? 409 : 502)
    }
    // Bootstrap con usuario pre-existente (sin perfil): localizar y resetear password.
    const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    })
    if (!listRes.ok) return json({ error: "No se pudo listar usuarios existentes" }, 502)
    const lista = (await listRes.json().catch(() => null)) as { users?: Array<{ id: string; email: string }> } | null
    const existente = (lista?.users ?? []).find((u) => (u.email || "").toLowerCase() === email)
    if (!existente) return json({ error: "Usuario existente no encontrado por email" }, 502)
    const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${existente.id}`, {
      method: "PUT",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: passwordTemporal, email_confirm: true }),
    })
    if (!updateRes.ok) return json({ error: `No se pudo resetear el password: GoTrue HTTP ${updateRes.status}` }, 502)
    userId = existente.id
  }
  if (!userId) {
    return json({ error: "GoTrue no devolvió el id del usuario" }, 502)
  }

  // 5. perfiles: upsert (usuarios pre-existentes no tienen fila — el trigger
  //    solo dispara en INSERT nuevos). Bootstrap fuerza administrador.
  const patch: Record<string, unknown> = {
    id: userId,
    email,
    debe_cambiar_password: true,
  }
  if (!decision.bootstrap) patch.rol = decision.rol
  else patch.rol = "administrador"
  const patchRes = await fetch(`${supabaseUrl}/rest/v1/perfiles`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(patch),
  })
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
