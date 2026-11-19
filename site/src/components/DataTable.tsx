import { Fragment, type ReactNode } from 'react';
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

/** URL sort keys ("cost", "-ticks") to the table's sorting state, and back. */
export const toSorting = (sort: readonly string[]): SortingState =>
  sort.map(key => ({ id: key.replace(/^-/, ''), desc: key.startsWith('-') }));
export const fromSorting = (sorting: SortingState): string[] => sorting.map(s => `${s.desc ? '-' : ''}${s.id}`);

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  getRowId?: (row: T) => string;
  /** Sort as URL keys; with onSortChange the sort is controlled (bind both to a `sort` param) */
  sort?: string[];
  onSortChange?: (sort: string[]) => void;
  /** 1-based page, as in the URL; paging is on when pageSize and onPageChange are set */
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  /** Id of the expanded row; renderExpanded draws its content in a full-width row under it */
  expanded?: string;
  onExpandedChange?: (id: string | undefined) => void;
  renderExpanded?: (row: T) => ReactNode;
  /** Row click, when rows don't expand */
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}

/**
 * Data table after lab's: about 40px rows, muted 12px column labels on one line, hairline row
 * dividers, no zebra stripes, numbers right-aligned. Inside a flush Card it runs to the card's
 * edges and scrolls sideways within the card when it is wider than its panel.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  sort,
  onSortChange,
  page = 1,
  pageSize,
  onPageChange,
  expanded,
  onExpandedChange,
  renderExpanded,
  onRowClick,
  empty,
}: DataTableProps<T>) {
  const paging = pageSize != null && onPageChange != null;
  const pageCount = paging ? Math.max(1, Math.ceil(data.length / pageSize)) : 1;
  // A page past the end, as from an old link, shows the last page
  const pageIndex = paging ? Math.min(Math.max(1, page), pageCount) - 1 : 0;
  const sorting = onSortChange ? toSorting(sort ?? []) : undefined;
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      ...(sorting ? { sorting } : {}),
      ...(paging ? { pagination: { pageIndex, pageSize } } : {}),
    },
    initialState: { sorting: toSorting(sort ?? []) },
    onSortingChange: onSortChange
      ? updater => onSortChange(fromSorting(typeof updater === 'function' ? updater(sorting ?? []) : updater))
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: paging ? getPaginationRowModel() : undefined,
    manualPagination: !paging,
    autoResetPageIndex: false,
    sortDescFirst: false,
    // A header click flips between ascending and descending; it never clears the sort (a clean URL means the default sort)
    enableSortingRemoval: false,
  });

  const columnCount = table.getVisibleLeafColumns().length;
  const edge = (index: number): string =>
    clsx(index === 0 ? 'pl-table-inset' : 'pl-3', index === columnCount - 1 ? 'pr-table-inset' : 'pr-3');

  const rows = table.getRowModel().rows;
  const expands = renderExpanded != null && onExpandedChange != null;

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
                        'py-2.5 align-bottom text-xs font-medium whitespace-nowrap text-muted',
                        meta?.numeric ? 'text-right' : 'text-left',
                        edge(index)
                      )}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={clsx(
                            'inline-flex items-center gap-1 rounded-xs whitespace-nowrap transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary-50',
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
            {rows.map(row => {
              const open = expands && expanded === row.id;
              const click = expands
                ? () => onExpandedChange(open ? undefined : row.id)
                : onRowClick
                  ? () => onRowClick(row.original)
                  : undefined;
              return (
                <Fragment key={row.id}>
                  <tr
                    onClick={click}
                    aria-expanded={expands ? open : undefined}
                    className={clsx('transition-colors hover:bg-background', click && 'cursor-pointer', open && 'bg-background')}
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
                  {open && (
                    <tr>
                      <td colSpan={columnCount} className="bg-background pr-table-inset pb-4 pl-table-inset">
                        {renderExpanded(row.original)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (empty ?? <p className="px-4 py-6 text-center text-sm text-muted">No rows.</p>)}
      {paging && pageCount > 1 && (
        <Pager page={pageIndex + 1} pageCount={pageCount} total={data.length} pageSize={pageSize} onPage={onPageChange} />
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
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const buttonClassName =
    'h-7 rounded-sm px-2.5 text-xs font-medium text-foreground outline -outline-offset-1 outline-border transition-colors hover:bg-background disabled:text-muted-50 disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-primary-50';
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-2.5 pr-table-inset pl-table-inset text-xs text-muted tabular-nums">
      <span>
        Rows {from} to {to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={buttonClassName} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className={buttonClassName} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
