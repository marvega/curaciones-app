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

  // Ciclos
  const [showCycleConfig, setShowCycleConfig] = useState(false);
  const [cycles, setCycles] = useState<MonthlyCycle[]>([]);
  const [cycleEdits, setCycleEdits] = useState<Record<number, { startDate: string; endDate: string }>>({});
  const [savingCycles, setSavingCycles] = useState(false);
  const [cycleMessage, setCycleMessage] = useState('');

  const loadCycles = useCallback(async (y: number) => {
    try {
      const data = await getCyclesByYear(y);
      setCycles(data);
      // Inicializar edits con datos existentes
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
          // Si la fecha de fin actual es anterior a la nueva fecha de inicio, limpiarla
          endDate: current.endDate && current.endDate < value ? '' : current.endDate,
        };
      } else {
        // field === 'endDate'
        updated[m] = {
          startDate: current.startDate,
          endDate: value,
        };
        // Si el mes siguiente tiene fecha de inicio anterior al día siguiente de este fin, limpiarla
        const nextMonth = m + 1;
        if (nextMonth <= 12 && updated[nextMonth]?.startDate) {
          const nextDay = new Date(value + 'T00:00:00');
          nextDay.setDate(nextDay.getDate() + 1);
          const minNextStart = nextDay.toISOString().split('T')[0];
          if (updated[nextMonth].startDate < minNextStart) {
            updated[nextMonth] = {
              ...updated[nextMonth],
              startDate: '',
              // También limpiar endDate del siguiente si su inicio se invalidó
              endDate: updated[nextMonth].endDate || '',
            };
          }
        }
      }

      return updated;
    });
  };

  /**
   * Calcula la fecha mínima permitida para el inicio de un mes.
   * Es el día siguiente al fin del ciclo anterior.
   */
  const getMinStartDate = (m: number): string | undefined => {
    if (m === 1) {
      // Para Enero, no hay restricción de mes anterior dentro del mismo año
      return undefined;
    }
    const prevEnd = cycleEdits[m - 1]?.endDate;
    if (prevEnd) {
      const d = new Date(prevEnd + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    return undefined;
  };

  /**
   * Calcula la fecha mínima permitida para el fin de un mes.
   * Debe ser al menos igual a la fecha de inicio de ese mes.
   */
  const getMinEndDate = (m: number): string | undefined => {
    const start = cycleEdits[m]?.startDate;
    return start || undefined;
  };

  /**
   * Calcula la fecha máxima permitida para el fin de un mes.
   * No puede sobrepasar el día anterior al inicio del mes siguiente (si existe).
   */
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
      // Validar que ningún ciclo tenga fecha de fin anterior a fecha de inicio
      for (const c of cyclesToSave) {
        if (c.endDate < c.startDate) {
          setCycleMessage(`Error: ${MONTHS[c.month - 1]} tiene fecha de fin anterior a la de inicio.`);
          setSavingCycles(false);
          return;
        }
      }
      // Validar que los ciclos no se superpongan (ordenar por startDate y verificar)
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

  // Obtener el ciclo configurado para el mes seleccionado
  const currentCycle = cycles.find((c) => c.month === month);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            Reporte Mensual de Curaciones
          </h2>
          <button
            onClick={() => setShowCycleConfig(!showCycleConfig)}
            className={`px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 text-sm ${
              showCycleConfig
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configurar Ciclos
          </button>
        </div>

        {/* Panel de configuración de ciclos */}
        {showCycleConfig && (
          <div className="mb-6 bg-gray-50 rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">
                  Configuración de Ciclos Mensuales - {year}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Define las fechas de inicio y fin de cada ciclo mensual. Si un mes no tiene ciclo configurado, se usará el mes calendario completo.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600 w-32">Mes</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Fecha Inicio</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Fecha Fin</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600 w-40">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((monthName, i) => {
                    const m = i + 1;
                    const edit = cycleEdits[m];
                    const saved = cycles.find((c) => c.month === m);
                    return (
                      <tr key={m} className="border-b border-gray-100 hover:bg-white transition-colors">
                        <td className="py-2 px-3 font-medium text-gray-700">{monthName}</td>
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
                            <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              Configurado
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">Mes calendario</span>
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
                className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium hover:bg-blue-100 transition-colors text-sm"
              >
                Auto-completar fechas de inicio
              </button>
              <button
                onClick={handleSaveCycles}
                disabled={savingCycles}
                className="px-5 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors text-sm"
              >
                {savingCycles ? 'Guardando...' : 'Guardar Ciclos'}
              </button>
              {cycleMessage && (
                <span className={`text-sm ${cycleMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {cycleMessage}
                </span>
              )}
            </div>

            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs text-blue-700">
                <strong>Tip:</strong> Configura primero la fecha de fin de cada mes. Luego usa "Auto-completar fechas de inicio" para que cada mes comience automáticamente el día siguiente al fin del mes anterior. Enero tomará como inicio el día siguiente al fin de Diciembre del año anterior (si está configurado), o el 1 de Enero.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-stretch sm:items-end mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Generando...' : 'Generar Reporte'}
          </button>
          {report && (
            <button
              onClick={handleDownloadExcel}
              className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Descargar Excel
            </button>
          )}
        </div>

        {/* Mostrar info del ciclo activo */}
        {currentCycle && (
          <div className="mb-4 px-4 py-2.5 bg-teal-50 border border-teal-100 rounded-xl text-sm text-teal-700">
            Ciclo configurado para <strong>{MONTHS[month - 1]}</strong>: {formatDate(currentCycle.startDate)} al {formatDate(currentCycle.endDate)}
          </div>
        )}

        {report && (
          <div className="space-y-6">
            {/* Mostrar período del reporte */}
            <div className="text-center text-sm text-gray-500 bg-gray-50 rounded-xl py-2">
              Período del reporte: <strong>{formatDate(report.startDate)}</strong> al <strong>{formatDate(report.endDate)}</strong>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-teal-50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-teal-700">
                  {report.avanzada}
                </div>
                <div className="text-sm text-teal-600 mt-1">
                  Curación Avanzada
                </div>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-amber-700">
                  {report.pie_diabetico}
                </div>
                <div className="text-sm text-amber-600 mt-1">
                  Pie Diabético
                </div>
              </div>
              <div className="bg-indigo-50 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-indigo-700">
                  {report.ulcera_venosa}
                </div>
                <div className="text-sm text-indigo-600 mt-1">
                  Úlcera Venosa
                </div>
              </div>
              <div className="bg-gray-100 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-gray-700">
                  {report.totalGeneral}
                </div>
                <div className="text-sm text-gray-600 mt-1">Total General</div>
              </div>
            </div>

            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
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

            <div className="text-center text-sm text-gray-500">
              Reporte de {MONTHS[report.month - 1]} {report.year}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
