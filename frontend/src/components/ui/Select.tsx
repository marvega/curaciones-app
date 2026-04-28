import { useId } from 'react';
import { cn } from '../../lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  helpText?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const BASE =
  'w-full appearance-none rounded-lg border bg-white text-slate-900 ' +
  'px-3.5 py-2.5 pr-10 text-sm outline-none transition-all ' +
  'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'dark:bg-slate-800 dark:text-slate-200 ' +
  "bg-[url('data:image/svg+xml,%3csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20fill=%22none%22%20viewBox=%220%200%2020%2020%22%3e%3cpath%20stroke=%22%2394a3b8%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%20stroke-width=%221.5%22%20d=%22M6%208l4%204%204-4%22/%3e%3c/svg%3e')] " +
  'bg-[length:1.5em_1.5em] bg-no-repeat bg-[position:right_0.5rem_center]';

const NORMAL = 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600';
const INVALID = 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500';

export function Select({
  options,
  value,
  onChange,
  label,
  placeholder,
  helpText,
  error,
  disabled,
  className,
  id,
}: SelectProps) {
  const genId = useId();
  const selectId = id ?? genId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {label}
        </label>
      )}
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        className={cn(BASE, error ? INVALID : NORMAL, className)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs text-rose-600 mt-1">{error}</p>
      ) : helpText ? (
        <p className="text-xs text-slate-500 mt-1">{helpText}</p>
      ) : null}
    </div>
  );
}
