import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { PlantillaFormato } from '@/types'
import { Download, FileSpreadsheet, ImagePlus, Loader2, MapPin, RefreshCw, Save, Trash2, Upload, X, ChevronDown } from 'lucide-react'
import { generarCroquisDesdeDwg, DwgError } from '@/lib/dwg-croquis'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type FichaFormato,
  type MapeoPlantilla,
  crearFichaVacia,
  normalizarTexto,
  normalizarFicha,
  asignarCampo,
  detectarMapeo,
  obtenerValoresFicha,
  obtenerImagenesFicha,
  obtenerCamposPlantilla,
  obtenerImagenesPlantilla,
  arrayBufferABase64,
  base64AArrayBuffer,
  descargarArchivo,
  leerImagen,
  convertirImagenADataUrl,
  extraerImagenesExcel,
  extraerNombreCarpeta,
  extraerFechaDeCarpeta,
  extraerOperadorDeCarpeta,
  extraerDescripcionAnalisis,
  extraerEvidenciasAnalisis,
} from './ficha-helpers'

const MAX_PLANTILLAS_FICHA = 8

// Campos de la ficha con autocompletado: lo escrito se guarda en localStorage
// para volver a elegirlo despues (globales por etiqueta, reutilizables entre puntos).
const CAMPOS_CON_OPCIONES = new Set([
  'Tipo de instalacion',
  'Ubicacion respecto al eje de proyecto',
  'Estado fisico',
])

// Opciones iniciales por campo (edita esta lista segun el vocabulario del proyecto).
// Se combinan con las que el usuario agrega posteriormente.
const OPCIONES_POR_DEFECTO: Record<string, string[]> = {
  'Tipo de instalacion': ['Aéreo', 'Terrestre'],
  'Ubicacion respecto al eje de proyecto': ['Izquierda', 'Derecha', 'Centro'],
  'Estado fisico': ['Bueno', 'Regular', 'Malo'],
}

// Combobox de texto libre: tipea cualquier valor Y elegi cualquiera de las opciones
// guardadas sin importar si lo tipeado coincide o no (el listado no filtra).
function CampoCombo({
  value,
  onChange,
  onCommit,
  opciones,
}: {
  value: string
  onChange: (valor: string) => void
  onCommit: (valor: string) => void
  opciones: string[]
}) {
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const handler = (evento: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [abierto])

  const elegir = (opcion: string) => {
    onChange(opcion)
    onCommit(opcion)
    setAbierto(false)
  }

  return (
    <div ref={contenedorRef} className="relative">
      <Input
        value={value}
        onChange={(evento) => onChange(evento.target.value)}
        onFocus={() => setAbierto(true)}
        onBlur={() => onCommit(value)}
        className="px-0 py-0 pr-7"
      />
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(evento) => { evento.preventDefault(); setAbierto(a => !a) }}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-label="Ver opciones guardadas"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {abierto && opciones.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {opciones.map(opcion => (
            <button
              key={opcion}
              type="button"
              onMouseDown={(evento) => { evento.preventDefault(); elegir(opcion) }}
              className={`flex w-full items-center px-2 py-1.5 text-left text-sm hover:bg-accent ${opcion === value ? 'bg-accent/60' : ''}`}
            >
              {opcion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ModuloFicha() {
  const { state, actualizarPunto, setPlantillasFicha } = useApp()
  const punto = state.puntoActivo
  const [ficha, setFicha] = useState<FichaFormato>(crearFichaVacia)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [archivoPlantillaBase64, setArchivoPlantillaBase64] = useState('')
  const [mapeoPlantilla, setMapeoPlantilla] = useState<MapeoPlantilla>({ campos: {}, imagenes: {} })
  const [exportandoId, setExportandoId] = useState<string | null>(null)
  const [cargandoCroquisDwg, setCargandoCroquisDwg] = useState(false)
  const excelInputRef = useRef<HTMLInputElement>(null)

  // Opciones guardadas para los campos con autocompletado.
  const [opcionesGuardadas, setOpcionesGuardadas] = useState<Record<string, string[]>>({})

  useEffect(() => {
    const cargadas: Record<string, string[]> = {}
    for (const etiqueta of CAMPOS_CON_OPCIONES) {
      const porDefecto = OPCIONES_POR_DEFECTO[etiqueta] || []
      let guardadas: string[] = []
      try {
        const raw = localStorage.getItem(`ficha-opciones:${etiqueta}`)
        guardadas = raw ? (JSON.parse(raw) as string[]) : []
      } catch {
        guardadas = []
      }
      // Defaults primero, luego las del usuario; dedup sin distinguir mayusculas.
      const vistos = new Set<string>()
      cargadas[etiqueta] = [...porDefecto, ...guardadas].filter(op => {
        const clave = op.toLowerCase()
        if (vistos.has(clave)) return false
        vistos.add(clave)
        return true
      })
    }
    setOpcionesGuardadas(cargadas)
  }, [])

  // Al salir del campo, si hay texto, lo agrega al historial de opciones (dedup sin distincion de mayusculas).
  const registrarOpcion = (etiqueta: string, valor: string) => {
    const valorLimpio = valor.trim()
    if (!valorLimpio) return
    setOpcionesGuardadas(prev => {
      const actuales = prev[etiqueta] || []
      if (actuales.some(op => op.toLowerCase() === valorLimpio.toLowerCase())) return prev
      const nuevas = [...actuales, valorLimpio]
      try {
        localStorage.setItem(`ficha-opciones:${etiqueta}`, JSON.stringify(nuevas))
      } catch {
        // ponytail: cuota de localStorage agotada, se ignora
      }
      return { ...prev, [etiqueta]: nuevas }
    })
  }

  const camposLlenos = useMemo(
    () => ficha.datos.filter(campo => campo.valor.trim()).length,
    [ficha.datos]
  )

  const completarDesdeModulos = (baseFicha: FichaFormato, sobrescribir = false): FichaFormato => {
    if (!punto) return baseFicha

    const nombreCarpeta = extraerNombreCarpeta(punto.carpetaPath || punto.nombre)
    const fecha = extraerFechaDeCarpeta(nombreCarpeta)
    const operador = extraerOperadorDeCarpeta(nombreCarpeta)
    const geoData = punto.moduloData?.georeferencia || punto.moduloData?.georeferenciacion
    const coordenadas = geoData?.coordenadas
    const observaciones = extraerDescripcionAnalisis(punto.moduloData?.analisis)
    const evidencias = extraerEvidenciasAnalisis(punto.moduloData?.analisis)
    // ponytail: indices por coordenada Excel del modulo Materiales (layout estable, ver COORD_A_CAMPO).
    const mat = (punto.moduloData?.materiales as { valores?: Record<string, string> } | undefined)?.valores
    const tipoInstalacion = mat?.['3-D'] || ''
    const ubicacionEje = mat?.['3-F'] || ''
    const estadoFisico = mat?.['5-F'] || ''

    const datos = baseFicha.datos.map(campo => {
      if (!sobrescribir && campo.valor.trim()) return campo

      switch (campo.etiqueta) {
        case 'Fecha':
          return { ...campo, valor: fecha }
        case 'Tipo de instalacion':
          return { ...campo, valor: tipoInstalacion }
        case 'Ubicacion respecto al eje de proyecto':
          return { ...campo, valor: ubicacionEje }
        case 'Estado fisico':
          return { ...campo, valor: estadoFisico }
        case 'Coordenada "X"':
          return { ...campo, valor: coordenadas?.x !== undefined ? String(coordenadas.x) : '' }
        case 'Coordenada "Y"':
          return { ...campo, valor: coordenadas?.y !== undefined ? String(coordenadas.y) : '' }
        case 'Coordenada "Z"':
          return { ...campo, valor: coordenadas?.z !== undefined ? String(coordenadas.z) : '' }
        case 'Operador':
          return { ...campo, valor: operador }
        default:
          return campo
      }
    })

    return {
      ...baseFicha,
      datos,
      observaciones: !sobrescribir && baseFicha.observaciones.trim() ? baseFicha.observaciones : observaciones,
      evidencias: baseFicha.evidencias.map((image, index) =>
        !sobrescribir && image ? image : evidencias[index] || image || ''
      ),
    }
  }

  useEffect(() => {
    const data = punto?.moduloData?.ficha as {
      ficha?: FichaFormato
      nombreArchivo?: string
    } | undefined

    setFicha(completarDesdeModulos(normalizarFicha(data?.ficha)))
    setNombreArchivo(data?.nombreArchivo || '')
    // ponytail: depender de punto?.id, no del objeto punto entero.
    // El reducer ACTUALIZAR_PUNTO crea una nueva ref de puntoActivo en cada update,
    // lo que re-disparaba este reset y pisaba los edits locales sin guardar.
  }, [punto?.id])

  const actualizarFicha = (data: Partial<FichaFormato>) => {
    setFicha(prev => ({ ...prev, ...data }))
  }

  const actualizarDato = (index: number, valor: string) => {
    setFicha(prev => ({
      ...prev,
      datos: prev.datos.map((campo, itemIndex) =>
        itemIndex === index ? { ...campo, valor } : campo
      ),
    }))
  }

  const actualizarDesdeModulos = () => {
    setFicha(prev => completarDesdeModulos(prev, true))
  }

  const cargarExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const buffer = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'array' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' })
    const nuevaFicha = crearFichaVacia()
    const sheetName = workbook.SheetNames[0]

    nuevaFicha.titulo = normalizarTexto(rows[0]?.[0]) || nuevaFicha.titulo
    nuevaFicha.proyecto = normalizarTexto(rows[1]?.[0])
    nuevaFicha.clave = normalizarTexto(rows[1]?.[5] || rows[1]?.[4]).replace(/^Clave:\s*/i, '')

    for (let rowIndex = 2; rowIndex <= 7; rowIndex++) {
      const row = rows[rowIndex] || []
      asignarCampo(nuevaFicha.datos, normalizarTexto(row[0]), row[1])
      asignarCampo(nuevaFicha.datos, normalizarTexto(row[2]), row[3])
      asignarCampo(nuevaFicha.datos, normalizarTexto(row[4]), row[5])
    }

    nuevaFicha.descripcionIzquierda = normalizarTexto(rows[8]?.[0]).replace(/^Estado actual.*?\n/i, '').trim()
    nuevaFicha.descripcionDerecha = normalizarTexto(rows[8]?.[3])
    nuevaFicha.observaciones = normalizarTexto(rows[9]?.[3]).replace(/^Observaciones:\s*/i, '').trim()

    try {
      const imagenes = await extraerImagenesExcel(file)
      nuevaFicha.croquis = imagenes['0:9'] || imagenes['0:10'] || ''
      nuevaFicha.evidencias = [
        imagenes['0:10'] || '',
        imagenes['0:11'] || '',
        imagenes['3:10'] || '',
        imagenes['3:11'] || '',
      ]
    } catch (error) {
      console.warn('No se pudieron extraer imagenes del Excel:', error)
    }

    setFicha(nuevaFicha)
    setNombreArchivo(file.name)
    setArchivoPlantillaBase64(arrayBufferABase64(buffer))
    setMapeoPlantilla(detectarMapeo(rows, sheetName))
    event.target.value = ''
  }

  const guardarComoPlantilla = () => {
    if (!archivoPlantillaBase64 || !nombreArchivo) {
      alert('Carga primero un archivo Excel para guardarlo como plantilla')
      return
    }

    const nombreSugerido = nombreArchivo.replace(/\.(xlsx|xls)$/i, '')
    const nombre = window.prompt('Nombre de la plantilla', nombreSugerido)?.trim()
    if (!nombre) return

    const plantilla: PlantillaFormato = {
      id: crypto.randomUUID(),
      nombre,
      archivoNombre: nombreArchivo,
      archivoBase64: archivoPlantillaBase64,
      createdAt: new Date().toISOString(),
      campos: mapeoPlantilla.campos,
      imagenes: mapeoPlantilla.imagenes,
    }

    const plantillas = [
      plantilla,
      ...state.plantillasFicha.filter(item => item.nombre.toLowerCase() !== nombre.toLowerCase()),
    ].slice(0, MAX_PLANTILLAS_FICHA)

    setPlantillasFicha(plantillas)
    alert('Plantilla guardada')
  }

  const eliminarPlantilla = (id: string) => {
    setPlantillasFicha(state.plantillasFicha.filter(plantilla => plantilla.id !== id))
  }

  const exportarPlantilla = async (plantilla: PlantillaFormato) => {
    if (!plantilla.archivoBase64) {
      alert('Esta plantilla no tiene el archivo Excel disponible. Vuelve a cargarla y guardarla como plantilla.')
      return
    }

    setExportandoId(plantilla.id)
    try {
      const ExcelJSModule = await import('exceljs')
      const ExcelJS = ((ExcelJSModule as unknown as { default?: unknown }).default || ExcelJSModule) as typeof ExcelJSModule
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(base64AArrayBuffer(plantilla.archivoBase64))
      const valores = obtenerValoresFicha(ficha)
      const imagenes = obtenerImagenesFicha(ficha)
      const camposPlantilla = obtenerCamposPlantilla(plantilla)
      const imagenesPlantilla = obtenerImagenesPlantilla(plantilla)

      for (const [key, destino] of Object.entries(camposPlantilla)) {
        const worksheet = workbook.getWorksheet(destino.sheet)
        if (!worksheet) continue
        const valor = valores[key] ?? ''
        worksheet.getCell(destino.cell).value = valor
      }

      for (const [key, destino] of Object.entries(imagenesPlantilla)) {
        const image = await convertirImagenADataUrl(imagenes[key])
        const worksheet = workbook.getWorksheet(destino.sheet)
        if (!image || !worksheet) continue

        const extension = image.startsWith('data:image/png') ? 'png' : 'jpeg'
        const imageId = workbook.addImage({ base64: image, extension })
        worksheet.getCell(destino.cell).value = null
        worksheet.addImage(imageId, destino.range)
      }

      const buffer = await workbook.xlsx.writeBuffer()
      const nombreSeguro = `${plantilla.nombre || 'ficha'}-${punto?.nombre || 'punto'}`.replace(/[\\/:*?"<>|]+/g, '-')
      descargarArchivo(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${nombreSeguro}.xlsx`
      )
    } catch (error) {
      console.error('Error exportando plantilla:', error)
      alert(`No se pudo exportar la plantilla: ${String(error)}`)
    } finally {
      setExportandoId(null)
    }
  }

  const cargarCroquisDwg = async (file?: File) => {
    if (!file) return
    const x = Number(ficha.datos.find(c => c.etiqueta === 'Coordenada "X"')?.valor)
    const y = Number(ficha.datos.find(c => c.etiqueta === 'Coordenada "Y"')?.valor)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      alert('Faltan coordenadas X/Y validas en la ficha para centrar la captura')
      return
    }
    setCargandoCroquisDwg(true)
    try {
      const imagen = await generarCroquisDesdeDwg(file, { x, y })
      actualizarFicha({ croquis: imagen })
    } catch (error) {
      const msg = error instanceof DwgError ? error.message : String(error)
      alert(`No se pudo generar el croquis desde el DWG: ${msg}`)
    } finally {
      setCargandoCroquisDwg(false)
    }
  }

  const cargarImagen = async (tipo: 'croquis' | 'evidencia', file?: File, index = 0) => {
    if (!file) return
    const preview = await leerImagen(file)

    if (tipo === 'croquis') {
      actualizarFicha({ croquis: preview })
      return
    }

    setFicha(prev => ({
      ...prev,
      evidencias: prev.evidencias.map((item, itemIndex) => (itemIndex === index ? preview : item)),
    }))
  }

  const limpiarImagen = (tipo: 'croquis' | 'evidencia', index = 0) => {
    if (tipo === 'croquis') {
      actualizarFicha({ croquis: '' })
      return
    }

    setFicha(prev => ({
      ...prev,
      evidencias: prev.evidencias.map((item, itemIndex) => (itemIndex === index ? '' : item)),
    }))
  }

  const handleGuardar = () => {
    if (!punto) return

    actualizarPunto(punto.id, {
      moduloData: {
        ...punto.moduloData,
        ficha: {
          ficha,
          nombreArchivo,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    alert('Ficha guardada')
  }

  if (!punto) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileSpreadsheet className="mb-3 h-12 w-12 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Selecciona un punto para editar la ficha</p>
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
            <Badge variant="secondary">{camposLlenos} campos</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <CardTitle>Ficha</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {nombreArchivo && <Badge variant="outline">{nombreArchivo}</Badge>}
                <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={cargarExcel} />
                <Button variant="outline" size="sm" onClick={() => excelInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />
                  Cargar Excel
                </Button>
                <Button variant="outline" size="sm" onClick={actualizarDesdeModulos}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Actualizar desde módulos
                </Button>
                <Button variant="outline" size="sm" onClick={guardarComoPlantilla} disabled={!archivoPlantillaBase64}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Guardar plantilla
                </Button>
                <Button size="sm" onClick={handleGuardar}>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border">
              <div className="border-b bg-muted/60 p-3">
                <Input value={ficha.titulo} onChange={(event) => actualizarFicha({ titulo: event.target.value })} className="px-0 py-0 text-center font-semibold" />
              </div>
              <div className="grid gap-2 p-3 md:grid-cols-[1fr_220px]">
                <Input value={ficha.proyecto} onChange={(event) => actualizarFicha({ proyecto: event.target.value })} placeholder="Proyecto" className="px-0 py-0" />
                <Input value={ficha.clave} onChange={(event) => actualizarFicha({ clave: event.target.value })} placeholder="Clave" className="px-0 py-0" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {ficha.datos.map((campo, index) => {
                const esCombo = CAMPOS_CON_OPCIONES.has(campo.etiqueta)
                return (
                  <div key={campo.etiqueta} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{campo.etiqueta}</label>
                    {esCombo ? (
                      <CampoCombo
                        value={campo.valor}
                        onChange={(valor) => actualizarDato(index, valor)}
                        onCommit={(valor) => registrarOpcion(campo.etiqueta, valor)}
                        opciones={opcionesGuardadas[campo.etiqueta] || []}
                      />
                    ) : (
                      <Input value={campo.valor} onChange={(event) => actualizarDato(index, event.target.value)} className="px-0 py-0" />
                    )}
                  </div>
                )
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Estado actual - Lado izquierdo</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={ficha.descripcionIzquierda} onChange={(event) => actualizarFicha({ descripcionIzquierda: event.target.value })} rows={8} className="px-0 py-0" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Estado actual - Lado derecho</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={ficha.descripcionDerecha} onChange={(event) => actualizarFicha({ descripcionDerecha: event.target.value })} rows={8} className="px-0 py-0" />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ImageSlot
                title="Croquis de localizacion"
                image={ficha.croquis}
                onImage={(file) => cargarImagen('croquis', file)}
                onClear={() => limpiarImagen('croquis')}
                onDwgCargar={cargarCroquisDwg}
                cargandoDwg={cargandoCroquisDwg}
              />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Observaciones</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea value={ficha.observaciones} onChange={(event) => actualizarFicha({ observaciones: event.target.value })} rows={10} className="px-0 py-0" />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evidencia fotografica</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {ficha.evidencias.map((image, index) => (
                    <ImageSlot
                      key={index}
                      title={`Evidencia ${index + 1}`}
                      image={image}
                      onImage={(file) => cargarImagen('evidencia', file, index)}
                      onClear={() => limpiarImagen('evidencia', index)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Plantillas guardadas</CardTitle>
                  <Badge variant="secondary">{state.plantillasFicha.length}/{MAX_PLANTILLAS_FICHA}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {state.plantillasFicha.length > 0 ? (
                  <div className="space-y-2">
                    {state.plantillasFicha.map((plantilla) => {
                      const camposPlantilla = obtenerCamposPlantilla(plantilla)
                      const imagenesPlantilla = obtenerImagenesPlantilla(plantilla)

                      return (
                        <div key={plantilla.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{plantilla.nombre || 'Plantilla sin nombre'}</p>
                            <p className="text-xs text-muted-foreground">
                              {plantilla.archivoNombre || 'Archivo no disponible'} - {Object.keys(camposPlantilla).length} campos - {Object.keys(imagenesPlantilla).length} imagenes
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => exportarPlantilla(plantilla)}
                              disabled={exportandoId === plantilla.id || !plantilla.archivoBase64}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              {exportandoId === plantilla.id ? 'Exportando' : 'Exportar'}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => eliminarPlantilla(plantilla.id)} aria-label="Eliminar plantilla">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Carga un Excel y guardalo como plantilla para exportar esta ficha.
                  </p>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  )
}

function ImageSlot({
  title,
  image,
  onImage,
  onClear,
  onDwgCargar,
  cargandoDwg = false,
}: {
  title: string
  image: string
  onImage: (file?: File) => void
  onClear: () => void
  onDwgCargar?: (file?: File) => void
  cargandoDwg?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dwgInputRef = useRef<HTMLInputElement>(null)
  const [dragActivo, setDragActivo] = useState(false)

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActivo(false)

    const file = Array.from(event.dataTransfer.files).find(item => item.type.startsWith('image/'))
    if (file) onImage(file)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {onDwgCargar && (
              <>
                <input
                  ref={dwgInputRef}
                  type="file"
                  accept=".dwg"
                  className="hidden"
                  onChange={(event) => onDwgCargar(event.target.files?.[0])}
                  disabled={cargandoDwg}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dwgInputRef.current?.click()}
                  disabled={cargandoDwg}
                >
                  {cargandoDwg ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="mr-2 h-4 w-4" />
                  )}
                  {cargandoDwg ? 'Generando...' : 'DWG'}
                </Button>
              </>
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => onImage(event.target.files?.[0])} disabled={cargandoDwg} />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={cargandoDwg}>
              <ImagePlus className="mr-2 h-4 w-4" />
              Imagen
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {image ? (
          <div
            className={`relative overflow-hidden rounded-lg border bg-muted/30 ${dragActivo ? 'ring-2 ring-primary' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActivo(true)
            }}
            onDragLeave={() => setDragActivo(false)}
            onDrop={handleDrop}
          >
            <img src={image} alt={title} className="h-[260px] w-full object-contain" />
            <Button variant="destructive" size="icon" className="absolute right-2 top-2 h-8 w-8" onClick={onClear}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div
            className={`flex h-[260px] items-center justify-center rounded-lg border border-dashed bg-muted/20 text-sm text-muted-foreground transition-colors ${
              dragActivo ? 'border-primary bg-primary/10 text-primary' : ''
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActivo(true)
            }}
            onDragLeave={() => setDragActivo(false)}
            onDrop={handleDrop}
          >
            Arrastra una imagen aqui o usa el boton Imagen
          </div>
        )}
      </CardContent>
    </Card>
  )
}

