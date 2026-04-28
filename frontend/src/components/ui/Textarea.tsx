import { forwardRef, useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helpText?: string;
  error?: string;
}

const BASE =
  'w-full rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 ' +
  'px-3.5 py-2.5 text-sm outline-none transition-all resize-y min-h-[5rem] ' +
  'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500';

const NORMAL = 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600';
const INVALID = 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, helpText, error, className, id, rows = 4, ...rest },
  ref,
) {
  const genId = useId();
  const textareaId = id ?? genId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {label}
        </label>
      )}
      <textarea
        {...rest}
        id={textareaId}
        ref={ref}
        rows={rows}
        aria-invalid={error ? 'true' : undefined}
        className={cn(BASE, error ? INVALID : NORMAL, className)}
      />
      {error ? (
        <p className="text-xs text-rose-600 mt-1">{error}</p>
      ) : helpText ? (
        <p className="text-xs text-slate-500 mt-1">{helpText}</p>
      ) : null}
    </div>
  );
});
