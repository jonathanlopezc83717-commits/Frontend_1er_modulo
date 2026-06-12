import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { BarChart3, Download, Printer } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

const CHECKLIST_MODULOS = [
  { id: 'analisis', label: 'Analisis de Imagenes', aliases: ['analisis'] },
  { id: 'georeferencia', label: 'Georeferenciacion', aliases: ['georeferencia', 'georeferenciacion'] },
  { id: 'documentacion', label: 'Documentacion', aliases: ['documentacion'] },
  { id: 'materiales', label: 'Formato', aliases: ['materiales'] },
  { id: 'ficha', label: 'Ficha', aliases: ['ficha'] },
]

export function ModuloReportes() {
  const { state } = useApp()
  const punto = state.puntoActivo

  const generarResumen = () => {
    if (!punto) return null

    const modulos = Object.keys(punto.moduloData || {})
    const estadoModulos = CHECKLIST_MODULOS.map((modulo) => ({
      ...modulo,
      completado: modulo.aliases.some(alias => modulos.includes(alias)),
    }))

    return {
      modulosCompletados: estadoModulos.filter(modulo => modulo.completado).length,
      totalModulos: CHECKLIST_MODULOS.length,
      estadoModulos,
    }
  }

  const resumen = generarResumen()

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="mb-3 h-12 w-12 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Selecciona un punto para ver el checklist</p>
        </CardContent>
      </Card>
    )
  }

  const totalModulos = resumen?.totalModulos || CHECKLIST_MODULOS.length
  const modulosCompletados = resumen?.modulosCompletados || 0
  const progreso = totalModulos > 0 ? (modulosCompletados / totalModulos) * 100 : 0

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-4 pr-2">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
              <span className="text-sm font-bold text-primary-foreground">{punto.numeroSerie}</span>
            </div>
            <p className="font-medium">{punto.nombre}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle>Checklist del Punto</CardTitle>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="mr-1 h-4 w-4" />
                  Exportar
                </Button>
                <Button variant="outline" size="sm">
                  <Printer className="mr-1 h-4 w-4" />
                  Imprimir
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Card className="bg-muted/50">
              <CardContent className="py-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Progreso general</span>
                  <span className="text-sm text-muted-foreground">
                    {modulosCompletados}/{totalModulos} modulos
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              {(resumen?.estadoModulos || CHECKLIST_MODULOS.map(modulo => ({ ...modulo, completado: false }))).map((modulo) => (
                <div
                  key={modulo.id}
                  className={`flex items-center gap-2 rounded-lg border p-3 ${
                    modulo.completado
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                      : 'border-border bg-muted/50'
                  }`}
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      modulo.completado ? 'bg-green-600' : 'bg-muted-foreground'
                    }`}
                  />
                  <span className="text-sm">{modulo.label}</span>
                </div>
              ))}
            </div>

            <Separator />

            <Card className="bg-muted/50">
              <CardContent className="py-4">
                <h4 className="mb-2 text-sm font-medium">Informacion general</h4>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Numero de serie: </span>
                    <span>{punto.numeroSerie}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Nombre: </span>
                    <span>{punto.nombre}</span>
                  </div>
                  {punto.coordenadas && (
                    <>
                      <div>
                        <span className="text-muted-foreground">Latitud: </span>
                        <span>{punto.coordenadas.lat}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Longitud: </span>
                        <span>{punto.coordenadas.lng}</span>
                      </div>
                    </>
                  )}
                  {punto.carpetaPath && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">Carpeta: </span>
                      <span>{punto.carpetaPath}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
