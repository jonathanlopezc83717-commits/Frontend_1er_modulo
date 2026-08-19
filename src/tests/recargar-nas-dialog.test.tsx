// @vitest-environment jsdom
/**
 * Dialogo Recargar (App.tsx): lista snapshots NAS y muestra quien guardo.
 * Ejecutar con: npx vitest run src/tests/recargar-nas-dialog.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup, waitFor } from '@testing-library/react'
import { createElement } from 'react'

const mocks = vi.hoisted(() => ({
  listarSnapshotsNAS: vi.fn(),
  snapNASDisponible: vi.fn(),
}))

vi.mock('@/lib/supabase-service', () => ({
  cargarPuntosDesdeDB: vi.fn().mockResolvedValue([]),
  sincronizarPuntos: vi.fn().mockResolvedValue({ success: true, guardados: 0, errores: 0 }),
  guardarCoordenadas: vi.fn().mockResolvedValue(undefined),
  guardarDocumentacion: vi.fn().mockResolvedValue(undefined),
  guardarAnalisis: vi.fn().mockResolvedValue(undefined),
  guardarPuntoCompleto: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('@/lib/snapshot-store', () => ({
  guardarSnapshotNAS: vi.fn().mockResolvedValue({ success: true }),
  listarSnapshotsNAS: mocks.listarSnapshotsNAS,
  leerSnapshotNAS: vi.fn().mockResolvedValue(null),
  snapNASDisponible: mocks.snapNASDisponible,
}))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    perfil: { email: 'u1@test.local', rol: 'general' },
    proyectoActivoId: '11111111-1111-1111-1111-111111111111',
    cambiarProyecto: vi.fn(),
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
vi.mock('@/components/GestorPuntos', () => ({ GestorPuntos: () => createElement('div') }))
vi.mock('@/components/ModuleTabs', () => ({ ModuleTabs: () => createElement('div') }))
vi.mock('@/components/HistorialObras', () => ({ HistorialObras: () => createElement('div') }))
vi.mock('@/components/projects/GestionMiembros', () => ({ GestionMiembros: () => createElement('div') }))
vi.mock('@/components/IndicadorNas', () => ({ IndicadorNas: () => createElement('div') }))
vi.mock('@/components/ThinkingLoader', () => ({ ThinkingLoader: () => createElement('div') }))

import App from '@/App'
import { AppProvider } from '@/context/AppContext'

function montarApp() {
  return render(createElement(AppProvider, null, createElement(App)))
}

const META = {
  id: 'snap-1',
  tipo: 'manual' as const,
  descripcion: 'Revisión trimestral',
  createdAt: '2026-08-19T01:00:00Z',
  guardadoPor: 'companero@test.local',
  snapshotCompleto: false,
  snapshot: {
    puntos: [],
    puntoActivoId: null,
    moduloActivo: 'analisis',
    nomenclaturasGlobales: [],
    plantillasFormato: [],
    plantillasPdfFormato: [],
  },
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.snapNASDisponible.mockResolvedValue(true)
  mocks.listarSnapshotsNAS.mockResolvedValue([])
})

describe('Dialogo Recargar con snapshots NAS', () => {
  it('muestra la lista con "por {email}" para cada snapshot', async () => {
    mocks.listarSnapshotsNAS.mockResolvedValue([META])
    const utils = montarApp()

    await act(async () => {
      utils.getByTitle('Recargar desde la nube').click()
    })

    await waitFor(() => {
      expect(utils.getByText('Revisión trimestral')).toBeTruthy()
    })
    expect(utils.getByText(/por companero@test\.local/)).toBeTruthy()
    expect(mocks.snapNASDisponible).toHaveBeenCalled()
    expect(mocks.listarSnapshotsNAS).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111')
  })

  it('snapshot sin guardadoPor no renderiza el subtítulo "por"', async () => {
    mocks.listarSnapshotsNAS.mockResolvedValue([{ ...META, guardadoPor: undefined }])
    const utils = montarApp()

    await act(async () => {
      utils.getByTitle('Recargar desde la nube').click()
    })

    await waitFor(() => {
      expect(utils.getByText('Revisión trimestral')).toBeTruthy()
    })
    expect(utils.queryByText(/por /)).toBeNull()
  })

  it('NAS caido: toast info y lista vacia', async () => {
    mocks.snapNASDisponible.mockResolvedValue(false)
    const utils = montarApp()
    mocks.listarSnapshotsNAS.mockClear()

    await act(async () => {
      utils.getByTitle('Recargar desde la nube').click()
    })

    await waitFor(() => {
      expect(utils.getByText('No se encontró estado')).toBeTruthy()
    })
    const { toast } = await import('sonner')
    expect(toast.info).toHaveBeenCalledWith('Servidor de archivos no disponible')
    expect(mocks.listarSnapshotsNAS).not.toHaveBeenCalled()
  })
})
