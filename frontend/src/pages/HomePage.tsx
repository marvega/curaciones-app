import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchPatientByRut } from '../services/api';
import type { Patient } from '../types';

export default function HomePage() {
  const [rut, setRut] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const navigate = useNavigate();

  const formatRut = (value: string) => {
    const clean = value.replace(/[^0-9kK]/g, '');
    if (clean.length <= 1) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formatted}-${dv}`;
  };

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRut(formatRut(e.target.value));
    setSearched(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rut.trim()) return;
    setLoading(true);
    try {
      const result = await searchPatientByRut(rut.trim());
      setPatient(result);
      setSearched(true);
    } catch {
      setPatient(null);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Buscar Paciente
        </h2>
        <p className="text-gray-500 mb-6">
          Ingrese el RUT del paciente para ver su ficha
        </p>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={rut}
            onChange={handleRutChange}
            placeholder="12.345.678-9"
            className="form-control flex-1 text-lg"
          />
          <button
            type="submit"
            disabled={loading || !rut.trim()}
            className="px-6 py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </form>
      </div>

      {searched && (
        <div className="mt-6">
          {patient ? (
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Paciente Encontrado
                </h3>
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  Registrado
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">RUT:</span>
                  <span className="ml-2 font-medium">{patient.rut}</span>
                </div>
                <div>
                  <span className="text-gray-500">Nombre:</span>
                  <span className="ml-2 font-medium">
                    {patient.firstName} {patient.lastName}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Fecha Nac.:</span>
                  <span className="ml-2 font-medium">{patient.birthDate}</span>
                </div>
                <div>
                  <span className="text-gray-500">Género:</span>
                  <span className="ml-2 font-medium">{patient.gender}</span>
                </div>
              </div>
              <button
                onClick={() => navigate(`/paciente/${patient.id}`)}
                className="mt-4 w-full py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors"
              >
                Ver Ficha Completa
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
              <div className="text-gray-400 text-4xl mb-3">🔍</div>
              <h3 className="text-lg font-semibold text-gray-800 mb-1">
                Paciente no encontrado
              </h3>
              <p className="text-gray-500 mb-4">
                No existe un paciente con RUT {rut}
              </p>
              <button
                onClick={() => navigate(`/paciente/nuevo?rut=${encodeURIComponent(rut)}`)}
                className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors"
              >
                Registrar Nuevo Paciente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
