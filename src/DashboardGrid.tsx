import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  EllipsisVerticalIcon,
  MinusSmallIcon,
  PlusIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import { cx } from './primitives.js';

/**
 * A dashboard the reader arranges themselves.
 *
 * Twelve columns and a fixed row height, with each card claiming a number of
 * each. That is a deliberate limit: a free-floating canvas needs a collision
 * solver, and every one of those has a day where two cards end up on top of
 * each other and the reader cannot get them apart. A card here is always
 * somewhere in reading order, so a move is a reorder and a resize is two
 * numbers — both of which survive being reloaded on a different screen.
 *
 * Below the breakpoint every card is full width and the controls are gone. A
 * twelve-column grid on a phone is not a grid, and dragging a card into place
 * on one is not something anybody wants to do.
 */
export interface DashboardCard {
  id: string;
  /** Columns out of twelve. */
  span: number;
  /** Rows, each `ROW_HEIGHT` tall. */
  height: number;
}

export interface HiddenCard {
  id: string;
  title: string;
}

export interface DashboardGridProps {
  cards: DashboardCard[];
  /** Cards taken off the dashboard, offered under the plus. */
  hidden?: HiddenCard[];
  /** The card's contents. */
  render: (id: string) => ReactNode;
  /** Used in the controls' labels, so they name the card they act on. */
  title: (id: string) => string;
  onChange?: (cards: DashboardCard[]) => void;
  onRemove?: (id: string) => void;
  onAdd?: (id: string) => void;
  /** Offers "New card" under the plus. */
  onCreate?: () => void;
  onReset?: () => void;
}

const COLUMNS = 12;
const ROW_HEIGHT = 72;
const GAP = 16;
const MIN_SPAN = 3;
const MIN_HEIGHT = 1;
const MAX_HEIGHT = 10;

export const DashboardGrid = ({
  cards,
  hidden = [],
  render,
  title,
  onChange,
  onRemove,
  onAdd,
  onCreate,
  onReset,
}: DashboardGridProps) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement | null>());
  const [addOpen, setAddOpen] = useState(false);

  const [move, setMove] = useState<{ id: string; index: number } | null>(null);
  const [resize, setResize] = useState<{ id: string; span: number; height: number } | null>(null);

  /*
   * The controls only exist on a screen wide enough to arrange things on.
   * Checked with matchMedia rather than a CSS class because the drag maths
   * needs to know too — there is nothing to drag a card into when every card
   * is full width.
   */
  const [arrangeable, setArrangeable] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const sync = () => setArrangeable(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const canArrange = arrangeable && Boolean(onChange);

  /** Where a card dropped here would land, in reading order. */
  const indexAt = (x: number, y: number) => {
    let index = 0;
    cards.forEach((card, i) => {
      const el = cardEls.current.get(card.id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Below the card entirely, or level with it and past its middle.
      const before = y > r.bottom ? true : y < r.top ? false : x > r.left + r.width / 2;
      if (before) index = i + 1;
    });
    return index;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (move) {
      setMove({ ...move, index: indexAt(e.clientX, e.clientY) });
      return;
    }
    if (resize) {
      const el = cardEls.current.get(resize.id);
      const grid = gridRef.current;
      if (!el || !grid) return;
      const cardRect = el.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const columnWidth = (gridRect.width + GAP) / COLUMNS;
      setResize({
        ...resize,
        span: Math.min(
          COLUMNS,
          Math.max(MIN_SPAN, Math.round((e.clientX - cardRect.left + GAP) / columnWidth)),
        ),
        height: Math.min(
          MAX_HEIGHT,
          Math.max(MIN_HEIGHT, Math.round((e.clientY - cardRect.top + GAP) / (ROW_HEIGHT + GAP))),
        ),
      });
    }
  };

  const endPointer = () => {
    if (move && onChange) {
      const from = cards.findIndex((c) => c.id === move.id);
      const to = move.index > from ? move.index - 1 : move.index;
      if (from !== -1 && to !== from) {
        const next = [...cards];
        const [lifted] = next.splice(from, 1);
        next.splice(to, 0, lifted!);
        onChange(next);
      }
    }
    if (resize && onChange) {
      onChange(
        cards.map((c) =>
          c.id === resize.id ? { ...c, span: resize.span, height: resize.height } : c,
        ),
      );
    }
    setMove(null);
    setResize(null);
  };

  const preview = useMemo(() => {
    if (!move) return cards;
    const from = cards.findIndex((c) => c.id === move.id);
    if (from === -1) return cards;
    const to = move.index > from ? move.index - 1 : move.index;
    const next = [...cards];
    const [lifted] = next.splice(from, 1);
    next.splice(to, 0, lifted!);
    return next;
  }, [cards, move]);

  return (
    <div>
      {(onAdd || onCreate || onReset) && (
        <div className="mb-3 flex justify-end">
          <div className="relative">
            <button
              type="button"
              onClick={() => setAddOpen((open) => !open)}
              aria-expanded={addOpen}
              title="Add a card"
              className="inline-flex items-center gap-1.5 rounded-lg border border-steel-300 bg-white px-3 py-1.5 text-sm text-steel-700 shadow-sm hover:bg-steel-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              Add a card
            </button>

            {addOpen && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => setAddOpen(false)}
                  className="fixed inset-0 z-20 cursor-default"
                />
                <div className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-steel-200 bg-white py-1 text-left shadow-lg">
                  {onCreate && (
                    <button
                      type="button"
                      onClick={() => {
                        setAddOpen(false);
                        onCreate();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <Squares2X2Icon className="h-4 w-4" aria-hidden="true" />
                      Build a card…
                    </button>
                  )}

                  {hidden.length > 0 && (
                    <>
                      <div className="my-1 border-t border-steel-100" />
                      <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-steel-400">
                        Put back
                      </p>
                      {hidden.map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => {
                            setAddOpen(false);
                            onAdd?.(card.id);
                          }}
                          className="block w-full px-3 py-1.5 text-left text-sm text-steel-700 hover:bg-steel-50"
                        >
                          {card.title}
                        </button>
                      ))}
                    </>
                  )}

                  {onReset && (
                    <>
                      <div className="my-1 border-t border-steel-100" />
                      <button
                        type="button"
                        onClick={() => {
                          setAddOpen(false);
                          onReset();
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm text-steel-600 hover:bg-steel-50"
                      >
                        Reset to the default dashboard
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div
        ref={gridRef}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        className="grid grid-cols-1 gap-4 md:grid-cols-12"
        style={{ gridAutoRows: arrangeable ? `${ROW_HEIGHT}px` : undefined }}
      >
        {preview.map((card) => {
          const dragging = move?.id === card.id;
          const sizing = resize?.id === card.id ? resize : null;
          const span = sizing?.span ?? card.span;
          const height = sizing?.height ?? card.height;
          const label = title(card.id);

          return (
            <div
              key={card.id}
              ref={(el) => {
                cardEls.current.set(card.id, el);
              }}
              style={
                arrangeable
                  ? { gridColumn: `span ${span}`, gridRow: `span ${height}` }
                  : undefined
              }
              className={cx(
                'group/card relative flex min-w-0 flex-col overflow-hidden rounded-lg bg-white shadow-sm',
                dragging && 'opacity-60 ring-2 ring-brand-400',
                sizing && 'ring-2 ring-brand-400',
              )}
            >
              {canArrange && (
                <div className="absolute right-1 top-1 z-10 flex items-center gap-0.5">
                  <button
                    type="button"
                    title={`Drag to move ${label}`}
                    aria-label={`Move the ${label} card`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      gridRef.current?.setPointerCapture?.(e.pointerId);
                      setMove({ id: card.id, index: cards.findIndex((c) => c.id === card.id) });
                    }}
                    className="cursor-grab touch-none rounded p-1 text-steel-400 hover:bg-steel-100 hover:text-steel-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <EllipsisVerticalIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {onRemove && (
                    <button
                      type="button"
                      title={`Remove ${label}`}
                      aria-label={`Remove the ${label} card`}
                      onClick={() => onRemove(card.id)}
                      className="rounded p-1 text-steel-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <MinusSmallIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}

              <div className="min-h-0 flex-1">{render(card.id)}</div>

              {canArrange && (
                <button
                  type="button"
                  title={`Drag to resize ${label}`}
                  aria-label={`Resize the ${label} card`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    gridRef.current?.setPointerCapture?.(e.pointerId);
                    setResize({ id: card.id, span: card.span, height: card.height });
                  }}
                  className="absolute bottom-0 right-0 z-10 cursor-nwse-resize touch-none p-1.5 text-steel-300 hover:text-steel-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {/* Three ticks, the shape everything else uses for a corner grip. */}
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
                    <path d="M9 1v8H1" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
