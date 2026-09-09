import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Spinner } from './primitives.js';
import { cx } from './primitives.js';

/**
 * A resource board: a finite pool on the left, the things it gets committed to
 * on the right, and dragging between them.
 *
 * The hard part of a resource scheduler is not the dragging, it is arithmetic
 * nobody can see. Forty chairs and two vans exist whether or not the screen
 * says so, and the failure this exists to prevent is two people committing the
 * same van to two places at once. So the pool always shows what is *left*, not
 * what is owned, and an over-commitment is refused at the point of the drop
 * with the reason — never accepted quietly to be discovered on the day.
 *
 * Availability is computed against overlapping targets only. A van booked for
 * a morning event is free in the afternoon; a room booked all day is not. That
 * is why targets carry a time range rather than only a date.
 */
export interface BoardResource {
  id: string;
  name: string;
  /** Groups the pool — Staff, Room, Vehicle. */
  group: string;
  /** How many exist in total. */
  total: number;
  /** Out of service, on leave: present in the list, refused on drop. */
  unavailable?: boolean;
  meta?: string;
}

export interface BoardAssignment {
  id: string;
  resourceId: string;
  targetId: string;
  quantity: number;
  label?: string;
}

export interface BoardTarget {
  id: string;
  title: string;
  subtitle?: string;
  /** ISO. Overlap against these decides what is still available. */
  start: string;
  end: string;
  tone?: 'default' | 'muted';
}

export interface ResourceBoardProps {
  resources: BoardResource[];
  targets: BoardTarget[];
  assignments: BoardAssignment[];
  /**
   * Returning a promise is worth doing: the board shows the resource sitting in
   * the target, greyed with a spinner, until it settles. Without that the drop
   * looks like it did nothing until the refetch lands.
   */
  onAssign: (change: {
    resourceId: string;
    targetId: string;
    quantity: number;
  }) => void | Promise<unknown>;
  onChangeQuantity?: (assignmentId: string, quantity: number) => void;
  onUnassign?: (assignmentId: string) => void;
  onTargetClick?: (targetId: string) => void;
  /**
   * The event availability is being judged against.
   *
   * This is not a convenience. "How many are free" has no answer without it: a
   * room booked on Thursday is free on Tuesday, so a single number for a whole
   * week is either wrong or meaningless. With an event chosen the pool answers
   * for that event's window; without one it can only say how many exist.
   */
  focusedTargetId?: string | null;
  onFocusTarget?: (targetId: string | null) => void;
  /** Ids with a write in flight. */
  busyIds?: ReadonlySet<string>;
  emptyTargets?: ReactNode;
}

const overlaps = (a: BoardTarget, b: BoardTarget) =>
  new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end);

export const ResourceBoard = ({
  resources,
  targets,
  assignments,
  onAssign,
  onChangeQuantity,
  onUnassign,
  onTargetClick,
  busyIds,
  emptyTargets,
  focusedTargetId,
  onFocusTarget,
}: ResourceBoardProps) => {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  /** Where the pointer is, so the dragged card can follow it. */
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  /** Drops that have been made but not yet confirmed by the server. */
  const [placing, setPlacing] = useState<
    Array<{ key: string; resourceId: string; targetId: string }>
  >([]);
  const targetEls = useRef(new Map<string, HTMLElement | null>());

  const byTarget = useMemo(() => {
    const map = new Map<string, BoardAssignment[]>();
    for (const a of assignments) {
      const list = map.get(a.targetId);
      if (list) list.push(a);
      else map.set(a.targetId, [a]);
    }
    return map;
  }, [assignments]);

  /**
   * The most of a resource committed at any one moment, across everything that
   * overlaps the given target. Not a simple sum: two events on the same day
   * that do not overlap can each use the same van.
   */
  const peakUse = (resourceId: string, target: BoardTarget, ignore?: string) => {
    let peak = 0;
    for (const other of targets) {
      if (!overlaps(other, target)) continue;
      const used = (byTarget.get(other.id) ?? [])
        .filter((a) => a.resourceId === resourceId && a.id !== ignore)
        .reduce((sum, a) => sum + a.quantity, 0);
      peak = Math.max(peak, used);
    }
    return peak;
  };

  const focused = focusedTargetId ? (targets.find((t) => t.id === focusedTargetId) ?? null) : null;

  /**
   * What is left of a resource — for the chosen event, and only for it.
   *
   * The previous version took the largest number committed to any single event
   * in the week, which meant a room booked once on Thursday read as "0 free"
   * all week and was folded away as unavailable. It was free every other day.
   * A pool number is only true relative to a moment, so with no event chosen
   * this reports how many exist and nothing is treated as depleted.
   */
  const remaining = (resource: BoardResource) =>
    focused ? resource.total - peakUse(resource.id, focused) : resource.total;

  const attempt = (resourceId: string, target: BoardTarget) => {
    const resource = resources.find((r) => r.id === resourceId);
    if (!resource) return;

    if (resource.unavailable) {
      setRefusal(`${resource.name} is not available to be assigned.`);
      return;
    }

    const already = (byTarget.get(target.id) ?? []).find((a) => a.resourceId === resourceId);
    const inUse = peakUse(resourceId, target, already?.id);
    const wanted = (already?.quantity ?? 0) + 1;

    if (inUse + wanted > resource.total) {
      /*
       * Refused with the arithmetic, not just "no". "All 2 vans are committed
       * to something overlapping this" is actionable; "cannot assign" sends
       * someone hunting through other screens for the reason.
       */
      setRefusal(
        `All ${resource.total} of ${resource.name} ${resource.total === 1 ? 'is' : 'are'} already committed to something overlapping ${target.title}.`,
      );
      return;
    }

    setRefusal(null);

    if (already && onChangeQuantity) {
      onChangeQuantity(already.id, wanted);
      return;
    }

    /*
     * Shown in place immediately, with a spinner, and cleared only when the
     * caller's write settles. A drop that produces nothing on screen until a
     * refetch arrives reads as a drop that did not work, and the second attempt
     * is how duplicates get made.
     */
    const key = `placing:${resourceId}:${target.id}:${Date.now()}`;
    setPlacing((prev) => [...prev, { key, resourceId, targetId: target.id }]);
    void Promise.resolve(onAssign({ resourceId, targetId: target.id, quantity: 1 })).finally(() =>
      setPlacing((prev) => prev.filter((p) => p.key !== key)),
    );
  };

  /*
   * Anything fully committed drops out of its category and into "Assigned",
   * which is closed to begin with. The pool is a list of what can still be
   * used; a dozen greyed rows for things that cannot be dragged anywhere is
   * noise between the reader and the ones that can.
   *
   * Out of service is deliberately not the same thing and stays where it is:
   * it has not been assigned to anything, and filing it under "Assigned" would
   * say something untrue about where the van went.
   */
  const { groups, spent } = useMemo(() => {
    const map = new Map<string, BoardResource[]>();
    const used: BoardResource[] = [];
    for (const r of resources) {
      // Only meaningful once an event is chosen: without one there is no moment
      // to be depleted at, and folding things away would hide what is free.
      if (focused && !r.unavailable && remaining(r) <= 0) {
        used.push(r);
        continue;
      }
      const list = map.get(r.group);
      if (list) list.push(r);
      else map.set(r.group, [r]);
    }
    return { groups: [...map.entries()], spent: used };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, assignments, targets, focusedTargetId]);

  const [assignedOpen, setAssignedOpen] = useState(false);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setPointer({ x: e.clientX, y: e.clientY });
    let hit: string | null = null;
    for (const target of targets) {
      const el = targetEls.current.get(target.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        hit = target.id;
        break;
      }
    }
    setOver(hit);
  };

  const endDrag = () => {
    if (dragging && over) {
      const target = targets.find((t) => t.id === over);
      if (target) attempt(dragging, target);
    }
    setDragging(null);
    setOver(null);
    setPointer(null);
  };

  return (
    <div
      className="flex flex-col gap-4 lg:flex-row"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/*
        The card being dragged, following the pointer. Fixed to the viewport and
        inert, so it never becomes its own drop target or blocks the one
        underneath. Without it a drag is invisible: the pool item dims and
        nothing else moves, which does not read as carrying anything.
      */}
      {dragging && pointer && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-brand-400 bg-white px-2.5 py-2 text-sm font-medium text-steel-800 shadow-lg"
          style={{ left: pointer.x, top: pointer.y }}
        >
          {resources.find((r) => r.id === dragging)?.name ?? 'Resource'}
        </div>
      )}

      {/* The pool */}
      <div className="lg:w-72 lg:shrink-0">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-steel-900">Resources</h2>
          {/*
            The label has to change with the question. "Still free" is a lie
            when no event is chosen — free *when*? — so it says what it can.
          */}
          {focused ? (
            <p className="mt-0.5 text-xs text-steel-500">
              Free during{' '}
              <span className="font-medium text-steel-700">{focused.title}</span>. Drag one over.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-steel-500">
              How many exist. Choose an event to see what is free at that time.
            </p>
          )}

          <div className="mt-3 space-y-4">
            {groups.length === 0 && (
              <p className="text-sm text-steel-500">No resources have been set up yet.</p>
            )}

            {groups.length === 0 && spent.length > 0 && (
              <p className="text-sm text-steel-500">
                Everything is committed. Open “Assigned” below to see where.
              </p>
            )}

            {groups.map(([group, list]) => (
              <div key={group}>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-steel-400">
                  {group}
                </h3>
                <ul className="space-y-1.5">
                  {list.map((resource) => {
                    const left = remaining(resource);
                    const none = left <= 0 || resource.unavailable;
                    return (
                      <li key={resource.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`${resource.name}, ${left} of ${resource.total} free`}
                          onPointerDown={(e) => {
                            if (none) return;
                            e.preventDefault();
                            (e.currentTarget.closest('div[class*="flex-col"]') as HTMLElement | null)
                              ?.setPointerCapture?.(e.pointerId);
                            setDragging(resource.id);
                            setRefusal(null);
                          }}
                          className={cx(
                            'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-sm',
                            none
                              ? 'cursor-not-allowed border-steel-200 bg-steel-50 text-steel-400'
                              : 'cursor-grab border-steel-300 bg-white text-steel-800 hover:border-brand-400 hover:bg-brand-50/40',
                            dragging === resource.id && 'opacity-50 ring-2 ring-brand-400',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{resource.name}</span>
                            {resource.meta && (
                              <span className="block truncate text-xs text-steel-500">
                                {resource.meta}
                              </span>
                            )}
                          </span>
                          <span
                            className={cx(
                              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                              none ? 'bg-steel-200 text-steel-500' : 'bg-brand-100 text-brand-700',
                            )}
                          >
                            {left}/{resource.total}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {spent.length > 0 && (
              <div className="border-t border-steel-200 pt-3">
                <button
                  type="button"
                  onClick={() => setAssignedOpen((open) => !open)}
                  aria-expanded={assignedOpen}
                  className="flex w-full items-center gap-1.5 rounded text-xs font-medium uppercase tracking-wide text-steel-500 hover:text-steel-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {assignedOpen ? (
                    <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                  Assigned
                  <span className="font-normal normal-case tabular-nums text-steel-400">
                    ({spent.length})
                  </span>
                </button>

                {assignedOpen && (
                  <ul className="mt-2 space-y-1.5">
                    {spent.map((resource) => (
                      <li
                        key={resource.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-steel-200 bg-steel-50 px-2.5 py-2 text-sm text-steel-500"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{resource.name}</span>
                          <span className="block truncate text-xs">{resource.group}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-steel-200 px-2 py-0.5 text-xs font-medium tabular-nums">
                          0/{resource.total}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The targets */}
      <div className="min-w-0 flex-1">
        {refusal && (
          <p
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {refusal}
          </p>
        )}

        {targets.length === 0 && emptyTargets}

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {targets.map((target) => {
            const placed = byTarget.get(target.id) ?? [];
            const placedByGroup = (() => {
              const map = new Map<string, BoardAssignment[]>();
              for (const a of placed) {
                const group = resources.find((r) => r.id === a.resourceId)?.group ?? 'Other';
                const list = map.get(group);
                if (list) list.push(a);
                else map.set(group, [a]);
              }
              return [...map.entries()];
            })();
            return (
              <div
                key={target.id}
                ref={(el) => {
                  targetEls.current.set(target.id, el);
                }}
                className={cx(
                  'rounded-lg bg-white p-4 shadow-sm transition-colors',
                  target.tone === 'muted' && 'opacity-70',
                  focusedTargetId === target.id && 'ring-2 ring-brand-500',
                  over === target.id && 'ring-2 ring-brand-500',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {/*
                      Selecting the event is the primary act here, because the
                      pool cannot answer anything until one is chosen. Opening
                      the record is the secondary one and gets its own link.
                    */}
                    <button
                      type="button"
                      onClick={() =>
                        onFocusTarget?.(focusedTargetId === target.id ? null : target.id)
                      }
                      aria-pressed={focusedTargetId === target.id}
                      className="truncate text-left text-sm font-semibold text-steel-900 hover:text-brand-700"
                    >
                      {target.title}
                    </button>
                    {target.subtitle && (
                      <p className="truncate text-xs text-steel-500">{target.subtitle}</p>
                    )}
                    {onTargetClick && (
                      <button
                        type="button"
                        onClick={() => onTargetClick(target.id)}
                        className="mt-0.5 text-xs font-medium text-brand-600 hover:underline"
                      >
                        Open event →
                      </button>
                    )}
                  </div>

                  {focusedTargetId === target.id && (
                    <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                      Availability shown
                    </span>
                  )}
                </div>

                <ul className="mt-3 space-y-1.5">
                  {placed.length === 0 && placing.every((p) => p.targetId !== target.id) && (
                    <li className="rounded border border-dashed border-steel-300 px-2.5 py-3 text-center text-xs text-steel-400">
                      Drag a resource here
                    </li>
                  )}

                  {placing
                    .filter((p) => p.targetId === target.id)
                    .map((p) => (
                      <li
                        key={p.key}
                        className="flex items-center gap-2 rounded border border-brand-300 bg-brand-50/50 px-2.5 py-1.5 text-sm text-steel-600"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {resources.find((r) => r.id === p.resourceId)?.name ?? 'Resource'}
                        </span>
                        <Spinner size="sm" label="Assigning" />
                      </li>
                    ))}

                  {placedByGroup.map(([group, list]) => (
                    <li key={group}>
                      {/* The category, so a long list reads as "two vans and a
                          room" rather than as ten unrelated lines. */}
                      <p className="mb-1 mt-1 text-xs font-medium uppercase tracking-wide text-steel-400">
                        {group}
                      </p>
                      <ul className="space-y-1.5">
                        {list.map((assignment) => {
                    const resource = resources.find((r) => r.id === assignment.resourceId);
                    const busy = busyIds?.has(assignment.id);
                    return (
                      <li
                        key={assignment.id}
                        className={cx(
                          'flex items-center gap-2 rounded border border-steel-200 px-2.5 py-1.5 text-sm',
                          busy && 'opacity-60',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {resource?.name ?? assignment.label ?? 'Resource'}
                        </span>

                        {onChangeQuantity && (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label="One fewer"
                              disabled={busy}
                              onClick={() =>
                                assignment.quantity <= 1
                                  ? onUnassign?.(assignment.id)
                                  : onChangeQuantity(assignment.id, assignment.quantity - 1)
                              }
                              className="rounded px-1.5 text-steel-500 hover:bg-steel-100 disabled:opacity-40"
                            >
                              −
                            </button>
                            <span className="w-6 text-center tabular-nums">
                              {assignment.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="One more"
                              disabled={busy}
                              onClick={() => {
                                const resourceDef = resources.find(
                                  (r) => r.id === assignment.resourceId,
                                );
                                if (!resourceDef) return;
                                const inUse = peakUse(assignment.resourceId, target, assignment.id);
                                if (inUse + assignment.quantity + 1 > resourceDef.total) {
                                  setRefusal(
                                    `There are only ${resourceDef.total} of ${resourceDef.name}.`,
                                  );
                                  return;
                                }
                                setRefusal(null);
                                onChangeQuantity(assignment.id, assignment.quantity + 1);
                              }}
                              className="rounded px-1.5 text-steel-500 hover:bg-steel-100 disabled:opacity-40"
                            >
                              +
                            </button>
                          </span>
                        )}

                        {onUnassign && (
                          <button
                            type="button"
                            aria-label={`Remove ${resource?.name ?? 'resource'}`}
                            disabled={busy}
                            onClick={() => onUnassign(assignment.id)}
                            className="rounded p-0.5 text-steel-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          >
                            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
