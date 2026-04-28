import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface FileUploadResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

export interface FileUploadProps {
  label: string;
  helperText?: string;
  accept?: string;
  maxSize?: number;
  onUpload: (file: File) => Promise<void>;
  result?: FileUploadResult;
  disabled?: boolean;
}

export function FileUpload({
  label,
  helperText,
  accept = '.xlsx',
  maxSize = 5 * 1024 * 1024,
  onUpload,
  result,
  disabled,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setLocalError(null);
    if (maxSize && file.size > maxSize) {
      setLocalError(`Archivo supera el máximo de ${(maxSize / 1024 / 1024).toFixed(0)} MB`);
      return;
    }
    setUploading(true);
    try {
      await onUpload(file);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl py-8 px-6 text-center cursor-pointer transition-all',
          dragging
            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
            : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-slate-900',
          (disabled || uploading) && 'opacity-50 cursor-not-allowed',
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}
      >
        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" aria-hidden />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {uploading ? 'Importando…' : 'Arrastra el archivo aquí, o '}
          {!uploading && (
            <label htmlFor={id} className="text-blue-600 hover:text-blue-700 cursor-pointer underline-offset-2 hover:underline">
              selecciona uno
            </label>
          )}
        </p>
        {label && <p className="text-xs text-slate-500 mt-1">{label}</p>}
        {helperText && <p className="text-xs text-slate-400 mt-1">{helperText}</p>}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          disabled={disabled || uploading}
          aria-label={label}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {localError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {localError}
        </div>
      )}

      {result && (
        <div
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            result.errors.length > 0
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800',
          )}
        >
          <div className="font-medium">
            {result.errors.length > 0 ? 'Importación completada con avisos' : 'Importación exitosa'}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">✓ {result.created} creados</span>
            <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">↻ {result.updated} actualizados</span>
            <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">= {result.unchanged} sin cambios</span>
            {result.skipped > 0 && (
              <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">⊘ {result.skipped} saltados</span>
            )}
            {result.errors.length > 0 && (
              <span className="px-2 py-0.5 bg-white rounded text-xs font-medium text-rose-700">
                ⚠ {result.errors.length} con error
              </span>
            )}
          </div>
          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium underline">{result.errors.length} errores — ver detalle</summary>
              <ul className="mt-2 text-xs space-y-0.5">
                {result.errors.slice(0, 50).map((err, i) => (
                  <li key={i}>Fila {err.row}: {err.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
