import { Fragment, useState, type ComponentType, type ReactNode } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, Transition, TransitionChild } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { cx } from './primitives.js';

export interface NavItem {
  label: string;
  to: string;
  icon?: ComponentType<{ className?: string }>;
  /** Only shown when the user holds one of these app roles. */
  roles?: string[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export interface AppShellProps {
  /** Product or client name shown in the sidebar. */
  brand: ReactNode;
  sections: NavSection[];
  /** The current user's app roles. Nav is filtered against these. */
  roles?: string[];
  /** Route matcher. Pass `(to) => location.pathname.startsWith(to)`. */
  isActive: (to: string) => boolean;
  /** Renders a link. Injected so the package doesn't depend on a router. */
  renderLink: (props: {
    to: string;
    active: boolean;
    className: string;
    children: ReactNode;
    onNavigate: () => void;
  }) => ReactNode;
  /** User menu, sign-out, etc. */
  userMenu?: ReactNode;
  /**
   * The "Developed by Fine Mountain Consulting" footer. On by default, so it
   * cannot be forgotten; set false only where a contract white-labels the app,
   * which makes removing it an explicit line in that client's repo rather than
   * something that quietly never appeared.
   */
  attribution?: boolean;
  children: ReactNode;
}

const linkClass = (active: boolean): string =>
  cx(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    active
      ? 'bg-brand-50 text-brand-700'
      : 'text-steel-600 hover:bg-steel-100 hover:text-steel-900',
  );

/**
 * Authenticated shell: fixed sidebar on desktop, drawer on mobile.
 *
 * Nav filtering is presentation only. Knack refuses the underlying data for a
 * role that shouldn't see it, so a hidden link is convenience, not a control.
 */
export const AppShell = ({
  brand,
  sections,
  roles = [],
  isActive,
  renderLink,
  userMenu,
  children,
  attribution = true,
}: AppShellProps) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visible = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.roles || item.roles.some((role) => roles.includes(role)),
      ),
    }))
    .filter((section) => section.items.length > 0);

  const nav = (onNavigate: () => void) => (
    <nav className="flex-1 space-y-6 px-3 py-4">
      {visible.map((section, index) => (
        <div key={section.label ?? index}>
          {section.label && (
            <h2 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-steel-400">
              {section.label}
            </h2>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item.to);
              const Icon = item.icon;
              return (
                <Fragment key={item.to}>
                  {renderLink({
                    to: item.to,
                    active,
                    className: linkClass(active),
                    onNavigate,
                    children: (
                      <>
                        {Icon && <Icon className="h-5 w-5 shrink-0" />}
                        <span className="truncate">{item.label}</span>
                      </>
                    ),
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-steel-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-1 flex-col border-r border-steel-200 bg-white">
          <div className="flex h-16 shrink-0 items-center px-5 font-semibold text-steel-900">
            {brand}
          </div>
          {nav(() => undefined)}
        </div>
      </div>

      {/* Mobile drawer */}
      <Transition show={drawerOpen} as={Fragment}>
        <Dialog onClose={setDrawerOpen} className="relative z-50 lg:hidden">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-150"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <DialogBackdrop className="fixed inset-0 bg-steel-900/40" />
          </TransitionChild>
          <TransitionChild
            as={Fragment}
            enter="transition ease-out duration-200"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="transition ease-in duration-150"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <DialogPanel className="fixed inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
              <div className="flex h-16 shrink-0 items-center justify-between px-5">
                <span className="font-semibold text-steel-900">{brand}</span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation"
                  className="rounded-lg p-1 text-steel-400 hover:bg-steel-100"
                >
                  <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {nav(() => setDrawerOpen(false))}
            </DialogPanel>
          </TransitionChild>
        </Dialog>
      </Transition>

      {/* Content */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-steel-200 bg-white px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="-ml-1 rounded-lg p-2 text-steel-600 hover:bg-steel-100 lg:hidden"
          >
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
          <div className="flex-1" />
          {userMenu}
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>

        {attribution && <AttributionFooter />}
      </div>
    </div>
  );
};

/**
 * Where the attribution links to. One constant, so changing it is a release of
 * this package rather than a sweep across every client repo.
 */
export const FMC_URL = 'https://finemountainconsulting.com/custom-ui';

/**
 * Quiet by design: muted, in the flow of the page, never fixed or floating.
 * Rendered by <AppShell> on every authenticated page, and worth rendering on
 * the login screen too — that is the page a prospective client sees most.
 */
export const AttributionFooter = ({ className }: { className?: string }) => (
  <footer className={cx('px-4 pb-6 pt-2 text-center sm:px-6 lg:px-8', className)}>
    <p className="text-xs text-steel-400">
      Developed by{' '}
      <a
        href={FMC_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-steel-500 underline decoration-steel-300 underline-offset-2 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        Fine Mountain Consulting
      </a>
    </p>
  </footer>
);
