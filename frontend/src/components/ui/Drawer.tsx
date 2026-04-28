import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  side?: 'right' | 'left';
  width?: number | string;
  footer?: ReactNode;
  children: ReactNode;
  closeOnBackdrop?: boolean;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  side = 'right',
  width = 480,
  footer,
  children,
  closeOnBackdrop = true,
}: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widthCss = typeof width === 'number' ? `${width}px` : width;
  const sideClasses = side === 'right' ? 'right-0' : 'left-0';

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-900/45"
        onClick={() => closeOnBackdrop && onClose()}
        aria-hidden
      />
      <div
        ref={ref}
        style={{ width: widthCss }}
        className={cn(
          'absolute top-0 bottom-0 bg-white dark:bg-slate-900 shadow-xl border-slate-200 dark:border-slate-700 flex flex-col',
          sideClasses,
          side === 'right' ? 'border-l' : 'border-r',
        )}
      >
        {(title || subtitle) && (
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
            <div>
              {title && <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
