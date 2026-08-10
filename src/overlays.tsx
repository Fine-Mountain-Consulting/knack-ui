import { Fragment, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Button, TONE_ICONS, cx, type DialogTone } from './primitives.js';

/**
 * Headless UI owns focus trapping, restore-on-close, Escape and scroll lock.
 * Hand-rolling any of that is how these end up inaccessible.
 */

// ── SlideOver ───────────────────────────────────────────────────────────────

export interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Sticky footer, for form actions. */
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
  children: ReactNode;
}

const SLIDE_WIDTHS = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' } as const;

/**
 * The default container for detail and edit. Preferred over a modal for
 * anything with more than two fields, because it keeps the list behind it
 * visible and doesn't lose the user's place.
 */
export const SlideOver = ({
  open,
  onClose,
  title,
  description,
  footer,
  width = 'lg',
  children,
}: SlideOverProps) => (
  <Transition show={open} as={Fragment}>
    <Dialog onClose={onClose} className="relative z-50">
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

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <TransitionChild
              as={Fragment}
              enter="transform transition ease-out duration-200"
              enterFrom="translate-x-full"
              enterTo="translate-x-0"
              leave="transform transition ease-in duration-150"
              leaveFrom="translate-x-0"
              leaveTo="translate-x-full"
            >
              <DialogPanel
                className={cx('pointer-events-auto w-screen', SLIDE_WIDTHS[width])}
              >
                <div className="flex h-full flex-col bg-white shadow-xl">
                  <div className="flex items-start justify-between gap-4 border-b border-steel-200 px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                      <DialogTitle className="text-base font-semibold text-steel-900">
                        {title}
                      </DialogTitle>
                      {description && (
                        <p className="mt-1 text-sm text-steel-500">{description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close panel"
                      className="rounded-lg p-1 text-steel-400 transition-colors hover:bg-steel-100 hover:text-steel-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>

                  {footer && (
                    <div className="border-t border-steel-200 bg-steel-50 px-4 py-3 sm:px-6">
                      {footer}
                    </div>
                  )}
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </div>
    </Dialog>
  </Transition>
);

// ── Modal ───────────────────────────────────────────────────────────────────

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: ReactNode;
  tone?: DialogTone;
  children?: ReactNode;
  footer?: ReactNode;
}

/** Confirmations and short messages only. A real form belongs in a SlideOver. */
export const Modal = ({
  open,
  onClose,
  title,
  message,
  tone = 'info',
  children,
  footer,
}: ModalProps) => {
  const { Icon, className } = TONE_ICONS[tone];
  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
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

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-150"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="flex gap-4">
                <Icon className={cx('h-6 w-6 shrink-0', className)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-base font-semibold text-steel-900">
                    {title}
                  </DialogTitle>
                  {message && <div className="mt-2 text-sm text-steel-600">{message}</div>}
                  {children && <div className="mt-4">{children}</div>}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                {footer ?? <Button onClick={onClose}>Close</Button>}
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};

// ── ConfirmDialog ───────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  destructive?: boolean;
}

/** Required in front of every destructive action. */
export const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'warning',
  destructive = false,
}: ConfirmDialogProps) => {
  const [working, setWorking] = useState(false);

  const handleConfirm = async () => {
    setWorking(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      // Reset even on failure so the dialog isn't wedged if the caller
      // surfaces the error and leaves it open.
      setWorking(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={working ? () => undefined : onClose}
      title={title}
      message={message}
      tone={destructive ? 'error' : tone}
      footer={
        <>
          <Button onClick={onClose} disabled={working}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={working}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
};
