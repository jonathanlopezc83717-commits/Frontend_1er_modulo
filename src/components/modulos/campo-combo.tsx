import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { OPCIONES_UBICACION } from './ubicacion-opciones'

// Etiquetas que tienen lista desplegable de opciones guardadas.
// Compartidas entre módulos via localStorage
// (key: "ficha-opciones:<etiqueta>").
export const CAMPOS_CON_OPCIONES = new Set([
  'Tipo de instalacion',
  'Ubicacion respecto al eje de proyecto',
  'Estado fisico',
])

// Opciones iniciales por etiqueta. Se combinan con las que el usuario agrega.
export const OPCIONES_POR_DEFECTO: Record<string, string[]> = {
  'Tipo de instalacion': ['Aéreo', 'Terrestre'],
  'Ubicacion respecto al eje de proyecto': [...OPCIONES_UBICACION],
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
  eliminarOpcion: (etiqueta: string, valor: string) => void
} {
  const [opciones, setOpciones] = useState<Record<string, string[]>>({})

  useEffect(() => {
    const cargadas: Record<string, string[]> = {}
    const PREFIJO = 'ficha-opciones:'
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i)
      if (!clave || !clave.startsWith(PREFIJO)) continue
      const etiqueta = clave.slice(PREFIJO.length)
      let guardadas: string[] = []
      try {
        const raw = localStorage.getItem(clave)
        guardadas = raw ? (JSON.parse(raw) as string[]) : []
      } catch {
        guardadas = []
      }
      const vistos = new Set<string>()
      const unicas: string[] = []
      for (const op of guardadas) {
        const claveDedup = op.toLowerCase()
        if (vistos.has(claveDedup)) continue
        vistos.add(claveDedup)
        unicas.push(op)
      }
      cargadas[etiqueta] = unicas
    }
    for (const etiqueta of CAMPOS_CON_OPCIONES) {
      if (cargadas[etiqueta] === undefined) {
        cargadas[etiqueta] = OPCIONES_POR_DEFECTO[etiqueta] || []
      }
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

  const eliminarOpcion = (etiqueta: string, valor: string) => {
    setOpciones(prev => {
      const actuales = prev[etiqueta] || []
      const nuevas = actuales.filter(op => op !== valor)
      try {
        localStorage.setItem(`ficha-opciones:${etiqueta}`, JSON.stringify(nuevas))
      } catch {
        // ponytail: cuota de localStorage agotada, se ignora
      }
      return { ...prev, [etiqueta]: nuevas }
    })
  }

  return { opciones, registrar, eliminarOpcion }
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
  restrictTo,
  onEliminarOpcion,
}: {
  value: string
  onChange: (valor: string) => void
  onCommit: (valor: string) => void
  opciones: string[]
  onFocus?: () => void
  placeholder?: string
  className?: string
  restrictTo?: readonly string[]
  onEliminarOpcion?: (valor: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const [gestorAbierto, setGestorAbierto] = useState(false)
  const gestorRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!gestorAbierto) return
    const handler = (evento: MouseEvent) => {
      if (gestorRef.current && !gestorRef.current.contains(evento.target as Node)) {
        setGestorAbierto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [gestorAbierto])

  const elegir = (opcion: string) => {
    onChange(opcion)
    onCommit(opcion)
    setAbierto(false)
  }

  if (restrictTo) {
    const fueraDeLista = value !== '' && !restrictTo.includes(value)
    return (
      <select
        value={value}
        onChange={(evento) => elegir(evento.target.value)}
        className={cn('h-9 w-full rounded-md border border-input bg-transparent px-1 py-0 text-sm', className)}
      >
        {fueraDeLista && <option value={value} disabled>{value}</option>}
        {restrictTo.map(opcion => (
          <option key={opcion} value={opcion}>{opcion}</option>
        ))}
      </select>
    )
  }

  const comboEl = (
    <div ref={contenedorRef} className={cn('relative', onEliminarOpcion && 'flex-1 min-w-0')}>
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
              className={`flex w-full items-center px-2 py-1.5 text-left text-sm text-blue-600 hover:bg-accent ${opcion === value ? 'bg-accent/60' : ''}`}
            >
              {opcion}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  if (!onEliminarOpcion) return comboEl

  return (
    <div className="flex items-center gap-1">
      {comboEl}
      <div ref={gestorRef} className="relative shrink-0">
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(evento) => {
            evento.preventDefault()
            setGestorAbierto(a => {
              const next = !a
              if (next) setAbierto(false)
              return next
            })
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Gestionar opciones"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {gestorAbierto && (
          <div className="absolute right-0 z-50 mt-1 max-h-60 min-w-44 overflow-auto rounded-md border bg-popover shadow-md">
            {opciones.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin opciones guardadas</p>
            ) : (
              opciones.map(opcion => (
                <div key={opcion} className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-accent">
                  <span className="truncate">{opcion}</span>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(evento) => { evento.preventDefault(); onEliminarOpcion(opcion) }}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Eliminar opción ${opcion}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
