import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAgenda } from '../services/api';
import type { AgendaItem, CuracionType } from '../types';
import { CalendarOff, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

const CURACION_LABELS: Record<CuracionType, string> = {
  avanzada: 'Avanzada',
  pie_diabetico: 'Pie Diabético',
  ulcera_venosa: 'Úlcera Venosa',
};

type ViewMode = 'day' | 'week' | 'month';

export default function AgendaPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [appointments, setAppointments] = useState<AgendaItem[]>([]);
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
    const groups: Record<string, AgendaItem[]> = {};
    for (const apt of appointments) {
      const key = apt.date;
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
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-slate-800">
            Agenda de Citas
          </h2>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {viewButtons.map((btn) => (
              <button
                key={btn.mode}
                onClick={() => setViewMode(btn.mode)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                  viewMode === btn.mode
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 mb-6">
          <button
            onClick={() => navigateDate(-1)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            {viewMode === 'month' ? (
              <span className="px-4 py-2 text-lg font-semibold text-slate-700 capitalize">
                {getPeriodLabel()}
              </span>
            ) : (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="form-control"
              />
            )}
            <button
              onClick={() => setDate(new Date().toISOString().split('T')[0])}
              className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer font-medium"
            >
              Hoy
            </button>
          </div>
          <button
            onClick={() => navigateDate(1)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Summary */}
        <div className="mb-4 px-1 text-sm text-slate-500">
          {appointments.length} cita{appointments.length !== 1 ? 's' : ''} programada{appointments.length !== 1 ? 's' : ''}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4 p-4">
                <div className="skeleton h-6 w-14" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-48" />
                  <div className="skeleton h-3 w-32" />
                </div>
                <div className="skeleton h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <CalendarOff className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-slate-500">
              No hay citas programadas para este período
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([dateKey, apts]) => (
                <div key={dateKey}>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    {formatDateLabel(dateKey)}
                    <span className="ml-2 font-normal normal-case text-slate-400">
                      ({apts.length} cita{apts.length !== 1 ? 's' : ''})
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {apts.map((apt) => (
                      <div
                        key={apt.id}
                        onClick={() => navigate(`/paciente/${apt.patient.id}`)}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 bg-slate-50 rounded-xl hover:bg-blue-50 cursor-pointer transition-all border border-transparent hover:border-blue-200"
                      >
                        <div className="flex items-center gap-2 text-blue-700 sm:w-20">
                          <Clock className="w-4 h-4 text-blue-500" />
                          <span className="text-base font-bold">{apt.time}</span>
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-slate-800">
                            {apt.patient.firstName} {apt.patient.lastName}
                          </div>
                          <div className="text-sm text-slate-500">
                            RUT: {apt.patient.rut}
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-lg text-xs font-medium ${
                          apt.source === 'curacion'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {apt.source === 'curacion' && apt.curacion
                            ? CURACION_LABELS[apt.curacion.type]
                            : 'Cita Agendada'}
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
