import { useApp } from '@/context/AppContext'
import { MODULOS, type ModuloConfig } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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

function ordenarModulos(modulos: ModuloConfig[], orden: string[] | null): ModuloConfig[] {
  if (!orden || orden.length === 0) return modulos
  const ordenMap = new Map(orden.map((id, index) => [id, index]))
  return [...modulos].sort((a, b) => {
    const ia = ordenMap.get(a.id)
    const ib = ordenMap.get(b.id)
    if (ia !== undefined && ib !== undefined) return ia - ib
    if (ia !== undefined) return -1
    if (ib !== undefined) return 1
    return 0
  })
}

interface SortableTabProps {
  modulo: ModuloConfig
  isActive: boolean
  tieneDatos: boolean
}

function TabContent({ modulo, isActive, tieneDatos }: SortableTabProps) {
  const Icon = iconMap[modulo.icono]
  return (
    <>
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
    </>
  )
}

function SortableTab({ modulo, isActive, tieneDatos }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: modulo.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  return (
    <TabsTrigger
      ref={setNodeRef}
      value={modulo.id}
      style={style}
      {...attributes}
      {...listeners}
      className="relative data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 px-2 py-1.5 text-xs pointer-events-auto select-none"
    >
      <TabContent modulo={modulo} isActive={isActive} tieneDatos={tieneDatos} />
    </TabsTrigger>
  )
}

export function ModuleTabs({ mostrarNomenclaturas = false }: ModuleTabsProps) {
  const { state, setModuloActivo, reordenarModulos } = useApp()
  const { moduloActivo, puntoActivo, modulosOrden } = state
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const modulosVisibles = useMemo(
    () => MODULOS.filter(modulo => modulo.id !== 'nomenclaturas' || mostrarNomenclaturas),
    [mostrarNomenclaturas]
  )

  const modulosOrdenados = useMemo(
    () => ordenarModulos(modulosVisibles, modulosOrden),
    [modulosVisibles, modulosOrden]
  )

  const handleTabChange = (value: string) => {
    setModuloActivo(value)
  }

  useEffect(() => {
    if (!modulosVisibles.some(modulo => modulo.id === moduloActivo)) {
      setModuloActivo(modulosVisibles[0]?.id || 'analisis')
    }
  }, [moduloActivo, modulosVisibles, setModuloActivo])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedId(null)
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = modulosOrdenados.findIndex(modulo => modulo.id === active.id)
      const newIndex = modulosOrdenados.findIndex(modulo => modulo.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        const nuevoOrden = arrayMove(modulosOrdenados, oldIndex, newIndex)
        reordenarModulos(nuevoOrden.map(modulo => modulo.id))
      }
    }
  }

  const moduloArrastrado = draggedId
    ? modulosOrdenados.find(modulo => modulo.id === draggedId)
    : undefined

  return (
    <Card className="h-full flex flex-col relative" style={{ isolation: 'isolate' }}>
      <CardContent className="p-0 flex flex-col h-full">
        <Tabs value={moduloActivo} onValueChange={handleTabChange} className="w-full flex flex-col h-full">
          {/* TabsList con z-index alto para asegurar clickeabilidad */}
          <div className="border-b px-2 pt-2 shrink-0 relative" style={{ zIndex: 30 }}>
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={modulosOrdenados.map(modulo => modulo.id)}
                strategy={horizontalListSortingStrategy}
              >
                <TabsList className="w-full justify-start h-auto flex-wrap gap-0.5 bg-transparent p-0 relative">
                  {modulosOrdenados.map((modulo) => {
                    const isActive = moduloActivo === modulo.id
                    const tieneDatos = puntoActivo?.moduloData?.[modulo.id] !== undefined

                    return (
                      <SortableTab
                        key={modulo.id}
                        modulo={modulo}
                        isActive={isActive}
                        tieneDatos={tieneDatos}
                      />
                    )
                  })}
                </TabsList>
              </SortableContext>
              <DragOverlay>
                {moduloArrastrado ? (
                  <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground bg-primary text-primary-foreground shadow gap-1 pointer-events-none select-none">
                    <TabContent
                      modulo={moduloArrastrado}
                      isActive={moduloActivo === moduloArrastrado.id}
                      tieneDatos={puntoActivo?.moduloData?.[moduloArrastrado.id] !== undefined}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
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
