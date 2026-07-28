export const ETIQUETA_UBICACION = 'Ubicacion respecto al eje de proyecto' as const

export type Lado = 'Izquierda' | 'Derecha' | 'Centro'

// Combinaciones válidas: 1 lado, o 2/3 lados separados por guion.
// (Solo hay 3 lados, así que el máximo que tiene sentido es 3.)
export type OpcionUbicacion =
  | Lado
  | `${Lado}-${Lado}`
  | `${Lado}-${Lado}-${Lado}`

export const OPCIONES_UBICACION: readonly OpcionUbicacion[] = [
  'Izquierda',
  'Derecha',
  'Centro',
  'Izquierda-Derecha',
  'Izquierda-Centro',
  'Derecha-Izquierda',
  'Derecha-Centro',
  'Centro-Izquierda',
  'Centro-Derecha',
]
