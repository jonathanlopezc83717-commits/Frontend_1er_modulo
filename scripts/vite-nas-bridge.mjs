import { readFileSync, existsSync, statSync, writeFileSync, renameSync, readdirSync } from 'node:fs'
import { join, resolve, normalize } from 'node:path'

const ACK_BODY_LIMIT = 64 * 1024

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
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > limit) {
        req.destroy()
        resolveBody('{}')
      }
    })
    req.on('end', () => resolveBody(data || '{}'))
    req.on('error', () => resolveBody('{}'))
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

  return {
    name: 'nas-bridge',
    configureServer(server) {
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
          const csvName = readdirSync(abs).filter((n) => n.toLowerCase().endsWith('.csv')).sort()[0]
          if (!csvName) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'no csv in folder' }))
            return
          }
          const rows = readFileSync(join(abs, csvName), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.split(','))
          let primeraX = null
          for (const r of rows) { const n = Number(r[1]); if (Number.isFinite(n)) { primeraX = n; break } }
          let ultimaX = null
          for (let i = rows.length - 1; i >= 0; i--) { const n = Number(rows[i][1]); if (Number.isFinite(n)) { ultimaX = n; break } }
          if (primeraX === null || ultimaX === null) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'no numeric rows' }))
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ inicio: primeraX, fin: ultimaX, archivo: csvName }))
          return
        }

        next()
      })
    },
  }
}
