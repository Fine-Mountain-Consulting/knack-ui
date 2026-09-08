import { useMemo } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Button, Skeleton, cx } from './primitives.js';

export interface CalendarEvent {
  id: string;
  /** `YYYY-MM-DD`. Anything with a time is truncated to its day. */
  date: string;
  label: string;
  /** A small colour cue beside the label. Pair with text — never colour alone. */
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export interface MonthCalendarProps {
  /** Any date inside the month to display. */
  month: Date;
  events: CalendarEvent[];
  onMonthChange: (month: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  loading?: boolean;
  /** Shown under a day that has more events than fit. */
  maxPerDay?: number;
  /** Rendered when a day is clicked — usually "add on this date". */
  onDayClick?: (isoDate: string) => void;
}

const TONE_DOT = {
  neutral: 'bg-steel-400',
  info: 'bg-blue-500',
  success: 'bg-green-600',
  warning: 'bg-amber-500',
  danger: 'bg-red-600',
} as const;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * A month grid.
 *
 * Dates are handled as local calendar days, not instants. Using UTC here is the
 * classic way to put a task on the wrong day for anyone west of Greenwich: a
 * due date is a day on a wall calendar, not a moment in time, so it is compared
 * as `YYYY-MM-DD` text and never as a timestamp.
 *
 * Weeks start Monday, which is what a work calendar means by a week.
 */
export const MonthCalendar = ({
  month,
  events,
  onMonthChange,
  onEventClick,
  loading = false,
  maxPerDay = 3,
  onDayClick,
}: MonthCalendarProps) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const days = useMemo(() => {
    const first = new Date(year, monthIndex, 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const start = new Date(year, monthIndex, 1 - offset);

    // Six rows always: a grid that changes height as you page months makes the
    // content below it jump around.
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: d, key: iso(d), inMonth: d.getMonth() === monthIndex };
    });
  }, [year, monthIndex]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = event.date.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [events]);

  const today = iso(new Date());
  const title = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-steel-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-steel-900" aria-live="polite">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            aria-label="Previous month"
            onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          >
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="sm" onClick={() => onMonthChange(new Date())}>
            Today
          </Button>
          <Button
            size="sm"
            aria-label="Next month"
            onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          >
            <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-steel-200 bg-steel-50">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center text-xs font-medium text-steel-500">
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7" aria-busy={loading || undefined}>
        {days.map(({ date, key, inMonth }) => {
          const dayEvents = byDay.get(key) ?? [];
          const shown = dayEvents.slice(0, maxPerDay);
          const hidden = dayEvents.length - shown.length;

          return (
            <div
              key={key}
              className={cx(
                'min-h-24 border-b border-r border-steel-100 p-1.5 last-in-row:border-r-0',
                !inMonth && 'bg-steel-50/60',
                onDayClick && 'cursor-pointer hover:bg-brand-50/40',
              )}
              onClick={onDayClick ? () => onDayClick(key) : undefined}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cx(
                    'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums',
                    key === today
                      ? 'bg-brand-600 font-semibold text-white'
                      : inMonth
                        ? 'text-steel-700'
                        : 'text-steel-400',
                  )}
                >
                  {date.getDate()}
                </span>
              </div>

              {loading && inMonth && dayEvents.length === 0 ? null : (
                <ul className="space-y-1">
                  {shown.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick?.(event);
                        }}
                        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-steel-700 hover:bg-steel-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <span
                          className={cx(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            TONE_DOT[event.tone ?? 'neutral'],
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{event.label}</span>
                      </button>
                    </li>
                  ))}
                  {hidden > 0 && (
                    <li className="px-1 text-xs text-steel-500">+{hidden} more</li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {loading && (
        <div className="border-t border-steel-200 p-3">
          <Skeleton className="h-4 w-32" />
        </div>
      )}
    </div>
  );
};

/** First and last day of `month`, as `YYYY-MM-DD`. For building a query. */
export const monthBounds = (month: Date): { start: string; end: string } => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return { start: iso(first), end: iso(last) };
};
