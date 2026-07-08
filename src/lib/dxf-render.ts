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
  const size = opts.size ?? 100
  const L = opts.resolucion ?? 1000
  const v = ventanaDe(opts.x, opts.y, size)

  const doc = new DxfParser().parseSync(textoDxf)
  if (!doc) throw new Error('DXF inválido o vacío')
  const entidades = ((doc.entities ?? []) as EntidadDxf[]).filter(
    e => e.type !== 'INSERT',
  )

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
  dibujarEntidades(ctx, entidades, v, L)
  ctx.restore()

  return canvas.toDataURL('image/png')
}
