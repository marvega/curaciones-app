import { useState } from 'react';
import { saveAs } from 'file-saver';
import { Download } from 'lucide-react';
import { downloadAuditExport } from '../../services/api';
import { Button, Card, Input, PageHeader, Select } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';

const MONTH_OPTIONS = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

export default function AuditExportPage() {
  const { showError } = useToast();
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
      const date =
        mode === 'month'
          ? `${year}-${String(month).padStart(2, '0')}`
          : new Date().toISOString().slice(0, 10);
      saveAs(blob, `canasta-curacion-avanzada-${date}.xlsx`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al generar archivo');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title="Exportar Excel auditable"
        subtitle="Genera el archivo de canasta CAPD para auditoría"
      />

      <Card>
        <div className="space-y-4">
          <fieldset>
            <legend className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              Período
            </legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="audit-mode"
                  checked={mode === 'current'}
                  onChange={() => setMode('current')}
                  className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Al día actual</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="audit-mode"
                  checked={mode === 'month'}
                  onChange={() => setMode('month')}
                  className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Mes específico</span>
              </label>
            </div>
          </fieldset>

          {mode === 'month' && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Año"
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10) || year)}
              />
              <Select
                label="Mes"
                options={MONTH_OPTIONS}
                value={String(month)}
                onChange={(v) => setMonth(parseInt(v, 10))}
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={onDownload}
              loading={downloading}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Descargar Excel auditable
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
