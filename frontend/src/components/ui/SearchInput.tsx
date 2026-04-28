import { Search, X } from 'lucide-react';
import { Input } from './Input';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
  autoFocus?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
  className,
  autoFocus,
}: SearchInputProps) {
  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder ?? 'Buscar'}
      autoFocus={autoFocus}
      className={className}
      leftIcon={<Search className="w-4 h-4" />}
      rightIcon={
        value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Limpiar búsqueda"
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 -mr-1 pointer-events-auto cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        ) : undefined
      }
    />
  );
}
