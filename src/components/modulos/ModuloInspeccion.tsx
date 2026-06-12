import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ClipboardCheck, CheckCircle2, Circle, Save } from 'lucide-react'
import { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

const checklistItems = [
  { id: 'estructura', label: 'Estado estructural general', categoria: 'Estructura' },
  { id: 'superficie', label: 'Condición de la superficie de rodadura', categoria: 'Vía' },
  { id: 'drenaje', label: 'Sistema de drenaje operativo', categoria: 'Infraestructura' },
  { id: 'senalizacion', label: 'Señalización visible y legible', categoria: 'Seguridad' },
  { id: 'vegetacion', label: 'Control de vegetación adyacente', categoria: 'Mantenimiento' },
  { id: 'iluminacion', label: 'Sistema de iluminación funcional', categoria: 'Seguridad' },
  { id: 'accesos', label: 'Accesos de emergencia despejados', categoria: 'Seguridad' },
  { id: 'erosion', label: 'Sin signos de erosión significativa', categoria: 'Estructura' },
]

export function ModuloInspeccion() {
  const { state, actualizarPunto } = useApp()
  const punto = state.puntoActivo
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [observaciones, setObservaciones] = useState('')

  const toggleItem = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleGuardar = () => {
    if (!punto) return
    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        inspeccion: {
          checklist,
          observaciones,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    alert('Inspección guardada')
  }

  const completados = Object.values(checklist).filter(Boolean).length
  const total = checklistItems.length
  const progreso = Math.round((completados / total) * 100)

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ClipboardCheck className="w-12 h-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-muted-foreground">Selecciona un punto para realizar inspección</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-4 pr-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">{punto.numeroSerie}</span>
            </div>
            <p className="font-medium">{punto.nombre}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-primary" />
                <CardTitle>Checklist de Inspección</CardTitle>
              </div>
              <Badge variant="secondary">
                {completados}/{total} ({progreso}%)
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
          {/* Progreso */}
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>

          <div className="space-y-2">
            {checklistItems.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                  checklist[item.id]
                    ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
                    : 'bg-muted/50 border-border hover:border-primary/50'
                }`}
              >
                {checklist[item.id] ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className={`text-sm ${checklist[item.id] ? 'line-through text-muted-foreground' : ''}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.categoria}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="obs-inspeccion">Observaciones</Label>
            <Textarea
              id="obs-inspeccion"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Observaciones adicionales de la inspección..."
              rows={3}
            />
          </div>

          <Button onClick={handleGuardar}>
            <Save className="w-4 h-4 mr-2" />
            Guardar inspección
          </Button>
        </CardContent>
      </Card>
    </div>
    </ScrollArea>
  )
}
