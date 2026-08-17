// @vitest-environment jsdom
/**
 * Pruebas del estado ligero en localStorage: los textos manuales de
 * moduloData y las URLs de imágenes deben conservarse; sólo se
 * descartan las cadenas data:. Es la base del caché de textos.
 * Ejecutar con: npx vitest run src/tests/estado-ligero.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/template-file-store', () => ({
  guardarArchivosPlantilla: vi.fn().mockResolvedValue(undefined),
}))

import { guardarEstado, cargarEstado } from '@/lib/storage'

const NOTA_LARGA = 'x'.repeat(15000)

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('crearEstadoLigero vía guardarEstado', () => {
  it('conserva textos manuales de moduloData, incluidos los muy largos', () => {
    const puntos = [{
      id: 'p1',
      moduloData: {
        georeferencia: { notas: 'nota corta', croquis: 'https://supabase.test/croquis.png' },
        documentacion: { notas: NOTA_LARGA },
        materiales: { notasMatriz: 'texto materiales' },
      },
    }]

    guardarEstado(puntos, null, 'analisis')

    const guardado = cargarEstado()
    const punto = (guardado?.puntos as Array<Record<string, unknown>>)[0]
    const moduloData = punto.moduloData as Record<string, unknown>
    const geo = moduloData.georeferencia as Record<string, unknown>
    const doc = moduloData.documentacion as Record<string, unknown>

    expect(guardado).not.toBeNull()
    expect(geo.notas).toBe('nota corta')
    expect(geo.croquis).toBe('https://supabase.test/croquis.png')
    expect(doc.notas).toBe(NOTA_LARGA)
    expect((moduloData.materiales as Record<string, unknown>).notasMatriz).toBe('texto materiales')
  })

  it('descarta dataURLs pero conserva las versiones en URL de las imágenes', () => {
    const puntos = [{
      id: 'p1',
      moduloData: {
        georeferencia: { croquis: 'data:image/png;base64,iVBORw0KGgo=' },
        materiales: { imagenes: { 'evid-0': 'https://supabase.test/evid.png' } },
      },
    }]

    guardarEstado(puntos, 'p1', 'analisis')

    const guardado = cargarEstado()
    const punto = (guardado?.puntos as Array<Record<string, unknown>>)[0]
    const moduloData = punto.moduloData as Record<string, unknown>
    const geo = moduloData.georeferencia as Record<string, unknown>
    const imagenes = (moduloData.materiales as Record<string, unknown>).imagenes as Record<string, unknown>

    expect(geo.croquis).toBe('')
    expect(imagenes['evid-0']).toBe('https://supabase.test/evid.png')
    expect(JSON.stringify(guardado)).not.toContain('data:image')
  })
})
