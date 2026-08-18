import type { RolUsuario } from '@/types'

export const ETIQUETAS_ROL: Record<RolUsuario, string> = {
  administrador: 'Administrador',
  general: 'Administrador de equipo',
  usuario: 'Usuario',
}

export function etiquetaRol(rol: RolUsuario): string {
  return ETIQUETAS_ROL[rol] ?? rol
}
