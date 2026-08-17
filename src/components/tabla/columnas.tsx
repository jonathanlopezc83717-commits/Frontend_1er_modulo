import type { ColumnDef, RowData } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import type { ResultadoSincronizacion } from '@/lib/excel-sync'
import type { TablaFeatures } from './features'

type Columnas<TData extends RowData> = ColumnDef<TablaFeatures, TData>[]

export type OnEditarFila = (
  filaIndex: number,
  campo: 'numeroPunto' | 'x' | 'y' | 'z' | 'codigo',
  valor: string
) => void

export function crearColumnasComparacion(onEditar: OnEditarFila): Columnas<ResultadoSincronizacion> {
  return [
    {
      id: 'numeroPunto',
      accessorFn: (resultado) => resultado.fila.numeroPunto,
      header: 'No. Punto',
      filterFn: 'includesString',
      meta: { className: 'w-24 px-2 py-1' },
      cell: (info) => (
        <input
          className="w-20 bg-transparent outline-none focus:bg-background rounded px-1 py-0.5 font-medium"
          value={info.getValue() as string}
          onChange={(e) => onEditar(info.row.original.filaIndex, 'numeroPunto', e.target.value)}
        />
      ),
    },
    {
      id: 'x',
      accessorFn: (resultado) => resultado.fila.x,
      header: 'X',
      enableColumnFilter: false,
      meta: { className: 'px-2 py-1' },
      cell: (info) => (
        <input
          type="number"
          step="any"
          className="w-28 bg-transparent outline-none focus:bg-background rounded px-1 py-0.5"
          value={info.getValue() as number}
          onChange={(e) => onEditar(info.row.original.filaIndex, 'x', e.target.value)}
        />
      ),
    },
    {
      id: 'cadenamiento',
      accessorFn: (resultado) => resultado.fila.cadenamiento ?? '',
      header: 'Cadenamiento',
      filterFn: 'includesString',
      meta: { className: 'w-28 px-2 py-2 font-mono text-muted-foreground' },
      cell: (info) => (info.getValue() as string) || '—',
    },
    {
      id: 'y',
      accessorFn: (resultado) => resultado.fila.y,
      header: 'Y',
      enableColumnFilter: false,
      meta: { className: 'px-2 py-1' },
      cell: (info) => (
        <input
          type="number"
          step="any"
          className="w-28 bg-transparent outline-none focus:bg-background rounded px-1 py-0.5"
          value={info.getValue() as number}
          onChange={(e) => onEditar(info.row.original.filaIndex, 'y', e.target.value)}
        />
      ),
    },
    {
      id: 'z',
      accessorFn: (resultado) => resultado.fila.z,
      header: 'Z',
      enableColumnFilter: false,
      meta: { className: 'px-2 py-1' },
      cell: (info) => (
        <input
          type="number"
          step="any"
          className="w-24 bg-transparent outline-none focus:bg-background rounded px-1 py-0.5"
          value={info.getValue() as number}
          onChange={(e) => onEditar(info.row.original.filaIndex, 'z', e.target.value)}
        />
      ),
    },
    {
      id: 'codigo',
      accessorFn: (resultado) => resultado.fila.codigo,
      header: 'Código',
      filterFn: 'includesString',
      meta: { className: 'px-2 py-1' },
      cell: (info) => (
        <input
          className="w-24 bg-transparent outline-none focus:bg-background rounded px-1 py-0.5"
          value={info.getValue() as string}
          onChange={(e) => onEditar(info.row.original.filaIndex, 'codigo', e.target.value)}
        />
      ),
    },
    {
      id: 'nomenclatura',
      accessorFn: (resultado) => resultado.nomenclatura?.definicion ?? '',
      header: 'Nomenclatura',
      filterFn: 'includesString',
      meta: { className: 'px-3 py-2' },
      cell: (info) => (info.getValue() as string) || '—',
    },
    {
      id: 'estado',
      accessorFn: (resultado) => resultado.estado,
      header: 'Estado',
      filterFn: 'includesString',
      meta: { className: 'px-3 py-2' },
      cell: (info) => (
        <Badge variant={info.row.original.nomenclatura ? 'default' : 'destructive'}>
          {info.row.original.nomenclatura ? 'ok' : 'nok'}
        </Badge>
      ),
    },
  ]
}

export function crearColumnasVistaPrevia(encabezados: string[]): Columnas<string[]> {
  return encabezados.map((encabezado, indice) => ({
    id: `col-${indice}`,
    accessorFn: (fila: string[]) => fila[indice] ?? '',
    header: encabezado || `Columna ${indice + 1}`,
    filterFn: 'includesString',
    meta: { className: 'px-3 py-2' },
  }))
}
