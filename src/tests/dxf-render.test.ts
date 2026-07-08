import { describe, it, expect } from 'vitest'
import {
  ventanaDe,
  mundoAPixel,
  dibujarEntidades,
  aplanarInserts,
  bboxEntidades,
  type EntidadDxf,
  type Ventana,
} from '@/lib/dxf-render'

function ctxMock() {
  const llamadas: Record<string, unknown[]> = {}
  const numArgs: number[] = []
  const proxy = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === '__numArgs') return numArgs
        if (prop === '__llamadas') return llamadas
        return (...args: unknown[]) => {
          llamadas[prop] = llamadas[prop] || []
          llamadas[prop].push(args)
          for (const a of args)
            if (typeof a === 'number') numArgs.push(a)
          return undefined
        }
      },
      set(_t, prop: string, value: unknown) {
        llamadas[`set:${prop}`] = llamadas[`set:${prop}`] || []
        llamadas[`set:${prop}`].push([value])
        return true
      },
    },
  )
  return proxy as unknown as CanvasRenderingContext2D & {
    __numArgs: number[]
    __llamadas: Record<string, unknown[][]>
  }
}

describe('ventanaDe / mundoAPixel', () => {
  it('centra la ventana de 100 cm en (100,100)', () => {
    const v = ventanaDe(100, 100, 100)
    expect(v).toEqual({ x0: 50, x1: 150, y0: 50, y1: 150 })
  })

  it('mapea el centro del mundo al centro del canvas (flip Y)', () => {
    const v = ventanaDe(100, 100, 100)
    const c = mundoAPixel(100, 100, v, 1000)
    expect(c.px).toBe(500)
    expect(c.py).toBe(500)
  })

  it('mapea esquina sup-izq del mundo a sup-izq del canvas', () => {
    const v = ventanaDe(100, 100, 100)
    const es = mundoAPixel(50, 150, v, 1000)
    expect(es.px).toBe(0)
    expect(es.py).toBe(0)
    const ei = mundoAPixel(50, 50, v, 1000)
    expect(ei.px).toBe(0)
    expect(ei.py).toBe(1000)
  })
})

describe('dibujarEntidades', () => {
  const v: Ventana = ventanaDe(100, 100, 100)

  it('dibuja LINE, CIRCLE, ARC, LWPOLYLINE y TEXT sin NaN', () => {
    const entidades: EntidadDxf[] = [
      { type: 'LINE', vertices: [{ x: 95, y: 95 }, { x: 105, y: 105 }] },
      { type: 'CIRCLE', center: { x: 100, y: 100 }, radius: 3 },
      { type: 'ARC', center: { x: 100, y: 100 }, radius: 5, startAngle: 0, endAngle: Math.PI / 2 },
      { type: 'LWPOLYLINE', vertices: [{ x: 98, y: 98 }, { x: 102, y: 98 }, { x: 102, y: 102 }], shape: true },
      { type: 'TEXT', startPoint: { x: 100, y: 107 }, textHeight: 2, text: 'P1' },
    ]
    const ctx = ctxMock()
    dibujarEntidades(ctx, entidades, v, 1000)
    for (const n of ctx.__numArgs) expect(Number.isFinite(n)).toBe(true)
    expect(ctx.__llamadas.moveTo.length).toBeGreaterThanOrEqual(3)
    expect(ctx.__llamadas.stroke.length).toBe(4)
    expect(ctx.__llamadas.fillText?.[0]?.[0]).toBe('P1')
  })

  it('ignora INSERT sin bloque y entidades malformadas', () => {
    const ctx = ctxMock()
    dibujarEntidades(
      ctx,
      [
        { type: 'INSERT' },
        { type: 'LINE', vertices: [] },
        { type: 'CIRCLE' },
      ],
      v,
      1000,
    )
    expect(ctx.__llamadas.stroke).toBeUndefined()
  })
})

describe('aplanarInserts', () => {
  it('expande un bloque INSERT con posicion y escala', () => {
    const blocks = {
      B: {
        name: 'B',
        entities: [
          { type: 'LINE', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
          { type: 'CIRCLE', center: { x: 5, y: 5 }, radius: 2 },
        ],
      },
    }
    const entidades: EntidadDxf[] = [
      { type: 'INSERT', name: 'B', position: { x: 100, y: 100 }, xScale: 2, yScale: 2 },
    ]
    const plano = aplanarInserts(entidades, blocks)
    const linea = plano.find(e => e.type === 'LINE') as EntidadDxf
    expect(linea.vertices).toEqual([
      { x: 100, y: 100 },
      { x: 120, y: 100 },
    ])
    const circ = plano.find(e => e.type === 'CIRCLE') as EntidadDxf
    expect(circ.center).toEqual({ x: 110, y: 110 })
    expect(circ.radius).toBe(4)
  })

  it('aplica rotacion del INSERT', () => {
    const blocks = {
      B: { name: 'B', entities: [{ type: 'LINE', vertices: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }] },
    }
    const entidades: EntidadDxf[] = [
      { type: 'INSERT', name: 'B', position: { x: 0, y: 0 }, rotation: 90 },
    ]
    const plano = aplanarInserts(entidades, blocks)
    const linea = plano[0]
    expect(linea.vertices![0].x).toBeCloseTo(0, 5)
    expect(linea.vertices![0].y).toBeCloseTo(1, 5)
  })

  it('evita recursion infinita entre bloques', () => {
    const blocks = {
      A: { name: 'A', entities: [{ type: 'INSERT', name: 'B' }] },
      B: { name: 'B', entities: [{ type: 'INSERT', name: 'A' }] },
    }
    const plano = aplanarInserts([{ type: 'INSERT', name: 'A' }], blocks)
    expect(plano).toEqual([])
  })
})

describe('bboxEntidades', () => {
  it('calcula el bounding box de varias entidades', () => {
    const entidades: EntidadDxf[] = [
      { type: 'LINE', vertices: [{ x: 10, y: 10 }, { x: 20, y: 30 }] },
      { type: 'CIRCLE', center: { x: 50, y: 50 }, radius: 5 },
    ]
    const b = bboxEntidades(entidades)
    expect(b).toEqual({ minX: 10, minY: 10, maxX: 55, maxY: 55 })
  })

  it('devuelve null si no hay geometria dibujable', () => {
    expect(bboxEntidades([{ type: 'INSERT' }])).toBeNull()
  })
})
