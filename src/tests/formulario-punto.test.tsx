// @vitest-environment jsdom
/**
 * Tests del pilot TanStack Form: FormularioPunto (modal de edición de punto).
 * Ejecutar: npx vitest run src/tests/formulario-punto.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { FormularioPunto } from '@/components/FormularioPunto'
import type { PuntoFerroviario } from '@/types'

function makePunto(overrides: Partial<PuntoFerroviario> = {}): PuntoFerroviario {
  return {
    id: 'p1',
    numeroSerie: 1,
    nombre: 'Puente Río A',
    descripcion: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    moduloData: {},
    ...overrides,
  }
}

function makePuntos(): PuntoFerroviario[] {
  return [
    makePunto(),
    makePunto({ id: 'p2', numeroSerie: 2, nombre: 'Túnel Norte' }),
    makePunto({ id: 'p3', numeroSerie: 3, nombre: 'Paso Bajo' }),
  ]
}

function montar(punto: PuntoFerroviario = makePunto(), puntos: PuntoFerroviario[] = makePuntos()) {
  const props = {
    punto,
    puntos,
    moverPunto: vi.fn(),
    actualizarPunto: vi.fn(),
    onClose: vi.fn(),
  }
  const utils = render(createElement(FormularioPunto, props))
  return { ...utils, props }
}

describe('FormularioPunto — validación sincrónica', () => {
  beforeEach(() => cleanup())
  afterEach(() => cleanup())

  it('renderiza los valores por defecto incluyendo coordenadas anidadas', () => {
    montar(makePunto({ coordenadas: { lat: -33.4567, lng: -70.6789 } }))
    expect((screen.getByLabelText('Latitud') as HTMLInputElement).value).toBe('-33.4567')
    expect((screen.getByLabelText('Longitud') as HTMLInputElement).value).toBe('-70.6789')
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Puente Río A')
    expect((screen.getByLabelText('N° de serie / posición') as HTMLInputElement).value).toBe('1')
  })

  it('muestra error cuando el nombre queda vacío', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '' } })
    expect(screen.getByRole('alert').textContent).toBe('El nombre es obligatorio')
  })

  it('muestra error cuando una coordenada no es numérica', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Latitud'), { target: { value: 'abc' } })
    expect(screen.getByRole('alert').textContent).toBe('Debe ser un número')
    fireEvent.change(screen.getByLabelText('Longitud'), { target: { value: 'x1' } })
    expect(screen.getAllByRole('alert').length).toBe(2)
  })

  it('rechaza número de serie fuera de rango', () => {
    montar()
    fireEvent.change(screen.getByLabelText('N° de serie / posición'), { target: { value: '99' } })
    expect(screen.getByRole('alert').textContent).toBe('Debe ser un número entero entre 1 y 3')
  })

  it('deshabilita Guardar cambios mientras el formulario es inválido', () => {
    montar()
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement
    expect(guardar.disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '' } })
    expect(guardar.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Puente Río A' } })
    expect(guardar.disabled).toBe(false)
  })
})

describe('FormularioPunto — validación async de nombre duplicado', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    cleanup()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('muestra el error de duplicado tras el debounce de 500ms', async () => {
    montar()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Túnel Norte' } })
    expect(screen.queryByText('Ya existe un punto con ese nombre')).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(screen.getByRole('alert').textContent).toBe('Ya existe un punto con ese nombre')
  })

  it('no marca duplicado con el nombre propio del punto editado', async () => {
    montar()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Puente Río A' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('deshabilita el guardado cuando el nombre está duplicado', async () => {
    montar()
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Paso Bajo' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(guardar.disabled).toBe(true)
  })
})

describe('FormularioPunto — guardado', () => {
  beforeEach(() => cleanup())
  afterEach(() => cleanup())

  it('llama al mismo camino de guardado con los valores editados', async () => {
    const { props, container } = montar()
    fireEvent.change(screen.getByLabelText('N° de serie / posición'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Puente Río B' } })
    fireEvent.change(screen.getByLabelText('Descripción'), { target: { value: '  desc editada  ' } })
    fireEvent.change(screen.getByLabelText('Latitud'), { target: { value: '-33.5' } })
    fireEvent.change(screen.getByLabelText('Longitud'), { target: { value: '-70.7' } })
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!)
    })
    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(props.moverPunto).toHaveBeenCalledWith('p1', 2)
    expect(props.actualizarPunto).toHaveBeenCalledWith('p1', {
      nombre: 'Puente Río B',
      descripcion: 'desc editada',
      carpetaPath: undefined,
      cadenamiento: undefined,
      coordenadas: { lat: -33.5, lng: -70.7 },
    })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('no llama al guardado cuando el formulario es inválido', async () => {
    const { props } = montar()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Guardar cambios' }).closest('form')!)
    })
    expect(props.actualizarPunto).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('omite coordenadas cuando falta uno de los dos valores', async () => {
    const { props, container } = montar()
    fireEvent.change(screen.getByLabelText('Latitud'), { target: { value: '-33.5' } })
    await act(async () => {
      fireEvent.submit(container.querySelector('form')!)
    })
    await waitFor(() => expect(props.onClose).toHaveBeenCalled())
    expect(props.actualizarPunto).toHaveBeenCalledWith('p1', {
      nombre: 'Puente Río A',
      descripcion: undefined,
      carpetaPath: undefined,
      cadenamiento: undefined,
    })
  })

  it('cancelar cierra sin guardar', () => {
    const { props } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.actualizarPunto).not.toHaveBeenCalled()
  })
})
