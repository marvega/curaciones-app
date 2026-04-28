import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Skeleton } from './Skeleton';

export interface ColumnDef<T> {
  key: string;
  label: ReactNode;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  loading?: boolean;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string | number;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyState,
  onRowClick,
  keyExtractor,
  className,
}: DataTableProps<T>) {
  if (!loading && data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: typeof c.width === 'number' ? `${c.width}px` : c.width } : undefined}
                className={cn(
                  'py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                  !c.align && 'text-left',
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-slate-50 dark:border-slate-800">
                  {columns.map((c) => (
                    <td key={c.key} className="py-3 px-3">
                      <Skeleton height={14} width="80%" />
                    </td>
                  ))}
                </tr>
              ))
            : data.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  className={cn(
                    'border-b border-slate-50 dark:border-slate-800',
                    onRowClick && 'hover:bg-blue-50/50 dark:hover:bg-slate-800 cursor-pointer transition-colors',
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'py-3 px-3 text-slate-700 dark:text-slate-300',
                        c.align === 'right' && 'text-right',
                        c.align === 'center' && 'text-center',
                      )}
                    >
                      {c.render ? c.render(row) : ((row as Record<string, ReactNode>)[c.key] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
