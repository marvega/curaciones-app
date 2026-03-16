import { useState, useEffect, useCallback } from 'react';
import { getMonthlyReport, getCyclesByYear, saveCycles } from '../services/api';
import type { MonthlyReport, MonthlyCycle } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Settings, Download, Check, Loader2, Info } from 'lucide-react';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const COLORS = ['#0d9488', '#f59e0b', '#6366f1'];

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function MonthlyReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);

  // Cycles
  const [showCycleConfig, setShowCycleConfig] = useState(false);
  const [cycles, setCycles] = useState<MonthlyCycle[]>([]);
  const [cycleEdits, setCycleEdits] = useState<Record<number, { startDate: string; endDate: string }>>({});
  const [savingCycles, setSavingCycles] = useState(false);
  const [cycleMessage, setCycleMessage] = useState('');

  const loadCycles = useCallback(async (y: number) => {
    try {
      const data = await getCyclesByYear(y);
      setCycles(data);
      const edits: Record<number, { startDate: string; endDate: string }> = {};
      for (const c of data) {
        edits[c.month] = { startDate: c.startDate, endDate: c.endDate };
      }
      setCycleEdits(edits);
    } catch {
      setCycles([]);
      setCycleEdits({});
    }
  }, []);

  useEffect(() => {
    if (showCycleConfig) {
      loadCycles(year);
    }
  }, [showCycleConfig, year, loadCycles]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const data = await getMonthlyReport(year, month);
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCycleChange = (m: number, field: 'startDate' | 'endDate', value: string) => {
    setCycleEdits((prev) => {
      const current = prev[m] || { startDate: '', endDate: '' };
      const updated = { ...prev };

      if (field === 'startDate') {
        updated[m] = {
          startDate: value,
          endDate: current.endDate && current.endDate < value ? '' : current.endDate,
        };
      } else {
        updated[m] = {
          startDate: current.startDate,
          endDate: value,
        };
        const nextMonth = m + 1;
        if (nextMonth <= 12 && updated[nextMonth]?.startDate) {
          const nextDay = new Date(value + 'T00:00:00');
          nextDay.setDate(nextDay.getDate() + 1);
          const minNextStart = nextDay.toISOString().split('T')[0];
          if (updated[nextMonth].startDate < minNextStart) {
            updated[nextMonth] = {
              ...updated[nextMonth],
              startDate: '',
              endDate: updated[nextMonth].endDate || '',
            };
          }
        }
      }

      return updated;
    });
  };

  const getMinStartDate = (m: number): string | undefined => {
    if (m === 1) return undefined;
    const prevEnd = cycleEdits[m - 1]?.endDate;
    if (prevEnd) {
      const d = new Date(prevEnd + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    return undefined;
  };

  const getMinEndDate = (m: number): string | undefined => {
    const start = cycleEdits[m]?.startDate;
    return start || undefined;
  };

  const getMaxEndDate = (m: number): string | undefined => {
    if (m >= 12) return undefined;
    const nextStart = cycleEdits[m + 1]?.startDate;
    if (nextStart) {
      const d = new Date(nextStart + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    }
    return undefined;
  };

  const handleAutoFillStartDates = () => {
    setCycleEdits((prev) => {
      const updated = { ...prev };
      for (let m = 2; m <= 12; m++) {
        const prevMonth = m - 1;
        const prevEnd = updated[prevMonth]?.endDate;
        if (prevEnd) {
          const d = new Date(prevEnd + 'T00:00:00');
          d.setDate(d.getDate() + 1);
          const autoStart = d.toISOString().split('T')[0];
          updated[m] = {
            ...updated[m],
            startDate: autoStart,
            endDate: updated[m]?.endDate || '',
          };
        }
      }
      return updated;
    });
  };

  const handleSaveCycles = async () => {
    setSavingCycles(true);
    setCycleMessage('');
    try {
      const cyclesToSave: MonthlyCycle[] = [];
      for (let m = 1; m <= 12; m++) {
        const edit = cycleEdits[m];
        if (edit?.startDate && edit?.endDate) {
          cyclesToSave.push({
            year,
            month: m,
            startDate: edit.startDate,
            endDate: edit.endDate,
          });
        }
      }
      if (cyclesToSave.length === 0) {
        setCycleMessage('No hay ciclos configurados para guardar.');
        setSavingCycles(false);
        return;
      }
      for (const c of cyclesToSave) {
        if (c.endDate < c.startDate) {
          setCycleMessage(`Error: ${MONTHS[c.month - 1]} tiene fecha de fin anterior a la de inicio.`);
          setSavingCycles(false);
          return;
        }
      }
      const sorted = [...cyclesToSave].sort((a, b) => a.startDate.localeCompare(b.startDate));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startDate <= sorted[i - 1].endDate) {
          setCycleMessage(`Error: Los ciclos de ${MONTHS[sorted[i - 1].month - 1]} y ${MONTHS[sorted[i].month - 1]} se superponen.`);
          setSavingCycles(false);
          return;
        }
      }
      await saveCycles(cyclesToSave);
      setCycleMessage(`Se guardaron ${cyclesToSave.length} ciclo(s) correctamente.`);
      await loadCycles(year);
    } catch {
      setCycleMessage('Error al guardar los ciclos.');
    } finally {
      setSavingCycles(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!report) return;

    const periodStr = report.startDate && report.endDate
      ? `${formatDate(report.startDate)} al ${formatDate(report.endDate)}`
      : MONTHS[report.month - 1] + ' ' + report.year;

    const wsData = [
      ['Reporte Mensual de Curaciones'],
      [`Período: ${MONTHS[report.month - 1]} ${report.year}`],
      [`Fechas del ciclo: ${periodStr}`],
      [],
      ['Tipo de Curación', 'Cantidad'],
      ['Curación Avanzada', report.avanzada],
      ['Curación Avanzada - Pie Diabético', report.pie_diabetico],
      ['Curación Avanzada - Úlcera Venosa', report.ulcera_venosa],
      [],
      ['Total General', report.totalGeneral],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 40 }, { wch: 15 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Mensual');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, `Reporte_Mensual_${MONTHS[report.month - 1]}_${report.year}.xlsx`);
  };

  const chartData = report
    ? [
        { name: 'Curación Avanzada', value: report.avanzada },
        { name: 'Pie Diabético', value: report.pie_diabetico },
        { name: 'Úlcera Venosa', value: report.ulcera_venosa },
      ]
    : [];

  const currentCycle = cycles.find((c) => c.month === month);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-slate-800">
            Reporte Mensual
          </h2>
          <button
            onClick={() => setShowCycleConfig(!showCycleConfig)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all text-sm cursor-pointer ${
              showCycleConfig
                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            Configurar Ciclos
          </button>
        </div>

        {/* Cycle config panel */}
        {showCycleConfig && (
          <div className="mb-6 bg-slate-50 rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-800">
                  Ciclos Mensuales - {year}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Define las fechas de inicio y fin de cada ciclo. Si un mes no tiene ciclo configurado, se usará el mes calendario completo.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Año
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  min={2020}
                  max={2030}
                  className="form-control w-24 text-sm"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs uppercase tracking-wider w-32">Mes</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Fecha Inicio</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Fecha Fin</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-500 text-xs uppercase tracking-wider w-40">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((monthName, i) => {
                    const m = i + 1;
                    const edit = cycleEdits[m];
                    const saved = cycles.find((c) => c.month === m);
                    return (
                      <tr key={m} className="border-b border-slate-100 hover:bg-white transition-colors">
                        <td className="py-2 px-3 font-medium text-slate-700">{monthName}</td>
                        <td className="py-2 px-3">
                          <input
                            type="date"
                            value={edit?.startDate || ''}
                            min={getMinStartDate(m)}
                            onChange={(e) => handleCycleChange(m, 'startDate', e.target.value)}
                            className="form-control text-sm w-full"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="date"
                            value={edit?.endDate || ''}
                            min={getMinEndDate(m)}
                            max={getMaxEndDate(m)}
                            onChange={(e) => handleCycleChange(m, 'endDate', e.target.value)}
                            className="form-control text-sm w-full"
                          />
                        </td>
                        <td className="py-2 px-3">
                          {saved ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                              <Check className="w-3.5 h-3.5" />
                              Configurado
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">Mes calendario</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleAutoFillStartDates}
                className="btn-secondary text-sm cursor-pointer"
              >
                Auto-completar fechas de inicio
              </button>
              <button
                onClick={handleSaveCycles}
                disabled={savingCycles}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {savingCycles ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar Ciclos'
                )}
              </button>
              {cycleMessage && (
                <span className={`text-sm ${cycleMessage.includes('Error') ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {cycleMessage}
                </span>
              )}
            </div>

            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                Configura primero la fecha de fin de cada mes. Luego usa "Auto-completar fechas de inicio" para que cada mes comience automáticamente el día siguiente al fin del mes anterior.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-stretch sm:items-end mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Año
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              min={2020}
              max={2030}
              className="form-control w-28"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Mes
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="form-control w-28"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando...
              </>
            ) : (
              'Generar Reporte'
            )}
          </button>
          {report && (
            <button
              onClick={handleDownloadExcel}
              className="btn-success inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Descargar Excel
            </button>
          )}
        </div>

        {/* Active cycle info */}
        {currentCycle && (
          <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700 flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            Ciclo configurado para <strong>{MONTHS[month - 1]}</strong>: {formatDate(currentCycle.startDate)} al {formatDate(currentCycle.endDate)}
          </div>
        )}

        {report && (
          <div className="space-y-6">
            {/* Report period */}
            <div className="text-center text-sm text-slate-500 bg-slate-50 rounded-xl py-2.5">
              Período del reporte: <strong>{formatDate(report.startDate)}</strong> al <strong>{formatDate(report.endDate)}</strong>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-blue-700">
                  {report.avanzada}
                </div>
                <div className="text-xs text-blue-600 mt-1 font-medium">
                  Curación Avanzada
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-amber-700">
                  {report.pie_diabetico}
                </div>
                <div className="text-xs text-amber-600 mt-1 font-medium">
                  Pie Diabético
                </div>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-indigo-700">
                  {report.ulcera_venosa}
                </div>
                <div className="text-xs text-indigo-600 mt-1 font-medium">
                  Úlcera Venosa
                </div>
              </div>
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-slate-700">
                  {report.totalGeneral}
                </div>
                <div className="text-xs text-slate-600 mt-1 font-medium">Total General</div>
              </div>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis allowDecimals={false} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="text-center text-sm text-slate-500">
              Reporte de {MONTHS[report.month - 1]} {report.year}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
