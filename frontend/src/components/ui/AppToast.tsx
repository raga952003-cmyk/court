import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  kind: ToastKind;
}

/** Simple global toast via CustomEvent('app_toast', { detail: { message, kind } }) */
export function showAppToast(message: string, kind: ToastKind = 'info') {
  window.dispatchEvent(new CustomEvent('app_toast', { detail: { message, kind } }));
}

export default function AppToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ToastState;
      if (!detail?.message) return;
      setToast(detail);
    };
    window.addEventListener('app_toast', handler);
    return () => window.removeEventListener('app_toast', handler);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const colors =
    toast.kind === 'success'
      ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
      : toast.kind === 'error'
        ? 'border-rose-400 bg-rose-50 text-rose-900'
        : 'border-blue-400 bg-blue-50 text-blue-900';

  return (
    <div
      id="app_toast"
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-sm z-[10000] border rounded-2xl shadow-xl p-4 flex gap-3 ${colors}`}
    >
      {toast.kind === 'success' ? (
        <CheckCircle2 className="w-5 h-5 shrink-0" />
      ) : toast.kind === 'error' ? (
        <AlertTriangle className="w-5 h-5 shrink-0" />
      ) : (
        <AlertTriangle className="w-5 h-5 shrink-0" />
      )}
      <p className="text-xs font-semibold leading-relaxed flex-1">{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setToast(null)}
        className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
