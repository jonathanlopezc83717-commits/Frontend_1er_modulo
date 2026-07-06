import { describe, it, expect } from 'vitest'
import { parsearRespuestaAnalisis } from '@/lib/openrouter'

describe('parsearRespuestaAnalisis', () => {
  const MODELO = 'GPT-4o'

  it('parsea un JSON válido con todos los campos', () => {
    const content = '{"description":"Vía férrea","objects":["riel","durmiente"],"mood":"soleado","quality":"buena"}'
    const r = parsearRespuestaAnalisis(content, MODELO)
    expect(r.description).toBe('Vía férrea')
    expect(r.objects).toEqual(['riel', 'durmiente'])
    expect(r.mood).toBe('soleado')
    expect(r.quality).toBe('buena')
    expect(r.modelUsed).toBe(MODELO)
    expect(r.rawResponse).toBe(content)
  })

  it('extrae el JSON aunque venga rodeado de prosa', () => {
    const content = 'Aquí el resultado:\n{"description":"Terraplén","objects":[],"mood":"","quality":""}\nListo.'
    const r = parsearRespuestaAnalisis(content, MODELO)
    expect(r.description).toBe('Terraplén')
    expect(r.objects).toEqual([])
  })

  it('aplica defaults cuando faltan campos en el JSON', () => {
    const content = '{"description":"Solo descripción"}'
    const r = parsearRespuestaAnalisis(content, MODELO)
    expect(r.description).toBe('Solo descripción')
    expect(r.objects).toEqual([])
    expect(r.mood).toBe('')
    expect(r.quality).toBe('')
  })

  it('usa string vacío si description viene vacía en el JSON', () => {
    const content = '{"description":""}'
    const r = parsearRespuestaAnalisis(content, MODELO)
    expect(r.description).toBe('No se generó descripción')
  })

  it('ignora objects si no es un array', () => {
    const content = '{"description":"x","objects":"no-es-array"}'
    const r = parsearRespuestaAnalisis(content, MODELO)
    expect(r.objects).toEqual([])
  })

  it('cae al fallback con texto plano (sin JSON)', () => {
    const content = 'Respuesta en lenguaje natural sin estructura.'
    const r = parsearRespuestaAnalisis(content, MODELO)
    expect(r.description).toBe(content)
    expect(r.objects).toEqual([])
    expect(r.mood).toBe('')
    expect(r.quality).toBe('')
    expect(r.rawResponse).toBe(content)
  })

  it('cae al fallback con JSON malformado', () => {
    const content = '{"description": roto, "objects":[}'
    const r = parsearRespuestaAnalisis(content, MODELO)
    expect(r.description).toBe(content)
    expect(r.objects).toEqual([])
  })
})
