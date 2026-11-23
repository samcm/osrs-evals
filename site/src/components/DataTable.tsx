/**
 * lab's DataTable (src/components/DataTable/), its sort, page and expanded row bound to the URL.
 * Pages import this; it sits beside lab's folder of the same name and reaches the table by its file.
 *
 *   <PageSection title="Runs">
 *     <DataTable data={runs} columns={columns} getRowId={r => r.id}
 *       sort={search.sort} onSortChange={sort => update({ sort }, { resetPage: true })}
 *       page={search.page} pageSize={50} onPageChange={page => update({ page })}
 *       expanded={search.open} onExpandedChange={open => update({ open })} renderExpanded={r => …} />
 *   </PageSection>
 *
 * In a card it runs to the card's edges, its outer columns on the card's inset so they line up with
 * the title. Headers never wrap; a table wider than its card scrolls inside it. A column with
 * `meta: { minWidth }` shows only when the table is that wide, so columns follow the card's width
 * rather than the window's (the sidebar takes its share).
 */

import { useState, type JSX, type ReactNode } from 'react';
import type { ColumnDef, RowData, SortingState } from '@tanstack/react-table';
import { DataTable as LabDataTable } from '@/components/DataTable/DataTable';
import type { DataTableColumn } from '@/components/DataTable/DataTable.types';
import { FADED_OPACITY, hoverProps, useHover } from '@/lib/hover';
import { useWidth } from '@/lib/useWidth';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the type parameters must match TanStack's own declaration
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
const toSorting = (sort: readonly string[]): SortingState =>
  sort.map(key => ({ id: key.replace(/^-/, ''), desc: key.startsWith('-') }));
const fromSorting = (sorting: SortingState): string[] => sorting.map(s => `${s.desc ? '-' : ''}${s.id}`);

export interface DataTableProps<T> {
  data: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- columns mix value types, as TanStack's own examples type them
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
  /** The series id a row stands for: hovering the row hovers it across the page (lib/hover), and rows fade while another is hovered; undefined for a row that stands for none */
  hoverId?: (row: T) => string | undefined;
  /** Shown in one full-width row when there are no rows */
  empty?: ReactNode;
  /** Left of the pagination, such as a row count; with it the footer shows even on one page */
  footer?: ReactNode;
  /**
   * lab's row spacing: `comfortable` (40px rows, text-sm) for most tables, `compact` (text-xs) for a
   * wide table of many columns
   * @default 'comfortable'
   */
  density?: 'comfortable' | 'compact';
}

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
  density = 'comfortable',
}: DataTableProps<T>): JSX.Element {
  const hover = useHover();
  const [measure, width] = useWidth();
  // Without onSortChange the sort is the table's own, starting from `sort`
  const [ownSort, setOwnSort] = useState(() => toSorting(sort ?? []));
  const sorting = onSortChange ? toSorting(sort ?? []) : ownSort;
  const paging = pageSize != null && onPageChange != null;
  const pageCount = paging ? Math.max(1, Math.ceil(data.length / pageSize)) : 1;
  // A page past the end, as from an old link, shows the last page
  const pageIndex = paging ? Math.min(Math.max(1, page), pageCount) - 1 : 0;
  const expands = renderExpanded != null && onExpandedChange != null;

  // lab's meta from the site's: numbers right-aligned, values in the text colour, wrapping cells
  // given room, and a column's classes on its header and cells alike
  const labColumns = columns.map(
    (c): DataTableColumn<T> => ({
      ...c,
      // A header click starts ascending
      sortDescFirst: c.sortDescFirst ?? false,
      meta: {
        ...c.meta,
        numeric: c.meta?.numeric,
        wrap: c.meta?.wrap,
        cellClassName: c.meta?.wrap ? 'min-w-56 text-foreground' : 'text-foreground',
        columnClassName: c.meta?.className,
      },
    })
  );
  // Columns wider tables add: hidden, not just unseen, so the outer columns keep the card's inset
  const columnVisibility = Object.fromEntries(
    columns.flatMap(c => {
      const id = c.id ?? (c as { accessorKey?: string }).accessorKey;
      const min = c.meta?.minWidth;
      return id != null && min != null && width > 0 && width < min ? [[id, false]] : [];
    })
  );

  const click = (row: T, id: string): (() => void) | undefined =>
    expands ? () => onExpandedChange(expanded === id ? undefined : id) : onRowClick ? () => onRowClick(row) : undefined;

  return (
    <div ref={measure} className="min-w-0">
      <LabDataTable<T>
        data={data}
        columns={labColumns}
        getRowId={getRowId}
        density={density}
        hideGlobalFilter
        hideColumnVisibility
        columnVisibility={columnVisibility}
        sorting={sorting}
        onSortingChange={next => {
          // A header click flips between ascending and descending; it never clears the sort (a clean
          // URL means the default sort)
          const kept = next.length > 0 ? next : sorting.map(s => ({ ...s, desc: !s.desc }));
          if (onSortChange) onSortChange(fromSorting(kept));
          else setOwnSort(kept);
        }}
        manualPagination={!paging}
        pageIndex={pageIndex}
        pageSize={paging ? pageSize : Math.max(1, data.length)}
        onPaginationChange={index => onPageChange?.(index + 1)}
        paginationPosition={paging && pageCount > 1 ? 'bottom' : 'none'}
        hidePageSize
        footer={footer}
        emptyMessage={empty ?? 'No rows.'}
        renderExpandedRow={expands ? (row, id) => (expanded === id ? renderExpanded(row) : null) : undefined}
        getRowProps={(row, id) => {
          const hid = hoverId?.(row);
          const open = click(row, id);
          return {
            ...(hid != null ? hoverProps(hid) : {}),
            onClick: open,
            style: hid != null && hover.faded(hid) ? { opacity: FADED_OPACITY + 0.25 } : undefined,
            // A clickable row is reachable by keyboard too: Tab to it, Enter to open
            tabIndex: open ? 0 : undefined,
            onKeyDown: open
              ? event => event.key === 'Enter' && event.target === event.currentTarget && open()
              : undefined,
            'aria-expanded': expands ? expanded === id : undefined,
            className: open
              ? 'cursor-pointer outline-hidden hover:bg-background focus-visible:bg-background'
              : undefined,
          };
        }}
      />
    </div>
  );
}
