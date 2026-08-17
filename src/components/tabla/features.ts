import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  filterFns as defaultFilterFns,
  rowSortingFeature,
  sortFns as defaultSortFns,
  tableFeatures,
} from '@tanstack/react-table'

export interface TablaColumnMeta {
  className?: string
}

export type TablaFeatures = typeof tablaFeatures

export const tablaFeatures = tableFeatures({
  columnVisibilityFeature,
  columnFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: defaultFilterFns,
  sortFns: defaultSortFns,
  columnMeta: {} as TablaColumnMeta,
})
