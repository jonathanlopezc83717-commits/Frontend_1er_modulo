import { describe, it, expect } from 'vitest'
import {
  crearFichaVacia,
  etiquetaBaseDe,
  normalizarTexto,
  normalizarClave,
  indiceColumnaALetra,
  celda,
  rangoImagenDesdeCelda,
  extraerNombreCarpeta,
  extraerFechaDeCarpeta,
  extraerOperadorDeCarpeta,
  normalizarFicha,
  asignarCampo,
  detectarMapeo,
  obtenerValoresFicha,
  extraerDescripcionAnalisis,
  extraerEvidenciasAnalisis,
} from '@/components/modulos/ficha-helpers'

describe('ficha-helpers', () => {
  describe('crearFichaVacia', () => {
    it('genera una ficha con todos los campos de datos vacíos', () => {
      const f = crearFichaVacia()
      expect(f.datos.length).toBeGreaterThan(0)
      expect(f.datos.every(c => c.valor === '')).toBe(true)
      expect(f.evidencias).toEqual(['', '', '', ''])
      expect(f.titulo).toContain('FICHA')
    })
    it('sin opcion -> 3 coordenadas base (retrocompatible)', () => {
      const f = crearFichaVacia()
      const coords = f.datos.filter(c => c.etiqueta.startsWith('Coordenada'))
      expect(coords.map(c => c.etiqueta)).toEqual([
        'Coordenada "X"', 'Coordenada "Y"', 'Coordenada "Z"',
      ])
    })
    it('opcion doble -> 6 coordenadas con sufijo', () => {
      const f = crearFichaVacia('Izquierda-Derecha')
      const coords = f.datos.filter(c => c.etiqueta.startsWith('Coordenada'))
      expect(coords).toHaveLength(6)
      expect(coords.map(c => c.etiqueta)).toEqual([
        'Coordenada "X" (Izq)', 'Coordenada "Y" (Izq)', 'Coordenada "Z" (Izq)',
        'Coordenada "X" (Der)', 'Coordenada "Y" (Der)', 'Coordenada "Z" (Der)',
      ])
    })
  })

  describe('normalizarTexto', () => {
    it('recorta y normaliza saltos de línea', () => {
      expect(normalizarTexto('  hola\r\nmundo  ')).toBe('hola\nmundo')
    })
    it('maneja null/undefined', () => {
      expect(normalizarTexto(null)).toBe('')
      expect(normalizarTexto(undefined)).toBe('')
    })
  })

  describe('normalizarClave', () => {
    it('lowercase + sin acentos + snake_case', () => {
      expect(normalizarClave('Coordenada "X"')).toBe('coordenada_x')
      expect(normalizarClave('Número de Fases')).toBe('numero_de_fases')
    })
    it('resuelve alias vía el diccionario externo cuando aplica', () => {
      expect(normalizarClave('Tipo de instalacion')).toBe('tipo_de_instalacion')
    })
  })

  describe('indiceColumnaALetra / celda', () => {
    it('convierte índices a letras estilo Excel', () => {
      expect(indiceColumnaALetra(0)).toBe('A')
      expect(indiceColumnaALetra(25)).toBe('Z')
      expect(indiceColumnaALetra(26)).toBe('AA')
    })
    it('celda combina columna + fila 1-indexed', () => {
      expect(celda(0, 0)).toBe('A1')
      expect(celda(9, 5)).toBe('F10')
    })
  })

  describe('rangoImagenDesdeCelda', () => {
    it('expande la celda a un rango de 3 columnas y fila siguiente', () => {
      expect(rangoImagenDesdeCelda('A10')).toBe('A10:C11')
    })
    it('cae a celda:celda si el formato no calza', () => {
      expect(rangoImagenDesdeCelda('no-valido')).toBe('no-valido:no-valido')
    })
  })

  describe('extraerNombreCarpeta', () => {
    it('toma el último segmento de la ruta', () => {
      expect(extraerNombreCarpeta('a/b/c')).toBe('c')
      expect(extraerNombreCarpeta('a\\b\\c')).toBe('c')
    })
    it('devuelve la entrada si no hay separadores', () => {
      expect(extraerNombreCarpeta('solito')).toBe('solito')
    })
  })

  describe('extraerFechaDeCarpeta', () => {
    it('extrae fecha dd_mm_aaaa a dd/mm/aaaa', () => {
      expect(extraerFechaDeCarpeta('Operador 01_02_2024 resto')).toBe('01/02/2024')
    })
    it('cadena vacía si no hay fecha', () => {
      expect(extraerFechaDeCarpeta('sin fecha')).toBe('')
    })
  })

  describe('extraerOperadorDeCarpeta', () => {
    it('recorta desde la fecha en adelante', () => {
      expect(extraerOperadorDeCarpeta('Juan Pérez 03_04_2024 algo')).toBe('Juan Pérez')
    })
  })

  describe('normalizarFicha', () => {
    it('devuelve ficha vacía ante entrada inválida', () => {
      expect(normalizarFicha(null).datos.length).toBeGreaterThan(0)
      expect(normalizarFicha('x').titulo).toContain('FICHA')
    })
    it('conserva campos válidos y rellena los faltantes', () => {
      const f = normalizarFicha({ titulo: 'X', proyecto: 'P' })
      expect(f.titulo).toBe('X')
      expect(f.proyecto).toBe('P')
      expect(f.evidencias).toEqual(['', '', '', ''])
    })
    it('merge por etiqueta: round-trip de ficha doble sin truncar', () => {
      const original = crearFichaVacia('Izquierda-Derecha')
      const idxUbic = original.datos.findIndex(d => d.etiqueta === 'Ubicacion respecto al eje de proyecto')
      original.datos[idxUbic].valor = 'Izquierda-Derecha'
      const idxSeg = original.datos.findIndex(d => d.etiqueta === 'Segmento')
      original.datos[idxSeg].valor = 'SegmentoValor'
      const idxXIzq = original.datos.findIndex(d => d.etiqueta === 'Coordenada "X" (Izq)')
      original.datos[idxXIzq].valor = '123'
      const normalizada = normalizarFicha(original)
      const porEtq = Object.fromEntries(normalizada.datos.map(d => [d.etiqueta, d.valor]))
      expect(porEtq['Segmento']).toBe('SegmentoValor')
      expect(porEtq['Coordenada "X" (Izq)']).toBe('123')
      expect(normalizada.datos.filter(d => d.etiqueta.startsWith('Coordenada'))).toHaveLength(6)
    })
    it('preserva etiquetas inesperadas al final del array', () => {
      const f = crearFichaVacia()
      const conExtra = {
        ...f,
        datos: [...f.datos, { etiqueta: 'CampoCustom', valor: 'X' }],
      }
      const normalizada = normalizarFicha(conExtra)
      expect(normalizada.datos.find(d => d.etiqueta === 'CampoCustom')?.valor).toBe('X')
    })
  })

  describe('etiquetaBaseDe + crearFichaVacia etiquetaBase', () => {
    it('crearFichaVacia marca cada campo con etiquetaBase igual a etiqueta', () => {
      const f = crearFichaVacia()
      expect(f.datos.every(c => c.etiquetaBase === c.etiqueta)).toBe(true)
    })
    it('etiquetaBaseDe cae a etiqueta cuando falta etiquetaBase', () => {
      expect(etiquetaBaseDe({ etiqueta: 'Fecha' })).toBe('Fecha')
    })
  })

  describe('normalizarFicha (re-key por etiquetaBase)', () => {
    it('S1: renombra Fecha->Dia y hace merge sobre el slot Fecha', () => {
      const base = crearFichaVacia()
      const idx = base.datos.findIndex(d => d.etiqueta === 'Fecha')
      base.datos[idx] = { etiqueta: 'Día', valor: '2024', etiquetaBase: 'Fecha' }
      const norm = normalizarFicha(base)
      const slot = norm.datos.find(d => etiquetaBaseDe(d) === 'Fecha')
      expect(slot?.etiqueta).toBe('Día')
      expect(slot?.valor).toBe('2024')
      expect(slot?.etiquetaBase).toBe('Fecha')
      expect(norm.datos.filter(d => etiquetaBaseDe(d) === 'Fecha')).toHaveLength(1)
    })
    it('backward-compat: entrada sin etiquetaBase merge sobre slot por etiqueta', () => {
      const base = crearFichaVacia()
      const norm = normalizarFicha({
        ...base,
        datos: base.datos.map(d => ({ etiqueta: d.etiqueta, valor: d.etiqueta === 'Segmento' ? 'Seg' : '' })),
      })
      expect(norm.datos.find(d => d.etiqueta === 'Segmento')?.valor).toBe('Seg')
    })
  })

  describe('asignarCampo (fallback por etiquetaBase)', () => {
    it('S12 regression: etiqueta por defecto matchea', () => {
      const f = crearFichaVacia()
      asignarCampo(f.datos, 'Fecha:', '2024-01-01')
      expect(f.datos.find(d => d.etiqueta === 'Fecha')?.valor).toBe('2024-01-01')
    })
    it('campo renombrado matchea por etiquetaBase al importar Excel con etiqueta vieja', () => {
      const f = crearFichaVacia()
      const idx = f.datos.findIndex(d => d.etiqueta === 'Fecha')
      f.datos[idx] = { etiqueta: 'Día', valor: '', etiquetaBase: 'Fecha' }
      asignarCampo(f.datos, 'Fecha:', '2024-01-01')
      expect(f.datos.find(d => d.etiquetaBase === 'Fecha')?.valor).toBe('2024-01-01')
    })
  })

  describe('detectarMapeo labelCell', () => {
    it('registra labelCell para etiqueta-texto', () => {
      const rows = [['Fecha:', 'valor']]
      const mapeo = detectarMapeo(rows, 'Hoja1')
      expect(mapeo.campos.fecha.cell).toBe('B1')
      expect(mapeo.campos.fecha.labelCell).toBe('A1')
    })
    it('omite labelCell para placeholders {{...}}', () => {
      const rows = [['{{fecha}}']]
      const mapeo = detectarMapeo(rows, 'Hoja1')
      expect(mapeo.campos.fecha.labelCell).toBeUndefined()
    })
  })

  describe('extraerDescripcionAnalisis / extraerEvidenciasAnalisis', () => {
    it('saca la descripción de results[0] o descripcionGeneral', () => {
      expect(extraerDescripcionAnalisis({ results: [{ description: 'obra' }] })).toBe('obra')
      expect(extraerDescripcionAnalisis({ descripcionGeneral: 'gen' })).toBe('gen')
      expect(extraerDescripcionAnalisis(null)).toBe('')
    })
    it('arma 4 evidencias rellenando con vacío', () => {
      expect(extraerEvidenciasAnalisis({ imageUrls: ['a', 'b'] })).toEqual(['a', 'b', '', ''])
      expect(extraerEvidenciasAnalisis(null)).toEqual(['', '', '', ''])
    })
  })

  describe('detectarMapeo', () => {
    it('detecta placeholders {{campo}} y aplica defaults', () => {
      const rows = [['{{titulo}}'], ['{{proyecto}}']]
      const mapeo = detectarMapeo(rows, 'Hoja1')
      expect(mapeo.campos.titulo).toBeDefined()
      expect(mapeo.campos.proyecto).toBeDefined()
      expect(mapeo.campos.titulo.sheet).toBe('Hoja1')
      // defaults siempre presentes
      expect(mapeo.campos.clave.cell).toBe('F2')
      expect(mapeo.imagenes.croquis).toBeDefined()
    })
  })

  describe('obtenerValoresFicha', () => {
    it('mapea los campos de la ficha a claves planas', () => {
      const f = crearFichaVacia()
      f.titulo = 'T'
      f.proyecto = 'Proy'
      const v = obtenerValoresFicha(f)
      expect(v.titulo).toBe('T')
      expect(v.proyecto).toBe('Proy')
      expect(v.descripcion_izquierda).toBe('')
    })
    it('colapsa el sufijo primario a coordenada_x para dobles', () => {
      const f = crearFichaVacia('Izquierda-Derecha')
      const idxUbic = f.datos.findIndex(d => d.etiqueta === 'Ubicacion respecto al eje de proyecto')
      f.datos[idxUbic].valor = 'Izquierda-Derecha'
      const idxXIzq = f.datos.findIndex(d => d.etiqueta === 'Coordenada "X" (Izq)')
      f.datos[idxXIzq].valor = '470123.45'
      const idxXDer = f.datos.findIndex(d => d.etiqueta === 'Coordenada "X" (Der)')
      f.datos[idxXDer].valor = '470999.99'
      const v = obtenerValoresFicha(f)
      expect(v.coordenada_x).toBe('470123.45')
    })
  })
})
