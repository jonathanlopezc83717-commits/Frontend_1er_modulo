export interface FocoCampoFaltante {
  puntoId: string
  coord: string
}

export const EVENTO_FOCO_CAMPO = 'foco-campo-faltante'

let pendiente: FocoCampoFaltante | null = null

export function solicitarFocoCampo(detalle: FocoCampoFaltante): void {
  pendiente = detalle
  window.dispatchEvent(new CustomEvent<FocoCampoFaltante>(EVENTO_FOCO_CAMPO, { detail: detalle }))
}

export function consumirFocoCampo(): FocoCampoFaltante | null {
  const detalle = pendiente
  pendiente = null
  return detalle
}
