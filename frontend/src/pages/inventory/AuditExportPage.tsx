import { useState } from 'react';
import { saveAs } from 'file-saver';
import { downloadAuditExport } from '../../services/api';

export default function AuditExportPage() {
  const [mode, setMode] = useState<'current' | 'month'>('current');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    setDownloading(true);
    try {
      const blob = await downloadAuditExport(
        mode === 'month'
          ? { mode, establishmentId: 1, year, month }
          : { mode, establishmentId: 1 },
      );
      const date = mode === 'month' ? `${year}-${String(month).padStart(2, '0')}` : new Date().toISOString().slice(0, 10);
      saveAs(blob, `canasta-curacion-avanzada-${date}.xlsx`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-xl bg-white dark:bg-slate-900 rounded shadow p-6 space-y-4">
      <div className="flex gap-4">
        <label className="flex items-center gap-2"><input type="radio" checked={mode === 'current'} onChange={() => setMode('current')} /> Al día actual</label>
        <label className="flex items-center gap-2"><input type="radio" checked={mode === 'month'} onChange={() => setMode('month')} /> Mes específico</label>
      </div>
      {mode === 'month' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Año</span>
            <input type="number" className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10) || year)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Mes</span>
            <select className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
        </div>
      )}
      <button onClick={onDownload} disabled={downloading} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
        {downloading ? 'Generando...' : 'Descargar Excel auditable'}
      </button>
    </div>
  );
}
