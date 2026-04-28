import { useEffect, useRef } from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

export type ConfirmVariant = 'default' | 'destructive' | 'warning';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles: Record<ConfirmVariant, { icon: typeof AlertTriangle; iconCls: string; btnCls: string }> = {
  default: {
    icon: Info,
    iconCls: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    btnCls: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconCls: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    btnCls: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500 text-white',
  },
  destructive: {
    icon: AlertCircle,
    iconCls: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    btnCls: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500 text-white',
  },
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus management: destructive → cancel; non-destructive → confirm
  useEffect(() => {
    if (!open) return;
    const target = variant === 'destructive' ? cancelBtnRef.current : confirmBtnRef.current;
    target?.focus();
  }, [open, variant]);

  // ESC closes (cancels)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Tab') {
        // Trap focus between cancel and confirm buttons
        const buttons = [cancelBtnRef.current, confirmBtnRef.current].filter(Boolean) as HTMLButtonElement[];
        if (buttons.length === 0) return;
        const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (idx === -1) {
          buttons[0].focus();
          e.preventDefault();
          return;
        }
        const next = e.shiftKey ? (idx - 1 + buttons.length) % buttons.length : (idx + 1) % buttons.length;
        buttons[next].focus();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const style = variantStyles[variant];
  const Icon = style.icon;
  const titleId = 'confirm-dialog-title';
  const descId = 'confirm-dialog-desc';

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // Backdrop click cancels (only when clicking the backdrop itself, not children)
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden motion-safe:animate-[dialog-in_180ms_ease-out]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-6 flex gap-4">
          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${style.iconCls}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            <p id={descId} className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {message}
            </p>
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 ring-1 ring-slate-300 dark:ring-slate-600 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${style.btnCls}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes dialog-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-safe\\:animate-\\[dialog-in_180ms_ease-out\\] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
