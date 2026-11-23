import type { ColumnDef, ColumnFiltersState, SortingState, VisibilityState } from '@tanstack/react-table';
import type { HTMLAttributes, ReactNode } from 'react';

type FilterType = 'text' | 'select' | 'multi-select' | 'number-range' | 'date-range';

interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface DataTableColumnMeta {
  filterType?: FilterType;
  filterOptions?: FilterOption[];
  filterPlaceholder?: string;
  headerIcon?: ReactNode;
  cellClassName?: string;
  /** Numbers: the header and cells align right, the sort mark on the header's left */
  numeric?: boolean;
  /** Let the cells wrap instead of keeping one line */
  wrap?: boolean;
  /** Classes on the column's header and body cells alike, such as `hidden sm:table-cell` */
  columnClassName?: string;
  enableHiding?: boolean;
}

// Use type alias with intersection since ColumnDef is a union type and can't be extended by interface
export type DataTableColumn<TData> = ColumnDef<TData, unknown> & {
  meta?: DataTableColumnMeta;
};

export interface DataTableProps<TData> {
  data: TData[];
  columns: DataTableColumn<TData>[];
  isLoading?: boolean;
  // Pagination
  pageSize?: number;
  pageIndex?: number;
  pageCount?: number;
  onPaginationChange?: (pageIndex: number, pageSize: number) => void;
  // Filtering
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  // Sorting
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  // Column visibility
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;
  // Row selection and actions
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  getRowClassName?: (row: TData, rowId: string) => string | undefined;
  /** More props for a row, such as hover handlers, an inline style computed at runtime or keyboard access */
  getRowProps?: (row: TData, rowId: string) => HTMLAttributes<HTMLTableRowElement>;
  /** Content for a full-width row under a row, such as its details once expanded; null shows none */
  renderExpandedRow?: (row: TData, rowId: string) => ReactNode | null;
  // Manual mode (server-side)
  manualPagination?: boolean;
  manualFiltering?: boolean;
  manualSorting?: boolean;
  // For cursor-based pagination (when total count is unknown)
  hasNextPage?: boolean;
  // Appearance
  emptyMessage?: ReactNode;
  title?: string;
  description?: string;
  // Toolbar options
  hideGlobalFilter?: boolean;
  hideColumnVisibility?: boolean;
  // Pagination position
  paginationPosition?: 'top' | 'bottom' | 'both' | 'none';
  /** Keep the page size the caller set: no Rows menu in the pagination toolbar */
  hidePageSize?: boolean;
  /** At the start of the bottom toolbar, in place of the rows shown (such as a count); shown even without pagination */
  footer?: ReactNode;
  /**
   * Row spacing and type size. `comfortable` matches the `Table` recipe (40px rows, text-sm) for short
   * record lists; `compact` keeps wide, many-column tables on screen.
   * @default 'compact'
   */
  density?: 'compact' | 'comfortable';
}
