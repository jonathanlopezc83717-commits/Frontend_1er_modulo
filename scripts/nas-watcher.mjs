import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, renameSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

const watchPath = process.env.NAS_WATCH_PATH ? resolve(process.env.NAS_WATCH_PATH) : ''
const intervalMs = Number(process.env.NAS_WATCH_INTERVAL_MS || 5000)
const hashLimitMb = Number(process.env.NAS_WATCH_HASH_LIMIT_MB || 50)
const logDir = process.env.NAS_WATCH_LOG_DIR
  ? resolve(process.env.NAS_WATCH_LOG_DIR)
  : watchPath ? join(watchPath, '.watcher') : ''
const statePath = logDir ? join(logDir, 'nas-watcher-state.json') : ''
const logPath = logDir ? join(logDir, 'nas-events.jsonl') : ''

const ignoredNames = new Set(['.watcher', '@eaDir', '#recycle', '.DS_Store', 'Thumbs.db'])
const ALLOWED_EXTS = new Set(['.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png', '.kmz', '.kml', '.txt'])
const pendingPath = logDir ? join(logDir, 'pending-approval.json') : ''

function usage() {
  console.log('Configura NAS_WATCH_PATH con la ruta local sincronizada por Synology Drive.')
  console.log('Ejemplo PowerShell:')
  console.log('$env:NAS_WATCH_PATH="C:\\Users\\TU_USUARIO\\SynologyDrive\\Obras"; npm run watch:nas')
}

function ensureReady() {
  if (!watchPath) {
    usage()
    process.exit(1)
  }

  if (!existsSync(watchPath)) {
    console.error(`La ruta no existe: ${watchPath}`)
    process.exit(1)
  }

  mkdirSync(logDir, { recursive: true })
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJsonAtomic(path, value) {
  const tempPath = `${path}.tmp`
  writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tempPath, path)
}

function fileHash(path) {
  const data = readFileSync(path)
  return createHash('sha256').update(data).digest('hex')
}

function signature(meta) {
  return meta.hash || `${meta.size}:${Math.round(meta.mtimeMs)}`
}

function shouldIgnore(path) {
  return path.split(/[\\/]+/).some(part => ignoredNames.has(part))
}

function scanDirectory(root) {
  const files = {}
  const stack = [root]
  const hashLimitBytes = hashLimitMb * 1024 * 1024

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || shouldIgnore(relative(root, current))) continue

    let entries = []
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch (error) {
      logEvent('scan_error', relative(root, current), { error: String(error) })
      continue
    }

    for (const entry of entries) {
      if (ignoredNames.has(entry.name)) continue

      const fullPath = join(current, entry.name)
      const relPath = relative(root, fullPath).replaceAll('\\', '/')

      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }

      if (!entry.isFile()) continue

      try {
        const stats = statSync(fullPath)
        files[relPath] = {
          name: basename(fullPath),
          dir: dirname(relPath).replaceAll('\\', '/'),
          size: stats.size,
          mtimeMs: stats.mtimeMs,
          hash: stats.size <= hashLimitBytes ? fileHash(fullPath) : undefined,
        }
      } catch (error) {
        logEvent('scan_error', relPath, { error: String(error) })
      }
    }
  }

  return files
}

function logEvent(type, path, details = {}) {
  const entry = {
    id: randomUUID(),
    type,
    path,
    timestamp: new Date().toISOString(),
    source: 'synology-drive-local-watcher',
    watchPath,
    ...details,
  }

  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
  console.log(`[${entry.timestamp}] ${type}: ${path}`)
}

function compareSnapshots(previous, current) {
  const events = []
  const previousByPath = previous.files || {}
  const currentByPath = current.files || {}
  const deleted = new Map()
  const created = new Map()

  for (const [path, meta] of Object.entries(previousByPath)) {
    if (!currentByPath[path]) deleted.set(path, meta)
  }

  for (const [path, meta] of Object.entries(currentByPath)) {
    const previousMeta = previousByPath[path]
    if (!previousMeta) {
      created.set(path, meta)
      continue
    }

    if (previousMeta.size !== meta.size || Math.round(previousMeta.mtimeMs) !== Math.round(meta.mtimeMs) || previousMeta.hash !== meta.hash) {
      events.push({ type: 'modified', path, details: { before: previousMeta, after: meta } })
    }
  }

  for (const [createdPath, createdMeta] of [...created.entries()]) {
    const createdSignature = signature(createdMeta)
    const movedFrom = [...deleted.entries()].find(([, deletedMeta]) => signature(deletedMeta) === createdSignature)

    if (movedFrom) {
      const [deletedPath, deletedMeta] = movedFrom
      deleted.delete(deletedPath)
      created.delete(createdPath)
      events.push({
        type: 'moved',
        path: createdPath,
        details: { from: deletedPath, before: deletedMeta, after: createdMeta },
      })
    }
  }

  for (const [path, meta] of created.entries()) {
    events.push({ type: 'created', path, details: { after: meta } })
  }

  for (const [path, meta] of deleted.entries()) {
    events.push({ type: 'deleted', path, details: { before: meta } })
  }

  return events
}

function updatePending(newEvents) {
  if (!pendingPath) return
  const current = readJson(pendingPath, { pending: [] })
  const existing = new Map(
    (current.pending || []).map((e) => [`${e.path}|${e.size}:${Math.round(e.mtimeMs || 0)}`, e])
  )
  const now = new Date().toISOString()
  for (const ev of newEvents) {
    const dot = ev.path.lastIndexOf('.')
    const ext = dot >= 0 ? ev.path.slice(dot).toLowerCase() : ''
    if (!ALLOWED_EXTS.has(ext)) continue
    const after = ev.details && ev.details.after
    const before = ev.details && ev.details.before
    const size = (after && after.size) || (before && before.size) || 0
    const mtimeMs = (after && after.mtimeMs) || (before && before.mtimeMs) || 0
    const key = `${ev.path}|${size}:${Math.round(mtimeMs)}`
    if (!existing.has(key)) {
      existing.set(key, {
        eventId: randomUUID(),
        type: ev.type,
        path: ev.path,
        ext,
        size,
        mtimeMs,
        detectedAt: now,
      })
    }
  }
  writeJsonAtomic(pendingPath, {
    updatedAt: now,
    watchPath,
    pending: [...existing.values()],
  })
}

function main() {
  ensureReady()

  let previous = readJson(statePath, { files: {} })
  console.log(`Watcher activo: ${watchPath}`)
  console.log(`Log: ${logPath}`)
  console.log(`Intervalo: ${intervalMs} ms`)

  const tick = () => {
    const current = {
      updatedAt: new Date().toISOString(),
      rootName: basename(watchPath),
      files: scanDirectory(watchPath),
    }

    const events = compareSnapshots(previous, current)
    for (const event of events) {
      logEvent(event.type, event.path, event.details)
    }

    writeJsonAtomic(statePath, current)
    previous = current
    updatePending(events)
  }

  tick()
  setInterval(tick, intervalMs)
}

main()
