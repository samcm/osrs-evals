/**
 * A TanStack table drawn with shadcn's Table, its sort, page and expanded row bound to the URL.
 *
 *   <Card><CardHeader>…</CardHeader><CardContent className="px-0">
 *     <DataTable data={runs} columns={columns} getRowId={r => r.id}
 *       sort={search.sort} onSortChange={sort => update({ sort }, { resetPage: true })}
 *       page={search.page} pageSize={50} onPageChange={page => update({ page })}
 *       expanded={search.open} onExpandedChange={open => update({ open })} renderExpanded={r => …} />
 *   </CardContent></Card>
 *
 * Its first and last columns pad by the card's spacing, so in a CardContent without side padding the
 * rows run to the card's edges and line up with the header. Headers never wrap; a table wider than
 * its card scrolls inside it.
 */

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
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

/** The card's spacing on the outer columns (shadcn Card sets --card-spacing). */
const EDGE = 'first:pl-[var(--card-spacing,0.5rem)] last:pr-[var(--card-spacing,0.5rem)]';

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
  const rows = table.getRowModel().rows;
  const expands = renderExpanded != null && onExpandedChange != null;

  return (
    <div className="min-w-0">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(group => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map(header => {
                const meta = header.column.columnDef.meta;
                const sorted = header.column.getIsSorted();
                const label = flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    className={cn('text-muted-foreground', meta?.numeric && 'text-right', EDGE)}
                  >
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-sm whitespace-nowrap transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
                          meta?.numeric && 'flex-row-reverse',
                          sorted && 'text-foreground'
                        )}
                      >
                        <span>{label}</span>
                        <span aria-hidden className={cn('w-2 text-xs', !sorted && 'invisible')}>
                          {sorted === 'desc' ? '↓' : '↑'}
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.map(row => {
            const open = expands && expanded === row.id;
            const click = expands
              ? () => onExpandedChange(open ? undefined : row.id)
              : onRowClick
                ? () => onRowClick(row.original)
                : undefined;
            return (
              <Fragment key={row.id}>
                <TableRow
                  onClick={click}
                  aria-expanded={expands ? open : undefined}
                  data-state={open ? 'selected' : undefined}
                  className={cn(click && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map(cell => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn('tabular-nums', meta?.wrap && 'min-w-56 whitespace-normal', meta?.numeric && 'text-right', EDGE)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
                {open && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columnCount} className={cn('bg-muted/30 whitespace-normal', EDGE)}>
                      {renderExpanded(row.original)}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      {rows.length === 0 && (empty ?? <p className="py-6 text-center text-sm text-muted-foreground">No rows.</p>)}
      {paging && pageCount > 1 && (
        <div className="flex items-center justify-between gap-4 border-t px-[var(--card-spacing,0.5rem)] pt-3 text-xs text-muted-foreground tabular-nums">
          <span>
            Rows {pageIndex * pageSize + 1} to {Math.min(data.length, (pageIndex + 1) * pageSize)} of {data.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => onPageChange(pageIndex)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={pageIndex >= pageCount - 1} onClick={() => onPageChange(pageIndex + 2)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
