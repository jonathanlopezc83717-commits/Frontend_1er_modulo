import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tag, Plus, Trash2, FileText } from 'lucide-react'
import { useState, useEffect } from 'react'
import {
  fusionarNomenclaturas,
  obtenerSiguienteCodigoSeriado,
  obtenerDiscrepanciasNomenclaturas,
  parsearNomenclaturasDesdeTexto,
  type NomenclaturaEntry,
} from '@/lib/nomenclaturas'

export function ModuloNomenclaturas() {
  const { state, actualizarPunto, setModuloActivo, setNomenclaturasGlobales } = useApp()
  const punto = state.puntoActivo
  const [nomenclaturas, setNomenclaturas] = useState<NomenclaturaEntry[]>([])
  const [nuevoCodigo, setNuevoCodigo] = useState('')
  const [nuevaDefinicion, setNuevaDefinicion] = useState('')

  // Cargar tabla global
  useEffect(() => {
    setNomenclaturas(state.nomenclaturasGlobales)
  }, [state.nomenclaturasGlobales])

  const guardarNomenclaturas = (nuevasNomenclaturas: NomenclaturaEntry[]) => {
    setNomenclaturas(nuevasNomenclaturas)
    setNomenclaturasGlobales(nuevasNomenclaturas)
  }

  const agregarNomenclatura = () => {
    if (!nuevoCodigo.trim() || !nuevaDefinicion.trim()) return
    const codigoBase = nuevoCodigo.trim().toUpperCase().replace(/\d+$/, '')

    if (!/^[A-Z]{3}$/.test(codigoBase)) {
      alert('El codigo debe tener exactamente 3 letras')
      return
    }

    const existe = nomenclaturas.some(n => n.codigo.toUpperCase() === codigoBase)
    if (existe) {
      alert('Este código ya existe')
      return
    }

    const nuevas = [
      ...nomenclaturas,
      {
        id: Date.now().toString(),
        codigo: codigoBase,
        definicion: nuevaDefinicion.trim(),
      },
    ]
    guardarNomenclaturas(nuevas)
    setNuevoCodigo('')
    setNuevaDefinicion('')
  }

  const eliminarNomenclatura = (id: string) => {
    const nuevas = nomenclaturas.filter(n => n.id !== id)
    guardarNomenclaturas(nuevas)
  }

  const agregarADocumentacion = (nom: NomenclaturaEntry) => {
    if (!punto) {
      alert('Selecciona un punto para agregar el elemento a documentacion')
      return
    }

    const notasActuales = punto.moduloData?.documentacion?.notas || ''
    const codigoSeriado = obtenerSiguienteCodigoSeriado(notasActuales, nom.codigo)
    const bloque = `${codigoSeriado}\n${nom.definicion}`
    const notasActualizadas = notasActuales.trim()
      ? `${notasActuales.trim()}\n\n${bloque}`
      : bloque

    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        documentacion: {
          ...punto.moduloData?.documentacion,
          notas: notasActualizadas,
          nombreArchivo: punto.moduloData?.documentacion?.nombreArchivo || 'documento.txt',
          updatedAt: new Date().toISOString(),
        },
      },
    })
    setModuloActivo('documentacion')
  }

  // Parsear nomenclaturas desde el documento
  const parsearNomenclaturas = () => {
    if (!punto?.moduloData?.documentacion?.notas) {
      alert('No hay documento con texto para analizar')
      return
    }

    const notas = punto.moduloData.documentacion.notas
    const detectadas = parsearNomenclaturasDesdeTexto(notas)
    const discrepancias = obtenerDiscrepanciasNomenclaturas(nomenclaturas, detectadas)
    const todas = fusionarNomenclaturas(nomenclaturas, detectadas)
    const nuevasCount = todas.length - nomenclaturas.length

    if (nuevasCount > 0) {
      setNomenclaturas(todas)
      guardarNomenclaturas(todas)
      const extra = discrepancias.length > 0
        ? `\n\nTambien se detectaron ${discrepancias.length} discrepancias con la base existente.`
        : ''
      alert(`Se encontraron ${nuevasCount} nomenclaturas nuevas${extra}`)
    } else if (discrepancias.length > 0) {
      alert(`Se detectaron ${discrepancias.length} discrepancias con la base de nomenclaturas`)
    } else {
      alert('No se encontraron nomenclaturas nuevas en el texto')
    }
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-4 pr-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-3 py-4">
            {punto ? (
              <>
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-primary-foreground">{punto.numeroSerie}</span>
                </div>
                <p className="font-medium">{punto.nombre}</p>
              </>
            ) : (
              <>
                <Tag className="h-5 w-5 text-primary" />
                <p className="font-medium">Tabla global de nomenclaturas</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              <CardTitle>Nomenclaturas Globales</CardTitle>
              <Badge variant="secondary">{nomenclaturas.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Formulario para agregar */}
            <div className="flex gap-2">
              <Input
                value={nuevoCodigo}
                onChange={(e) => setNuevoCodigo(e.target.value.toUpperCase())}
                placeholder="Codigo (ej: EUR)"
                className="w-32"
              />
              <Input
                value={nuevaDefinicion}
                onChange={(e) => setNuevaDefinicion(e.target.value)}
                placeholder="Definición"
                className="flex-1"
              />
              <Button size="sm" onClick={agregarNomenclatura}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={parsearNomenclaturas} className="w-full">
              <FileText className="w-4 h-4 mr-2" />
              Buscar nomenclaturas en documento
            </Button>

            {/* Lista de nomenclaturas */}
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {nomenclaturas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay nomenclaturas registradas
                  </p>
                ) : (
                  nomenclaturas.map((nom) => (
                    <div
                      key={nom.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border"
                    >
                      <Badge variant="default" className="shrink-0">{nom.codigo}</Badge>
                      <span className="text-sm flex-1">{nom.definicion}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0"
                        onClick={() => agregarADocumentacion(nom)}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Doc
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => eliminarNomenclatura(nom.id)}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {nomenclaturas.length > 0 && (
              <>
                <Separator />
                <div className="bg-muted/30 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">Vista previa del registro:</p>
                  <div className="space-y-1">
                    {nomenclaturas.map((nom) => (
                      <div key={nom.id} className="text-sm">
                        <span className="font-mono font-bold text-primary">{nom.codigo}</span>
                        <span className="text-muted-foreground"> — {nom.definicion}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
