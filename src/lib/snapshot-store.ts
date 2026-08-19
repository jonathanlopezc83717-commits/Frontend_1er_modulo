import type { EstadoGuardado } from '@/types'

const API_BASE = '/api'

export interface EntradaSnapshotNAS {
  id: string
  tipo: EstadoGuardado['tipo']
  descripcion: string
  created_at: string
  guardadoPor: string
  kb: number
}

export interface GuardarSnapshotNASArgs {
  proyectoId: string
  tipo: EstadoGuardado['tipo']
  descripcion: string
  guardadoPor?: string
  snapshot: EstadoGuardado['snapshot']
}

const SNAPSHOT_VACIO: EstadoGuardado['snapshot'] = {
  puntos: [],
  puntoActivoId: null,
  moduloActivo: 'analisis',
  nomenclaturasGlobales: [],
  plantillasFormato: [],
  plantillasPdfFormato: [],
}

async function mensajeDeError(r: Response): Promise<string> {
  try {
    const cuerpo = (await r.json()) as { error?: unknown }
    return typeof cuerpo?.error === 'string' ? cuerpo.error : ''
  } catch {
    return ''
  }
}

export async function guardarSnapshotNAS(args: GuardarSnapshotNASArgs): Promise<{ success: boolean; error?: string }> {
  try {
    const r = await fetch(`${API_BASE}/nas-snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proyectoId: args.proyectoId,
        tipo: args.tipo,
        descripcion: args.descripcion,
        guardadoPor: args.guardadoPor || '',
        snapshot: args.snapshot,
      }),
    })
    if (!r.ok) {
      const detalle = await mensajeDeError(r)
      return { success: false, error: `nas-snapshots: ${r.status}${detalle ? ` ${detalle}` : ''}` }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function listarSnapshotsNAS(proyectoId: string): Promise<EstadoGuardado[]> {
  try {
    const r = await fetch(`${API_BASE}/nas-snapshots?proyectoId=${encodeURIComponent(proyectoId)}`)
    if (!r.ok) return []
    const data = (await r.json()) as { snapshots?: EntradaSnapshotNAS[] }
    if (!Array.isArray(data?.snapshots)) return []
    return data.snapshots.map((entrada) => ({
      id: entrada.id,
      tipo: entrada.tipo,
      descripcion: entrada.descripcion,
      createdAt: entrada.created_at,
      guardadoPor: entrada.guardadoPor || undefined,
      snapshotCompleto: false,
      snapshot: SNAPSHOT_VACIO,
    }))
  } catch {
    return []
  }
}

export async function leerSnapshotNAS(proyectoId: string, id: string): Promise<EstadoGuardado | null> {
  try {
    const params = new URLSearchParams({ proyectoId, id })
    const r = await fetch(`${API_BASE}/nas-snapshot?${params.toString()}`)
    if (!r.ok) return null
    const data = (await r.json()) as Partial<EstadoGuardado> & { created_at?: string }
    if (!data?.id || !data.snapshot) return null
    return {
      id: data.id,
      tipo: data.tipo === 'automatico' ? 'automatico' : 'manual',
      descripcion: data.descripcion || '',
      createdAt: data.created_at ?? data.createdAt ?? '',
      guardadoPor: data.guardadoPor || undefined,
      snapshotCompleto: true,
      snapshot: data.snapshot,
    }
  } catch {
    return null
  }
}

export async function snapNASDisponible(): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/nas-snapshots?proyectoId=00000000-0000-0000-0000-000000000000`)
    return r.ok
  } catch {
    return false
  }
}
