import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helpText?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const BASE =
  'w-full rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 ' +
  'px-3.5 py-2.5 text-sm outline-none transition-all ' +
  'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500';

const NORMAL = 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600';
const INVALID = 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helpText, error, leftIcon, rightIcon, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  const padLeft = leftIcon ? 'pl-9' : '';
  const padRight = rightIcon ? 'pr-9' : '';

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          {...rest}
          id={inputId}
          ref={ref}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : helpText ? helpId : undefined}
          className={cn(BASE, error ? INVALID : NORMAL, padLeft, padRight, className)}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            {rightIcon}
          </span>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-rose-600 mt-1">{error}</p>
      ) : helpText ? (
        <p id={helpId} className="text-xs text-slate-500 mt-1">{helpText}</p>
      ) : null}
    </div>
  );
});
