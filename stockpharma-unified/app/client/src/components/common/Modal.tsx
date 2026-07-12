import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * M78: shared modal primitive.
 *
 * - Goes full-screen-sheet (bottom-anchored) on mobile so the soft keyboard
 *   doesn't cover footer actions; centers as a card on `sm:` and up.
 * - Locks body scroll while open.
 * - Closes on Escape and (optionally) backdrop click.
 * - Restores focus to the previously focused element on close.
 *
 * Use this for every centered dialog. For drawers/forms use `SlideOver`.
 */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Card width on `sm:` and up. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Tailwind z-index class — defaults to z-[150]. */
  zIndex?: string;
  /** Click outside dismisses the modal. Default true. */
  closeOnBackdrop?: boolean;
  /** Hide the X close button (useful for blocking modals). */
  hideCloseButton?: boolean;
  /** Label for screen-reader users when no visible title is set. */
  ariaLabel?: string;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  zIndex = 'z-[150]',
  closeOnBackdrop = true,
  hideCloseButton = false,
  ariaLabel,
}) => {
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusTo.current = (document.activeElement as HTMLElement) ?? null;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    // focus into the panel for keyboard users
    const t = setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 0);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      restoreFocusTo.current?.focus?.();
      clearTimeout(t);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClass = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-2xl',
  }[size];

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4`}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        className={`relative bg-surface w-full max-w-[100vw] ${sizeClass} max-h-[100dvh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-xl shadow-xl flex flex-col`}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-subtle shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
              {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
            </div>
            {!hideCloseButton && (
              <button
                onClick={onClose}
                className="shrink-0 w-9 h-9 -mt-1 -mr-1 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="px-5 py-4 border-t border-border-subtle shrink-0 bg-slate-50/50 flex items-center justify-end gap-2 flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
