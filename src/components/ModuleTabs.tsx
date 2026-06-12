import { useApp } from '@/context/AppContext'
import { MODULOS } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useEffect, useMemo } from 'react'
import {
  Wand2,
  MapPin,
  FileText,
  FileSpreadsheet,
  Package,
  BarChart3,
  Tag,
} from 'lucide-react'
import { ModuloAnalisis } from './modulos/ModuloAnalisis'
import { ModuloGeoreferencia } from './modulos/ModuloGeoreferencia'
import { ModuloDocumentacion } from './modulos/ModuloDocumentacion'
import { ModuloNomenclaturas } from './modulos/ModuloNomenclaturas'
import { ModuloMateriales } from './modulos/ModuloMateriales'
import { ModuloFicha } from './modulos/ModuloFicha'
import { ModuloReportes } from './modulos/ModuloReportes'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Wand2,
  MapPin,
  FileText,
  FileSpreadsheet,
  Package,
  BarChart3,
  Tag,
}

const componentMap: Record<string, React.ComponentType> = {
  ModuloAnalisis,
  ModuloGeoreferencia,
  ModuloDocumentacion,
  ModuloNomenclaturas,
  ModuloMateriales,
  ModuloFicha,
  ModuloReportes,
}

interface ModuleTabsProps {
  mostrarNomenclaturas?: boolean
}

export function ModuleTabs({ mostrarNomenclaturas = false }: ModuleTabsProps) {
  const { state, setModuloActivo } = useApp()
  const { moduloActivo, puntoActivo } = state
  const modulosVisibles = useMemo(
    () => MODULOS.filter(modulo => modulo.id !== 'nomenclaturas' || mostrarNomenclaturas),
    [mostrarNomenclaturas]
  )

  const handleTabChange = (value: string) => {
    setModuloActivo(value)
  }

  useEffect(() => {
    if (!modulosVisibles.some(modulo => modulo.id === moduloActivo)) {
      setModuloActivo(modulosVisibles[0]?.id || 'analisis')
    }
  }, [moduloActivo, modulosVisibles, setModuloActivo])

  return (
    <Card className="h-full flex flex-col relative" style={{ isolation: 'isolate' }}>
      <CardContent className="p-0 flex flex-col h-full">
        <Tabs value={moduloActivo} onValueChange={handleTabChange} className="w-full flex flex-col h-full">
          {/* TabsList con z-index alto para asegurar clickeabilidad */}
          <div className="border-b px-2 pt-2 shrink-0 relative" style={{ zIndex: 30 }}>
            <TabsList className="w-full justify-start h-auto flex-wrap gap-0.5 bg-transparent p-0 relative">
              {modulosVisibles.map((modulo) => {
                const Icon = iconMap[modulo.icono]
                const isActive = moduloActivo === modulo.id
                const tieneDatos = puntoActivo?.moduloData?.[modulo.id] !== undefined

                return (
                  <TabsTrigger
                    key={modulo.id}
                    value={modulo.id}
                    className="relative data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 px-2 py-1.5 text-xs pointer-events-auto"
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    <span className="hidden md:inline">{modulo.nombre}</span>
                    <span className="md:hidden">{modulo.nombre.split(' ')[0]}</span>
                    {tieneDatos && (
                      <Badge
                        variant={isActive ? "outline" : "secondary"}
                        className="ml-0.5 h-3 min-w-3 px-0.5 text-[8px]"
                      >
                        ✓
                      </Badge>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden relative" style={{ zIndex: 20 }}>
            {modulosVisibles.map((modulo) => {
              const ModuloComponent = componentMap[modulo.componente]

              return (
                <TabsContent
                  key={modulo.id}
                  value={modulo.id}
                  className="mt-0 h-full"
                >
                  <div className="p-3 h-full">
                    <ModuloComponent />
                  </div>
                </TabsContent>
              )
            })}
          </div>
        </Tabs>
      </CardContent>
    </Card>
  )
}
