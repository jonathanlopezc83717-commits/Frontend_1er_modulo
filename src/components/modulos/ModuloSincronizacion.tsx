import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  aplicarSincronizacion,
  buscarExcelEnCarpeta,
  compararSincronizacion,
  parsearExcelSincronizacion,
  type CriterioCoincidencia,
  type FilaSincronizacion,
  type ResultadoSincronizacion,
} from '@/lib/excel-sync'
import {
  CheckCircle2,
  FileSpreadsheet,
  FolderInput,
  RefreshCw,
  Save,
  Upload,
  AlertCircle,
  AlertTriangle,
  MapPin,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

const ESTADO_LABEL: Record<ResultadoSincronizacion['estado'], { texto: string; variante: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ok: { texto: 'OK', variante: 'default' },
  punto_no_encontrado: { texto: 'Punto no encontrado', variante: 'destructive' },
  nomenclatura_no_encontrada: { texto: 'Nomenclatura no encontrada', variante: 'destructive' },
  coordenadas_invalidas: { texto: 'Coordenadas inválidas', variante: 'secondary' },
  codigo_vacio: { texto: 'Sin código', variante: 'outline' },
}

export function ModuloSincronizacion() {
  const { state, actualizarPunto, setNomenclaturasGlobales } = useApp()
  const punto = state.puntoActivo

  const [filas, setFilas] = useState<FilaSincronizacion[]>([])
  const [resultados, setResultados] = useState<ResultadoSincronizacion[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [criterio, setCriterio] = useState<CriterioCoincidencia>('numeroSerie')
  const [actualizarCoordenadas, setActualizarCoordenadas] = useState(true)
  const [agregarNomenclaturas, setAgregarNomenclaturas] = useState(false)
  const [saltarEncabezado, setSaltarEncabezado] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const carpetaInputRef = useRef<HTMLInputElement>(null)
  const excelInputRef = useRef<HTMLInputElement>(null)
  const ultimoArchivoRef = useRef<File | null>(null)

  const conteoEstados = useMemo(() => {
    const conteo: Record<ResultadoSincronizacion['estado'], number> = {
      ok: 0,
      punto_no_encontrado: 0,
      nomenclatura_no_encontrada: 0,
      coordenadas_invalidas: 0,
      codigo_vacio: 0,
    }
    for (const item of resultados) {
      conteo[item.estado]++
    }
    return conteo
  }, [resultados])

  useEffect(() => {
    if (filas.length === 0) {
      setResultados([])
      return
    }
    setResultados(compararSincronizacion(filas, state.puntos, state.nomenclaturasGlobales, criterio))
  }, [filas, state.puntos, state.nomenclaturasGlobales, criterio])

  useEffect(() => {
    const file = ultimoArchivoRef.current
    if (!file) return
    const repeticion = async () => {
      setProcesando(true)
      try {
        const buffer = await file.arrayBuffer()
        const nuevasFilas = await parsearExcelSincronizacion(buffer, { saltarEncabezado })
        setFilas(nuevasFilas)
        setMensaje(`${nuevasFilas.length} filas leídas desde ${file.name}`)
      } catch (error) {
        setMensaje(`Error leyendo Excel: ${String(error)}`)
      } finally {
        setProcesando(false)
      }
    }
    repeticion()
  }, [saltarEncabezado])

  const procesarArchivo = async (file: File) => {
    setProcesando(true)
    setMensaje(null)
    try {
      ultimoArchivoRef.current = file
      const buffer = await file.arrayBuffer()
      const nuevasFilas = await parsearExcelSincronizacion(buffer, { saltarEncabezado })
      setFilas(nuevasFilas)
      setNombreArchivo(file.name)
      setMensaje(`${nuevasFilas.length} filas leídas desde ${file.name}`)
    } catch (error) {
      console.error('Error leyendo Excel:', error)
      setMensaje(`Error leyendo Excel: ${String(error)}`)
    } finally {
      setProcesando(false)
    }
  }

  const handleSeleccionarCarpeta = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const excel = buscarExcelEnCarpeta(files)
    if (!excel) {
      setMensaje('No se encontró un archivo Excel (.xlsx o .xls) en la carpeta seleccionada')
      return
    }

    await procesarArchivo(excel)
    e.target.value = ''
  }

  const handleSeleccionarExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await procesarArchivo(file)
    e.target.value = ''
  }

  const handleSincronizar = () => {
    if (resultados.length === 0) return

    const { resumen, puntosModificados, nomenclaturasActualizadas } = aplicarSincronizacion(
      resultados,
      state.puntos,
      state.nomenclaturasGlobales,
      {
        actualizarCoordenadas,
        agregarNomenclaturasFaltantes: agregarNomenclaturas,
      }
    )

    for (const puntoModificado of puntosModificados) {
      actualizarPunto(puntoModificado.id, puntoModificado)
    }

    if (agregarNomenclaturas) {
      setNomenclaturasGlobales(nomenclaturasActualizadas)
    }

    setMensaje(
      `Sincronización aplicada: ${resumen.puntosActualizados} puntos actualizados, ${resumen.puntosNoEncontrados} no encontrados, ${resumen.nomenclaturasAgregadas} nomenclaturas agregadas.`
    )
  }

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileSpreadsheet className="mb-3 h-12 w-12 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Selecciona un punto para sincronizar con Excel</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <ScrollArea className="h-[calc(100vh-220px)]">
      <div className="space-y-4 pr-2">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <span className="text-sm font-bold text-primary-foreground">{punto.numeroSerie}</span>
              </div>
              <p className="font-medium">{punto.nombre}</p>
            </div>
            <Badge variant="secondary">{state.nomenclaturasGlobales.length} nomenclaturas</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-primary" />
                <CardTitle>Sincronización Excel</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {nombreArchivo && <Badge variant="outline">{nombreArchivo}</Badge>}
                <input
                  ref={carpetaInputRef}
                  type="file"
                  {...{ webkitdirectory: 'true', directory: 'true' }}
                  className="hidden"
                  onChange={handleSeleccionarCarpeta}
                />
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleSeleccionarExcel}
                />
                <Button variant="outline" size="sm" onClick={() => carpetaInputRef.current?.click()} disabled={procesando}>
                  <FolderInput className="mr-2 h-4 w-4" />
                  Seleccionar carpeta
                </Button>
                <Button variant="outline" size="sm" onClick={() => excelInputRef.current?.click()} disabled={procesando}>
                  <Upload className="mr-2 h-4 w-4" />
                  Cargar Excel
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Criterio de coincidencia</label>
                <Select value={criterio} onValueChange={(v) => setCriterio(v as CriterioCoincidencia)}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Criterio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="numeroSerie">Número de punto</SelectItem>
                    <SelectItem value="nombre">Nombre de punto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="actualizar-coordenadas"
                  checked={actualizarCoordenadas}
                  onCheckedChange={(checked) => setActualizarCoordenadas(checked === true)}
                />
                <label htmlFor="actualizar-coordenadas" className="text-sm cursor-pointer">
                  Actualizar coordenadas X, Y, Z
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="agregar-nomenclaturas"
                  checked={agregarNomenclaturas}
                  onCheckedChange={(checked) => setAgregarNomenclaturas(checked === true)}
                />
                <label htmlFor="agregar-nomenclaturas" className="text-sm cursor-pointer">
                  Agregar nomenclaturas faltantes
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="saltar-encabezado"
                  checked={saltarEncabezado}
                  onCheckedChange={(checked) => setSaltarEncabezado(checked === true)}
                />
                <label htmlFor="saltar-encabezado" className="text-sm cursor-pointer">
                  Primera fila es encabezado
                </label>
              </div>

              <div className="flex items-center justify-end">
                <Button size="sm" onClick={handleSincronizar} disabled={resultados.length === 0}>
                  <Save className="mr-2 h-4 w-4" />
                  Aplicar sincronización
                </Button>
              </div>
            </div>

            {mensaje && (
              <div className={`rounded-lg border p-3 text-sm ${mensaje.startsWith('Error') ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-muted/50'}`}>
                {mensaje}
              </div>
            )}

            {resultados.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {conteoEstados.ok > 0 && (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {conteoEstados.ok} OK
                    </Badge>
                  )}
                  {conteoEstados.nomenclatura_no_encontrada > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="h-3 w-3" /> {conteoEstados.nomenclatura_no_encontrada} sin nomenclatura
                    </Badge>
                  )}
                  {conteoEstados.punto_no_encontrado > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <MapPin className="h-3 w-3" /> {conteoEstados.punto_no_encontrado} punto no encontrado
                    </Badge>
                  )}
                  {conteoEstados.coordenadas_invalidas > 0 && (
                    <Badge variant="secondary" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> {conteoEstados.coordenadas_invalidas} coordenadas inválidas
                    </Badge>
                  )}
                  {conteoEstados.codigo_vacio > 0 && (
                    <Badge variant="outline" className="gap-1">
                      {conteoEstados.codigo_vacio} sin código
                    </Badge>
                  )}
                </div>

                <div className="rounded-lg border overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium w-24">No. Punto</th>
                        <th className="px-3 py-2 text-left font-medium">X</th>
                        <th className="px-3 py-2 text-left font-medium">Y</th>
                        <th className="px-3 py-2 text-left font-medium">Z</th>
                        <th className="px-3 py-2 text-left font-medium">Código</th>
                        <th className="px-3 py-2 text-left font-medium">Punto</th>
                        <th className="px-3 py-2 text-left font-medium">Nomenclatura</th>
                        <th className="px-3 py-2 text-left font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultados.map((item) => {
                        const estado = ESTADO_LABEL[item.estado]
                        return (
                          <tr key={item.filaIndex} className="border-t">
                            <td className="px-3 py-2 font-medium">{item.fila.numeroPunto}</td>
                            <td className="px-3 py-2">{item.fila.x.toFixed(6)}</td>
                            <td className="px-3 py-2">{item.fila.y.toFixed(6)}</td>
                            <td className="px-3 py-2">{item.fila.z.toFixed(6)}</td>
                            <td className="px-3 py-2">{item.fila.codigo || '—'}</td>
                            <td className="px-3 py-2">{item.puntoNombre || '—'}</td>
                            <td className="px-3 py-2">{item.nomenclatura?.definicion || '—'}</td>
                            <td className="px-3 py-2">
                              <Badge variant={estado.variante}>{estado.texto}</Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {filas.length === 0 && !procesando && (
              <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 text-sm text-muted-foreground">
                <FileSpreadsheet className="mb-2 h-8 w-8 opacity-40" />
                Selecciona una carpeta o un archivo Excel para comenzar
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}
