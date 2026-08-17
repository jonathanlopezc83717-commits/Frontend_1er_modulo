import { useEffect, useRef, useState } from 'react'
import type { NasPendingEvent } from '@/lib/nas-approval'

export interface NasLiveInfo {
  updatedAt: string | null
  pendientes: number
}

export function parseNasEvento(raw: string): NasLiveInfo | null {
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return null
    const d = data as { updatedAt?: unknown; pendientes?: unknown }
    return {
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : null,
      pendientes: typeof d.pendientes === 'number' ? d.pendientes : 0,
    }
  } catch {
    return null
  }
}

export function useNasLive(onEventos: (info: NasLiveInfo) => void): boolean {
  const cbRef = useRef(onEventos)
  const [conectado, setConectado] = useState(false)

  useEffect(() => {
    cbRef.current = onEventos
  }, [onEventos])

  useEffect(() => {
    const hot = import.meta.hot
    if (hot) {
      setConectado(true)
      const handler = (info: NasLiveInfo) => cbRef.current(info)
      hot.on('nas:eventos', handler)
      return () => hot.off('nas:eventos', handler)
    }
    const es = new EventSource('/api/nas-stream')
    es.addEventListener('open', () => setConectado(true))
    es.addEventListener('error', () => setConectado(false))
    es.addEventListener('nas:eventos', (e) => {
      const info = parseNasEvento((e as MessageEvent<string>).data)
      if (info) cbRef.current(info)
    })
    return () => es.close()
  }, [])

  return conectado
}

export function hayEventosNuevos(eventos: NasPendingEvent[], marcaMs: number): boolean {
  return eventos.some((ev) => new Date(ev.detectedAt).getTime() > marcaMs)
}
