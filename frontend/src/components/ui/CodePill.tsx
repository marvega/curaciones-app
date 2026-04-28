import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CodePillProps {
  children: ReactNode;
  className?: string;
}

export function CodePill({ children, className }: CodePillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs font-semibold',
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
        className,
      )}
    >
      {children}
    </span>
  );
}
