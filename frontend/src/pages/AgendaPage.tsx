import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAgenda } from '../services/api';
import type { AgendaItem, CuracionType } from '../types';
import { CalendarOff, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Button, Card, EmptyState, Skeleton } from '../components/ui';

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
      <Card padding="md" className="sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
            Agenda de Citas
          </h2>
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            {viewButtons.map((btn) => (
              <Button
                key={btn.mode}
                variant="ghost"
                size="sm"
                onClick={() => setViewMode(btn.mode)}
                className={
                  viewMode === btn.mode
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }
              >
                {btn.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateDate(-1)}
            aria-label="Anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            {viewMode === 'month' ? (
              <span className="px-4 py-2 text-lg font-semibold text-slate-700 dark:text-slate-300 capitalize">
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDate(new Date().toISOString().split('T')[0])}
              className="bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              Hoy
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateDate(1)}
            aria-label="Siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Summary */}
        <div className="mb-4 px-1 text-sm text-slate-500">
          {appointments.length} cita{appointments.length !== 1 ? 's' : ''} programada{appointments.length !== 1 ? 's' : ''}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4 p-4">
                <Skeleton height={24} width={56} />
                <div className="flex-1 space-y-2">
                  <Skeleton height={16} width={192} />
                  <Skeleton height={12} width={128} />
                </div>
                <Skeleton height={24} width={80} className="rounded-full" />
              </div>
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title="No hay citas programadas para este período"
          />
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
                        className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer transition-all border border-transparent hover:border-blue-200 dark:hover:border-slate-600"
                      >
                        <div className="flex items-center gap-2 text-blue-700 sm:w-20">
                          <Clock className="w-4 h-4 text-blue-500" />
                          <span className="text-base font-bold">{apt.time}</span>
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
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
      </Card>
    </div>
  );
}
