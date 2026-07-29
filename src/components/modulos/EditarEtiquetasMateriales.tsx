import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, GripVertical } from 'lucide-react'
import { ELEMENTOS_DISPONIBLES, COORD_A_CAMPO } from './ModuloMateriales'

interface FilaEditable { key: string; defaultLabel: string; grupo: 'fila' | 'seccion' }

export interface CampoCustom { coord: string; etiqueta: string; origen?: string; combo?: boolean; coordenadas?: boolean; lados?: string[] }

/** Minta una coord `custom-N` (N>=1) que no esté ya usada, rellenando huecos. */
export function nuevaCoordCustom(existentes: ReadonlyArray<{ coord: string }>): string {
  const usados = new Set(existentes.map(c => c.coord))
  let i = 1
  while (usados.has(`custom-${i}`)) i++
  return `custom-${i}`
}

export function EditarEtiquetasMateriales({
  open,
  onOpenChange,
  filas,
  overrideInicial,
  onSave,
  camposCustomInicial,
  onSaveCamposCustom,
  origenCoordsInicial,
  onSaveOrigenCoords,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  filas: FilaEditable[]
  overrideInicial: Record<string, string>
  onSave: (override: Record<string, string>) => void
  camposCustomInicial: CampoCustom[]
  onSaveCamposCustom: (campos: CampoCustom[]) => void
  origenCoordsInicial: Record<string, string>
  onSaveOrigenCoords: (override: Record<string, string>) => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>(overrideInicial)
  const [draftCampos, setDraftCampos] = useState<CampoCustom[]>(camposCustomInicial)
  const [draftOrigen, setDraftOrigen] = useState<Record<string, string>>(origenCoordsInicial)

  useEffect(() => {
    if (open) {
      setDraft(overrideInicial)
      setDraftCampos(camposCustomInicial.map(c => ({ ...c })))
      setDraftOrigen({ ...origenCoordsInicial })
    }
  }, [open, overrideInicial, camposCustomInicial, origenCoordsInicial])

  const cambiar = (key: string, valor: string) => {
    setDraft(prev => {
      // Decidir si descarta el override solo sobre el valor trimmeado,
      // pero guardar el valor original para respetar espacios internos y al final.
      const limpio = valor.trim()
      if (limpio === '' || limpio === filas.find(f => f.key === key)?.defaultLabel) {
        const { [key]: _omit, ...rest } = prev
        return rest
      }
      return { ...prev, [key]: valor }
    })
  }

  const cambiarCampo = (coord: string, etiqueta: string) => {
    setDraftCampos(prev => prev.map(c => c.coord === coord ? { ...c, etiqueta } : c))
  }

  const cambiarOrigenCoord = (coord: string, origen: string) => {
    setDraftOrigen(prev => ({ ...prev, [coord]: origen }))
  }

  const cambiarOrigen = (coord: string, origen: string) => {
    // El centinela '__ninguno__' de ELEMENTOS_DISPONIBLES se traduce a sin origen.
    setDraftCampos(prev => prev.map(c => c.coord === coord ? { ...c, origen: origen === '__ninguno__' ? '' : origen } : c))
  }

  const cambiarTipo = (coord: string, tipo: 'vinculado' | 'opciones-multiples' | 'coordenadas') => {
    setDraftCampos(prev => prev.map(c => {
      if (c.coord !== coord) return c
      if (tipo === 'coordenadas') {
        return { ...c, coordenadas: true, combo: false, origen: '', lados: c.lados ? [...c.lados] : [] }
      }
      const base = { ...c, coordenadas: false }
      return tipo === 'vinculado' ? { ...base, combo: false } : { ...base, combo: true }
    }))
  }

  const agregarLado = (coord: string) => {
    setDraftCampos(prev => prev.map(c => c.coord === coord ? { ...c, lados: [...(c.lados ?? []), ''] } : c))
  }

  const cambiarLado = (coord: string, index: number, valor: string) => {
    setDraftCampos(prev => prev.map(c => {
      if (c.coord !== coord || !c.lados) return c
      const copia = [...c.lados]
      copia[index] = valor
      return { ...c, lados: copia }
    }))
  }

  const eliminarLado = (coord: string, index: number) => {
    setDraftCampos(prev => prev.map(c => {
      if (c.coord !== coord || !c.lados) return c
      return { ...c, lados: c.lados.filter((_, i) => i !== index) }
    }))
  }

  const separarEnCampos = (coord: string) => {
    setDraftCampos(prev => {
      const campo = prev.find(c => c.coord === coord)
      if (!campo || !campo.coordenadas || !campo.lados) return prev
      const tokens: string[] = []
      for (const lado of campo.lados) {
        for (const tok of lado.split('-')) {
          const t = tok.trim()
          if (t !== '') tokens.push(t)
        }
      }
      if (tokens.length === 0) return prev
      const base = prev.filter(c => c.coord !== coord)
      const nuevos: CampoCustom[] = []
      for (const tok of tokens) {
        const coordNueva = nuevaCoordCustom([...base, ...nuevos])
        nuevos.push({ coord: coordNueva, etiqueta: tok, coordenadas: true, lados: [tok] })
      }
      return [...base, ...nuevos]
    })
  }

  const agregarCampo = () => {
    setDraftCampos(prev => [...prev, { coord: nuevaCoordCustom(prev), etiqueta: '' }])
  }

  const eliminarCampo = (coord: string) => {
    setDraftCampos(prev => prev.filter(c => c.coord !== coord))
  }

  // Drag & drop para reordenar campos custom (HTML5 nativo, sin dependencias).
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const onDragStart = (index: number) => setDragIndex(index)
  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    setDraftCampos(prev => {
      const nuevos = [...prev]
      const [movido] = nuevos.splice(dragIndex, 1)
      nuevos.splice(index, 0, movido)
      return nuevos
    })
    setDragIndex(index)
  }
  const onDragEnd = () => setDragIndex(null)

  const guardar = () => {
    const limpios = draftCampos
      .filter(c => c.etiqueta.trim() !== '')
      .map(c => {
        if (!c.lados) return c
        const ladosLimpios = c.lados.map(l => l.trim()).filter(l => l !== '')
        return { ...c, lados: ladosLimpios.length > 0 ? ladosLimpios : undefined }
      })
    const origenPersistido: Record<string, string> = {}
    for (const [key, val] of Object.entries(draftOrigen)) {
      const limpio = val.trim()
      if (limpio === '' || limpio === '__ninguno__') continue
      if (limpio === COORD_A_CAMPO[key]) continue
      origenPersistido[key] = val
    }
    onSave(draft)
    onSaveCamposCustom(limpios)
    onSaveOrigenCoords(origenPersistido)
    onOpenChange(false)
  }

  const filaPorKey = new Map(
    filas.filter(f => f.grupo === 'fila').map(f => [f.key, f.defaultLabel] as const)
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto max-w-4xl">
        <DialogHeader>
          <DialogTitle>Editar etiquetas</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Los cambios se guardan al hacer clic en "Guardar plantilla". Las claves internas (coords) no cambian; solo el texto visible y exportado.
        </p>
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 text-sm font-semibold">Campos del grid</h4>
            <div className="grid gap-2">
              {Object.entries(COORD_A_CAMPO).map(([coord, campoPorDefecto]) => {
                const label = filaPorKey.get(coord)
                return (
                <div key={coord} className="grid grid-cols-[80px_1fr_180px] items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{coord}</span>
                  {label !== undefined ? (
                    <Input
                      value={draft[coord] ?? label}
                      onChange={e => cambiar(coord, e.target.value)}
                      placeholder={label}
                      className="h-8"
                    />
                  ) : (
                    <span className="text-xs capitalize text-muted-foreground">{campoPorDefecto.replace(/_/g, ' ')}</span>
                  )}
                  <Select
                    value={draftOrigen[coord] ?? campoPorDefecto ?? '__ninguno__'}
                    onValueChange={(v) => cambiarOrigenCoord(coord, v)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Origen" />
                    </SelectTrigger>
                    <SelectContent>
                      {ELEMENTOS_DISPONIBLES.map(el => (
                        <SelectItem key={el.value} value={el.value}>{el.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )
              })}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold">Campos personalizados</h4>
              <Button variant="outline" size="sm" onClick={agregarCampo}>
                + Agregar campo
              </Button>
            </div>
            <div className="grid gap-2">
              {draftCampos.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin campos personalizados. Arrastrá el ícono ≡ para reordenar.</p>
              )}
              {draftCampos.map((c, idx) => {
                const tipo = c.coordenadas ? 'coordenadas' : (c.combo === true ? 'opciones-multiples' : 'vinculado')
                return (
                <div
                  key={c.coord}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={(e) => onDragOver(e, idx)}
                  onDragEnd={onDragEnd}
                  className={`space-y-2 rounded-md border p-2 ${dragIndex === idx ? 'opacity-40' : ''}`}
                >
                  <div className="grid grid-cols-[20px_70px_1fr_180px_36px] items-center gap-2">
                    <span className="cursor-move text-muted-foreground" aria-label="Arrastrar para reordenar">
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{c.coord}</span>
                    <Input
                      value={c.etiqueta}
                      onChange={e => cambiarCampo(c.coord, e.target.value)}
                      placeholder="Etiqueta del campo"
                      className="h-8"
                    />
                    <Select
                      value={tipo}
                      onValueChange={(v) => cambiarTipo(c.coord, v as 'vinculado' | 'opciones-multiples' | 'coordenadas')}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vinculado">Vinculado</SelectItem>
                        <SelectItem value="opciones-multiples">Opciones múltiples</SelectItem>
                        <SelectItem value="coordenadas">Coordenadas duales</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => eliminarCampo(c.coord)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {tipo === 'vinculado' && (
                    <div className="grid grid-cols-[20px_70px_1fr_180px_36px] items-center gap-2 pl-2">
                      <span className="text-[10px] text-muted-foreground">Origen</span>
                      <span />
                      <Select
                        value={c.origen || '__ninguno__'}
                        onValueChange={(v) => cambiarOrigen(c.coord, v)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Origen" />
                        </SelectTrigger>
                        <SelectContent>
                          {ELEMENTOS_DISPONIBLES.map(el => (
                            <SelectItem key={el.value} value={el.value}>{el.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {tipo === 'opciones-multiples' && (
                    <p className="pl-2 text-sm text-muted-foreground">
                      Las opciones se definen al usar el campo y se comparten con el módulo Ficha.
                    </p>
                  )}
                  {tipo === 'coordenadas' && (
                    <div className="space-y-1 pl-2">
                      <span className="text-[10px] text-muted-foreground">Lados (usar "-" para sub-lados, ej: Izquierda-Derecha)</span>
                      {(c.lados ?? []).map((lado, li) => (
                        <div key={li} className="grid grid-cols-[1fr_36px] items-center gap-2">
                          <Input
                            value={lado}
                            onChange={e => cambiarLado(c.coord, li, e.target.value)}
                            placeholder="Ej: Izquierda-Derecha"
                            className="h-8"
                          />
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => eliminarLado(c.coord, li)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => agregarLado(c.coord)}>+ Agregar lado</Button>
                        {(c.lados ?? []).some(l => l.trim()) && (
                          <Button variant="outline" size="sm" onClick={() => separarEnCampos(c.coord)}>Separar en campos</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">Secciones (Excel y PDF)</h4>
            <div className="grid gap-2">
              {filas.filter(f => f.grupo === 'seccion').map(f => (
                <div key={f.key} className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{f.key}</span>
                  <Input
                    value={draft[f.key] ?? f.defaultLabel}
                    onChange={e => cambiar(f.key, e.target.value)}
                    placeholder={f.defaultLabel}
                    className="h-8"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar}>Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
