import { useMemo, type ReactNode } from 'react';
import { ChevronDownIcon, ChevronUpDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Button, EmptyState, ErrorState, Skeleton, cx } from './primitives.js';

export interface Column<T> {
  /** Stable key. Also the sort field when `sortable` and `sortField` is unset. */
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** The Knack field key to sort on. Defaults to `key`. */
  sortField?: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Hidden below `sm`, where the card fallback renders instead. */
  className?: string;
  /** Shown in the mobile card as a labelled row. Defaults to true. */
  inCard?: boolean;
}

export interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: { message?: string } | null;
  onRetry?: () => void;

  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;

  sort?: SortState;
  onSortChange?: (sort: SortState) => void;

  page?: number;
  totalPages?: number;
  totalRecords?: number;
  onPageChange?: (page: number) => void;

  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  emptyIcon?: ReactNode;

  /** Skeleton row count while loading. Match the page size to avoid a jump. */
  skeletonRows?: number;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/**
 * Server-driven table. Sorting and paging are handed back to the caller so
 * they map straight onto Knack query params rather than sorting a single page
 * client-side and lying about the order.
 *
 * Below `sm` it renders a card list instead of a horizontally-scrolling table,
 * because a 9-column table on a phone is not a table.
 */
export const DataTable = <T,>({
  columns,
  rows,
  getRowId,
  loading = false,
  error = null,
  onRetry,
  onRowClick,
  rowActions,
  sort,
  onSortChange,
  page = 1,
  totalPages = 1,
  totalRecords,
  onPageChange,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  emptyIcon,
  skeletonRows = 5,
}: DataTableProps<T>) => {
  const cardColumns = useMemo(() => columns.filter((c) => c.inCard !== false), [columns]);

  const toggleSort = (column: Column<T>) => {
    if (!column.sortable || !onSortChange) return;
    const field = column.sortField ?? column.key;
    onSortChange(
      sort?.field === field
        ? { field, order: sort.order === 'asc' ? 'desc' : 'asc' }
        : { field, order: 'asc' },
    );
  };

  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="min-w-full divide-y divide-steel-200">
          <thead className="bg-steel-50">
            <tr>
              {columns.map((column) => {
                const field = column.sortField ?? column.key;
                const active = sort?.field === field;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active ? (sort!.order === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={cx(
                      'px-4 py-3 text-xs font-medium uppercase tracking-wide text-steel-500',
                      ALIGN[column.align ?? 'left'],
                      column.className,
                    )}
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1 rounded transition-colors hover:text-steel-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        {column.header}
                        {active ? (
                          sort!.order === 'asc' ? (
                            <ChevronUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronUpDownIcon
                            className="h-3.5 w-3.5 text-steel-400"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
              {rowActions && <th scope="col" className="w-px px-4 py-3" />}
            </tr>
          </thead>

          <tbody className="divide-y divide-steel-200 bg-white" aria-busy={loading || undefined}>
            {loading && rows.length === 0
              ? Array.from({ length: skeletonRows }, (_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {columns.map((column) => (
                      <td key={column.key} className="px-4 py-3">
                        <Skeleton className="h-4 w-full max-w-[12rem]" />
                      </td>
                    ))}
                    {rowActions && <td className="px-4 py-3" />}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={getRowId(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cx(
                      'transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-brand-50/50',
                      loading && 'opacity-60',
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cx(
                          'px-4 py-3 text-sm text-steel-700',
                          ALIGN[column.align ?? 'left'],
                          column.className,
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                    {rowActions && (
                      /* Stops a row action from also triggering onRowClick. */
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-steel-200 sm:hidden" aria-busy={loading || undefined}>
        {loading && rows.length === 0
          ? Array.from({ length: skeletonRows }, (_, i) => (
              <li key={`m-skeleton-${i}`} className="space-y-2 px-4 py-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </li>
            ))
          : rows.map((row) => (
              <li key={getRowId(row)}>
                <div
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={cx(
                    'px-4 py-3',
                    onRowClick &&
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                  )}
                >
                  {cardColumns.map((column, index) => (
                    <div
                      key={column.key}
                      className={cx(
                        'flex justify-between gap-3',
                        index === 0 ? 'mb-1' : 'text-sm',
                      )}
                    >
                      {index === 0 ? (
                        <div className="min-w-0 font-medium text-steel-900">
                          {column.render(row)}
                        </div>
                      ) : (
                        <>
                          <span className="shrink-0 text-steel-500">{column.header}</span>
                          <span className="min-w-0 text-right text-steel-700">
                            {column.render(row)}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  {rowActions && (
                    <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
                      {rowActions(row)}
                    </div>
                  )}
                </div>
              </li>
            ))}
      </ul>

      {onPageChange && totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          onPageChange={onPageChange}
          disabled={loading}
        />
      )}
    </div>
  );
};

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalRecords?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export const Pagination = ({
  page,
  totalPages,
  totalRecords,
  onPageChange,
  disabled,
}: PaginationProps) => (
  <nav
    aria-label="Pagination"
    className="flex items-center justify-between gap-4 border-t border-steel-200 px-4 py-3"
  >
    <p className="text-sm text-steel-500">
      Page <span className="font-medium tabular-nums">{page}</span> of{' '}
      <span className="font-medium tabular-nums">{totalPages}</span>
      {totalRecords !== undefined && (
        <span className="hidden sm:inline">
          {' '}
          · <span className="tabular-nums">{totalRecords.toLocaleString()}</span> records
        </span>
      )}
    </p>
    <div className="flex gap-2">
      <Button size="sm" onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1}>
        Previous
      </Button>
      <Button
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= totalPages}
      >
        Next
      </Button>
    </div>
  </nav>
);
