/**
 * Pruebas de offload de imágenes de moduloData en el payload del RPC.
 * Ejecutar con: npx vitest run src/tests/modulo-data-offload.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PuntoFerroviario } from '@/types'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
      }),
    },
    rpc: mocks.rpc,
  },
}))

import { construirPayloadPunto, cargarPuntosCompletos, sustituirDataUrlsEnArbol } from '@/lib/supabase-service'

const CROQUIS = 'data:image/png;base64,iVBORw0KGgo='
const EVID = 'data:image/png;base64,iVBORw0KGgoB'
const PREVIEW = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='

function urlDe(path: string) {
  return `https://supabase.test/storage/v1/object/public/images/${path}`
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.upload.mockResolvedValue({ error: null })
  mocks.getPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: urlDe(path) },
  }))
})

describe('sustituirDataUrlsEnArbol', () => {
  it('reemplaza data:image anidados y conserva el resto', async () => {
    const subir = vi.fn(async (dataUrl: string) => `url:${dataUrl.length}`)
    const resultado = await sustituirDataUrlsEnArbol(
      {
        georeferencia: { croquis: CROQUIS, notas: 'notas manuales' },
        materiales: { imagenes: { croquis: CROQUIS, 'evid-0': EVID }, texto: 'ok' },
        lista: [EVID, 'texto en array'],
        numero: 42,
      },
      subir
    ) as Record<string, unknown>

    const geo = resultado.georeferencia as Record<string, unknown>
    const mat = resultado.materiales as Record<string, unknown>
    const imagenes = mat.imagenes as Record<string, unknown>
    const lista = resultado.lista as unknown[]

    expect(geo.croquis).toBe(`url:${CROQUIS.length}`)
    expect(geo.notas).toBe('notas manuales')
    expect(imagenes['evid-0']).toBe(`url:${EVID.length}`)
    expect(mat.texto).toBe('ok')
    expect(lista[0]).toBe(`url:${EVID.length}`)
    expect(lista[1]).toBe('texto en array')
    expect(resultado.numero).toBe(42)
    expect(subir).toHaveBeenCalledTimes(4)
  })

  it('omite claves pesadas y las indicadas por el llamador', async () => {
    const subir = vi.fn(async () => 'url')
    const resultado = await sustituirDataUrlsEnArbol(
      {
        file: { preview: CROQUIS },
        archivoBase64: 'data:application/pdf;base64,AAA',
        fotosIndexadas: [{ preview: CROQUIS }],
        otras: { imagen: EVID },
      },
      subir,
      ['fotosIndexadas']
    ) as Record<string, unknown>

    expect(resultado.file).toBeUndefined()
    expect(resultado.archivoBase64).toBeUndefined()
    expect(resultado.fotosIndexadas).toBeUndefined()
    expect((resultado.otras as Record<string, unknown>).imagen).toBe('url')
    expect(subir).toHaveBeenCalledTimes(1)
  })
})

function hacerPunto(): PuntoFerroviario {
  return {
    id: 'p1',
    numeroSerie: 1,
    nombre: 'PK 1+000',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    moduloData: {
      georeferencia: {
        coordenadas: { x: 10, y: 20, z: 30 },
        notas: 'notas geo',
        croquis: CROQUIS,
      },
      materiales: {
        imagenes: { croquis: EVID, 'evid-0': EVID },
        notasMatriz: 'texto materiales',
      },
      analisis: {
        fotosIndexadas: [{
          id: 'f1',
          index: 0,
          nombre: 'IMG_1.jpg',
          nombreFormateado: 'IMG_1.jpg',
          subcarpeta: 'sub',
          preview: PREVIEW,
        }],
        resultadosPorImagen: [{ fotoId: 'f1', fotoNombre: 'IMG_1.jpg', descripcion: 'vía', objetos: [] }],
        imageUrls: ['https://cdn.example/x.png'],
        imageItems: [{ file: {} as File, preview: EVID, id: 'it1' }],
      },
    } as PuntoFerroviario['moduloData'],
  }
}

describe('construirPayloadPunto', () => {
  it('envía modulo_data sin ninguna cadena data:image y sin doble proceso de fotosIndexadas', async () => {
    const { payload } = await construirPayloadPunto(hacerPunto(), 'proyecto-1')

    const moduloData = payload.punto.modulo_data as Record<string, unknown>
    const geo = moduloData.georeferencia as Record<string, unknown>
    const mat = moduloData.materiales as Record<string, unknown>
    const imagenes = mat.imagenes as Record<string, unknown>
    const analisis = moduloData.analisis as Record<string, unknown>
    const imageItems = analisis.imageItems as Array<Record<string, unknown>>

    expect(String(geo.croquis)).toMatch(/^https:\/\/supabase\.test\/.*puntos\/p1\/modulo\/[0-9a-f]{64}\.png$/)
    expect(String(imagenes['evid-0'])).toMatch(/^https:\/\/supabase\.test\//)
    expect(geo.notas).toBe('notas geo')
    expect(mat.notasMatriz).toBe('texto materiales')

    expect(String(payload.fotos?.[0].preview_url)).toMatch(/^https:\/\/supabase\.test\/.*puntos\/p1\/fotos\/[0-9a-f]{64}\.jpg$/)
    expect(analisis.fotosIndexadas).toBeUndefined()

    expect(imageItems[0].file).toBeUndefined()
    expect(String(imageItems[0].preview)).toMatch(/^https:\/\/supabase\.test\//)

    expect(JSON.stringify(payload)).not.toContain('data:image')
  })

  it('sube la preview de fotos una sola vez pese a existir en el árbol', async () => {
    await construirPayloadPunto(hacerPunto(), 'proyecto-1')
    const subidasPreview = mocks.upload.mock.calls.filter(call => String(call[0]).startsWith('puntos/p1/fotos'))
    const subidasModulo = mocks.upload.mock.calls.filter(call => String(call[0]).startsWith('puntos/p1/modulo'))
    expect(subidasPreview).toHaveLength(1)
    expect(subidasModulo.length).toBeGreaterThan(0)
  })
})

describe('cargarPuntosCompletos round-trip de modulo_data', () => {
  it('combina modulo_data con las relaciones sin perder croquis', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        id: 'p1',
        numero_serie: 1,
        nombre: 'PK 1+000',
        descripcion: null,
        carpeta_path: null,
        coordenada_lat: 20,
        coordenada_lng: 10,
        coordenada_z: 30,
        estado: 'activo',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        modulo_data: {
          georeferencia: { croquis: 'https://supabase.test/croquis.png', notas: 'notas guardadas' },
          materiales: { notasMatriz: 'texto guardado' },
        },
        coordenadas_gps: [{ punto_id: 'p1', latitud: 20, longitud: 10, altitud: 30, notas: 'relacion' }],
      }],
      error: null,
    })

    const puntos = await cargarPuntosCompletos('proyecto-1')
    const geo = puntos[0].moduloData.georeferencia as Record<string, unknown> | undefined

    expect(puntos).toHaveLength(1)
    expect(geo?.croquis).toBe('https://supabase.test/croquis.png')
    expect(geo?.coordenadas).toEqual({ x: 10, y: 20, z: 30 })
    expect(geo?.notas).toBe('relacion')
    expect((puntos[0].moduloData.materiales as Record<string, unknown>).notasMatriz).toBe('texto guardado')
  })
})
