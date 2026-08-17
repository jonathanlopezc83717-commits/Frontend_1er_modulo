// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { TablaSincronizacion } from '@/components/tabla/TablaSincronizacion'
import { crearColumnasComparacion, crearColumnasVistaPrevia } from '@/components/tabla/columnas'
import {
  atomColumnVisibility,
  cargarVisibilidadColumnas,
  guardarVisibilidadColumnas,
} from '@/components/tabla/visibilidad'
import type { FilaSincronizacion, ResultadoSincronizacion } from '@/lib/excel-sync'

const CLAVE = 'sincronizacion:columnas:v1'

function makeFila(overrides: Partial<FilaSincronizacion> = {}): FilaSincronizacion {
  return { numeroPunto: '000', x: 0, y: 0, z: 0, codigo: '', ...overrides }
}

function makeResultados(): ResultadoSincronizacion[] {
  return [
    {
      fila: makeFila({ numeroPunto: '202', codigo: 'EUR1', x: 1, y: 2, z: 3 }),
      filaIndex: 0,
      nomenclatura: { id: 'n1', codigo: 'EUR', definicion: 'Vía principal' },
      estado: 'ok',
    },
    {
      fila: makeFila({ numeroPunto: '101', x: 4, y: 5, z: 6 }),
      filaIndex: 1,
      estado: 'codigo_vacio',
    },
  ]
}

describe('visibilidad de columnas — persistencia', () => {
  beforeEach(() => {
    localStorage.clear()
    atomColumnVisibility.set({})
  })

  it('guarda y recupera el estado completo', () => {
    guardarVisibilidadColumnas({ x: false, y: true })
    expect(cargarVisibilidadColumnas()).toEqual({ x: false, y: true })
  })

  it('estado vacío por defecto (todas visibles)', () => {
    expect(cargarVisibilidadColumnas()).toEqual({})
    localStorage.removeItem(CLAVE)
    expect(cargarVisibilidadColumnas()).toEqual({})
  })

  it('descarta JSON inválido o valores no booleanos', () => {
    localStorage.setItem(CLAVE, '{no-json')
    expect(cargarVisibilidadColumnas()).toEqual({})
    localStorage.setItem(CLAVE, JSON.stringify({ x: 'si' }))
    expect(cargarVisibilidadColumnas()).toEqual({})
    localStorage.setItem(CLAVE, JSON.stringify([1, 2]))
    expect(cargarVisibilidadColumnas()).toEqual({})
  })
})

describe('definiciones de columnas', () => {
  it('crearColumnasComparacion define las 8 columnas con ids y encabezados estables', () => {
    const columnas = crearColumnasComparacion(vi.fn())
    expect(columnas.map((c) => c.id)).toEqual([
      'numeroPunto',
      'x',
      'cadenamiento',
      'y',
      'z',
      'codigo',
      'nomenclatura',
      'estado',
    ])
    expect(columnas.map((c) => c.header)).toEqual([
      'No. Punto',
      'X',
      'Cadenamiento',
      'Y',
      'Z',
      'Código',
      'Nomenclatura',
      'Estado',
    ])
  })

  it('crearColumnasVistaPrevia genera ids únicos y encabezados con fallback', () => {
    const columnas = crearColumnasVistaPrevia(['A', '', 'C'])
    expect(columnas.map((c) => c.id)).toEqual(['col-0', 'col-1', 'col-2'])
    expect(columnas.map((c) => c.header)).toEqual(['A', 'Columna 2', 'C'])
  })
})

describe('TablaSincronizacion — render', () => {
  beforeEach(() => {
    localStorage.clear()
    atomColumnVisibility.set({})
  })

  afterEach(() => cleanup())

  it('renderiza markup semántico: th scope=col, filas y celdas', () => {
    render(
      <TablaSincronizacion
        data={makeResultados()}
        columns={crearColumnasComparacion(vi.fn())}
        conFiltros
      />
    )
    const encabezados = screen.getAllByRole('columnheader')
    expect(encabezados).toHaveLength(8)
    for (const th of encabezados) {
      expect(th.getAttribute('scope')).toBe('col')
    }
    expect(screen.getByRole('table')).toBeTruthy()
    const filas = screen.getAllByRole('row')
    expect(filas).toHaveLength(3)
  })

  it('ordenar por No. Punto actualiza aria-sort y el orden de las filas', () => {
    render(
      <TablaSincronizacion
        data={makeResultados()}
        columns={crearColumnasComparacion(vi.fn())}
        conFiltros
      />
    )
    const th = screen.getByRole('columnheader', { name: 'No. Punto' })
    expect(th.getAttribute('aria-sort')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'No. Punto' }))
    expect(th.getAttribute('aria-sort')).toBe('ascending')
    const primeraFila = screen.getAllByRole('row')[1]
    const input = within(primeraFila).getAllByRole('textbox')[0] as HTMLInputElement
    expect(input.value).toBe('101')
  })

  it('filtrar por No. Punto reduce las filas visibles', () => {
    render(
      <TablaSincronizacion
        data={makeResultados()}
        columns={crearColumnasComparacion(vi.fn())}
        conFiltros
      />
    )
    fireEvent.change(screen.getByLabelText('Filtrar No. Punto'), { target: { value: '101' } })
    const filas = screen.getAllByRole('row')
    expect(filas).toHaveLength(2)
    const input = within(filas[1]).getAllByRole('textbox')[0] as HTMLInputElement
    expect(input.value).toBe('101')
  })

  it('ocultar una columna la quita del encabezado y persiste en localStorage', () => {
    render(
      <TablaSincronizacion
        data={makeResultados()}
        columns={crearColumnasComparacion(vi.fn())}
      />
    )
    expect(screen.getAllByRole('columnheader')).toHaveLength(8)
    fireEvent.click(screen.getByLabelText('X'))
    expect(screen.getAllByRole('columnheader')).toHaveLength(7)
    expect(JSON.parse(localStorage.getItem(CLAVE) || '{}')).toEqual({ x: false })
  })

  it('respeta la visibilidad inicial cargada del atom externo', () => {
    atomColumnVisibility.set({ x: false })
    render(
      <TablaSincronizacion
        data={makeResultados()}
        columns={crearColumnasComparacion(vi.fn())}
      />
    )
    expect(screen.getAllByRole('columnheader')).toHaveLength(7)
  })
})
