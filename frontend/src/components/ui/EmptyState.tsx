import type { ComponentType, ReactNode } from 'react';

interface IconProps {
  className?: string;
  'aria-hidden'?: boolean;
}

export interface EmptyStateProps {
  icon?: ComponentType<IconProps>;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16 px-4">
      {Icon && <Icon className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden />}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
