import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, GripVertical } from 'lucide-react'
import { ELEMENTOS_DISPONIBLES } from './ModuloMateriales'

interface FilaEditable { key: string; defaultLabel: string; grupo: 'fila' | 'seccion' }

export interface CampoCustom { coord: string; etiqueta: string; origen?: string; combo?: boolean }

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
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  filas: FilaEditable[]
  overrideInicial: Record<string, string>
  onSave: (override: Record<string, string>) => void
  camposCustomInicial: CampoCustom[]
  onSaveCamposCustom: (campos: CampoCustom[]) => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>(overrideInicial)
  const [draftCampos, setDraftCampos] = useState<CampoCustom[]>(camposCustomInicial)

  useEffect(() => {
    if (open) {
      setDraft(overrideInicial)
      setDraftCampos(camposCustomInicial.map(c => ({ ...c })))
    }
  }, [open, overrideInicial, camposCustomInicial])

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

  const cambiarOrigen = (coord: string, origen: string) => {
    // El centinela '__ninguno__' de ELEMENTOS_DISPONIBLES se traduce a sin origen.
    setDraftCampos(prev => prev.map(c => c.coord === coord ? { ...c, origen: origen === '__ninguno__' ? '' : origen } : c))
  }

  const cambiarTipo = (coord: string, tipo: 'vinculado' | 'opciones-multiples') => {
    setDraftCampos(prev => prev.map(c => {
      if (c.coord !== coord) return c
      return tipo === 'vinculado' ? { ...c, combo: false } : { ...c, combo: true }
    }))
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
    const limpios = draftCampos.filter(c => c.etiqueta.trim() !== '')
    onSave(draft)
    onSaveCamposCustom(limpios)
    onOpenChange(false)
  }

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
              {filas.filter(f => f.grupo === 'fila').map(f => (
                <div key={f.key} className="grid grid-cols-[80px_1fr] items-center gap-2">
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
                const tipo = c.combo === true ? 'opciones-multiples' : 'vinculado'
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
                      onValueChange={(v) => cambiarTipo(c.coord, v as 'vinculado' | 'opciones-multiples')}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vinculado">Vinculado</SelectItem>
                        <SelectItem value="opciones-multiples">Opciones múltiples</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => eliminarCampo(c.coord)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {tipo === 'vinculado' ? (
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
                  ) : (
                    <p className="pl-2 text-sm text-muted-foreground">
                      Las opciones se definen al usar el campo y se comparten con el módulo Ficha.
                    </p>
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
