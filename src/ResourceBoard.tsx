import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';
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
  onAssign: (change: { resourceId: string; targetId: string; quantity: number }) => void;
  onChangeQuantity?: (assignmentId: string, quantity: number) => void;
  onUnassign?: (assignmentId: string) => void;
  onTargetClick?: (targetId: string) => void;
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
}: ResourceBoardProps) => {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
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

  /** What is left of a resource across the whole board, for the pool label. */
  const remaining = (resource: BoardResource) => {
    let peak = 0;
    for (const target of targets) {
      const used = (byTarget.get(target.id) ?? [])
        .filter((a) => a.resourceId === resource.id)
        .reduce((sum, a) => sum + a.quantity, 0);
      peak = Math.max(peak, used);
    }
    return resource.total - peak;
  };

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
    if (already && onChangeQuantity) onChangeQuantity(already.id, wanted);
    else onAssign({ resourceId, targetId: target.id, quantity: 1 });
  };

  const groups = useMemo(() => {
    const map = new Map<string, BoardResource[]>();
    for (const r of resources) {
      const list = map.get(r.group);
      if (list) list.push(r);
      else map.set(r.group, [r]);
    }
    return [...map.entries()];
  }, [resources]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
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
  };

  return (
    <div
      className="flex flex-col gap-4 lg:flex-row"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* The pool */}
      <div className="lg:w-72 lg:shrink-0">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-steel-900">Resources</h2>
          <p className="mt-0.5 text-xs text-steel-500">
            Drag onto an event. The number is what is still free.
          </p>

          <div className="mt-3 space-y-4">
            {groups.length === 0 && (
              <p className="text-sm text-steel-500">No resources have been set up yet.</p>
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
            return (
              <div
                key={target.id}
                ref={(el) => {
                  targetEls.current.set(target.id, el);
                }}
                className={cx(
                  'rounded-lg bg-white p-4 shadow-sm transition-colors',
                  target.tone === 'muted' && 'opacity-70',
                  over === target.id && 'ring-2 ring-brand-500',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onTargetClick?.(target.id)}
                      className="truncate text-left text-sm font-semibold text-steel-900 hover:text-brand-700 hover:underline"
                    >
                      {target.title}
                    </button>
                    {target.subtitle && (
                      <p className="truncate text-xs text-steel-500">{target.subtitle}</p>
                    )}
                  </div>
                </div>

                <ul className="mt-3 space-y-1.5">
                  {placed.length === 0 && (
                    <li className="rounded border border-dashed border-steel-300 px-2.5 py-3 text-center text-xs text-steel-400">
                      Drag a resource here
                    </li>
                  )}

                  {placed.map((assignment) => {
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
