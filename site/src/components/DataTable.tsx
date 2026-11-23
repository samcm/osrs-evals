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
 * its card scrolls inside it. A column with `meta: { minWidth }` shows only when the table is that
 * wide, so columns follow the card's width rather than the window's (the sidebar takes its share).
 */

import { Fragment, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown } from 'lucide-react';
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
import { FADED_OPACITY, hoverProps, useHover } from '@/lib/hover';
import { useWidth } from '@/lib/useWidth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Numbers are right-aligned */
    numeric?: boolean;
    /** Let the cell wrap instead of keeping one line */
    wrap?: boolean;
    /** Classes for the column's header and cells, such as `max-md:hidden` for a column phones skip */
    className?: string;
    /** Show the column only when the table is at least this many pixels wide */
    minWidth?: number;
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
  /** The series id a row stands for: hovering the row hovers it across the page (lib/hover), and rows fade while another is hovered */
  hoverId?: (row: T) => string;
  /** Shown in one full-width row when there are no rows */
  empty?: ReactNode;
  /** Left of the pagination, such as a row count; with it the footer shows even on one page */
  footer?: ReactNode;
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
  hoverId,
  empty,
  footer,
}: DataTableProps<T>) {
  const hover = useHover();
  const [measure, width] = useWidth();
  const paging = pageSize != null && onPageChange != null;
  const pageCount = paging ? Math.max(1, Math.ceil(data.length / pageSize)) : 1;
  // A page past the end, as from an old link, shows the last page
  const pageIndex = paging ? Math.min(Math.max(1, page), pageCount) - 1 : 0;
  const sorting = onSortChange ? toSorting(sort ?? []) : undefined;
  // Columns wider tables add: hidden, not just unseen, so the outer columns keep the card's spacing
  const columnVisibility = Object.fromEntries(
    columns.flatMap(c => {
      const id = c.id ?? (c as { accessorKey?: string }).accessorKey;
      const min = c.meta?.minWidth;
      return id != null && min != null && width > 0 && width < min ? [[id, false]] : [];
    })
  );
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      columnVisibility,
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
  const pages = paging && pageCount > 1;

  return (
    <div ref={measure} className="@container/table min-w-0">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(group => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map(header => {
                const meta = header.column.columnDef.meta;
                const sorted = header.column.getIsSorted();
                const label = flexRender(header.column.columnDef.header, header.getContext());
                const SortIcon = sorted === 'desc' ? ArrowDown : sorted === 'asc' ? ArrowUp : ChevronsUpDown;
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    className={cn('text-muted-foreground', meta?.numeric && 'text-right', EDGE, meta?.className)}
                  >
                    {header.column.getCanSort() ? (
                      // shadcn's data-table sort header: a ghost Button, pulled out by its padding so the
                      // label lines up with the cells under it (left, or right for numbers)
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          'group/sort h-7 px-2 text-sm font-medium text-muted-foreground hover:text-foreground',
                          meta?.numeric ? '-mr-2 flex-row-reverse' : '-ml-2',
                          sorted && 'text-foreground'
                        )}
                      >
                        <span>{label}</span>
                        <SortIcon
                          aria-hidden
                          className={cn(
                            'size-3.5 transition-opacity',
                            !sorted && 'opacity-0 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60'
                          )}
                        />
                      </Button>
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
          {rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="h-24 text-center whitespace-normal text-muted-foreground">
                {empty ?? 'No rows.'}
              </TableCell>
            </TableRow>
          )}
          {rows.map(row => {
            const open = expands && expanded === row.id;
            const click = expands
              ? () => onExpandedChange(open ? undefined : row.id)
              : onRowClick
                ? () => onRowClick(row.original)
                : undefined;
            const hid = hoverId?.(row.original);
            return (
              <Fragment key={row.id}>
                <TableRow
                  {...(hid != null ? hoverProps(hid) : {})}
                  style={hid != null && hover.faded(hid) ? { opacity: FADED_OPACITY + 0.25 } : undefined}
                  onClick={click}
                  // A clickable row is reachable by keyboard too: Tab to it, Enter to open
                  tabIndex={click ? 0 : undefined}
                  onKeyDown={click ? event => event.key === 'Enter' && event.target === event.currentTarget && click() : undefined}
                  aria-expanded={expands ? open : undefined}
                  data-state={open ? 'selected' : undefined}
                  className={cn('transition-opacity', click && 'cursor-pointer outline-none focus-visible:bg-muted')}
                >
                  {row.getVisibleCells().map(cell => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn('tabular-nums', meta?.wrap && 'min-w-56 whitespace-normal', meta?.numeric && 'text-right', EDGE, meta?.className)}
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
      {(pages || footer != null) && (
        <div className="flex items-center justify-between gap-4 border-t px-[var(--card-spacing,0.5rem)] pt-3 text-sm text-muted-foreground tabular-nums">
          <div className="min-w-0">{footer}</div>
          {pages && (
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">
                Page {pageIndex + 1} of {pageCount}
              </span>
              <Button variant="outline" size="icon" className="max-sm:hidden" aria-label="First page" disabled={pageIndex === 0} onClick={() => onPageChange(1)}>
                <ChevronsLeft />
              </Button>
              <Button variant="outline" size="icon" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => onPageChange(pageIndex)}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon" aria-label="Next page" disabled={pageIndex >= pageCount - 1} onClick={() => onPageChange(pageIndex + 2)}>
                <ChevronRight />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="max-sm:hidden"
                aria-label="Last page"
                disabled={pageIndex >= pageCount - 1}
                onClick={() => onPageChange(pageCount)}
              >
                <ChevronsRight />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
