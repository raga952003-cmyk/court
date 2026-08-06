import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
  /** If true, clicking backdrop closes the modal */
  closeOnBackdrop?: boolean;
}

/** Accessible modal: Escape, optional backdrop close, role=dialog, initial focus. */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-lg',
  closeOnBackdrop = true
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Only run when open toggles — do NOT depend on onClose identity (inline lambdas
  // change every parent render and were stealing focus from invite inputs ~1–2s).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);

    const t = window.setTimeout(() => {
      const active = document.activeElement;
      if (panelRef.current && active && panelRef.current.contains(active)) {
        return; // user already focused an input — don't steal it
      }
      const el = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (el || panelRef.current)?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      role="presentation"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        tabIndex={-1}
        className={`bg-white rounded-t-3xl sm:rounded-3xl w-full ${maxWidthClass} border border-slate-200 overflow-hidden shadow-2xl animate-scale-in max-h-[92dvh] overflow-y-auto outline-none`}
      >
        {(title || true) && (
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-2 sticky top-0 bg-white z-10">
            {title ? (
              <h3 className="font-display font-extrabold text-slate-900 text-base sm:text-lg tracking-tight">{title}</h3>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="px-4 sm:px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
