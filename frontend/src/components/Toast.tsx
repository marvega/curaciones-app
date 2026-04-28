import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const styles: Record<ToastType, { icon: typeof CheckCircle2; cls: string; iconCls: string }> = {
  success: {
    icon: CheckCircle2,
    cls: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-100',
    iconCls: 'text-green-600 dark:text-green-400',
  },
  error: {
    icon: AlertCircle,
    cls: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-100',
    iconCls: 'text-red-600 dark:text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    cls: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-100',
    iconCls: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    icon: Info,
    cls: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-100',
    iconCls: 'text-blue-600 dark:text-blue-400',
  },
};

interface ToastProps {
  item: ToastItem;
  onDismiss: (id: number) => void;
}

export function Toast({ item, onDismiss }: ToastProps) {
  const s = styles[item.type];
  const Icon = s.icon;
  return (
    <div
      role={item.type === 'error' ? 'alert' : 'status'}
      aria-live={item.type === 'error' ? 'assertive' : 'polite'}
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg ring-1 ring-black/5 ${s.cls} motion-safe:animate-[toast-in_180ms_ease-out]`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${s.iconCls}`} />
      <p className="flex-1 text-sm font-medium">{item.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Cerrar"
        className="shrink-0 -mr-1 -mt-1 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-colors"
      >
        <X className="w-4 h-4 opacity-60" />
      </button>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
