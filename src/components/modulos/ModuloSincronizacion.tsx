import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  aplicarSincronizacion,
  compararSincronizacion,
  parsearExcelSincronizacion,
  parsearCSV,
  generarHTMLDesdeCSV,
  descargarHTML,
  type CriterioCoincidencia,
  type FilaSincronizacion,
  type ResultadoSincronizacion,
  type DatosCSV,
} from '@/lib/excel-sync'
import { cargarArchivoSincronizacion, eliminarArchivoSincronizacion, guardarArchivoSincronizacion } from '@/lib/sync-file-store'
import { generarUUID } from '@/lib/utils'
import { ThinkingLoader } from '@/components/ThinkingLoader'
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
  Trash2,
  Download,
  FileCode,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

const ESTADO_LABEL: Record<ResultadoSincronizacion['estado'], { texto: string; variante: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ok: { texto: 'OK', variante: 'default' },
  punto_no_encontrado: { texto: 'Punto no encontrado', variante: 'destructive' },
  nomenclatura_no_encontrada: { texto: 'Nomenclatura no encontrada', variante: 'destructive' },
  coordenadas_invalidas: { texto: 'Coordenadas inválidas', variante: 'secondary' },
  codigo_vacio: { texto: 'Sin código', variante: 'outline' },
}

interface SincronizacionData {
  archivoNombre?: string
  archivoId?: string
  ruta?: string
  cargadoEn?: string
  sincronizadoEn?: string
  resumen?: {
    puntosActualizados: number
    puntosNoEncontrados: number
    nomenclaturasAgregadas: number
  }
}

export function ModuloSincronizacion() {
  const { state, actualizarPunto, setNomenclaturasGlobales } = useApp()
  const punto = state.puntoActivo

  const [filas, setFilas] = useState<FilaSincronizacion[]>([])
  const [resultados, setResultados] = useState<ResultadoSincronizacion[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [archivoId, setArchivoId] = useState<string | null>(null)
  const [criterio, setCriterio] = useState<CriterioCoincidencia>('numeroSerie')
  const [actualizarCoordenadas, setActualizarCoordenadas] = useState(true)
  const [agregarNomenclaturas, setAgregarNomenclaturas] = useState(false)
  const [saltarEncabezado, setSaltarEncabezado] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  // Datos crudos del CSV escaneado (para vista previa HTML)
  const [datosCSV, setDatosCSV] = useState<DatosCSV | null>(null)
  const [mostrarHTML, setMostrarHTML] = useState(false)

  const carpetaInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const ultimoArchivoRef = useRef<File | ArrayBuffer | null>(null)

  const dataGuardada: SincronizacionData | undefined = punto?.moduloData?.sincronizacion as SincronizacionData | undefined

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

  // Re-parseo cuando cambia la opción de encabezado
  useEffect(() => {
    const archivo = ultimoArchivoRef.current
    if (!archivo) return
    const repeticion = async () => {
      setProcesando(true)
      try {
        const buffer = archivo instanceof File ? await archivo.arrayBuffer() : archivo
        // Recuperar texto original para re-escanear el CSV
        const texto = new TextDecoder().decode(buffer)
        const datos = await parsearCSVInterno(texto, saltarEncabezado)
        setDatosCSV(datos)
        const nuevasFilas = await parsearExcelSincronizacion(buffer, { saltarEncabezado })
        setFilas(nuevasFilas)
        setMensaje(`${nuevasFilas.length} filas leídas`)
      } catch (error) {
        setMensaje(`Error leyendo CSV: ${String(error)}`)
      } finally {
        setProcesando(false)
      }
    }
    repeticion()
  }, [saltarEncabezado])

  useEffect(() => {
    if (!punto) {
      setFilas([])
      setResultados([])
      setNombreArchivo('')
      setArchivoId(null)
      setMensaje(null)
      setDatosCSV(null)
      ultimoArchivoRef.current = null
      return
    }

    const sincronizacion = punto.moduloData?.sincronizacion as SincronizacionData | undefined
    if (!sincronizacion?.archivoId) {
      setFilas([])
      setResultados([])
      setNombreArchivo('')
      setArchivoId(null)
      setMensaje(null)
      setDatosCSV(null)
      ultimoArchivoRef.current = null
      return
    }

    const cargar = async () => {
      setProcesando(true)
      setNombreArchivo(sincronizacion.archivoNombre || '')
      setArchivoId(sincronizacion.archivoId || null)
      try {
        const buffer = await cargarArchivoSincronizacion(sincronizacion.archivoId!)
        if (!buffer) {
          setMensaje('No se encontró el archivo guardado. Vuelve a cargarlo.')
          setProcesando(false)
          return
        }
        ultimoArchivoRef.current = buffer
        const texto = new TextDecoder().decode(buffer)
        const datos = await parsearCSVInterno(texto, saltarEncabezado)
        setDatosCSV(datos)
        const nuevasFilas = await parsearExcelSincronizacion(buffer, { saltarEncabezado })
        setFilas(nuevasFilas)
        setMensaje(`${nuevasFilas.length} filas cargadas desde ${sincronizacion.archivoNombre}`)
      } catch (error) {
        setMensaje(`Error cargando archivo guardado: ${String(error)}`)
      } finally {
        setProcesando(false)
      }
    }

    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto?.id])

  // Helper local: parsea el texto crudo del CSV para la vista previa HTML
  const parsearCSVInterno = async (texto: string, _saltar: boolean): Promise<DatosCSV> => {
    // parsearCSV ya trata la primera fila como encabezado
    return parsearCSV(texto)
  }

  const parsearBuffer = async (buffer: ArrayBuffer, nombre: string) => {
    const texto = new TextDecoder().decode(buffer)
    const datos = parsearCSV(texto)
    setDatosCSV(datos)
    const nuevasFilas = await parsearExcelSincronizacion(buffer, { saltarEncabezado })
    setFilas(nuevasFilas)
    setNombreArchivo(nombre)
    setMensaje(`${nuevasFilas.length} filas · ${datos.encabezados.length} columnas leídas desde ${nombre}`)
  }

  const persistirArchivo = async (buffer: ArrayBuffer, nombre: string, ruta: string) => {
    if (!punto) return

    const nuevoArchivoId = archivoId || generarUUID()
    await guardarArchivoSincronizacion(nuevoArchivoId, buffer)
    setArchivoId(nuevoArchivoId)

    const nuevaData: SincronizacionData = {
      archivoNombre: nombre,
      archivoId: nuevoArchivoId,
      ruta,
      cargadoEn: new Date().toISOString(),
    }

    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        sincronizacion: nuevaData,
      },
    })
  }

  const procesarArchivo = async (file: File) => {
    setProcesando(true)
    setMensaje(null)
    try {
      const buffer = await file.arrayBuffer()
      ultimoArchivoRef.current = file
      await parsearBuffer(buffer, file.name)
      await persistirArchivo(buffer, file.name, file.webkitRelativePath || file.name)
    } catch (error) {
      console.error('Error leyendo CSV:', error)
      setMensaje(`Error leyendo CSV: ${String(error)}`)
    } finally {
      setProcesando(false)
    }
  }

  const handleSeleccionarCarpeta = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const csv = buscarCSVEnCarpeta(files)
    if (!csv) {
      setMensaje('No se encontró un archivo CSV (.csv) en la carpeta seleccionada')
      return
    }

    await procesarArchivo(csv)
    e.target.value = ''
  }

  const handleSeleccionarCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await procesarArchivo(file)
    e.target.value = ''
  }

  const handleLimpiarArchivo = async () => {
    if (archivoId) {
      await eliminarArchivoSincronizacion(archivoId)
    }
    if (dataGuardada?.archivoId) {
      await eliminarArchivoSincronizacion(dataGuardada.archivoId)
    }
    ultimoArchivoRef.current = null
    setFilas([])
    setResultados([])
    setNombreArchivo('')
    setArchivoId(null)
    setDatosCSV(null)
    setMensaje('Archivo de sincronización eliminado')

    if (punto) {
      const restoModuloData = { ...punto.moduloData }
      delete restoModuloData.sincronizacion
      actualizarPunto(punto.id, { moduloData: restoModuloData })
    }
  }

  const handleDescargarHTML = () => {
    if (!datosCSV) return
    const titulo = nombreArchivo ? nombreArchivo.replace(/\.csv$/i, '') : 'Datos importados'
    const html = generarHTMLDesdeCSV(datosCSV, titulo)
    const nombreSalida = `${titulo}.html`
    descargarHTML(html, nombreSalida)
  }

  const handleSincronizar = async () => {
    if (resultados.length === 0 || !punto) return

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

    const nuevaData: SincronizacionData = {
      ...dataGuardada,
      sincronizadoEn: new Date().toISOString(),
      resumen,
    }

    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        sincronizacion: nuevaData,
      },
    })

    setMensaje(
      `Sincronización aplicada: ${resumen.puntosActualizados} puntos actualizados, ${resumen.puntosNoEncontrados} no encontrados, ${resumen.nomenclaturasAgregadas} nomenclaturas agregadas.`
    )
  }

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileSpreadsheet className="mb-3 h-12 w-12 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Selecciona un punto para sincronizar con CSV</p>
        </CardContent>
      </Card>
    )
  }

  // HTML generado para descarga (se construye al pulsar el botón)

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
                <CardTitle>Sincronización CSV → HTML</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {nombreArchivo && <Badge variant="outline">{nombreArchivo}</Badge>}
                {datosCSV && (
                  <Badge variant="secondary" className="gap-1">
                    <FileCode className="h-3 w-3" />
                    {datosCSV.encabezados.length} cols · {datosCSV.totalFilas} filas
                  </Badge>
                )}
                {dataGuardada?.sincronizadoEn && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Sincronizado
                  </Badge>
                )}
                <input
                  ref={carpetaInputRef}
                  type="file"
                  {...{ webkitdirectory: 'true', directory: 'true' }}
                  className="hidden"
                  onChange={handleSeleccionarCarpeta}
                />
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleSeleccionarCSV}
                />
                <Button variant="outline" size="sm" onClick={() => carpetaInputRef.current?.click()} disabled={procesando}>
                  <FolderInput className="mr-2 h-4 w-4" />
                  Seleccionar carpeta
                </Button>
                <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()} disabled={procesando}>
                  <Upload className="mr-2 h-4 w-4" />
                  Cargar CSV
                </Button>
                {datosCSV && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setMostrarHTML(!mostrarHTML)}>
                      <FileCode className="mr-2 h-4 w-4" />
                      {mostrarHTML ? 'Ocultar HTML' : 'Ver HTML'}
                    </Button>
                    <Button variant="default" size="sm" onClick={handleDescargarHTML}>
                      <Download className="mr-2 h-4 w-4" />
                      Descargar HTML
                    </Button>
                  </>
                )}
                {(nombreArchivo || dataGuardada?.archivoId) && (
                  <Button variant="ghost" size="icon" onClick={handleLimpiarArchivo} disabled={procesando} title="Eliminar archivo">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
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

            {procesando && (
              <ThinkingLoader
                variant="compact"
                message="Procesando CSV"
                rotatingMessages={['Leyendo archivo CSV', 'Detectando columnas', 'Generando tabla HTML']}
              />
            )}

            {dataGuardada?.ruta && (
              <div className="rounded-lg border p-3 text-sm bg-muted/50">
                <p className="font-medium">Archivo vinculado desde la carpeta</p>
                <p className="text-muted-foreground">{dataGuardada.ruta}</p>
                {dataGuardada.cargadoEn && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Cargado el {new Date(dataGuardada.cargadoEn).toLocaleString('es-CL')}
                  </p>
                )}
              </div>
            )}

            {mensaje && (
              <div className={`rounded-lg border p-3 text-sm ${mensaje.startsWith('Error') ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-muted/50'}`}>
                {mensaje}
              </div>
            )}

            {/* Vista previa de la tabla HTML con las mismas columnas del CSV */}
            {mostrarHTML && datosCSV && datosCSV.totalFilas > 0 && (
              <div className="rounded-lg border overflow-auto max-h-[400px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      {datosCSV.encabezados.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          {h || `Columna ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datosCSV.filas.map((fila, fi) => (
                      <tr key={fi} className="border-t">
                        {fila.map((c, ci) => (
                          <td key={ci} className="px-3 py-2 whitespace-nowrap">{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
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

                <div className="rounded-lg border overflow-auto max-h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 sticky top-0">
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
                Selecciona una carpeta o un archivo CSV (.csv) para comenzar
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}

// =====================================================
// HELPERS LOCALES
// =====================================================

/**
 * Busca un archivo CSV dentro de un FileList obtenido de <input webkitdirectory>.
 */
function buscarCSVEnCarpeta(files: FileList): File | null {
  for (let index = 0; index < files.length; index++) {
    const file = files[index]
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'csv') {
      return file
    }
  }
  return null
}
