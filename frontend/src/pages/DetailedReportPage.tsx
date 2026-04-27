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
import { Download, Loader2 } from 'lucide-react';

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

    const sheetData: (string | number)[][] = [
      ['Reporte Trimestral de Pie Diabético'],
      [`Filtros: ${filterLabel}`],
      [],
      ['Total de pacientes únicos', report.total],
      ['Botas entregadas', report.bootsDelivered],
      [],
      ['Detalle por Género'],
      ['Género', 'Pacientes únicos'],
    ];

    for (const [g, count] of Object.entries(report.byGender)) {
      sheetData.push([g, count]);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 30 }, { wch: 18 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pie Diabético');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const dateStr = new Date().toISOString().split('T')[0];
    saveAs(
      blob,
      `Reporte_PieDiabetico_${report.filters.year}_Q${report.filters.quarter}_${dateStr}.xlsx`,
    );
  };

  const buildPieData = (byGender: Record<string, number>) => {
    return Object.entries(byGender).map(([name, value]) => ({
      name,
      value,
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card p-5 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">
          Reporte Trimestral de Pie Diabético
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Pacientes únicos atendidos por curación de pie diabético en el período seleccionado.
        </p>

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
              Trimestre
            </label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(parseInt(e.target.value))}
              className="form-control min-w-[180px]"
            >
              {QUARTERS.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Género
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="form-control min-w-[120px]"
            >
              <option value="">Todos</option>
              <option value="Femenino">Femenino</option>
              <option value="Masculino">Masculino</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Grupo Etáreo
            </label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className="form-control min-w-[140px]"
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

        {report && (
          <div className="space-y-8">
            {/* Summary card */}
            <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
              <h3 className="text-base font-semibold text-blue-800 mb-1">
                Pacientes únicos con Pie Diabético
              </h3>
              <div className="text-xs text-blue-600 mb-3 flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  <span className="font-medium">Grupo etáreo:</span>{' '}
                  {report.filters.ageMin !== undefined
                    ? report.filters.ageMax !== undefined && report.filters.ageMax >= 150
                      ? `${report.filters.ageMin} y más años`
                      : `${report.filters.ageMin} - ${report.filters.ageMax} años`
                    : 'Todos'}
                </span>
                <span>
                  <span className="font-medium">Género:</span>{' '}
                  {report.filters.gender || 'Todos'}
                </span>
              </div>
              <div className="text-4xl font-bold text-blue-700 mb-4">
                {report.total}
              </div>
              {Object.keys(report.byGender).length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-2">
                    Por género
                  </div>
                  {Object.entries(report.byGender).map(([g, count]) => (
                    <div
                      key={g}
                      className="flex justify-between text-sm text-blue-700"
                    >
                      <span>{g}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
              <h3 className="text-base font-semibold text-blue-800 mb-1">
                Botas entregadas
              </h3>
              <div className="text-xs text-blue-600 mb-3 flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  <span className="font-medium">Grupo etáreo:</span>{' '}
                  {report.filters.ageMin !== undefined
                    ? report.filters.ageMax !== undefined && report.filters.ageMax >= 150
                      ? `${report.filters.ageMin} y más años`
                      : `${report.filters.ageMin} - ${report.filters.ageMax} años`
                    : 'Todos'}
                </span>
                <span>
                  <span className="font-medium">Género:</span>{' '}
                  {report.filters.gender || 'Todos'}
                </span>
              </div>
              <div className="text-4xl font-bold text-blue-700">
                {report.bootsDelivered}
              </div>
              <p className="text-xs text-blue-600 mt-2">
                Total de ayudas técnicas entregadas en el período
              </p>
            </div>
            </div>

            {/* Chart */}
            {report.total > 0 && (
              <div>
                <h4 className="text-center text-sm font-medium text-slate-600 mb-3">
                  Pie Diabético por Género
                </h4>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 30, right: 30, bottom: 10, left: 30 }}>
                      <Pie
                        data={buildPieData(report.byGender)}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {buildPieData(report.byGender).map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Filters applied */}
            <div className="text-center text-sm text-slate-500 bg-slate-50 rounded-xl py-2.5 px-4">
              Filtros: Año {report.filters.year}, Trimestre {report.filters.quarter},{' '}
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
