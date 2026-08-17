import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from 'lucide-react'
import {
  flexRender,
  useTable,
  type ColumnDef,
  type RowData,
  type TableState,
} from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { tablaFeatures } from './features'
import { atomColumnVisibility } from './visibilidad'

export interface TablaSincronizacionProps<TData extends RowData> {
  data: TData[]
  columns: ColumnDef<typeof tablaFeatures, TData>[]
  getRowId?: (row: TData, index: number) => string
  conFiltros?: boolean
}

const seleccionarEstadoTabla = (estado: TableState<typeof tablaFeatures>) => ({
  sorting: estado.sorting,
  columnFilters: estado.columnFilters,
  columnVisibility: estado.columnVisibility,
})

export function TablaSincronizacion<TData extends RowData>({
  data,
  columns,
  getRowId,
  conFiltros = false,
}: TablaSincronizacionProps<TData>) {
  const table = useTable(
    {
      features: tablaFeatures,
      atoms: { columnVisibility: atomColumnVisibility },
      columns,
      data,
      getRowId,
    },
    seleccionarEstadoTabla,
  )

  return (
    <div className="space-y-2">
      <details>
        <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground list-none [&::-webkit-details-marker]:hidden">
          <Columns3 className="h-4 w-4" />
          Columnas
        </summary>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border bg-muted/40 p-2">
          {table.getAllLeafColumns().map((column) => (
            <label key={column.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <Checkbox
                checked={column.getIsVisible()}
                onCheckedChange={(valor) => column.toggleVisibility(valor === true)}
              />
              {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
            </label>
          ))}
        </div>
      </details>
      <div className="rounded-lg border overflow-auto max-h-[400px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 sticky top-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const orden = header.column.getIsSorted()
                  const textoEncabezado =
                    typeof header.column.columnDef.header === 'string'
                      ? header.column.columnDef.header
                      : header.column.id
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={orden === 'asc' ? 'ascending' : orden === 'desc' ? 'descending' : undefined}
                      className={cn(
                        'px-2 py-2 text-left font-medium whitespace-nowrap',
                        header.column.columnDef.meta?.className
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          disabled={!header.column.getCanSort()}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {!header.column.getCanSort() ? null : orden === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : orden === 'desc' ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                        {conFiltros && header.column.getCanFilter() && (
                          <input
                            aria-label={`Filtrar ${textoEncabezado}`}
                            value={(header.column.getFilterValue() ?? '') as string}
                            onChange={(e) => header.column.setFilterValue(e.target.value)}
                            className="w-full max-w-28 rounded border bg-background px-1.5 py-0.5 text-xs font-normal outline-none focus:ring-1 focus:ring-ring"
                          />
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn('px-2 py-2 whitespace-nowrap', cell.column.columnDef.meta?.className)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
