import DxfParser from 'dxf-parser'

export interface OpcionesCroquis {
  x: number
  y: number
  size?: number
  resolucion?: number
  fondo?: string
  trazo?: string
}

export interface Ventana {
  x0: number
  x1: number
  y0: number
  y1: number
}

export interface EntidadDxf {
  type: string
  vertices?: Array<{ x: number; y: number }>
  center?: { x: number; y: number }
  radius?: number
  startAngle?: number
  endAngle?: number
  shape?: boolean
  startPoint?: { x: number; y: number }
  position?: { x: number; y: number }
  textHeight?: number
  text?: string
  name?: string
  xScale?: number
  yScale?: number
  rotation?: number
}

export interface BloqueDxf {
  name: string
  entities?: EntidadDxf[]
}

export function ventanaDe(x: number, y: number, size: number): Ventana {
  const media = size / 2
  return { x0: x - media, x1: x + media, y0: y - media, y1: y + media }
}

export function mundoAPixel(
  wx: number,
  wy: number,
  v: Ventana,
  L: number,
): { px: number; py: number } {
  const size = v.x1 - v.x0
  const sx = L / size
  return { px: (wx - v.x0) * sx, py: L - (wy - v.y0) * sx }
}

function teselarArco(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
): Array<{ x: number; y: number }> {
  if (a1 < a0) a1 += Math.PI * 2
  const N = 64
  const pts: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= N; i++) {
    const a = a0 + (a1 - a0) * (i / N)
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

interface TransformInsert {
  px: number
  py: number
  sx: number
  sy: number
  rot: number
}

function transformarPunto(p: { x: number; y: number }, t: TransformInsert) {
  const c = Math.cos(t.rot)
  const s = Math.sin(t.rot)
  return {
    x: p.x * t.sx * c - p.y * t.sy * s + t.px,
    y: p.x * t.sx * s + p.y * t.sy * c + t.py,
  }
}

// ponytail: escala no uniforme (xScale!=yScale) aproxima el radio con la media;
// para CIRCLE/ARC muy deformados usaría elipses. Suficiente para croquis.
function aplicarTransform(e: EntidadDxf, t: TransformInsert): EntidadDxf {
  const escala = (Math.abs(t.sx) + Math.abs(t.sy)) / 2
  switch (e.type) {
    case 'LINE':
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return { ...e, vertices: (e.vertices ?? []).map(v => transformarPunto(v, t)) }
    case 'CIRCLE':
      return e.center ? { ...e, center: transformarPunto(e.center, t), radius: (e.radius ?? 0) * escala } : e
    case 'ARC':
      return e.center
        ? {
            ...e,
            center: transformarPunto(e.center, t),
            radius: (e.radius ?? 0) * escala,
            startAngle: (e.startAngle ?? 0) + t.rot,
            endAngle: (e.endAngle ?? 0) + t.rot,
          }
        : e
    case 'TEXT': {
      const sp = e.startPoint ?? e.position
      const out: EntidadDxf = { ...e, textHeight: (e.textHeight ?? 2) * escala }
      if (sp) out.startPoint = transformarPunto(sp, t)
      return out
    }
    default:
      return e
  }
}

export function aplanarInserts(
  entidades: EntidadDxf[],
  blocks: Record<string, BloqueDxf>,
  visitados: Set<string> = new Set(),
): EntidadDxf[] {
  const out: EntidadDxf[] = []
  for (const e of entidades) {
    if (e.type !== 'INSERT' || !e.name || visitados.has(e.name)) {
      if (e.type !== 'INSERT') out.push(e)
      continue
    }
    const ents = blocks[e.name]?.entities ?? []
    const t: TransformInsert = {
      px: e.position?.x ?? 0,
      py: e.position?.y ?? 0,
      sx: e.xScale ?? 1,
      sy: e.yScale ?? 1,
      rot: ((e.rotation ?? 0) * Math.PI) / 180,
    }
    const sub = aplanarInserts(ents, blocks, new Set([...visitados, e.name]))
    out.push(...sub.map(s => aplicarTransform(s, t)))
  }
  return out
}

export interface Bbox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function bboxEntidades(entidades: EntidadDxf[]): Bbox | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let hay = false
  const comer = (x: number, y: number) => {
    hay = true
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (const e of entidades) {
    switch (e.type) {
      case 'LINE':
      case 'LWPOLYLINE':
      case 'POLYLINE':
        ;(e.vertices ?? []).forEach(v => comer(v.x, v.y))
        break
      case 'CIRCLE':
      case 'ARC': {
        const c = e.center
        const r = e.radius ?? 0
        if (c) {
          comer(c.x - r, c.y - r)
          comer(c.x + r, c.y + r)
        }
        break
      }
      case 'TEXT': {
        const sp = e.startPoint ?? e.position
        if (sp) comer(sp.x, sp.y)
        break
      }
    }
  }
  return hay ? { minX, minY, maxX, maxY } : null
}

export function dibujarEntidades(
  ctx: CanvasRenderingContext2D,
  entidades: EntidadDxf[],
  v: Ventana,
  L: number,
): void {
  const size = v.x1 - v.x0
  const sx = L / size
  const trazo = (wx: number, wy: number) => mundoAPixel(wx, wy, v, L)

  for (const e of entidades) {
    switch (e.type) {
      case 'LINE': {
        const vs = e.vertices ?? []
        if (vs.length < 2) break
        const a = trazo(vs[0].x, vs[0].y)
        const b = trazo(vs[1].x, vs[1].y)
        ctx.beginPath()
        ctx.moveTo(a.px, a.py)
        ctx.lineTo(b.px, b.py)
        ctx.stroke()
        break
      }
      case 'CIRCLE': {
        const c = e.center
        const r = e.radius ?? 0
        if (!c) break
        const p = trazo(c.x, c.y)
        ctx.beginPath()
        ctx.arc(p.px, p.py, Math.max(0, r) * sx, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
      case 'ARC': {
        const c = e.center
        const r = e.radius ?? 0
        if (!c) break
        const pts = teselarArco(c.x, c.y, r, e.startAngle ?? 0, e.endAngle ?? 0)
        ctx.beginPath()
        pts.forEach((w, i) => {
          const p = trazo(w.x, w.y)
          if (i === 0) ctx.moveTo(p.px, p.py)
          else ctx.lineTo(p.px, p.py)
        })
        ctx.stroke()
        break
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const vs = e.vertices ?? []
        if (vs.length < 2) break
        ctx.beginPath()
        vs.forEach((w, i) => {
          const p = trazo(w.x, w.y)
          if (i === 0) ctx.moveTo(p.px, p.py)
          else ctx.lineTo(p.px, p.py)
        })
        if (e.shape) ctx.closePath()
        ctx.stroke()
        break
      }
      case 'TEXT': {
        const sp = e.startPoint ?? e.position
        if (!sp) break
        const h = e.textHeight ?? 2
        const p = trazo(sp.x, sp.y)
        ctx.font = `${Math.max(6, h * sx)}px sans-serif`
        ctx.textBaseline = 'bottom'
        ctx.fillText(String(e.text ?? ''), p.px, p.py)
        break
      }
    }
  }
}

export function dxfACroquis(textoDxf: string, opts: OpcionesCroquis): string {
  const size = opts.size ?? 200
  const L = opts.resolucion ?? 1000
  const v = ventanaDe(opts.x, opts.y, size)

  const doc = new DxfParser().parseSync(textoDxf)
  if (!doc) throw new Error('DXF inválido o vacío')
  const plano = aplanarInserts(
    (doc.entities ?? []) as EntidadDxf[],
    (doc.blocks ?? {}) as Record<string, BloqueDxf>,
  )

  const bbox = bboxEntidades(plano)
  if (bbox) {
    const intersecta = !(
      v.x1 < bbox.minX ||
      v.x0 > bbox.maxX ||
      v.y1 < bbox.minY ||
      v.y0 > bbox.maxY
    )
    if (!intersecta) {
      throw new Error(
        `La coordenada (${opts.x}, ${opts.y}) cae fuera del dibujo. ` +
          `Extensión DXF: X[${Math.round(bbox.minX)}..${Math.round(bbox.maxX)}] ` +
          `Y[${Math.round(bbox.minY)}..${Math.round(bbox.maxY)}]. ` +
          `Revisa unidades (¿cm vs m?) u origen del punto.`,
      )
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = L
  canvas.height = L
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible en este navegador')
  ctx.fillStyle = opts.fondo ?? '#ffffff'
  ctx.fillRect(0, 0, L, L)
  ctx.strokeStyle = opts.trazo ?? '#000000'
  ctx.fillStyle = opts.trazo ?? '#000000'
  ctx.lineWidth = Math.max(1, L / 750)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, L, L)
  ctx.clip()
  dibujarEntidades(ctx, plano, v, L)
  ctx.restore()

  return canvas.toDataURL('image/png')
}
