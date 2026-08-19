import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PAGE_SIZE = 500

function usage() {
  console.error('Migra las filas de app_state_snapshots (Supabase) a {NAS_WATCH_PATH}/.snapshots/{proyectoId}/.')
  console.error('NO trunca la tabla: la verificación/borrado es un paso manual posterior.')
  console.error('Requisitos de entorno (PowerShell):')
  console.error('  $env:NAS_WATCH_PATH="C:\\Users\\TU_USUARIO\\SynologyDrive\\Obras"')
  console.error('  $env:SUPABASE_URL="http://127.0.0.1:54321"')
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."')
  console.error('  node scripts/migrar-snapshots-nas.mjs')
}

const nasRoot = process.env.NAS_WATCH_PATH ? resolve(process.env.NAS_WATCH_PATH) : ''
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!nasRoot || !supabaseUrl || !serviceKey) {
  usage()
  process.exit(1)
}

if (!existsSync(nasRoot)) {
  console.error(`La ruta NAS no existe: ${nasRoot}`)
  process.exit(1)
}

function headers() {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
}

async function restGet(path) {
  const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: headers() })
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`)
  return r.json()
}

async function traerPaginado(tabla, select, orden) {
  const filas = []
  let offset = 0
  for (;;) {
    const pagina = await restGet(`${tabla}?select=${select}&order=${orden}&limit=${PAGE_SIZE}&offset=${offset}`)
    filas.push(...pagina)
    if (pagina.length < PAGE_SIZE) return filas
    offset += PAGE_SIZE
  }
}

function escribirJsonAtomico(ruta, valor) {
  const tmp = `${ruta}.tmp`
  writeFileSync(tmp, JSON.stringify(valor, null, 2), 'utf8')
  renameSync(tmp, ruta)
}

const resumen = { migrated: 0, skipped_null_project: 0, errors: 0 }

const emailsPorUsuario = new Map()
try {
  const perfiles = await restGet('perfiles?select=id,email')
  for (const p of perfiles) emailsPorUsuario.set(p.id, p.email || '')
} catch (error) {
  console.error(`No se pudo mapear user_id -> email (guardadoPor quedara vacio): ${error}`)
}

const filas = await traerPaginado('app_state_snapshots', 'id,tipo,descripcion,snapshot,created_at,proyecto_id,user_id', 'created_at.asc')
console.log(`Filas leidas de app_state_snapshots: ${filas.length}`)

const indicePorProyecto = new Map()

for (const fila of filas) {
  if (!fila.proyecto_id) {
    resumen.skipped_null_project++
    continue
  }
  try {
    const dir = join(nasRoot, '.snapshots', fila.proyecto_id)
    mkdirSync(dir, { recursive: true })
    const sello = String(fila.created_at).replace(/[:.]/g, '')
    const nombre = `${sello}-${fila.id}.json`
    const ruta = join(dir, nombre)
    escribirJsonAtomico(ruta, fila.snapshot)
    const entradas = indicePorProyecto.get(fila.proyecto_id) || []
    entradas.push({
      id: fila.id,
      tipo: fila.tipo,
      descripcion: fila.descripcion || '',
      created_at: fila.created_at,
      guardadoPor: emailsPorUsuario.get(fila.user_id) || '',
      kb: Math.round(statSync(ruta).size / 102.4) / 10,
      archivo: nombre,
    })
    indicePorProyecto.set(fila.proyecto_id, entradas)
    resumen.migrated++
  } catch (error) {
    resumen.errors++
    console.error(`Error migrando fila ${fila.id}: ${error}`)
  }
}

function leerIndiceExistente(ruta) {
  if (!existsSync(ruta)) return []
  try {
    const idx = JSON.parse(readFileSync(ruta, 'utf8'))
    return Array.isArray(idx.snapshots) ? idx.snapshots : []
  } catch {
    return []
  }
}

for (const [proyectoId, entradas] of indicePorProyecto) {
  const dir = join(nasRoot, '.snapshots', proyectoId)
  const porId = new Map(leerIndiceExistente(join(dir, 'index.json')).map((e) => [e.id, e]))
  for (const e of entradas) porId.set(e.id, e)
  const combinadas = [...porId.values()].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  )
  escribirJsonAtomico(join(dir, 'index.json'), {
    updatedAt: new Date().toISOString(),
    snapshots: combinadas,
  })
  console.log(`Indice ${proyectoId}: ${combinadas.length} snapshots (sin retencion, historial completo)`)
}

console.log('Resumen:', JSON.stringify(resumen))
