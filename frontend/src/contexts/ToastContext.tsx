import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Toast, type ToastItem, type ToastType } from '../components/Toast';

interface ShowToastOptions {
  type?: ToastType;
  duration?: number; // ms; 0 = persistent
}

type ShowToastFn = (message: string, options?: ShowToastOptions) => void;

interface ToastContextValue {
  showToast: ShowToastFn;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const showToast = useCallback<ShowToastFn>(
    (message, opts = {}) => {
      const id = nextId++;
      const item: ToastItem = { id, type: opts.type ?? 'info', message };
      setToasts((prev) => [...prev, item]);
      const duration = opts.duration ?? 4000;
      if (duration > 0) {
        timers.current[id] = setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  const value: ToastContextValue = {
    showToast,
    showSuccess: (message, duration) => showToast(message, { type: 'success', duration }),
    showError: (message, duration) => showToast(message, { type: 'error', duration: duration ?? 6000 }),
    showWarning: (message, duration) => showToast(message, { type: 'warning', duration }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-[1100] flex flex-col gap-2 w-full max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast item={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
