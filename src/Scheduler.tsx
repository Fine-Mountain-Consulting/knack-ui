import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Button, Spinner, cx } from './primitives.js';

/**
 * A resource-lane day scheduler: one column per person, a time axis down the
 * side, drag an appointment between columns or up and down to reschedule, drag
 * its lower edge to change how long it runs.
 *
 * Built rather than bought. The off-the-shelf option for resource lanes is a
 * paid licence whose key ships in the client's bundle — awkward for an app the
 * client is meant to own — and the grid snapping here is custom regardless.
 *
 * Pointer events, not HTML5 drag-and-drop: dragging needs continuous position
 * to snap against, `dragover` fires too coarsely to place a mark on a
 * fifteen-minute grid, and pointer events cover touch without a second code
 * path.
 */

export interface SchedulerResource {
  id: string;
  label: string;
}

export interface SchedulerEvent {
  id: string;
  resourceId: string;
  /** ISO instant. */
  start: string;
  /** ISO instant. Must be after `start`. */
  end: string;
  label: string;
  sublabel?: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export interface SchedulerProps {
  date: Date;
  resources: SchedulerResource[];
  events: SchedulerEvent[];
  onDateChange: (date: Date) => void;
  /** Fired once, on drop. `resourceId` changes when dragged between columns. */
  onEventMove?: (change: { id: string; start: string; end: string; resourceId: string }) => void;
  onEventClick?: (event: SchedulerEvent) => void;
  /** Clicking empty space — "book something here". */
  onSlotClick?: (slot: { start: string; end: string; resourceId: string }) => void;
  loading?: boolean;
  /**
   * Events with a write in flight. They render where the user put them, with a
   * spinner, rather than snapping back to the server's position and forward
   * again when it catches up.
   */
  busyIds?: ReadonlySet<string>;
  /** Hour the grid starts and ends, 0–24. */
  dayStartHour?: number;
  dayEndHour?: number;
  /** Grid granularity. Drags snap to this. */
  slotMinutes?: number;
  /** Height of one slot, in pixels. */
  slotHeight?: number;
}

const TONE_CLASSES = {
  neutral: 'bg-steel-100 border-steel-300 text-steel-800',
  info: 'bg-blue-50 border-blue-300 text-blue-900',
  success: 'bg-green-50 border-green-300 text-green-900',
  warning: 'bg-amber-50 border-amber-300 text-amber-900',
  danger: 'bg-red-50 border-red-300 text-red-900',
} as const;

const MS_PER_MIN = 60_000;

const timeLabel = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Minutes from the top of the grid. */
const minutesFromStart = (iso: string, day: Date, dayStartHour: number): number => {
  const d = new Date(iso);
  const top = new Date(day.getFullYear(), day.getMonth(), day.getDate(), dayStartHour, 0, 0, 0);
  return (d.getTime() - top.getTime()) / MS_PER_MIN;
};

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  /** Where in the event body the pointer grabbed, in minutes. */
  grabOffsetMin: number;
  startMin: number;
  endMin: number;
  resourceId: string;
}

export const Scheduler = ({
  date,
  resources,
  events,
  onDateChange,
  onEventMove,
  onEventClick,
  onSlotClick,
  loading = false,
  busyIds,
  dayStartHour = 7,
  dayEndHour = 19,
  slotMinutes = 15,
  slotHeight = 12,
}: SchedulerProps) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Suppresses the click that follows a drag, so moving never also opens. */
  const draggedRef = useRef(false);

  const totalMin = (dayEndHour - dayStartHour) * 60;
  const pxPerMin = slotHeight / slotMinutes;
  const gridHeight = totalMin * pxPerMin;

  const hours = useMemo(
    () => Array.from({ length: dayEndHour - dayStartHour + 1 }, (_, i) => dayStartHour + i),
    [dayStartHour, dayEndHour],
  );

  /** Minutes-from-start -> an ISO instant on this day. */
  const toIso = useCallback(
    (min: number): string => {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), dayStartHour, 0, 0, 0);
      d.setMinutes(d.getMinutes() + min);
      // Always an explicit instant: Knack reads a naive time as the *app's*
      // timezone, so sending local wall-clock would shift every appointment
      // for anyone outside it.
      return d.toISOString();
    },
    [date, dayStartHour],
  );

  const snap = useCallback(
    (min: number) => Math.round(min / slotMinutes) * slotMinutes,
    [slotMinutes],
  );

  /** Which column and minute the pointer is over. */
  const hitTest = useCallback(
    (clientX: number, clientY: number) => {
      const grid = gridRef.current;
      if (!grid) return null;
      const rect = grid.getBoundingClientRect();
      const min = (clientY - rect.top) / pxPerMin;
      const colWidth = rect.width / Math.max(resources.length, 1);
      const index = Math.min(
        Math.max(Math.floor((clientX - rect.left) / colWidth), 0),
        resources.length - 1,
      );
      return { min, resourceId: resources[index]?.id ?? '' };
    },
    [pxPerMin, resources],
  );

  const beginDrag = (
    e: React.PointerEvent,
    event: SchedulerEvent,
    mode: 'move' | 'resize',
  ) => {
    if (!onEventMove) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    draggedRef.current = false;

    const startMin = minutesFromStart(event.start, date, dayStartHour);
    const endMin = minutesFromStart(event.end, date, dayStartHour);
    const hit = hitTest(e.clientX, e.clientY);

    setDrag({
      id: event.id,
      mode,
      grabOffsetMin: hit ? hit.min - startMin : 0,
      startMin,
      endMin,
      resourceId: event.resourceId,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    draggedRef.current = true;

    setDrag((d) => {
      if (!d) return d;
      if (d.mode === 'resize') {
        // Never shorter than one slot — a zero-height block cannot be grabbed
        // again to fix.
        const end = Math.max(snap(hit.min), d.startMin + slotMinutes);
        return { ...d, endMin: Math.min(end, totalMin) };
      }
      const length = d.endMin - d.startMin;
      let start = snap(hit.min - d.grabOffsetMin);
      start = Math.max(0, Math.min(start, totalMin - length));
      return { ...d, startMin: start, endMin: start + length, resourceId: hit.resourceId };
    });
  };

  const endDrag = () => {
    if (!drag) return;
    if (draggedRef.current && onEventMove) {
      onEventMove({
        id: drag.id,
        start: toIso(drag.startMin),
        end: toIso(drag.endMin),
        resourceId: drag.resourceId,
      });
    }
    setDrag(null);
  };

  /** Events for one column, with side-by-side lanes where they overlap. */
  const laidOut = useMemo(() => {
    const byResource = new Map<string, Array<SchedulerEvent & { lane: number; lanes: number }>>();

    for (const resource of resources) {
      const list = events
        .filter((e) => e.resourceId === resource.id)
        .sort((a, b) => a.start.localeCompare(b.start));

      // Greedy lane packing: an event takes the first lane whose last event has
      // finished. Two appointments at the same time sit beside each other
      // rather than hiding one another.
      const laneEnds: number[] = [];
      const placed = list.map((e) => {
        const s = minutesFromStart(e.start, date, dayStartHour);
        const en = minutesFromStart(e.end, date, dayStartHour);
        let lane = laneEnds.findIndex((end) => end <= s);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(en);
        } else {
          laneEnds[lane] = en;
        }
        return { ...e, lane, lanes: 1 };
      });
      const lanes = Math.max(laneEnds.length, 1);
      byResource.set(resource.id, placed.map((p) => ({ ...p, lanes })));
    }
    return byResource;
  }, [events, resources, date, dayStartHour]);

  const dayLabel = date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const shiftDays = (n: number) =>
    onDateChange(new Date(date.getFullYear(), date.getMonth(), date.getDate() + n));

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-steel-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-steel-900" aria-live="polite">
          {dayLabel}
        </h2>
        <div className="flex items-center gap-2">
          <Button size="sm" aria-label="Previous day" onClick={() => shiftDays(-1)}>
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="sm" onClick={() => onDateChange(new Date())}>
            Today
          </Button>
          <Button size="sm" aria-label="Next day" onClick={() => shiftDays(1)}>
            <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {resources.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-steel-500">
          No one to schedule. Assign a role of liaison to a user first.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-max">
            {/* Time axis */}
            <div className="w-16 shrink-0 border-r border-steel-200 pt-8">
              {hours.slice(0, -1).map((h) => (
                <div
                  key={h}
                  style={{ height: 60 * pxPerMin }}
                  className="relative -top-2 pr-2 text-right text-xs text-steel-400"
                >
                  {new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })}
                </div>
              ))}
            </div>

            <div className="flex-1">
              {/* Column headers */}
              <div className="flex h-8 border-b border-steel-200">
                {resources.map((r) => (
                  <div
                    key={r.id}
                    className="min-w-40 flex-1 truncate border-r border-steel-100 px-2 text-xs font-medium leading-8 text-steel-700 last:border-r-0"
                    title={r.label}
                  >
                    {r.label}
                  </div>
                ))}
              </div>

              <div
                ref={gridRef}
                className="relative flex"
                style={{ height: gridHeight }}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-busy={loading || undefined}
              >
                {resources.map((resource) => (
                  <div
                    key={resource.id}
                    className="relative min-w-40 flex-1 border-r border-steel-100 last:border-r-0"
                    onClick={(e) => {
                      if (!onSlotClick || draggedRef.current) return;
                      const hit = hitTest(e.clientX, e.clientY);
                      if (!hit) return;
                      const start = snap(hit.min);
                      onSlotClick({
                        start: toIso(start),
                        end: toIso(start + 60),
                        resourceId: resource.id,
                      });
                    }}
                  >
                    {/* Hour lines. Recessive: the data is the loud part. */}
                    {hours.slice(1, -1).map((h) => (
                      <div
                        key={h}
                        className="pointer-events-none absolute inset-x-0 border-t border-steel-100"
                        style={{ top: (h - dayStartHour) * 60 * pxPerMin }}
                      />
                    ))}

                    {(laidOut.get(resource.id) ?? []).map((event) => {
                      const dragging = drag?.id === event.id;
                      const startMin = dragging
                        ? drag!.startMin
                        : minutesFromStart(event.start, date, dayStartHour);
                      const endMin = dragging
                        ? drag!.endMin
                        : minutesFromStart(event.end, date, dayStartHour);
                      // While dragging between columns, the block follows the
                      // pointer's column rather than its stored one.
                      if (dragging && drag!.resourceId !== resource.id) return null;

                      const width = 100 / event.lanes;
                      return (
                        <div
                          key={event.id}
                          role="button"
                          tabIndex={0}
                          onPointerDown={(e) => beginDrag(e, event, 'move')}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!draggedRef.current) onEventClick?.(event);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onEventClick?.(event);
                            }
                          }}
                          className={cx(
                            'absolute overflow-hidden rounded border px-1.5 py-0.5 text-xs shadow-sm',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                            TONE_CLASSES[event.tone ?? 'info'],
                            dragging ? 'z-20 cursor-grabbing opacity-90 shadow-md' : 'cursor-grab',
                            // Saving is signalled by the spinner, not by fading
                            // the block out — a half-transparent appointment
                            // reads as cancelled rather than as in progress.
                            busyIds?.has(event.id) && 'ring-1 ring-brand-400',
                          )}
                          style={{
                            top: startMin * pxPerMin,
                            height: Math.max((endMin - startMin) * pxPerMin, 16),
                            left: `${event.lane * width}%`,
                            width: `calc(${width}% - 2px)`,
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {event.label}
                            </span>
                            {busyIds?.has(event.id) && (
                              <Spinner size="sm" label={`Saving ${event.label}`} />
                            )}
                          </div>
                          <div className="truncate opacity-75">
                            {timeLabel(new Date(dragging ? toIso(startMin) : event.start))}
                            {event.sublabel ? ` · ${event.sublabel}` : ''}
                          </div>

                          {onEventMove && (
                            <div
                              onPointerDown={(e) => beginDrag(e, event, 'resize')}
                              className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
