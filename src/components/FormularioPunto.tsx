import { useForm } from '@tanstack/react-form'
import type { PuntoFerroviario } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DialogFooter } from '@/components/ui/dialog'

export interface PuntoFormData {
  numeroSerie: string
  nombre: string
  descripcion: string
  carpetaPath: string
  cadenamiento: string
  coordenadas: { lat: string; lng: string }
}

interface FormularioPuntoProps {
  punto: PuntoFerroviario
  puntos: PuntoFerroviario[]
  moverPunto: (id: string, posicion: number) => void
  actualizarPunto: (id: string, data: Partial<PuntoFerroviario>) => void
  onClose: () => void
}

function ErrorCampo({ id, error }: { id: string; error: unknown }) {
  if (typeof error !== 'string' || !error) return null
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {error}
    </p>
  )
}

export function FormularioPunto({ punto, puntos, moverPunto, actualizarPunto, onClose }: FormularioPuntoProps) {
  const form = useForm({
    defaultValues: {
      numeroSerie: punto.numeroSerie.toString(),
      nombre: punto.nombre,
      descripcion: punto.descripcion || '',
      carpetaPath: punto.carpetaPath || '',
      cadenamiento: punto.cadenamiento || '',
      coordenadas: {
        lat: punto.coordenadas?.lat?.toString() || '',
        lng: punto.coordenadas?.lng?.toString() || '',
      },
    } satisfies PuntoFormData,
    onSubmit: ({ value }) => {
      const numeroSerieEditado = Number(value.numeroSerie)
      const nuevaPosicion = Number.isFinite(numeroSerieEditado)
        ? Math.max(1, Math.min(Math.trunc(numeroSerieEditado), puntos.length))
        : punto.numeroSerie

      if (nuevaPosicion !== punto.numeroSerie) {
        moverPunto(punto.id, nuevaPosicion)
      }

      const updates: Partial<PuntoFerroviario> = {
        nombre: value.nombre.trim(),
        descripcion: value.descripcion.trim() || undefined,
        carpetaPath: value.carpetaPath.trim() || undefined,
        cadenamiento: value.cadenamiento.trim() || undefined,
      }
      if (value.coordenadas.lat && value.coordenadas.lng) {
        updates.coordenadas = {
          lat: parseFloat(value.coordenadas.lat),
          lng: parseFloat(value.coordenadas.lng),
        }
      }
      actualizarPunto(punto.id, updates)
      onClose()
    },
  })

  return (
    <form onSubmit={form.handleSubmit} noValidate className="space-y-4 py-2">
      <form.Field
        name="numeroSerie"
        validators={{
          onChange: ({ value }) => {
            if (!value.trim()) return 'El N° de serie es obligatorio'
            const n = Number(value)
            if (!Number.isInteger(n) || n < 1 || n > puntos.length) {
              return `Debe ser un número entero entre 1 y ${puntos.length}`
            }
            return undefined
          },
        }}
      >
        {(field) => {
          const id = 'editar-numeroSerie'
          const error = typeof field.state.meta.errors[0] === 'string' ? (field.state.meta.errors[0] as string) : undefined
          return (
            <div className="space-y-2">
              <Label htmlFor={id}>N° de serie / posición</Label>
              <Input
                id={id}
                type="number"
                min={1}
                max={puntos.length}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="1"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
              />
              <ErrorCampo id={`${id}-error`} error={error} />
            </div>
          )
        }}
      </form.Field>

      <form.Field
        name="nombre"
        validators={{
          onChange: ({ value }) => (value.trim() ? undefined : 'El nombre es obligatorio'),
          onChangeAsync: async ({ value }) => {
            const duplicado = puntos.some((p) => p.id !== punto.id && p.nombre.trim() === value.trim())
            return duplicado ? 'Ya existe un punto con ese nombre' : undefined
          },
          onChangeAsyncDebounceMs: 500,
        }}
      >
        {(field) => {
          const id = 'editar-nombre'
          const error = typeof field.state.meta.errors[0] === 'string' ? (field.state.meta.errors[0] as string) : undefined
          return (
            <div className="space-y-2">
              <Label htmlFor={id}>Nombre</Label>
              <Input
                id={id}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Nombre del punto"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
              />
              <ErrorCampo id={`${id}-error`} error={error} />
            </div>
          )
        }}
      </form.Field>

      <form.Field name="descripcion">
        {(field) => {
          const id = 'editar-descripcion'
          return (
            <div className="space-y-2">
              <Label htmlFor={id}>Descripción</Label>
              <Textarea
                id={id}
                rows={2}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Descripción opcional"
              />
            </div>
          )
        }}
      </form.Field>

      <form.Field name="carpetaPath">
        {(field) => {
          const id = 'editar-carpetaPath'
          return (
            <div className="space-y-2">
              <Label htmlFor={id}>Ruta de carpeta</Label>
              <Input
                id={id}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Ruta de la carpeta"
              />
            </div>
          )
        }}
      </form.Field>

      <form.Field name="cadenamiento">
        {(field) => {
          const id = 'editar-cadenamiento'
          return (
            <div className="space-y-2">
              <Label htmlFor={id}>Cadenamiento</Label>
              <Input
                id={id}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Ej: 56 (separado al sincronizar)"
              />
            </div>
          )
        }}
      </form.Field>

      <div className="grid grid-cols-2 gap-3">
        <form.Field
          name="coordenadas.lat"
          validators={{
            onChange: ({ value }) =>
              value.trim() !== '' && Number.isNaN(Number(value)) ? 'Debe ser un número' : undefined,
          }}
        >
          {(field) => {
            const id = 'editar-coordenadas-lat'
            const error = typeof field.state.meta.errors[0] === 'string' ? (field.state.meta.errors[0] as string) : undefined
            return (
              <div className="space-y-2">
                <Label htmlFor={id}>Latitud</Label>
                <Input
                  id={id}
                  type="text"
                  inputMode="decimal"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="-33.4567"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                />
                <ErrorCampo id={`${id}-error`} error={error} />
              </div>
            )
          }}
        </form.Field>
        <form.Field
          name="coordenadas.lng"
          validators={{
            onChange: ({ value }) =>
              value.trim() !== '' && Number.isNaN(Number(value)) ? 'Debe ser un número' : undefined,
          }}
        >
          {(field) => {
            const id = 'editar-coordenadas-lng'
            const error = typeof field.state.meta.errors[0] === 'string' ? (field.state.meta.errors[0] as string) : undefined
            return (
              <div className="space-y-2">
                <Label htmlFor={id}>Longitud</Label>
                <Input
                  id={id}
                  type="text"
                  inputMode="decimal"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="-70.6789"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                />
                <ErrorCampo id={`${id}-error`} error={error} />
              </div>
            )
          }}
        </form.Field>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <form.Subscribe selector={(s) => s.canSubmit}>
          {(canSubmit) => (
            <Button type="submit" disabled={!canSubmit}>
              Guardar cambios
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
