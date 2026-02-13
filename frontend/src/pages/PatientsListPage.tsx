import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getPatientsPaginated } from '../services/api';
import type { Patient, PaginatedResponse } from '../types';

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
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Pacientes</h2>
            {result && (
              <p className="text-sm text-gray-500 mt-1">
                {result.total} pacientes registrados
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/paciente/nuevo')}
              className="px-5 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors"
            >
              + Nuevo Paciente
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">
            Cargando pacientes...
          </div>
        ) : !result || result.data.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-4xl mb-3">👥</div>
            <p className="text-gray-500">No hay pacientes registrados</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 font-medium text-gray-600">
                      RUT
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600">
                      Nombre
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600">
                      Edad
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600">
                      Género
                    </th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600">
                      Teléfono
                    </th>
                    <th className="text-right py-3 px-3 font-medium text-gray-600">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((patient) => (
                    <tr
                      key={patient.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/paciente/${patient.id}`)}
                    >
                      <td className="py-3 px-3 font-medium text-teal-700">
                        {patient.rut}
                      </td>
                      <td className="py-3 px-3">
                        {patient.firstName} {patient.lastName}
                      </td>
                      <td className="py-3 px-3">
                        {calculateAge(patient.birthDate)} años
                      </td>
                      <td className="py-3 px-3">{patient.gender}</td>
                      <td className="py-3 px-3">{patient.phone || '-'}</td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/paciente/${patient.id}`);
                          }}
                          className="px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-xs font-medium hover:bg-teal-100 transition-colors"
                        >
                          Ver Ficha
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {result.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 pt-4 border-t">
                <p className="text-sm text-gray-500 order-2 sm:order-1">
                  Página {result.page} de {result.totalPages}
                </p>
                <div className="flex flex-wrap gap-2 order-1 sm:order-2">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Anterior
                  </button>
                  {Array.from({ length: result.totalPages }, (_, i) => i + 1)
                    .filter(
                      (p) =>
                        p === 1 ||
                        p === result.totalPages ||
                        Math.abs(p - currentPage) <= 2,
                    )
                    .reduce<(number | string)[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) {
                        acc.push('...');
                      }
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, i) =>
                      typeof item === 'string' ? (
                        <span
                          key={`dots-${i}`}
                          className="px-2 py-2 text-sm text-gray-400"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          onClick={() => goToPage(item)}
                          className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                            item === currentPage
                              ? 'bg-teal-600 text-white'
                              : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {item}
                        </button>
                      ),
                    )}
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= result.totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
