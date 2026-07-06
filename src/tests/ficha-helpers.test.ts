import { describe, it, expect } from 'vitest'
import {
  crearFichaVacia,
  normalizarTexto,
  normalizarClave,
  indiceColumnaALetra,
  celda,
  rangoImagenDesdeCelda,
  extraerNombreCarpeta,
  extraerFechaDeCarpeta,
  extraerOperadorDeCarpeta,
  normalizarFicha,
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
  })
})
