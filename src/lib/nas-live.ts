import { useEffect, useRef } from 'react'
import type { NasPendingEvent } from '@/lib/nas-approval'

export interface NasLiveInfo {
  updatedAt: string | null
  pendientes: number
}

export function useNasLive(onEventos: (info: NasLiveInfo) => void) {
  const cbRef = useRef(onEventos)

  useEffect(() => {
    cbRef.current = onEventos
  }, [onEventos])

  useEffect(() => {
    const hot = import.meta.hot
    if (!hot) return
    const handler = (info: NasLiveInfo) => cbRef.current(info)
    hot.on('nas:eventos', handler)
    return () => hot.off('nas:eventos', handler)
  }, [])
}

export function hayEventosNuevos(eventos: NasPendingEvent[], marcaMs: number): boolean {
  return eventos.some((ev) => new Date(ev.detectedAt).getTime() > marcaMs)
}
