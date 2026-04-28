import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getPatientsPaginated, searchPatientsAdvanced } from '../services/api';
import type { Patient, PaginatedResponse } from '../types';
import { UserPlus, Users, Eye, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Filter, X } from 'lucide-react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  Tag,
} from '../components/ui';
import type { ColumnDef } from '../components/ui';

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
          <Skeleton height={16} width={96} />
          <Skeleton height={16} className="flex-1" />
          <Skeleton height={16} width={48} />
          <Skeleton height={16} width={64} />
          <Skeleton height={16} width={80} />
          <Skeleton height={16} width={64} />
        </div>
      ))}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'discharged', label: 'Dado de Alta' },
];

const GENDER_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'Femenino', label: 'Femenino' },
  { value: 'Masculino', label: 'Masculino' },
];

const CURACION_TYPE_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'avanzada', label: 'Avanzada' },
  { value: 'pie_diabetico', label: 'Pie Diabetico' },
  { value: 'ulcera_venosa', label: 'Ulcera Venosa' },
];

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

  const columns: ColumnDef<Patient>[] = [
    {
      key: 'rut',
      label: 'RUT',
      render: (p) => <span className="font-medium text-blue-600">{p.rut}</span>,
    },
    {
      key: 'name',
      label: 'Nombre',
      render: (p) => (
        <span className="text-slate-800 dark:text-slate-200">
          {p.firstName} {p.lastName}
          {p.status === 'discharged' && (
            <Tag variant="gray" className="ml-2">Alta</Tag>
          )}
        </span>
      ),
    },
    { key: 'age', label: 'Edad', render: (p) => calculateAge(p.birthDate) },
    { key: 'gender', label: 'Genero', render: (p) => p.gender },
    { key: 'phone', label: 'Telefono', render: (p) => p.phone || '-' },
    {
      key: 'actions',
      label: 'Acciones',
      align: 'right',
      render: (p) => (
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Eye className="w-3.5 h-3.5" />}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/paciente/${p.id}`);
          }}
          className="bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100"
        >
          Ver
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card padding="none">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <PageHeader
            title="Todos los Pacientes"
            subtitle={result ? `${result.total} registrados` : undefined}
            actions={
              <>
                <Button
                  variant="secondary"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                  leftIcon={<Filter className="w-4 h-4" />}
                  rightIcon={filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  className={`relative ${filtersOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}
                >
                  Filtros
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
                <Button
                  onClick={() => navigate('/paciente/nuevo')}
                  leftIcon={<UserPlus className="w-4 h-4" />}
                >
                  Nuevo Paciente
                </Button>
              </>
            }
          />
        </div>

        <div className="px-5 pt-4 pb-1">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Buscar por RUT, nombre o teléfono..."
            aria-label="Buscar pacientes"
          />
        </div>

        {filtersOpen && (
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Select
                label="Estado"
                options={STATUS_OPTIONS}
                value={filters.status}
                onChange={(v) => updateFilter('status', v)}
              />

              <Select
                label="Genero"
                options={GENDER_OPTIONS}
                value={filters.gender}
                onChange={(v) => updateFilter('gender', v)}
              />

              <Select
                label="Tipo de curacion"
                options={CURACION_TYPE_OPTIONS}
                value={filters.curacionType}
                onChange={(v) => updateFilter('curacionType', v)}
              />

              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Edad min"
                  type="number"
                  min="0"
                  max="120"
                  value={filters.ageMin}
                  onChange={(e) => updateFilter('ageMin', e.target.value)}
                  placeholder="0"
                />
                <Input
                  label="Edad max"
                  type="number"
                  min="0"
                  max="120"
                  value={filters.ageMax}
                  onChange={(e) => updateFilter('ageMax', e.target.value)}
                  placeholder="120"
                />
              </div>

              <Input
                label="Fecha desde"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter('dateFrom', e.target.value)}
              />

              <Input
                label="Fecha hasta"
                type="date"
                value={filters.dateTo}
                onChange={(e) => updateFilter('dateTo', e.target.value)}
              />

              <div className="sm:col-span-2 flex items-end gap-2">
                <Button
                  onClick={applyFilters}
                  size="sm"
                  leftIcon={<Filter className="w-3.5 h-3.5" />}
                >
                  Filtrar
                </Button>
                {hasActiveFilters(appliedFilters) && (
                  <Button
                    variant="secondary"
                    onClick={clearFilters}
                    size="sm"
                    leftIcon={<X className="w-3.5 h-3.5" />}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="p-5">
          {loading ? (
            <TableSkeleton />
          ) : !result || result.data.length === 0 ? (
            <EmptyState
              icon={Users}
              title={
                hasActiveFilters(appliedFilters) || searchQuery
                  ? 'No se encontraron pacientes'
                  : 'No hay pacientes registrados'
              }
              action={
                (hasActiveFilters(appliedFilters) || searchQuery) ? (
                  <Button variant="link" onClick={clearFilters} size="sm">
                    Limpiar búsqueda
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <DataTable<Patient>
                columns={columns}
                data={result.data}
                keyExtractor={(p) => p.id}
                onRowClick={(p) => navigate(`/paciente/${p.id}`)}
              />

              {result.totalPages > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-sm text-slate-500 order-2 sm:order-1">Pag. {result.page} de {result.totalPages}</p>
                  <div className="flex flex-wrap gap-1.5 order-1 sm:order-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage <= 1}
                      leftIcon={<ChevronLeft className="w-4 h-4" />}
                    >
                      Ant.
                    </Button>
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
                          <Button
                            key={item}
                            size="sm"
                            variant={item === currentPage ? 'primary' : 'secondary'}
                            onClick={() => goToPage(item)}
                          >
                            {item}
                          </Button>
                        )
                      )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage >= result.totalPages}
                      rightIcon={<ChevronRight className="w-4 h-4" />}
                    >
                      Sig.
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
