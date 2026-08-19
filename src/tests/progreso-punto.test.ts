import { describe, it, expect } from 'vitest'
import { calcularProgresoPunto, camposRequeridos, puntosListosParaExportar, COORDS_BASE_FICHA } from '@/lib/progreso-punto'
import type { PuntoFerroviario } from '@/types'

function makePunto(moduloData: Record<string, unknown>): PuntoFerroviario {
  return {
    id: 'p1',
    numeroSerie: 1,
    nombre: 'Puente Río A',
    moduloData: moduloData as PuntoFerroviario['moduloData'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const estadosDe = (p: PuntoFerroviario, plantillas: ReadonlyArray<{ id: string }> = []) =>
  Object.fromEntries(calcularProgresoPunto(p, plantillas).pasos.map(paso => [paso.id, paso.estado])) as Record<string, string>

const hechosDe = (p: PuntoFerroviario) =>
  Object.fromEntries(calcularProgresoPunto(p).pasos.map(paso => [paso.id, paso.hecho])) as Record<string, boolean>

describe('calcularProgresoPunto', () => {
  it('punto vacío: solo el paso Punto está done, Fotos es current y el resto pending', () => {
    const progreso = calcularProgresoPunto(makePunto({}))
    expect(estadosDe(makePunto({}))).toEqual({
      punto: 'done',
      fotos: 'current',
      analisis: 'pending',
      plantilla: 'pending',
      campos: 'pending',
    })
    expect(progreso.camposFaltantes).toEqual([...COORDS_BASE_FICHA])
    expect(progreso.plantillaEncontrada).toBe(false)
    expect(progreso.resumen).toBe('Punto ✓ · Fotos ✗ · Análisis ✗ · Plantilla ✗ · Campos 0/7')
  })

  it('con fotos indexadas: Fotos done y Análisis current', () => {
    const punto = makePunto({ analisis: { fotosIndexadas: [{ id: 'f1' }] } })
    expect(estadosDe(punto)).toEqual({
      punto: 'done',
      fotos: 'done',
      analisis: 'current',
      plantilla: 'pending',
      campos: 'pending',
    })
  })

  it('con resultados: Análisis done y Plantilla current', () => {
    const punto = makePunto({ analisis: { fotosIndexadas: [{ id: 'f1' }], results: [{ id: 'r1' }] } })
    expect(estadosDe(punto)).toEqual({
      punto: 'done',
      fotos: 'done',
      analisis: 'done',
      plantilla: 'current',
      campos: 'pending',
    })
  })

  it('con plantilla activa: Plantilla done y Campos current', () => {
    const punto = makePunto({
      analisis: { fotosIndexadas: [{ id: 'f1' }], results: [{ id: 'r1' }] },
      materiales: { valores: {}, plantillaActivaId: 'pl-1' },
    })
    expect(estadosDe(punto)).toEqual({
      punto: 'done',
      fotos: 'done',
      analisis: 'done',
      plantilla: 'done',
      campos: 'current',
    })
  })

  it('camposFaltantes reporta coords base y custom vacíos, ignorando etiquetas vacías', () => {
    const punto = makePunto({
      materiales: {
        valores: { '0-F': 'CLAVE-1', '1-B': '   ', '2-C': '' },
        plantillaActivaId: 'pl-1',
        camposCustom: [
          { coord: '2-C', etiqueta: 'Vía' },
          { coord: '3-A', etiqueta: '   ' },
          { coord: '0-F', etiqueta: 'Duplicada' },
        ],
      },
    })
    expect(camposRequeridos(punto)).toEqual([...COORDS_BASE_FICHA, '2-C'])
    expect(calcularProgresoPunto(punto).camposFaltantes).toEqual(['1-B', '1-D', '1-F', '7-D', '7-F', '8-F', '2-C'])
  })

  it('valores completos (base + custom): todos los pasos done y sin campos faltantes', () => {
    const valores = Object.fromEntries(COORDS_BASE_FICHA.map(c => [c, 'x']))
    valores['2-C'] = 'ok'
    const punto = makePunto({
      analisis: { fotosIndexadas: [{ id: 'f1' }], results: [{ id: 'r1' }] },
      materiales: {
        valores,
        plantillaActivaId: 'pl-1',
        camposCustom: [{ coord: '2-C', etiqueta: 'Vía' }],
      },
    })
    const progreso = calcularProgresoPunto(punto)
    expect(progreso.pasos.every(paso => paso.hecho)).toBe(true)
    expect(progreso.pasos.every(paso => paso.estado === 'done')).toBe(true)
    expect(progreso.camposFaltantes).toEqual([])
    expect(progreso.resumen).toBe('Punto ✓ · Fotos ✓ · Análisis ✓ · Plantilla ✓ · Campos 8/8')
  })

  it('display secuencial: un paso hecho después del primer pendiente se muestra pending', () => {
    const punto = makePunto({ analisis: { results: [{ id: 'r1' }] } })
    expect(hechosDe(punto).analisis).toBe(true)
    expect(estadosDe(punto).analisis).toBe('pending')
    expect(estadosDe(punto).fotos).toBe('current')
  })

  it('plantillaEncontrada solo cuando el id activo existe en la lista recibida', () => {
    const punto = makePunto({ materiales: { valores: {}, plantillaActivaId: 'pl-9' } })
    expect(calcularProgresoPunto(punto).plantillaEncontrada).toBe(false)
    expect(calcularProgresoPunto(punto, [{ id: 'otra' }]).plantillaEncontrada).toBe(false)
    expect(calcularProgresoPunto(punto, [{ id: 'pl-9' }]).plantillaEncontrada).toBe(true)
  })
})

describe('puntosListosParaExportar', () => {
  const valoresCompletos = Object.fromEntries(COORDS_BASE_FICHA.map(c => [c, 'x']))

  it('devuelve solo los ids con los 5 pasos hechos', () => {
    const listo = makePunto({
      analisis: { fotosIndexadas: [{ id: 'f1' }], results: [{ id: 'r1' }] },
      materiales: { valores: valoresCompletos, plantillaActivaId: 'pl-1' },
    })
    const sinPlantilla = makePunto({
      analisis: { fotosIndexadas: [{ id: 'f1' }], results: [{ id: 'r1' }] },
      materiales: { valores: valoresCompletos },
    })
    const sinCampos = makePunto({
      analisis: { fotosIndexadas: [{ id: 'f1' }], results: [{ id: 'r1' }] },
      materiales: { valores: {}, plantillaActivaId: 'pl-1' },
    })
    const ids = puntosListosParaExportar([listo, sinPlantilla, sinCampos])
    expect(ids).toEqual(['p1'])
  })

  it('lista vacía no rompe', () => {
    expect(puntosListosParaExportar([])).toEqual([])
  })
})
