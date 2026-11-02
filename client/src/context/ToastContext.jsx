import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const STYLES = {
  success: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', iconCls: 'text-emerald-600' },
  error: { icon: AlertCircle, cls: 'border-red-200 bg-red-50 text-red-900', iconCls: 'text-red-600' },
  info: { icon: Info, cls: 'border-brand-200 bg-brand-50 text-brand-900', iconCls: 'text-brand-600' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((type, message, ms = 4000) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, type, message }]);
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m, 6000),
    info: (m) => push('info', m),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Sits above the mobile bottom nav */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const s = STYLES[t.type];
          const Icon = s.icon;
          return (
            <div key={t.id} role="status"
              className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-lg border p-3 shadow-lg ${s.cls}`}>
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.iconCls}`} aria-hidden />
              <p className="flex-1 text-sm font-medium">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="-m-2 rounded p-2 opacity-60 hover:opacity-100" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
