import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Etiquetas que tienen lista desplegable de opciones guardadas.
// Compartidas entre ModuloFicha y ModuloMateriales via localStorage
// (key: "ficha-opciones:<etiqueta>").
export const CAMPOS_CON_OPCIONES = new Set([
  'Tipo de instalacion',
  'Ubicacion respecto al eje de proyecto',
  'Estado fisico',
])

// Opciones iniciales por etiqueta. Se combinan con las que el usuario agrega.
export const OPCIONES_POR_DEFECTO: Record<string, string[]> = {
  'Tipo de instalacion': ['Aéreo', 'Terrestre'],
  'Ubicacion respecto al eje de proyecto': ['Izquierda', 'Derecha', 'Centro'],
  'Estado fisico': ['Bueno', 'Regular', 'Malo'],
}

// Mapa coord (layout Materiales) -> etiqueta con opciones.
export const COORDS_CON_OPCIONES: Record<string, string> = {
  '3-D': 'Tipo de instalacion',
  '3-F': 'Ubicacion respecto al eje de proyecto',
  '5-F': 'Estado fisico',
}

/**
 * Carga opciones (defaults + localStorage) y permite registrar nuevas.
 * Un solo store compartido entre modulos para que una opcion agregada
 * en Ficha aparezca en Materiales y viceversa.
 */
export function useOpcionesCampos(): {
  opciones: Record<string, string[]>
  registrar: (etiqueta: string, valor: string) => void
} {
  const [opciones, setOpciones] = useState<Record<string, string[]>>({})

  useEffect(() => {
    const cargadas: Record<string, string[]> = {}
    for (const etiqueta of CAMPOS_CON_OPCIONES) {
      const porDefecto = OPCIONES_POR_DEFECTO[etiqueta] || []
      let guardadas: string[] = []
      try {
        const raw = localStorage.getItem(`ficha-opciones:${etiqueta}`)
        guardadas = raw ? (JSON.parse(raw) as string[]) : []
      } catch {
        guardadas = []
      }
      const vistos = new Set<string>()
      cargadas[etiqueta] = [...porDefecto, ...guardadas].filter(op => {
        const clave = op.toLowerCase()
        if (vistos.has(clave)) return false
        vistos.add(clave)
        return true
      })
    }
    setOpciones(cargadas)
  }, [])

  const registrar = (etiqueta: string, valor: string) => {
    const limpio = valor.trim()
    if (!limpio) return
    setOpciones(prev => {
      const actuales = prev[etiqueta] || []
      if (actuales.some(op => op.toLowerCase() === limpio.toLowerCase())) return prev
      const nuevas = [...actuales, limpio]
      try {
        localStorage.setItem(`ficha-opciones:${etiqueta}`, JSON.stringify(nuevas))
      } catch {
        // ponytail: cuota de localStorage agotada, se ignora
      }
      return { ...prev, [etiqueta]: nuevas }
    })
  }

  return { opciones, registrar }
}

// Combobox de texto libre: tipea cualquier valor Y elegi de la lista
// (no filtra, muestra todas las opciones guardadas).
// className opcional para ajustar padding segun modulo (tailwind-merge).
export function CampoCombo({
  value,
  onChange,
  onCommit,
  opciones,
  onFocus,
  placeholder,
  className,
}: {
  value: string
  onChange: (valor: string) => void
  onCommit: (valor: string) => void
  opciones: string[]
  onFocus?: () => void
  placeholder?: string
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const handler = (evento: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [abierto])

  const elegir = (opcion: string) => {
    onChange(opcion)
    onCommit(opcion)
    setAbierto(false)
  }

  return (
    <div ref={contenedorRef} className="relative">
      <Input
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        onFocus={() => { onFocus?.(); setAbierto(true) }}
        onBlur={() => onCommit(value)}
        placeholder={placeholder}
        className={cn('px-0 py-0 pr-7', className)}
      />
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(evento) => { evento.preventDefault(); setAbierto(a => !a) }}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-label="Ver opciones guardadas"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {abierto && opciones.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {opciones.map(opcion => (
            <button
              key={opcion}
              type="button"
              onMouseDown={(evento) => { evento.preventDefault(); elegir(opcion) }}
              className={`flex w-full items-center px-2 py-1.5 text-left text-sm hover:bg-accent ${opcion === value ? 'bg-accent/60' : ''}`}
            >
              {opcion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
