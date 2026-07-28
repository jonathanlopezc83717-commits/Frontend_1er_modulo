import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2 } from 'lucide-react'

interface FilaEditable { key: string; defaultLabel: string; grupo: 'fila' | 'seccion' }

interface CampoCustom { coord: string; etiqueta: string }

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
      const limpio = valor.trim()
      // Si el valor editado coincide con el default, removerlo del override (no persistir defaults).
      if (limpio === '' || limpio === filas.find(f => f.key === key)?.defaultLabel) {
        const { [key]: _omit, ...rest } = prev
        return rest
      }
      return { ...prev, [key]: limpio }
    })
  }

  const cambiarCampo = (coord: string, etiqueta: string) => {
    setDraftCampos(prev => prev.map(c => c.coord === coord ? { ...c, etiqueta } : c))
  }

  const agregarCampo = () => {
    setDraftCampos(prev => [...prev, { coord: nuevaCoordCustom(prev), etiqueta: '' }])
  }

  const eliminarCampo = (coord: string) => {
    setDraftCampos(prev => prev.filter(c => c.coord !== coord))
  }

  const guardar = () => {
    onSave(draft)
    onSaveCamposCustom(draftCampos.filter(c => c.etiqueta.trim() !== ''))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto max-w-2xl">
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
                <p className="text-xs text-muted-foreground">Sin campos personalizados. Cada campo ocupa una fila completa del grid.</p>
              )}
              {draftCampos.map(c => (
                <div key={c.coord} className="grid grid-cols-[80px_1fr_36px] items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{c.coord}</span>
                  <Input
                    value={c.etiqueta}
                    onChange={e => cambiarCampo(c.coord, e.target.value)}
                    placeholder="Etiqueta del campo"
                    className="h-8"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => eliminarCampo(c.coord)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
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
