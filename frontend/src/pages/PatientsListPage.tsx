import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getPatientsPaginated, searchPatientsAdvanced } from '../services/api';
import type { Patient, PaginatedResponse } from '../types';
import { UserPlus, Users, Eye, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Filter, X, Search } from 'lucide-react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

interface AdvancedFilters {
  status: string;
  gender: string;
  curacionType: string;
  dateFrom: string;
  dateTo: string;
  ageMin: string;
  ageMax: string;
}

const emptyFilters: AdvancedFilters = {
  status: '',
  gender: '',
  curacionType: '',
  dateFrom: '',
  dateTo: '',
  ageMin: '',
  ageMax: '',
};

function hasActiveFilters(filters: AdvancedFilters): boolean {
  return Object.values(filters).some((v) => v !== '');
}

function TableSkeleton() {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-3">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-4 flex-1" />
          <div className="skeleton h-4 w-12" />
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-4 w-20" />
          <div className="skeleton h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export default function PatientsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  const [result, setResult] = useState<PaginatedResponse<Patient> | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<AdvancedFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<AdvancedFilters>(emptyFilters);

  const loadPatients = useCallback(async (page: number, f: AdvancedFilters, q: string) => {
    setLoading(true);
    try {
      const trimmed = q.trim();
      if (hasActiveFilters(f) || trimmed !== '') {
        const params: Record<string, string | number> = { page, limit: 20 };
        if (f.status) params.status = f.status;
        if (f.gender) params.gender = f.gender;
        if (f.curacionType) params.curacionType = f.curacionType;
        if (f.dateFrom) params.dateFrom = f.dateFrom;
        if (f.dateTo) params.dateTo = f.dateTo;
        if (f.ageMin) params.ageMin = parseInt(f.ageMin, 10);
        if (f.ageMax) params.ageMax = parseInt(f.ageMax, 10);
        if (trimmed) params.q = trimmed;
        const data = await searchPatientsAdvanced(params);
        setResult(data);
      } else {
        const data = await getPatientsPaginated(page, 20);
        setResult(data);
      }
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatients(currentPage, appliedFilters, debouncedQuery);
  }, [currentPage, appliedFilters, debouncedQuery, loadPatients]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (trimmed) {
        if (next.get('q') !== trimmed) {
          next.set('q', trimmed);
          next.set('page', '1');
        }
      } else if (next.has('q')) {
        next.delete('q');
        next.set('page', '1');
      }
      return next;
    });
  }, [debouncedQuery, setSearchParams]);

  const goToPage = (page: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(page));
      return next;
    });
  };

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', '1');
      return next;
    });
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setSearchQuery('');
    setSearchParams({ page: '1' });
  };

  const updateFilter = (key: keyof AdvancedFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const activeFilterCount = Object.values(appliedFilters).filter((v) => v !== '').length;

  const calculateAge = (birthDate: string) => {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Todos los Pacientes</h2>
            {result && (
              <p className="text-sm text-slate-500 mt-0.5">{result.total} registrados</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`btn-secondary relative ${filtersOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}
            >
              <Filter className="w-4 h-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              {filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => navigate('/paciente/nuevo')} className="btn-primary">
              <UserPlus className="w-4 h-4" /> Nuevo Paciente
            </button>
          </div>
        </div>

        <div className="px-5 pt-4 pb-1">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar pacientes"
              placeholder="Buscar por RUT, nombre o teléfono..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 pl-9 pr-9 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {filtersOpen && (
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Estado</label>
                <select
                  value={filters.status}
                  onChange={(e) => updateFilter('status', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Todos</option>
                  <option value="active">Activo</option>
                  <option value="discharged">Dado de Alta</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Genero</label>
                <select
                  value={filters.gender}
                  onChange={(e) => updateFilter('gender', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Todos</option>
                  <option value="Femenino">Femenino</option>
                  <option value="Masculino">Masculino</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tipo de curacion</label>
                <select
                  value={filters.curacionType}
                  onChange={(e) => updateFilter('curacionType', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Todos</option>
                  <option value="avanzada">Avanzada</option>
                  <option value="pie_diabetico">Pie Diabetico</option>
                  <option value="ulcera_venosa">Ulcera Venosa</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Edad min</label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={filters.ageMin}
                    onChange={(e) => updateFilter('ageMin', e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Edad max</label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={filters.ageMax}
                    onChange={(e) => updateFilter('ageMax', e.target.value)}
                    placeholder="120"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Fecha desde</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => updateFilter('dateFrom', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Fecha hasta</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="sm:col-span-2 flex items-end gap-2">
                <button onClick={applyFilters} className="btn-primary text-sm py-2">
                  <Filter className="w-3.5 h-3.5" /> Filtrar
                </button>
                {hasActiveFilters(appliedFilters) && (
                  <button onClick={clearFilters} className="btn-secondary text-sm py-2">
                    <X className="w-3.5 h-3.5" /> Limpiar filtros
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="p-5">
          {loading ? (
            <TableSkeleton />
          ) : !result || result.data.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                {hasActiveFilters(appliedFilters) || searchQuery
                  ? 'No se encontraron pacientes'
                  : 'No hay pacientes registrados'}
              </p>
              {(hasActiveFilters(appliedFilters) || searchQuery) && (
                <button onClick={clearFilters} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Limpiar búsqueda
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">RUT</th>
                      <th className="text-left py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">Nombre</th>
                      <th className="text-left py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">Edad</th>
                      <th className="text-left py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">Genero</th>
                      <th className="text-left py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">Telefono</th>
                      <th className="text-right py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((patient) => (
                      <tr
                        key={patient.id}
                        className="border-b border-slate-50 dark:border-slate-800 hover:bg-blue-50/50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                        onClick={() => navigate(`/paciente/${patient.id}`)}
                      >
                        <td className="py-3 px-3 font-medium text-blue-600">{patient.rut}</td>
                        <td className="py-3 px-3 text-slate-800 dark:text-slate-200">
                          {patient.firstName} {patient.lastName}
                          {patient.status === 'discharged' && (
                            <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px]">Alta</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{calculateAge(patient.birthDate)}</td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{patient.gender}</td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{patient.phone || '-'}</td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/paciente/${patient.id}`); }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.totalPages > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-sm text-slate-500 order-2 sm:order-1">Pag. {result.page} de {result.totalPages}</p>
                  <div className="flex flex-wrap gap-1.5 order-1 sm:order-2">
                    <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
                      className="btn-secondary text-sm py-1.5 px-3"><ChevronLeft className="w-4 h-4" /> Ant.</button>
                    {Array.from({ length: result.totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === result.totalPages || Math.abs(p - currentPage) <= 2)
                      .reduce<(number | string)[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, i) =>
                        typeof item === 'string' ? (
                          <span key={`dots-${i}`} className="px-2 py-1.5 text-sm text-slate-400">...</span>
                        ) : (
                          <button key={item} onClick={() => goToPage(item)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                              item === currentPage ? 'bg-blue-600 text-white' : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}>{item}</button>
                        )
                      )}
                    <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= result.totalPages}
                      className="btn-secondary text-sm py-1.5 px-3">Sig. <ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
