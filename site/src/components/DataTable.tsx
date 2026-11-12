import type { ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import clsx from 'clsx';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Numbers are right-aligned */
    numeric?: boolean;
    /** Let the cell wrap instead of keeping one line */
    wrap?: boolean;
  }
}

export interface PageState {
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  initialSorting?: SortingState;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  /** Page through the rows; omitted, every row shows */
  paging?: PageState;
  empty?: ReactNode;
}

/**
 * Data table after lab's: about 40px rows, muted 12px column labels, hairline row dividers, no
 * zebra stripes, numbers right-aligned. Inside a flush Card it runs to the card's edges and scrolls
 * sideways within the card on small screens.
 */
export function DataTable<T>({
  data,
  columns,
  sorting,
  onSortingChange,
  initialSorting,
  onRowClick,
  getRowId,
  paging,
  empty,
}: DataTableProps<T>) {
  const pageCount = paging ? Math.max(1, Math.ceil(data.length / paging.pageSize)) : 1;
  // A page past the end, as from an old link, shows the last page
  const pageIndex = paging ? Math.min(paging.page, pageCount - 1) : 0;
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      ...(sorting ? { sorting } : {}),
      ...(paging ? { pagination: { pageIndex, pageSize: paging.pageSize } } : {}),
    },
    initialState: { sorting: initialSorting ?? [] },
    onSortingChange: onSortingChange
      ? updater => onSortingChange(typeof updater === 'function' ? updater(sorting ?? []) : updater)
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: paging ? getPaginationRowModel() : undefined,
    manualPagination: !paging,
    autoResetPageIndex: false,
    sortDescFirst: false,
  });

  const columnCount = table.getVisibleLeafColumns().length;
  const edge = (index: number): string =>
    clsx(index === 0 ? 'pl-table-inset' : 'pl-3', index === columnCount - 1 ? 'pr-table-inset' : 'pr-3');

  const rows = table.getRowModel().rows;

  return (
    <div className="table-inset inset-from-card">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead>
            {table.getHeaderGroups().map(group => (
              <tr key={group.id}>
                {group.headers.map((header, index) => {
                  const meta = header.column.columnDef.meta;
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const label = flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      className={clsx(
                        'py-2.5 align-bottom text-xs font-medium text-muted',
                        meta?.numeric ? 'text-right' : 'text-left whitespace-nowrap',
                        edge(index)
                      )}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={clsx(
                            'inline-flex items-center gap-1 rounded-xs transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary-50',
                            meta?.numeric && 'flex-row-reverse',
                            sorted && 'text-foreground'
                          )}
                        >
                          <span>{label}</span>
                          <span aria-hidden className={clsx('w-2 text-2xs', !sorted && 'invisible')}>
                            {sorted === 'desc' ? '↓' : '↑'}
                          </span>
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(row => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={clsx('transition-colors hover:bg-background', onRowClick && 'cursor-pointer')}
              >
                {row.getVisibleCells().map((cell, index) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <td
                      key={cell.id}
                      className={clsx(
                        'py-2.5 text-sm text-foreground tabular-nums',
                        meta?.wrap ? 'min-w-56' : 'whitespace-nowrap',
                        meta?.numeric && 'text-right',
                        edge(index)
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (empty ?? <p className="px-4 py-6 text-center text-sm text-muted">No rows.</p>)}
      {paging && pageCount > 1 && (
        <Pager page={pageIndex} pageCount={pageCount} total={data.length} pageSize={paging.pageSize} onPage={paging.onPage} />
      )}
    </div>
  );
}

function Pager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const buttonClassName =
    'h-7 rounded-sm px-2.5 text-xs font-medium text-foreground outline -outline-offset-1 outline-border transition-colors hover:bg-background disabled:text-muted-50 disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-primary-50';
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-2.5 pr-table-inset pl-table-inset text-xs text-muted tabular-nums">
      <span>
        Rows {from} to {to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={buttonClassName} disabled={page === 0} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button
          type="button"
          className={buttonClassName}
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
