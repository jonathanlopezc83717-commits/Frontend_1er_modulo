import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import {
  type CampoFicha,
  esCampoRemovible,
  etiquetaBaseDe,
} from './ficha-helpers'
import type { PlantillaCampoFormato } from '@/types'
import { ETIQUETA_UBICACION, etiquetaBaseFromSufijada } from './ubicacion-opciones'

export interface DraftMapping {
  sheet: string
  cell: string
  labelCell?: string
}

export interface EditarEtiquetasDraft {
  renames: Record<string, string>
  added: CampoFicha[]
  removed: string[]
  mappings: Record<string, DraftMapping>
}

interface EditarEtiquetasModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  datos: CampoFicha[]
  mapeoCustom?: Record<string, PlantillaCampoFormato>
  onSave: (draft: EditarEtiquetasDraft) => void
}

export function EditarEtiquetasModal({
  open,
  onOpenChange,
  datos,
  mapeoCustom = {},
  onSave,
}: EditarEtiquetasModalProps) {
  const [draftRenames, setDraftRenames] = useState<Record<string, string>>({})
  const [draftAdded, setDraftAdded] = useState<CampoFicha[]>([])
  const [draftRemoved, setDraftRemoved] = useState<Set<string>>(new Set())
  const [draftMappings, setDraftMappings] = useState<Record<string, DraftMapping>>({})

  useEffect(() => {
    if (!open) return
    const renames: Record<string, string> = {}
    const mappings: Record<string, DraftMapping> = {}
    for (const campo of datos) {
      const base = etiquetaBaseDe(campo)
      renames[base] = campo.etiqueta
      const existing = mapeoCustom[base]
      if (existing) {
        mappings[base] = {
          sheet: existing.sheet,
          cell: existing.cell,
          labelCell: existing.labelCell,
        }
      }
    }
    setDraftRenames(renames)
    setDraftMappings(mappings)
    setDraftAdded([])
    setDraftRemoved(new Set())
  }, [open, datos, mapeoCustom])

  const allRows: CampoFicha[] = [
    ...datos,
    ...draftAdded,
  ]

  const handleGuardar = () => {
    onSave({
      renames: draftRenames,
      added: draftAdded,
      removed: Array.from(draftRemoved),
      mappings: draftMappings,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar etiquetas</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {allRows.map((campo) => {
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
            const removible = esCampoRemovible(campo)
            const isRemoved = draftRemoved.has(base)
            const mapping = draftMappings[base] ?? { sheet: '', cell: '', labelCell: '' }
            const showMappingRow = removible && !isRemoved
            return (
              <div key={base} className="space-y-1 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-muted-foreground">{base}</label>
                    <Input
                      value={isRemoved ? campo.etiqueta : (draftRenames[base] ?? campo.etiqueta)}
                      placeholder={base}
                      disabled={isRemoved}
                      onChange={(e) => setDraftRenames((d) => ({ ...d, [base]: e.target.value }))}
                    />
                  </div>
                  {removible && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-4"
                      aria-label={isRemoved ? 'Restaurar campo' : 'Eliminar campo'}
                      onClick={() =>
                        setDraftRemoved((prev) => {
                          const next = new Set(prev)
                          if (next.has(base)) next.delete(base)
                          else next.add(base)
                          return next
                        })
                      }
                    >
                      <Trash2 className={`h-4 w-4 ${isRemoved ? 'opacity-40' : ''}`} />
                    </Button>
                  )}
                </div>
                {showMappingRow && (
                  <div className="grid grid-cols-3 gap-2 pl-1">
                    <Input
                      value={mapping.sheet}
                      placeholder="Hoja"
                      onChange={(e) =>
                        setDraftMappings((m) => ({
                          ...m,
                          [base]: { ...mapping, sheet: e.target.value },
                        }))
                      }
                    />
                    <Input
                      value={mapping.cell}
                      placeholder="Celda valor"
                      onChange={(e) =>
                        setDraftMappings((m) => ({
                          ...m,
                          [base]: { ...mapping, cell: e.target.value },
                        }))
                      }
                    />
                    <Input
                      value={mapping.labelCell ?? ''}
                      placeholder="Celda etiqueta"
                      onChange={(e) =>
                        setDraftMappings((m) => ({
                          ...m,
                          [base]: { ...mapping, labelCell: e.target.value },
                        }))
                      }
                    />
                  </div>
                )}
                {isRemoved && (
                  <p className="text-xs text-muted-foreground">Se eliminará al guardar</p>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex justify-start">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDraftAdded((prev) => [
                ...prev,
                { etiqueta: 'Nuevo campo', etiquetaBase: `custom_${Date.now()}`, valor: '' },
              ])
            }
          >
            + Agregar campo
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleGuardar}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
