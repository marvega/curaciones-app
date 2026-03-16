import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getPatientsPaginated } from '../services/api';
import type { Patient, PaginatedResponse } from '../types';
import { UserPlus, Users, Eye, ChevronLeft, ChevronRight } from 'lucide-react';

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

  const [result, setResult] = useState<PaginatedResponse<Patient> | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPatients = async (page: number) => {
    setLoading(true);
    try {
      const data = await getPatientsPaginated(page, 20);
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients(currentPage);
  }, [currentPage]);

  const goToPage = (page: number) => {
    setSearchParams({ page: String(page) });
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Todos los Pacientes</h2>
            {result && (
              <p className="text-sm text-slate-500 mt-0.5">{result.total} registrados</p>
            )}
          </div>
          <button onClick={() => navigate('/paciente/nuevo')} className="btn-primary">
            <UserPlus className="w-4 h-4" /> Nuevo Paciente
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <TableSkeleton />
          ) : !result || result.data.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No hay pacientes registrados</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">RUT</th>
                      <th className="text-left py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">Nombre</th>
                      <th className="text-left py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">Edad</th>
                      <th className="text-left py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">Género</th>
                      <th className="text-left py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">Teléfono</th>
                      <th className="text-right py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((patient) => (
                      <tr
                        key={patient.id}
                        className="border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/paciente/${patient.id}`)}
                      >
                        <td className="py-3 px-3 font-medium text-blue-600">{patient.rut}</td>
                        <td className="py-3 px-3 text-slate-800">
                          {patient.firstName} {patient.lastName}
                          {patient.status === 'discharged' && (
                            <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px]">Alta</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{calculateAge(patient.birthDate)}</td>
                        <td className="py-3 px-3 text-slate-600">{patient.gender}</td>
                        <td className="py-3 px-3 text-slate-600">{patient.phone || '-'}</td>
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 pt-4 border-t border-slate-100">
                  <p className="text-sm text-slate-500 order-2 sm:order-1">Pág. {result.page} de {result.totalPages}</p>
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
                              item === currentPage ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
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
