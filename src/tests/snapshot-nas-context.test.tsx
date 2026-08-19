// @vitest-environment jsdom
/**
 * Pruebas del wiring AppContext <-> snapshot-store NAS:
 * guardar/listar/cargar usan el store, NAS caido => toast de error.
 * Ejecutar con: npx vitest run src/tests/snapshot-nas-context.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { EstadoGuardado } from '@/types'

const mocks = vi.hoisted(() => ({
  guardarSnapshotNAS: vi.fn(),
  listarSnapshotsNAS: vi.fn(),
  leerSnapshotNAS: vi.fn(),
}))

vi.mock('@/lib/supabase-service', () => ({
  cargarPuntosDesdeDB: vi.fn().mockResolvedValue([]),
  sincronizarPuntos: vi.fn().mockResolvedValue({ success: true, guardados: 0, errores: 0 }),
  guardarCoordenadas: vi.fn().mockResolvedValue(undefined),
  guardarDocumentacion: vi.fn().mockResolvedValue(undefined),
  guardarAnalisis: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/snapshot-store', () => ({
  guardarSnapshotNAS: mocks.guardarSnapshotNAS,
  listarSnapshotsNAS: mocks.listarSnapshotsNAS,
  leerSnapshotNAS: mocks.leerSnapshotNAS,
  snapNASDisponible: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    proyectoActivoId: '11111111-1111-1111-1111-111111111111',
    perfil: { email: 'u1@test.local', rol: 'general' },
  }),
}))
vi.mock('@/lib/storage', () => ({
  guardarEstado: vi.fn(),
  cargarEstado: vi.fn().mockReturnValue(null),
  cargarEstadoCompleto: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/template-file-store', () => ({
  cargarArchivosPlantilla: vi.fn().mockResolvedValue([]),
  guardarArchivosPlantilla: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    info: vi.fn(),
  }),
}))

const PROYECTO = '11111111-1111-1111-1111-111111111111'

const SNAPSHOT: EstadoGuardado['snapshot'] = {
  puntos: [],
  puntoActivoId: null,
  moduloActivo: 'analisis',
  nomenclaturasGlobales: [],
  plantillasFormato: [],
  plantillasPdfFormato: [],
}

function metaNAS(sobre: Partial<EstadoGuardado> = {}): EstadoGuardado {
  return {
    id: 'snap-1',
    tipo: 'manual',
    descripcion: 'estado prueba',
    createdAt: '2026-08-19T01:00:00Z',
    guardadoPor: 'otro@test.local',
    snapshotCompleto: false,
    snapshot: SNAPSHOT,
    ...sobre,
  }
}

interface AccionesProbe {
  sincronizarConSupabase: (descripcion?: string) => Promise<{ success: boolean; message: string }>
  cargarEstadoPorIdDesdeSupabase: (id: string) => Promise<boolean>
  restaurarEstadoGuardado: (id: string) => Promise<boolean>
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.listarSnapshotsNAS.mockResolvedValue([])
  mocks.leerSnapshotNAS.mockResolvedValue(null)
  mocks.guardarSnapshotNAS.mockResolvedValue({ success: true })
})

async function montar() {
  const { AppProvider, useAppActions, useAppSelector } = await import('@/context/AppContext')
  const capturadas: { acciones?: AccionesProbe } = {}

  function Probe() {
    capturadas.acciones = useAppActions() as unknown as AccionesProbe
    const estados = useAppSelector((s) => s.estadosGuardados)
    return createElement('div', { 'data-testid': 'estados' }, `estados:${estados.length}`)
  }

  const utils = render(createElement(AppProvider, null, createElement(Probe)))
  await act(async () => { await Promise.resolve() })
  return { ...utils, capturadas }
}

describe('sincronizarConSupabase guarda via snapshot-store NAS', () => {
  it('llama guardarSnapshotNAS con proyectoId, email y snapshot del estado', async () => {
    const { capturadas } = await montar()

    let resultado: { success: boolean } | undefined
    await act(async () => {
      resultado = await capturadas.acciones!.sincronizarConSupabase('titulo prueba')
    })

    expect(resultado!.success).toBe(true)
    expect(mocks.guardarSnapshotNAS).toHaveBeenCalledTimes(1)
    const args = mocks.guardarSnapshotNAS.mock.calls[0][0]
    expect(args.proyectoId).toBe(PROYECTO)
    expect(args.tipo).toBe('manual')
    expect(args.descripcion).toBe('titulo prueba')
    expect(args.guardadoPor).toBe('u1@test.local')
    expect(args.snapshot).toBeDefined()
  })

  it('NAS caido: devuelve success false y toast de servidor de archivos', async () => {
    mocks.guardarSnapshotNAS.mockResolvedValue({ success: false, error: 'nas-snapshots: 503 NAS no configurado' })
    const { capturadas } = await montar()

    let resultado: { success: boolean } | undefined
    await act(async () => {
      resultado = await capturadas.acciones!.sincronizarConSupabase('titulo')
    })

    expect(resultado!.success).toBe(false)
    const { toast } = await import('sonner')
    expect(toast.error).toHaveBeenCalledWith(
      'Servidor de archivos no disponible — no se pudo guardar el snapshot',
      expect.objectContaining({ description: 'nas-snapshots: 503 NAS no configurado' }),
    )
  })
})

describe('cargarDesdeSupabase restaura desde el indice NAS', () => {
  it('montaje con estado local vacio: restaura el mas reciente y setea estados con guardadoPor', async () => {
    const completo = metaNAS({ snapshotCompleto: true })
    mocks.listarSnapshotsNAS.mockResolvedValue([
      metaNAS(),
      metaNAS({ id: 'snap-2', createdAt: '2026-08-18T01:00:00Z' }),
    ])
    mocks.leerSnapshotNAS.mockResolvedValue(completo)

    const utils = await montar()

    await waitFor(() => {
      expect(utils.getByTestId('estados').textContent).toBe('estados:2')
    })

    expect(mocks.leerSnapshotNAS).toHaveBeenCalledWith(PROYECTO, 'snap-1')
    expect(mocks.guardarSnapshotNAS).not.toHaveBeenCalled()
  })

  it('lista vacia (NAS caido) no rompe el montaje', async () => {
    mocks.listarSnapshotsNAS.mockResolvedValue([])
    const utils = await montar()
    await act(async () => { await Promise.resolve() })
    expect(utils.getByTestId('estados').textContent).toBe('estados:0')
  })
})

describe('cargarEstadoPorIdDesdeSupabase via NAS', () => {
  it('lee el snapshot completo y devuelve true', async () => {
    mocks.leerSnapshotNAS.mockResolvedValue(metaNAS({ snapshotCompleto: true }))
    mocks.listarSnapshotsNAS.mockResolvedValue([metaNAS()])

    const { capturadas } = await montar()

    let ok = false
    await act(async () => {
      ok = await capturadas.acciones!.cargarEstadoPorIdDesdeSupabase('snap-1')
    })

    expect(ok).toBe(true)
    expect(mocks.leerSnapshotNAS).toHaveBeenCalledWith(PROYECTO, 'snap-1')
    expect(mocks.listarSnapshotsNAS).toHaveBeenCalledWith(PROYECTO)
  })

  it('snapshot inexistente devuelve false', async () => {
    mocks.leerSnapshotNAS.mockResolvedValue(null)
    const { capturadas } = await montar()

    let ok = true
    await act(async () => {
      ok = await capturadas.acciones!.cargarEstadoPorIdDesdeSupabase('snap-inexistente')
    })
    expect(ok).toBe(false)
  })
})

describe('restaurarEstadoGuardado con snapshotCompleto false', () => {
  it('trae el cuerpo via leerSnapshotNAS antes de restaurar', async () => {
    mocks.listarSnapshotsNAS.mockResolvedValue([metaNAS()])
    mocks.leerSnapshotNAS.mockResolvedValue(metaNAS({ snapshotCompleto: true }))
    const { capturadas, getByTestId } = await montar()

    await waitFor(() => {
      expect(getByTestId('estados').textContent).toBe('estados:1')
    })
    mocks.leerSnapshotNAS.mockClear()

    let ok = false
    await act(async () => {
      ok = await capturadas.acciones!.restaurarEstadoGuardado('snap-1')
    })

    expect(ok).toBe(true)
    expect(mocks.leerSnapshotNAS).toHaveBeenCalledWith(PROYECTO, 'snap-1')
  })
})
