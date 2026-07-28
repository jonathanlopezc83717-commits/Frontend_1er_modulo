import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { type CampoFicha, etiquetaBaseDe } from './ficha-helpers'
import { ETIQUETA_UBICACION, etiquetaBaseFromSufijada } from './ubicacion-opciones'

interface EditarEtiquetasModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  datos: CampoFicha[]
  onSave: (draft: Record<string, string>) => void
}

export function EditarEtiquetasModal({ open, onOpenChange, datos, onSave }: EditarEtiquetasModalProps) {
  const [draft, setDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    const init: Record<string, string> = {}
    for (const campo of datos) init[etiquetaBaseDe(campo)] = campo.etiqueta
    setDraft(init)
  }, [open, datos])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar etiquetas</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {datos.map((campo) => {
            const base = etiquetaBaseDe(campo)
            if (base === ETIQUETA_UBICACION) return null
            const esSufijada = etiquetaBaseFromSufijada(base) !== base
            if (esSufijada) {
              return (
                <div key={base} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{campo.etiqueta}</label>
                  <Input value={campo.etiqueta} disabled />
                  <p className="text-xs text-muted-foreground">Etiqueta generada automáticamente</p>
                </div>
              )
            }
            return (
              <div key={base} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{base}</label>
                <Input
                  value={draft[base] ?? campo.etiqueta}
                  placeholder={base}
                  onChange={(e) => setDraft((d) => ({ ...d, [base]: e.target.value }))}
                />
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { onSave(draft); onOpenChange(false) }}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
