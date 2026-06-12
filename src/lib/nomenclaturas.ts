export interface NomenclaturaEntry {
  id: string
  codigo: string
  definicion: string
}

export interface NomenclaturaDetectada {
  codigo: string
  codigoOriginal: string
  seriado: number
  definicion: string
}

export interface DiscrepanciaNomenclatura {
  codigo: string
  codigoOriginal: string
  definicionBase: string
  definicionDetectada: string
  tipo: 'definicion_distinta' | 'duplicado_distinto'
}

function crearId(prefix = 'nom'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizarDefinicion(valor: string): string {
  return valor
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function parsearNomenclaturasDesdeTexto(texto: string): NomenclaturaDetectada[] {
  const parrafos = texto
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map(parrafo => parrafo.trim())
    .filter(Boolean)

  const detectadas: NomenclaturaDetectada[] = []

  for (let index = 0; index < parrafos.length; index++) {
    const parrafo = parrafos[index]
    const match = parrafo.match(/^([A-Za-z]{3})(\d+)\b[\s:.-]*(.*)$/s)

    if (!match) continue

    const codigo = match[1].toUpperCase()
    const seriado = Number(match[2])
    const definicionMismoParrafo = (match[3] || '').trim()
    const definicion = definicionMismoParrafo || parrafos[index + 1] || ''

    if (!definicion.trim()) continue

    detectadas.push({
      codigo,
      codigoOriginal: `${codigo}${match[2]}`,
      seriado,
      definicion: definicion.trim(),
    })
  }

  return detectadas
}

export function fusionarNomenclaturas(
  existentes: NomenclaturaEntry[],
  detectadas: NomenclaturaDetectada[]
): NomenclaturaEntry[] {
  const resultado = [...existentes]
  const codigosExistentes = new Set(resultado.map(item => item.codigo.toUpperCase()))

  for (const item of detectadas) {
    if (codigosExistentes.has(item.codigo)) continue

    resultado.push({
      id: crearId('parsed'),
      codigo: item.codigo,
      definicion: item.definicion,
    })
    codigosExistentes.add(item.codigo)
  }

  return resultado
}

export function consolidarNomenclaturas(nomenclaturas: NomenclaturaEntry[][]): NomenclaturaEntry[] {
  const resultado: NomenclaturaEntry[] = []
  const codigos = new Set<string>()

  for (const grupo of nomenclaturas) {
    for (const item of grupo) {
      const codigo = item.codigo.toUpperCase()
      if (codigos.has(codigo)) continue

      resultado.push({ ...item, codigo })
      codigos.add(codigo)
    }
  }

  return resultado
}

export function obtenerSiguienteCodigoSeriado(texto: string, codigo: string): string {
  const codigoNormalizado = codigo.trim().toUpperCase()
  const regex = /\b[A-Z]{3}(\d+)\b/gi
  const seriados = [...texto.matchAll(regex)]
    .map(match => Number(match[1]))
    .filter(numero => Number.isFinite(numero))

  const siguiente = seriados.length > 0 ? Math.max(...seriados) + 1 : 1
  return `${codigoNormalizado}${String(siguiente).padStart(3, '0')}`
}

export function obtenerDiscrepanciasNomenclaturas(
  existentes: NomenclaturaEntry[],
  detectadas: NomenclaturaDetectada[]
): DiscrepanciaNomenclatura[] {
  const baseMap = new Map(existentes.map(item => [item.codigo.toUpperCase(), item]))
  const vistasEnDocumento = new Map<string, NomenclaturaDetectada>()
  const discrepancias: DiscrepanciaNomenclatura[] = []

  for (const item of detectadas) {
    const base = baseMap.get(item.codigo)
    const anterior = vistasEnDocumento.get(item.codigo)

    if (base && normalizarDefinicion(base.definicion) !== normalizarDefinicion(item.definicion)) {
      discrepancias.push({
        codigo: item.codigo,
        codigoOriginal: item.codigoOriginal,
        definicionBase: base.definicion,
        definicionDetectada: item.definicion,
        tipo: 'definicion_distinta',
      })
    }

    if (anterior && normalizarDefinicion(anterior.definicion) !== normalizarDefinicion(item.definicion)) {
      discrepancias.push({
        codigo: item.codigo,
        codigoOriginal: item.codigoOriginal,
        definicionBase: anterior.definicion,
        definicionDetectada: item.definicion,
        tipo: 'duplicado_distinto',
      })
    }

    vistasEnDocumento.set(item.codigo, item)
  }

  return discrepancias
}
