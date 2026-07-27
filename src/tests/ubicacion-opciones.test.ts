import { describe, it, expect } from 'vitest'
import {
  type OpcionUbicacion,
  OPCIONES_UBICACION,
  esOpcionDoble,
  parseLados,
  etiquetasCoordenadasPara,
  esCoordenadaPrimaria,
  etiquetaBaseFromSufijada,
  reconciliarDatosPorUbicacion,
  valorCoordenadaPrimaria,
} from '@/components/modulos/ubicacion-opciones'

describe('ubicacion-opciones', () => {
  describe('OPCIONES_UBICACION', () => {
    it('tiene exactamente 9 opciones en el orden del proposal', () => {
      expect(OPCIONES_UBICACION).toEqual([
        'Izquierda',
        'Derecha',
        'Centro',
        'Izquierda-Derecha',
        'Izquierda-Centro',
        'Derecha-Izquierda',
        'Derecha-Centro',
        'Centro-Izquierda',
        'Centro-Derecha',
      ])
    })
  })

  describe('esOpcionDoble', () => {
    it('simple -> false, double -> true, vacio/undefined -> false', () => {
      expect(esOpcionDoble('Izquierda')).toBe(false)
      expect(esOpcionDoble('Izquierda-Derecha')).toBe(true)
      expect(esOpcionDoble('')).toBe(false)
      expect(esOpcionDoble(undefined)).toBe(false)
    })
  })

  describe('parseLados', () => {
    it('simple -> [lado, null]', () => {
      expect(parseLados('Izquierda')).toEqual(['Izquierda', null])
    })
    it('double -> [lado1, lado2]', () => {
      expect(parseLados('Izquierda-Derecha')).toEqual(['Izquierda', 'Derecha'])
      expect(parseLados('Centro-Izquierda')).toEqual(['Centro', 'Izquierda'])
    })
  })

  describe('etiquetasCoordenadasPara', () => {
    it('simple -> 3 etiquetas base sin sufijo', () => {
      expect(etiquetasCoordenadasPara('Izquierda')).toEqual([
        'Coordenada "X"',
        'Coordenada "Y"',
        'Coordenada "Z"',
      ])
    })
    it('vacio/undefined -> 3 etiquetas base (default retrocompatible)', () => {
      const esperadas = ['Coordenada "X"', 'Coordenada "Y"', 'Coordenada "Z"']
      expect(etiquetasCoordenadasPara('')).toEqual(esperadas)
      expect(etiquetasCoordenadasPara(undefined)).toEqual(esperadas)
    })
    it('Izquierda-Derecha -> 6 etiquetas, sufijo (Izq) luego (Der)', () => {
      expect(etiquetasCoordenadasPara('Izquierda-Derecha')).toEqual([
        'Coordenada "X" (Izq)',
        'Coordenada "Y" (Izq)',
        'Coordenada "Z" (Izq)',
        'Coordenada "X" (Der)',
        'Coordenada "Y" (Der)',
        'Coordenada "Z" (Der)',
      ])
    })
    it('las 6 permutaciones dobles producen el orden de sufijos correcto', () => {
      const casos: Array<[OpcionUbicacion, [string, string]]> = [
        ['Izquierda-Derecha', ['(Izq)', '(Der)']],
        ['Izquierda-Centro', ['(Izq)', '(Cen)']],
        ['Derecha-Izquierda', ['(Der)', '(Izq)']],
        ['Derecha-Centro', ['(Der)', '(Cen)']],
        ['Centro-Izquierda', ['(Cen)', '(Izq)']],
        ['Centro-Derecha', ['(Cen)', '(Der)']],
      ]
      for (const [op, [s1, s2]] of casos) {
        const etiquetas = etiquetasCoordenadasPara(op)
        expect(etiquetas).toHaveLength(6)
        expect(etiquetas[0]).toBe(`Coordenada "X" ${s1}`)
        expect(etiquetas[3]).toBe(`Coordenada "X" ${s2}`)
      }
    })
  })

  describe('esCoordenadaPrimaria', () => {
    it('simple/vacio -> etiquetas base son primarias', () => {
      expect(esCoordenadaPrimaria('Coordenada "X"', 'Izquierda')).toBe(true)
      expect(esCoordenadaPrimaria('Coordenada "Y"', '')).toBe(true)
      expect(esCoordenadaPrimaria('Coordenada "Z"', undefined)).toBe(true)
    })
    it('double -> sufijo del lado primario es primaria, el otro no', () => {
      expect(esCoordenadaPrimaria('Coordenada "X" (Izq)', 'Izquierda-Derecha')).toBe(true)
      expect(esCoordenadaPrimaria('Coordenada "X" (Der)', 'Izquierda-Derecha')).toBe(false)
      expect(esCoordenadaPrimaria('Coordenada "X" (Cen)', 'Centro-Izquierda')).toBe(true)
      expect(esCoordenadaPrimaria('Coordenada "X" (Izq)', 'Centro-Izquierda')).toBe(false)
    })
    it('campo no-coordenada nunca es primaria', () => {
      expect(esCoordenadaPrimaria('Estado fisico', 'Izquierda')).toBe(false)
      expect(esCoordenadaPrimaria('Segmento', 'Izquierda-Derecha')).toBe(false)
    })
  })

  describe('etiquetaBaseFromSufijada', () => {
    it('strips el sufijo (Izq|Der|Cen)', () => {
      expect(etiquetaBaseFromSufijada('Coordenada "X" (Izq)')).toBe('Coordenada "X"')
      expect(etiquetaBaseFromSufijada('Coordenada "Y" (Der)')).toBe('Coordenada "Y"')
      expect(etiquetaBaseFromSufijada('Coordenada "Z" (Cen)')).toBe('Coordenada "Z"')
    })
    it('idempotente en etiquetas base y en campos no-coordenada', () => {
      expect(etiquetaBaseFromSufijada('Coordenada "X"')).toBe('Coordenada "X"')
      expect(etiquetaBaseFromSufijada('Estado fisico')).toBe('Estado fisico')
    })
  })

  describe('reconciliarDatosPorUbicacion', () => {
    const datosSimples = [
      { etiqueta: 'Segmento', valor: 'S1' },
      { etiqueta: 'Ubicacion respecto al eje de proyecto', valor: 'Izquierda' },
      { etiqueta: 'Coordenada "X"', valor: '1' },
      { etiqueta: 'Coordenada "Y"', valor: '2' },
      { etiqueta: 'Coordenada "Z"', valor: '3' },
    ]

    it('simple->double: preserva no-coordenadas, copia base a primaria, secundaria vacia', () => {
      const out = reconciliarDatosPorUbicacion(datosSimples, 'Izquierda-Derecha')
      const porEtq = Object.fromEntries(out.map(d => [d.etiqueta, d.valor]))
      expect(porEtq['Segmento']).toBe('S1')
      expect(porEtq['Coordenada "X" (Izq)']).toBe('1')
      expect(porEtq['Coordenada "Y" (Izq)']).toBe('2')
      expect(porEtq['Coordenada "Z" (Izq)']).toBe('3')
      expect(porEtq['Coordenada "X" (Der)']).toBe('')
      expect(porEtq['Coordenada "Y" (Der)']).toBe('')
      expect(porEtq['Coordenada "Z" (Der)']).toBe('')
      expect(out.filter(d => d.etiqueta.startsWith('Coordenada'))).toHaveLength(6)
    })

    it('double->simple: primaria vuelve a etiquetas base; secundaria descartada', () => {
      const datosDoble = [
        { etiqueta: 'Ubicacion respecto al eje de proyecto', valor: 'Izquierda-Derecha' },
        { etiqueta: 'Coordenada "X" (Izq)', valor: '1' },
        { etiqueta: 'Coordenada "Y" (Izq)', valor: '2' },
        { etiqueta: 'Coordenada "Z" (Izq)', valor: '3' },
        { etiqueta: 'Coordenada "X" (Der)', valor: '4' },
        { etiqueta: 'Coordenada "Y" (Der)', valor: '5' },
        { etiqueta: 'Coordenada "Z" (Der)', valor: '6' },
      ]
      const out = reconciliarDatosPorUbicacion(datosDoble, 'Izquierda')
      const porEtq = Object.fromEntries(out.map(d => [d.etiqueta, d.valor]))
      expect(porEtq['Coordenada "X"']).toBe('1')
      expect(porEtq['Coordenada "Y"']).toBe('2')
      expect(porEtq['Coordenada "Z"']).toBe('3')
      expect(out.filter(d => d.etiqueta.startsWith('Coordenada'))).toHaveLength(3)
    })
  })

  describe('valorCoordenadaPrimaria', () => {
    it('simple: devuelve el valor de la etiqueta base', () => {
      const ficha = {
        datos: [
          { etiqueta: 'Ubicacion respecto al eje de proyecto', valor: 'Izquierda' },
          { etiqueta: 'Coordenada "X"', valor: '100' },
          { etiqueta: 'Coordenada "Y"', valor: '200' },
        ],
      }
      expect(valorCoordenadaPrimaria(ficha, 'X')).toBe('100')
      expect(valorCoordenadaPrimaria(ficha, 'Y')).toBe('200')
    })
    it('double: devuelve el valor del lado primario', () => {
      const ficha = {
        datos: [
          { etiqueta: 'Ubicacion respecto al eje de proyecto', valor: 'Izquierda-Derecha' },
          { etiqueta: 'Coordenada "X" (Izq)', valor: '11' },
          { etiqueta: 'Coordenada "X" (Der)', valor: '44' },
        ],
      }
      expect(valorCoordenadaPrimaria(ficha, 'X')).toBe('11')
    })
    it('devuelve cadena vacia si no hay coincidencia', () => {
      const ficha = { datos: [{ etiqueta: 'Estado fisico', valor: 'Bueno' }] }
      expect(valorCoordenadaPrimaria(ficha, 'X')).toBe('')
    })
  })
})
