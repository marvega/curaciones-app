import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type TagVariant = 'gray' | 'blue' | 'green' | 'yellow' | 'red';

export interface TagProps {
  children: ReactNode;
  variant?: TagVariant;
  uppercase?: boolean;
  className?: string;
}

const VARIANTS: Record<TagVariant, string> = {
  gray: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  yellow: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  red: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400',
};

export function Tag({ children, variant = 'gray', uppercase, className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        VARIANTS[variant],
        uppercase && 'uppercase tracking-wider',
        className,
      )}
    >
      {children}
    </span>
  );
}
