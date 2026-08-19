import { useMemo } from 'react'
import { useAppActions } from '@/context/AppContext'
import { calcularProgresoPunto, type PasoId, type EstadoPaso } from '@/lib/progreso-punto'
import { solicitarFocoCampo } from '@/lib/foco-campo'
import type { PuntoFerroviario } from '@/types'

interface BarraProgresoPuntoProps {
  punto: PuntoFerroviario
  plantillas: ReadonlyArray<{ id: string }>
  esActivo: boolean
}

const CLASES_ESTADO: Record<EstadoPaso, string> = {
  done: 'bg-primary',
  current: 'bg-primary/40 animate-pulse',
  pending: 'bg-muted',
}

export function BarraProgresoPunto({ punto, plantillas, esActivo }: BarraProgresoPuntoProps) {
  const { setModuloActivo, setPuntoActivo } = useAppActions()
  const progreso = useMemo(() => calcularProgresoPunto(punto, plantillas), [punto, plantillas])

  const navegar = (id: PasoId) => {
    if (!esActivo) setPuntoActivo(punto)
    if (id === 'fotos' || id === 'analisis') {
      setModuloActivo('analisis')
    } else if (id === 'plantilla' || id === 'campos') {
      setModuloActivo('materiales')
      if (id === 'campos' && progreso.camposFaltantes.length > 0) {
        solicitarFocoCampo({ puntoId: punto.id, coord: progreso.camposFaltantes[0] })
      }
    }
  }

  return (
    <div
      className="flex w-full gap-0.5"
      role="group"
      title={progreso.resumen}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {progreso.pasos.map((paso) => (
        <button
          key={paso.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            navegar(paso.id)
          }}
          aria-label={`${paso.etiqueta}: ${paso.tooltip}`}
          title={`${paso.etiqueta} — ${paso.tooltip}`}
          className={`h-2 flex-1 rounded-sm transition-colors ${CLASES_ESTADO[paso.estado]}`}
        />
      ))}
    </div>
  )
}
