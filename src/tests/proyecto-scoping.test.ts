/**
 * Pruebas de scoping por proyecto en la capa de servicio:
 * RPC args con p_proyecto y payloads con proyecto_id.
 * Ejecutar con: npx vitest run src/tests/proyecto-scoping.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PuntoFerroviario } from '@/types'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  insertProyecto: vi.fn(),
  upload: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    from: (tabla: string) => {
      throw new Error(`tabla inesperada: ${tabla}`)
    },
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: () => ({ data: { publicUrl: 'https://storage.test/imagen.jpg' } }),
      }),
    },
  },
}))

import {
  cargarPuntosCompletos,
  construirPayloadPunto,
  guardarPuntoCompleto,
  sincronizarPuntos,
} from '@/lib/supabase-service'

const PROYECTO = '11111111-1111-1111-1111-111111111111'

function hacerPunto(): PuntoFerroviario {
  return {
    id: 'p1',
    numeroSerie: 1,
    nombre: 'PK 1+000',
    moduloData: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: [], error: null })
  mocks.invoke.mockResolvedValue({ data: { guardados: 0, errores: 0, detalles: [] }, error: null })
})

describe('cargarPuntosCompletos: scoping por proyecto', () => {
  it('llama al RPC con p_proyecto', async () => {
    await cargarPuntosCompletos(PROYECTO)

    expect(mocks.rpc).toHaveBeenCalledWith('cargar_puntos_completos', { p_proyecto: PROYECTO })
  })
})

describe('guardarPuntoCompleto: payload con proyecto_id', () => {
  it('embebe proyecto_id en el punto y conserva modulo_data', async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true }, error: null })

    const resultado = await guardarPuntoCompleto(hacerPunto(), PROYECTO)

    expect(resultado.success).toBe(true)
    const payload = mocks.rpc.mock.calls[0][1].p_payload as {
      punto: { proyecto_id?: string; modulo_data?: Record<string, unknown> }
    }
    expect(payload.punto.proyecto_id).toBe(PROYECTO)
    expect(payload.punto.modulo_data).toBeDefined()
  })
})

describe('sincronizarPuntos: payloads con proyecto_id', () => {
  it('envía cada punto del lote con proyecto_id al edge function', async () => {
    await sincronizarPuntos([hacerPunto()], PROYECTO)

    expect(mocks.invoke).toHaveBeenCalledWith('sincronizar-puntos', {
      body: {
        puntos: [
          expect.objectContaining({
            punto: expect.objectContaining({ proyecto_id: PROYECTO }),
          }),
        ],
      },
    })
  })
})

describe('construirPayloadPunto: solo fotos analizadas', () => {
  it('persiste y sube a Storage únicamente las fotos con reconocimiento', async () => {
    const punto = hacerPunto()
    punto.moduloData.analisis = {
      fotosIndexadas: [
        { id: 'f1', index: 1, nombre: 'f1.jpg', nombreFormateado: '1 - f1', subcarpeta: 'raiz', preview: 'data:image/jpeg;base64,AAA' },
        { id: 'f2', index: 2, nombre: 'f2.jpg', nombreFormateado: '2 - f2', subcarpeta: 'raiz', preview: 'data:image/jpeg;base64,BBB' },
      ],
      fotosCount: 2,
      resultadosPorImagen: [{ fotoId: 'f1', fotoNombre: 'f1.jpg', descripcion: 'vía', objetos: [] }],
    }

    const { payload, moduloDataPersistido } = await construirPayloadPunto(punto, PROYECTO)

    expect(payload.fotos).toHaveLength(1)
    expect(payload.fotos![0].nombre_archivo).toBe('f1.jpg')
    expect(payload.fotos![0].preview_url).toBe('https://storage.test/imagen.jpg')
    const analisis = moduloDataPersistido.analisis as { fotosIndexadas: Array<{ id: string }>; fotosCount: number }
    expect(analisis.fotosIndexadas.map(f => f.id)).toEqual(['f1'])
    expect(analisis.fotosCount).toBe(1)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })

  it('sin reconocimientos: no sube fotos y el estado persistido queda vacío', async () => {
    const punto = hacerPunto()
    punto.moduloData.analisis = {
      fotosIndexadas: [
        { id: 'f1', index: 1, nombre: 'f1.jpg', nombreFormateado: '1 - f1', subcarpeta: 'raiz', preview: 'data:image/jpeg;base64,AAA' },
      ],
      fotosCount: 1,
    }

    const { payload, moduloDataPersistido } = await construirPayloadPunto(punto, PROYECTO)

    expect(payload.fotos).toBeNull()
    expect(mocks.upload).not.toHaveBeenCalled()
    const analisis = moduloDataPersistido.analisis as { fotosIndexadas: unknown[]; fotosCount: number }
    expect(analisis.fotosIndexadas).toEqual([])
    expect(analisis.fotosCount).toBe(0)
  })
})
