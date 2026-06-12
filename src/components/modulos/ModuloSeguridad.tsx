import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Shield, AlertTriangle, CheckCircle2, Save } from 'lucide-react'
import { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Riesgo {
  id: string
  descripcion: string
  nivel: 'bajo' | 'medio' | 'alto' | 'critico'
  mitigacion: string
}

export function ModuloSeguridad() {
  const { state, actualizarPunto } = useApp()
  const punto = state.puntoActivo
  const [riesgos, setRiesgos] = useState<Riesgo[]>([])

  const agregarRiesgo = () => {
    setRiesgos(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        descripcion: '',
        nivel: 'bajo',
        mitigacion: '',
      },
    ])
  }

  const eliminarRiesgo = (id: string) => {
    setRiesgos(prev => prev.filter(r => r.id !== id))
  }

  const actualizarRiesgo = (id: string, campo: keyof Riesgo, valor: string) => {
    setRiesgos(prev =>
      prev.map(r => (r.id === id ? { ...r, [campo]: valor } : r))
    )
  }

  const handleGuardar = () => {
    if (!punto) return
    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        seguridad: {
          riesgos,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    alert('Análisis de seguridad guardado')
  }

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Shield className="w-12 h-12 text-muted-foreground opacity-30 mb-3" />
          <p className="text-muted-foreground">Selecciona un punto para análisis de seguridad</p>
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
                <Shield className="w-5 h-5 text-primary" />
                <CardTitle>Análisis de Riesgos</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={agregarRiesgo}>
                Agregar riesgo
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {riesgos.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600 opacity-50" />
                <p className="text-sm text-muted-foreground">No se han identificado riesgos</p>
              </div>
            ) : (
              riesgos.map((riesgo) => (
                <Card key={riesgo.id} className="bg-muted/50">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          value={riesgo.descripcion}
                          onChange={(e) => actualizarRiesgo(riesgo.id, 'descripcion', e.target.value)}
                          placeholder="Descripción del riesgo"
                          className="h-8"
                        />
                      </div>
                      <Select
                        value={riesgo.nivel}
                        onValueChange={(val) => actualizarRiesgo(riesgo.id, 'nivel', val)}
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bajo">Bajo</SelectItem>
                          <SelectItem value="medio">Medio</SelectItem>
                          <SelectItem value="alto">Alto</SelectItem>
                          <SelectItem value="critico">Crítico</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => eliminarRiesgo(riesgo.id)}
                      >
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    <Input
                      value={riesgo.mitigacion}
                      onChange={(e) => actualizarRiesgo(riesgo.id, 'mitigacion', e.target.value)}
                      placeholder="Medida de mitigación"
                      className="h-8"
                    />
                  </CardContent>
                </Card>
              ))
            )}

            <Button onClick={handleGuardar}>
              <Save className="w-4 h-4 mr-2" />
              Guardar análisis
            </Button>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
