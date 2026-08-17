/**
 * Pruebas del flujo automatico de croquis: deteccion de DWG en leerCarpeta,
 * agrupado por DWG con mapeo clave->punto, y extraccion de x,y via excel-sync.
 * Ejecutar con: npx vitest run src/tests/auto-croquis.test.ts
 */

import { describe, it, expect } from 'vitest'
import { leerCarpeta } from '@/lib/folder-parser'
import { agruparPorDwg } from '@/lib/auto-croquis'
import { procesarArchivoSincronizacion } from '@/lib/excel-sync'

function fakeFile(name: string, relPath: string): File {
  const f = new File([name], name, { type: 'application/octet-stream' })
  Object.defineProperty(f, 'webkitRelativePath', { value: relPath, configurable: true })
  return f
}

function asFileList(files: File[]): FileList {
  return files as unknown as FileList
}

describe('Precedencia de DWG en leerCarpeta', () => {
  it('el DWG de la subcarpeta del punto gana sobre el de la raiz', async () => {
    const raiz = fakeFile('plano.dwg', 'obra/plano.dwg')
    const sub = fakeFile('propio.dwg', 'obra/Croquis/propio.dwg')
    const archivos = await leerCarpeta(asFileList([raiz, sub]))
    expect(archivos.dwg).toBe(sub)
  })

  it('usa el unico DWG en la raiz cargada', async () => {
    const raiz = fakeFile('plano.dwg', 'obra/plano.dwg')
    const csv = fakeFile('punto.csv', 'obra/punto.csv')
    const archivos = await leerCarpeta(asFileList([raiz, csv]))
    expect(archivos.dwg).toBe(raiz)
  })

  it('ignora el DWG de raiz si hay mas de uno (ambiguo)', async () => {
    const a = fakeFile('a.dwg', 'obra/a.dwg')
    const b = fakeFile('b.dwg', 'obra/b.dwg')
    const archivos = await leerCarpeta(asFileList([a, b]))
    expect(archivos.dwg).toBeUndefined()
  })

  it('sin DWG queda undefined', async () => {
    const csv = fakeFile('punto.csv', 'obra/punto.csv')
    const archivos = await leerCarpeta(asFileList([csv]))
    expect(archivos.dwg).toBeUndefined()
  })

  it('procesarCarpetaPunto expone el dwg en DatosPuntoCarpeta', async () => {
    const raiz = fakeFile('plano.dwg', '01_punto/plano.dwg')
    const archivos = await leerCarpeta(asFileList([raiz]))
    expect(archivos.nombreCarpeta).toBe('01_punto')
    expect(archivos.dwg).toBe(raiz)
  })
})

describe('Mapeo clave (subcarpeta) -> punto en el batch', () => {
  it('agrupa puntos por DWG conservando clave y puntoId', () => {
    const dwgComun = fakeFile('plano.dwg', 'obra/plano.dwg')
    const dwgOtro = fakeFile('otro.dwg', 'obra/02_p/otro.dwg')
    const items = [
      { clave: '01_puntoA', x: 351000.5, y: 6280000.25, dwg: dwgComun, puntoId: 'id-a' },
      { clave: '02_puntoB', x: 351002.5, y: 6280010.25, dwg: dwgComun, puntoId: 'id-b' },
      { clave: '03_puntoC', x: 351004.5, y: 6280020.25, dwg: dwgOtro, puntoId: 'id-c' },
    ]
    const grupos = agruparPorDwg(items)
    expect(grupos.size).toBe(2)
    const comunes = grupos.get(dwgComun)!
    expect(comunes.map(i => i.clave)).toEqual(['01_puntoA', '02_puntoB'])
    expect(comunes.find(i => i.clave === '02_puntoB')?.puntoId).toBe('id-b')
    expect(grupos.get(dwgOtro)?.[0].puntoId).toBe('id-c')
  })
})

describe('Extraccion de x,y del CSV de sincronizacion', () => {
  it('procesarArchivoSincronizacion entrega x,y finitos de la fila', async () => {
    const csv = 'P1,351000.5,6280000.25,100.0,EUR\nP2,351002.5,6280010.25,101.0,EUR\n'
    const buffer = new TextEncoder().encode(csv).buffer as ArrayBuffer
    const { filas } = await procesarArchivoSincronizacion(buffer, 'puntos.csv')
    expect(filas.length).toBe(2)
    expect(filas[0].x).toBeCloseTo(351000.5)
    expect(filas[0].y).toBeCloseTo(6280000.25)
    expect(Number.isFinite(filas[1].x)).toBe(true)
    expect(Number.isFinite(filas[1].y)).toBe(true)
  })
})
