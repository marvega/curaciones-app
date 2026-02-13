import { useState } from 'react';
import { getDetailedReport } from '../services/api';
import type { DetailedReport } from '../types';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const COLORS = ['#0d9488', '#f59e0b', '#6366f1', '#ec4899'];

const AGE_GROUPS = [
  { label: '15 - 19 años', min: 15, max: 19 },
  { label: '20 - 24 años', min: 20, max: 24 },
  { label: '25 - 29 años', min: 25, max: 29 },
  { label: '30 - 34 años', min: 30, max: 34 },
  { label: '35 - 39 años', min: 35, max: 39 },
  { label: '40 - 44 años', min: 40, max: 44 },
  { label: '45 - 49 años', min: 45, max: 49 },
  { label: '50 - 54 años', min: 50, max: 54 },
  { label: '55 - 59 años', min: 55, max: 59 },
  { label: '60 - 64 años', min: 60, max: 64 },
  { label: '65 - 69 años', min: 65, max: 69 },
  { label: '70 - 74 años', min: 70, max: 74 },
  { label: '75 - 79 años', min: 75, max: 79 },
  { label: '80 y más', min: 80, max: 150 },
];

const QUARTERS = [
  { value: 1, label: '1er Trimestre (Ene-Mar)' },
  { value: 2, label: '2do Trimestre (Abr-Jun)' },
  { value: 3, label: '3er Trimestre (Jul-Sep)' },
  { value: 4, label: '4to Trimestre (Oct-Dic)' },
];

export default function DetailedReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [gender, setGender] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [report, setReport] = useState<DetailedReport | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const filters: { 
        year: number; 
        quarter: number; 
        gender?: string; 
        ageMin?: number; 
        ageMax?: number 
      } = {
        year,
        quarter,
      };
      
      if (gender) filters.gender = gender;
      if (ageGroup) {
        const group = AGE_GROUPS[parseInt(ageGroup)];
        filters.ageMin = group.min;
        filters.ageMax = group.max;
      }
      const data = await getDetailedReport(filters);
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    if (!report) return;

    const filterLabel = [
      `Año ${report.filters.year}`,
      `Trimestre ${report.filters.quarter}`,
      report.filters.gender || 'Todos los géneros',
      report.filters.ageMin !== undefined
        ? `${report.filters.ageMin} - ${report.filters.ageMax} años`
        : 'Todas las edades',
    ].join(', ');

    // Hoja 1: Resumen
    const summaryData: (string | number)[][] = [
      ['Reporte Trimestral Detallado de Curaciones'],
      [`Filtros: ${filterLabel}`],
      [],
      ['Tipo de Curación', 'Total'],
      ['Curación Avanzada', report.summary.avanzada.total],
      ['Curación Úlcera Venosa', report.summary.ulcera_venosa.total],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 15 }];

    // Hoja 2: Curación Avanzada por Género
    const avanzadaData: (string | number)[][] = [
      ['Curación Avanzada - Detalle por Género'],
      [`Filtros: ${filterLabel}`],
      [],
      ['Género', 'Cantidad'],
    ];
    for (const [g, count] of Object.entries(report.summary.avanzada.byGender)) {
      avanzadaData.push([g, count]);
    }
    avanzadaData.push([]);
    avanzadaData.push(['Total', report.summary.avanzada.total]);

    const wsAvanzada = XLSX.utils.aoa_to_sheet(avanzadaData);
    wsAvanzada['!cols'] = [{ wch: 25 }, { wch: 15 }];

    // Hoja 3: Úlcera Venosa por Género
    const ulceraData: (string | number)[][] = [
      ['Curación Úlcera Venosa - Detalle por Género'],
      [`Filtros: ${filterLabel}`],
      [],
      ['Género', 'Cantidad'],
    ];
    for (const [g, count] of Object.entries(report.summary.ulcera_venosa.byGender)) {
      ulceraData.push([g, count]);
    }
    ulceraData.push([]);
    ulceraData.push(['Total', report.summary.ulcera_venosa.total]);

    const wsUlcera = XLSX.utils.aoa_to_sheet(ulceraData);
    wsUlcera['!cols'] = [{ wch: 25 }, { wch: 15 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');
    XLSX.utils.book_append_sheet(wb, wsAvanzada, 'Curacion Avanzada');
    XLSX.utils.book_append_sheet(wb, wsUlcera, 'Ulcera Venosa');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const dateStr = new Date().toISOString().split('T')[0];
    saveAs(blob, `Reporte_Trimestral_${report.filters.year}_Q${report.filters.quarter}_${dateStr}.xlsx`);
  };

  const buildPieData = (byGender: Record<string, number>) => {
    return Object.entries(byGender).map(([name, value]) => ({
      name,
      value,
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          Reporte Trimestral Detallado
        </h2>

        <div className="flex gap-4 items-end mb-6 flex-wrap">
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
              className="px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none w-28"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Trimestre
            </label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(parseInt(e.target.value))}
              className="px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
            >
              {QUARTERS.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Género
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
            >
              <option value="">Todos</option>
              <option value="Femenino">Femenino</option>
              <option value="Masculino">Masculino</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grupo Etáreo
            </label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
            >
              <option value="">Todos</option>
              {AGE_GROUPS.map((g, i) => (
                <option key={i} value={i}>
                  {g.label}
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

        {report && (
          <div className="space-y-8">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-teal-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-teal-800 mb-2">
                  Curación Avanzada
                </h3>
                <div className="text-4xl font-bold text-teal-700 mb-4">
                  {report.summary.avanzada.total}
                </div>
                {Object.keys(report.summary.avanzada.byGender).length > 0 && (
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-teal-600 mb-2">
                      Por género:
                    </div>
                    {Object.entries(report.summary.avanzada.byGender).map(
                      ([g, count]) => (
                        <div
                          key={g}
                          className="flex justify-between text-sm text-teal-700"
                        >
                          <span>{g}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>

              <div className="bg-indigo-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-indigo-800 mb-2">
                  Curación Úlcera Venosa
                </h3>
                <div className="text-4xl font-bold text-indigo-700 mb-4">
                  {report.summary.ulcera_venosa.total}
                </div>
                {Object.keys(report.summary.ulcera_venosa.byGender).length >
                  0 && (
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-indigo-600 mb-2">
                      Por género:
                    </div>
                    {Object.entries(report.summary.ulcera_venosa.byGender).map(
                      ([g, count]) => (
                        <div
                          key={g}
                          className="flex justify-between text-sm text-indigo-700"
                        >
                          <span>{g}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-6">
              {report.summary.avanzada.total > 0 && (
                <div>
                  <h4 className="text-center text-sm font-medium text-gray-600 mb-2">
                    Curación Avanzada por Género
                  </h4>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={buildPieData(report.summary.avanzada.byGender)}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {buildPieData(
                            report.summary.avanzada.byGender,
                          ).map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {report.summary.ulcera_venosa.total > 0 && (
                <div>
                  <h4 className="text-center text-sm font-medium text-gray-600 mb-2">
                    Úlcera Venosa por Género
                  </h4>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={buildPieData(
                            report.summary.ulcera_venosa.byGender,
                          )}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {buildPieData(
                            report.summary.ulcera_venosa.byGender,
                          ).map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Filters applied */}
            <div className="text-center text-sm text-gray-500">
              Filtros aplicados:{' '}
              Año {report.filters.year}, Trimestre {report.filters.quarter},{' '}
              {report.filters.gender || 'Todos los géneros'},{' '}
              {report.filters.ageMin !== undefined
                ? `${report.filters.ageMin} - ${report.filters.ageMax} años`
                : 'Todas las edades'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
