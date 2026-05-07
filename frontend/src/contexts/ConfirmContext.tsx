import { createContext, useCallback, useState } from 'react';
import ConfirmDialog, { type ConfirmVariant } from '../components/ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

// eslint-disable-next-line react-refresh/only-export-components
export const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const handleConfirm = () => {
    pending?.resolve(true);
    setPending(null);
  };
  const handleCancel = () => {
    pending?.resolve(false);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        message={pending?.message ?? ''}
        confirmText={pending?.confirmText}
        cancelText={pending?.cancelText}
        variant={pending?.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}

