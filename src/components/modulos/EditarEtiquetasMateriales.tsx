import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface FilaEditable { key: string; defaultLabel: string; grupo: 'fila' | 'seccion' }

export function EditarEtiquetasMateriales({
  open,
  onOpenChange,
  filas,
  overrideInicial,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  filas: FilaEditable[]
  overrideInicial: Record<string, string>
  onSave: (override: Record<string, string>) => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>(overrideInicial)

  useEffect(() => { if (open) setDraft(overrideInicial) }, [open, overrideInicial])

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
          <Button onClick={() => { onSave(draft); onOpenChange(false) }}>Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
