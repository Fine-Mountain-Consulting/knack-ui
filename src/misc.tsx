import { useState, type ReactNode } from 'react';
import { cx } from './primitives.js';

// ── Tabs ────────────────────────────────────────────────────────────────────

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Underline tabs. `active`/`onChange` are controlled so the caller can bind
 * them to a URL search param — a refresh should not throw the user back to
 * the first tab.
 */
export const Tabs = ({ tabs, active, onChange, className }: TabsProps) => (
  <div className={cx('border-b border-steel-200', className)}>
    <nav className="-mb-px flex gap-6 overflow-x-auto" role="tablist">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cx(
              'flex shrink-0 items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              selected
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-steel-500 hover:border-steel-300 hover:text-steel-700',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cx(
                  'rounded-full px-2 py-0.5 text-xs tabular-nums',
                  selected ? 'bg-brand-50 text-brand-700' : 'bg-steel-100 text-steel-600',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  </div>
);

// ── RecordDetail ────────────────────────────────────────────────────────────

export interface DetailItem {
  label: string;
  value: ReactNode;
  /** Spans both columns. For addresses and long notes. */
  wide?: boolean;
}

export const RecordDetail = ({ items }: { items: DetailItem[] }) => (
  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
    {items.map((item) => (
      <div key={item.label} className={item.wide ? 'sm:col-span-2' : undefined}>
        <dt className="text-xs font-medium uppercase tracking-wide text-steel-500">
          {item.label}
        </dt>
        <dd className="mt-0.5 text-sm text-steel-900">
          {item.value === null || item.value === undefined || item.value === '' ? (
            <span className="text-steel-400">—</span>
          ) : (
            item.value
          )}
        </dd>
      </div>
    ))}
  </dl>
);

// ── SearchInput ─────────────────────────────────────────────────────────────

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export const SearchInput = ({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  ...rest
}: SearchInputProps) => (
  <input
    type="search"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    aria-label={rest['aria-label'] ?? placeholder}
    className={cx(
      'block w-full rounded-lg border border-steel-300 bg-white px-3 py-2 text-sm shadow-sm',
      'placeholder:text-steel-400 focus:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
      className,
    )}
  />
);

// ── Toast ───────────────────────────────────────────────────────────────────

export interface ToastMessage {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

/**
 * Minimal toast state. Deliberately not a context provider — a page owns its
 * own feedback, and a global toast bus makes it hard to tell which mutation
 * produced which message.
 */
export const useToasts = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const push = (message: string, tone: ToastMessage['tone'] = 'success') => {
    // Date.now() would collide when two mutations settle in the same tick.
    const id = Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  };

  return { toasts, push, dismiss: (id: number) => setToasts((p) => p.filter((t) => t.id !== id)) };
};

export const ToastRegion = ({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) => (
  <div
    aria-live="polite"
    className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
  >
    {toasts.map((toast) => (
      <button
        key={toast.id}
        type="button"
        onClick={() => onDismiss(toast.id)}
        className={cx(
          'pointer-events-auto max-w-sm rounded-lg px-4 py-3 text-left text-sm shadow-lg',
          toast.tone === 'success' ? 'bg-steel-900 text-white' : 'bg-red-600 text-white',
        )}
      >
        {toast.message}
      </button>
    ))}
  </div>
);
