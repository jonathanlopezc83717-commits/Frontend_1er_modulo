/**
 * Pruebas de subida deduplicada por hash de contenido.
 * Ejecutar con: npx vitest run src/tests/storage-dedup.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { subirImagenDedup } from '@/lib/storage-dedup'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
      }),
    },
  },
}))

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const PNG_DISTINTO = 'data:image/png;base64,iVBORw0KGgoB'

function publicUrlDe(path: string) {
  return `https://supabase.test/storage/v1/object/public/images/${path}`
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.upload.mockResolvedValue({ error: null })
  mocks.getPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: publicUrlDe(path) },
  }))
})

describe('subirImagenDedup', () => {
  it('usa el mismo nombre de objeto para los mismos bytes', async () => {
    const primera = await subirImagenDedup(PNG, 'puntos/p1/modulo')
    const segunda = await subirImagenDedup(PNG, 'puntos/p1/modulo')

    const pathPrimera = mocks.upload.mock.calls[0][0]
    const pathSegunda = mocks.upload.mock.calls[1][0]

    expect(pathPrimera).toMatch(/^puntos\/p1\/modulo\/[0-9a-f]{64}\.png$/)
    expect(pathPrimera).toBe(pathSegunda)
    expect(primera).toBe(publicUrlDe(pathPrimera))
    expect(segunda).toBe(primera)
  })

  it('sube con upsert para que re-subir no duplique objetos', async () => {
    await subirImagenDedup(PNG)
    expect(mocks.upload.mock.calls[0][2]).toMatchObject({ upsert: true })
  })

  it('produce nombres distintos para contenidos distintos o prefijos distintos', async () => {
    await subirImagenDedup(PNG, 'a')
    await subirImagenDedup(PNG_DISTINTO, 'a')
    await subirImagenDedup(PNG, 'b')

    const [pathA1, pathA2, pathB1] = mocks.upload.mock.calls.map(call => call[0])
    expect(pathA1).not.toBe(pathA2)
    expect(pathA1).not.toBe(pathB1)
    expect(pathA1.startsWith('a/')).toBe(true)
    expect(pathB1.startsWith('b/')).toBe(true)
  })

  it('devuelve cadena vacía y advierte si la subida falla', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'boom' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const resultado = await subirImagenDedup(PNG)

    expect(resultado).toBe('')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('devuelve sin cambios cadenas que no son data:image', async () => {
    const resultado = await subirImagenDedup('https://ejemplo.com/foto.png')
    expect(resultado).toBe('https://ejemplo.com/foto.png')
    expect(mocks.upload).not.toHaveBeenCalled()
  })
})
