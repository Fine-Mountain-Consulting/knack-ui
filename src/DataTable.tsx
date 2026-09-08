import {
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { Button, EmptyState, ErrorState, Skeleton, Spinner, cx } from './primitives.js';

/**
 * How a cell turns into an editor when clicked.
 *
 * Connections are deliberately absent. Picking a connected record means an
 * async search against another object, which is a popover with its own loading
 * and empty states — not something that belongs inside a table cell. Those stay
 * in the record form, where there is room to get them right.
 */
export interface ColumnEdit<T> {
  type:
    | 'short_text'
    | 'paragraph_text'
    | 'number'
    | 'currency'
    | 'multiple_choice'
    | 'boolean'
    | 'date'
    | 'date_time'
    | 'email'
    | 'phone'
    | 'link';
  /** Multiple-choice options, in the order Knack defines them. */
  options?: readonly string[];
  /** The editable value. Defaults to `row[column.key]`. */
  value?: (row: T) => unknown;
  /**
   * Turns what the input holds into what gets written. Defaults to a trimmed
   * string, a Number for numeric types, the plain `YYYY-MM-DD` for a date, and
   * an ISO timestamp for a date and time.
   */
  toValue?: (input: string, row: T) => unknown;
  /** Refuses the edit and says why. Returning a string blocks the write. */
  validate?: (input: string, row: T) => string | null;
  /** Locks the cell for a particular row — a closed record, say. */
  disabled?: (row: T) => boolean;
}

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
  /** Click the cell to edit it in place. Requires `onCellEdit` on the table. */
  edit?: ColumnEdit<T>;
  /**
   * Makes the column groupable, returning the group a row belongs in. Keep it
   * cheap — it runs for every row on every render.
   */
  groupValue?: (row: T) => string;
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
  /** Rows per page. Pass with `onPageSizeChange` to offer the size control. */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;

  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  emptyIcon?: ReactNode;

  /** Skeleton row count while loading. Match the page size to avoid a jump. */
  skeletonRows?: number;

  /**
   * Commits an inline edit. Only cells whose column carries `edit` are
   * editable, and only when this is supplied — which is where the permission
   * check belongs, so a reader is never offered an editor at all.
   */
  onCellEdit?: (change: { row: T; column: Column<T>; value: unknown }) => void;
  /** Row ids with a write in flight. Their edited cells show a spinner. */
  savingIds?: ReadonlySet<string>;

  /**
   * Group-by. Grouping is applied to the rows currently loaded, which with
   * server-side paging is the current page — the table says so beneath the
   * control rather than implying it has grouped the whole table.
   */
  groupBy?: string | null;
  onGroupByChange?: (key: string | null) => void;
  /**
   * Draws the group-by control above the grid. Set false when the caller
   * already has a controls row of its own — a list header, say — so the
   * control sits with search and the filters rather than on a line by itself.
   * Grouping still applies; only the control moves.
   */
  showGroupControl?: boolean;
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
  pageSize,
  onPageSizeChange,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  emptyIcon,
  skeletonRows = 5,
  onCellEdit,
  savingIds,
  groupBy = null,
  onGroupByChange,
  showGroupControl = true,
}: DataTableProps<T>) => {
  const cardColumns = useMemo(() => columns.filter((c) => c.inCard !== false), [columns]);
  const groupable = useMemo(() => columns.filter((c) => c.groupValue), [columns]);

  const [editing, setEditing] = useState<{ rowId: string; key: string; draft: string } | null>(
    null,
  );
  const [invalid, setInvalid] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  /** The one cell whose write is in flight, so the spinner lands on it alone. */
  const [pendingCell, setPendingCell] = useState<{ rowId: string; key: string } | null>(null);

  const editableColumn = (column: Column<T>, row: T) =>
    onCellEdit && column.edit && !column.edit.disabled?.(row) ? column.edit : null;

  /** The stored value, as the input wants to see it. */
  const toInput = (column: Column<T>, row: T): string => {
    const spec = column.edit!;
    const raw = spec.value ? spec.value(row) : (row as Record<string, unknown>)[column.key];
    if (raw === null || raw === undefined) return '';
    if (spec.type === 'date' || spec.type === 'date_time') {
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) return '';
      // Both input types want local wall-clock, never a UTC string — that
      // shifts the day backwards for anyone west of Greenwich.
      const pad = (n: number) => String(n).padStart(2, '0');
      const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return spec.type === 'date' ? day : `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    if (spec.type === 'boolean') return raw ? 'true' : 'false';
    return String(raw);
  };

  const closeEditor = () => {
    setEditing(null);
    setInvalid(null);
  };

  const commit = (input: string) => {
    if (!editing) return;
    const column = columns.find((c) => c.key === editing.key);
    const row = rows.find((r) => getRowId(r) === editing.rowId);
    if (!column || !row || !onCellEdit) return closeEditor();

    const spec = column.edit!;
    const message = spec.validate?.(input, row) ?? null;
    if (message) {
      // Held open with the message showing. Closing on a rejected value would
      // throw away what the user typed and leave them guessing.
      setInvalid(message);
      return;
    }

    // Opening a cell and clicking away is not an edit. Writing anyway costs an
    // API call and puts a meaningless entry in the record's history.
    if (input === toInput(column, row)) return closeEditor();

    let value: unknown;
    if (spec.toValue) value = spec.toValue(input, row);
    else if (spec.type === 'number' || spec.type === 'currency')
      value = input.trim() === '' ? null : Number(input);
    else if (spec.type === 'boolean') value = input === 'true';
    else if (spec.type === 'date')
      /*
       * Passed through exactly as the input holds it. A calendar date has no
       * timezone in it, and routing one through Date and back gives it one —
       * `new Date('2026-09-15')` is UTC midnight, which is the 14th for
       * everyone west of Greenwich. The date the user picked is the date that
       * gets written.
       */
      value = input === '' ? null : input;
    else if (spec.type === 'date_time')
      value = input === '' ? null : new Date(input).toISOString();
    else value = input.trim();

    closeEditor();
    setPendingCell({ rowId: editing.rowId, key: editing.key });
    onCellEdit({ row, column, value });
  };

  const toggleGroup = (label: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(label)) next.add(label);
      return next;
    });

  const renderCell = (column: Column<T>, row: T) => {
    const rowId = getRowId(row);
    const spec = editableColumn(column, row);
    const open = editing?.rowId === rowId && editing.key === column.key;

    if (open && spec) {
      const stop = (e: SyntheticEvent) => e.stopPropagation();
      const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setEditing((state) => (state ? { ...state, draft: e.target.value } : state));
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeEditor();
        } else if (e.key === 'Enter' && spec.type !== 'paragraph_text') {
          e.preventDefault();
          commit(editing.draft);
        }
      };
      const inputClass = cx(
        'w-full rounded border bg-white px-1.5 py-1 text-sm text-steel-900 shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2',
        invalid
          ? 'border-red-400 focus-visible:ring-red-500'
          : 'border-brand-400 focus-visible:ring-brand-500',
      );

      let control: ReactNode;
      if (spec.type === 'multiple_choice' || spec.type === 'boolean') {
        const options =
          spec.type === 'boolean'
            ? [
                { value: 'true', label: 'Yes' },
                { value: 'false', label: 'No' },
              ]
            : (spec.options ?? []).map((o) => ({ value: o, label: o }));
        control = (
          <select
            autoFocus
            value={editing.draft}
            className={inputClass}
            onClick={stop}
            onKeyDown={onKeyDown}
            onBlur={() => commit(editing.draft)}
            // A choice is committed the moment it is made. Asking for a second
            // confirming click on a dropdown is friction with no purpose.
            onChange={(e) => commit(e.target.value)}
          >
            {spec.type === 'multiple_choice' && <option value="">—</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      } else if (spec.type === 'paragraph_text') {
        control = (
          <textarea
            autoFocus
            rows={3}
            value={editing.draft}
            className={inputClass}
            onClick={stop}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onBlur={() => commit(editing.draft)}
          />
        );
      } else {
        const TYPE_ATTR = {
          short_text: 'text',
          number: 'number',
          currency: 'number',
          date: 'date',
          date_time: 'datetime-local',
          email: 'email',
          phone: 'tel',
          link: 'url',
        } as const;
        control = (
          <input
            autoFocus
            type={TYPE_ATTR[spec.type as keyof typeof TYPE_ATTR] ?? 'text'}
            step={spec.type === 'currency' ? '0.01' : undefined}
            value={editing.draft}
            className={inputClass}
            onClick={stop}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onBlur={() => commit(editing.draft)}
          />
        );
      }

      return (
        <div onClick={stop} className="min-w-24">
          {control}
          {invalid && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {invalid}
            </p>
          )}
        </div>
      );
    }

    const saving =
      savingIds?.has(rowId) && pendingCell?.rowId === rowId && pendingCell.key === column.key;

    return (
      <div
        className={cx(
          'flex min-w-0 items-center gap-1.5',
          column.align === 'right' && 'justify-end',
          column.align === 'center' && 'justify-center',
        )}
      >
        <span className="min-w-0 truncate">{column.render(row)}</span>
        {saving && <Spinner size="sm" label="Saving" />}
        {spec && !saving && (
          <PencilSquareIcon
            className="h-3.5 w-3.5 shrink-0 text-steel-400 opacity-0 transition-opacity group-hover/cell:opacity-100"
            aria-hidden="true"
          />
        )}
      </div>
    );
  };

  const renderRow = (row: T) => {
    const rowId = getRowId(row);
    return (
      <tr
        key={rowId}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        className={cx(
          'transition-colors',
          onRowClick && 'cursor-pointer hover:bg-brand-50/50',
          loading && 'opacity-60',
        )}
      >
        {columns.map((column) => {
          const spec = editableColumn(column, row);
          const open = editing?.rowId === rowId && editing.key === column.key;
          const openEditor = () => {
            setInvalid(null);
            setEditing({ rowId, key: column.key, draft: toInput(column, row) });
          };
          return (
            <td
              key={column.key}
              className={cx(
                'px-4 py-3 text-sm text-steel-700',
                ALIGN[column.align ?? 'left'],
                column.className,
                spec && 'group/cell',
                spec && !open && 'hover:bg-brand-50',
              )}
              /*
               * An editable cell keeps its click. Letting it through would open
               * the record instead, which is the one thing the user was not
               * asking for when they clicked the value they meant to change.
               */
              onClick={
                spec && !open
                  ? (e) => {
                      e.stopPropagation();
                      openEditor();
                    }
                  : undefined
              }
              tabIndex={spec && !open ? 0 : undefined}
              onKeyDown={
                spec && !open
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        openEditor();
                      }
                    }
                  : undefined
              }
            >
              {renderCell(column, row)}
            </td>
          );
        })}
        {rowActions && (
          /* Stops a row action from also triggering onRowClick. */
          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
            {rowActions(row)}
          </td>
        )}
      </tr>
    );
  };

  /** Rows partitioned by the chosen column, in the order the server sent them. */
  const groups = useMemo(() => {
    const column = groupBy ? columns.find((c) => c.key === groupBy) : undefined;
    if (!column?.groupValue) return null;
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const label = column.groupValue(row) || '—';
      const list = map.get(label);
      if (list) list.push(row);
      else map.set(label, [row]);
    }
    return [...map.entries()];
  }, [groupBy, rows, columns]);

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

  /*
   * A refetch over rows that are already on screen — paging, sorting, a filter
   * change. Dimming the rows alone is too quiet: on a fast connection it reads
   * as a flicker, and on a slow one it reads as nothing happening at all, so
   * the user clicks again. The overlay says the app is working.
   */
  const refetching = loading && rows.length > 0;

  return (
    <div className="relative">
      {refetching && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-8">
          <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-sm text-steel-600 shadow-sm ring-1 ring-steel-200">
            <Spinner size="sm" label={null} />
            Loading
          </span>
        </div>
      )}

      {showGroupControl && onGroupByChange && groupable.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-steel-200 px-4 py-2">
          <label className="flex items-center gap-1.5 text-sm text-steel-500">
            Group by
            <select
              value={groupBy ?? ''}
              onChange={(e) => onGroupByChange(e.target.value || null)}
              className="rounded-lg border border-steel-300 bg-white py-1 pl-2 pr-7 text-sm text-steel-900 shadow-sm focus:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">Nothing</option>
              {groupable.map((column) => (
                <option key={column.key} value={column.key}>
                  {typeof column.header === 'string' ? column.header : column.key}
                </option>
              ))}
            </select>
          </label>
          {/*
            Said plainly, because the alternative is a reader who believes they
            are looking at every record in a group when they are looking at one
            page of it. Grouping happens here, over the rows already fetched.
          */}
          {groupBy && totalPages > 1 && (
            <span className="text-xs text-steel-500">
              Grouping this page of {rows.length}, not all{' '}
              {totalRecords?.toLocaleString() ?? ''} records. Show more per page to widen it.
            </span>
          )}
        </div>
      )}

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
              : groups
                ? groups.flatMap(([label, groupRows]) => {
                    const shut = collapsed.has(label);
                    return [
                      <tr key={`group-${label}`} className="bg-steel-100/70">
                        <th
                          scope="colgroup"
                          colSpan={columns.length + (rowActions ? 1 : 0)}
                          className="px-4 py-2 text-left"
                        >
                          <button
                            type="button"
                            onClick={() => toggleGroup(label)}
                            aria-expanded={!shut}
                            className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-steel-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            {shut ? (
                              <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
                            )}
                            {label}
                            <span className="font-normal tabular-nums text-steel-500">
                              ({groupRows.length})
                            </span>
                          </button>
                        </th>
                      </tr>,
                      ...(shut ? [] : groupRows.map(renderRow)),
                    ];
                  })
                : rows.map(renderRow)}
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
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
};

/** The estate default: ten rows, with the reader free to ask for more. */
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalRecords?: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  /**
   * Current rows per page. Supply this together with `onPageSizeChange` to
   * show the size control; omit both to hide it.
   */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
}

export const Pagination = ({
  page,
  totalPages,
  totalRecords,
  onPageChange,
  disabled,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: PaginationProps) => (
  <nav
    aria-label="Pagination"
    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-steel-200 px-4 py-3"
  >
    <div className="flex items-center gap-3">
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

      {pageSize !== undefined && onPageSizeChange && (
        <label className="flex items-center gap-1.5 text-sm text-steel-500">
          <span className="sr-only sm:not-sr-only">Show</span>
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-steel-300 bg-white py-1 pl-2 pr-7 text-sm text-steel-900 shadow-sm focus:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:bg-steel-100"
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="hidden sm:inline">per page</span>
        </label>
      )}
    </div>

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
