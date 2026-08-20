import { readFileSync, existsSync, statSync, writeFileSync, renameSync, readdirSync, watch, mkdirSync, unlinkSync } from 'node:fs'
import { join, resolve, normalize } from 'node:path'
import { randomUUID } from 'node:crypto'

const ACK_BODY_LIMIT = 64 * 1024
// ponytail: 256MB cubre snapshots con previews base64 embebidas (~8-11MB/foto).
// Si se queda corto: aplicar moduloData con URLs de Storage tras sync (patron
// de handleCompactarEspacio) y los snapshots encogen solos.
const SNAP_BODY_LIMIT = 256 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SNAPSHOTS_RETENCION = 10

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, path)
}

function readBody(req, limit) {
  return new Promise((resolveBody) => {
    const chunks = []
    let total = 0
    let settled = false
    const finish = (value) => {
      if (!settled) {
        settled = true
        resolveBody(value)
      }
    }
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > limit) {
        req.destroy()
        finish(null)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => finish(Buffer.concat(chunks).toString('utf8') || '{}'))
    req.on('error', () => finish(null))
  })
}

function safeJoin(root, rel) {
  if (!root || !rel) return null
  const normalized = normalize(join(root, rel))
  if (!normalized.startsWith(root)) return null
  return normalized
}

export function nasBridgePlugin() {
  const watchPath = process.env.NAS_WATCH_PATH ? resolve(process.env.NAS_WATCH_PATH) : ''
  const logDir = watchPath ? join(watchPath, '.watcher') : ''
  const pendingPath = logDir ? join(logDir, 'pending-approval.json') : ''

  // Middleware compartido por dev (configureServer) y preview
  // (configurePreviewServer): sin esto, `vite preview` sirve dist/ sin las
  // rutas /api/nas-* y el front ve 404 en todos los endpoints del NAS.
  function instalarMiddleware(server) {
    server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')

        if (url.pathname === '/api/nas-pending' && req.method === 'GET') {
          const data = existsSync(pendingPath)
            ? readJson(pendingPath, { pending: [] })
            : { pending: [], updatedAt: null }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
          return
        }

        if (url.pathname === '/api/nas-pending/ack' && req.method === 'POST') {
          const body = await readBody(req, ACK_BODY_LIMIT)
          if (body === null) {
            res.statusCode = 413
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'cuerpo demasiado grande' }))
            return
          }
          const { eventIds = [] } = JSON.parse(body)
          const idSet = new Set(eventIds)
          const current = readJson(pendingPath, { pending: [] })
          const filtered = (current.pending || []).filter((e) => !idSet.has(e.eventId))
          writeJsonAtomic(pendingPath, {
            ...current,
            updatedAt: new Date().toISOString(),
            pending: filtered,
          })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ acked: idSet.size, remaining: filtered.length }))
          return
        }

        if (url.pathname === '/api/nas-file' && req.method === 'GET') {
          const rel = url.searchParams.get('path') || ''
          const abs = safeJoin(watchPath, rel)
          if (!abs || !existsSync(abs)) {
            res.statusCode = 404
            res.end('Not found')
            return
          }
          const stat = statSync(abs)
          res.setHeader('Content-Length', stat.size)
          res.end(readFileSync(abs))
          return
        }

        if (url.pathname === '/api/nas-csv-rango' && req.method === 'GET') {
          const rel = url.searchParams.get('folder') || ''
          const abs = safeJoin(watchPath, rel)
          if (!abs || !existsSync(abs) || !statSync(abs).isDirectory()) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'folder not found' }))
            return
          }
          const entries = readdirSync(abs)
          const csvName = entries.filter((n) => n.toLowerCase().endsWith('.csv')).sort()[0]
          const xlsName = entries.filter((n) => /\.(xlsx|xls)$/i.test(n)).sort()[0]
          let rows = null
          let archivoUsado = null
          if (csvName) {
            rows = readFileSync(join(abs, csvName), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.split(','))
            archivoUsado = csvName
          } else if (xlsName) {
            const XLSX = await import('xlsx')
            const wb = XLSX.read(readFileSync(join(abs, xlsName)), { type: 'buffer' })
            rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
            archivoUsado = xlsName
          }
          if (!rows) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'no csv/xlsx in folder' }))
            return
          }
          const primerCoordUtm = (r) => { for (let c = 0; c < r.length; c++) { const n = Number(r[c]); if (Number.isFinite(n) && n > 100000) return n } return null }
          let primeraX = null
          for (const r of rows) { primeraX = primerCoordUtm(r); if (primeraX !== null) break }
          let ultimaX = null
          for (let i = rows.length - 1; i >= 0; i--) { ultimaX = primerCoordUtm(rows[i]); if (ultimaX !== null) break }
          if (primeraX === null || ultimaX === null) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'no numeric rows' }))
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ inicio: primeraX, fin: ultimaX, archivo: archivoUsado }))
          return
        }

        if (url.pathname === '/api/nas-snapshots' && req.method === 'POST') {
          if (!watchPath) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'NAS no configurado' }))
            return
          }
          const body = await readBody(req, SNAP_BODY_LIMIT)
          if (body === null) {
            res.statusCode = 413
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'snapshot demasiado grande (limite 256MB)' }))
            return
          }
          const { proyectoId, tipo, descripcion, guardadoPor = '', snapshot } = JSON.parse(body)
          if (!UUID_RE.test(proyectoId || '')) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'proyectoId debe ser un UUID valido' }))
            return
          }
          if (tipo !== 'manual' && tipo !== 'automatico') {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: "tipo debe ser 'manual' o 'automatico'" }))
            return
          }
          const dir = safeJoin(watchPath, `.snapshots/${proyectoId}`)
          mkdirSync(dir, { recursive: true })
          const id = randomUUID()
          const createdAt = new Date().toISOString()
          const nombre = `${createdAt.slice(0, 23).replace(/[:.]/g, '')}-${id}.json`
          writeJsonAtomic(join(dir, nombre), snapshot)
          const actual = readJson(join(dir, 'index.json'), { updatedAt: null, snapshots: [] })
          const entradas = [
            ...actual.snapshots,
            {
              id,
              tipo,
              descripcion: descripcion || '',
              created_at: createdAt,
              guardadoPor: guardadoPor || '',
              kb: Math.round(statSync(join(dir, nombre)).size / 102.4) / 10,
              archivo: nombre,
            },
          ]
          entradas.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
          for (const excedente of entradas.slice(SNAPSHOTS_RETENCION)) {
            try {
              unlinkSync(join(dir, excedente.archivo))
            } catch {}
          }
          const conservadas = entradas.slice(0, SNAPSHOTS_RETENCION)
          writeJsonAtomic(join(dir, 'index.json'), { updatedAt: createdAt, snapshots: conservadas })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, id, created_at: createdAt }))
          return
        }

        if (url.pathname === '/api/nas-snapshots' && req.method === 'GET') {
          if (!watchPath) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'NAS no configurado' }))
            return
          }
          const proyectoId = url.searchParams.get('proyectoId') || ''
          if (!UUID_RE.test(proyectoId)) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'proyectoId debe ser un UUID valido' }))
            return
          }
          const dir = safeJoin(watchPath, `.snapshots/${proyectoId}`)
          const indice = dir && existsSync(join(dir, 'index.json'))
            ? readJson(join(dir, 'index.json'), { updatedAt: null, snapshots: [] })
            : { updatedAt: null, snapshots: [] }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            updatedAt: indice.updatedAt ?? null,
            snapshots: (indice.snapshots || []).map(({ id, tipo, descripcion, created_at, guardadoPor, kb }) => ({
              id, tipo, descripcion, created_at, guardadoPor, kb,
            })),
          }))
          return
        }

        if (url.pathname === '/api/nas-snapshot' && req.method === 'GET') {
          if (!watchPath) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'NAS no configurado' }))
            return
          }
          const proyectoId = url.searchParams.get('proyectoId') || ''
          const id = url.searchParams.get('id') || ''
          if (!UUID_RE.test(proyectoId) || !UUID_RE.test(id)) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'proyectoId e id deben ser UUID validos' }))
            return
          }
          const dir = safeJoin(watchPath, `.snapshots/${proyectoId}`)
          const indice = dir && existsSync(join(dir, 'index.json'))
            ? readJson(join(dir, 'index.json'), { updatedAt: null, snapshots: [] })
            : { updatedAt: null, snapshots: [] }
          const entrada = (indice.snapshots || []).find((e) => e.id === id)
          const ruta = entrada && safeJoin(watchPath, `.snapshots/${proyectoId}/${entrada.archivo}`)
          const cuerpo = ruta && existsSync(ruta) ? readJson(ruta, null) : null
          if (!entrada || cuerpo === null) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'snapshot no encontrado' }))
            return
          }
          const { tipo, descripcion, created_at, guardadoPor } = entrada
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            id, tipo, descripcion, created_at, guardadoPor: guardadoPor || '',
            snapshot: cuerpo,
          }))
          return
        }

        next()
      })
  }

  function vigilarPendientes(server) {
    if (!logDir || !existsSync(logDir) || !server.ws) return
    let debounceTimer = null
    const emitirPendientes = () => {
      const data = existsSync(pendingPath)
        ? readJson(pendingPath, { pending: [], updatedAt: null })
        : { pending: [], updatedAt: null }
      server.ws.send('nas:eventos', {
        updatedAt: data.updatedAt ?? null,
        pendientes: (data.pending || []).length,
      })
    }
    try {
      watch(logDir, (_event, filename) => {
        if (filename !== 'pending-approval.json') return
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(emitirPendientes, 300)
      })
    } catch {}
  }

  return {
    name: 'nas-bridge',
    configureServer(server) {
      instalarMiddleware(server)
      vigilarPendientes(server)
    },
    configurePreviewServer(server) {
      instalarMiddleware(server)
    },
  }
}
