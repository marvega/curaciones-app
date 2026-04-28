import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  extra?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, extra, className, id, ...rest },
  ref,
) {
  const genId = useId();
  const inputId = id ?? genId;
  return (
    <label htmlFor={inputId} className={cn('flex items-center gap-2 cursor-pointer select-none text-sm', className)}>
      <input
        {...rest}
        id={inputId}
        ref={ref}
        type="checkbox"
        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
      />
      {label && <span className="flex-1">{label}</span>}
      {extra}
    </label>
  );
});
