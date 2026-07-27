export const ETIQUETA_UBICACION = 'Ubicacion respecto al eje de proyecto' as const

export type Lado = 'Izquierda' | 'Derecha' | 'Centro'

export type OpcionUbicacion = Lado | `${Lado}-${Lado}`

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

export const ABBREV_LADO: Record<Lado, 'Izq' | 'Der' | 'Cen'> = {
  Izquierda: 'Izq',
  Derecha: 'Der',
  Centro: 'Cen',
}

const COORDENADA_BASES = ['Coordenada "X"', 'Coordenada "Y"', 'Coordenada "Z"'] as const

export interface CampoSimple {
  etiqueta: string
  valor: string
}

export function esOpcionDoble(op: OpcionUbicacion | '' | undefined): boolean {
  return !!op && op.includes('-')
}

export function parseLados(op: OpcionUbicacion): [Lado, Lado | null] {
  if (!op.includes('-')) return [op as Lado, null]
  const [a, b] = op.split('-') as [Lado, Lado]
  return [a, b]
}

export function etiquetaBaseFromSufijada(etiqueta: string): string {
  return etiqueta.replace(/ \((Izq|Der|Cen)\)$/, '')
}

function sufijoPrimario(op: OpcionUbicacion | '' | undefined): string {
  if (!esOpcionDoble(op)) return ''
  const [primario] = parseLados(op as OpcionUbicacion)
  return `(${ABBREV_LADO[primario]})`
}

export function etiquetasCoordenadasPara(op: OpcionUbicacion | '' | undefined): string[] {
  if (!esOpcionDoble(op)) return [...COORDENADA_BASES]
  const [primario, secundario] = parseLados(op as OpcionUbicacion)
  const out: string[] = []
  for (const base of COORDENADA_BASES) out.push(`${base} (${ABBREV_LADO[primario]})`)
  if (secundario) for (const base of COORDENADA_BASES) out.push(`${base} (${ABBREV_LADO[secundario]})`)
  return out
}

export function esCoordenadaPrimaria(etiqueta: string, op: OpcionUbicacion | '' | undefined): boolean {
  const base = etiquetaBaseFromSufijada(etiqueta)
  if (!(COORDENADA_BASES as readonly string[]).includes(base)) return false
  const primariaEsperada = sufijoPrimario(op)
  const sufijoActual = etiqueta.slice(base.length).trimStart()
  if (primariaEsperada === '') return sufijoActual === ''
  return sufijoActual === primariaEsperada
}

export function reconciliarDatosPorUbicacion(
  datos: ReadonlyArray<CampoSimple>,
  newOp: OpcionUbicacion | '' | undefined,
): CampoSimple[] {
  const valores = new Map<string, string>()
  for (const d of datos) valores.set(d.etiqueta, d.valor)

  const basesSet = new Set<string>(COORDENADA_BASES)
  const currentOp = (valores.get(ETIQUETA_UBICACION) || '') as OpcionUbicacion | ''
  const fuenteSufijo = sufijoPrimario(currentOp)

  const resultado: CampoSimple[] = []
  for (const d of datos) {
    const base = etiquetaBaseFromSufijada(d.etiqueta)
    if (basesSet.has(base)) continue
    resultado.push({ etiqueta: d.etiqueta, valor: d.valor })
  }

  for (const etiqueta of etiquetasCoordenadasPara(newOp)) {
    let valor = valores.get(etiqueta) ?? ''
    if (valor === '' && esCoordenadaPrimaria(etiqueta, newOp)) {
      const base = etiquetaBaseFromSufijada(etiqueta)
      const fuente = fuenteSufijo ? `${base} ${fuenteSufijo}` : base
      valor = valores.get(fuente) ?? ''
    }
    resultado.push({ etiqueta, valor })
  }

  return resultado
}

export function valorCoordenadaPrimaria(
  ficha: { datos: ReadonlyArray<CampoSimple> },
  axis: 'X' | 'Y' | 'Z',
): string {
  const op = (ficha.datos.find(d => d.etiqueta === ETIQUETA_UBICACION)?.valor || '') as OpcionUbicacion | ''
  const base = `Coordenada "${axis}"`
  const primaria = esOpcionDoble(op)
    ? `${base} ${sufijoPrimario(op)}`
    : base
  return ficha.datos.find(d => d.etiqueta === primaria)?.valor || ''
}
