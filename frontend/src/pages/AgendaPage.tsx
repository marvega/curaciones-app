import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAgenda } from '../services/api';
import type { Curacion, CuracionType } from '../types';

const CURACION_LABELS: Record<CuracionType, string> = {
  avanzada: 'Avanzada',
  pie_diabetico: 'Pie Diabético',
  ulcera_venosa: 'Úlcera Venosa',
};

type ViewMode = 'day' | 'week' | 'month';

export default function AgendaPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [appointments, setAppointments] = useState<Curacion[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const getDateRange = () => {
    const from = new Date(date + 'T00:00:00');

    if (viewMode === 'day') {
      return {
        from: from.toISOString().split('T')[0],
        to: from.toISOString().split('T')[0],
      };
    }

    if (viewMode === 'week') {
      const day = from.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(from);
      monday.setDate(from.getDate() + diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        from: monday.toISOString().split('T')[0],
        to: sunday.toISOString().split('T')[0],
      };
    }

    // Month view
    const firstDay = new Date(from.getFullYear(), from.getMonth(), 1);
    const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    return {
      from: firstDay.toISOString().split('T')[0],
      to: lastDay.toISOString().split('T')[0],
    };
  };

  const loadAgenda = async () => {
    setLoading(true);
    try {
      const { from, to } = getDateRange();
      const data = await getAgenda(from, to);
      setAppointments(data);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgenda();
  }, [date, viewMode]);

  const navigateDate = (direction: number) => {
    const d = new Date(date + 'T00:00:00');
    if (viewMode === 'day') {
      d.setDate(d.getDate() + direction);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + direction * 7);
    } else {
      d.setMonth(d.getMonth() + direction);
    }
    setDate(d.toISOString().split('T')[0]);
  };

  const getPeriodLabel = () => {
    const d = new Date(date + 'T00:00:00');
    if (viewMode === 'month') {
      return d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    }
    return '';
  };

  const groupByDate = () => {
    const groups: Record<string, Curacion[]> = {};
    for (const apt of appointments) {
      const key = apt.nextAppointmentDate || '';
      if (!groups[key]) groups[key] = [];
      groups[key].push(apt);
    }
    return groups;
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-CL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const grouped = groupByDate();

  const viewButtons: { mode: ViewMode; label: string }[] = [
    { mode: 'day', label: 'Día' },
    { mode: 'week', label: 'Semana' },
    { mode: 'month', label: 'Mensual' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            Agenda de Citas
          </h2>
          <div className="flex gap-2">
            {viewButtons.map((btn) => (
              <button
                key={btn.mode}
                onClick={() => setViewMode(btn.mode)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === btn.mode
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigateDate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
          >
            &larr; Anterior
          </button>
          <div className="flex items-center gap-3">
            {viewMode === 'month' ? (
              <span className="px-4 py-2 text-lg font-semibold text-gray-700 capitalize">
                {getPeriodLabel()}
              </span>
            ) : (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
              />
            )}
            <button
              onClick={() => setDate(new Date().toISOString().split('T')[0])}
              className="px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Hoy
            </button>
          </div>
          <button
            onClick={() => navigateDate(1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
          >
            Siguiente &rarr;
          </button>
        </div>

        {/* Resumen de citas */}
        <div className="mb-4 px-1 text-sm text-gray-500">
          {appointments.length} cita{appointments.length !== 1 ? 's' : ''} programada{appointments.length !== 1 ? 's' : ''}
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">
            Cargando agenda...
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-4xl mb-3">📅</div>
            <p className="text-gray-500">
              No hay citas programadas para este período
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([dateKey, apts]) => (
                <div key={dateKey}>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    {formatDateLabel(dateKey)}
                    <span className="ml-2 text-xs font-normal normal-case">
                      ({apts.length} cita{apts.length !== 1 ? 's' : ''})
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {apts.map((apt) => (
                      <div
                        key={apt.id}
                        onClick={() =>
                          apt.patient &&
                          navigate(`/paciente/${apt.patient.id}`)
                        }
                        className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-teal-50 cursor-pointer transition-colors border border-transparent hover:border-teal-200"
                      >
                        <div className="text-lg font-bold text-teal-700 w-16 text-center">
                          {apt.nextAppointmentTime || '--:--'}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-800">
                            {apt.patient
                              ? `${apt.patient.firstName} ${apt.patient.lastName}`
                              : 'Paciente'}
                          </div>
                          <div className="text-sm text-gray-500">
                            RUT: {apt.patient?.rut || '-'}
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-medium">
                          {CURACION_LABELS[apt.type]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
