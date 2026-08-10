import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

/** Tiny class joiner. Not `clsx` — this is the only thing we needed from it. */
export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

// ── Buttons ─────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-steel-300',
  secondary:
    'border border-steel-300 bg-white text-steel-700 hover:bg-steel-50 disabled:bg-steel-100 disabled:text-steel-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-steel-300',
  ghost: 'text-steel-600 hover:bg-steel-100 disabled:text-steel-300',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // min-h-11 keeps touch targets usable on the field-service screens.
  sm: 'px-3 py-1.5 text-sm min-h-9',
  md: 'px-4 py-2 text-sm min-h-11 sm:min-h-10',
};

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. Every mutation should use this. */
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={cx(
      'inline-flex items-center justify-center gap-2 rounded-lg font-medium shadow-sm transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed',
      BUTTON_VARIANTS[variant],
      BUTTON_SIZES[size],
      className,
    )}
    {...rest}
  >
    {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
    {children}
  </button>
);

// ── Surfaces ────────────────────────────────────────────────────────────────

// `title` is omitted from the div props: ours is a heading node, the HTML
// attribute is a tooltip string, and the two can't coexist.
export interface CardProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
  /** Removes body padding, for a table that should meet the card edges. */
  flush?: boolean;
}

export const Card = ({ title, actions, flush, className, children, ...rest }: CardProps) => (
  <div className={cx('overflow-hidden rounded-lg bg-white shadow-sm', className)} {...rest}>
    {(title || actions) && (
      <div className="flex items-center justify-between gap-4 border-b border-steel-200 px-4 py-3 sm:px-6">
        {typeof title === 'string' ? (
          <h2 className="text-base font-medium text-steel-900">{title}</h2>
        ) : (
          title
        )}
        {actions}
      </div>
    )}
    <div className={flush ? '' : 'p-4 sm:p-6'}>{children}</div>
  </div>
);

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}

export const PageHeader = ({ title, description, breadcrumb, actions }: PageHeaderProps) => (
  <div className="mb-6">
    {breadcrumb && <div className="mb-2 text-sm text-steel-500">{breadcrumb}</div>}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold text-steel-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-steel-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  </div>
);

// ── Status ──────────────────────────────────────────────────────────────────

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-steel-100 text-steel-700',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  brand: 'bg-brand-50 text-brand-700',
};

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export const StatusBadge = ({ children, tone = 'neutral', className }: StatusBadgeProps) => (
  <span
    className={cx(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      BADGE_TONES[tone],
      className,
    )}
  >
    {children}
  </span>
);

/**
 * Build a value -> tone lookup for a Knack multiple-choice field.
 * Unlisted values fall back to neutral rather than throwing, because Knack
 * choice options can be edited in the Builder without touching the front end.
 */
export const statusTones = <T extends string>(
  map: Partial<Record<T, BadgeTone>>,
): ((value: T | string | undefined | null) => BadgeTone) => {
  return (value) => (value ? ((map as Record<string, BadgeTone>)[value] ?? 'neutral') : 'neutral');
};

// ── Empty / loading / error states ──────────────────────────────────────────

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="px-6 py-12 text-center">
    {icon && <div className="mx-auto mb-3 flex justify-center text-steel-300">{icon}</div>}
    <h3 className="text-base font-medium text-steel-900">{title}</h3>
    {description && <p className="mx-auto mt-1 max-w-md text-sm text-steel-500">{description}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cx('animate-pulse rounded bg-steel-200', className)} aria-hidden="true" />
);

export interface ErrorStateProps {
  title?: string;
  error?: { message?: string } | null;
  onRetry?: () => void;
}

export const ErrorState = ({ title = 'Something went wrong', error, onRetry }: ErrorStateProps) => (
  <div className="px-6 py-12 text-center" role="alert">
    <XCircleIcon className="mx-auto h-12 w-12 text-red-400" aria-hidden="true" />
    <h3 className="mt-3 text-base font-medium text-steel-900">{title}</h3>
    {error?.message && <p className="mx-auto mt-1 max-w-md text-sm text-steel-500">{error.message}</p>}
    {onRetry && (
      <div className="mt-4 flex justify-center">
        <Button onClick={onRetry}>Try again</Button>
      </div>
    )}
  </div>
);

// ── Stat tile ───────────────────────────────────────────────────────────────

export interface StatTileProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  /** Signed change, rendered with tone. Positive is not always good — see `invertDelta`. */
  delta?: number;
  deltaLabel?: string;
  invertDelta?: boolean;
  loading?: boolean;
}

export const StatTile = ({
  label,
  value,
  icon,
  delta,
  deltaLabel,
  invertDelta = false,
  loading = false,
}: StatTileProps) => {
  const good = delta === undefined ? null : invertDelta ? delta < 0 : delta > 0;
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-4">
        {icon && <div className="shrink-0 text-forest-500">{icon}</div>}
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold tabular-nums text-steel-900">{value}</div>
          )}
          <div className="truncate text-sm text-steel-500">{label}</div>
        </div>
      </div>
      {delta !== undefined && !loading && (
        <div
          className={cx(
            'mt-2 text-xs font-medium tabular-nums',
            good === null ? 'text-steel-500' : good ? 'text-green-700' : 'text-red-700',
          )}
        >
          {delta > 0 ? '+' : ''}
          {delta}
          {deltaLabel ? ` ${deltaLabel}` : ''}
        </div>
      )}
    </div>
  );
};

// ── Icons used by dialogs, kept together so tone and icon never drift ───────

export const TONE_ICONS = {
  success: { Icon: CheckCircleIcon, className: 'text-green-600' },
  error: { Icon: XCircleIcon, className: 'text-red-600' },
  warning: { Icon: ExclamationTriangleIcon, className: 'text-amber-600' },
  info: { Icon: InformationCircleIcon, className: 'text-blue-600' },
} as const;

export type DialogTone = keyof typeof TONE_ICONS;
