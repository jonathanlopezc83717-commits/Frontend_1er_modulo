import { Fragment } from 'react'
import type { FichaFormatoData } from './modulos/ModuloMateriales'

const LABELS_DEFAULT: Record<string, string> = {
  '1-B': 'Fecha',
  '1-D': 'Segmento',
  '1-F': 'Tramo',
  'sec:titulo': 'FICHA DE IDENTIFICACIÓN DE INFRAESTRUCTURA EXISTENTE',
  'sec:proyecto': 'Tren de Pasajeros Saltillo - Nuevo Laredo Segmentos 16 y 17',
  'sec:clave': 'Clave:',
  'sec:estado-izq': 'Estado actual y descripción del estado del elemento. Lado Izquierdo',
  'sec:estado-der': 'Lado derecho',
  'sec:croquis': 'CROQUIS DE LOCALIZACIÓN:',
  'sec:observaciones': 'Observaciones:',
  'sec:evidencias': 'EVIDENCIA FOTOGRÁFICA',
}

function resolverLabel(key: string, override: Record<string, string> | undefined): string {
  return override?.[key] ?? LABELS_DEFAULT[key] ?? key
}

interface ParesCoord { x?: string; y?: string }
interface CoordenadasValor { lado: string; pares: Record<string, ParesCoord> }

function formatearCoordenadas(raw: string): string {
  if (!raw) return ''
  let v: CoordenadasValor | null = null
  try {
    const p = JSON.parse(raw) as unknown
    if (p && typeof p === 'object' &&
      typeof (p as CoordenadasValor).lado === 'string' &&
      typeof (p as CoordenadasValor).pares === 'object') {
      v = { lado: (p as CoordenadasValor).lado, pares: (p as CoordenadasValor).pares as Record<string, ParesCoord> }
    }
  } catch {
    v = null
  }
  if (!v || !v.lado) return ''
  return v.lado.split('-').map(t => {
    const p = v!.pares[t] ?? {}
    return `${t}: ${p.x ?? ''}, ${p.y ?? ''}`
  }).join(' | ')
}

const DATA_COORDS = ['1-B', '1-D', '1-F'] as const

export function FichaPreview({ data }: { data: FichaFormatoData }) {
  const { valores: d, imagenes, etiquetas, camposCustom = [] } = data
  const numEvidencias = Math.min(Math.max(data.numEvidencias ?? 3, 0), 12)
  const evCols = Math.min(numEvidencias, 3)

  return (
    <div className="w-full bg-white text-black border border-neutral-300 rounded-md overflow-hidden text-[11px] leading-tight select-none">
      {/* 1. Título + logos */}
      <div className="flex items-stretch bg-neutral-800 text-white min-h-[44px]">
        <div className="w-1/4 flex items-center justify-center p-1">
          {imagenes['logo-izq'] && <img src={imagenes['logo-izq']} alt="" className="max-h-10 max-w-full object-contain" />}
        </div>
        <div className="w-1/2 flex items-center justify-center text-center font-bold px-2 text-[12px]">
          {resolverLabel('sec:titulo', etiquetas)}
        </div>
        <div className="w-1/4 flex items-center justify-center p-1">
          {imagenes['logo-der'] && <img src={imagenes['logo-der']} alt="" className="max-h-10 max-w-full object-contain" />}
        </div>
      </div>

      {/* 2. Subtítulo (proyecto + clave) */}
      <div className="flex items-stretch border-b border-neutral-300">
        <div className="flex-1 bg-neutral-700 text-white px-2 py-1 text-[10px]">{resolverLabel('sec:proyecto', etiquetas)}</div>
        <div className="bg-neutral-100 px-2 py-1 font-bold text-right whitespace-nowrap">{resolverLabel('sec:clave', etiquetas)}</div>
        <div className="px-2 py-1 border-l border-neutral-300">{d['0-F'] || '—'}</div>
      </div>

      {/* 3. Fila de datos (3 pares etiqueta/valor) */}
      <div className="grid grid-cols-6 border-b border-neutral-300">
        {DATA_COORDS.map(coord => (
          <Fragment key={coord}>
            <div className="bg-neutral-100 px-2 py-1 font-bold border-r border-neutral-200 truncate">{resolverLabel(coord, etiquetas)}:</div>
            <div className="px-2 py-1 border-r border-neutral-200 truncate">{d[coord] || ''}</div>
          </Fragment>
        ))}
      </div>

      {/* 4. Campos personalizados (filas de 3) */}
      {camposCustom.length > 0 && (
        <div className="grid grid-cols-6 border-b border-neutral-300">
          {camposCustom.map(c => (
            <Fragment key={c.coord}>
              <div className="bg-neutral-100 px-2 py-1 font-bold border-r border-neutral-200 truncate">{c.etiqueta}:</div>
              <div className="px-2 py-1 border-r border-neutral-200 break-words">
                {c.coordenadas ? formatearCoordenadas(d[c.coord] || '') : (d[c.coord] || '')}
              </div>
            </Fragment>
          ))}
        </div>
      )}

      {/* 5. Estado actual — etiquetas */}
      <div className="grid grid-cols-2 border-b border-neutral-300">
        <div className="bg-neutral-100 px-2 py-1 font-bold border-r border-neutral-200">{resolverLabel('sec:estado-izq', etiquetas)}</div>
        <div className="bg-neutral-100 px-2 py-1 font-bold text-center">{resolverLabel('sec:estado-der', etiquetas)}</div>
      </div>

      {/* 6. Estado actual — valores */}
      <div className="grid grid-cols-2 border-b border-neutral-300">
        <div className="px-2 py-2 border-r border-neutral-200 whitespace-pre-wrap break-words min-h-[60px]">{d['7-D'] || ''}</div>
        <div className="px-2 py-2 whitespace-pre-wrap break-words min-h-[60px]">{d['7-F'] || ''}</div>
      </div>

      {/* 7. Croquis / Observaciones — etiquetas */}
      <div className="grid grid-cols-2 border-b border-neutral-300">
        <div className="bg-neutral-100 px-2 py-1 font-bold text-center border-r border-neutral-200">{resolverLabel('sec:croquis', etiquetas)}</div>
        <div className="bg-neutral-100 px-2 py-1 font-bold text-center">{resolverLabel('sec:observaciones', etiquetas)}</div>
      </div>

      {/* 8. Croquis / Observaciones — valores */}
      <div className="grid grid-cols-2 border-b border-neutral-300">
        <div className="border-r border-neutral-200 flex items-center justify-center p-2 min-h-[150px]">
          {imagenes.croquis
            ? <img src={imagenes.croquis} alt="" className="max-h-36 max-w-full object-contain" />
            : <span className="text-neutral-400">[Sin imagen]</span>}
        </div>
        <div className="p-2 whitespace-pre-wrap break-words">{d['8-F'] || ''}</div>
      </div>

      {/* 9. Evidencia fotográfica — etiqueta */}
      <div className="bg-neutral-100 px-2 py-1 font-bold text-center border-b border-neutral-300">
        {resolverLabel('sec:evidencias', etiquetas)}
      </div>

      {/* 10. Evidencia fotográfica — imágenes */}
      {numEvidencias > 0 && (
        <div className="grid" style={{ gridTemplateColumns: `repeat(${evCols}, minmax(0, 1fr))` }}>
          {Array.from({ length: numEvidencias }).map((_, i) => (
            <div key={i} className="flex items-center justify-center p-2 min-h-[130px] border-r border-b border-neutral-200 last:border-r-0">
              {imagenes[`evid-${i}`]
                ? <img src={imagenes[`evid-${i}`]} alt="" className="max-h-28 max-w-full object-contain" />
                : <span className="text-neutral-400">[Foto {i + 1}]</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
